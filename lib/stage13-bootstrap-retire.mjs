// Stage13 explicit orphan bootstrap retirement; never a generic stale-lock
// remover. Moves the COMPLETE control directory to a no-replace in-root
// archive, preserving all bytes. No recursive delete, journal invention,
// main-branch write, or automatic authorization from a read-only preview.
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {readProjectBytes} from './safe-read.mjs';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {inspectStage13BootstrapResidue} from './stage13-bootstrap-recovery.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';

function refuse(code){const error=new Error(code);error.code=code;throw error;}
function alive(pid) {
  try{process.kill(pid,0);return true;}
  catch(e){if(e.code==='ESRCH')return false;
    // EPERM and unusual process-state failures are treated as live.
    return true;
  }
}
function matched(expected,current) {
  return expected?.operationId===current?.operationId&&
    expected?.lockHash===current?.lockHash&&
    expected?.controlDevice===current?.controlDevice&&
    expected?.controlInode===current?.controlInode&&
    expected?.lockOwnerHost===current?.lockOwnerHost&&
    expected?.lockOwnerPid===current?.lockOwnerPid&&
    JSON.stringify(expected?.stateEntries)===
      JSON.stringify(current?.stateEntries);
}
export async function retireStage13OrphanBootstrap({
  targetDir,approval,provider=new LinuxFsProvider()
}={}) {
  assertManagedMigrationGate(); // NEVER issue project I/O before D-01 GO
  const root=path.resolve(targetDir??'.');
  const preview=await inspectStage13BootstrapResidue(root);
  if(!['ORPHAN_ADOPTION_LOCK_ONLY','PREJOURNAL_STAGING_PRESENT'].includes(
    preview.classification))refuse('E_STAGE13_BOOTSTRAP_NOT_PROVEN');
  if(!approval||approval.kind!=='RETIRE_STAGE13_ORPHAN_TO_IN_ROOT_ARCHIVE'||
     approval.root!==root||approval.explicitConsent!==true||
     !matched(approval.evidence,preview.evidence))
    refuse('E_STAGE13_BOOTSTRAP_OWNER_APPROVAL_REQUIRED');
  if(preview.evidence.lockOwnerHost!==os.hostname()||
     alive(preview.evidence.lockOwnerPid))
    refuse('E_STAGE13_BOOTSTRAP_OWNER_MAY_BE_LIVE');
  const current=await inspectStage13BootstrapResidue(root);
  if(!matched(preview.evidence,current.evidence)||
     current.classification!==preview.classification)
    refuse('E_STAGE13_BOOTSTRAP_CHANGED');
  const name='.vcp-adoption-bootstrap-retired-'+
    preview.evidence.operationId+'-'+randomBytes(20).toString('hex');
  const moved=await provider.moveNoReplace(root,'.vcp',name);
  if(moved?.srcParentSynced!==true||moved?.dstParentSynced!==true)
    refuse('E_STAGE13_BOOTSTRAP_MOVE_SYNC_UNVERIFIED');
  const lock=await readProjectBytes(root,name+'/update.lock',{maxBytes:4096});
  const {createHash}=await import('node:crypto');
  const actualHash=createHash('sha256').update(lock).digest('hex');
  if(actualHash!==preview.evidence.lockHash)
    refuse('E_STAGE13_BOOTSTRAP_ARCHIVE_MISMATCH');
  return Object.freeze({
    stage:13,root,classification:'ORPHAN_BOOTSTRAP_RETIRED',
    archive:name,forensicEvidenceRetained:true,
    priorManagedStateAbsent:true,projectUserFilesMutated:false,
    releaseProofRequired:true
  });
}
