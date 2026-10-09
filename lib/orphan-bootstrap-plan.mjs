// Read-only diagnosis for a crash after the first-init lock is created but
// before a backup/journal identity is durable. This is NOT permission to
// delete an apparently orphaned lock or bootstrap directory.
import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { inspectLifecycleLock } from './lock-inspect-v2.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';

export async function planOrphanBootstrap(rootPath) {
  const root=path.resolve(rootPath);
  const blocked=(reason)=>({root,classification:'BLOCKED',readOnly:true,
    reason,writeAuthorized:false,requiresHumanDecision:true,actions:[]});
  const lock=await inspectLifecycleLock(root);
  if(!lock.present||lock.blocked||lock.mode!=='init') {
    return blocked('NO_OWNED_INITIAL_BOOTSTRAP_LOCK_EVIDENCE');
  }
  const recovery=await inspectManagedRecovery(root);
  if(recovery.blocked||recovery.transaction||recovery.backup) {
    return blocked('BOOTSTRAP_HAS_TRANSACTION_OR_UNSAFE_RECOVERY_STATE');
  }
  try {
    const state=await lstat(path.join(root,'.vcp'));
    if(!state.isDirectory()||state.isSymbolicLink())return blocked('UNSAFE_BOOTSTRAP_STATE');
    const files=await readdir(root);
    if(files.length!==1||files[0]!=='.vcp')return blocked('BOOTSTRAP_ROOT_NOT_EMPTY');
    const children=await readdir(path.join(root,'.vcp'));
    if(children.length!==1||children[0]!=='update.lock') {
      return blocked('BOOTSTRAP_CONTAINS_UNKNOWN_STATE');
    }
  }catch(error){return blocked(error.code??'BOOTSTRAP_INSPECTION_FAILED');}
  return {
    root,classification:'ORPHAN_BOOTSTRAP_CANDIDATE',readOnly:true,
    reason:'FIRST_INSTALL_INTERRUPTED_BEFORE_DURABLE_BACKUP',
    lockInspection:lock,previousState:'unmanaged',
    writeAuthorized:false,requiresHumanDecision:true,requiresNativeLockProof:true,
    actions:[],note:'Do not remove a lock solely because its recorded PID is absent.'
  };
}
