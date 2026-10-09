import { constants } from 'node:fs';
import { mkdir, open, readdir, rmdir, rm, readFile, chmod, unlink } from 'node:fs/promises';
import path from 'node:path';
import {
  acquireUpdateLock,releaseUpdateLock,createBackup,writeTransaction,
  clearTransaction,hashContent
} from './state.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { prepareAdaptiveGreenfield } from './greenfield-prepare.mjs';
import { describeVersionedBackup,describeVersionedTransaction } from './managed-recovery-v2.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';

// Candidate Stage12 transaction writer. The D-01 hard gate deliberately
// refuses all calls BEFORE touching the filesystem. It requires published-old
// binary G-FENCE and recovery proof before any release-time activation.
async function putNew(root,relative,data,{mode=0o644,managedState=false}={}) {
  const purpose=managedState?'managed-state':'write-new';
  const target=await resolveProjectPath(root,relative,{purpose});
  const exists=async()=>{
    try {
      await resolveProjectPath(root,relative,{purpose:'read-existing'});
      return true;
    } catch(e) {
      if(e.code==='E_VCP_PATH'&&e.message.includes('MISSING_INPUT'))return false;
      throw e;
    }
  };
  if(!managedState&&await exists())throw new Error('Greenfield destination already exists.');
  await mkdir(path.dirname(target),{recursive:true});
  await resolveProjectPath(root,relative,{purpose});
  const fd=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    (constants.O_NOFOLLOW??0),mode);
  try{await fd.writeFile(data);await fd.sync();}
  finally{await fd.close();}
  await chmod(target,mode);
  return target;
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
  let lockOwned=false,backup=null,committed=false;
  const remember=(relative,data,managedState=false)=>writes.push({
    relative,managedState,digest:hashContent(data)
  });
  const tx=(phase,extra={})=>describeVersionedTransaction({
    operationId:opId,backupId:backup.id,operation:'init',phase,
    minimumReaderVersion:plan.version,startedAt:new Date().toISOString(),...extra
  });
  try {
    await acquireUpdateLock(plan.root);
    lockOwned=true;
    if((await readdir(plan.root)).join(',')!=='.vcp') {
      throw new Error('Root gained user files during lock bootstrap.');
    }
    const state=await readdir(path.join(plan.root,'.vcp'));
    if(state.length!==1||state[0]!=='update.lock') {
      throw new Error('Initial VCP state changed during lock bootstrap.');
    }
    backup=await createBackup(plan.root,[],{installedVersion:plan.version});
    opId=backup.id;
    const backupRecord=describeVersionedBackup({
      id:backup.id,operationId:backup.id,operation:'init',
      minimumReaderVersion:plan.version,restoredManifestHash:null,
      preLockSnapshot:{
        vcpDirectoryExisted:false,manifestExisted:false,baselinesExisted:false,
        installedVersion:null,lockBootstrapCreatedVcpDirectory:true
      },entries:[]
    });
    const backupBytes=Buffer.from(JSON.stringify(backupRecord,null,2)+'\n');
    const metadata=await resolveProjectPath(plan.root,
      '.vcp/backups/'+backup.id+'/backup.json',{purpose:'managed-state',mustExist:true});
    // Backup metadata is confined to the exclusively owned lock's directory.
    await rm(metadata);
    await putNew(plan.root,'.vcp/backups/'+backup.id+'/backup.json',backupBytes,{managedState:true,mode:0o600});
    await writeTransaction(plan.root,tx('prepared'));
    await writeTransaction(plan.root,tx('applying'));
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
    const ignoreBytes=Buffer.from('backups/\nstage/\ntransaction.json\nupdate.lock\n');
    await putNew(plan.root,'.vcp/.gitignore',ignoreBytes,{managedState:true});
    remember('.vcp/.gitignore',ignoreBytes,true);
    const manifestBytes=Buffer.from(JSON.stringify(plan.manifest,null,2)+'\n');
    await putNew(plan.root,'.vcp/manifest.json',manifestBytes,{managedState:true,mode:0o600});
    remember('.vcp/manifest.json',manifestBytes,true);
    await writeTransaction(plan.root,tx('verified'));
    await writeTransaction(plan.root,tx('committed',{
      committedAt:new Date().toISOString(),committedManifestHash:hashContent(manifestBytes)
    }));
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
    await clearOnlyKnownEmptyDirectories(plan.root,writes);
    // Keep the versioned backup and transaction for an explicit owned
    // recovery/inspection pass rather than recursively deleting unknown state.
    throw new Error('Greenfield apply failed after safe generated-file cleanup; versioned VCP recovery state retained: '+error.message);
  }finally {
    if(lockOwned)await releaseUpdateLock(plan.root);
  }
}
