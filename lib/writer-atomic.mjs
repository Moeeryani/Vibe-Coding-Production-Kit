// B-1 Production Writer — unified atomic write engine.
// NEVER direct overwrite. Every mutation follows:
//   temp write -> file fsync -> directory fsync -> atomic rename ->
//   directory fsync -> post-rename hash verify.
// Primitives VERIFY (namespace, durability); the facade AUTHORIZES (gate,
// operation policy). Primitives never call the gate themselves.
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syncContainingDirectory } from './file-durability.mjs';
import { verifyNamespaceContained } from './writer-identity.mjs';

function deny(code,message){
  const e=new Error(code+(message?': '+message:''));
  e.code=code;
  throw e;
}

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// Atomic file write. The target may or may not exist; either way the
// visible state transitions atomically from old to new (never torn).
export async function atomicWriteFile(root,relative,bytes,{
  mode=0o644,managedState=false
}={}){
  if(!Buffer.isBuffer(bytes))deny('E_ATOMIC_BYTES','Content must be a Buffer.');
  if(bytes.length>8*1024*1024)deny('E_ATOMIC_BYTES','Content exceeds 8 MiB.');
  if(!Number.isInteger(mode)||mode<0||mode>0o777)deny('E_ATOMIC_MODE','Bad mode.');
  const rootDir=path.resolve(root);
  // Namespace validation: no `..` escape (resolveProjectPath rejects `..`
  // components outright, so validate components manually for update targets
  // that may already exist).
  const parts=relative.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||path.isAbsolute(p)))
    deny('E_ATOMIC_PATH',`Unsafe relative path: ${relative}.`);
  const target=path.join(rootDir,...parts);
  await verifyNamespaceContained(rootDir,target);
  const dir=path.dirname(target);
  const tmp=path.join(dir,`.vcp-tmp-${process.pid}-${randomBytes(8).toString('hex')}`);
  let handle;
  try{
    handle=await open(tmp,
      constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
      (constants.O_NOFOLLOW??0),mode);
    await handle.writeFile(bytes);
    await handle.sync();           // file fsync
  }finally{
    if(handle)await handle.close();
  }
  try{
    await syncContainingDirectory(tmp); // directory fsync (temp entry)
    await rename(tmp,target);           // atomic commit point
    await syncContainingDirectory(target); // directory fsync (rename)
  }catch(e){
    await unlink(tmp).catch(()=>{});
    throw e;
  }
  // Post-rename verification: what readers see must be exactly what we wrote.
  const check=await lstat(target);
  if(!check.isFile()||check.isSymbolicLink())
    deny('E_ATOMIC_VERIFY','Target is not a regular file after rename.');
  const fh=await open(target,'r');
  try{
    const seen=await fh.readFile();
    if(sha256(seen)!==sha256(bytes))
      deny('E_ATOMIC_VERIFY','Content mismatch after atomic rename.');
  }finally{
    await fh.close();
  }
  return {path:target,sha256:sha256(bytes)};
}

// Manifest update is always the LAST mutation of a transaction.
export async function atomicWriteManifest(root,manifestBytes,{expectedHash=null}={}){
  if(expectedHash&&sha256(manifestBytes)!==expectedHash)
    deny('E_ATOMIC_MANIFEST_HASH','Manifest bytes do not match expected hash.');
  return atomicWriteFile(root,'.vcp/manifest.json',manifestBytes,{
    mode:0o600,managedState:true
  });
}
