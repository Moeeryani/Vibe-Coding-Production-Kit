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
//
// ALLOW-LIST, not a deny-list. The previous form refused only 'win32' and
// reported everything else as durable, so an unset, mistyped, or future
// platform value (undefined, 'windows', 'WIN32') silently claimed directory
// fsync support. Anything without a reviewed provider is now unproven.
const DURABLE_PLATFORMS = Object.freeze(['linux']);
export function lifecycleDurabilityCapability(platform=process.platform) {
  // Allow-list FIRST. Testing 'win32' before the allow-list made falsy-but-not
  // win32 values (null, '') report a Windows-specific reason, misattributing
  // the cause of a refusal on any non-Windows host. An explicitly passed
  // `undefined` still hits the default-parameter path (process.platform) —
  // that is JavaScript semantics, not a Windows claim.
  if(DURABLE_PLATFORMS.includes(platform))return Object.freeze({
    supported:true,reason:'DIRECTORY_FSYNC_PROBE_REQUIRED',
    requiresNativeProof:false
  });
  if(platform==='win32')return Object.freeze({
    supported:false,reason:'WINDOWS_NAMESPACE_DURABILITY_UNPROVEN',
    requiresNativeProof:true
  });
  return Object.freeze({
    supported:false,reason:'NAMESPACE_DURABILITY_PROVIDER_UNREVIEWED',
    requiresNativeProof:true
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
