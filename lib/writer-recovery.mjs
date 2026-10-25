// B-1 Production Writer — journal replay and recovery executor.
// The planner (lib/managed-recovery-v2.mjs) stays read-only; this module
// EXECUTES recovery. Every action is gated, journaled, and idempotent:
// replaying twice is a no-op with identical receipts.
import path from 'node:path';
import { verifyWriterBoundary,currentPrincipal } from './writer-identity.mjs';
import { authorizeV2Operation,recordWriterEvidence } from './production-writer.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { decodeManagedTransaction } from './managed-recovery-v2.mjs';
import { clearVersionedJournal,writeVersionedJournal } from './versioned-journal.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';

function fail(code,message){
  const e=new Error(code+(message?': '+message:''));
  e.code=code;
  throw e;
}

async function readJournal(root){
  let bytes;
  try{
    bytes=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,maxBytes:65536
    });
  }catch(e){
    if(e&&e.code==='ENOENT')return null;
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
  return decodeManagedTransaction(value,
    { readerVersion: await getCliVersion() });
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
    // Record the recovery in the journal before clearing it.
    // G2/G3 verify the test capability independently (B-5 Approach A).
    await writeVersionedJournal(r,{
      ...journal,phase:'recovering',recoveredAt:new Date().toISOString()
    },{previousHash:journal.sha256??null,readerVersion:journal.minimumReaderVersion,lock},
    testCapability)
      .catch(()=>{});
    const digest=await clearVersionedJournal(r,{lock},testCapability)
      .catch(()=>null);
    const receipt=Object.freeze({recovered:true,action,phase,
      backupId:journal.backupId,operation:journal.operation,
      stagingCleanup});
    await recordWriterEvidence({root:r,operation:'recovery-replay',
      principal:boundary.principal,result:receipt});
    return receipt;
  }finally{
    await lock.release().catch(()=>{});
  }
}

export { readJournal as _readJournalForTests };
