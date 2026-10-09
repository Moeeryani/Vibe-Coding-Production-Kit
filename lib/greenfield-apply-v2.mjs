import { readdir, rmdir, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  writeTransaction,clearTransaction,hashContent
} from './state.mjs';
import { resolveProjectPath } from './safe-path.mjs';
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

async function removeCreatedExactly(root,records) {
  const mismatches=[];
  for(const record of [...records].reverse()) {
    let current;
    try {
      const file=await resolveProjectPath(root,record.relative,{
        purpose:record.managedState?'managed-state':'read-existing',mustExist:true
      });
      current=await readFile(file);
    }catch {
      mismatches.push(record.relative);continue;
    }
    if(hashContent(current)!==record.digest){
      mismatches.push(record.relative);continue;
    }
  }
  if(mismatches.length)return {complete:false,mismatches};
  for(const record of [...records].reverse()) {
    const file=await resolveProjectPath(root,record.relative,{
      purpose:record.managedState?'managed-state':'read-existing',mustExist:true
    });
    if(hashContent(await readFile(file))!==record.digest){
      return {complete:false,mismatches:[record.relative]};
    }
    await unlink(file);
  }
  return {complete:true,mismatches:[]};
}

async function clearOnlyKnownEmptyDirectories(root,records) {
  const parents=new Set();
  for(const {relative} of records) {
    let parent=path.posix.dirname(relative);
    while(parent!=='.'&&parent!=='.vcp') {
      parents.add(parent);
      parent=path.posix.dirname(parent);
    }
  }
  for(const relative of [...parents].sort((a,b)=>b.length-a.length)) {
    try{await rmdir(path.join(root,relative));}
    catch(e){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;}
  }
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
  const writes=[];
  let lockOwned=false,lockGuard=null,backup=null,committed=false;
  const remember=(relative,data,managedState=false)=>{
    const record={relative,managedState,digest:hashContent(data)};
    const found=writes.findIndex(x=>x.relative===relative);
    if(found>=0)writes[found]=record;else writes.push(record);
  };
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
  const tx=(phase,extra={})=>describeVersionedTransaction({
    operationId:opId,backupId:backup.id,operation:'init',phase,
    minimumReaderVersion:plan.version,startedAt:new Date().toISOString(),
    createdFiles:proposedCreated(),...extra
  });
  const writeOwnedTx=async(phase,extra={})=>{
    const descriptor=tx(phase,extra);
    await writeTransaction(plan.root,descriptor);
    remember('.vcp/transaction.json',Buffer.from(JSON.stringify(descriptor,null,2)+'\n'),true);
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
    const backupBytes=Buffer.from(JSON.stringify({
      formatVersion:backup.formatVersion,backupSchemaVersion:2,
      minimumReaderVersion:backup.minimumReaderVersion,
      restoredManifestHash:null,id:backup.id,operationId:backup.operationId,
      operation:'init',priorVcpDirectoryExisted:false,
      priorManifestExisted:false,priorBaselinesExisted:false,
      priorInstalledVersion:null,lockBootstrapCreatedVcpDirectory:true,
      entries:[]
    },null,2)+'\n');
    remember('.vcp/backups/'+backup.id+'/backup.json',backupBytes,true);
    await writeOwnedTx('prepared');
    await writeOwnedTx('applying');
    for(const [relative,file] of plan.files) {
      const data=Buffer.from(file.content,'utf8');
      await putNew(plan.root,relative,data,{mode:file.mode??0o644});
      remember(relative,data);
    }
    for(const [relative,file] of plan.files) {
      const entry=plan.manifest.managedFiles[relative];
      const data=Buffer.from(file.content,'utf8');
      await putNew(plan.root,entry.baselinePath,data,{managedState:true,mode:0o600});
      remember(entry.baselinePath,data,true);
    }
    const ignoreBytes=Buffer.from(SAFE_STATE_GITIGNORE);
    await putNew(plan.root,'.vcp/.gitignore',ignoreBytes,{managedState:true});
    remember('.vcp/.gitignore',ignoreBytes,true);
    const manifestBytes=Buffer.from(JSON.stringify(plan.manifest,null,2)+'\n');
    await putNew(plan.root,'.vcp/manifest.json',manifestBytes,{managedState:true,mode:0o600});
    remember('.vcp/manifest.json',manifestBytes,true);
    await writeOwnedTx('verified');
    await writeOwnedTx('committed',{
      committedAt:new Date().toISOString(),committedManifestHash:hashContent(manifestBytes)
    });
    committed=true;
    await clearTransaction(plan.root);
    return {applied:true,operation:'init',schemaVersion:2,assetSet:plan.assetSet,
      createdFiles:plan.paths.length,backupId:backup.id};
  }catch(error) {
    if(!backup)throw error;
    if(committed)throw error;
    // Do not destroy any user/concurrent edits even during failure recovery.
    const restore=await removeCreatedExactly(plan.root,writes);
    if(!restore.complete)throw new Error('Partial greenfield recovery: external file edits detected; preserve journal and backup: '+restore.mismatches.join(', '));
    // A successful rollback must leave the root truly unmanaged. Remove only
    // known-empty directories and known-byte files: never rm -r a VCP tree.
    try {
      await rmdir(path.join(plan.root,'.vcp/backups',backup.id,'files'));
      await clearOnlyKnownEmptyDirectories(plan.root,writes);
      await lockGuard.release();
      lockOwned=false;
      await rmdir(path.join(plan.root,'.vcp'));
      throw new Error('Greenfield transaction safely restored pre-init unmanaged state: '+error.message);
    }catch(cleanupError){
      if(cleanupError.message.startsWith('Greenfield transaction safely restored'))throw cleanupError;
      throw new Error('Partial greenfield recovery; unowned state preserved for inspection: '+cleanupError.message);
    }
  }finally {
    if(lockOwned)await lockGuard.release();
    if(!backup&&!committed&&lockGuard)await lockGuard.cleanupBootstrapIfEmpty();
  }
}
