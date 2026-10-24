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
// Phase N+3 (R-2): anchored mode — same availability rule as the
// lifecycle lock (see lifecycle-lock-v2.mjs). When the secure
// provider is available, journal staging, commit, verification
// reads and clearing run through descriptor-bound provider
// operations carrying the transaction anchor, and the journal's
// creation identity is recorded in the staging provenance registry
// (lib/staging-provenance.mjs) BEFORE the commit rename, so
// recovery can prove journal ownership instead of trusting a name.
import { secureWriterProviderStatus,
  selectSecureWriterProvider } from './secure-fs-provider.mjs';
import { recordStagingCreation, listStagingProvenance,
  forgetStaging } from './staging-provenance.mjs';
function journalProviderOrNull() {
  const status = secureWriterProviderStatus();
  if (status.provider !== 'linux-native' || !status.helper.present)
    return null;
  return selectSecureWriterProvider();
}

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

// Phase N+2 (R-2): journal namespace pin. The journal's digest checks
// prove CONTENT continuity, but content can be identical in a
// substituted .vcp namespace (a byte-identical copy passes every
// digest comparison while the rename lands in the attacker's tree).
// The pin records the .vcp directory identity at transaction start;
// assertJournalNamespace re-verifies it at the commit points (after
// the rename in writeVersionedJournal, before the unlink in
// clearVersionedJournal). A mismatch refuses with
// E_JOURNAL_NAMESPACE_CHANGED. Exported as a test boundary, like
// assertVersionedJournalTransition below.
export async function pinJournalNamespace(root) {
  let st;
  try {st=await lstat(path.join(root,'.vcp'),{bigint:true});}
  catch{reject('E_JOURNAL_NAMESPACE_CHANGED');}
  if(!st.isDirectory()||st.isSymbolicLink())
    reject('E_JOURNAL_NAMESPACE_CHANGED');
  return Object.freeze({dev:st.dev,ino:st.ino});
}
export async function assertJournalNamespace(root,pin) {
  if(!pin)return;
  let st;
  try {st=await lstat(path.join(root,'.vcp'),{bigint:true});}
  catch{reject('E_JOURNAL_NAMESPACE_CHANGED');}
  if(!st.isDirectory()||st.isSymbolicLink()||
     st.dev!==pin.dev||st.ino!==pin.ino)
    reject('E_JOURNAL_NAMESPACE_CHANGED');
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
  const provider=journalProviderOrNull();
  const readCurrent=async()=>{
    if(!provider)return digestExisting(root);
    const anchor=await provider.anchorIdentities(root,'.vcp');
    try {
      const doc=await provider.readFileVerified(
        root,'.vcp/transaction.json',
        {root:anchor.root,parent:anchor.parent});
      return {sha256:doc.sha256,bytes:doc.bytes,
        identity:{dev:doc.devExact,ino:doc.inoExact},anchor};
    }catch(e){if(e.code==='E_FS_OS_ERROR')return null;throw e;}
  };
  const namespacePin=await pinJournalNamespace(root);
  const current=await readCurrent();
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
  if(provider) {
    // Anchored commit: staging write, provenance record, and the
    // commit rename all carry the transaction anchor; the rename
    // verifies the staged file's identity inside the helper, so the
    // object committed is provably the object staged — in the
    // namespace pinned at entry (assertJournalNamespace re-checks
    // the pin after the rename as a second layer).
    const anchor=current?.anchor??
      await provider.anchorIdentities(root,'.vcp');
    const expectBase={root:anchor.root,parent:anchor.parent};
    let staged=null;
    try {
      staged=await provider.writeFileSynced(
        root,temporary,serialized,0o600);
      const concurrent=await readCurrent();
      if((concurrent?.sha256??null)!==previousHash)
        reject('E_JOURNAL_CHANGED');
      // Provenance BEFORE the rename: the staged inode is the
      // post-rename journal inode (rename preserves the object).
      await recordStagingCreation(root,{
        name:'.vcp/transaction.json',transactionId:descriptor.id,
        dev:staged.dev,ino:staged.ino});
      await provider.renameReplaceBound(root,temporary,
        '.vcp/transaction.json',
        {...expectBase,file:{dev:staged.dev,ino:staged.ino}});
      await provider.syncDirectory(root,'.vcp');
      await assertJournalNamespace(root,namespacePin);
    }catch(e) {
      if(staged) {
        try{await provider.deleteFile(root,temporary,
          {...expectBase,file:{dev:staged.dev,ino:staged.ino}});}
        catch{}
      }
      throw e;
    }
    const committedA=await readCurrent();
    if(committedA?.sha256!==sha(serialized))
      reject('E_JOURNAL_WRITE_NOT_DURABLE');
    return {sha256:committedA.sha256,bytes:serialized.length,
      anchored:true,identity:committedA.identity};
  }
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
    // The rename has committed; prove it committed in the namespace
    // this transaction pinned at its start, not a substituted copy.
    await assertJournalNamespace(root,namespacePin);
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
  const provider=journalProviderOrNull();
  const namespacePin=await pinJournalNamespace(root);
  if(provider) {
    // Anchored clear: the journal is read through the pinned chain,
    // and the unlink carries root+state+journal identity
    // expectations — the object deleted is provably the object whose
    // digest was verified, in the namespace pinned at entry. The
    // provenance entry is forgotten only after the proven removal.
    const anchor=await provider.anchorIdentities(root,'.vcp');
    const readAnchored=async()=>{
      try {
        const doc=await provider.readFileVerified(
          root,'.vcp/transaction.json',
          {root:anchor.root,parent:anchor.parent});
        return {sha256:doc.sha256,bytes:doc.bytes,
          identity:{dev:doc.devExact,ino:doc.inoExact}};
      }catch(e){if(e.code==='E_FS_OS_ERROR')return null;throw e;}
    };
    const currentA=await readAnchored();
    if(!currentA||currentA.sha256!==expectedHash)
      reject('E_JOURNAL_CHANGED');
    // Provenance (Phase N+3 §4): if this journal's creation was
    // recorded, its current identity must match the record. A
    // byte-identical journal in a copied namespace has a different
    // inode than the recorded creation and refuses here — content
    // equality is not ownership. Journals with no record (written
    // before provenance, or in legacy mode) clear on digest alone,
    // as before.
    {
      const entries=await listStagingProvenance(root);
      const mine=entries.find(
        (e)=>e.name==='.vcp/transaction.json');
      if(mine&&(mine.dev!==currentA.identity.dev||
                mine.ino!==currentA.identity.ino))
        reject('E_JOURNAL_CHANGED');
    }
    let transactionA;
    try {
      transactionA=decodeManagedTransaction(
        JSON.parse(currentA.bytes.toString('utf8')),
        {readerVersion:await getCliVersion()});
    }catch{reject('E_JOURNAL_UNREADABLE_FOR_CLEAR');}
    if(transactionA.phase==='cleanup') {
      const [rootEntries,stateEntries]=await Promise.all([
        readdir(root),readdir(path.join(root,'.vcp'))
      ]);
      assertTerminalJournalClearance(transactionA,
        {rootEntries,stateEntries});
    }
    const afterA=await readAnchored();
    if(afterA?.sha256!==expectedHash||
       afterA.identity.dev!==currentA.identity.dev||
       afterA.identity.ino!==currentA.identity.ino)
      reject('E_JOURNAL_CHANGED');
    await assertJournalNamespace(root,namespacePin);
    await provider.deleteFile(root,'.vcp/transaction.json',{
      root:anchor.root,parent:anchor.parent,
      file:currentA.identity});
    await provider.syncDirectory(root,'.vcp');
    await forgetStaging(root,'.vcp/transaction.json');
    return;
  }
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
  await assertJournalNamespace(root,namespacePin);
  await unlink(filename);
  await syncContainingDirectory(filename);
}
