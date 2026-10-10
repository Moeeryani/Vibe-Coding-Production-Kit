// Stage12 candidate terminal-retirement protocol. G-FENCE blocks all writes.
// Atomically detaches the complete remaining .vcp control directory *with*
// its journal and lock, preserving provenance across process crash. This is
// NOT approval to write to sibling directories outside the selected root;
// native durable rename and adversarial tests are mandatory.
import { randomBytes, createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory } from './file-durability.mjs';
import { planGreenfieldRecovery } from './greenfield-recovery-plan.mjs';
import { moveDirectoryNoReplace } from './native-no-replace.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function blocked(code){const e=new Error(code);e.code=code;throw e;}
const exact=(observed,expected)=>Array.isArray(observed)&&
  observed.length===expected.length&&expected.every(x=>observed.includes(x));

export function evaluateTerminalRetirement({
  priorClassification,rootNames,stateNames,
  journalHash,expectedJournalHash,lockTokenMatches,writerBoundaryAccepted=false
}={}) {
  const reasons=[];
  if(priorClassification!=='TERMINAL_CLEANUP_CANDIDATE')
    reasons.push('E_TERMINAL_PLAN_NOT_CLEAN');
  if(!exact(rootNames,['.vcp']))reasons.push('E_TERMINAL_PROJECT_RESIDUE');
  if(!exact(stateNames,['transaction.json','update.lock']))
    reasons.push('E_TERMINAL_CONTROL_RESIDUE');
  if(!/^[a-f0-9]{64}$/.test(expectedJournalHash??'')||
    journalHash!==expectedJournalHash)reasons.push('E_TERMINAL_JOURNAL_CHANGED');
  if(lockTokenMatches!==true)reasons.push('E_TERMINAL_LOCK_UNPROVEN');
  // Even complete source-level evidence is not OS security authorization.
  if(writerBoundaryAccepted!==true)reasons.push('E_TERMINAL_WRITER_BOUNDARY_NO_GO');
  return Object.freeze({
    classification:reasons.length?'BLOCKED':'NATIVE_RENAME_CANDIDATE',
    authorized:false,gate:'NO_GO',reasons:Object.freeze(reasons)
  });
}

// The execution path is intentionally unreachable while D-01 remains
// DEFERRED. It is present only as a reviewable end-state architecture.
export async function retireGreenfieldControlDirectory({
  rootPath,expectedJournalHash,ownedLock,onDetached=null
}={}) {
  assertManagedMigrationGate(); // Must remain the first effect.
  const root=path.resolve(rootPath??'.');
  if(!ownedLock||ownedLock.root!==root||typeof ownedLock.token!=='string')
    blocked('E_TERMINAL_LOCK_UNPROVEN');
  const plan=await planGreenfieldRecovery(root);
  const state=path.join(root,'.vcp');
  // Path probe rejects linked ancestors and junctions before touching state.
  await resolveProjectPath(root,'.vcp/update.lock',{
    purpose:'managed-state',mustExist:true
  });
  const [rootNames,stateNames,journalBytes,lockBytes]=await Promise.all([
    readdir(root),readdir(state),
    readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,maxBytes:512*1024
    }),
    readProjectBytes(root,'.vcp/update.lock',{
      managedState:true,maxBytes:4096
    })
  ]);
  let lockRecord;
  try {lockRecord=JSON.parse(lockBytes.toString('utf8'));}
  catch{blocked('E_TERMINAL_LOCK_UNPROVEN');}
  const proof=evaluateTerminalRetirement({
    priorClassification:plan.classification,rootNames,stateNames,
    journalHash:digest(journalBytes),expectedJournalHash,
    lockTokenMatches:lockRecord?.token===ownedLock.token,
    writerBoundaryAccepted:true // This method itself remains D-01 gated.
  });
  if(proof.classification!=='NATIVE_RENAME_CANDIDATE')
    blocked('E_TERMINAL_RETIREMENT_BLOCKED');
  // A sibling name is necessary to make the selected root empty via one
  // rename of its *complete* evidence bundle. It is never recursively
  // deleted here. Sibling write scope and no-replace semantics require
  // independent OS-review before any G-FENCE approval.
  const parent=path.dirname(root),basename=path.basename(root);
  if(!/^[a-zA-Z0-9._-]{1,100}$/.test(basename))
    blocked('E_TERMINAL_PARENT_SCOPE');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(plan.backupId??''))
    blocked('E_TERMINAL_ARCHIVE_IDENTITY');
  const archive=path.join(parent,
    '.'+basename+'.vcp-recovery-retired-'+plan.backupId+'-'+
    randomBytes(20).toString('hex'));
  let exists;
  try {exists=await lstat(archive);}
  catch(e){if(e?.code!=='ENOENT')throw e;}
  if(exists)blocked('E_TERMINAL_ARCHIVE_COLLISION');
  const original=await lstat(state);
  if(!original.isDirectory()||original.isSymbolicLink())
    blocked('E_TERMINAL_STATE_OWNER');
  await moveDirectoryNoReplace({source:state,destination:archive,root});
  // Notify the caller synchronously that the original selected-root lock
  // path has ceased to exist. Even if parent sync subsequently fails, a
  // finally-block must not unlink a different occupant of the old path.
  if(typeof onDetached==='function')onDetached();
  // Once renamed, journal + owned lock are still available as evidence in
  // the same bundle. No attempted lock release via stale selected-root path.
  await syncContainingDirectory(state);
  await syncContainingDirectory(archive);
  if((await readdir(root)).length!==0)
    blocked('E_TERMINAL_ROOT_NOT_EMPTY');
  return Object.freeze({restoredState:'unmanaged',
    recoveredInterruptedOperation:true,
    terminalEvidenceRetained:true,retirementArchive:archive,
    requiresIndependentReview:true});
}
