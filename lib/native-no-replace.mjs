// Stage12 OS namespace boundary. Deliberately NO FALLBACK to fs.rename:
// a separate lstat(destination) followed by rename is a TOCTOU race and
// ordinary POSIX rename can replace an existing empty directory.
// On Linux the move is executed by the native dirfd-bound provider
// (renameat2 with RENAME_NOREPLACE). On every other platform, or when the
// native helper is unavailable, the operation stays refused with
// E_NATIVE_NOREPLACE_UNAVAILABLE: no silent overwrite-capable fallback.
import path from 'node:path';
import { LinuxFsProvider } from './linux-fs-provider.mjs';

function refuse(code) {
  const error=new Error(code);error.code=code;throw error;
}
function selectNoReplaceProvider(platform) {
  // Linux-only production provider. win32/darwin stay fail-closed until a
  // reviewed native provider with independent durability proof exists.
  if(platform!=='linux')refuse('E_NATIVE_NOREPLACE_UNAVAILABLE');
  return new LinuxFsProvider();
}
export function planNoReplaceMove({source,destination,root,platform=process.platform}={}) {
  if(typeof source!=='string'||typeof destination!=='string'||
     typeof root!=='string')refuse('E_NAMESPACE_ARGUMENTS');
  const base=path.resolve(root),from=path.resolve(source),to=path.resolve(destination);
  const archiveName=path.basename(to);
  // Two scoped destinations are allowed, nothing else:
  //  * in-root (default): <root>/.vcp-recovery-retired-<backupId>-<40hex>
  //    stays inside the authorized selected-root write scope;
  //  * sibling (explicit approval): <parent>/.<basename>.vcp-recovery-retired-<backupId>-<40hex>.
  const inRootScope=path.dirname(to)===base&&
    /^\.vcp-recovery-retired-[A-Za-z0-9][A-Za-z0-9._-]{0,127}-[a-f0-9]{40}$/.test(archiveName);
  const siblingPrefix='.'+path.basename(base)+'.vcp-recovery-retired-';
  const siblingSuffix=archiveName.startsWith(siblingPrefix)?
    archiveName.slice(siblingPrefix.length):'';
  const siblingScope=path.dirname(to)===path.dirname(base)&&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}-[a-f0-9]{40}$/.test(siblingSuffix);
  if(from!==path.join(base,'.vcp')||from===to||to===base||
     (!inRootScope&&!siblingScope)) {
    refuse('E_NAMESPACE_SCOPE');
  }
  if(!['win32','linux','darwin'].includes(platform))refuse('E_NATIVE_PROVIDER_UNSUPPORTED');
  return Object.freeze({
    source:from,destination:to,platform,
    scope:inRootScope?'in-root':'sibling',
    operation:'ATOMIC_DIRECTORY_RENAME_NOREPLACE',
    requiresNativeProvider:true,
    requiresSameVolume:true,requiresDurableParentAck:true,
    requiresNoReparseTraversal:true,
    siblingWriteScopeApprovalRequired:!inRootScope,
    authorized:false
  });
}
export async function moveDirectoryNoReplace(args={}) {
  const plan=planNoReplaceMove(args);
  // A no-replace primitive must bind source and target to trustworthy
  // directory handles, enforce atomic destination non-existence *inside*
  // the OS operation, and return only after an independently proven
  // namespace durability acknowledgement. Absent that: no writes.
  const provider=selectNoReplaceProvider(plan.platform);
  const root=path.resolve(args.root);
  // Re-derive helper-relative names from the validated plan. The plan
  // pins source to <root>/.vcp and destination to a sibling archive name
  // or an in-root reserved archive name; both stay beneath pinned fds.
  const rel=abs=>path.relative(root,abs).split(path.sep).join('/');
  let sourceRel=rel(plan.source),destRel=rel(plan.destination);
  let destRoot=root;
  if(destRel.startsWith('../')) {
    // Sibling archive: the move crosses into the parent directory. The
    // helper pins --root to the parent and both names stay relative.
    destRoot=path.dirname(root);
    sourceRel=path.basename(root)+'/'+sourceRel;
    destRel=path.basename(plan.destination);
  }
  let receipt;
  try {
    receipt=await provider.moveNoReplace(destRoot,sourceRel,destRel);
  } catch(error) {
    // Preserve the historical refusal code when no native move was
    // possible, so fail-closed callers keep their exact behavior.
    if(error?.code==='E_NATIVE_HELPER_MISSING'||
       error?.code==='E_FS_NOREPLACE_UNSUPPORTED')
      refuse('E_NATIVE_NOREPLACE_UNAVAILABLE');
    throw error;
  }
  if(receipt?.srcParentSynced!==true||receipt?.dstParentSynced!==true) {
    // "Move succeeded but sync failed" is an explicit detached-evidence
    // state, never a durable completion. The caller owns the evidence.
    const state=new Error('E_NOREPLACE_SYNC_UNPROVEN');
    state.code='E_NOREPLACE_SYNC_UNPROVEN';
    state.receipt=receipt;
    throw state;
  }
  return Object.freeze({
    operation:'ATOMIC_DIRECTORY_RENAME_NOREPLACE',
    source:plan.source,destination:plan.destination,
    srcParentSynced:true,dstParentSynced:true,
  });
}
