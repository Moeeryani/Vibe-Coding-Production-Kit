// Gated Stage12 managed schema recovery, intentionally unavailable while
// published-v0.9.3 G-FENCE remains NO-GO. No network or arbitrary restore.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { planManagedSchemaRecovery } from './managed-recovery-plan.mjs';
import { replaceManifestAtomically } from './managed-schema-migrator.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { clearTransaction, readManifest } from './state.mjs';

const hash=data=>createHash('sha256').update(data).digest('hex');
function abort(message) {const e=new Error(message);e.code='E_VERSIONED_RECOVERY';throw e;}
async function readOriginalBackup(root,backupId,expectedHash) {
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(backupId))abort('Invalid backup identifier.');
  const filename=await resolveProjectPath(root,'.vcp/backups/'+backupId+'/manifest.json',{
    purpose:'managed-state',mustExist:true
  });
  const start=await lstat(filename);
  if(!start.isFile()||start.isSymbolicLink()||start.size>256*1024)abort('Backup manifest not a bounded regular file.');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const during=await fd.stat();
    if(!during.isFile()||during.dev!==start.dev||during.ino!==start.ino||
      during.size!==start.size||during.mtimeMs!==start.mtimeMs)abort('Backup inode changed.');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const end=await lstat(filename);
  if(!end.isFile()||end.isSymbolicLink()||end.dev!==start.dev||end.ino!==start.ino||
    end.size!==start.size||end.mtimeMs!==start.mtimeMs||
    hash(bytes)!==expectedHash)abort('Backup bytes changed.');
  return bytes;
}
export async function recoverVersionedManagedSchema({targetDir,backupId=null}={}) {
  assertManagedMigrationGate(); // No lock bootstrap, backup read or mutation ahead.
  const root=path.resolve(targetDir??'.');
  const before=await planManagedSchemaRecovery(root,{backupId});
  if(before.classification!=='RECOVERABLE_CANDIDATE') {
    abort('Recovery cannot proceed: '+before.reason);
  }
  const lock=await acquireLifecycleLock(root,{mode:'recovery'});
  try {
    const plan=await planManagedSchemaRecovery(root,{backupId:before.backupId});
    if(plan.classification!=='RECOVERABLE_CANDIDATE'||
       plan.backupId!==before.backupId||
       plan.expectedCurrentManifestHash!==before.expectedCurrentManifestHash||
       plan.restoredManifestHash!==before.restoredManifestHash) {
      abort('Recovery state changed before exclusive lock proof.');
    }
    const prior=await readOriginalBackup(root,plan.backupId,plan.restoredManifestHash);
    if(plan.expectedCurrentManifestHash!==plan.restoredManifestHash) {
      await replaceManifestAtomically(root,prior,plan.expectedCurrentManifestHash);
    }
    const manifest=await readManifest(root);
    if(manifest.schemaVersion!==1||manifest.installedVersion!==plan.priorVersion) {
      abort('Restored schema/version proof failed: recovery journal retained.');
    }
    // Journal removed only after compatible v1 state has been re-read.
    await clearTransaction(root);
    return {restoredState:'managed',restoredVersion:manifest.installedVersion,
      restoredFromBackupId:plan.backupId,recoveredInterruptedOperation:true,
      schemaVersion:1,verified:true};
  }finally {
    await lock.release();
  }
}
