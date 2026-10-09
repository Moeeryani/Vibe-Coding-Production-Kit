import { readFile, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  acquireUpdateLock, releaseUpdateLock, createBackup, restoreBackup,
  readManifest, writeManifest, writeTransaction, clearTransaction, hashContent
} from './state.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { getCliVersion } from './version.mjs';
import { compareSemver } from './semver.mjs';
import { previewV1ToV2, validateAdaptiveManifest } from './manifest-v2.mjs';
import {
  describeVersionedBackup, describeVersionedTransaction, inspectManagedRecovery
} from './managed-recovery-v2.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';

// Isolated Stage12 candidate: no production CLI caller. The hard gate throws
// before any lock, backup or mutation. Never remove it based only on passing
// this branch's own tests: the published-v0.9.3 fence needs separate proof.
async function exists(file) {
  try { await lstat(file); return true; }
  catch(error) {if(error?.code==='ENOENT')return false;throw error;}
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
  let lockOwned=false,backup=null,oldVersion=null,committed=false;
  let attemptedTargetHash=null;
  try {
    await acquireUpdateLock(root);
    lockOwned=true;
    const source=await readManifest(root);
    if(hashContent(await readFile(path.join(root,'.vcp/manifest.json')))!==restoredManifestHash) {
      throw new Error('Managed manifest changed between pre-lock snapshot and locked read.');
    }
    oldVersion=source.installedVersion;
    const target=previewV1ToV2(source,{readerVersion:minimumReaderVersion});
    validateAdaptiveManifest(target,{readerVersion:minimumReaderVersion});
    backup=await createBackup(root,[],source);
    const backupMetadata=describeVersionedBackup({
      id:backup.id,operationId:backup.id,operation:'update',
      minimumReaderVersion,restoredManifestHash,
      preLockSnapshot:{
        vcpDirectoryExisted:true,manifestExisted:true,
        baselinesExisted:baselineExisted,installedVersion:source.installedVersion,
        lockBootstrapCreatedVcpDirectory:false
      },entries:[]
    });
    // Keep backward-compatible display metadata but v2 guard remains authoritative.
    await writeFile(path.join(root,'.vcp/backups',backup.id,'backup.json'),
      JSON.stringify({...backupMetadata,installedVersion:source.installedVersion},null,2)+'\n');
    const tx=(phase,extra={})=>describeVersionedTransaction({
      operationId:backup.id,backupId:backup.id,operation:'update',
      minimumReaderVersion,phase,startedAt:new Date().toISOString(),...extra
    });
    await writeTransaction(root,tx('prepared'));
    await writeTransaction(root,tx('applying'));
    const serialized=JSON.stringify(target,null,2)+'\n';
    attemptedTargetHash=hashContent(Buffer.from(serialized));
    await writeManifest(root,target);
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
      await restoreBackup(root,backup.id);
      lockOwned=false;
    }
    throw error;
  }finally{
    if(lockOwned)await releaseUpdateLock(root);
  }
}
