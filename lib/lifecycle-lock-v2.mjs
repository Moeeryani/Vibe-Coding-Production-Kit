// Stage12 scoped lifecycle lock. No stale lock stealing: another writer's
// lock is never removed from this process without exact owner identity.
// This is a candidate requiring Windows-native and adversarial TOCTOU proof.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rmdir, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory, assertLifecycleDurabilitySupported } from './file-durability.mjs';

function blocked(code){const error=new Error(code);error.code=code;throw error;}
export async function acquireLifecycleLock(rootPath,{mode='update'}={}) {
  if(!['init','update','recovery'].includes(mode))blocked('E_LOCK_MODE');
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
  if(mode==='init'&&vcpPresent)blocked('E_INIT_STATE_COLLISION');
  if(mode!=='init'&&!vcpPresent)blocked('E_MANAGED_STATE_ABSENT');
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
  const lockPath=await resolveProjectPath(root,lockRel,{purpose:'managed-state'});
  const token=randomBytes(24).toString('hex');
  const record={version:2,mode,pid:process.pid,host:os.hostname(),token,
    startedAt:new Date().toISOString()};
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
  return {
    root,mode,bootstrapOwned,token,lockPath,
    async release() {
      if(released)return;
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
      await syncContainingDirectory(selected);
    },
    async cleanupBootstrapIfEmpty() {
      if(!bootstrapOwned||!released)return false;
      try{await rmdir(stateDir);return true;}
      catch(e){if(['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))return false;throw e;}
    }
  };
}
