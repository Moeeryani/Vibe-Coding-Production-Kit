// Stage12 selected-root Task Pack read. Not an authorization to execute
// commands. Retain byte provenance so verify can detect task mutations.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';

const MAX_TASK_BYTES=512*1024;
function violation(code){const e=new Error(code);e.code=code;throw e;}
export async function readProjectTaskPack(root,relative,{maxBytes=MAX_TASK_BYTES}={}) {
  if(!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>MAX_TASK_BYTES) {
    violation('E_TASK_SIZE_LIMIT');
  }
  const file=await resolveProjectPath(root,relative,{purpose:'read-existing',mustExist:true});
  const first=await lstat(file);
  if(!first.isFile()||first.isSymbolicLink()||first.size>maxBytes)violation('E_TASK_NOT_REGULAR');
  const fd=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const opened=await fd.stat();
    if(!opened.isFile()||opened.dev!==first.dev||opened.ino!==first.ino||
      opened.size!==first.size||opened.mtimeMs!==first.mtimeMs)violation('E_TASK_READ_RACE');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const last=await lstat(file);
  if(!last.isFile()||last.isSymbolicLink()||last.dev!==first.dev||
    last.ino!==first.ino||last.size!==first.size||
    last.mtimeMs!==first.mtimeMs||bytes.length>maxBytes)violation('E_TASK_READ_RACE');
  return {content:bytes.toString('utf8'),bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
}
