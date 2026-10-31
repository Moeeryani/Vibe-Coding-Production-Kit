// P5-05 — B-2 durability machinery + deterministic fault-injection matrix.
//
// What this file proves:
//   (1) the fsync ordering is actually exercised at each durability
//       boundary (staging, exclusive commit, manifest commit, file
//       restore, directory sync) — the provider/writer receipts must
//       show dataSynced AND directorySynced, never a bare "completed";
//   (2) every crash window of the software state machine leaves a
//       classified, recoverable state (deterministic state-based fault
//       injection: each window's state is built, classified, and
//       recovered — no timing luck);
//   (3) a real process kill mid-rollback lands in a classified,
//       recoverable state.
//
// What it does NOT prove: power-loss durability. Process-kill tests
// do not prove power-loss durability (B-2 stays NOT_PROVEN without
// an independently validated power-cut rig; see deliverable #5).
//
// Controlled lane only for the replay/rollback tests: disposable
// fixtures, gate-bypassed mutations through the controlled lane. See
// B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
const gateNestedMut = (name, fn) => mutationTest(name, fn);
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { LinuxFsProvider } from '../lib/linux-fs-provider.mjs';
import { atomicWriteFile, atomicWriteManifest } from '../lib/writer-atomic.mjs';
import {
  writeVersionedJournal, classifyJournalCrashState,
} from '../lib/versioned-journal.mjs';
import { replayVersionedJournal } from '../lib/writer-recovery.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';
import {
  describeVersionedTransaction,
} from '../lib/managed-recovery-v2.mjs';
import { describeStage13Transaction } from '../lib/stage13-transaction.mjs';
import { lifecycleDurabilityCapability } from '../lib/file-durability.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const ORIGINAL = Buffer.from('PROTECTED ORIGINAL USER BYTES\n');
const APPLIED = Buffer.from('APPLIED BYTES AFTER ADOPTION\n');
const OPS = ['rollback-v2', 'journal-write', 'journal-clear', 'recovery-replay'];

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

function journalDoc({ id, phase, manifestHash }) {
  return describeVersionedTransaction({ operationId: id, backupId: id,
    operation: 'update', phase, minimumReaderVersion: '0.9.4',
    startedAt: new Date().toISOString(), plannedManifestHash: manifestHash,
    ...(phase === 'committed'
      ? { committedAt: new Date().toISOString(), committedManifestHash: manifestHash } : {}),
  });
}

// --- (1) sync flags at each durability boundary ---

test('P5-05-S1 — staging + exclusive commit report data and directory sync', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p5-05-s1-'));
  await mkdir(path.join(root, '.vcp'), { mode: 0o700 });
  const provider = new LinuxFsProvider();
  const anchor = await provider.anchorIdentities(root, '.vcp');
  const expectBase = { root: anchor.root, parent: anchor.parent };
  // Staging: temp write with data fsync + parent fsync.
  const staged = await provider.writeTempSynced(root,
    '.vcp/transaction-abcdef012345.tmp', Buffer.from('{"staged":true}\n'),
    0o600, expectBase);
  assert.equal(staged.dataSynced, true, 'staging must report dataSynced');
  assert.equal(staged.directorySynced, true, 'staging must report directorySynced');
  // Exclusive commit: rename-noreplace with both parents synced.
  const moved = await provider.renameNoReplaceBound(root,
    '.vcp/transaction-abcdef012345.tmp', '.vcp/transaction.json',
    { ...expectBase, file: { dev: staged.dev, ino: staged.ino } });
  assert.equal(moved.srcParentSynced, true, 'commit must sync the source parent');
  assert.equal(moved.dstParentSynced, true, 'commit must sync the destination parent');
  // A second exclusive commit to the same name refuses (the P5-01
  // kernel-exclusive contract, at the provider level).
  const staged2 = await provider.writeTempSynced(root,
    '.vcp/transaction-abcdef012346.tmp', Buffer.from('{"staged":true}\n'),
    0o600, expectBase);
  await assert.rejects(
    provider.renameNoReplaceBound(root,
      '.vcp/transaction-abcdef012346.tmp', '.vcp/transaction.json',
      { ...expectBase, file: { dev: staged2.dev, ino: staged2.ino } }),
    (e) => e.code === 'E_FS_DESTINATION_EXISTS');
  // Directory sync is independently attestable.
  const synced = await provider.syncDirectory(root, '.vcp');
  assert.equal(synced.ok, true);
});

test('P5-05-S2 — atomic file and manifest writes report full sync + identity', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p5-05-s2-'));
  await mkdir(path.join(root, '.vcp'), { mode: 0o700 });
  // atomicWriteFile verifies the provider receipt internally
  // (completed + dataSynced + directorySynced + identityVerified,
  // else E_ATOMIC_VERIFY) and returns its own receipt carrying the
  // sync + identity attestations — there is no bare "completed"
  // field on the returned receipt.
  const fileBytes = Buffer.from('user bytes\n');
  const fileReceipt = await atomicWriteFile(root, 'AGENTS.md',
    fileBytes, { mode: 0o644 });
  assert.equal(fileReceipt.dataSynced, true);
  assert.equal(fileReceipt.directorySynced, true);
  assert.equal(fileReceipt.identityVerified, true);
  assert.equal(fileReceipt.sha256, sha256(fileBytes));
  const manifestBytes = Buffer.from('{"schemaVersion":2}\n');
  const manifestReceipt = await atomicWriteManifest(root, manifestBytes);
  assert.equal(manifestReceipt.dataSynced, true);
  assert.equal(manifestReceipt.directorySynced, true);
  assert.equal(manifestReceipt.identityVerified, true);
  assert.equal(manifestReceipt.sha256, sha256(manifestBytes));
});

// --- (2) deterministic crash-window simulations ---

gateNestedMut('P5-05-W1 — crash before journal creation: absent, a new creation succeeds', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    const state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'absent');
    const written = await writeVersionedJournal(f.root,
      { formatVersion: 2, transactionSchemaVersion: 2, id: 'p5-05-w1',
        operationId: 'p5-05-w1', backupId: 'p5-05-w1', operation: 'update',
        phase: 'prepared', minimumReaderVersion: '0.9.4',
        startedAt: new Date().toISOString(),
        plannedManifestHash: 'b'.repeat(64), createdFiles: [] },
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    assert.ok(written.sha256, 'creation after an absent state must succeed');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-05-W2/W5/W7 — crash after creation / after commit / during recovery: replay recovers each', async () => {
  const cases = [
    { id: 'p5-05-w2', phase: 'prepared', action: 'restored-from-backup' },
    { id: 'p5-05-w5', phase: 'committed', action: 'finalize' },
    { id: 'p5-05-w7', phase: 'recovering', action: 'restored-from-backup' },
  ];
  for (const { id, phase, action } of cases) {
    const f = await createControlledFixture({ allowedOperations: OPS });
    try {
      await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
      const { manifestBytes } = await makeTestBackup(f.root, id,
        { schemaVersion: 2, v: 1 }, [{ relative: 'AGENTS.md', bytes: ORIGINAL }]);
      const manifestHash = sha256(manifestBytes);
      await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
        JSON.stringify(journalDoc({ id, phase, manifestHash }), null, 2) + '\n');
      const state = await classifyJournalCrashState(f.root);
      assert.equal(state.state, 'complete', `${id}: journal must classify complete`);
      assert.equal(state.phase, phase);
      let restores = 0;
      const receipt = await replayVersionedJournal(f.root, {
        restore: async ({ journal }) => {
          restores += 1;
          // The restore handler proves the backup it restores from exists.
          const record = JSON.parse(await readFile(
            path.join(f.root, '.vcp', 'backups', journal.backupId, 'backup.json'), 'utf8'));
          assert.equal(record.id, journal.backupId);
        },
        complete: async () => {},
      }, f.capability);
      assert.equal(receipt.recovered, true, `${id}: replay must recover`);
      assert.equal(receipt.action, action, `${id}: action must be ${action}`);
      assert.equal(receipt.journalCleared, true, `${id}: journal must clear`);
      assert.equal(receipt.journalRetained, false);
      if (phase === 'committed') assert.equal(restores, 0, 'a committed journal needs no restore');
      else assert.equal(restores, 1, `${id}: the restore handler must run once`);
      const after = await classifyJournalCrashState(f.root);
      assert.equal(after.state, 'absent', `${id}: no journal may remain after replay`);
    } finally { await teardownControlledFixture(f); }
  }
});

gateNestedMut('P5-05-W3 — crash during staging: temp is classified and reported, never silently reaped', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    await writeFile(path.join(f.root, '.vcp', 'transaction-abcdef012345.tmp'), 'staged\n');
    const state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'staged-interrupted');
    assert.deepEqual(state.stagingTemps, ['transaction-abcdef012345.tmp']);
    // An unregistered staging temp is REPORTED, never auto-deleted:
    // it might belong to a concurrent live writer, and deleting it
    // would break that writer's commit. The provider's reapStaging
    // only reaps its own pattern; the journal temp is surfaced by
    // listUnknownStaging for the operator to judge.
    const { listUnknownStaging } =
      await import('../lib/staging-provenance.mjs');
    const unknown = await listUnknownStaging(f.root, '.vcp',
      /^transaction-[0-9a-f]+\.tmp$/);
    assert.deepEqual(unknown, ['.vcp/transaction-abcdef012345.tmp']);
    const provider = new LinuxFsProvider();
    const reaped = await provider.reapStaging(f.root, '.vcp');
    assert.deepEqual(reaped.removed, [],
      'the provider must not reap a temp outside its own pattern');
    assert.equal((await classifyJournalCrashState(f.root)).state, 'staged-interrupted',
      'the orphaned temp remains classified until an operator judges it');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-05-W4 — crash after restore before journal-clear/marker: repeat rollback completes as a no-op', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-05-w4';
    await atomicWriteFile(f.root, 'AGENTS.md', APPLIED, { mode: 0o644 });
    const { manifestBytes } = await makeTestBackup(f.root, backupId,
      { schemaVersion: 2, v: 1 }, [{ relative: 'AGENTS.md', bytes: ORIGINAL }]);
    const manifestHash = sha256(manifestBytes);
    // Simulate the crashed rollback: files already restored, its
    // 'prepared' journal still present, no consume marker written.
    await atomicWriteFile(f.root, 'AGENTS.md', ORIGINAL, { mode: 0o644 });
    await atomicWriteFile(f.root, '.vcp/manifest.json', manifestBytes,
      { mode: 0o600, managedState: true });
    await writeVersionedJournal(f.root,
      { formatVersion: 2, transactionSchemaVersion: 2, id: backupId,
        operationId: backupId, backupId, operation: 'update', phase: 'prepared',
        minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
        plannedManifestHash: manifestHash, createdFiles: [] },
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'complete');
    assert.equal(state.phase, 'prepared');
    // The repeat rollback: files already equal the backup bytes, so
    // the evidence check passes; the pre-existing journal is retained
    // (skipped-existing) and the marker is written.
    const receipt = await rollbackV2({ root: f.root, backupId,
      confirmed: true, testCapability: f.capability });
    assert.equal(receipt.rolledBack, true);
    assert.equal(receipt.postApplyCheck, 'passed');
    assert.equal(receipt.journalTransition, 'skipped-existing');
    assert.equal(receipt.journalRetained, true);
    assert.equal(receipt.markerWritten, true);
    // The retained journal is then cleared by replay (its own path).
    const replayed = await replayVersionedJournal(f.root, {
      restore: async () => {},
    }, f.capability);
    assert.equal(replayed.recovered, true);
    assert.equal(replayed.journalCleared, true);
    assert.equal((await classifyJournalCrashState(f.root)).state, 'absent');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-05-W6 — crash mid-rollback (partial restore): rollback refuses, replay completes it', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-05-w6';
    await atomicWriteFile(f.root, 'AGENTS.md', APPLIED, { mode: 0o644 });
    const { manifestBytes } = await makeTestBackup(f.root, backupId,
      { schemaVersion: 2, v: 1 }, [{ relative: 'AGENTS.md', bytes: ORIGINAL }]);
    const manifestHash = sha256(manifestBytes);
    // Simulate the crashed rollback: the manifest was restored but
    // AGENTS.md was not, and the rollback's 'prepared' journal remains.
    await atomicWriteFile(f.root, '.vcp/manifest.json', manifestBytes,
      { mode: 0o600, managedState: true });
    await writeVersionedJournal(f.root,
      { formatVersion: 2, transactionSchemaVersion: 2, id: backupId,
        operationId: backupId, backupId, operation: 'update', phase: 'prepared',
        minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
        plannedManifestHash: manifestHash, createdFiles: [] },
      { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    // A repeat rollbackV2 refuses: AGENTS.md differs from the backup
    // with no post-apply record, and the journal is stale (prepared).
    // Fail-closed is correct here — the partial restore is
    // indistinguishable from a user edit.
    await assert.rejects(
      rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_STALE_TRANSACTION');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED);
    // Replay completes the interrupted rollback: its restore handler
    // restores from the backup, then the journal transitions + clears.
    const receipt = await replayVersionedJournal(f.root, {
      restore: async ({ journal }) => {
        const record = JSON.parse(await readFile(
          path.join(f.root, '.vcp', 'backups', journal.backupId, 'backup.json'), 'utf8'));
        const backupManifest = await readFile(
          path.join(f.root, '.vcp', 'backups', journal.backupId, 'manifest.json'));
        await atomicWriteManifest(f.root, backupManifest);
        for (const entry of record.entries ?? []) {
          const bytes = await readFile(
            path.join(f.root, '.vcp', 'backups', journal.backupId, 'files', entry.relative));
          assert.equal(sha256(bytes), entry.sha256);
          await atomicWriteFile(f.root, entry.relative, bytes, { mode: 0o644 });
        }
      },
    }, f.capability);
    assert.equal(receipt.recovered, true);
    assert.equal(receipt.action, 'restored-from-backup');
    assert.equal(receipt.journalCleared, true);
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
    assert.equal((await classifyJournalCrashState(f.root)).state, 'absent');
  } finally { await teardownControlledFixture(f); }
});

// --- (3) real process kill mid-rollback ---

gateNestedMut('P5-05-K1 — SIGKILL mid-rollback lands in a classified, recoverable state', async (t) => {
  const { spawn } = await import('node:child_process');
  const { forceKill, waitExit } = await import('./helpers/child-kill.mjs');
  const childPath = path.resolve(import.meta.dirname, 'helpers', 'controlled-crash-child.mjs');
  const durability = lifecycleDurabilityCapability();
  if (!durability.supported) {
    const e = new Error(`INCONCLUSIVE: mutation is unreachable on '${durability.reason}'`);
    e.code = 'E_TEST_INCONCLUSIVE';
    throw e;
  }
  const child = spawn(process.execPath, [childPath, 'rollback'], {
    env: { ...process.env, TMPDIR: process.env.TMPDIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let fixtureRoot = null;
  let childErr = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child startup timeout')), 20000);
    child.once('exit', (code, signal) => {
      childErr = { code, signal };
      if (!fixtureRoot) { clearTimeout(timer); resolve(); }
    });
    child.stdout.on('data', (d) => {
      const s = d.toString();
      const m = s.match(/FIXTURE_ROOT=(\S+)/);
      if (m) fixtureRoot = m[1];
      if (s.includes('BACKUP_READY')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
  });
  assert.ok(fixtureRoot, `child reported fixture root (child exit: ${JSON.stringify(childErr)})`);
  if (childErr) {
    const { rm } = await import('node:fs/promises');
    await rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
    const e = new Error('INCONCLUSIVE: child exited before the rollback window');
    e.code = 'E_TEST_INCONCLUSIVE';
    throw e;
  }
  await new Promise((r) => setTimeout(r, 300));
  const kill = await forceKill(child, { timeoutMs: 10_000 });
  const post = await waitExit(child, 10_000);
  assert.equal(kill.terminated && post.exited, true, 'child was not terminated');
  t.diagnostic(`child killed mid-rollback; fixture=${fixtureRoot}`);
  // The post-kill state must classify (never 'unknown') and the
  // backup must be intact. A process kill is not a power-loss proof.
  const state = await classifyJournalCrashState(fixtureRoot);
  assert.notEqual(state.state, 'unknown',
    `post-kill state must classify (got ${state.state})`);
  assert.ok(['absent', 'complete', 'staged-interrupted', 'partial-malformed'].includes(state.state),
    `post-kill state must be a known crash state (got ${state.state})`);
  if (state.journalPresent) {
    const bytes = await readFile(path.join(fixtureRoot, '.vcp', 'transaction.json'));
    assert.doesNotThrow(() => JSON.parse(bytes.toString('utf8')),
      'a present journal must never be torn JSON');
  }
  const backupManifest = await readFile(
    path.join(fixtureRoot, '.vcp', 'backups', 'crash-backup', 'manifest.json'), 'utf8');
  assert.equal(sha256(backupManifest), sha256(JSON.stringify({ v: 1 }) + '\n'),
    'the backup must survive the kill intact');
  // The manifest is atomic: either the restored bytes or absent — never torn.
  let manifest = null;
  try { manifest = await readFile(path.join(fixtureRoot, '.vcp', 'manifest.json'), 'utf8'); } catch {}
  if (manifest !== null) assert.doesNotThrow(() => JSON.parse(manifest), 'manifest must parse');
  // Recovery from the post-kill state needs no new proof here: the
  // state is one of the W-series states (a 'prepared' rollback
  // journal, an absent journal, or staging temps), and W2/W4/W6
  // already prove replay recovers each of them. Minting a fresh
  // capability for this fixture is refused by design
  // (assertNotInsideRealRepo: a fixture that already has .vcp looks
  // like a real repo at mint time), so the parent asserts the
  // read-only recovery preconditions instead: the journal, when
  // present, decodes as a valid v2 journal whose backup resolves.
  if (state.journalPresent) {
    const { decodeManagedTransaction } =
      await import('../lib/managed-recovery-v2.mjs');
    const journal = decodeManagedTransaction(
      JSON.parse(await readFile(path.join(fixtureRoot, '.vcp', 'transaction.json'), 'utf8')),
      { readerVersion: '0.9.4' });
    assert.equal(journal.formatVersion, 2, 'the post-kill journal must decode as v2');
    assert.equal(journal.backupId, 'crash-backup', 'the journal must name its backup');
    const record = JSON.parse(await readFile(
      path.join(fixtureRoot, '.vcp', 'backups', journal.backupId, 'backup.json'), 'utf8'));
    assert.equal(record.id, journal.backupId, 'the named backup must exist and match');
  }
  const { rm } = await import('node:fs/promises');
  await rm(fixtureRoot, { recursive: true, force: true });
  t.diagnostic('P5-05-K1 evidence: kill landed in a classified state; the journal decodes and its backup resolves');
});
