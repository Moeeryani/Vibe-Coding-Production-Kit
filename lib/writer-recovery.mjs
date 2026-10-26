// B-1 Production Writer — journal replay and recovery executor.
// The planner (lib/managed-recovery-v2.mjs) stays read-only; this module
// EXECUTES recovery. Every action is gated, journaled, and idempotent
// in the bookkeeping sense: a replay that clears the journal makes a
// second replay return NO_JOURNAL, and a replay whose bookkeeping
// fails retains the journal so a later replay re-attempts it under
// the restore handler's idempotence contract.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { verifyWriterBoundary,currentPrincipal } from './writer-identity.mjs';
import { authorizeV2Operation,recordWriterEvidence } from './production-writer.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { decodeManagedTransaction } from './managed-recovery-v2.mjs';
import { clearVersionedJournal,writeVersionedJournal } from './versioned-journal.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

function fail(code,message){
  const e=new Error(code+(message?': '+message:''));
  e.code=code;
  throw e;
}

// Build a writeable v2 descriptor for a journal transition from the
// decoded journal. The decoded form drops write-only fields
// (transactionSchemaVersion, operationId) and adds computed ones
// (committed, legacy, recommendation) that the descriptor validator
// refuses, so the descriptor is rebuilt from the whitelist and
// null-valued optional fields are omitted (decode normalizes both
// sides to null, so identity comparison still holds).
function transitionDescriptor(journal,phase){
  const d={formatVersion:2,transactionSchemaVersion:2,
    id:journal.id,operationId:journal.id,operation:journal.operation,
    phase,backupId:journal.backupId,
    minimumReaderVersion:journal.minimumReaderVersion,
    startedAt:journal.startedAt,createdFiles:journal.createdFiles??[]};
  if(journal.plannedManifestHash)
    d.plannedManifestHash=journal.plannedManifestHash;
  if(journal.committedManifestHash)
    d.committedManifestHash=journal.committedManifestHash;
  if(journal.committedAt)d.committedAt=journal.committedAt;
  if(journal.cleanupBackupHash)
    d.cleanupBackupHash=journal.cleanupBackupHash;
  return d;
}

async function readJournal(root){
  let bytes;
  try{
    bytes=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,maxBytes:65536
    });
  }catch(e){
    // safe-read reports a missing managed file as E_VCP_PATH /
    // MISSING_INPUT (mustExist), not ENOENT — both mean "no journal".
    if(e&&e.code==='ENOENT')return null;
    if(e&&e.code==='E_VCP_PATH'&&
       String(e.message).includes('MISSING_INPUT'))return null;
    throw e;
  }
  let value;
  try{value=JSON.parse(bytes.toString('utf8'));}
  catch{fail('E_RECOVERY_JOURNAL_TORN','Journal is not valid JSON; quarantined, not deleted.');}
  // Phase N+4 (§2): recovery inspection decodes with the EXECUTING
  // CLI's own version as the reader — never with the journal's
  // self-declared minimum, which would trust the journal about our
  // capability. (Previously this call passed no reader at all, so a
  // v2 journal could never decode here, at any package version.)
  const { getCliVersion } = await import('./version.mjs');
  const decoded=decodeManagedTransaction(value,
    { readerVersion: await getCliVersion() });
  // Phase N+4 R1: retain the journal's MEASURED digest — the SHA-256
  // of the bytes actually read — alongside the decoded form. It is
  // never taken from a journal field (the decoded form carries no
  // digest), and the transition/clear calls verify it against the
  // current bytes via previousHash/expectedHash, so any change
  // between read and bookkeeping refuses instead of silently
  // succeeding on stale state.
  return Object.freeze({...decoded,sha256:sha256(bytes)});
}

// Replay an interrupted transaction to a consistent state.
// handlers: {complete({journal}) -> void, restore({journal}) -> void}
// testCapability: optional test-only authorization (see production-writer.mjs).
// Returns a receipt; idempotent.
export async function replayVersionedJournal(root,handlers={},testCapability=null){
  const r=path.resolve(root);
  const boundary=await verifyWriterBoundary({root:r,operation:'recovery-replay'});
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root:r,operation:'recovery-replay'});
  }else{
    authorizeV2Operation(); // Recovery is a mutation; gate applies.
  }
  const journal=await readJournal(r);
  if(!journal)
    return Object.freeze({recovered:false,reason:'NO_JOURNAL'});
  if(journal.legacy)
    fail('E_RECOVERY_LEGACY_JOURNAL',
      'Legacy v1 journal requires manual recovery; automated replay refused.');
  const lock=await acquireLifecycleLock(r,{mode:'recovery'});
  try{
    const phase=journal.phase;
    let action;
    if(phase==='committed'||phase==='cleanup'){
      action='finalize';
    }else if(phase==='verified'){
      if(typeof handlers.complete!=='function')
        fail('E_RECOVERY_NO_COMPLETE','Verified transaction needs a complete handler.');
      await handlers.complete({journal,root:r});
      action='completed';
    }else if(['prepared','applying','recovering'].includes(phase)){
      if(typeof handlers.restore!=='function')
        fail('E_RECOVERY_NO_RESTORE','Interrupted transaction needs a restore handler.');
      await handlers.restore({journal,root:r});
      action='restored-from-backup';
    }else{
      fail('E_RECOVERY_UNKNOWN_PHASE',`Unknown journal phase: ${phase}.`);
    }
    // Phase N+4 (§4): provenance-based staging cleanup for THIS
    // transaction, wired into the production recovery path. It runs
    // after restore/complete and before the 'recovering' journal
    // transition. The committed journal itself is protected by the
    // control-artifact guard in recoveryCleanupStaging — it can only
    // leave via terminal clear, never via generic recovery cleanup.
    // Cleanup failure is reported in the receipt, never mistaken for
    // restore failure or success.
    let stagingCleanup = null;
    try {
      const { recoveryCleanupStaging } =
        await import('./staging-provenance.mjs');
      stagingCleanup = await recoveryCleanupStaging(r, {
        transactionId: journal.id });
    } catch (e) {
      stagingCleanup = { error: e.code ?? 'CLEANUP_FAILED' };
    }
    // Phase N+4 R1 bookkeeping: the journal's lifecycle accounting
    // is explicit and never swallowed. The measured read-time
    // digest is carried into the transition (previousHash) and the
    // clear (expectedHash, taken from the transition's own return
    // for post-transition journals, or from the measured digest
    // when no transition is legal). Phases with no legal outgoing
    // transition to 'recovering' (committed, cleanup: no outgoing
    // transitions at all; recovering: already the recovery state)
    // skip the transition and clear directly against the measured
    // digest — terminal preconditions still apply for cleanup.
    // A failed transition or clear RETAINS the journal and is
    // reported in the receipt; it never masquerades as terminal
    // completion.
    let journalTransition=null,journalCleared=false,
      journalRetained=true,journalError=null;
    if(phase==='committed'||phase==='cleanup'||phase==='recovering'){
      journalTransition='skipped-terminal';
      try{
        await clearVersionedJournal(r,
          {expectedHash:journal.sha256,lock},testCapability);
        journalCleared=true;journalRetained=false;
      }catch(e){journalError=e.code??'CLEAR_FAILED';}
    }else{
      // prepared / applying / verified -> recovering is legal.
      try{
        const transitioned=await writeVersionedJournal(r,
          transitionDescriptor(journal,'recovering'),
          {previousHash:journal.sha256,
           readerVersion:journal.minimumReaderVersion,lock},
          testCapability);
        journalTransition='succeeded';
        try{
          await clearVersionedJournal(r,
            {expectedHash:transitioned.sha256,lock},testCapability);
          journalCleared=true;journalRetained=false;
        }catch(e){journalError=e.code??'CLEAR_FAILED';}
      }catch(e){
        journalTransition='failed';journalError=e.code??'TRANSITION_FAILED';
      }
    }
    const bookkeeping=Object.freeze({recovered:true,action,phase,
      backupId:journal.backupId,operation:journal.operation,
      stagingCleanup,journalTransition,journalCleared,journalRetained,
      ...(journalError?{journalError}:{})});
    // Evidence recording is reported, not swallowed: the audit
    // entry records the bookkeeping receipt above, and the
    // returned receipt additionally reports whether the recording
    // itself succeeded.
    let evidenceRecorded=true,evidenceError=null;
    try{
      await recordWriterEvidence({root:r,operation:'recovery-replay',
        principal:boundary.principal,result:bookkeeping});
    }catch(e){evidenceRecorded=false;evidenceError=e.code??'EVIDENCE_FAILED';}
    return Object.freeze({...bookkeeping,evidenceRecorded,
      ...(evidenceError?{evidenceError}:{})});
  }finally{
    await lock.release().catch(()=>{});
  }
}

export { readJournal as _readJournalForTests };
