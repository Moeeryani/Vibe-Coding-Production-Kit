// Stage12 OS namespace boundary. Deliberately NO FALLBACK to fs.rename:
 // a separate lstat(destination) followed by rename is a TOCTOU race and
 // ordinary POSIX rename can replace an existing empty directory.
 // No native provider has passed independent Linux/NTFS durability,
 // no-replace and path/ACL attestation yet. Keep source-only callers blocked.
import path from 'node:path';

function refuse(code) {
  const error=new Error(code);error.code=code;throw error;
}
export function planNoReplaceMove({source,destination,root,platform=process.platform}={}) {
  if(typeof source!=='string'||typeof destination!=='string'||
     typeof root!=='string')refuse('E_NAMESPACE_ARGUMENTS');
  const base=path.resolve(root),from=path.resolve(source),to=path.resolve(destination);
  const prefix='.'+path.basename(base)+'.vcp-recovery-retired-';
  const archiveName=path.basename(to);
  const suffix=archiveName.startsWith(prefix)?
    archiveName.slice(prefix.length):'';
  if(from!==path.join(base,'.vcp')||
     path.dirname(to)!==path.dirname(base)||
     from===to||to===base||
     !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}-[a-f0-9]{40}$/.test(suffix)) {
    refuse('E_NAMESPACE_SCOPE');
  }
  if(!['win32','linux','darwin'].includes(platform))refuse('E_NATIVE_PROVIDER_UNSUPPORTED');
  return Object.freeze({
    source:from,destination:to,platform,
    operation:'ATOMIC_DIRECTORY_RENAME_NOREPLACE',
    requiresNativeProvider:true,
    requiresSameVolume:true,requiresDurableParentAck:true,
    requiresNoReparseTraversal:true,
    siblingWriteScopeApprovalRequired:true,
    authorized:false
  });
}
export async function moveDirectoryNoReplace(args={}) {
  planNoReplaceMove(args);
  // A no-replace primitive must bind source and target to trustworthy
  // directory handles, enforce atomic destination non-existence *inside*
  // the OS operation, and return only after an independently proven
  // namespace durability acknowledgement. Absent that: no writes.
  refuse('E_NATIVE_NOREPLACE_UNAVAILABLE');
}
