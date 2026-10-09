// Stage12 read-only recovery planner for interrupted first initialization.
// Never deletes, repairs, marks complete or authorizes an action.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { inspectRecoveryOwnedTree } from './owned-tree-inventory.mjs';

const MAX_FILE_BYTES=8*1024*1024;
const hash=buf=>createHash('sha256').update(buf).digest('hex');
function stateError(code) {const err=new Error(code);err.code=code;return err;}
async function inspectOwnedCandidate(root,relative) {
  let filename;
  const purpose=relative.startsWith('.vcp/')?'managed-state':'read-existing';
  try {filename=await resolveProjectPath(root,relative,{purpose,mustExist:true});}
  catch(error) {
    if(error?.code==='E_VCP_PATH'&&error.message.includes('MISSING_INPUT'))return {status:'not-created'};
    throw error;
  }
  const before=await lstat(filename);
  if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_FILE_BYTES) {
    return {status:'unsafe-or-too-large'};
  }
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const opened=await fd.stat();
    if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
      opened.size!==before.size||opened.mtimeMs!==before.mtimeMs) {
      return {status:'changed-during-read'};
    }
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const after=await lstat(filename);
  if(!after.isFile()||after.isSymbolicLink()||after.dev!==before.dev||
    after.ino!==before.ino||after.size!==before.size||
    after.mtimeMs!==before.mtimeMs||bytes.length>MAX_FILE_BYTES) {
    return {status:'changed-during-read'};
  }
  return {status:'present',digest:hash(bytes),bytes:bytes.length};
}
export async function planGreenfieldRecovery(rootPath,{backupId=null}={}) {
  const root=path.resolve(rootPath);
  const snapshot=await inspectManagedRecovery(root,{backupId});
  const blocked=(reason,issues=[])=>({readOnly:true,root,operation:'init',
    classification:'BLOCKED',reason,issues,actions:[],writeAuthorized:false});
  if(snapshot.blocked)return blocked(snapshot.reason);
  const transaction=snapshot.transaction;
  if(!transaction)return blocked('NO_INITIAL_ADOPTION_TRANSACTION');
  if(transaction.legacy||transaction.formatVersion!==2||
    transaction.operation!=='init')return blocked('NOT_VERSIONED_INITIAL_ADOPTION');
  const backup=snapshot.backup;
  if(!backup||backup.formatVersion!==2||backup.operation!=='init'||
    backup.priorManifestExisted||backup.priorVcpDirectoryExisted) {
    return blocked('INITIAL_BACKUP_PRIOR_STATE_INCONSISTENT');
  }
  if(transaction.committed) {
    return {readOnly:true,root,operation:'init',
      classification:'COMMITTED',reason:'COMMITTED_MANIFEST_VERIFIED',
      actions:[],writeAuthorized:false};
  }
  if(!transaction.createdFiles?.length)return blocked('MISSING_CREATED_FILE_LEDGER');
  const issues=[],actions=[];
  const topLevelKnown=new Set(['.vcp']);
  for(const record of transaction.createdFiles) {
    topLevelKnown.add(record.path.split('/')[0]);
    let inspected;
    try {inspected=await inspectOwnedCandidate(root,record.path);}
    catch(error) {
      issues.push({path:record.path,code:error.code??'UNSAFE_PATH'});continue;
    }
    if(inspected.status==='not-created')continue;
    if(inspected.status!=='present') {
      issues.push({path:record.path,code:inspected.status});continue;
    }
    if(inspected.digest!==record.hash) {
      issues.push({path:record.path,code:'POST_TRANSACTION_FILE_EDIT'});continue;
    }
    actions.push({action:'REMOVE_IF_EXACT_HASH',path:record.path,
      expectedHash:record.hash,executionAuthorized:false});
  }
  let topLevel;
  try {topLevel=await readdir(root);}
  catch(error){return blocked('ROOT_READ_FAILED',[{code:error.code??'FS_ERROR'}]);}
  const unrecognized=topLevel.filter(entry=>!topLevelKnown.has(entry));
  for(const entry of unrecognized)issues.push({path:entry,code:'UNEXPECTED_TOP_LEVEL_CONTENT'});
  if(issues.length)return blocked('RECOVERY_CONFLICT',issues.slice(0,25));
  let inventory;
  try {
    inventory=await inspectRecoveryOwnedTree(root,backup.id,
      transaction.createdFiles.map(item=>item.path));
  }catch(error){
    return blocked(error.code??'RECOVERY_INVENTORY_UNREADABLE');
  }
  if(!inventory.complete) {
    return blocked('RECOVERY_UNRECOGNIZED_CONTENT',inventory.issues);
  }
  return {
    root,operation:'init',readOnly:true,classification:'RECOVERABLE_CANDIDATE',
    reason:'EXACT_FILE_HASHES_MATCH_INCOMPLETE_TRANSACTION',
    backupId:backup.id,expectedCreated:transaction.createdFiles.length,
    actions,cleanupPolicy:'known-files-and-empty-directories-only',
    requiresExclusiveOwnedLock:true,requiresByteRecheckBeforeEachRemoval:true,
    requiresPostRestoreUnmanagedStateProof:true,writeAuthorized:false
  };
}
