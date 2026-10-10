// Stage13 recovery executor. Every mutator is guarded by D-01 NO-GO.
// Whole-file CLAIM rollback relies on the exact staged inode + content hash.
// Managed-section rollback must additionally have an OS-enforced CAS/isolation
// proof; until that is independently accepted, it fails closed.
import {createHash,randomBytes} from 'node:crypto';
import {lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {acquireLifecycleLock} from './lifecycle-lock-v2.mjs';
import {planStage13Recovery} from './stage13-recovery-plan.mjs';
import {validateStage13Transaction,
  assertStage13TransactionTransition} from './stage13-transaction.mjs';
import {readProjectBytes} from './safe-read.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';
import {finishCommittedStage13} from './stage13-finalize.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function blocked(code){const e=new Error(code);e.code=code;throw e;}
const archiveName=(id,suffix)=>'.vcp-adoption-retired-'+id+'-'+suffix;
async function assertCurrentClaim(root,entry) {
  const contents=await readProjectBytes(root,entry.path,{maxBytes:8*1024*1024});
  const file=await lstat(path.join(root,...entry.path.split('/')));
  if(sha(contents)!==entry.newSha256||!file.isFile()||
     file.isSymbolicLink()||String(file.dev)!==entry.stagedDev||
     String(file.ino)!==entry.stagedIno)
    blocked('E_STAGE13_RECOVERY_CLAIM_CHANGED');
}
async function replaceJournal(provider,root,prior,next) {
  assertStage13TransactionTransition(prior,next);
  const old=await readProjectBytes(root,'.vcp/transaction.json',{
    managedState:true,maxBytes:512*1024
  });
  if(sha(old)!==sha(Buffer.from(JSON.stringify(prior,null,2)+'\n')))
    blocked('E_STAGE13_JOURNAL_CHANGED');
  const receipt=await provider.replaceFileAtomic(root,
    '.vcp/transaction.json',Buffer.from(JSON.stringify(next,null,2)+'\n'),
    {mode:0o600});
  if(receipt?.dataSynced!==true||receipt?.directorySynced!==true)
    blocked('E_STAGE13_JOURNAL_DURABILITY');
}
async function verifyRetiredEvidence(root) {
  const names=await readdir(root);
  const candidates=names.filter(x=>
    /^\.vcp-adoption-retired-adopt-[A-Za-z0-9._-]+-[a-f0-9]{40}$/.test(x));
  const accepted=[];
  for(const name of candidates) {
    try {
      const bytes=await readProjectBytes(root,name+'/transaction.json',{
        maxBytes:512*1024
      });
      const tx=JSON.parse(bytes.toString('utf8'));
      validateStage13Transaction(tx);
      if(tx.phase==='restored'&&name.startsWith(
        '.vcp-adoption-retired-'+tx.id+'-'))accepted.push({
        archive:name,transactionId:tx.id
      });
    }catch{ /* unrecognized archives are NEVER ownership proof */ }
  }
  return accepted;
}
export async function planStage13RetiredEvidence(rootPath) {
  const root=path.resolve(rootPath??'.');
  const found=await verifyRetiredEvidence(root);
  return Object.freeze({root,readOnly:true,writeAuthorized:false,
    classification:found.length?'ALREADY_ROLLED_BACK':'NO_RETIRED_EVIDENCE',
    retired:found});
}
export async function recoverInterruptedStage13({targetDir}={}) {
  assertManagedMigrationGate(); // no project I/O occurs before this fence
  const root=path.resolve(targetDir??'.');
  const planned=await planStage13Recovery(root);
  if(planned.classification==='BLOCKED')blocked('E_STAGE13_RECOVERY_BLOCKED');
  if(!['COMMITTED_VERIFY_ONLY','RECOVERABLE_CANDIDATE',
    'PRE_APPLY_RECOVERY_POINT','RESTORED_REVIEW'].includes(planned.classification))
    blocked('E_STAGE13_RECOVERY_UNSUPPORTED');
  if(planned.actions.some(a=>a.action==='RESTORE_EXACT_PREIMAGE_IF_UNMODIFIED'))
    blocked('E_STAGE13_SECTION_CAS_UNAVAILABLE');
  // Without a creation-directory inode ledger, only root-level claims
  // may be automatically erased; never remove user-owned parent folders.
  if(planned.actions.some(a=>a.path.includes('/')))
    blocked('E_STAGE13_CREATED_DIRECTORY_PROVENANCE_UNVERIFIED');
  const lock=await acquireLifecycleLock(root,{mode:'recovery'});
  let retirementAttempted=false;
  try {
    const current=await planStage13Recovery(root);
    if(current.classification!==planned.classification||
       current.transaction?.id!==planned.transaction?.id||
       current.journalSha256!==planned.journalSha256||
       current.backupMetadataSha256!==planned.backupMetadataSha256||
       JSON.stringify(current.actions)!==JSON.stringify(planned.actions))
      blocked('E_STAGE13_RECOVERY_CHANGED');
    const tx=current.transaction;
    const provider=new LinuxFsProvider();
    if(current.classification==='COMMITTED_VERIFY_ONLY') {
      return finishCommittedStage13(root,tx,{provider,ownedLock:lock});
    }
    let active=tx;
    if(active.phase!=='restoring'&&active.phase!=='restored') {
      const next={...active,phase:'restoring'};
      await replaceJournal(provider,root,active,next);
      active=next;
    }
    for(const action of current.actions) {
      if(action.action!=='REMOVE_CREATED_IF_UNMODIFIED')
        blocked('E_STAGE13_RESTORE_TYPE_UNPROVEN');
      const entry=active.items.find(x=>x.path===action.path);
      if(!entry||entry.kind!=='whole-file')
        blocked('E_STAGE13_CLAIM_OWNER_MISSING');
      await assertCurrentClaim(root,entry);
      const removed=await provider.deleteFile(root,entry.path);
      if(removed?.directorySynced!==true)
        blocked('E_STAGE13_DELETE_DURABILITY_UNPROVEN');
    }
    const replay=await planStage13Recovery(root);
    if(replay.classification==='BLOCKED'||replay.actions.length)
      blocked('E_STAGE13_ROLLBACK_NOT_COMPLETE');
    if(active.phase!=='restored') {
      const last={...active,phase:'restored'};
      await replaceJournal(provider,root,active,last);
      active=last;
    }
    // A single native NOREPLACE move retires the entire journal+lock+backup
    // together, inside the selected root. No journal-first deletion window.
    const archive=archiveName(active.id,randomBytes(20).toString('hex'));
    retirementAttempted=true;
    const move=await provider.moveNoReplace(root,'.vcp',archive);
    if(move?.srcParentSynced!==true||move?.dstParentSynced!==true)
      blocked('E_STAGE13_RETIREMENT_DURABILITY_UNPROVEN');
    return Object.freeze({classification:'RESTORED_UNMANAGED',
      root,priorVcpAbsent:true,archive,forensicEvidenceRetained:true});
  }finally {
    // Once a namespace move was attempted, its outcome can be ambiguous
    // after an OS sync failure. Do not blindly release the old lock path.
    if(!retirementAttempted)await lock.release();
  }
}
