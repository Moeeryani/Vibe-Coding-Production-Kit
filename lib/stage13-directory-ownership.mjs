// Stage13 project-directory provenance planning.
// No user-project mkdir ever happens here. The first missing ancestor of
// a desired file must be created inside owned transaction staging, then
// moved as a whole directory with kernel RENAME_NOREPLACE; otherwise a
// crash can leave unattributed empty directories in an unmanaged project.
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import {resolveProjectPath} from './safe-path.mjs';
import {validManagedRelative} from './manifest-v2.mjs';

function reject(code){const e=new Error(code);e.code=code;throw e;}
const isAncestor=(a,b)=>b.startsWith(a+'/');
const sorted=(xs)=>[...new Set(xs)].sort((a,b)=>
  a.split('/').length-b.split('/').length||a.localeCompare(b));
export function classifyStage13DirectoryTopology({
  files,existingDirectories,missingDirectories
}={}) {
  if(!Array.isArray(files)||!(existingDirectories instanceof Map)||
     !(missingDirectories instanceof Set))reject('E_STAGE13_DIRECTORY_INPUT');
  const claimed=[],roots=new Set(),planned=new Set();
  for(const file of files) {
    if(!validManagedRelative(file))reject('E_STAGE13_DIRECTORY_PATH');
    const pieces=file.split('/');
    let missingRoot=null;
    for(let i=1;i<pieces.length;i++) {
      const parent=pieces.slice(0,i).join('/');
      if(missingDirectories.has(parent)) {
        planned.add(parent);
        if(!missingRoot)missingRoot=parent;
      }else if(!existingDirectories.has(parent)) {
        reject('E_STAGE13_DIRECTORY_UNPROVEN');
      }else if(missingRoot) {
        // Once an ancestor is absent, its descendants cannot already
        // exist in the physical project namespace.
        reject('E_STAGE13_DIRECTORY_TOPOLOGY_CONFLICT');
      }
    }
    if(missingRoot)roots.add(missingRoot);
    claimed.push(Object.freeze({path:file,
      firstMissingAncestor:missingRoot,
      stageGroup:missingRoot??null}));
  }
  const newRoots=sorted([...roots]);
  if(newRoots.some((r,i)=>newRoots.some((s,j)=>i!==j&&isAncestor(s,r))))
    reject('E_STAGE13_DIRECTORY_ROOT_OVERLAP');
  return Object.freeze({
    readOnly:true,executionAuthorized:false,
    projectRootsToMove:newRoots,
    plannedCreatedDirectories:sorted([...planned]),
    claims:claimed,
    requiresStagedNativeNoReplace:newRoots.length>0
  });
}
export async function inspectStage13DirectoryTopology(rootPath,claimPaths) {
  const root=path.resolve(rootPath??'.');
  if(!Array.isArray(claimPaths)||claimPaths.length>64)
    reject('E_STAGE13_DIRECTORY_LIMIT');
  const existing=new Map(),missing=new Set();
  const fileNames=new Set(claimPaths);
  for(const relative of claimPaths) {
    if(!validManagedRelative(relative))reject('E_STAGE13_DIRECTORY_PATH');
    const pieces=relative.split('/');
    for(let i=1;i<pieces.length;i++) {
      const parent=pieces.slice(0,i).join('/');
      if(fileNames.has(parent))reject('E_STAGE13_DIRECTORY_FILE_COLLISION');
      if(existing.has(parent)||missing.has(parent))continue;
      await resolveProjectPath(root,parent+'/.__vcp_stage13_probe__',{
        purpose:'write-new'
      });
      let stat;
      try {stat=await lstat(path.join(root,...parent.split('/')));}
      catch(e){if(e.code!=='ENOENT')throw e;}
      if(!stat)missing.add(parent);
      else if(!stat.isDirectory()||stat.isSymbolicLink())
        reject('E_STAGE13_DIRECTORY_UNSAFE');
      else existing.set(parent,Object.freeze({
        dev:String(stat.dev),ino:String(stat.ino),
        mode:stat.mode&0o777
      }));
    }
  }
  const result=classifyStage13DirectoryTopology({
    files:claimPaths,existingDirectories:existing,missingDirectories:missing
  });
  return Object.freeze({...result,root,existingDirectories:existing});
}
export function stage13ClaimStagingPath(id,claim,topology) {
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id??''))
    reject('E_STAGE13_DIRECTORY_ID');
  if(!topology||!Array.isArray(topology.claims))
    reject('E_STAGE13_DIRECTORY_INPUT');
  const candidate=topology.claims.find(v=>v.path===claim);
  if(!candidate)reject('E_STAGE13_UNKNOWN_CLAIM');
  return candidate.firstMissingAncestor
    ? '.vcp/stage/'+id+'/dirs/'+claim
    : '.vcp/stage/'+id+'/files/'+claim;
}
export function validateOwnedDirectoryProvenance(entries,observed) {
  if(!Array.isArray(entries)||!(observed instanceof Map))
    reject('E_STAGE13_DIRECTORY_EVIDENCE');
  for(const entry of entries) {
    if(!validManagedRelative(entry.path)||
       !/^[0-9]{1,22}$/.test(entry.dev??'')||
       !/^[0-9]{1,22}$/.test(entry.ino??'')||
       !['stage13-created-directory'].includes(entry.kind))
      reject('E_STAGE13_DIRECTORY_LEDGER');
    const actual=observed.get(entry.path);
    if(String(actual?.dev)!==entry.dev||
       String(actual?.ino)!==entry.ino)
      reject('E_STAGE13_CREATED_DIRECTORY_REPLACED');
  }
  return Object.freeze({readOnly:true,validatedDirectories:entries.length,
    authorized:false,requiresOwnedDirectoryHandle:true});
}
