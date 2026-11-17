// B-1 Production Writer — V2 rollback model.
// This is a NEW implementation; the legacy v1 rollbackProject
// (lib/update-apply.mjs) is frozen and is NOT extended.
// Requirements: identity checked, journal backed, atomic, auditable.
import { createHash } from 'node:crypto';
import { lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { verifyWriterBoundary,verifyPrincipal,currentPrincipal } from './writer-identity.mjs';
import { authorizeV2Operation,recordWriterEvidence } from './production-writer.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory } from './file-durability.mjs';
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

// P5-02 restore-evidence check (read-only). Replaces the P4-02c
// post-apply check. The P4 check judged a restore only when a
// committed Stage 13 transaction existed; without one the restore
// proceeded and destroyed post-backup edits (validator R1–R14).
//
// The P5 rule judges EVERY restored file against the best available
// evidence, in order:
//   1. a committed, root-matched Stage 13 transaction
//      (item newSha256 per file);
//   2. a committed versioned journal carrying postApplyFiles
//      (backupId-matched, manifest-corroborated);
//   3. the backup record itself (entry sha256 = the pre-backup bytes).
// Per restored file (one the restore loop WILL restore: relative +
// sha256 present):
//   - current bytes == backup hash  -> unchanged since backup, safe;
//   - current bytes == post-apply hash -> the apply's own change, safe;
//   - post-apply hash exists and current differs -> user edit after
//     the apply (kind 'post-apply');
//   - no post-apply hash and current differs -> unaccounted change
//     (kind 'unaccounted').
// A deleted file counts as a mismatch (restoring would resurrect it).
// The manifest restore is unconditional (managed metadata from a
// tamper-checked backup); the manifest comparison is an additional
// gate when a record exists and the manifest is readable, and the
// receipt records whether it was checked (R-INT-3a).
// Returns {verdict, evidence, covered, mismatches, reason,
// manifestChecked, manifestReason}.
// verdict: passed | post-apply-edits | evidence-missing |
//   stale-transaction | not-applicable (only when no file entries
//   are judged). evidence: stage13 | journal | backup-hash | none.
async function checkRestoreEvidence(root,record){
  // P6 (F-P6-1): the production entry shape uses `path`, not `relative`
  // (see decodeBackupMetadata / V2_ENTRY_FIELDS). Normalize to
  // `relative` here so the judgment below is unchanged; `relative`
  // stays accepted as a fallback for older records and test fixtures.
  // P6 (F-P6-2): an entry for a file that did not exist before the
  // update (exists:false) has no pre-backup hash; it is judged against
  // the post-apply record instead (see the loop below).
  const restored=(record.entries??[]).filter((e)=>{
    if(!e)return false;
    const rel=typeof e.path==='string'?e.path:e.relative;
    if(typeof rel!=='string')return false;
    if(e.exists===false)return true;
    return typeof e.sha256==='string';
  }).map((e)=>({...e,
    relative:typeof e.path==='string'?e.path:e.relative}));
  const base=(verdict,evidence,extra={})=>Object.freeze({verdict,evidence,
    covered:[],mismatches:[],reason:null,manifestChecked:false,
    manifestReason:'no-post-apply-record',...extra});
  if(!restored.length)
    return base('not-applicable','none',{reason:'no-restored-files'});
  // --- resolve the post-apply evidence source ---
  let postApply=null,evidence='none',staleReason=null,recordReason=null;
  let manifestPostHash=null; // Stage 13 tx manifestSha256, when usable
  let txBytes=null,txUnreadable=false;
  try {
    txBytes=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,maxBytes:512*1024,optional:true});
  } catch { txUnreadable=true; }
  if(txUnreadable) recordReason='post-apply-record-unreadable';
  else if(!txBytes) recordReason='no-post-apply-record';
  else {
    let tx=null,malformed=false;
    try { tx=JSON.parse(txBytes.toString('utf8')); }
    catch { malformed=true; }
    if(malformed) recordReason='post-apply-record-malformed';
    else {
      // Source 1: Stage 13 transaction.
      let stage13Valid=false;
      try { validateStage13Transaction(tx); stage13Valid=true; } catch {}
      if(stage13Valid) {
        if(tx.phase!=='committed') staleReason='transaction-not-committed';
        else {
          let rootStat=null;
          try { rootStat=await lstat(root,{bigint:true}); } catch {}
          if(!rootStat||!rootStat.isDirectory()||rootStat.isSymbolicLink()||
             sha256(Buffer.from(root+'|'+rootStat.dev+'|'+rootStat.ino))!==tx.rootIdentity)
            staleReason='transaction-root-mismatch';
          else {
            postApply=new Map();
            for(const item of tx.items??[])
              if(item&&typeof item.path==='string'&&typeof item.newSha256==='string')
                postApply.set(item.path,item.newSha256);
            evidence='stage13';
            if(typeof tx.manifestSha256==='string')
              manifestPostHash=tx.manifestSha256;
          }
        }
      } else {
        // Source 2: versioned journal.
        let journal=null,journalError=false;
        try {
          const { decodeManagedTransaction }=
            await import('./managed-recovery-v2.mjs');
          const { getCliVersion }=await import('./version.mjs');
          journal=decodeManagedTransaction(tx,
            {readerVersion:await getCliVersion()});
        } catch { journalError=true; }
        if(journalError) recordReason='post-apply-record-malformed';
        else if(journal.legacy)
          recordReason='legacy-record-no-post-apply-evidence';
        else if(journal.phase!=='committed')
          staleReason='journal-not-committed';
        else if(journal.backupId!==record.id)
          staleReason='journal-backup-mismatch';
        else {
          // Manifest corroboration: the journal has no rootIdentity,
          // so the current manifest hash is its only binding to this
          // root's current state. A mismatch means the journal is
          // stale (an earlier update); a missing manifest means the
          // binding cannot be proven.
          let currentManifest=null,manifestUnreadable=false;
          try {
            currentManifest=await readProjectBytes(root,'.vcp/manifest.json',{
              managedState:true,maxBytes:256*1024,optional:true});
          } catch { manifestUnreadable=true; }
          if(manifestUnreadable||currentManifest===null)
            staleReason='journal-manifest-unreadable';
          else if(sha256(currentManifest)!==journal.committedManifestHash)
            staleReason='journal-manifest-mismatch';
          else if(!journal.postApplyFiles?.length)
            recordReason='journal-no-post-apply-files';
          else {
            postApply=new Map(
              journal.postApplyFiles.map((f)=>[f.path,f.sha256]));
            evidence='journal';
          }
        }
      }
    }
  }
  // --- judge every restored file ---
  const covered=[],mismatches=[];
  let coversAnyRestored=false;
  for(const entry of restored){
    const expected=postApply?.get(entry.relative);
    if(expected)coversAnyRestored=true;
    let current=null,unreadable=false;
    try {
      current=await readProjectBytes(root,entry.relative,{
        managedState:false,maxBytes:8*1024*1024,optional:true});
    } catch { unreadable=true; }
    if(unreadable){
      mismatches.push({path:entry.relative,
        kind:expected?'post-apply':'unaccounted',
        detail:entry.relative+' (unreadable since apply)'});
      continue;
    }
    // P6 (F-P6-2): the file did not exist before the update. Absent
    // now means it is already in its pre-update state — safe. Present
    // now is judged against the post-apply hash alone: the apply
    // created it, so only an untouched creation may be deleted.
    if(entry.exists===false){
      if(current===null)continue;
      const hcur=sha256(current);
      if(expected){
        covered.push(entry.relative);
        if(hcur!==expected)
          mismatches.push({path:entry.relative,kind:'post-apply',
            detail:entry.relative});
      }else{
        mismatches.push({path:entry.relative,kind:'unaccounted',
          detail:entry.relative+' (added without post-apply evidence)'});
      }
      continue;
    }
    if(current===null){
      mismatches.push({path:entry.relative,
        kind:expected?'post-apply':'unaccounted',
        detail:entry.relative+' (deleted since apply)'});
      continue;
    }
    const hcur=sha256(current);
    // Unchanged since the backup: restoring is a no-op for this file,
    // so nothing is destroyed — safe regardless of coverage. (A file
    // changed by the apply and then changed back to the backup bytes
    // is also safe: current already equals the restored bytes.)
    if(hcur===entry.sha256)continue;
    if(expected){
      covered.push(entry.relative);
      if(hcur!==expected)
        mismatches.push({path:entry.relative,kind:'post-apply',
          detail:entry.relative});
    } else {
      mismatches.push({path:entry.relative,kind:'unaccounted',
        detail:entry.relative+' (changed without post-apply evidence)'});
    }
  }
  // Files with a post-apply hash that matched are covered too (they
  // were judged against the record, not only against the backup).
  if(postApply)
    for(const entry of restored)
      if(postApply.has(entry.relative)&&!covered.includes(entry.relative))
        covered.push(entry.relative);
  // --- manifest gate (Stage 13 source only; the journal source
  // already corroborated the manifest above) ---
  let manifestChecked=false,manifestReason=recordReason;
  if(evidence==='journal'){
    manifestChecked=true;manifestReason=null;
    covered.push('.vcp/manifest.json');
  } else if(evidence==='stage13'&&manifestPostHash!==null){
    let currentManifest=null,manifestUnreadable=false;
    try {
      currentManifest=await readProjectBytes(root,'.vcp/manifest.json',{
        managedState:true,maxBytes:256*1024,optional:true});
    } catch { manifestUnreadable=true; }
    if(manifestUnreadable){
      manifestReason='unreadable';
    } else if(currentManifest===null){
      // R14: the manifest was deleted after the apply. The file
      // restore is still judged; the manifest itself is restored
      // from the tamper-checked backup. Recorded, not silent.
      manifestReason='deleted-after-apply';
    } else {
      manifestChecked=true;manifestReason=null;
      covered.push('.vcp/manifest.json');
      if(sha256(currentManifest)!==manifestPostHash)
        mismatches.push({path:'.vcp/manifest.json',kind:'post-apply',
          detail:'.vcp/manifest.json'});
    }
  }
  // --- verdict ---
  if(!mismatches.length){
    // All restored files are either unchanged since the backup or
    // match their post-apply hash. When no record existed at all,
    // the evidence is the backup-hash comparison itself.
    return base('passed',evidence==='none'?'backup-hash':evidence,{
      covered,manifestChecked,manifestReason,
      reason:evidence==='none'?'unchanged-since-backup':'checked'});
  }
  if(mismatches.some((m)=>m.kind==='post-apply'))
    return base('post-apply-edits',evidence,{covered,
      mismatches:mismatches.map((m)=>m.detail),
      reason:'post-apply-edit-detected',manifestChecked,manifestReason});
  if(staleReason)
    return base('stale-transaction',evidence,{covered,
      mismatches:mismatches.map((m)=>m.detail),reason:staleReason,
      manifestChecked,manifestReason});
  const reason=postApply&&!coversAnyRestored?'record-covers-other-files':
    postApply?'file-not-covered-by-record':recordReason;
  return base('evidence-missing',evidence,{covered,
    mismatches:mismatches.map((m)=>m.detail),reason,
    manifestChecked,manifestReason:reason});
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
    // 3b2. P5-02: repeat rollback. If a previous successful rollback
    // already consumed this backup, report already-completed without
    // any mutation. The marker is re-read under the lock so a
    // concurrent rollback cannot slip past the pre-lock read. The
    // transaction/journal is never deleted or mutated (N+4 R1 + the
    // directive: do not blindly delete the transaction).
    const priorMarker=await readRollbackMarker(r,backupId);
    if(priorMarker){
      const alreadyBookkeeping=Object.freeze({rolledBack:false,
        alreadyCompleted:true,backupId:record.id,
        manifestSha256:sha256(manifestBytes),restoredFiles:[],
        skippedEntries:[],
        postApplyCheck:'already-completed',postApplyCovered:[],
        postApplyEvidence:'none',manifestChecked:false,
        manifestReason:'rollback-already-completed',
        journalTransition:'skipped-already-completed',
        journalCleared:false,journalRetained:true,markerWritten:true});
      let evidenceRecorded=true,evidenceError=null;
      try{
        await recordWriterEvidence({root:r,operation:'rollback-v2',
          principal:boundary.principal,result:alreadyBookkeeping});
      }catch(e){evidenceRecorded=false;evidenceError=e.code??'EVIDENCE_FAILED';}
      return Object.freeze({...alreadyBookkeeping,evidenceRecorded,
        ...(evidenceError?{evidenceError}:{})});
    }
    // 3c. P5-02: fail-closed restore-evidence check. A restore
    // overwrites the current bytes of every backup entry with the
    // pre-backup bytes, so a user edit made AFTER the backup is
    // destroyed by a successful restore (proven by the P4 gap probe:
    // ~/workspace/vcp-p4-full/evidence/probe-rollback-gap.mjs).
    // Every restored file is now judged against the best available
    // evidence: a committed Stage 13 transaction, a committed
    // versioned journal carrying postApplyFiles, or the backup
    // record itself. A file unchanged since the backup, or matching
    // its post-apply hash, is safe. A file whose change no record
    // accounts for refuses — there is no destructive fallback from
    // "record missing" to "restore anyway" (the P4 residual is
    // closed here). The check runs under the lifecycle lock, so the
    // check/restore window is narrowed, not eliminated — a
    // concurrent writer outside the lock (PH-06, unresolved for
    // transitions) could still edit between the check and the
    // restore; P5-01 closed the journal-creation race, not the
    // check/restore window.
    const evidence=await checkRestoreEvidence(r,record);
    if(evidence.verdict==='post-apply-edits'){
      fail('E_ROLLBACK_POST_APPLY_EDITS',
        `Refusing restore: ${evidence.mismatches.length} file(s) changed after the recorded apply: ${evidence.mismatches.join(', ')}. Restore would destroy those edits.`);
    }
    if(evidence.verdict==='stale-transaction'){
      fail('E_ROLLBACK_STALE_TRANSACTION',
        `Refusing restore: the post-apply record cannot vouch for the current state (${evidence.reason}): ${evidence.mismatches.join(', ')}. Manual recovery is required; see the P5 manual recovery runbook.`);
    }
    if(evidence.verdict==='evidence-missing'){
      fail('E_ROLLBACK_EVIDENCE_MISSING',
        `Refusing restore: no post-apply evidence accounts for the current bytes (${evidence.reason}): ${evidence.mismatches.join(', ')}. Restoring would destroy unaccounted changes. Manual recovery is required; see the P5 manual recovery runbook.`);
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
    // R-INT-10 (fix for F-P5V-3): a backup entry whose file is missing
    // from the backup (or malformed in the record) was silently skipped
    // — the receipt said rolledBack:true with restoredFiles:[] and no
    // flag. Record every skip with its reason so a caller reading the
    // receipt can tell that an entry was skipped. A skip is safe (the
    // evidence check already judged the live bytes), but it must not
    // be invisible.
    const skippedEntries=[];
    for(const entry of record.entries??[]){
      // P6 (F-P6-1): the production entry shape uses `path`.
      const rel=typeof entry?.path==='string'?entry.path:entry?.relative;
      // P6 (F-P6-2): a file that did not exist before the update is
      // deleted on restore (the evidence check already judged it).
      if(entry&&entry.exists===false){
        if(typeof rel!=='string'){
          skippedEntries.push({relative:null,reason:'malformed-entry'});
          continue;
        }
        await deleteManagedFileV2(r,rel);
        restored.push(rel);
        continue;
      }
      if(!entry||typeof rel!=='string'||!entry.sha256){
        skippedEntries.push({relative:typeof rel==='string'?rel:null,reason:'malformed-entry'});
        continue;
      }
      const fileBytes=await readProjectBytes(r,
        `.vcp/backups/${backupId}/files/${rel}`,{
          managedState:true,maxBytes:8*1024*1024}).catch(()=>null);
      if(!fileBytes){
        skippedEntries.push({relative:rel,reason:'backup-file-missing'});
        continue;
      }
      if(sha256(fileBytes)!==entry.sha256)
        fail('E_ROLLBACK_ENTRY_TAMPERED',
          `Backup file entry hash mismatch: ${rel}.`);
      await atomicWriteFile(r,rel,fileBytes,
        {mode:Number.isInteger(entry.mode)?entry.mode:0o644});
      restored.push(rel);
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
    // P5-02: consume marker. Written after the restore + journal
    // clear, under the lock. Best effort (see writeRollbackMarker):
    // a marker failure is recorded, never turned into a rollback
    // failure — the restore already succeeded, and a repeat rollback
    // without the marker is still safe (current bytes equal the
    // backup bytes, so the restore is a no-op) and writes the marker
    // then. Safety does not depend on the marker.
    let markerWritten=false,markerError=null;
    try{
      await writeRollbackMarker(r,backupId,sha256(manifestBytes));
      markerWritten=true;
    }catch(e){markerError=e.code??'MARKER_FAILED';}
    const bookkeeping=Object.freeze({rolledBack:true,backupId:record.id,
      manifestSha256:sha256(manifestBytes),restoredFiles:restored,
      skippedEntries,
      postApplyCheck:evidence.verdict,postApplyCovered:evidence.covered,
      postApplyEvidence:evidence.evidence,
      manifestChecked:evidence.manifestChecked,
      manifestReason:evidence.manifestReason,
      journalTransition,journalCleared,journalRetained,
      markerWritten,
      ...(markerError?{markerError}:{}),
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

// The rollback-consume marker (P5-02): rollbackCompletedAt +
// rollbackCompletedManifestSha256 in the backup record. Read under
// the lock; a repeat call returns already-completed without mutation.
// A malformed or unreadable backup record yields null (the caller
// then proceeds under the normal evidence check, which will refuse
// or restore on its own merits — a missing marker never authorizes
// a restore by itself).
async function readRollbackMarker(root,backupId){
  let bytes;
  try{
    bytes=await readProjectBytes(root,`.vcp/backups/${backupId}/backup.json`,{
      managedState:true,maxBytes:65536});
  }catch{return null;}
  let parsed;
  try{parsed=JSON.parse(bytes.toString('utf8'));}
  catch{return null;}
  if(parsed&&typeof parsed.rollbackCompletedAt==='string'&&
     typeof parsed.rollbackCompletedManifestSha256==='string')
    return {at:parsed.rollbackCompletedAt,
      manifestSha256:parsed.rollbackCompletedManifestSha256};
  return null;
}

// Write the consume marker into the backup record (P5-02). Best
// effort: the restore already succeeded, so a marker failure is
// recorded in the receipt, never turned into a rollback failure.
// The marker is additive (two new fields); id and
// restoredManifestHash are preserved, so loadBackup re-verifies the
// record exactly as before. The transaction/journal is never touched.
async function writeRollbackMarker(root,backupId,manifestSha256){
  const bytes=await readProjectBytes(root,
    `.vcp/backups/${backupId}/backup.json`,{
      managedState:true,maxBytes:65536});
  const parsed=JSON.parse(bytes.toString('utf8'));
  if(parsed.id!==backupId)
    fail('E_ROLLBACK_BACKUP_MISMATCH','Backup record ID mismatch.');
  parsed.rollbackCompletedAt=new Date().toISOString();
  parsed.rollbackCompletedManifestSha256=manifestSha256;
  await atomicWriteFile(root,`.vcp/backups/${backupId}/backup.json`,
    Buffer.from(JSON.stringify(parsed,null,2)+'\n'),
    {mode:0o600,managedState:true});
}

async function atomicWriteManifest(root,manifestBytes){
  const { atomicWriteManifest }=await import('./writer-atomic.mjs');
  return atomicWriteManifest(root,manifestBytes);
}

// P6 (F-P6-2): safe delete for a restore of a file that did not exist
// before the update. Resolves through the safe-path checks (no symlink
// components, inside the root), refuses non-regular files, and syncs
// the containing directory. An already-absent file is a no-op.
async function deleteManagedFileV2(root,relative){
  const target=await resolveProjectPath(root,relative,
    {purpose:'write-new'});
  let st;
  try{st=await lstat(target);}
  catch(e){if(e?.code==='ENOENT')return;throw e;}
  if(!st.isFile()||st.isSymbolicLink())
    fail('E_ROLLBACK_DELETE_UNSAFE',
      `Refusing to delete non-regular file: ${relative}.`);
  await rm(target,{force:false});
  await syncContainingDirectory(target);
}
