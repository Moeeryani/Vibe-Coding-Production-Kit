// Stage12 confined exclusive writer for first initialization only.
// All callers must hold an owned lifecycle lock; this is not an atomic
// dirfd/openat security proof on Windows or with hostile concurrent renames.
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';

function deny(code){const e=new Error(code);e.code=code;throw e;}
export async function createOwnedPathExclusively(root,relative,bytes,{
  mode=0o644,managedState=false
}={}) {
  if(!Buffer.isBuffer(bytes)||bytes.length>8*1024*1024)deny('E_EXCLUSIVE_BYTES');
  if(!Number.isInteger(mode)||mode<0||mode>0o777)deny('E_EXCLUSIVE_MODE');
  const purpose=managedState?'managed-state':'write-new';
  const rootDir=path.resolve(root);
  // Validate the full selected-root hierarchy before any mkdir.
  const target=await resolveProjectPath(rootDir,relative,{purpose});
  const segments=relative.split('/');
  let current='';
  for(const segment of segments.slice(0,-1)) {
    current=current?current+'/'+segment:segment;
    const dir=await resolveProjectPath(rootDir,current,{
      purpose:managedState?'managed-state':'write-new'
    }).catch(error=>{
      if(error?.code==='E_VCP_PATH'&&error.message.includes('DESTINATION_EXISTS')) {
        return path.join(rootDir,...current.split('/'));
      }
      throw error;
    });
    let info;
    try{info=await lstat(dir);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(info) {
      if(info.isSymbolicLink()||!info.isDirectory())deny('E_EXCLUSIVE_PARENT');
      continue;
    }
    try{await mkdir(dir,{mode:0o700});}
    catch(error){if(error.code==='EEXIST')deny('E_EXCLUSIVE_PARENT_RACE');throw error;}
  }
  await resolveProjectPath(rootDir,relative,{purpose});
  const fd=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
    (constants.O_NOFOLLOW??0),mode);
  try {
    await fd.writeFile(bytes);
    await fd.sync();
  }finally{await fd.close();}
  // Never chmod after close: a later swapped name could change an unrelated
  // file. The creation mode is set on the exact new file handle.
  return {file:target,relative,size:bytes.length};
}
