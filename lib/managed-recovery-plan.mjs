// Read-only Stage12 recovery plan for a versioned, manifest-only managed
// schema transaction. Real restoration requires an exclusive owned lock and
// independent G-FENCE approval. The planner never opens a file for writing.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { validateLegacyManifestFields } from './manifest-v1-guard.mjs';
const MAX_MANIFEST=256*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function trustedFile(root,relative) {
  const location=await resolveProjectPath(root,relative,{purpose:'managed-state',mustExist:true});
  const initial=await lstat(location);
  if(!initial.isFile()||initial.isSymbolicLink()||initial.size>MAX_MANIFEST) {
    throw new Error('E_RECOVERY_MANIFEST_FILE');
  }
  const fd=await open(location,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const current=await fd.stat();
    if(!current.isFile()||current.dev!==initial.dev||current.ino!==initial.ino||
      current.size!==initial.size||current.mtimeMs!==initial.mtimeMs) {
      throw new Error('E_RECOVERY_MANIFEST_RACE');
    }
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const after=await lstat(location);
  if(!after.isFile()||after.isSymbolicLink()||after.dev!==initial.dev||
    after.ino!==initial.ino||after.size!==initial.size||
    after.mtimeMs!==initial.mtimeMs||bytes.length>MAX_MANIFEST) {
    throw new Error('E_RECOVERY_MANIFEST_RACE');
  }
  return bytes;
}
export async function planManagedSchemaRecovery(rootPath,{backupId=null}={}) {
  const root=path.resolve(rootPath);
  const blocked=(reason)=>({
    root,operation:'update',classification:'BLOCKED',readOnly:true,
    reason,actions:[],writeAuthorized:false
  });
  const state=await inspectManagedRecovery(root,{backupId});
  if(state.blocked)return blocked(state.reason);
  const tx=state.transaction;
  if(!tx)return blocked('NO_VERSIONED_TRANSACTION');
  if(tx.legacy||tx.formatVersion!==2||tx.operation!=='update')return blocked('NOT_MANAGED_SCHEMA_TRANSACTION');
  const backup=state.backup;
  if(!backup||backup.formatVersion!==2||backup.operation!=='update'||
    !backup.priorManifestExisted||!backup.restoredManifestHash) {
    return blocked('VERSIONED_BACKUP_INCOMPATIBLE');
  }
  if(tx.committed) {
    return {root,operation:'update',classification:'COMMITTED',
      reason:'COMMITTED_MANIFEST_IDENTITY_PROVED',readOnly:true,
      actions:[],writeAuthorized:false};
  }
  if(!tx.plannedManifestHash)return blocked('TARGET_MANIFEST_IDENTITY_MISSING');
  let backed,live;
  try{
    backed=await trustedFile(root,'.vcp/backups/'+backup.id+'/manifest.json');
    live=await trustedFile(root,'.vcp/manifest.json');
  }catch(error){return blocked(error.code??error.message??'E_RECOVERY_STATE_UNREADABLE');}
  const backupDigest=sha(backed),currentDigest=sha(live);
  if(backupDigest!==backup.restoredManifestHash)return blocked('BACKUP_BYTES_CHANGED');
  if(currentDigest!==backup.restoredManifestHash&&currentDigest!==tx.plannedManifestHash) {
    return blocked('CONCURRENT_OR_USER_MANIFEST_EDIT');
  }
  // Refuse anything except an explicitly schema-v1 prior manifest.
  let oldManifest;
  try{oldManifest=JSON.parse(backed.toString('utf8'));}
  catch{return blocked('RESTORED_MANIFEST_INVALID');}
  try {validateLegacyManifestFields(oldManifest);}
  catch{return blocked('BACKUP_SCHEMA_NOT_V1');}
  if(oldManifest.installedVersion!==backup.priorInstalledVersion) {
    return blocked('BACKUP_VERSION_PROVENANCE_MISMATCH');
  }
  return {root,operation:'update',classification:'RECOVERABLE_CANDIDATE',
    backupId:backup.id,readOnly:true,writeAuthorized:false,
    expectedCurrentManifestHash:currentDigest,restoredManifestHash:backupDigest,
    action:currentDigest===backupDigest?'CLEAR_INCOMPLETE_JOURNAL_AFTER_PROOF':'RESTORE_BACKUP_MANIFEST',
    priorVersion:oldManifest.installedVersion,
    needsExclusiveOwnedLock:true,needsExactCurrentByteRecheck:true,
    needsPostRestoreManifestValidation:true,
    note:'No filesystem changes authorized by this preview'
  };
}
