// Shared bounded selected-root file reader for Stage12 planning.
// No-follow leaf handles and identity rechecks; no openat/dirfd race guarantee.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';

const DEFAULT_LIMIT=8*1024*1024;
function refuse(code){const e=new Error(code);e.code=code;throw e;}
export async function readProjectBytes(root,relative,{
  managedState=false,optional=false,maxBytes=DEFAULT_LIMIT
}={}) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>DEFAULT_LIMIT)refuse('E_READ_LIMIT');
  let filename;
  try {
    filename=await resolveProjectPath(root,relative,{
      purpose:managedState?'managed-state':'read-existing',mustExist:true
    });
  }catch(e) {
    if(optional&&e?.code==='E_VCP_PATH'&&e.message.includes('MISSING_INPUT'))return null;
    // A missing intermediate directory also means the optional asset does
    // not yet exist; never turn a missing desired path into a false conflict.
    if(optional&&e?.code==='E_VCP_PATH'&&e.message.includes('ROOT_MISSING'))return null;
    throw e;
  }
  const first=await lstat(filename);
  if(!first.isFile()||first.isSymbolicLink()||first.size>maxBytes)refuse('E_PROJECT_FILE_UNSAFE');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const live=await fd.stat();
    if(!live.isFile()||live.dev!==first.dev||live.ino!==first.ino||
      live.size!==first.size||live.mtimeMs!==first.mtimeMs)refuse('E_PROJECT_READ_RACE');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const last=await lstat(filename);
  if(!last.isFile()||last.isSymbolicLink()||last.dev!==first.dev||
    last.ino!==first.ino||last.size!==first.size||
    last.mtimeMs!==first.mtimeMs||bytes.length>maxBytes)refuse('E_PROJECT_READ_RACE');
  return bytes;
}
