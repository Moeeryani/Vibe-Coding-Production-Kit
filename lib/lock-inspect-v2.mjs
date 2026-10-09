// Stage12 read-only lock owner assessment. A missing/dead PID is not, by
// itself, permission to unlink: PID reuse and foreign-host locks require an
// independent exact-identity, human-owned recovery decision.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import os from 'node:os';
import { resolveProjectPath } from './safe-path.mjs';

const MAX_LOCK_BYTES=8192;
const sha=b=>createHash('sha256').update(b).digest('hex');
function isObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function localPidAlive(pid) {
  if(!Number.isSafeInteger(pid)||pid<=0)return null;
  try{process.kill(pid,0);return true;}
  catch(e){if(e.code==='ESRCH')return false;return null;}
}
export async function inspectLifecycleLock(root) {
  let filename;
  try {
    filename=await resolveProjectPath(root,'.vcp/update.lock',{
      purpose:'managed-state',mustExist:true
    });
  }catch(e) {
    if(e?.code==='E_VCP_PATH'&&e.message.includes('MISSING_INPUT')) {
      return {present:false,retirementAuthorized:false};
    }
    return {present:true,blocked:true,reason:e.code??'E_LOCK_PATH',
      retirementAuthorized:false};
  }
  try {
    const first=await lstat(filename);
    if(!first.isFile()||first.isSymbolicLink()||first.size>MAX_LOCK_BYTES)
      return {present:true,blocked:true,reason:'E_LOCK_UNSAFE',retirementAuthorized:false};
    const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    let bytes;
    try {
      const current=await fd.stat();
      if(!current.isFile()||current.dev!==first.dev||current.ino!==first.ino||
        current.size!==first.size||current.mtimeMs!==first.mtimeMs)
        throw new Error('E_LOCK_RACE');
      bytes=await fd.readFile();
    }finally{await fd.close();}
    const last=await lstat(filename);
    if(!last.isFile()||last.isSymbolicLink()||last.dev!==first.dev||
      last.ino!==first.ino||last.size!==first.size||
      last.mtimeMs!==first.mtimeMs||bytes.length>MAX_LOCK_BYTES)
      throw new Error('E_LOCK_RACE');
    let record;
    try{record=JSON.parse(bytes.toString('utf8'));}
    catch{return {present:true,blocked:true,reason:'E_LOCK_CORRUPT',
      lockSha256:sha(bytes),retirementAuthorized:false};}
    if(!isObject(record)||record.version!==2||typeof record.token!=='string'||
      !/^[a-f0-9]{48}$/.test(record.token)||
      !['init','update','recovery'].includes(record.mode)||
      typeof record.host!=='string'||!record.host||
      !Number.isSafeInteger(record.pid)||record.pid<=0) {
      return {present:true,blocked:true,reason:'E_LOCK_FORMAT',
        lockSha256:sha(bytes),retirementAuthorized:false};
    }
    const sameHost=record.host===os.hostname();
    const ownerAlive=sameHost?localPidAlive(record.pid):null;
    return {
      present:true,formatVersion:2,mode:record.mode,
      lockSha256:sha(bytes),sameHost,ownerAlive,
      assessment:ownerAlive===true?'LIVE_OWNER':ownerAlive===false
        ?'OWNER_PROCESS_NOT_PRESENT':'OWNER_NOT_VERIFIABLE',
      requiredAction:ownerAlive===false?'EXPLICIT_OWNER_REVIEW':
        'KEEP_LOCK_AND_RESOLVE_PROVENANCE',
      retirementAuthorized:false
    };
  }catch(e) {
    return {present:true,blocked:true,reason:e.code??e.message??'E_LOCK_INSPECTION',
      retirementAuthorized:false};
  }
}
