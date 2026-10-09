import { readFile, lstat, writeFile, rename, open, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import crypto from 'node:crypto';
import { resolveProjectPath } from './safe-path.mjs';
import path from 'node:path';
import {
  readManifest, writeTransaction, clearTransaction, hashContent
} from './state.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { getCliVersion } from './version.mjs';
import { compareSemver } from './semver.mjs';
import { previewV1ToV2, validateAdaptiveManifest } from './manifest-v2.mjs';
import {
  describeVersionedTransaction, inspectManagedRecovery
} from './managed-recovery-v2.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { createManagedSchemaBackup } from './versioned-backup.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';

// Isolated Stage12 candidate: no production CLI caller. The hard gate throws
// before any lock, backup or mutation. Never remove it based only on passing
// this branch's own tests: the published-v0.9.3 fence needs separate proof.
async function exists(file) {
  try { await lstat(file); return true; }
  catch(error) {if(error?.code==='ENOENT')return false;throw error;}
}
async function replaceManifestAtomically(root,newBytes,expectedHash) {
  const live=await resolveProjectPath(root,'.vcp/manifest.json',{
    purpose:'managed-state',mustExist:true
  });
  if(hashContent(await readFile(live))!==expectedHash) {
    throw new Error('Concurrent managed manifest change; no replacement authorized.');
  }
  const temporary='.vcp/manifest-'+crypto.randomBytes(12).toString('hex')+'.tmp';
  const tmp=await resolveProjectPath(root,temporary,{purpose:'managed-state'});
  const fd=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    (constants.O_NOFOLLOW??0),0o600);
  try {
    await fd.writeFile(newBytes);
    await fd.sync();
  } finally {await fd.close();}
  try {
    if(hashContent(await readFile(live))!==expectedHash) {
      throw new Error('Managed manifest changed while preparing atomic replacement.');
    }
    await rename(tmp,live);
    if(hashContent(await readFile(live))!==hashContent(newBytes)) {
      throw new Error('Atomic schema manifest replacement failed integrity check.');
    }
  } finally {await rm(tmp,{force:true});}
}

async function restoreOwnVersionedBackup(root,backupId,priorHash,currentAllowlist) {
  const source=await resolveProjectPath(root,
    '.vcp/backups/'+backupId+'/manifest.json',{purpose:'managed-state',mustExist:true});
  const original=await readFile(source);
  if(hashContent(original)!==priorHash)throw new Error('Backup original manifest bytes changed.');
  const live=await resolveProjectPath(root,'.vcp/manifest.json',{
    purpose:'managed-state',mustExist:true
  });
  const currentHash=hashContent(await readFile(live));
  if(!currentAllowlist.includes(currentHash)) {
    throw new Error('User or concurrent manifest edit detected: preserve backup and journal.');
  }
  if(currentHash!==priorHash)await replaceManifestAtomically(root,original,currentHash);
  await clearTransaction(root);
}

export async function applyVersionedManagedSchemaMigration({targetDir}={}) {
  assertManagedMigrationGate(); // D-01 NO-GO, intentionally before all writes.
  const root=path.resolve(targetDir);
  const inspection=await inspectProject(root);
  if(inspection.classification!=='MANAGED'||inspection.schemaVersion!==1) {
    throw new Error('Schema conversion requires a readable unlocked schema-v1 managed state.');
  }
  const minimumReaderVersion=await getCliVersion();
  if(compareSemver(minimumReaderVersion,'0.9.3')<=0) {
    throw new Error('The Adaptive schema requires a new reader release, not 0.9.3.');
  }
  const baselineExisted=await exists(path.join(root,'.vcp/baselines'));
  const oldManifestBytes=await readFile(path.join(root,'.vcp/manifest.json'));
  const restoredManifestHash=hashContent(oldManifestBytes);
  let lockGuard=null,backup=null,oldVersion=null,committed=false;
  let attemptedTargetHash=null;
  try {
    lockGuard=await acquireLifecycleLock(root,{mode:'update'});
    const source=await readManifest(root);
    if(hashContent(await readFile(path.join(root,'.vcp/manifest.json')))!==restoredManifestHash) {
      throw new Error('Managed manifest changed between pre-lock snapshot and locked read.');
    }
    oldVersion=source.installedVersion;
    const target=previewV1ToV2(source,{readerVersion:minimumReaderVersion});
    validateAdaptiveManifest(target,{readerVersion:minimumReaderVersion});
    backup=await createManagedSchemaBackup(root,{
      manifestBytes:oldManifestBytes,installedVersion:source.installedVersion,
      minimumReaderVersion,priorBaselinesExisted:baselineExisted
    });
    const serialized=JSON.stringify(target,null,2)+'\n';
    attemptedTargetHash=hashContent(Buffer.from(serialized));
    const tx=(phase,extra={})=>describeVersionedTransaction({
      operationId:backup.id,backupId:backup.id,operation:'update',
      minimumReaderVersion,phase,plannedManifestHash:attemptedTargetHash,
      startedAt:new Date().toISOString(),...extra
    });
    await writeTransaction(root,tx('prepared'));
    await writeTransaction(root,tx('applying'));
    await replaceManifestAtomically(root,Buffer.from(serialized),restoredManifestHash);
    const actual=hashContent(await readFile(path.join(root,'.vcp/manifest.json')));
    if(actual!==attemptedTargetHash)throw new Error('Schema conversion did not reproduce the committed manifest bytes.');
    await writeTransaction(root,tx('verified'));
    await writeTransaction(root,tx('committed',{
      committedAt:new Date().toISOString(),committedManifestHash:attemptedTargetHash
    }));
    committed=true;
    await clearTransaction(root);
    return {applied:true,fromSchema:1,toSchema:2,backupId:backup.id,
      priorInstalledVersion:oldVersion,minimumReaderVersion,manifestHash:attemptedTargetHash};
  }catch(error){
    if(backup&&!committed){
      const recovery=await inspectManagedRecovery(root,{backupId:backup.id});
      if(recovery.blocked||recovery.backup?.formatVersion!==2) {
        throw new Error('Migration failed and backup proof is invalid; preserve all state for manual recovery: '+error.message);
      }
      const current=hashContent(await readFile(path.join(root,'.vcp/manifest.json')));
      if(current!==restoredManifestHash && current!==attemptedTargetHash) {
        throw new Error('Migration failed after concurrent manifest changes; refusing automatic rollback: '+error.message);
      }
      await restoreOwnVersionedBackup(root,backup.id,restoredManifestHash,
        [restoredManifestHash,attemptedTargetHash].filter(Boolean));
    }
    throw error;
  }finally{
    if(lockGuard)await lockGuard.release();
  }
}
