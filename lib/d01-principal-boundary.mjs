// D-01 Stage12 OS-principal separation preflight (read only).
//
// This cannot certify a legacy-CLI fence. In particular, POSIX mode bits
// cannot distinguish two binaries executing under the SAME UID, and the
// Windows DACL/privilege model cannot be inferred from Node's mode values.
// No output from this module may ever authorize a schema-v2 mutation.
import {lstat} from 'node:fs/promises';
import path from 'node:path';

const PORTABLE=/^[A-Za-z0-9._-]{1,128}$/;
function refusal(code,detail=''){
  const e=new Error(code+(detail?': '+detail:''));
  e.code=code;
  throw e;
}
function requireUid(value,code){
  if(!Number.isSafeInteger(value)||value<0)refusal(code);
  return value;
}
function validatePath(root,relative){
  if(typeof relative!=='string'||relative.length<1||
     relative.length>1024||relative.includes('\\')||
     path.posix.isAbsolute(relative))refusal('E_D01_PROTECTED_PATH');
  const parts=relative.split('/');
  if(parts.length>32||parts.some(x=>!PORTABLE.test(x)||
    x==='.'||x==='..'))refusal('E_D01_PROTECTED_PATH');
  const resolved=path.resolve(root,...parts);
  if(resolved===root||!resolved.startsWith(root+path.sep))
    refusal('E_D01_PROTECTED_PATH');
  return {relative,full:resolved};
}
function writableBy({uid,gid,mode},legacyUid,legacyGids){
  if(uid===legacyUid)return (mode&0o200)!==0;
  if(legacyGids.includes(gid))return (mode&0o020)!==0;
  return (mode&0o002)!==0;
}
function add(issues,code,relative){
  if(!issues.some(i=>i.code===code&&i.path===relative))
    issues.push(Object.freeze({code,path:relative}));
}
function requireStats(stats){
  if(!stats||typeof stats!=='object'||Array.isArray(stats)||
     !['file','directory','symlink','other','missing'].includes(stats.type))
    refusal('E_D01_STAT_INVALID');
  if(stats.type!=='missing'&&(
    !Number.isSafeInteger(stats.uid)||stats.uid<0||
    !Number.isSafeInteger(stats.gid)||stats.gid<0||
    !Number.isSafeInteger(stats.mode)||stats.mode<0||stats.mode>0o7777||
    !Number.isSafeInteger(stats.nlink)||stats.nlink<1))
  )refusal('E_D01_STAT_INVALID');
  return stats;
}
const authoritative=false;

// Snapshots are descriptive, never authoritative. An attacker can replace
// files or change ACLs after inspection, and this function has no ability to
// attest the identity/privileges of the published 0.9.3 process.
export function assessLegacyPrincipalBoundary({
  platform,legacyUid,legacyGids=[],writerUid,entries
}={}){
  if(!Array.isArray(entries)||entries.length===0)
    refusal('E_D01_ENTRIES_REQUIRED');
  if(!['linux','darwin','win32'].includes(platform))
    refusal('E_D01_PLATFORM');
  requireUid(legacyUid,'E_D01_LEGACY_PRINCIPAL_REQUIRED');
  requireUid(writerUid,'E_D01_WRITER_PRINCIPAL_REQUIRED');
  if(!Array.isArray(legacyGids)||
     legacyGids.some(g=>!Number.isSafeInteger(g)||g<0))
    refusal('E_D01_LEGACY_GROUPS_REQUIRED');
  const issues=[];
  if(platform!=='linux')
    add(issues,'E_D01_NATIVE_OS_ACCESS_CHECK_REQUIRED','.');
  if(legacyUid===writerUid)
    add(issues,'E_D01_SAME_OS_PRINCIPAL','.');
  if(legacyUid===0||writerUid===0)
    add(issues,'E_D01_PRIVILEGED_PRINCIPAL_UNPROVEN','.');
  const seen=new Set();
  for(const entry of entries){
    if(!entry||typeof entry.path!=='string'||entry.path.length>2048||
       !['parent','protected'].includes(entry.role))
      refusal('E_D01_ENTRIES_FORMAT');
    if(seen.has(entry.path))refusal('E_D01_DUPLICATE_PATH');
    seen.add(entry.path);
    const stats=requireStats(entry.stat);
    if(stats.type==='missing'){
      add(issues,'E_D01_PATH_MISSING',entry.path);
      continue;
    }
    if(stats.type==='symlink'||stats.type==='other'){
      add(issues,'E_D01_UNSAFE_OBJECT_TYPE',entry.path);
      continue;
    }
    if(entry.role==='parent'&&stats.type!=='directory')
      add(issues,'E_D01_PARENT_NOT_DIRECTORY',entry.path);
    if(entry.role==='protected'&&stats.type!=='directory'&&
       stats.type!=='file')
      add(issues,'E_D01_UNSAFE_OBJECT_TYPE',entry.path);
    if(stats.nlink>1&&stats.type==='file')
      add(issues,'E_D01_HARDLINK_ALIAS_UNPROVEN',entry.path);
    // Being the file owner lets the old principal chmod it to writable
    // even if its CURRENT mode is 0400. Parent ownership is equally bad:
    // chmod on the directory can reopen rename/unlink of every child.
    if(stats.uid===legacyUid)
      add(issues,'E_D01_LEGACY_OWNS_PROTECTED_NAMESPACE',entry.path);
    if(platform==='linux'&&writableBy(stats,legacyUid,legacyGids)){
      add(issues,entry.role==='parent'
        ?'E_D01_LEGACY_CAN_REPLACE_NAMESPACE_ENTRY'
        :'E_D01_LEGACY_CAN_MODIFY_PROTECTED_OBJECT',entry.path);
    }
  }
  if(!entries.some(e=>e.role==='parent')||
     !entries.some(e=>e.role==='protected'))
    add(issues,'E_D01_INCOMPLETE_NAMESPACE_INVENTORY','.');
  return Object.freeze({
    status:'NO_GO',
    source:'D01_READ_ONLY_NAMESPACE_PREFLIGHT',
    osEnforcementAttested:authoritative,
    oldPackageExecutionVerified:false,
    productionWriterAuthorized:false,
    mayProceedToSeparateNativeProof:issues.length===0,
    issues:Object.freeze(issues),
    residualRequirements:Object.freeze([
      'independent native token/UID and old-0.9.3 command execution proof',
      'no old-principal rename/unlink/replacement of protected ancestors',
      'all published 0.9.3 entrypoints, absent-manifest init and rollback',
      'writer privilege containment, concurrency, crash and power-loss proof',
      'new explicit D-01 maintainer GO approval'
    ])
  });
}
function pathsFromRoot(abs,protectedPaths){
  const ancestors=[];
  let cur=abs;
  // Include the parent of the selected root, where renaming the entire
  // root is possible even if its contents are read-only to the old UID.
  while(true){
    ancestors.push(cur);
    const parent=path.dirname(cur);
    if(parent===cur)break;
    cur=parent;
  }
  for(const {full} of protectedPaths){
    let parent=path.dirname(full);
    while(parent!==abs&&parent.startsWith(abs+path.sep)){
      ancestors.push(parent);
      parent=path.dirname(parent);
    }
  }
  return [...new Set(ancestors)].sort();
}
async function statPath(full){
  try{
    const s=await lstat(full);
    return {type:s.isSymbolicLink()?'symlink':
      s.isDirectory()?'directory':s.isFile()?'file':'other',
      uid:s.uid,gid:s.gid,mode:s.mode&0o7777,nlink:s.nlink};
  }catch(e){
    if(e?.code==='ENOENT')return {type:'missing'};
    throw e;
  }
}

// Actual no-write filesystem walk. Never modifies modes, ownership,
// Windows DACLs or protects a real selected project by side effect.
export async function inspectLegacyPrincipalBoundary(root,{
  protectedPaths=['.vcp'],legacyUid,legacyGids=[],writerUid,
  platform=process.platform
}={}){
  if(typeof root!=='string'||!path.isAbsolute(root))
    refusal('E_D01_ROOT_ABSOLUTE_REQUIRED');
  if(!Array.isArray(protectedPaths)||protectedPaths.length===0)
    refusal('E_D01_PROTECTED_PATH');
  const abs=path.resolve(root);
  if(abs===path.parse(abs).root)refusal('E_D01_ROOT_UNSAFE');
  const protectedItems=protectedPaths.map(p=>validatePath(abs,p));
  const ancestors=pathsFromRoot(abs,protectedItems);
  const entries=[];
  for(const ancestor of ancestors)
    entries.push({path:ancestor,role:'parent',stat:await statPath(ancestor)});
  for(const item of protectedItems)
    entries.push({path:item.full,role:'protected',stat:await statPath(item.full)});
  return Object.freeze({
    root:abs,inspectedPaths:Object.freeze(entries.map(e=>e.path)),
    ...assessLegacyPrincipalBoundary({
      platform,legacyUid,legacyGids,writerUid,entries
    })
  });
}
