// Versioned, exclusively owned crash journal.
// Replaces the legacy writeFile() API only for Stage12 transactions. No
// activation while G-FENCE is NO-GO. All writes require an acquired lock.
import { randomBytes, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, link, open, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { decodeManagedTransaction } from './managed-recovery-v2.mjs';
import { validateStage13Transaction } from './stage13-transaction.mjs';
import { syncContainingDirectory } from './file-durability.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { assertOwnedLifecycleLock } from './lifecycle-lock-v2.mjs';
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
// Phase N+4 (§6): readVersionedJournalDigest is CONTENT evidence
// only. The digest of a byte-identical copy equals the original, so
// it proves nothing about namespace or ownership — recovery-planning
// callers must use it for hash comparison only, never as an
// ownership proof. For identity + provenance inspection, use
// inspectVersionedJournal below.
export async function readVersionedJournalDigest(root) {
  const value=await digestExisting(root);
  return value?value.sha256:null;
}

// Anchored journal inspection for recovery flows: digest together
// with the journal's measured identity and its provenance status
// (recorded-and-matching, recorded-but-mismatched, or unrecorded).
// Returns null when no journal exists. In legacy mode (helper
// absent) identity/provenance are null and the result is digest-only.
export async function inspectVersionedJournal(root) {
  const provider=journalProviderOrNull();
  if(!provider) {
    const value=await digestExisting(root);
    return value?Object.freeze({sha256:value.sha256,bytes:value.bytes,
      anchored:false,identity:null,provenance:'unrecorded'}):null;
  }
  const anchor=await provider.anchorIdentities(root,'.vcp');
  let doc;
  try {
    doc=await provider.readFileVerified(root,'.vcp/transaction.json',
      {root:anchor.root,parent:anchor.parent});
  } catch(e) { if(e.code==='E_FS_OS_ERROR')return null; throw e; }
  const entries=await listStagingProvenance(root);
  const mine=entries.find((e)=>e.name==='.vcp/transaction.json');
  const provenance=!mine?'unrecorded':
    (mine.dev===doc.devExact&&mine.ino===doc.inoExact)?
      'recorded-matching':'recorded-mismatch';
  return Object.freeze({sha256:doc.sha256,bytes:doc.bytes,
    anchored:true,
    identity:Object.freeze({dev:doc.devExact,ino:doc.inoExact}),
    provenance});
}

// P5-01 (#7) + P5-03 / P5-05: read-only crash-state classification
// of the journal. Never throws for an unparseable state — it returns
// the classification instead, so recovery and diagnostics can act on
// what IS observable without treating "unknown" as "absent".
// States: absent | complete | staged-interrupted | partial-malformed |
// legacy | symlinked | unreadable | cleanup-interrupted | unknown.
// `complete` carries the decoded phase and formatVersion. A journal
// whose bytes are present but whose terminal-clearance preconditions
// are unmet is cleanup-interrupted, not complete: the cleanup was
// interrupted before the state was empty.
export async function classifyJournalCrashState(root) {
  const r=path.resolve(root);
  const result={state:'unknown',journalPresent:false,lockPresent:false,
    stagingTemps:[],phase:null,formatVersion:null,journalSha256:null,
    detail:null};
  const finish=(state,detail=null)=>Object.freeze({...result,state,
    ...(detail!==null?{detail}:{})});
  try {
    let vcpStat;
    try { vcpStat=await lstat(path.join(r,'.vcp'),{bigint:true}); }
    catch(e) {
      if(e.code==='ENOENT')return finish('absent','no-managed-state');
      return finish('unreadable','state-directory-unreadable');
    }
    if(!vcpStat.isDirectory()||vcpStat.isSymbolicLink())
      return finish('symlinked','state-directory-not-a-real-directory');
    try {
      const lockStat=await lstat(path.join(r,'.vcp','update.lock'));
      if(lockStat)result.lockPresent=true;
    } catch {}
    let names=[];
    try { names=await readdir(path.join(r,'.vcp')); } catch {}
    result.stagingTemps=names.filter((n)=>
      /^transaction-[0-9a-f]+\.tmp$/.test(n));
    let journalStat;
    try {
      journalStat=await lstat(path.join(r,'.vcp','transaction.json'),
        {bigint:true});
    } catch(e) {
      if(e.code==='ENOENT')
        return finish(result.stagingTemps.length?'staged-interrupted':'absent',
          result.stagingTemps.length?'staging-temp-without-journal':null);
      return finish('unreadable','journal-stat-failed');
    }
    result.journalPresent=true;
    if(journalStat.isSymbolicLink())
      return finish('symlinked','journal-is-a-symlink');
    if(!journalStat.isFile())
      return finish('partial-malformed','journal-not-a-regular-file');
    let bytes;
    try {
      bytes=await readProjectBytes(r,'.vcp/transaction.json',{
        managedState:true,optional:true,maxBytes:MAX_BYTES});
    } catch(e) {
      if(e?.code==='E_PROJECT_FILE_UNSAFE')
        // The lstat above already ruled out a symlink present at
        // inspection time; an unsafe-read here means the file cannot
        // be read within bounds (oversize, or a symlink swapped in
        // between lstat and read) — unreadable, not absent.
        return finish('unreadable','journal-unsafe-to-read');
      if(e?.code==='E_PROJECT_READ_RACE')
        return finish('unreadable','journal-read-race');
      return finish('unreadable','journal-read-failed');
    }
    if(bytes===null)
      return finish('absent','journal-vanished-during-read');
    result.journalSha256=sha(bytes);
    let value;
    try { value=JSON.parse(bytes.toString('utf8')); }
    catch { return finish('partial-malformed','journal-not-valid-json'); }
    if(!value||typeof value!=='object'||Array.isArray(value))
      return finish('partial-malformed','journal-not-an-object');
    if(value.formatVersion===undefined)
      return finish('legacy','format-version-1-journal');
    if(value.formatVersion===3) {
      try {
        validateStage13Transaction(value);
        result.phase=value.phase; result.formatVersion=3;
        return finish('complete');
      } catch { return finish('partial-malformed','stage13-transaction-invalid'); }
    }
    if(value.formatVersion!==2)
      return finish('partial-malformed','unknown-format-version');
    let decoded;
    try {
      decoded=decodeManagedTransaction(value,
        {readerVersion:await getCliVersion()});
    } catch { return finish('partial-malformed','journal-fails-decoding'); }
    result.phase=decoded.phase; result.formatVersion=2;
    if(decoded.phase==='cleanup') {
      let rootEntries=[],stateEntries=[];
      try {
        rootEntries=await readdir(r);
        stateEntries=await readdir(path.join(r,'.vcp'));
      } catch { return finish('cleanup-interrupted','state-unreadable'); }
      try {
        assertTerminalJournalClearance(decoded,{rootEntries,stateEntries});
      } catch { return finish('cleanup-interrupted','terminal-preconditions-unmet'); }
    }
    return finish('complete');
  } catch(e) {
    return finish('unknown',String(e?.code??e?.message??e));
  }
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
    JSON.stringify(previous.createdFiles)!==JSON.stringify(next.createdFiles)||
    // P5-02: post-apply evidence is part of the journal's identity —
    // a transition must carry it forward unchanged, never drop it.
    JSON.stringify(previous.postApplyFiles)!==JSON.stringify(next.postApplyFiles)) {
    reject('E_JOURNAL_INVALID_TRANSITION');
  }
  return Object.freeze({from:previous.phase,to:next.phase,operation:next.operation});
}
export async function writeVersionedJournal(root,descriptor,{
  previousHash=null,readerVersion,lock=null
}={},testCapability=null) {
  // Authorization lattice (N+4 R1 strict fence + D-01; the
  // Stage12 tripwire requires the gate call literally in this
  // body). A lifecycle lock establishes ownership and
  // serialization — it does NOT replace authorization and does
  // NOT override the production gate:
  //  1. A test capability, when given, is verified (existing
  //     test regime; it does not skip the lock assert below).
  //  2. A transaction lock, when given, is asserted per call —
  //     its acquire-time anchor detects a namespace swap between
  //     calls, before any mutation.
  //  3. With NO test capability, the production gate ALWAYS runs,
  //     regardless of whether a lock exists (it throws while
  //     G-FENCE is NO-GO). Lock-only direct imports therefore
  //     refuse E_G_FENCE_NO_GO with no mutation — the N+4
  //     lock-as-authorization hole is closed.
  //  4. Past the gate (post-GO future), an unbound mutation in
  //     anchored mode refuses E_JOURNAL_UNBOUND; legacy mode
  //     proceeds on the gate alone.
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root,operation:'journal-write'});
  }
  if(lock) await assertOwnedLifecycleLock(root,lock);
  if(!testCapability){
    assertManagedMigrationGate();
    if(!lock&&journalProviderOrNull())reject('E_JOURNAL_UNBOUND');
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
  // R-INT-8 (fix for F-P5V-2): the commit rename is anchored to the
  // namespace pinned at entry, while the post-rename steps resolve the
  // pathname. When the root is swapped between the rename and the
  // sync, the rename lands in the original (now detached) tree and a
  // post-rename helper step fails on the swapped path — reporting a
  // generic failure hides that the commit landed elsewhere (false
  // failure: the caller is told the write failed while the journal
  // durably holds the new version). Classify before reporting:
  //   - live path is a different namespace than the entry pin:
  //     E_JOURNAL_COMMIT_NAMESPACE_CHANGED — the commit landed in a
  //     namespace that is no longer at this path. A retry against the
  //     live path is safe: its previousHash still matches.
  //   - live path is the entry namespace and holds the new bytes, and
  //     the directory sync already succeeded: the failure was in the
  //     namespace re-check or provenance — the commit is visible and
  //     durable at the live path, so return normally (the journal is
  //     unrecorded-but-valid, a handled state; the committed
  //     verification below re-checks the bytes).
  //   - live path holds the new bytes but the sync failed: visible but
  //     durability unproven — E_JOURNAL_COMMIT_NOT_DURABLE.
  //   - live path holds anything else: a concurrent writer overwrote
  //     the journal after the rename — E_JOURNAL_CHANGED.
  const classifyPostCommitFailure=async({synced})=>{
    try{await assertJournalNamespace(root,namespacePin);}
    catch{reject('E_JOURNAL_COMMIT_NAMESPACE_CHANGED');}
    const live=await digestExisting(root);
    if(live?.sha256===sha(serialized)){
      if(synced)return;
      reject('E_JOURNAL_COMMIT_NOT_DURABLE');
    }
    reject('E_JOURNAL_CHANGED');
  };
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
      // P5-01 (PH-06): the commit itself is the atomic claim.
      // Creation (previousHash === null) commits with
      // rename-noreplace: the kernel refuses EEXIST atomically when
      // a journal already exists, so two concurrent creators can
      // never both report success — the loser gets a deterministic
      // E_JOURNAL_ALREADY_EXISTS. A transition (previousHash set)
      // replaces an existing journal, so it keeps rename-replace
      // under lock serialization + previousHash re-check + the
      // post-commit verification below; POSIX has no atomic
      // compare-and-swap on a pathname, so lock-free transitions
      // keep a documented residual micro-window (see design.md
      // §6.1 item 3) — creation is the closed race, transitions
      // are not claimed atomic.
      if(previousHash===null) {
        await provider.renameNoReplaceBound(root,temporary,
          '.vcp/transaction.json',
          {...expectBase,file:{dev:staged.dev,ino:staged.ino}});
      } else {
        await provider.renameReplaceBound(root,temporary,
          '.vcp/transaction.json',
          {...expectBase,file:{dev:staged.dev,ino:staged.ino}});
      }
      // The rename already committed. A failure in any post-rename
      // step must be classified before it is reported (R-INT-8):
      // the commit may have landed in a namespace that is no longer
      // at this path, and a generic failure would hide that.
      let synced=false;
      try {
        await provider.syncDirectory(root,'.vcp');
        synced=true;
        await assertJournalNamespace(root,namespacePin);
        // Provenance AFTER the rename (P5-01): the registry upserts
        // by name, so recording before the rename lets a losing
        // creator clobber the winner's entry with a staged inode that
        // is then deleted — poisoning the winner's journal (its clear
        // would refuse recorded-mismatch). Only the committed journal
        // is recorded; the loser never writes provenance. A crash
        // between rename and this record leaves an unrecorded-but-
        // valid journal, clearable on digest alone (legacy-mode
        // behavior). One retry: the registry write is idempotent
        // (same name, same dev/ino), and a transient failure must
        // not silently drop the ownership record.
        try {
          await recordStagingCreation(root,{
            name:'.vcp/transaction.json',transactionId:descriptor.id,
            dev:staged.dev,ino:staged.ino});
        } catch(provErr) {
          await recordStagingCreation(root,{
            name:'.vcp/transaction.json',transactionId:descriptor.id,
            dev:staged.dev,ino:staged.ino});
        }
      } catch(postErr) {
        await classifyPostCommitFailure({synced});
      }
    }catch(e) {
      if(staged) {
        try{await provider.deleteFile(root,temporary,
          {...expectBase,file:{dev:staged.dev,ino:staged.ino}});}
        catch{}
      }
      if(e.code==='E_FS_DESTINATION_EXISTS')
        reject('E_JOURNAL_ALREADY_EXISTS');
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
    // P5-01 (PH-06): creation commits with link() — atomic hard-link
    // creation, EEXIST when the destination already exists — so two
    // concurrent creators can never both report success. A transition
    // keeps rename (replace), under the same documented residual as
    // the anchored path (see design.md §6.1 item 3). The finally
    // block below unlinks the staging name; after a successful link
    // that removes only the staging hard link, leaving the journal
    // (same inode) in place.
    try {
      if(previousHash===null) {
        await link(staging,destination);
      } else {
        await rename(staging,destination);
      }
    } catch(e) {
      if(e.code==='EEXIST')reject('E_JOURNAL_ALREADY_EXISTS');
      throw e;
    }
    // The rename/link already committed. A failure in any post-commit
    // step must be classified before it is reported (R-INT-8): the
    // commit may have landed in a namespace that is no longer at
    // this path, and a generic failure would hide that.
    let synced=false;
    try {
      await syncContainingDirectory(destination);
      synced=true;
      // The rename has committed; prove it committed in the namespace
      // this transaction pinned at its start, not a substituted copy.
      await assertJournalNamespace(root,namespacePin);
    } catch(postErr) {
      await classifyPostCommitFailure({synced});
    }
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
  if(committed?.sha256!==sha(serialized)){
    // R-INT-8 (legacy, follow-up found by independent validation): the
    // commit may have landed in a namespace that is no longer at this
    // path (root swapped after the namespace re-check but before this
    // read). Classify before reporting: a different namespace means
    // the commit is detached, not undone. A matching namespace with
    // different bytes means a concurrent writer overwrote the journal
    // — the original E_JOURNAL_WRITE_NOT_DURABLE stands.
    try{await assertJournalNamespace(root,namespacePin);}
    catch{reject('E_JOURNAL_COMMIT_NAMESPACE_CHANGED');}
    reject('E_JOURNAL_WRITE_NOT_DURABLE');
  }
  return {sha256:committed.sha256,bytes:serialized.length};
}
// Only the journal and its acquired lock may remain before destroying the
// final terminal-init provenance record. Do not trust a phase flag alone.
export function assertTerminalJournalClearance(transaction,{rootEntries,stateEntries}={}) {
  if(transaction?.phase!=='cleanup')return null;
  if(transaction.operation!=='init'||
     !Array.isArray(rootEntries)||!Array.isArray(stateEntries)||
     rootEntries.length!==1||rootEntries[0]!=='.vcp'||
     // Phase N+4 (§4): the provenance registry is system state,
     // not transaction output — an anchored write always creates
     // it, so terminal clearance accepts it as a third state entry.
     // It is forgotten by the clear itself, after proven removal.
     stateEntries.length>3||
     !stateEntries.includes('transaction.json')||
     !stateEntries.includes('update.lock')||
     stateEntries.some((e)=>!['transaction.json','update.lock',
       'staging-provenance.json'].includes(e))) {
    reject('E_JOURNAL_TERMINAL_NOT_EMPTY');
  }
  return Object.freeze({terminalRootProved:true,phase:'cleanup'});
}

export async function clearVersionedJournal(root,{expectedHash,lock=null}={},testCapability=null) {
  // Same strict-fence lattice as writeVersionedJournal (N+4 R1
  // + D-01; gate call literal in this body for the Stage12
  // tripwire): capability verify, lock assert, gate whenever no
  // capability is present, post-gate unbound refusal.
  if(testCapability){
    const { verifyTestCapability }=
      await import('../test/helpers/controlled-writer-capability.mjs');
    await verifyTestCapability(testCapability,{root,operation:'journal-clear'});
  }
  if(lock) await assertOwnedLifecycleLock(root,lock);
  if(!testCapability){
    assertManagedMigrationGate();
    if(!lock&&journalProviderOrNull())reject('E_JOURNAL_UNBOUND');
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
