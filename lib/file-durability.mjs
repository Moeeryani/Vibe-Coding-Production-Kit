// Stage12 durability acknowledgement for a newly created/replaced file name.
// FileDescriptor.sync alone does not prove persistence of its containing
// directory entry. Unsupported directory fsync MUST fail closed.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';

function block(reason,cause){
  const e=new Error('Lifecycle directory durability is unproven: '+reason);
  e.code='E_DIRECTORY_SYNC_UNPROVEN';
  if(cause)e.cause=cause;
  throw e;
}
export async function syncContainingDirectory(filePath) {
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
