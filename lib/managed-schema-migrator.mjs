import { lstat, rename, open, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import crypto from 'node:crypto';
import { resolveProjectPath } from './safe-path.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { validateLegacyManifestFields } from './manifest-v1-guard.mjs';
import path from 'node:path';
import { hashContent } from './state.mjs';
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
import { writeVersionedJournal,clearVersionedJournal } from './versioned-journal.mjs';
import { syncContainingDirectory } from './file-durability.mjs';

// Isolated Stage12 candidate: no production CLI caller. The hard gate throws
// before any lock, backup or mutation. Never remove it based only on passing
// this branch's own tests: the published-v0.9.3 fence needs separate proof.
const MANIFEST_LIMIT=256*1024;
const manifestBytes=root=>readProjectBytes(root,'.vcp/manifest.json',{
  managedState:true,maxBytes:MANIFEST_LIMIT
});
async function legacyBaselinesExist(root) {
  const probe=await resolveProjectPath(root,'.vcp/baselines/.__vcp_probe__',{
    purpose:'managed-state'
  });
  try {
    const value=await lstat(path.dirname(probe));
    if(!value.isDirectory()||value.isSymbolicLink()) {
      throw new Error('Unsafe legacy baselines directory.');
    }
    return true;
  } catch(error) {
    if(error?.code==='ENOENT')return false;
    throw error;
  }
}
export async function replaceManifestAtomically(root,newBytes,expectedHash) {
  assertManagedMigrationGate(); // Low-level helper cannot bypass D-01 via direct import.
  const live=await resolveProjectPath(root,'.vcp/manifest.json',{
    purpose:'managed-state',mustExist:true
  });
  if(hashContent(await manifestBytes(root))!==expectedHash) {
    throw new Error('Concurrent managed manifest change; no replacement authorized.');
  }
  const temporary='.vcp/manifest-'+crypto.randomBytes(12).toString('hex')+'.tmp';
  const tmp=await resolveProjectPath(root,temporary,{purpose:'managed-state'});
  const fd=await open(tmp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    (constants.O_NOFOLLOW??0),0o600);
  let tempIdentity=null;
  try {
    tempIdentity=await fd.stat();
    await fd.writeFile(newBytes);
    await fd.sync();
  } finally {await fd.close();}
  try {
    if(hashContent(await manifestBytes(root))!==expectedHash) {
      throw new Error('Managed manifest changed while preparing atomic replacement.');
    }
    await rename(tmp,live);
    await syncContainingDirectory(live);
    if(hashContent(await manifestBytes(root))!==hashContent(newBytes)) {
      throw new Error('Atomic schema manifest replacement failed integrity check.');
    }
  } finally {
    // A temporary file replaced by another actor is not ours to delete.
    let current;
    try{current=await lstat(tmp);}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(current) {
      if(!tempIdentity||!current.isFile()||current.isSymbolicLink()||
         current.dev!==tempIdentity.dev||current.ino!==tempIdentity.ino) {
        throw new Error('Schema staging path changed owner; preserve it for inspection.');
      }
      await rm(tmp);
    }
  }
}

async function restoreOwnVersionedBackup(root,backupId,priorHash,currentAllowlist) {
  const original=await readProjectBytes(root,
    '.vcp/backups/'+backupId+'/manifest.json',{
      managedState:true,maxBytes:MANIFEST_LIMIT
    });
  if(hashContent(original)!==priorHash)throw new Error('Backup original manifest bytes changed.');
  const currentHash=hashContent(await manifestBytes(root));
  if(!currentAllowlist.includes(currentHash)) {
    throw new Error('User or concurrent manifest edit detected: preserve backup and journal.');
  }
  if(currentHash!==priorHash)await replaceManifestAtomically(root,original,currentHash);
  // Recovery journal is not cleared here: its lifecycle is owned by the
  // exact-identity recovery transaction after post-restore validation.
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
  const baselineExisted=await legacyBaselinesExist(root);
  const oldManifestBytes=await manifestBytes(root);
  const restoredManifestHash=hashContent(oldManifestBytes);
  let lockGuard=null,backup=null,oldVersion=null,committed=false;
  let attemptedTargetHash=null,journalHash=null;
  try {
    lockGuard=await acquireLifecycleLock(root,{mode:'update'});
    // Parse exactly the bytes read under the owned lock.
    const lockedBytes=await manifestBytes(root);
    if(hashContent(lockedBytes)!==restoredManifestHash) {
      throw new Error('Managed manifest changed between pre-lock snapshot and locked read.');
    }
    let source;
    try {source=JSON.parse(lockedBytes.toString('utf8'));}
    catch{throw new Error('Locked schema-v1 manifest is not valid JSON.');}
    validateLegacyManifestFields(source);
    if(source.ignoredFiles===undefined)source.ignoredFiles=[];
    oldVersion=source.installedVersion;
    const target=previewV1ToV2(source,{readerVersion:minimumReaderVersion});
    validateAdaptiveManifest(target,{readerVersion:minimumReaderVersion});
    backup=await createManagedSchemaBackup(root,{
      manifestBytes:oldManifestBytes,installedVersion:source.installedVersion,
      minimumReaderVersion,priorBaselinesExisted:baselineExisted
    });
    const serialized=JSON.stringify(target,null,2)+'\n';
    attemptedTargetHash=hashContent(Buffer.from(serialized));
    const startedAt=new Date().toISOString();
    const tx=(phase,extra={})=>describeVersionedTransaction({
      operationId:backup.id,backupId:backup.id,operation:'update',
      minimumReaderVersion,phase,plannedManifestHash:attemptedTargetHash,
      startedAt,...extra
    });
    journalHash=(await writeVersionedJournal(root,tx('prepared'),{
      previousHash:journalHash,readerVersion:minimumReaderVersion
    })).sha256;
    journalHash=(await writeVersionedJournal(root,tx('applying'),{
      previousHash:journalHash,readerVersion:minimumReaderVersion
    })).sha256;
    await replaceManifestAtomically(root,Buffer.from(serialized),restoredManifestHash);
    const actual=hashContent(await manifestBytes(root));
    if(actual!==attemptedTargetHash)throw new Error('Schema conversion did not reproduce the committed manifest bytes.');
    journalHash=(await writeVersionedJournal(root,tx('verified'),{
      previousHash:journalHash,readerVersion:minimumReaderVersion
    })).sha256;
    journalHash=(await writeVersionedJournal(root,tx('committed',{
      committedAt:new Date().toISOString(),committedManifestHash:attemptedTargetHash
    }),{previousHash:journalHash,readerVersion:minimumReaderVersion})).sha256;
    committed=true;
    await clearVersionedJournal(root,{expectedHash:journalHash});
    journalHash=null;
    return {applied:true,fromSchema:1,toSchema:2,backupId:backup.id,
      priorInstalledVersion:oldVersion,minimumReaderVersion,manifestHash:attemptedTargetHash};
  }catch(error){
    if(backup&&!committed){
      const recovery=await inspectManagedRecovery(root,{backupId:backup.id});
      if(recovery.blocked||recovery.backup?.formatVersion!==2) {
        throw new Error('Migration failed and backup proof is invalid; preserve all state for manual recovery: '+error.message);
      }
      const current=hashContent(await manifestBytes(root));
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
