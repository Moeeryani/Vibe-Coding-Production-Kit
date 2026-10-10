// Exact-preimage replacement for explicit user-approved non-lifecycle output.
// This does not relax schema-v2 G-FENCE or authorize a stale preview to apply.
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { syncContainingDirectory, assertLifecycleDurabilitySupported } from './file-durability.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
function reject(code){const e=new Error(code);e.code=code;throw e;}
export async function replaceProjectFileIfUnchanged(root,relative,replacement,{
  expectedHash,mode=null
}={}) {
  if(!Buffer.isBuffer(replacement)||replacement.length>8*1024*1024)
    reject('E_OUTPUT_SIZE');
  if(typeof expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(expectedHash))
    reject('E_OUTPUT_PREIMAGE');
  if(mode!==null&&(!Number.isInteger(mode)||mode<0||mode>0o777))
    reject('E_OUTPUT_MODE');
  const file=await resolveProjectPath(root,relative,{
    purpose:'read-existing',mustExist:true
  });
  const originalIdentity=await lstat(file);
  if(!originalIdentity.isFile()||originalIdentity.isSymbolicLink())
    reject('E_OUTPUT_PREIMAGE_TYPE');
  // Replacing a task cannot silently broaden the permissions of a user file.
  const effectiveMode=mode??(originalIdentity.mode&0o777);
  const old=await readProjectBytes(root,relative);
  if(hash(old)!==expectedHash)reject('E_OUTPUT_CHANGED');
  // Do not leave an orphan staging file on Windows when directory durability
  // is already known to be unsupported for the selected root.
  await assertLifecycleDurabilitySupported(root);
  const base=path.posix.dirname(relative);
  const name=path.posix.basename(relative);
  const temporary=(base==='.'?'':base+'/')+
    '.'+name+'.vcp-'+randomBytes(12).toString('hex')+'.tmp';
  const stage=await resolveProjectPath(root,temporary,{purpose:'write-new'});
  let identity=null;
  try {
    const fd=await open(stage,constants.O_WRONLY|constants.O_CREAT|
      constants.O_EXCL|(constants.O_NOFOLLOW??0),effectiveMode);
    try {
      identity=await fd.stat();
      await fd.writeFile(replacement);
      await fd.sync();
    }finally{await fd.close();}
    await syncContainingDirectory(stage);
    const current=await readProjectBytes(root,relative);
    if(hash(current)!==expectedHash)reject('E_OUTPUT_CHANGED');
    const beforeRename=await lstat(file);
    if(!beforeRename.isFile()||beforeRename.isSymbolicLink()||
       beforeRename.dev!==originalIdentity.dev||
       beforeRename.ino!==originalIdentity.ino||
       beforeRename.mode!==originalIdentity.mode) {
      reject('E_OUTPUT_PATH_CHANGED');
    }
    // Candidate-level TOCTOU limitation: exact Windows native junction/rename
    // behavior still requires its own independent conformance acceptance.
    await rename(stage,file);
    await syncContainingDirectory(file);
    const actual=await readProjectBytes(root,relative);
    if(!actual.equals(replacement))reject('E_OUTPUT_REPLACE_UNPROVEN');
  }finally {
    if(identity) {
      let atPath;
      try{atPath=await lstat(stage);}
      catch(e){if(e.code!=='ENOENT')throw e;}
      if(atPath) {
        if(!atPath.isFile()||atPath.isSymbolicLink()||
          atPath.dev!==identity.dev||atPath.ino!==identity.ino)
          reject('E_OUTPUT_STAGING_CHANGED');
        await unlink(stage);
        await syncContainingDirectory(stage);
      }
    }
  }
  return {file,size:replacement.length,sha256:hash(replacement)};
}
