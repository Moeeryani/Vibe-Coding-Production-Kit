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
import { secureWriterProviderStatus,
  selectSecureWriterProvider } from './secure-fs-provider.mjs';
// Phase N+3 (R-2): anchored mode. When the secure native provider is
// AVAILABLE (helper built and trusted), lock creation, assertion and
// release run through descriptor-bound provider operations carrying
// root/state/lock identity expectations — no path-resolved mutation
// remains in the lock lifecycle. When the helper is ABSENT (unbuilt
// tree), the legacy path implementation below runs and the lock
// reports anchored:false; when the helper is PRESENT BUT INVALID,
// selectSecureWriterProvider throws and acquisition refuses —
// presence-with-corruption never falls back (Finding 003 rule).
function anchoredProviderOrNull() {
  const status = secureWriterProviderStatus();
  if (status.provider !== 'linux-native' || !status.helper.present)
    return null;
  return selectSecureWriterProvider();
}

function blocked(code){const error=new Error(code);error.code=code;throw error;}
const activeOwnedBootstraps=new WeakSet();
const activeLifecycleLocks=new WeakSet();
const ownedLockInodes=new WeakMap();
// A root + token provided by a caller is not authority. The exact lock
// object must be one minted by acquireLifecycleLock in this process.
export async function assertOwnedLifecycleLock(rootPath,lock,{
  mode=null,transactionId=null
}={}) {
  const root=path.resolve(rootPath);
  if(!lock||!activeLifecycleLocks.has(lock)||lock.released===true||
     lock.root!==root||(mode!==null&&lock.mode!==mode)||
     (transactionId!==null&&lock.operationId!==transactionId))
    blocked('E_LIFECYCLE_LOCK_NOT_OWNED');
  const proof=ownedLockInodes.get(lock);
  if(!proof)blocked('E_LIFECYCLE_LOCK_NOT_OWNED');
  let control;
  if(proof.anchored) {
    // Anchored assertion: identity and payload are verified through
    // the pinned provider chain (root + state + lock expectations
    // checked inside the helper against open descriptors), replacing
    // the lstat + path-read sequence below.
    const expect={root:proof.anchor.root,parent:proof.anchor.parent,
      file:{dev:proof.lockDev.toString(),ino:proof.lockIno.toString()}};
    const doc=await proof.provider.readFileVerified(
      lock.root,'.vcp/update.lock',expect).catch((e)=>{
        if(e.code==='E_FS_IDENTITY_CHANGED'||e.code==='E_FS_OS_ERROR')
          blocked('E_LIFECYCLE_LOCK_INODE_CHANGED');
        throw e;});
    control=doc.bytes;
  } else {
  const [controlDir,controlFile]=await Promise.all([
    lstat(path.join(root,'.vcp'),{bigint:true}),
    lstat(path.join(root,'.vcp/update.lock'),{bigint:true})
  ]);
  if(!controlDir.isDirectory()||controlDir.isSymbolicLink()||
     controlDir.dev!==proof.stateDev||controlDir.ino!==proof.stateIno||
     !controlFile.isFile()||controlFile.isSymbolicLink()||
     controlFile.dev!==proof.lockDev||controlFile.ino!==proof.lockIno)
    blocked('E_LIFECYCLE_LOCK_INODE_CHANGED');
  control=await readProjectBytes(root,'.vcp/update.lock',{
    managedState:true,maxBytes:4096
  });
  }
  let record;
  try{record=JSON.parse(control.toString('utf8'));}
  catch{blocked('E_LIFECYCLE_LOCK_PAYLOAD_CHANGED');}
  if(record?.version!==2||record.mode!==lock.mode||
     record.token!==lock.token||record.pid!==process.pid||
     (record.operationId??null)!==(lock.operationId??null)||
     (lock.mode==='adopt'&&
       record.consentFingerprint!==lock.consentFingerprint))
    blocked('E_LIFECYCLE_LOCK_PAYLOAD_CHANGED');
  return Object.freeze({root,mode:lock.mode,
    operationId:lock.operationId,liveOwner:true});
}
export async function inspectOwnedAdoptionBootstrap(rootPath,lock) {
  const root=path.resolve(rootPath);
  if(!lock||!activeOwnedBootstraps.has(lock)||lock.root!==root||
    lock.mode!=='adopt'||lock.released===true)
    blocked('E_ADOPTION_LOCK_NOT_OWNED');
  await assertOwnedLifecycleLock(root,lock,{
    mode:'adopt',transactionId:lock.operationId
  });
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
  const provider=anchoredProviderOrNull();
  let bootstrapOwned=false;
  if(!vcpPresent) {
    if(provider) {
      try{
        await provider.createDirectory(root,'.vcp',0o700);
        bootstrapOwned=true;
      }
      catch(e){
        if(e.code==='E_FS_OS_ERROR'&&/EEXIST/.test(e.message))
          blocked('E_STATE_BOOTSTRAP_RACE');
        throw e;
      }
    } else {
      try{
        await mkdir(stateDir,{mode:0o700});
        bootstrapOwned=true;
        await syncContainingDirectory(stateDir);
      }
      catch(e){if(e.code==='EEXIST')blocked('E_STATE_BOOTSTRAP_RACE');throw e;}
    }
  }
  // Anchored mode: capture the transaction anchor for the state dir
  // before creating the lock; every later lock operation carries it.
  const anchor=provider?
    await provider.anchorIdentities(root,'.vcp'):null;
  const stateProof=await lstat(stateDir,{bigint:true});
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
  let identity=null;
  if(provider) {
    // verify the anchor names the same state dir the path checks saw
    if(anchor.parent.dev!==stateProof.dev.toString()||
       anchor.parent.ino!==stateProof.ino.toString())
      blocked('E_STATE_BOOTSTRAP_CHANGED');
    try {
      const created=await provider.writeFileSynced(
        root,'.vcp/update.lock',bytes,0o600);
      identity={dev:BigInt(created.dev),ino:BigInt(created.ino)};
    }catch(e) {
      if(bootstrapOwned) {
        try{await provider.removeEmptyDirectory(root,'.vcp',
          {root:anchor.root});}
        catch(clean){
          if(!['E_FS_OS_ERROR'].includes(clean.code))throw clean;}
      }
      if(e.code==='E_FS_DESTINATION_EXISTS')
        blocked('E_LOCK_ALREADY_HELD');
      throw e;
    }
  } else {
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
  identity=await handle.stat({bigint:true});
  await handle.close();
  }
  // Phase N+2 (R-2): re-verify the pinned state directory AFTER lock
  // creation. A .vcp substitution that landed during creation must
  // not leave this process holding a lock in a foreign namespace:
  // remove only the file this call created (inode-proven) and refuse.
  {
    const stateAfter=await lstat(stateDir,{bigint:true});
    if(!stateAfter.isDirectory()||stateAfter.isSymbolicLink()||
       stateAfter.dev!==stateProof.dev||stateAfter.ino!==stateProof.ino) {
      try {
        const cur=await lstat(lockPath,{bigint:true});
        if(cur.dev===identity.dev&&cur.ino===identity.ino)
          await unlink(lockPath);
      } catch {}
      blocked('E_STATE_BOOTSTRAP_CHANGED');
    }
  }
  let released=false;
  const owned={
    root,mode,bootstrapOwned,token,lockPath,
    operationId,consentFingerprint,anchored:provider!==null,
    get released(){return released;},
    async release() {
      if(released)return;
      if(provider) {
        // Anchored release: every step carries the transaction
        // anchor; the unlink itself verifies root+state+lock
        // identity inside the helper, so a substituted lock file
        // can never be the object unlinked (no check/use window).
        const stateNow=await provider.statIdentity(root,'.vcp',
          {root:anchor.root}).catch(()=>null);
        if(!stateNow||stateNow.devExact!==anchor.parent.dev||
           stateNow.inoExact!==anchor.parent.ino)
          blocked('E_STATE_BOOTSTRAP_CHANGED');
        const expect={root:anchor.root,parent:anchor.parent,
          file:{dev:identity.dev.toString(),
                ino:identity.ino.toString()}};
        const doc=await provider.readFileVerified(
          root,'.vcp/update.lock',expect).catch((e)=>{
            if(e.code==='E_FS_IDENTITY_CHANGED')
              blocked('E_LOCK_OWNERSHIP');
            if(e.code==='E_FS_OS_ERROR')blocked('E_LOCK_OWNERSHIP');
            throw e;});
        if(!doc.bytes.equals(bytes))blocked('E_LOCK_MODIFIED');
        await provider.deleteFile(root,'.vcp/update.lock',expect)
          .catch((e)=>{
            if(e.code==='E_FS_IDENTITY_CHANGED')
              blocked('E_LOCK_CHANGED');
            throw e;});
        released=true;
        activeOwnedBootstraps.delete(owned);
        activeLifecycleLocks.delete(owned);
        ownedLockInodes.delete(owned);
        await provider.syncDirectory(root,'.vcp');
        return;
      }
      const state=await lstat(stateDir,{bigint:true});
      if(!state.isDirectory()||state.isSymbolicLink()||
         state.dev!==stateProof.dev||state.ino!==stateProof.ino)
        blocked('E_STATE_BOOTSTRAP_CHANGED');
      const selected=await resolveProjectPath(root,lockRel,{
        purpose:'managed-state',mustExist:true
      });
      const before=await lstat(selected,{bigint:true});
      if(!before.isFile()||before.isSymbolicLink()||
        before.dev!==identity.dev||before.ino!==identity.ino)blocked('E_LOCK_OWNERSHIP');
      const fd=await open(selected,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      let current;
      try {
        const st=await fd.stat({bigint:true});
        if(st.dev!==identity.dev||st.ino!==identity.ino)blocked('E_LOCK_OWNERSHIP');
        current=await fd.readFile();
      }finally{await fd.close();}
      if(!current.equals(bytes))blocked('E_LOCK_MODIFIED');
      const again=await lstat(selected,{bigint:true});
      if(again.dev!==identity.dev||again.ino!==identity.ino)blocked('E_LOCK_CHANGED');
      await unlink(selected);
      released=true;
      activeOwnedBootstraps.delete(owned);
      activeLifecycleLocks.delete(owned);
      ownedLockInodes.delete(owned);
      await syncContainingDirectory(selected);
    },
    async cleanupBootstrapIfEmpty() {
      if(!bootstrapOwned||!released)return false;
      if(provider) {
        const cur=await provider.statIdentity(root,'.vcp',
          {root:anchor.root});
        if(cur.devExact!==anchor.parent.dev||
           cur.inoExact!==anchor.parent.ino)
          blocked('E_STATE_BOOTSTRAP_CHANGED');
        const listing=await provider.listNames(root,'.vcp');
        if((listing.names??[]).length!==0)return false;
        try {
          await provider.removeEmptyDirectory(root,'.vcp',
            {root:anchor.root});
          await provider.syncDirectory(root,'.');
          return true;
        }catch(e){
          if(e.code==='E_FS_OS_ERROR')return false;
          throw e;}
      }
      let current;
      try {current=await lstat(stateDir,{bigint:true});}
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
  activeLifecycleLocks.add(owned);
  ownedLockInodes.set(owned,Object.freeze({
    stateDev:stateProof.dev,stateIno:stateProof.ino,
    lockDev:identity.dev,lockIno:identity.ino,
    anchored:provider!==null,
    ...(provider?{provider,anchor}:{})
  }));
  if(mode==='adopt')activeOwnedBootstraps.add(owned);
  return owned;
}
