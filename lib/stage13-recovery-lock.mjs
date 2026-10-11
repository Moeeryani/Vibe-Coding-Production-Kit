// Explicit Stage13 v3 recovery lock handoff.
// A crashed first adopter can leave the old exclusive update.lock behind.
// Never steal it by age or delete it by pathname. After owner approval,
// a dead same-host owner is retained under an exact transaction backup
// path via native RENAME_NOREPLACE, then a fresh exclusive recovery lock
// is created. Every transition is independently fail-closed.
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {acquireLifecycleLock} from './lifecycle-lock-v2.mjs';
import {planStage13Recovery} from './stage13-recovery-plan.mjs';
import {readProjectBytes} from './safe-read.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const HEX=/^[0-9a-f]{64}$/;
function blocked(code){const e=new Error(code);e.code=code;throw e;}
function alive(pid) {
  try{process.kill(pid,0);return true;}
  catch(error){return error?.code!=='ESRCH';}
}
function parseLock(bytes,transaction) {
  let lock;
  try{lock=JSON.parse(bytes.toString('utf8'));}
  catch{blocked('E_STAGE13_RECOVERY_LOCK_MALFORMED');}
  if(!lock||typeof lock!=='object'||Array.isArray(lock)||
     Object.keys(lock).some(key=>![
       'version','mode','pid','host','token','startedAt','operationId',
       'consentFingerprint','bootstrapPriorVcpAbsent'
     ].includes(key))||
     lock.version!==2||
     !['adopt','recovery'].includes(lock.mode)||
     lock.operationId!==transaction.id||
     (lock.mode==='adopt'&&
       (lock.consentFingerprint!==transaction.consentFingerprint||
        lock.bootstrapPriorVcpAbsent!==true))||
     !Number.isInteger(lock.pid)||lock.pid<=0||
     !/^[a-f0-9]{48}$/.test(lock.token??'')||
     typeof lock.host!=='string'||lock.host.length<1)
    blocked('E_STAGE13_RECOVERY_LOCK_FOREIGN');
  return lock;
}
export async function planStage13RecoveryLock(rootPath) {
  const root=path.resolve(rootPath??'.');
  // No native NTFS identity/no-replace provider exists. An unavailable Linux
  // helper must not be mistaken for a missing or invalid recovery journal.
  // This is a read-only diagnostic; it never grants recovery authority.
  if(process.platform==='win32')return Object.freeze({
    classification:'BLOCKED',root,readOnly:true,writeAuthorized:false,
    reason:'E_STAGE13_NATIVE_PROVIDER_UNAVAILABLE',
    requiresNativeWindowsProvider:true
  });
  const plan=await planStage13Recovery(root);
  if(!['PRE_APPLY_RECOVERY_POINT','RECOVERABLE_CANDIDATE',
    'COMMITTED_VERIFY_ONLY','RESTORED_REVIEW'].includes(plan.classification)||
     !plan.transaction||!HEX.test(plan.journalSha256??''))
    return Object.freeze({classification:'BLOCKED',readOnly:true,
      writeAuthorized:false,reason:'NO_PROVEN_STAGE13_TRANSACTION'});
  let bytes;
  try{
    bytes=await readProjectBytes(root,'.vcp/update.lock',{
      managedState:true,optional:true,maxBytes:4096
    });
  }catch(error){
    return Object.freeze({classification:'BLOCKED',readOnly:true,
      writeAuthorized:false,reason:error.code??'LOCK_UNREADABLE'});
  }
  if(bytes===null)return Object.freeze({
    classification:'FRESH_RECOVERY_LOCK_CANDIDATE',
    root,transactionId:plan.transaction.id,
    journalSha256:plan.journalSha256,
    lockSha256:null,readOnly:true,writeAuthorized:false,
    requiresOwnerApproval:true
  });
  let lock;
  try{lock=parseLock(bytes,plan.transaction);}
  catch(error){return Object.freeze({classification:'BLOCKED',
    readOnly:true,writeAuthorized:false,reason:error.code});}
  if(lock.host!==os.hostname())return Object.freeze({
    classification:'BLOCKED',readOnly:true,writeAuthorized:false,
    reason:'OTHER_HOST_OWNER_UNPROVEN'});
  const isAlive=alive(lock.pid);
  return Object.freeze({
    classification:isAlive?'LOCK_OWNER_MAY_BE_ALIVE':
      'STALE_LOCK_RETAIN_AND_TAKEOVER_CANDIDATE',
    root,transactionId:plan.transaction.id,
    journalSha256:plan.journalSha256,lockSha256:sha(bytes),
    lockMode:lock.mode,ownerPid:lock.pid,ownerHost:lock.host,
    readOnly:true,writeAuthorized:false,requiresOwnerApproval:true,
    mayDeleteLock:false,mayStealByAge:false
  });
}
export async function acquireStage13RecoveryLock({
  targetDir,approval,provider=new LinuxFsProvider()
}={}) {
  assertManagedMigrationGate();
  const root=path.resolve(targetDir??'.');
  const preview=await planStage13RecoveryLock(root);
  if(!['FRESH_RECOVERY_LOCK_CANDIDATE',
    'STALE_LOCK_RETAIN_AND_TAKEOVER_CANDIDATE'].includes(
    preview.classification))blocked('E_STAGE13_RECOVERY_LOCK_NOT_READY');
  if(approval?.intent!=='RECOVER_STAGE13_EXACT_TRANSACTION'||
     approval.root!==root||approval.explicitConsent!==true||
     approval.transactionId!==preview.transactionId||
     approval.journalSha256!==preview.journalSha256||
     approval.lockSha256!==preview.lockSha256)
    blocked('E_STAGE13_RECOVERY_OWNER_APPROVAL_REQUIRED');
  const again=await planStage13RecoveryLock(root);
  if(again.classification!==preview.classification||
     again.transactionId!==preview.transactionId||
     again.journalSha256!==preview.journalSha256||
     again.lockSha256!==preview.lockSha256)
    blocked('E_STAGE13_RECOVERY_LOCK_STATE_CHANGED');
  if(preview.lockSha256!==null) {
    // The backup operation dir and journal have been independently checked
    // by planStage13RecoveryLock. This is a new name inside its existing
    // owned backup directory. The old lock bytes are never discarded.
    const dest='.vcp/backups/'+preview.transactionId+
      '/retired-lock-'+preview.lockSha256+'.json';
    const moved=await provider.moveNoReplace(root,'.vcp/update.lock',dest);
    if(moved?.srcParentSynced!==true||moved?.dstParentSynced!==true)
      blocked('E_STAGE13_RETIRED_LOCK_MOVE_UNDURABLE');
    const copy=await readProjectBytes(root,dest,{
      managedState:true,maxBytes:4096
    });
    if(sha(copy)!==preview.lockSha256)
      blocked('E_STAGE13_RETIRED_LOCK_CHANGED');
  }
  // A failure or crash after move is resumable: the original lock is
  // archived, and a subsequent explicit approval can use the no-lock
  // branch, still refusing any fresh foreign update.lock.
  return acquireLifecycleLock(root,{
    mode:'recovery',transactionId:preview.transactionId
  });
}
