// Stage12 scoped lifecycle lock. No stale lock stealing: another writer's
// lock is never removed from this process without exact owner identity.
// This is a candidate requiring Windows-native and adversarial TOCTOU proof.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rmdir, unlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory, assertLifecycleDurabilitySupported } from './file-durability.mjs';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {readProjectBytes} from './safe-read.mjs';

function blocked(code){const error=new Error(code);error.code=code;throw error;}
const activeOwnedBootstraps=new WeakSet();
export async function inspectOwnedAdoptionBootstrap(rootPath,lock) {
  const root=path.resolve(rootPath);
  if(!lock||!activeOwnedBootstraps.has(lock)||lock.root!==root||
    lock.mode!=='adopt'||lock.released===true)
    blocked('E_ADOPTION_LOCK_NOT_OWNED');
  const bytes=await readProjectBytes(root,'.vcp/update.lock',{
    managedState:true,maxBytes:4096
  });
  let record;
  try{record=JSON.parse(bytes.toString('utf8'));}
  catch{blocked('E_ADOPTION_LOCK_CHANGED');}
  if(record.version!==2||record.mode!=='adopt'||
    record.token!==lock.token||record.pid!==process.pid||
    record.operationId!==lock.operationId||
    record.consentFingerprint!==lock.consentFingerprint)
    blocked('E_ADOPTION_LOCK_CHANGED');
  const state=await lstat(path.join(root,'.vcp'));
  if(!state.isDirectory()||state.isSymbolicLink())
    blocked('E_ADOPTION_STATE_REPLACED');
  return Object.freeze({root,owned:true,mode:'adopt',token:lock.token,
    stateDev:state.dev,stateIno:state.ino});
}
export async function acquireLifecycleLock(rootPath,{
  mode='update',consentFingerprint=null,transactionId=null
}={}) {
  if(!['init','update','recovery','adopt'].includes(mode))blocked('E_LOCK_MODE');
  if(mode==='recovery'&&transactionId!==null&&
     !/^adopt-[a-f0-9]{32}$/.test(transactionId))
    blocked('E_STAGE13_RECOVERY_TRANSACTION_ID');
  if(mode==='adopt') {
    assertManagedMigrationGate();
    if(typeof consentFingerprint!=='string'||
       !/^[0-9a-f]{64}$/.test(consentFingerprint))
      blocked('E_ADOPTION_BOOTSTRAP_CONSENT_REQUIRED');
  }
  const root=path.resolve(rootPath);
  // Refuse unsupported namespace durability before mkdir, lock bootstrap,
  // backup creation or any other selected-project write.
  await assertLifecycleDurabilitySupported(root);
  const stateDir=path.join(root,'.vcp');
  const lockRel='.vcp/update.lock';
  // Existing state may be present for updates, absent only for first install.
  let vcpPresent=false;
  try{
    const stat=await lstat(stateDir);
    if(!stat.isDirectory()||stat.isSymbolicLink())blocked('E_STATE_COLLISION');
    vcpPresent=true;
  }catch(e){if(e.code!=='ENOENT')throw e;}
  if(['init','adopt'].includes(mode)&&vcpPresent)
    blocked('E_INIT_STATE_COLLISION');
  if(!['init','adopt'].includes(mode)&&!vcpPresent)
    blocked('E_MANAGED_STATE_ABSENT');
  await resolveProjectPath(root,lockRel,{purpose:'managed-state'});
  let bootstrapOwned=false;
  if(!vcpPresent) {
    try{
      await mkdir(stateDir,{mode:0o700});
      bootstrapOwned=true;
      await syncContainingDirectory(stateDir);
    }
    catch(e){if(e.code==='EEXIST')blocked('E_STATE_BOOTSTRAP_RACE');throw e;}
  }
  const stateProof=await lstat(stateDir);
  if(!stateProof.isDirectory()||stateProof.isSymbolicLink())
    blocked('E_STATE_BOOTSTRAP_CHANGED');
  const lockPath=await resolveProjectPath(root,lockRel,{purpose:'managed-state'});
  const token=randomBytes(24).toString('hex');
  const operationId=mode==='adopt'? 'adopt-'+randomBytes(16).toString('hex'):
    transactionId;
  const record={version:2,mode,pid:process.pid,host:os.hostname(),token,
    startedAt:new Date().toISOString(),
    ...(mode==='adopt'?{operationId,consentFingerprint,
      bootstrapPriorVcpAbsent:true}: {}),
    ...(mode==='recovery'&&transactionId!==null?
      {operationId:transactionId}: {})};
  const bytes=Buffer.from(JSON.stringify(record)+'\n');
  let handle;
  try {
    handle=await open(lockPath,
      constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
      (constants.O_NOFOLLOW??0),0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await syncContainingDirectory(lockPath);
  }catch(e) {
    if(handle)await handle.close();
    if(bootstrapOwned) {
      try{await rmdir(stateDir);}
      catch(clean){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(clean.code))throw clean;}
    }
    if(e.code==='EEXIST')blocked('E_LOCK_ALREADY_HELD');
    throw e;
  }
  const identity=await handle.stat();
  await handle.close();
  let released=false;
  const owned={
    root,mode,bootstrapOwned,token,lockPath,
    operationId,consentFingerprint,
    get released(){return released;},
    async release() {
      if(released)return;
      const state=await lstat(stateDir);
      if(!state.isDirectory()||state.isSymbolicLink()||
         state.dev!==stateProof.dev||state.ino!==stateProof.ino)
        blocked('E_STATE_BOOTSTRAP_CHANGED');
      const selected=await resolveProjectPath(root,lockRel,{
        purpose:'managed-state',mustExist:true
      });
      const before=await lstat(selected);
      if(!before.isFile()||before.isSymbolicLink()||
        before.dev!==identity.dev||before.ino!==identity.ino)blocked('E_LOCK_OWNERSHIP');
      const fd=await open(selected,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      let current;
      try {
        const st=await fd.stat();
        if(st.dev!==identity.dev||st.ino!==identity.ino)blocked('E_LOCK_OWNERSHIP');
        current=await fd.readFile();
      }finally{await fd.close();}
      if(!current.equals(bytes))blocked('E_LOCK_MODIFIED');
      const again=await lstat(selected);
      if(again.dev!==identity.dev||again.ino!==identity.ino)blocked('E_LOCK_CHANGED');
      await unlink(selected);
      released=true;
      activeOwnedBootstraps.delete(owned);
      await syncContainingDirectory(selected);
    },
    async cleanupBootstrapIfEmpty() {
      if(!bootstrapOwned||!released)return false;
      let current;
      try {current=await lstat(stateDir);}
      catch(e){if(e.code==='ENOENT')return false;throw e;}
      if(!current.isDirectory()||current.isSymbolicLink()||
         current.dev!==stateProof.dev||current.ino!==stateProof.ino)
        blocked('E_STATE_BOOTSTRAP_CHANGED');
      const names=await readdir(stateDir);
      if(names.length!==0)return false;
      try {
        await rmdir(stateDir);
        await syncContainingDirectory(stateDir); // Fsync selected root.
        return true;
      }catch(e){if(['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))
        return false;throw e;}
    }
  };
  if(mode==='adopt')activeOwnedBootstraps.add(owned);
  return owned;
}
