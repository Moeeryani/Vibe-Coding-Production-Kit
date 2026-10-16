// Versioned, exclusively owned crash journal.
// Replaces the legacy writeFile() API only for Stage12 transactions. No
// activation while G-FENCE is NO-GO. All writes require an acquired lock.
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { decodeManagedTransaction } from './managed-recovery-v2.mjs';
import { syncContainingDirectory } from './file-durability.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { getCliVersion } from './version.mjs';
import { readProjectBytes } from './safe-read.mjs';

const MAX_BYTES=512*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function reject(code){const e=new Error(code);e.code=code;throw e;}
async function digestExisting(root) {
  let bytes;
  try {
    bytes=await readProjectBytes(root,'.vcp/transaction.json',{
      managedState:true,optional:true,maxBytes:MAX_BYTES
    });
  }catch(error) {
    if(error?.code==='E_PROJECT_FILE_UNSAFE')reject('E_JOURNAL_UNSAFE');
    if(error?.code==='E_PROJECT_READ_RACE')reject('E_JOURNAL_RACE');
    throw error;
  }
  return bytes===null?null:{bytes,sha256:sha(bytes)};
}
export async function readVersionedJournalDigest(root) {
  const value=await digestExisting(root);
  return value?value.sha256:null;
}

// Pure transition boundary: permits negative regression fixtures to exercise
// the exact production phase/ownership rules while G-FENCE remains NO-GO.
export function assertVersionedJournalTransition(priorDescriptor,nextDescriptor,{
  readerVersion
}={}) {
  const next=decodeManagedTransaction(nextDescriptor,{readerVersion});
  if(!next||next.formatVersion!==2)reject('E_JOURNAL_NEW_FORMAT');
  if(priorDescriptor==null) {
    if(next.phase!=='prepared')reject('E_JOURNAL_FIRST_PHASE');
    return Object.freeze({from:null,to:next.phase,operation:next.operation});
  }
  let previous;
  try {previous=decodeManagedTransaction(priorDescriptor,{readerVersion});}
  catch{reject('E_JOURNAL_OLD_FORMAT');}
  const transitions={
    prepared:['applying','recovering'],
    applying:['verified','recovering'],
    verified:['committed','recovering'],
    recovering:['cleanup'],cleanup:[],committed:[]
  };
  if(previous.formatVersion!==2||
    !(transitions[previous.phase]??[]).includes(next.phase)||
    previous.id!==next.id||previous.backupId!==next.backupId||
    previous.operation!==next.operation||previous.startedAt!==next.startedAt||
    previous.minimumReaderVersion!==next.minimumReaderVersion||
    previous.plannedManifestHash!==next.plannedManifestHash||
    JSON.stringify(previous.createdFiles)!==JSON.stringify(next.createdFiles)) {
    reject('E_JOURNAL_INVALID_TRANSITION');
  }
  return Object.freeze({from:previous.phase,to:next.phase,operation:next.operation});
}
export async function writeVersionedJournal(root,descriptor,{
  previousHash=null,readerVersion
}={},testCapability=null) {
  // Authorization: production gate OR independently-verified test capability.
  // Each enforcement point verifies on its own; G1 verification does not
  // authorize skipping this check. (B-5 Approach A)
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root,operation:'journal-write'});
  }else{
    assertManagedMigrationGate(); // Before read, staging or journal mutation.
  }
  decodeManagedTransaction(descriptor,{readerVersion});
  const serialized=Buffer.from(JSON.stringify(descriptor,null,2)+'\n');
  if(serialized.length>MAX_BYTES)reject('E_JOURNAL_TOO_LARGE');
  const current=await digestExisting(root);
  // Normalize missing journal to null so previousHash=null (the default,
  // meaning "no previous journal") compares correctly. Strict otherwise.
  if((current?.sha256??null)!==previousHash)reject('E_JOURNAL_CHANGED');
  let prior=null;
  if(current) {
    try {prior=JSON.parse(current.bytes.toString('utf8'));}
    catch{reject('E_JOURNAL_OLD_FORMAT');}
  }
  assertVersionedJournalTransition(prior,descriptor,{readerVersion});
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
    if((concurrent?.sha256??null)!==previousHash)reject('E_JOURNAL_CHANGED');
    await rename(staging,destination);
    await syncContainingDirectory(destination);
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
        await syncContainingDirectory(staging);
      }
    }
  }
  const committed=await digestExisting(root);
  if(committed?.sha256!==sha(serialized))reject('E_JOURNAL_WRITE_NOT_DURABLE');
  return {sha256:committed.sha256,bytes:serialized.length};
}
// Only the journal and its acquired lock may remain before destroying the
// final terminal-init provenance record. Do not trust a phase flag alone.
export function assertTerminalJournalClearance(transaction,{rootEntries,stateEntries}={}) {
  if(transaction?.phase!=='cleanup')return null;
  if(transaction.operation!=='init'||
     !Array.isArray(rootEntries)||!Array.isArray(stateEntries)||
     rootEntries.length!==1||rootEntries[0]!=='.vcp'||
     stateEntries.length!==2||
     !stateEntries.includes('transaction.json')||
     !stateEntries.includes('update.lock')) {
    reject('E_JOURNAL_TERMINAL_NOT_EMPTY');
  }
  return Object.freeze({terminalRootProved:true,phase:'cleanup'});
}

export async function clearVersionedJournal(root,{expectedHash}={},testCapability=null) {
  // Authorization: production gate OR independently-verified test capability.
  // (B-5 Approach A)
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root,operation:'journal-clear'});
  }else{
    assertManagedMigrationGate(); // Direct imports must not bypass the fence.
  }
  if(typeof expectedHash!=='string'||!/^[0-9a-f]{64}$/.test(expectedHash))reject('E_JOURNAL_EXPECTED_HASH');
  const current=await digestExisting(root);
  if(!current||current.sha256!==expectedHash)reject('E_JOURNAL_CHANGED');
  let transaction;
  try {
    transaction=decodeManagedTransaction(JSON.parse(current.bytes.toString('utf8')),
      {readerVersion:await getCliVersion()});
  }catch{reject('E_JOURNAL_UNREADABLE_FOR_CLEAR');}
  if(transaction.phase==='cleanup') {
    // A forged or premature terminal phase cannot erase its only surviving
    // identity until every created project path and backup control is gone.
    const [rootEntries,stateEntries]=await Promise.all([
      readdir(root),readdir(path.join(root,'.vcp'))
    ]);
    assertTerminalJournalClearance(transaction,{rootEntries,stateEntries});
  }
  const filename=await resolveProjectPath(root,'.vcp/transaction.json',{
    purpose:'managed-state',mustExist:true
  });
  // Recheck identity before unlink. A stronger dirfd-based OS primitive is
  // required for hostile concurrent rename races; such proof is still gated.
  const after=await digestExisting(root);
  if(after?.sha256!==expectedHash)reject('E_JOURNAL_CHANGED');
  await unlink(filename);
  await syncContainingDirectory(filename);
}
