import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { readManifest } from './state.mjs';
import { getCliVersion } from './version.mjs';
import { previewV1ToV2, validateAdaptiveManifest } from './manifest-v2.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';

export const MANAGED_SCHEMA_MIGRATION_GATE=Object.freeze({
  id:'D-01/G-FENCE',status:'NO_GO',
  required:'Published v0.9.3 Linux+native Windows old/new lifecycle proof plus maintainer acceptance',
  managedV2MutationAuthorized:false
});

// Preparing schema-v2 target state is deterministic in memory; the migrator
// must not write until the old-CLI fence and versioned recovery are accepted.
export async function previewManagedSchemaMigration(targetDir) {
  const root=path.resolve(targetDir);
  const inspection=await inspectProject(root);
  const gate=MANAGED_SCHEMA_MIGRATION_GATE;
  if(inspection.classification!=='MANAGED'||inspection.schemaVersion!==1) {
    return {root,zeroWrite:true,blocked:true,reason:inspection.reason??'NOT_MANAGED_V1',
      classification:inspection.classification,gate};
  }
  const recovery=await inspectManagedRecovery(root);
  if(recovery.blocked||recovery.needsRecovery) {
    return {root,zeroWrite:true,blocked:true,reason:'MANAGED_RECOVERY_REQUIRED',gate};
  }
  const manifest=await readManifest(root);
  const readerVersion=await getCliVersion();
  const target=previewV1ToV2(manifest,{readerVersion});
  const targetInfo=validateAdaptiveManifest(target,{readerVersion});
  return {
    root,zeroWrite:true,blocked:true,reason:'G_FENCE_NO_GO',
    fromSchema:1,toSchema:2,fromVersion:manifest.installedVersion,
    assetSet:targetInfo.assetSet,wholeFiles:targetInfo.managedFileCount,
    wouldPreserveLegacyCi:true, wouldPreserveUserFiles:true,
    wouldRequireVersionedRecovery:true,gate,
    executionAuthorized:false
  };
}

export function assertManagedMigrationGate() {
  const error=new Error('D-01/G-FENCE NO-GO: managed schema-v2 writes disabled pending published-old-CLI safety proof and maintainer approval.');
  error.code='E_G_FENCE_NO_GO';
  throw error;
}
