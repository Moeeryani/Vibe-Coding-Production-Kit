// B-1 Production Writer — V2 rollback model.
// This is a NEW implementation; the legacy v1 rollbackProject
// (lib/update-apply.mjs) is frozen and is NOT extended.
// Requirements: identity checked, journal backed, atomic, auditable.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { verifyWriterBoundary,verifyPrincipal,currentPrincipal } from './writer-identity.mjs';
import { authorizeV2Operation,recordWriterEvidence } from './production-writer.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { atomicWriteFile } from './writer-atomic.mjs';
import { writeVersionedJournal,clearVersionedJournal } from './versioned-journal.mjs';

const SAFE_BACKUP_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

function fail(code,message){
  const e=new Error(code+(message?': '+message:''));
  e.code=code;
  throw e;
}

async function loadBackup(root,backupId){
  if(!SAFE_BACKUP_ID.test(backupId))
    fail('E_ROLLBACK_UNSAFE_ID','Backup ID failed safety check.');
  const base=`.vcp/backups/${backupId}`;
  let recordBytes,manifestBytes;
  try{
    recordBytes=await readProjectBytes(root,`${base}/backup.json`,{
      managedState:true,maxBytes:65536});
    manifestBytes=await readProjectBytes(root,`${base}/manifest.json`,{
      managedState:true,maxBytes:8*1024*1024});
  }catch(e){
    fail('E_ROLLBACK_BACKUP_MISSING',`Backup not found or unreadable: ${backupId}.`);
  }
  let record;
  try{record=JSON.parse(recordBytes.toString('utf8'));}
  catch{fail('E_ROLLBACK_BACKUP_CORRUPT','Backup record is not valid JSON.');}
  if(record.id!==backupId)
    fail('E_ROLLBACK_BACKUP_MISMATCH','Backup record ID mismatch.');
  if(record.restoredManifestHash&&
     sha256(manifestBytes)!==record.restoredManifestHash)
    fail('E_ROLLBACK_BACKUP_TAMPERED',
      'Backup manifest hash mismatch; restore refused.');
  return {record,manifestBytes};
}

// Restore managed state to the exact bytes captured by backupId.
// Requires explicit confirmation (never implicit).
// testCapability: optional test-only authorization (see production-writer.mjs).
export async function rollbackV2({root,backupId,confirmed=false,testCapability=null}={}){
  const r=path.resolve(root);
  // 1. Identity checked: boundary verifies live principal + namespace.
  const boundary=await verifyWriterBoundary({root:r,operation:'rollback-v2'});
  // 2. Authorization: production gate OR verified test capability.
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root:r,operation:'rollback-v2'});
  }else{
    authorizeV2Operation();
  }
  if(confirmed!==true)
    fail('E_ROLLBACK_CONFIRMATION_REQUIRED',
      'V2 rollback requires explicit operator confirmation.');
  const {record,manifestBytes}=await loadBackup(r,backupId);
  const lock=await acquireLifecycleLock(r,{mode:'recovery'});
  try{
    // 3. Per-phase identity re-verification.
    verifyPrincipal(boundary.principal,currentPrincipal());
    // 3b. B-9: pin root identity after authorization, verify before mutation.
    const { pinPathIdentity, verifyPathIdentity }=await import('./writer-identity.mjs');
    const identityPin=await pinPathIdentity(r);
    await verifyPathIdentity(r,identityPin);
    // 4. Journal backed: record the rollback before mutating.
    //    The test capability (already verified at G1) is passed through;
    //    G2 verifies it independently — G1 success does not skip G2.
    const startedAt=new Date().toISOString();
    await writeVersionedJournal(r,{
      formatVersion:2,transactionSchemaVersion:2,
      id:record.id,operationId:record.id,
      operation:'update',phase:'prepared',backupId:record.id,
      minimumReaderVersion:record.minimumReaderVersion??'0.9.4',
      startedAt,plannedManifestHash:sha256(manifestBytes),createdFiles:[]
    },{previousHash:null,readerVersion:record.minimumReaderVersion??'0.9.4',lock},
    testCapability);
    // 5. Atomic restore: manifest first (it describes the state), then
    //    every file entry captured in the backup record.
    await atomicWriteManifest(r,manifestBytes);
    const restored=[];
    for(const entry of record.entries??[]){
      if(!entry||typeof entry.relative!=='string'||!entry.sha256)continue;
      const fileBytes=await readProjectBytes(r,
        `.vcp/backups/${backupId}/files/${entry.relative}`,{
          managedState:true,maxBytes:8*1024*1024}).catch(()=>null);
      if(!fileBytes)continue;
      if(sha256(fileBytes)!==entry.sha256)
        fail('E_ROLLBACK_ENTRY_TAMPERED',
          `Backup file entry hash mismatch: ${entry.relative}.`);
      await atomicWriteFile(r,entry.relative,fileBytes,{mode:0o644});
      restored.push(entry.relative);
    }
    await clearVersionedJournal(r,{lock},testCapability).catch(()=>{});
    const receipt=Object.freeze({rolledBack:true,backupId:record.id,
      manifestSha256:sha256(manifestBytes),restoredFiles:restored});
    // 6. Auditable.
    await recordWriterEvidence({root:r,operation:'rollback-v2',
      principal:boundary.principal,result:receipt});
    return receipt;
  }finally{
    await lock.release().catch(()=>{});
  }
}

async function atomicWriteManifest(root,manifestBytes){
  const { atomicWriteManifest }=await import('./writer-atomic.mjs');
  return atomicWriteManifest(root,manifestBytes);
}
