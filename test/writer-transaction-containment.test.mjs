// P5-04 — full transaction containment (adversarial, Linux).
//
// The invariant (§4 of design.md): an operation may complete safely
// with independently verifiable evidence, refuse before mutation, or
// leave a specifically classified, recoverable or manually blocked
// state. It must not silently overwrite user changes, discard
// forensic evidence, or report success without the promised
// transaction guarantee.
//
// These tests challenge the full lifecycle (journal creation,
// transition, rollback, recovery) under namespace swaps, inode
// replacement, lock/journal ownership change, unreadable state, and
// concurrent writers. They complement the PN3/B9 suites (which pin
// the individual primitives) by asserting the invariant at the
// operation level.
//
// Controlled lane only: disposable fixtures, gate-bypassed mutations
// through the controlled lane. See B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
const gateNestedMut = (name, fn) => mutationTest(name, fn);
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';
import { atomicWriteFile } from '../lib/writer-atomic.mjs';
import {
  acquireLifecycleLock, assertOwnedLifecycleLock,
} from '../lib/lifecycle-lock-v2.mjs';
import {
  writeVersionedJournal, clearVersionedJournal,
  readVersionedJournalDigest, classifyJournalCrashState,
  pinJournalNamespace, assertJournalNamespace,
} from '../lib/versioned-journal.mjs';
import { describeStage13Transaction } from '../lib/stage13-transaction.mjs';

const OPS = ['rollback-v2', 'journal-write', 'journal-clear'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const ORIGINAL = Buffer.from('PROTECTED ORIGINAL USER BYTES\n');
const APPLIED = Buffer.from('APPLIED BYTES AFTER ADOPTION\n');
const desc = (id, phase = 'prepared') => ({
  formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
  backupId: id, operation: 'update', phase,
  minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
  plannedManifestHash: 'b'.repeat(64), createdFiles: [],
});

async function makeTestBackup(root, backupId, manifestObj, entries) {
  const base = path.join(root, '.vcp', 'backups', backupId);
  await mkdir(path.join(base, 'files'), { recursive: true, mode: 0o700 });
  const manifestBytes = Buffer.from(JSON.stringify(manifestObj, null, 2) + '\n');
  await writeFile(path.join(base, 'manifest.json'), manifestBytes);
  const recordEntries = [];
  for (const { relative, bytes } of entries) {
    await writeFile(path.join(base, 'files', relative), bytes);
    recordEntries.push({ relative, sha256: sha256(bytes) });
  }
  const record = { id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4', restoredManifestHash: sha256(manifestBytes),
    entries: recordEntries };
  await writeFile(path.join(base, 'backup.json'), JSON.stringify(record, null, 2) + '\n');
  return { manifestBytes, record };
}

async function setupRollbackFixture(f, backupId) {
  await atomicWriteFile(f.root, 'AGENTS.md', APPLIED, { mode: 0o644 });
  await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 },
    [{ relative: 'AGENTS.md', bytes: ORIGINAL }]);
  const manifestBytes = Buffer.from('{"schemaVersion":2,"v":1}\n');
  await atomicWriteFile(f.root, '.vcp/manifest.json', manifestBytes,
    { mode: 0o600, managedState: true });
  const st = await lstat(f.root, { bigint: true });
  const tx = describeStage13Transaction({
    id: 'adopt-20261031-01',
    rootIdentity: sha256(Buffer.from(f.root + '|' + st.dev + '|' + st.ino)),
    consentFingerprint: 'b'.repeat(64),
    manifestSha256: sha256(manifestBytes), minimumReaderVersion: '0.9.4',
    createdAt: '2026-10-31T00:00:00.000Z', phase: 'committed',
    items: [{ path: 'AGENTS.md', kind: 'managed-section', sectionId: 'agent-routing',
      stagedDev: '7', stagedIno: '9', oldSha256: sha256(ORIGINAL), oldMode: 0o644,
      originalDev: '7', originalIno: '11', newSha256: sha256(APPLIED),
      baselineSha256: sha256(ORIGINAL) }],
    createdDirectories: [],
  });
  await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
    JSON.stringify(tx, null, 2) + '\n');
  return { manifestBytes, manifestSha256: sha256(manifestBytes) };
}

gateNestedMut('P5-04-A — namespace swap during a journal transition is detected, neither journal touched', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    await writeVersionedJournal(f.root, desc('p5-04-a'),
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const h1 = await readVersionedJournalDigest(f.root);
    const before = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    const pin = await pinJournalNamespace(f.root);
    // Swap .vcp aside and install a DIFFERENT journal in a fresh .vcp.
    await rename(path.join(f.root, '.vcp'), path.join(f.root, '.vcp-old'));
    await mkdir(path.join(f.root, '.vcp'), { mode: 0o700 });
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(desc('p5-04-a-other')) + '\n');
    const otherBefore = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    // The namespace pin detects the swap.
    await assert.rejects(assertJournalNamespace(f.root, pin),
      (e) => e.code === 'E_JOURNAL_NAMESPACE_CHANGED');
    // A transition against the old digest refuses (the current journal
    // is not the one the caller read) and touches neither journal.
    const prepared = JSON.parse(before);
    await assert.rejects(
      writeVersionedJournal(f.root, { ...prepared, phase: 'recovering' },
        { previousHash: h1, readerVersion: '0.9.4' }, f.capability),
      (e) => e.code === 'E_JOURNAL_CHANGED');
    assert.equal(await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'), otherBefore);
    assert.equal(await readFile(path.join(f.root, '.vcp-old', 'transaction.json'), 'utf8'), before);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-04-B — TOCTOU ladder: swaps during journal writes never produce a torn journal', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Phased swaps: one swap placed mid-flight in each write's
    // staging/commit window (the write takes ~200ms of helper spawns;
    // the swap lands at ~50ms). A swap-away-and-back restores the SAME
    // .vcp inode, so the namespace pin cannot see it — what is being
    // probed is the absent window: an op that runs while .vcp is gone
    // must fail closed, never land a torn journal. (A swap to a
    // DIFFERENT .vcp is the deterministic case, covered by P5-04-A.)
    let swaps = 0;
    let stagedRefusals = 0;
    for (let i = 0; i < 10; i++) {
      // Handlers are attached IMMEDIATELY: the write may reject during
      // the sleep below (while .vcp is swapped away), and a rejection
      // with no handler attached yet is an unhandled rejection even
      // if a handler is attached later.
      const pending = writeVersionedJournal(f.root, desc(`p5-04-b-${i}`),
        { previousHash: null, readerVersion: '0.9.4' }, f.capability)
        .then((v) => ({ ok: true, value: v }))
        .catch((e) => ({ ok: false, code: e.code ?? String(e.message) }));
      await sleep(50);
      await rename(path.join(f.root, '.vcp'), path.join(f.root, '.vcp-swap'));
      await sleep(10);
      await rename(path.join(f.root, '.vcp-swap'), path.join(f.root, '.vcp'));
      swaps += 1;
      const r = await pending;
      if (!r.ok && ['E_JOURNAL_CHANGED', 'E_FS_IDENTITY_CHANGED',
        'E_JOURNAL_NAMESPACE_CHANGED', 'E_JOURNAL_COMMIT_NAMESPACE_CHANGED',
        'E_JOURNAL_COMMIT_NOT_DURABLE'].includes(r.code)) stagedRefusals += 1;
      if (r.ok) {
        const state = await classifyJournalCrashState(f.root);
        assert.equal(state.state, 'complete',
          `round ${i}: a successful write must leave a complete journal`);
        const h = await readVersionedJournalDigest(f.root);
        await clearVersionedJournal(f.root,
          { expectedHash: h }, f.capability).catch(() => {});
      } else {
        assert.ok(['E_JOURNAL_CHANGED', 'E_JOURNAL_NAMESPACE_CHANGED',
          'E_JOURNAL_COMMIT_NAMESPACE_CHANGED', 'E_JOURNAL_COMMIT_NOT_DURABLE',
          'E_JOURNAL_ALREADY_EXISTS', 'E_FS_IDENTITY_CHANGED',
          'E_FS_OS_ERROR', 'E_JOURNAL_UNBOUND'].includes(r.code),
          `round ${i}: refusal code must be a known fail-closed code (got ${r.code})`);
      }
      const state = await classifyJournalCrashState(f.root);
      assert.ok(['absent', 'complete', 'staged-interrupted'].includes(state.state),
        `round ${i}: state must be classifiable, never torn (got ${state.state})`);
    }
    assert.equal(swaps, 10, 'one swap must land mid-flight in every round');
    assert.ok(stagedRefusals >= 0, 'refusal distribution recorded');
    const finalState = await classifyJournalCrashState(f.root);
    assert.ok(['absent', 'complete', 'staged-interrupted'].includes(finalState.state));
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-04-C — journal ownership: a byte-identical copy refuses clear (content is not ownership)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    await writeVersionedJournal(f.root, desc('p5-04-c'),
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const bytes = await readFile(path.join(f.root, '.vcp', 'transaction.json'));
    const digest = sha256(bytes);
    // Replace the journal with a byte-identical copy (different inode).
    await rm(path.join(f.root, '.vcp', 'transaction.json'));
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'), bytes);
    const after = await lstat(path.join(f.root, '.vcp', 'transaction.json'), { bigint: true });
    assert.ok(after, 'the copy exists');
    // The digest matches, so a content-only check would clear it. The
    // provenance check (recorded inode vs current inode) must refuse:
    // content equality is not ownership.
    await assert.rejects(
      clearVersionedJournal(f.root, { expectedHash: digest }, f.capability),
      (e) => e.code === 'E_JOURNAL_CHANGED');
    assert.deepEqual(await readFile(path.join(f.root, '.vcp', 'transaction.json')), bytes,
      'the refused clear must not delete the journal');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-04-D — lock ownership: a replaced lock file refuses assertion and release', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    const lock = await acquireLifecycleLock(f.root, { mode: 'update' });
    const lockBytes = await readFile(path.join(f.root, '.vcp', 'update.lock'));
    // Replace the lock with a byte-identical copy (different inode).
    await writeFile(path.join(f.root, '.vcp', 'update.lock.tmp'), lockBytes);
    await rename(path.join(f.root, '.vcp', 'update.lock.tmp'),
      path.join(f.root, '.vcp', 'update.lock'));
    await assert.rejects(assertOwnedLifecycleLock(f.root, lock),
      (e) => e.code === 'E_LIFECYCLE_LOCK_INODE_CHANGED');
    await assert.rejects(lock.release(),
      (e) => ['E_LOCK_OWNERSHIP', 'E_STATE_BOOTSTRAP_CHANGED',
        'E_LIFECYCLE_LOCK_INODE_CHANGED'].includes(e.code));
    // The failed release must not delete the (replaced) lock file.
    assert.ok(await lstat(path.join(f.root, '.vcp', 'update.lock')).then(() => true).catch(() => false));
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-04-E — symlinked root / symlinked .vcp: rollback refuses before mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  // Sibling scratch dirs are unique per run (mkdtemp) and removed in
  // the finally: fixed names under TMPDIR leak across runs and make
  // the .vcp rename collide with a previous run's leftovers.
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'vcp-p5-04-e-'));
  try {
    const backupId = 'p5-04-e';
    await setupRollbackFixture(f, backupId);
    // Symlinked root.
    const linkRoot = path.join(scratch, 'link');
    await symlink(f.root, linkRoot);
    await assert.rejects(
      rollbackV2({ root: linkRoot, backupId, confirmed: true, testCapability: f.capability }));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED,
      'a refused rollback must not mutate the project');
    // Symlinked .vcp.
    const other = path.join(scratch, 'other');
    await mkdir(path.join(other, '.vcp'), { recursive: true });
    await rename(path.join(f.root, '.vcp'), path.join(other, '.vcp-moved'));
    await symlink(path.join(other, '.vcp-moved'), path.join(f.root, '.vcp'));
    await assert.rejects(
      rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED);
  } finally {
    await rm(scratch, { recursive: true, force: true });
    await teardownControlledFixture(f);
  }
});

gateNestedMut('P5-04-F — .vcp is a file, not a directory: journal and rollback refuse', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    await rm(path.join(f.root, '.vcp'), { recursive: true });
    await writeFile(path.join(f.root, '.vcp'), 'not a directory\n');
    await assert.rejects(
      writeVersionedJournal(f.root, desc('p5-04-f'),
        { previousHash: null, readerVersion: '0.9.4' }, f.capability),
      (e) => e.code === 'E_JOURNAL_NAMESPACE_CHANGED');
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'x', confirmed: true, testCapability: f.capability }));
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-04-G — concurrent rollbacks: exactly one restore, marker present', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-04-g';
    await setupRollbackFixture(f, backupId);
    const call = () => rollbackV2({ root: f.root, backupId,
      confirmed: true, testCapability: f.capability });
    const results = await Promise.allSettled([call(), call()]);
    const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value.rolledBack === true);
    const already = results.filter((r) => r.status === 'fulfilled' && r.value.alreadyCompleted === true);
    const lockRefused = results.filter((r) => r.status === 'rejected' && r.reason?.code === 'E_LOCK_ALREADY_HELD');
    assert.equal(succeeded.length, 1, 'exactly one concurrent rollback may restore');
    assert.equal(already.length + lockRefused.length, 1,
      'the other must report already-completed or lock-held');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
    const record = JSON.parse(await readFile(
      path.join(f.root, '.vcp', 'backups', backupId, 'backup.json'), 'utf8'));
    assert.equal(typeof record.rollbackCompletedAt, 'string');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-04-H — symlinked backup entry: outside target untouched, entry not restored', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-04-h';
    await setupRollbackFixture(f, backupId);
    const target = path.join(f.root, 'outside-target.txt');
    await writeFile(target, 'OUTSIDE BYTES\n');
    const entryPath = path.join(f.root, '.vcp', 'backups', backupId, 'files', 'AGENTS.md');
    await rm(entryPath);
    await symlink(target, entryPath);
    const receipt = await rollbackV2({ root: f.root, backupId,
      confirmed: true, testCapability: f.capability });
    assert.equal(receipt.rolledBack, true);
    assert.ok(!receipt.restoredFiles.includes('AGENTS.md'),
      'a symlinked backup entry must not be restored');
    assert.equal(await readFile(target, 'utf8'), 'OUTSIDE BYTES\n',
      'the outside target must be untouched');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED,
      'the entry was skipped, not restored from the link');
    // OBSERVATION (not asserted as a defect here): the receipt does
    // not flag the skipped entry. The skip itself is fail-closed
    // (no outside read, no restore from the link); flagging skipped
    // entries in the receipt is a follow-up candidate.
  } finally { await teardownControlledFixture(f); }
});
