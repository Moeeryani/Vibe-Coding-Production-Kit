// Read-only diagnosis for initial-install crashes before a durable journal.
// NO deletion or stale lock stealing is authorized by this module.
import { readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { inspectLifecycleLock } from './lock-inspect-v2.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { resolveProjectPath } from './safe-path.mjs';

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export async function planOrphanBootstrap(rootPath) {
  const root=path.resolve(rootPath);
  const blocked=(reason,detail={})=>({
    root,classification:'BLOCKED',reason,readOnly:true,
    writeAuthorized:false,requiresHumanDecision:true,actions:[],...detail
  });
  const lock=await inspectLifecycleLock(root);
  if(!lock.present||lock.blocked||lock.mode!=='init') {
    return blocked('NO_INITIAL_BOOTSTRAP_LOCK_PROVENANCE');
  }
  const recovery=await inspectManagedRecovery(root);
  if(recovery.blocked||recovery.transaction) {
    return blocked('BOOTSTRAP_HAS_TRANSACTION_OR_UNSAFE_RECOVERY_STATE');
  }
  let rootEntries,stateEntries;
  try {
    const stat=await lstat(path.join(root,'.vcp'));
    if(!stat.isDirectory()||stat.isSymbolicLink())
      return blocked('UNSAFE_BOOTSTRAP_STATE');
    rootEntries=await readdir(root);
    if(rootEntries.length!==1||rootEntries[0]!=='.vcp')
      return blocked('BOOTSTRAP_ROOT_NOT_EMPTY');
    stateEntries=await readdir(path.join(root,'.vcp'));
  }catch(error){return blocked(error.code??'BOOTSTRAP_INSPECTION_FAILED');}
  if(stateEntries.length===1&&stateEntries[0]==='update.lock') {
    return {
      root,classification:'ORPHAN_BOOTSTRAP_CANDIDATE',readOnly:true,
      reason:'INITIAL_BOOTSTRAP_INTERRUPTED_BEFORE_BACKUP',
      lockInspection:lock,previousState:'unmanaged',
      writeAuthorized:false,requiresHumanDecision:true,requiresNativeLockProof:true,
      actions:[],note:'A dead or foreign owner does not grant lock-removal authority.'
    };
  }
  // A crash may occur after exclusively creating .vcp/backups/<id> but
  // before the first transaction.json. Inventory it without assuming that
  // a directory's existence grants ownership or safe cleanup authority.
  if(stateEntries.length!==2||!stateEntries.includes('update.lock')||
    !stateEntries.includes('backups')) {
    return blocked('BOOTSTRAP_CONTAINS_UNKNOWN_STATE');
  }
  let identifiers;
  try {
    const probe=await resolveProjectPath(root,'.vcp/backups/.__vcp_probe__',{
      purpose:'managed-state'
    });
    const dir=path.dirname(probe),info=await lstat(dir);
    if(!info.isDirectory()||info.isSymbolicLink())
      return blocked('BOOTSTRAP_BACKUPS_UNSAFE');
    identifiers=await readdir(dir);
  }catch(error){return blocked(error.code??'BOOTSTRAP_BACKUPS_UNREADABLE');}
  if(identifiers.length>1||identifiers.some(id=>!SAFE_ID.test(id)))
    return blocked('BOOTSTRAP_BACKUP_ID_AMBIGUOUS');
  let backupInspection=null;
  if(identifiers.length===1) {
    backupInspection=await inspectManagedRecovery(root,{backupId:identifiers[0]});
    // A missing or partial header cannot be trusted as an owned backup.
    if(backupInspection.blocked||backupInspection.backup?.operation!=='init'||
      backupInspection.backup?.priorManifestExisted!==false) {
      return blocked('BOOTSTRAP_BACKUP_UNPROVEN',{
        candidateBackupId:identifiers[0]
      });
    }
  }
  return {
    root,classification:'PRE_JOURNAL_BACKUP_CANDIDATE',readOnly:true,
    reason:'INITIAL_BACKUP_CREATED_WITHOUT_DURABLE_JOURNAL',
    candidateBackupId:identifiers[0]??null,lockInspection:lock,
    previousState:'unmanaged',writeAuthorized:false,
    requiresHumanDecision:true,requiresNativeLockProof:true,
    actions:[],note:'Retain all state; ownership and crash recovery require independent proof.'
  };
}
