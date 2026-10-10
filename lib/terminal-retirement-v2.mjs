// Stage12 candidate terminal-retirement protocol. G-FENCE blocks all writes.
// Atomically detaches the complete remaining .vcp control directory *with*
// its journal and lock, preserving provenance across process crash.
//
// Archive scope: the forensic archive defaults to an in-root reserved name
// (.vcp-recovery-retired-<backupId>-<rand>), which stays inside the already
// authorized selected-root write scope. A sibling archive (outside the
// selected root) requires an explicit siblingScopeApproval object and
// remains a proposed contract change pending owner approval.
import { createHash } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { moveDirectoryNoReplace } from './native-no-replace.mjs';
import {
  buildArchiveName, isRetiredArchiveName,
  verifyDetachPreconditions, acknowledgeDetach,
} from './terminal-detach-protocol.mjs';
import { writeArchiveManifest } from './terminal-archive-retention.mjs';
import { planGreenfieldRecovery } from './greenfield-recovery-plan.mjs';

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
  rootPath,expectedJournalHash,ownedLock,onDetached=null,
  siblingScopeApproval=null
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
  // In-root archive is the default: no new write scope beyond the selected
  // root. A sibling archive needs the explicit approval object.
  const inRoot=siblingScopeApproval==null;
  const parent=path.dirname(root),basename=path.basename(root);
  const archiveName=buildArchiveName({
    backupId:plan.backupId,inRoot,basename
  });
  const archive=inRoot?path.join(root,archiveName):path.join(parent,archiveName);
  const verified=await verifyDetachPreconditions({
    root,expectedJournalHash,ownedLock,archiveName,
    siblingScopeApproval
  });
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
  // acknowledgeDetach syncs the affected parents and re-verifies the
  // archive holds the pinned source identity.
  const ack=await acknowledgeDetach(verified);
  if(ack.sourceRecreated)blocked('E_TERMINAL_STATE_RECREATED');
  // Forensic index inside the archive; never auto-deleted afterwards.
  const lockTokenSha256=createHash('sha256').update(lockBytes).digest('hex');
  const manifest=await writeArchiveManifest(archive,{
    journalSha256:verified.journalHash,
    lockTokenSha256,
    backupId:plan.backupId,
    rootIdentity:verified.sourceIdentity,
    scope:verified.scope
  });
  const remaining=await readdir(root);
  if(!remaining.every(isRetiredArchiveName))
    blocked('E_TERMINAL_ROOT_NOT_EMPTY');
  return Object.freeze({restoredState:'unmanaged',
    recoveredInterruptedOperation:true,
    terminalEvidenceRetained:true,retirementArchive:archive,
    archiveScope:verified.scope,archiveManifestSha256:manifest.manifestSha256,
    requiresIndependentReview:true});
}
