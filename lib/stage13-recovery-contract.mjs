// Stage13: read-only rollback/restart decision for an existing repository.
// Different from greenfield: a section-owned user file MUST be restored
// from an exact-byte preimage; unknown edits never get silently erased.
import {createHash} from 'node:crypto';
import {validateStage13Transaction} from './stage13-transaction.mjs';
import {parseManagedSections} from './managed-markdown.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function reject(code){const e=new Error(code);e.code=code;throw e;}
const MAX_SNAPSHOT_BYTES=64*1024*1024;
export function classifyStage13RecoverySnapshot(tx,{
  currentFiles=new Map(),currentIdentities=new Map(),
  backups=new Map(),manifestBytes=null,
  originalVcpAbsent=true,lockOwned=false
}={}) {
  validateStage13Transaction(tx);
  if(!(currentFiles instanceof Map)||!(currentIdentities instanceof Map)||
     !(backups instanceof Map)||originalVcpAbsent!==true)
    reject('E_STAGE13_BAD_RECOVERY_SNAPSHOT');
  let examined=0;
  const actions=[],issues=[];
  for(const item of tx.items) {
    const raw=currentFiles.get(item.path)??null;
    if(raw!==null&&!Buffer.isBuffer(raw))
      reject('E_STAGE13_NONBYTE_CURRENT');
    if(raw)examined+=raw.length;
    if(examined>MAX_SNAPSHOT_BYTES)
      reject('E_STAGE13_RECOVERY_READ_BUDGET');
    const observed=raw===null?null:digest(raw);
    if(item.kind==='whole-file') {
      if(observed===null)continue; // Desired former absence.
      if(observed!==item.newSha256) {
        issues.push({path:item.path,reason:'FOREIGN_OR_EDITED_CLAIM'});
        continue;
      }
      const identity=currentIdentities.get(item.path);
      if(String(identity?.dev)!==item.stagedDev||
         String(identity?.ino)!==item.stagedIno) {
        issues.push({path:item.path,reason:'CREATED_INODE_NOT_OWNED'});
        continue;
      }
      actions.push({path:item.path,action:'REMOVE_CREATED_IF_UNMODIFIED',
        expectedSha256:item.newSha256});
    }else {
      const old=backups.get(item.path);
      if(!Buffer.isBuffer(old)||digest(old)!==item.oldSha256){
        issues.push({path:item.path,reason:'BACKUP_PREIMAGE_UNPROVEN'});
        continue;
      }
      examined+=old.length;
      if(examined>MAX_SNAPSHOT_BYTES)
        reject('E_STAGE13_RECOVERY_READ_BUDGET');
      if(observed===item.oldSha256)continue;
      if(observed!==item.newSha256) {
        issues.push({path:item.path,reason:'USER_MODIFIED_AFTER_ADOPTION'});
        continue;
      }
      try {
        const sections=parseManagedSections(raw);
        if(sections.length!==1||sections[0].id!==item.sectionId)
          throw new Error('sections-unproved');
      }catch {
        issues.push({path:item.path,reason:'SECTION_PROVENANCE_CHANGED'});
        continue;
      }
      actions.push({path:item.path,action:'RESTORE_EXACT_PREIMAGE_IF_UNMODIFIED',
        expectedSha256:item.newSha256,backupSha256:item.oldSha256});
    }
  }
  if(issues.length)return Object.freeze({classification:'BLOCKED',
    readOnly:true,writeAuthorized:false,reason:'CONCURRENT_OR_FOREIGN_EDIT',
    issues,actions:[]});
  if(tx.phase==='committed') {
    // A manifest hash alone does not prove that every published file still
    // matches the commit. Missing or old-version user files block finality.
    for(const item of tx.items) {
      const content=currentFiles.get(item.path);
      if(!Buffer.isBuffer(content)||digest(content)!==item.newSha256||
       (item.kind==='whole-file'&&
        (String(currentIdentities.get(item.path)?.dev)!==item.stagedDev||
         String(currentIdentities.get(item.path)?.ino)!==item.stagedIno)))
        return Object.freeze({classification:'BLOCKED',readOnly:true,
          writeAuthorized:false,reason:'COMMITTED_FILE_CHANGED',actions:[]});
    }
    if(!Buffer.isBuffer(manifestBytes)||
       digest(manifestBytes)!==tx.manifestSha256)
      return Object.freeze({classification:'BLOCKED',readOnly:true,
        writeAuthorized:false,reason:'COMMITTED_MANIFEST_MISMATCH',actions:[]});
    return Object.freeze({classification:'COMMITTED_VERIFY_ONLY',
      readOnly:true,writeAuthorized:false,actions:[]});
  }
  if(tx.phase==='snapshotted'||tx.phase==='staged') {
    if(actions.length) return Object.freeze({classification:'BLOCKED',
      readOnly:true,writeAuthorized:false,
      reason:'PRE_APPLY_CREATED_PATH_PRESENT',actions:[]});
    return Object.freeze({classification:'PRE_APPLY_RECOVERY_POINT',
      readOnly:true,writeAuthorized:false,actions:[],
      ownerLockRequired:true,controlCleanupPending:true});
  }
  if(tx.phase==='restored') {
    return Object.freeze({classification:actions.length?'BLOCKED':'RESTORED_REVIEW',
      readOnly:true,writeAuthorized:false,actions:[],
      reason:actions.length?'RESTORED_LEDGER_HAS_CREATED_FILES':null});
  }
  return Object.freeze({
    classification:'RECOVERABLE_CANDIDATE',
    readOnly:true,writeAuthorized:false,
    actions,preexistingUserFilesMustStayUnmodified:true,
    ownerLockRequired:!lockOwned,
    exactRestoreOnly:true,previousVcpAbsent:true
  });
}
export function assertStage13RecoveryActionsStillMatch(snapshot,currentFiles) {
  if(snapshot?.classification!=='RECOVERABLE_CANDIDATE'||
     !(currentFiles instanceof Map))reject('E_STAGE13_RECOVERY_UNPROVEN');
  for(const action of snapshot.actions) {
    const now=currentFiles.get(action.path);
    if(!Buffer.isBuffer(now)||digest(now)!==action.expectedSha256)
      reject('E_STAGE13_RECOVERY_CHANGED');
  }
  return Object.freeze({readyForOwnedFsOperation:true,
    authorized:false,requiresAtomicCompareAndSwap:true,
    actions:snapshot.actions.length});
}
