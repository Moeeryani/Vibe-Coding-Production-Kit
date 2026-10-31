// B-1 Production Writer — V2 rollback model.
// This is a NEW implementation; the legacy v1 rollbackProject
// (lib/update-apply.mjs) is frozen and is NOT extended.
// Requirements: identity checked, journal backed, atomic, auditable.
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { verifyWriterBoundary,verifyPrincipal,currentPrincipal } from './writer-identity.mjs';
import { authorizeV2Operation,recordWriterEvidence } from './production-writer.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { atomicWriteFile } from './writer-atomic.mjs';
import { writeVersionedJournal,clearVersionedJournal } from './versioned-journal.mjs';
import { validateStage13Transaction } from './stage13-transaction.mjs';

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

// P4-02c post-apply check (read-only). Returns
// {applicable, covered, mismatches, reason}.
// applicable=false means no post-apply record speaks about the
// files this restore would overwrite, so the check cannot judge
// them and the caller proceeds under backup-integrity checks.
// applicable=true with mismatches=[] means every covered file
// still matches its recorded post-apply hash, so the restore only
// undoes the apply's own change. A mismatch (edited or deleted
// after the apply) is a post-apply user edit the restore would
// destroy; the caller must refuse before any mutation.
async function checkPostApplyEdits(root,record){
  const notApplicable=(reason)=>({applicable:false,covered:[],mismatches:[],reason});
  let txBytes;
  try{
    txBytes=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,maxBytes:512*1024,optional:true});
  }catch{
    return notApplicable('post-apply record unreadable');
  }
  if(!txBytes)return notApplicable('no-stage13-transaction');
  let tx;
  try{tx=JSON.parse(txBytes.toString('utf8'));}
  catch{return notApplicable('not-stage13-transaction');}
  try{validateStage13Transaction(tx);}
  catch{return notApplicable('not-stage13-transaction');}
  // Only a committed adoption records a completed post-apply state:
  // an earlier phase's newSha256 may not reflect applied bytes.
  if(tx.phase!=='committed')return notApplicable('transaction-not-committed');
  // The record must describe THIS root; a moved/copied root's
  // transaction says nothing about this root's post-apply edits.
  let rootStat;
  try{rootStat=await lstat(root,{bigint:true});}
  catch{return notApplicable('post-apply record unreadable');}
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||
     sha256(Buffer.from(root+'|'+rootStat.dev+'|'+rootStat.ino))!==tx.rootIdentity)
    return notApplicable('transaction-root-mismatch');
  const byPath=new Map();
  for(const item of tx.items??[]){
    if(item&&typeof item.path==='string'&&typeof item.newSha256==='string')
      byPath.set(item.path,item.newSha256);
  }
  const coveredFiles=[],mismatches=[];
  for(const entry of record.entries??[]){
    if(!entry||typeof entry.relative!=='string')continue;
    const expected=byPath.get(entry.relative);
    if(!expected)continue;
    coveredFiles.push(entry.relative);
    let current=null;
    try{
      current=await readProjectBytes(root,entry.relative,{
        managedState:false,maxBytes:8*1024*1024,optional:true});
    }catch{
      mismatches.push(entry.relative+' (unreadable since apply)');
      continue;
    }
    // Absent now means deleted after the apply: restoring would
    // resurrect a file the user (or another tool) removed.
    if(current===null){mismatches.push(entry.relative+' (deleted since apply)');continue;}
    if(sha256(current)!==expected)mismatches.push(entry.relative);
  }
  // The manifest restore is unconditional, so the same comparison
  // applies — but only when the current manifest is readable. A
  // missing/unreadable manifest has no post-apply edit to destroy;
  // the backup-integrity path handles its restore.
  // The manifest alone does not make the check applicable: the
  // check judges the FILE restores, so applicability requires at
  // least one covered restored file. A manifest mismatch still
  // refuses (it is a real post-apply signal), but a manifest match
  // with no covered files reports not-applicable, not passed.
  let manifestChecked=false;
  if(typeof tx.manifestSha256==='string'){
    let currentManifest=null;
    try{
      currentManifest=await readProjectBytes(root,'.vcp/manifest.json',{
        managedState:true,maxBytes:256*1024,optional:true});
    }catch{/* unreadable: skip the manifest comparison */}
    if(currentManifest!==null){
      manifestChecked=true;
      if(sha256(currentManifest)!==tx.manifestSha256)
        mismatches.push('.vcp/manifest.json');
    }
  }
  if(!coveredFiles.length)return notApplicable('no-covered-files');
  return {applicable:true,
    covered:[...coveredFiles,...(manifestChecked?['.vcp/manifest.json']:[])],
    mismatches,reason:'checked'};
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
    // 3c. P4-02c: fail-closed post-apply check. A restore overwrites
    //    the current bytes of every backup entry with the pre-backup
    //    bytes, so a user edit made AFTER the backup is destroyed by
    //    a successful restore (proven by the P4 gap probe:
    //    ~/workspace/vcp-p4-full/evidence/probe-rollback-gap.mjs).
    //    When a Stage13 adoption transaction (the post-apply record)
    //    exists in .vcp/transaction.json, is committed, and matches
    //    this root, each restored entry it covers is compared
    //    against its recorded post-apply hash (tx item newSha256):
    //    a difference means the file was edited — or deleted —
    //    after the apply, and the restore must refuse
    //    (E_ROLLBACK_POST_APPLY_EDITS) before any mutation.
    //    The same comparison covers the manifest (tx manifestSha256
    //    vs the current .vcp/manifest.json, when readable).
    //    When no such record exists — no transaction journal, a
    //    versioned update journal instead of a Stage13 transaction,
    //    an uncommitted transaction, a root mismatch, or no covered
    //    files — the check is inapplicable: the restore proceeds
    //    under the existing backup-integrity checks and the receipt
    //    says so (postApplyCheck: 'not-applicable'). Legacy backups
    //    and the normal rollback flow (where the update itself
    //    changed the files) are NOT blocked by this check: without
    //    a post-apply record there is nothing to compare against,
    //    and a current-vs-backup difference alone is the normal
    //    rollback case, not evidence of a user edit.
    //    Residual: the check runs under the lifecycle lock, so the
    //    check/restore window is narrowed, not eliminated — a
    //    concurrent writer outside the lock (PH-06, unresolved)
    //    could still edit between the check and the restore.
    const postApply=await checkPostApplyEdits(r,record);
    if(postApply.mismatches.length){
      fail('E_ROLLBACK_POST_APPLY_EDITS',
        `Refusing restore: ${postApply.mismatches.length} file(s) changed after the recorded apply: ${postApply.mismatches.join(', ')}. Restore would destroy those edits.`);
    }
    // 4. Journal backed: record the rollback before mutating.
    //    The test capability (already verified at G1) is passed through;
    //    G2 verifies it independently — G1 success does not skip G2.
    //    Phase N+4 R1: a pre-existing journal is NEVER overwritten
    //    with 'prepared' (no phase transitions TO prepared exist,
    //    and overwriting would destroy recovery evidence). When a
    //    journal already exists, the operator-confirmed restore
    //    still proceeds, but the journal is retained untouched and
    //    the receipt reports that partial state explicitly.
    //    Otherwise the rollback journal is written and then
    //    cleared against its OWN measured digest (the write's
    //    return), never with a missing expectedHash.
    const startedAt=new Date().toISOString();
    const existingJournal=await readExistingJournalDigest(r);
    let rollbackJournalHash=null,journalTransition=null,
      journalCleared=false,journalRetained=true,journalError=null;
    if(existingJournal){
      journalTransition='skipped-existing';
      journalError='JOURNAL_ALREADY_EXISTS';
    }else{
      const written=await writeVersionedJournal(r,{
        formatVersion:2,transactionSchemaVersion:2,
        id:record.id,operationId:record.id,
        operation:'update',phase:'prepared',backupId:record.id,
        minimumReaderVersion:record.minimumReaderVersion??'0.9.4',
        startedAt,plannedManifestHash:sha256(manifestBytes),createdFiles:[]
      },{previousHash:null,readerVersion:record.minimumReaderVersion??'0.9.4',lock},
      testCapability);
      rollbackJournalHash=written.sha256;
      journalTransition='written';
    }
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
    // Phase N+4 R1: clear the rollback journal against its measured
    // digest (or report the retained journal explicitly when one
    // pre-existed). No journal error is swallowed.
    if(rollbackJournalHash){
      try{
        await clearVersionedJournal(r,
          {expectedHash:rollbackJournalHash,lock},testCapability);
        journalCleared=true;journalRetained=false;
      }catch(e){journalError=e.code??'CLEAR_FAILED';}
    }
    const bookkeeping=Object.freeze({rolledBack:true,backupId:record.id,
      manifestSha256:sha256(manifestBytes),restoredFiles:restored,
      postApplyCheck:postApply.applicable?'passed':'not-applicable',
      postApplyCovered:postApply.covered,
      journalTransition,journalCleared,journalRetained,
      ...(journalError?{journalError}:{})});
    // 6. Auditable (recording outcome reported, not swallowed).
    let evidenceRecorded=true,evidenceError=null;
    try{
      await recordWriterEvidence({root:r,operation:'rollback-v2',
        principal:boundary.principal,result:bookkeeping});
    }catch(e){evidenceRecorded=false;evidenceError=e.code??'EVIDENCE_FAILED';}
    return Object.freeze({...bookkeeping,evidenceRecorded,
      ...(evidenceError?{evidenceError}:{})});
  }finally{
    await lock.release().catch(()=>{});
  }
}

// Measured digest of a pre-existing journal, or null when none
// exists. The digest is the SHA-256 of the bytes actually read —
// never a journal field — so callers can detect an existing
// journal without trusting its contents.
async function readExistingJournalDigest(root){
  let bytes;
  try{
    bytes=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,maxBytes:65536});
  }catch(e){
    if(e&&e.code==='ENOENT')return null;
    if(e&&e.code==='E_VCP_PATH'&&
       String(e.message).includes('MISSING_INPUT'))return null;
    throw e;
  }
  return sha256(bytes);
}

async function atomicWriteManifest(root,manifestBytes){
  const { atomicWriteManifest }=await import('./writer-atomic.mjs');
  return atomicWriteManifest(root,manifestBytes);
}
