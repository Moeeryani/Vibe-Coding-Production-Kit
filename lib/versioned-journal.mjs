// Versioned, exclusively owned crash journal.
// Replaces the legacy writeFile() API only for Stage12 transactions. No
// activation while G-FENCE is NO-GO. All writes require an acquired lock.
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { decodeManagedTransaction } from './managed-recovery-v2.mjs';

const MAX_BYTES=512*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function reject(code){const e=new Error(code);e.code=code;throw e;}
async function digestExisting(root) {
  let filename;
  try {
    filename=await resolveProjectPath(root,'.vcp/transaction.json',{
      purpose:'managed-state',mustExist:true
    });
  }catch(e) {
    if(e?.code==='E_VCP_PATH'&&e.message.includes('MISSING_INPUT'))return null;
    throw e;
  }
  const original=await lstat(filename);
  if(!original.isFile()||original.isSymbolicLink()||original.size>MAX_BYTES)reject('E_JOURNAL_UNSAFE');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try{
    const current=await fd.stat();
    if(!current.isFile()||current.dev!==original.dev||current.ino!==original.ino||
      current.size!==original.size||current.mtimeMs!==original.mtimeMs)reject('E_JOURNAL_RACE');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const last=await lstat(filename);
  if(!last.isFile()||last.isSymbolicLink()||last.dev!==original.dev||
    last.ino!==original.ino||last.size!==original.size||
    last.mtimeMs!==original.mtimeMs||bytes.length>MAX_BYTES)reject('E_JOURNAL_RACE');
  return {bytes,sha256:sha(bytes)};
}
export async function readVersionedJournalDigest(root) {
  const value=await digestExisting(root);
  return value?value.sha256:null;
}
export async function writeVersionedJournal(root,descriptor,{
  previousHash=null,readerVersion
}={}) {
  decodeManagedTransaction(descriptor,{readerVersion});
  const serialized=Buffer.from(JSON.stringify(descriptor,null,2)+'\n');
  if(serialized.length>MAX_BYTES)reject('E_JOURNAL_TOO_LARGE');
  const current=await digestExisting(root);
  if(current?.sha256!==previousHash)reject('E_JOURNAL_CHANGED');
  const temporary='.vcp/transaction-'+randomBytes(12).toString('hex')+'.tmp';
  const staging=await resolveProjectPath(root,temporary,{purpose:'managed-state'});
  const destination=await resolveProjectPath(root,'.vcp/transaction.json',{purpose:'managed-state'});
  let temporaryIdentity=null;
  try {
    const fd=await open(staging,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|
      (constants.O_NOFOLLOW??0),0o600);
    try {
      temporaryIdentity=await fd.stat();
      await fd.writeFile(serialized);
      await fd.sync();
    }finally{await fd.close();}
    const concurrent=await digestExisting(root);
    if(concurrent?.sha256!==previousHash)reject('E_JOURNAL_CHANGED');
    await rename(staging,destination);
  }finally{
    if(temporaryIdentity) {
      let atPath;
      try {atPath=await lstat(staging);}
      catch(e){if(e.code!=='ENOENT')throw e;}
      if(atPath) {
        if(!atPath.isFile()||atPath.isSymbolicLink()||
           atPath.dev!==temporaryIdentity.dev||atPath.ino!==temporaryIdentity.ino) {
          reject('E_JOURNAL_TEMP_CHANGED');
        }
        await unlink(staging);
      }
    }
  }
  const committed=await digestExisting(root);
  if(committed?.sha256!==sha(serialized))reject('E_JOURNAL_WRITE_NOT_DURABLE');
  return {sha256:committed.sha256,bytes:serialized.length};
}
export async function clearVersionedJournal(root,{expectedHash}={}) {
  if(typeof expectedHash!=='string'||!/^[0-9a-f]{64}$/.test(expectedHash))reject('E_JOURNAL_EXPECTED_HASH');
  const current=await digestExisting(root);
  if(!current||current.sha256!==expectedHash)reject('E_JOURNAL_CHANGED');
  const filename=await resolveProjectPath(root,'.vcp/transaction.json',{
    purpose:'managed-state',mustExist:true
  });
  // Recheck identity before unlink. A stronger dirfd-based OS primitive is
  // required for hostile concurrent rename races; such proof is still gated.
  const after=await digestExisting(root);
  if(after?.sha256!==expectedHash)reject('E_JOURNAL_CHANGED');
  await unlink(filename);
}
