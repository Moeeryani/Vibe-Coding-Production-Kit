// Stage12 durability acknowledgement for a newly created/replaced file name.
// FileDescriptor.sync alone does not prove persistence of its containing
// directory entry. Unsupported directory fsync MUST fail closed.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';

// A successful file-handle flush is not proof that a renamed directory
// entry survives power loss. On Windows/NTFS Node directory fsync has already
// failed natively; reject the write transaction before its first mutation.
// This boundary is intentionally not a Windows durability implementation.
export function lifecycleDurabilityCapability(platform=process.platform) {
  if(platform==='win32')return Object.freeze({
    supported:false,reason:'WINDOWS_NAMESPACE_DURABILITY_UNPROVEN',
    requiresNativeProof:true
  });
  return Object.freeze({
    supported:true,reason:'DIRECTORY_FSYNC_PROBE_REQUIRED',
    requiresNativeProof:false
  });
}

export async function assertLifecycleDurabilitySupported(projectRoot) {
  const capability=lifecycleDurabilityCapability();
  if(!capability.supported)block(capability.reason);
  // Probe the existing project root without creating any staging content.
  // Each real namespace mutation must still fsync its actual parent.
  await syncContainingDirectory(path.join(path.resolve(projectRoot),
    '.__vcp_durability_probe__'));
  return {preflightOnly:true,capability};
}

function block(reason,cause){
  const e=new Error('Lifecycle directory durability is unproven: '+reason);
  e.code='E_DIRECTORY_SYNC_UNPROVEN';
  if(cause)e.cause=cause;
  throw e;
}
export async function syncContainingDirectory(filePath) {
  if(!lifecycleDurabilityCapability().supported) {
    block('WINDOWS_NAMESPACE_DURABILITY_UNPROVEN');
  }
  const dir=path.dirname(path.resolve(filePath));
  let first;
  try{first=await lstat(dir);}
  catch(e){block('missing or unreadable parent',e);}
  if(!first.isDirectory()||first.isSymbolicLink())block('unsafe parent directory');
  let handle;
  try{
    handle=await open(dir,constants.O_RDONLY|(constants.O_DIRECTORY??0)|
      (constants.O_NOFOLLOW??0));
  }catch(e){block('directory handle unavailable on this platform',e);}
  try{
    const opened=await handle.stat();
    if(!opened.isDirectory()||opened.dev!==first.dev||opened.ino!==first.ino)
      block('directory identity changed');
    try {await handle.sync();}
    catch(e){block('directory metadata sync unsupported',e);}
    const after=await lstat(dir);
    if(!after.isDirectory()||after.isSymbolicLink()||
      after.dev!==first.dev||after.ino!==first.ino) {
      block('directory changed after sync');
    }
  }finally{await handle.close();}
  return {directorySynced:true};
}
