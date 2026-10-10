import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { hashContent } from './state.mjs';
import { writeVersionedJournal, clearVersionedJournal } from './versioned-journal.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { prepareAdaptiveGreenfield } from './greenfield-prepare.mjs';
import { describeVersionedTransaction } from './managed-recovery-v2.mjs';
import { createGreenfieldRecoveryBackup } from './versioned-backup.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { createOwnedPathExclusively } from './safe-create.mjs';
const SAFE_STATE_GITIGNORE=['backups/','stage/','transaction.json','update.lock',''].join('\n');

// Candidate Stage12 transaction writer. The D-01 hard gate deliberately
// refuses all calls BEFORE touching the filesystem. It requires published-old
// binary G-FENCE and recovery proof before any release-time activation.
async function putNew(root,relative,data,{mode=0o644,managedState=false}={}) {
  const result=await createOwnedPathExclusively(root,relative,Buffer.from(data),{
    mode,managedState
  });
  return result.file;
}

export async function applyAdaptiveGreenfield(options={}) {
  // There must be no createBackup(), lock bootstrap or user file write ahead
  // of this check. It can only be replaced after independent human approval.
  assertManagedMigrationGate();
  const plan=await prepareAdaptiveGreenfield(options);
  if(plan.blocked)throw new Error('Greenfield preparation blocked: '+plan.reason);
  const current=await inspectProject(plan.root);
  if(current.classification!=='NEW')throw new Error('Root changed since greenfield planning.');
  const initial=await readdir(plan.root);
  if(initial.length)throw new Error('Selected root is no longer empty.');
  let opId=null; // Assigned from the sole authoritative backup identity.
  let lockOwned=false,lockGuard=null,backup=null,committed=false,journalHash=null;
  const proposedCreated=()=>[
    ...[...plan.files].map(([relative,file])=>({
      path:relative,hash:hashContent(Buffer.from(file.content,'utf8'))
    })),
    ...[...plan.files].map(([relative,file])=>({
      path:plan.manifest.managedFiles[relative].baselinePath,
      hash:hashContent(Buffer.from(file.content,'utf8'))
    })),
    {path:'.vcp/.gitignore',hash:hashContent(Buffer.from(SAFE_STATE_GITIGNORE))},
    {path:'.vcp/manifest.json',
      hash:hashContent(Buffer.from(JSON.stringify(plan.manifest,null,2)+'\n'))}
  ];
  const startedAt=new Date().toISOString();
  const tx=(phase,extra={})=>describeVersionedTransaction({
    operationId:opId,backupId:backup.id,operation:'init',phase,
    minimumReaderVersion:plan.version,startedAt,
    createdFiles:proposedCreated(),...extra
  });
  const writeOwnedTx=async(phase,extra={})=>{
    const descriptor=tx(phase,extra);
    const written=await writeVersionedJournal(plan.root,descriptor,{
      previousHash:journalHash,readerVersion:plan.version
    });
    journalHash=written.sha256;
  };
  try {
    lockGuard=await acquireLifecycleLock(plan.root,{mode:'init'});
    lockOwned=true;
    if((await readdir(plan.root)).join(',')!=='.vcp') {
      throw new Error('Root gained user files during lock bootstrap.');
    }
    const state=await readdir(path.join(plan.root,'.vcp'));
    if(state.length!==1||state[0]!=='update.lock') {
      throw new Error('Initial VCP state changed during lock bootstrap.');
    }
    backup=await createGreenfieldRecoveryBackup(plan.root,{
      minimumReaderVersion:plan.version
    });
    opId=backup.id;
    await writeOwnedTx('prepared');
    await writeOwnedTx('applying');
    for(const [relative,file] of plan.files) {
      const data=Buffer.from(file.content,'utf8');
      await putNew(plan.root,relative,data,{mode:file.mode??0o644});
    }
    for(const [relative,file] of plan.files) {
      const entry=plan.manifest.managedFiles[relative];
      const data=Buffer.from(file.content,'utf8');
      await putNew(plan.root,entry.baselinePath,data,{managedState:true,mode:0o600});
    }
    const ignoreBytes=Buffer.from(SAFE_STATE_GITIGNORE);
    await putNew(plan.root,'.vcp/.gitignore',ignoreBytes,{managedState:true});
    const manifestBytes=Buffer.from(JSON.stringify(plan.manifest,null,2)+'\n');
    await putNew(plan.root,'.vcp/manifest.json',manifestBytes,{managedState:true,mode:0o600});
    await writeOwnedTx('verified');
    await writeOwnedTx('committed',{
      committedAt:new Date().toISOString(),committedManifestHash:hashContent(manifestBytes)
    });
    committed=true;
    await clearVersionedJournal(plan.root,{expectedHash:journalHash});
    journalHash=null;
    return {applied:true,operation:'init',schemaVersion:2,assetSet:plan.assetSet,
      createdFiles:plan.paths.length,backupId:backup.id};
  }catch(error) {
    // An interrupted first install must retain its durable transaction,
    // backup and user changes until the owned, exact-byte recovery path
    // proves the entire tree. Partial best-effort cleanup here used to erase
    // evidence before verifying unknown nested files.
    if(!backup) {
      throw new Error('Greenfield bootstrap interrupted before backup identity; preserve .vcp state for inspection: '+error.message);
    }
    if(committed) {
      throw new Error('Greenfield commit recorded, but finalization failed; preserve committed journal: '+error.message);
    }
    throw new Error('Greenfield transaction interrupted; use read-only recovery-plan, preserve journal and backup: '+error.message);
  }finally {
    if(lockOwned)await lockGuard.release();
    if(!backup&&!committed&&lockGuard)await lockGuard.cleanupBootstrapIfEmpty();
  }
}
