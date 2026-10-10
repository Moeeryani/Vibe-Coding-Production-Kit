// Stage13 recovery executor. Every mutator is guarded by D-01 NO-GO.
// Whole-file CLAIM rollback relies on the exact staged inode + content hash.
// Managed-section rollback must additionally have an OS-enforced CAS/isolation
// proof; until that is independently accepted, it fails closed.
import {createHash,randomBytes} from 'node:crypto';
import {lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {acquireStage13RecoveryLock} from './stage13-recovery-lock.mjs';
import {planStage13Recovery} from './stage13-recovery-plan.mjs';
import {validateStage13Transaction,
  assertStage13TransactionTransition} from './stage13-transaction.mjs';
import {readProjectBytes} from './safe-read.mjs';
import {resolveProjectPath} from './safe-path.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';
import {finishCommittedStage13} from './stage13-finalize.mjs';
import {exactNativeIdentity} from './stage13-identity.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function blocked(code){const e=new Error(code);e.code=code;throw e;}
const archiveName=(id,suffix)=>'.vcp-adoption-retired-'+id+'-'+suffix;
async function assertCurrentClaim(root,entry) {
  const contents=await readProjectBytes(root,entry.path,{maxBytes:8*1024*1024});
  const file=exactNativeIdentity(await new LinuxFsProvider().statIdentity(
    root,entry.path),{type:'file'});
  if(sha(contents)!==entry.newSha256||file.dev!==entry.stagedDev||
     file.ino!==entry.stagedIno)
    blocked('E_STAGE13_RECOVERY_CLAIM_CHANGED');
}
async function ensureQuarantineParent(root,provider,transactionId,relative,{
  category='rollback-claims'
}={}) {
  if(!['rollback-claims','rollback-directories'].includes(category))
    blocked('E_STAGE13_UNKNOWN_ARCHIVE_CATEGORY');
  const pieces=relative.split('/');
  const dirs=['.vcp/backups/'+transactionId+'/'+category];
  let at=dirs[0];
  for(const part of pieces.slice(0,-1)) {
    at+='/'+part;dirs.push(at);
  }
  for(const dir of dirs) {
    await resolveProjectPath(root,dir+'/.__stage13_quarantine_probe__',{
      purpose:'managed-state'
    });
    const full=path.join(root,...dir.split('/'));
    let st;
    try{st=await lstat(full);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(st) {
      if(!st.isDirectory()||st.isSymbolicLink())
        blocked('E_STAGE13_QUARANTINE_COLLISION');
      continue;
    }
    const receipt=await provider.createDirectory(root,dir,0o700);
    if(receipt?.directorySynced!==true)
      blocked('E_STAGE13_QUARANTINE_DIRECTORY_DURABILITY');
  }
}
async function archiveOwnedClaim(root,provider,tx,entry) {
  await ensureQuarantineParent(root,provider,tx.id,entry.path);
  const dest='.vcp/backups/'+tx.id+'/rollback-claims/'+entry.path;
  await assertCurrentClaim(root,entry);
  const moved=await provider.moveNoReplace(root,entry.path,dest);
  if(moved?.srcParentSynced!==true||moved?.dstParentSynced!==true)
    blocked('E_STAGE13_QUARANTINE_MOVE_DURABILITY');
  const preserved=await readProjectBytes(root,dest,{
    managedState:true,maxBytes:8*1024*1024
  });
  const preservedId=exactNativeIdentity(await provider.statIdentity(
    root,dest),{type:'file'});
  if(sha(preserved)!==entry.newSha256||
     preservedId.dev!==entry.stagedDev||
     preservedId.ino!==entry.stagedIno)
    blocked('E_STAGE13_QUARANTINED_FOREIGN_FILE_PRESERVED');
}
async function archiveOwnedDirectory(root,provider,tx,item) {
  const opaque=sha(Buffer.from(item.path,'utf8'))+'.dir';
  await ensureQuarantineParent(root,provider,tx.id,opaque,{
    category:'rollback-directories'
  });
  const current=exactNativeIdentity(await provider.statIdentity(
    root,item.path),{type:'dir'});
  if(current.dev!==item.dev||current.ino!==item.ino)
    blocked('E_STAGE13_DIRECTORY_CHANGED');
  const before=await provider.listNames(root,item.path);
  if(!Array.isArray(before.names)||before.names.length!==0)
    blocked('E_STAGE13_DIRECTORY_NOT_EMPTY');
  const dest='.vcp/backups/'+tx.id+'/rollback-directories/'+opaque;
  const moved=await provider.moveNoReplace(root,item.path,dest);
  if(moved?.srcParentSynced!==true||moved?.dstParentSynced!==true)
    blocked('E_STAGE13_ARCHIVED_DIRECTORY_DURABILITY');
  const retained=exactNativeIdentity(await provider.statIdentity(
    root,dest),{type:'dir'});
  if(retained.dev!==item.dev||retained.ino!==item.ino)
    blocked('E_STAGE13_ARCHIVED_DIRECTORY_IDENTITY_CHANGED');
  const entries=await provider.listNames(root,dest);
  if(!Array.isArray(entries.names)||entries.names.length!==0)
    blocked('E_STAGE13_FOREIGN_CHILD_ARCHIVED_FOR_REVIEW');
}
async function replaceJournal(provider,root,prior,next) {
  assertStage13TransactionTransition(prior,next);
  const old=await readProjectBytes(root,'.vcp/transaction.json',{
    managedState:true,maxBytes:512*1024
  });
  if(sha(old)!==sha(Buffer.from(JSON.stringify(prior,null,2)+'\n')))
    blocked('E_STAGE13_JOURNAL_CHANGED');
  const receipt=await provider.replaceFileAtomic(root,
    '.vcp/transaction.json',Buffer.from(JSON.stringify(next,null,2)+'\n'),
    {mode:0o600});
  if(receipt?.dataSynced!==true||receipt?.directorySynced!==true)
    blocked('E_STAGE13_JOURNAL_DURABILITY');
}
async function verifyRetiredEvidence(root) {
  const names=await readdir(root);
  const candidates=names.filter(x=>
    /^\.vcp-adoption-retired-adopt-[A-Za-z0-9._-]+-[a-f0-9]{40}$/.test(x));
  const accepted=[];
  for(const name of candidates) {
    try {
      const bytes=await readProjectBytes(root,name+'/transaction.json',{
        maxBytes:512*1024
      });
      const tx=JSON.parse(bytes.toString('utf8'));
      validateStage13Transaction(tx);
      if(tx.phase==='restored'&&name.startsWith(
        '.vcp-adoption-retired-'+tx.id+'-'))accepted.push({
        archive:name,transactionId:tx.id
      });
    }catch{ /* unrecognized archives are NEVER ownership proof */ }
  }
  return accepted;
}
export async function planStage13RetiredEvidence(rootPath) {
  const root=path.resolve(rootPath??'.');
  const found=await verifyRetiredEvidence(root);
  return Object.freeze({root,readOnly:true,writeAuthorized:false,
    classification:found.length?'ALREADY_ROLLED_BACK':'NO_RETIRED_EVIDENCE',
    retired:found});
}
export async function recoverInterruptedStage13({
  targetDir,recoveryApproval=null
}={}) {
  assertManagedMigrationGate(); // no project I/O occurs before this fence
  const root=path.resolve(targetDir??'.');
  const planned=await planStage13Recovery(root);
  if(planned.classification==='BLOCKED')blocked('E_STAGE13_RECOVERY_BLOCKED');
  if(!['COMMITTED_VERIFY_ONLY','RECOVERABLE_CANDIDATE',
    'PRE_APPLY_RECOVERY_POINT','RESTORED_REVIEW'].includes(planned.classification))
    blocked('E_STAGE13_RECOVERY_UNSUPPORTED');
  if(planned.actions.some(a=>a.action==='RESTORE_EXACT_PREIMAGE_IF_UNMODIFIED'))
    blocked('E_STAGE13_SECTION_CAS_UNAVAILABLE');
  // Nested claims can be erased only when every introduced directory is
  // independently bound to its kernel device/inode in the immutable WAL.
  // The planner rejects any replaced directory or foreign project file.
  const lock=await acquireStage13RecoveryLock({
    targetDir:root,approval:recoveryApproval
  });
  let retirementAttempted=false;
  try {
    const current=await planStage13Recovery(root);
    if(current.classification!==planned.classification||
       current.transaction?.id!==planned.transaction?.id||
       current.journalSha256!==planned.journalSha256||
       current.backupMetadataSha256!==planned.backupMetadataSha256||
       JSON.stringify(current.actions)!==JSON.stringify(planned.actions)||
       JSON.stringify(current.directoriesToRemove??[])!==
         JSON.stringify(planned.directoriesToRemove??[]))
      blocked('E_STAGE13_RECOVERY_CHANGED');
    const tx=current.transaction;
    const provider=new LinuxFsProvider();
    if(current.classification==='COMMITTED_VERIFY_ONLY') {
      return finishCommittedStage13(root,tx,{provider,ownedLock:lock});
    }
    let active=tx;
    if(active.phase!=='restoring'&&active.phase!=='restored') {
      const next={...active,phase:'restoring'};
      await replaceJournal(provider,root,active,next);
      active=next;
    }
    for(const action of current.actions) {
      if(action.action!=='REMOVE_CREATED_IF_UNMODIFIED')
        blocked('E_STAGE13_RESTORE_TYPE_UNPROVEN');
      const entry=active.items.find(x=>x.path===action.path);
      if(!entry||entry.kind!=='whole-file')
        blocked('E_STAGE13_CLAIM_OWNER_MISSING');
      // Never call unlink on a path selected by a stale read. The native
      // NOREPLACE move preserves even a racing foreign replacement in an
      // owned forensic bundle and fails review instead of erasing bytes.
      await archiveOwnedClaim(root,provider,active,entry);
    }
    // Entire empty created directories are MOVED to forensic archive,
    // deepest first. A concurrent foreign child is retained, not removed.
    // No recursive delete or pathname-only rmdir is ever used.
    for(const directory of current.directoriesToRemove??[]) {
      const item=active.createdDirectories.find(x=>x.path===directory);
      if(!item)blocked('E_STAGE13_DIRECTORY_NOT_LEDGERED');
      await archiveOwnedDirectory(root,provider,active,item);
    }
    const replay=await planStage13Recovery(root);
    if(replay.classification==='BLOCKED'||replay.actions.length||
       (replay.directoriesToRemove??[]).length)
      blocked('E_STAGE13_ROLLBACK_NOT_COMPLETE');
    if(active.phase!=='restored') {
      const last={...active,phase:'restored'};
      await replaceJournal(provider,root,active,last);
      active=last;
    }
    // A single native NOREPLACE move retires the entire journal+lock+backup
    // together, inside the selected root. No journal-first deletion window.
    const archive=archiveName(active.id,randomBytes(20).toString('hex'));
    retirementAttempted=true;
    const move=await provider.moveNoReplace(root,'.vcp',archive);
    if(move?.srcParentSynced!==true||move?.dstParentSynced!==true)
      blocked('E_STAGE13_RETIREMENT_DURABILITY_UNPROVEN');
    return Object.freeze({classification:'RESTORED_UNMANAGED',
      root,priorVcpAbsent:true,archive,forensicEvidenceRetained:true});
  }finally {
    // Once a namespace move was attempted, its outcome can be ambiguous
    // after an OS sync failure. Do not blindly release the old lock path.
    if(!retirementAttempted)await lock.release();
  }
}
