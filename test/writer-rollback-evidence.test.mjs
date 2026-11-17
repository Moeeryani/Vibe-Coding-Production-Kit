// P5-02 — rollbackV2 fail-closed restore-evidence tests + v1/v2 CLI boundary.
//
// The P5 rule (design.md §6.2): every restored file is judged against
// the best available evidence — a committed Stage 13 transaction, a
// committed versioned journal carrying postApplyFiles, or the backup
// record itself. A file unchanged since the backup, or matching its
// post-apply hash, is safe. A change no record accounts for refuses
// (E_ROLLBACK_EVIDENCE_MISSING / E_ROLLBACK_STALE_TRANSACTION);
// there is no destructive fallback from "record missing" to
// "restore anyway".
//
// The v1/v2 boundary (R-INT-1): live `vcp rollback` calls frozen v1
// rollbackProject; rollbackV2 has no CLI caller. These tests pin
// that boundary: v1 succeeds on v1 backups, refuses schema-v2 and
// versioned-journal state, and the CLI never calls rollbackV2.
//
// Controlled lane only for the rollbackV2 tests: disposable fixtures,
// gate-bypassed mutations through the controlled lane. See
// B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md. The v1 boundary tests
// use plain disposable tmpdirs, like test/update-rollback-guard.test.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
import { describeStage13Transaction } from '../lib/stage13-transaction.mjs';
import {
  describeVersionedTransaction, describeVersionedBackup,
} from '../lib/managed-recovery-v2.mjs';
import { getCliVersion } from '../lib/version.mjs';
import { constructAdaptiveManifest } from '../lib/manifest-v2.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { createBackup } from '../lib/state.mjs';
import { rollbackProject } from '../lib/update.mjs';

const LANE_APPROVED_FOR_EXECUTION = true;
const gate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['rollback-v2', 'journal-write', 'journal-clear'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const ORIGINAL = Buffer.from('PROTECTED ORIGINAL USER BYTES\n');
const APPLIED = Buffer.from('APPLIED BYTES AFTER ADOPTION\n');
const USER_EDIT = Buffer.from('USER EDIT AFTER BACKUP - must survive\n');

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
  const record = {
    id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4',
    restoredManifestHash: sha256(manifestBytes),
    entries: recordEntries,
  };
  await writeFile(path.join(base, 'backup.json'), JSON.stringify(record, null, 2) + '\n');
  return { manifestBytes, record };
}

async function writeCommittedStage13Tx(root, { phase = 'committed', items, manifestSha256, rootIdentity = null }) {
  const st = await lstat(root, { bigint: true });
  const identity = rootIdentity ??
    sha256(Buffer.from(root + '|' + st.dev + '|' + st.ino));
  const tx = describeStage13Transaction({
    id: 'adopt-20261031-01', rootIdentity: identity,
    consentFingerprint: 'b'.repeat(64),
    manifestSha256, minimumReaderVersion: '0.9.4',
    createdAt: '2026-10-31T00:00:00.000Z', phase,
    items, createdDirectories: []
  });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify(tx, null, 2) + '\n');
  return tx;
}

function agentsSectionItem() {
  return { path: 'AGENTS.md', kind: 'managed-section', sectionId: 'agent-routing',
    stagedDev: '7', stagedIno: '9',
    oldSha256: sha256(ORIGINAL), oldMode: 0o644,
    originalDev: '7', originalIno: '11',
    newSha256: sha256(APPLIED), baselineSha256: sha256(ORIGINAL) };
}

async function setupBackupFixture(f, backupId) {
  await atomicWriteFile(f.root, 'AGENTS.md', APPLIED, { mode: 0o644 });
  await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 },
    [{ relative: 'AGENTS.md', bytes: ORIGINAL }]);
  const manifestBytes = Buffer.from('{"schemaVersion":2,"v":1}\n');
  await atomicWriteFile(f.root, '.vcp/manifest.json', manifestBytes,
    { mode: 0o600, managedState: true });
  return { manifestBytes, manifestSha256: sha256(manifestBytes) };
}

// A valid committed versioned journal (formatVersion 2) for this backup,
// optionally carrying per-file post-apply evidence.
async function writeCommittedJournal(root, { backupId, manifestSha256, postApplyFiles = [] }) {
  const journal = describeVersionedTransaction({
    operationId: backupId, backupId, operation: 'update', phase: 'committed',
    minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
    plannedManifestHash: manifestSha256,
    committedAt: new Date().toISOString(), committedManifestHash: manifestSha256,
    postApplyFiles,
  });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify(journal, null, 2) + '\n');
  return journal;
}

const rollback = (f, backupId) =>
  rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability });

gateNestedMut('P5-02-R3 — wrong-root transaction: stale record refuses, edit survives', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r3';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256, items: [agentsSectionItem()],
      rootIdentity: sha256(Buffer.from('some-other-root|1|2')),
    });
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(() => rollback(f, backupId),
      (e) => e.code === 'E_ROLLBACK_STALE_TRANSACTION' && /transaction-root-mismatch/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R4a — committed journal without postApplyFiles: unaccounted edit refuses', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r4a';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedJournal(f.root, { backupId, manifestSha256 });
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(() => rollback(f, backupId),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING' && /journal-no-post-apply-files/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R4b — committed journal WITH postApplyFiles, no edit: proceeds, evidence journal', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r4b';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedJournal(f.root, { backupId, manifestSha256,
      postApplyFiles: [{ path: 'AGENTS.md', sha256: sha256(APPLIED) }] });
    const receipt = await rollback(f, backupId);
    assert.equal(receipt.rolledBack, true);
    assert.equal(receipt.postApplyCheck, 'passed');
    assert.equal(receipt.postApplyEvidence, 'journal');
    assert.ok(receipt.postApplyCovered.includes('AGENTS.md'));
    assert.equal(receipt.manifestChecked, true);
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R4c — committed journal WITH postApplyFiles + edit: refuses', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r4c';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedJournal(f.root, { backupId, manifestSha256,
      postApplyFiles: [{ path: 'AGENTS.md', sha256: sha256(APPLIED) }] });
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(() => rollback(f, backupId),
      (e) => e.code === 'E_ROLLBACK_POST_APPLY_EDITS' && /AGENTS\.md/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R6b — tampered Stage13 transaction: unaccounted edit refuses', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r6b';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    const tx = await writeCommittedStage13Tx(f.root, {
      manifestSha256, items: [agentsSectionItem()],
    });
    // Tamper: replace the post-apply hash with a non-hex string. The
    // transaction no longer validates, so it is not evidence at all.
    const tampered = JSON.parse(JSON.stringify(tx));
    tampered.items[0].newSha256 = 'not-a-hash';
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(tampered, null, 2) + '\n');
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(() => rollback(f, backupId),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING' && /post-apply-record-malformed/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R7 — transaction item missing newSha256: unaccounted edit refuses', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r7';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    const tx = await writeCommittedStage13Tx(f.root, {
      manifestSha256, items: [agentsSectionItem()],
    });
    const broken = JSON.parse(JSON.stringify(tx));
    delete broken.items[0].newSha256;
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(broken, null, 2) + '\n');
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(() => rollback(f, backupId),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING' && /post-apply-record-malformed/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R8 — manifest deleted after apply (R14): proceeds, receipt names it', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r8';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256, items: [agentsSectionItem()],
    });
    // No user edit; the manifest was deleted after the apply.
    await rm(path.join(f.root, '.vcp', 'manifest.json'));
    const backupManifestBytes = await readFile(
      path.join(f.root, '.vcp', 'backups', backupId, 'manifest.json'));
    const receipt = await rollback(f, backupId);
    assert.equal(receipt.rolledBack, true);
    assert.equal(receipt.postApplyCheck, 'passed');
    assert.equal(receipt.manifestChecked, false);
    assert.equal(receipt.manifestReason, 'deleted-after-apply');
    assert.ok(receipt.postApplyCovered.includes('AGENTS.md'));
    assert.ok(!receipt.postApplyCovered.includes('.vcp/manifest.json'));
    // The manifest is restored from the tamper-checked backup
    // (the backup's own manifest bytes, not the current manifest's).
    assert.deepEqual(await readFile(path.join(f.root, '.vcp', 'manifest.json')), backupManifestBytes);
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R9 — second rollback after a successful first: already-completed, no mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r9';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256, items: [agentsSectionItem()],
    });
    const txBefore = await readFile(path.join(f.root, '.vcp', 'transaction.json'));
    const first = await rollback(f, backupId);
    assert.equal(first.rolledBack, true);
    assert.equal(first.postApplyCheck, 'passed');
    assert.equal(first.markerWritten, true);
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
    // The transaction is byte-identical: never deleted, never mutated.
    assert.deepEqual(await readFile(path.join(f.root, '.vcp', 'transaction.json')), txBefore);
    // The backup record carries the consume marker. The marker's
    // manifest hash is the BACKUP manifest's hash (which is also
    // restoredManifestHash), not the current manifest's hash.
    const recordAfter = JSON.parse(await readFile(
      path.join(f.root, '.vcp', 'backups', backupId, 'backup.json'), 'utf8'));
    assert.equal(typeof recordAfter.rollbackCompletedAt, 'string');
    assert.equal(recordAfter.rollbackCompletedManifestSha256,
      recordAfter.restoredManifestHash);
    assert.equal(recordAfter.id, backupId);
    // The repeat call reports already-completed and mutates nothing.
    const second = await rollback(f, backupId);
    assert.equal(second.rolledBack, false);
    assert.equal(second.alreadyCompleted, true);
    assert.equal(second.postApplyCheck, 'already-completed');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
    assert.deepEqual(await readFile(path.join(f.root, '.vcp', 'transaction.json')), txBefore);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R10 — no record + no change: proceeds, evidence backup-hash', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r10';
    await setupBackupFixture(f, backupId);
    // No transaction at all, and the current bytes already equal the
    // backup bytes: restoring is a no-op for the files, so nothing
    // can be destroyed.
    await atomicWriteFile(f.root, 'AGENTS.md', ORIGINAL, { mode: 0o644 });
    const receipt = await rollback(f, backupId);
    assert.equal(receipt.rolledBack, true);
    assert.equal(receipt.postApplyCheck, 'passed');
    assert.equal(receipt.postApplyEvidence, 'backup-hash');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R11 — recovery transition carries postApplyFiles forward (no evidence drop)', async () => {
  const { replayVersionedJournal } = await import('../lib/writer-recovery.mjs');
  const f = await createControlledFixture({
    allowedOperations: ['recovery-replay', 'journal-write', 'journal-clear'],
  });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    const backupId = 'p5-02-r11';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    // A verified-phase journal carrying post-apply evidence. Replay
    // must transition it to 'recovering' (via transitionDescriptor)
    // WITHOUT dropping the evidence — otherwise the transition
    // equality check rejects and the journal is retained.
    const journal = describeVersionedTransaction({
      operationId: backupId, backupId, operation: 'update', phase: 'verified',
      minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
      plannedManifestHash: manifestSha256,
      postApplyFiles: [{ path: 'AGENTS.md', sha256: sha256(APPLIED) }],
    });
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(journal, null, 2) + '\n');
    const receipt = await replayVersionedJournal(f.root, {
      complete: async () => {},
    }, f.capability);
    assert.equal(receipt.recovered, true);
    assert.equal(receipt.action, 'completed');
    assert.equal(receipt.journalTransition, 'succeeded');
    assert.equal(receipt.journalCleared, true);
    assert.equal(receipt.journalRetained, false);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R12 — backup entry file deleted: restore proceeds and the receipt flags the skipped entry (R-INT-10)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p5-02-r12';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256, items: [agentsSectionItem()],
    });
    // The backup entry file is gone (the record still names it). The
    // evidence check judges the live bytes, which match the recorded
    // apply, so the restore proceeds — but the receipt must flag the
    // skip instead of reporting restoredFiles:[] with no flag.
    await rm(path.join(f.root, '.vcp', 'backups', backupId, 'files', 'AGENTS.md'));
    const backupManifestBytes = await readFile(
      path.join(f.root, '.vcp', 'backups', backupId, 'manifest.json'));
    const receipt = await rollback(f, backupId);
    assert.equal(receipt.rolledBack, true);
    assert.deepEqual(receipt.restoredFiles, []);
    assert.deepEqual(receipt.skippedEntries,
      [{ relative: 'AGENTS.md', reason: 'backup-file-missing' }]);
    // The manifest is restored from the tamper-checked backup (the
    // backup's own manifest bytes, not the current manifest's).
    assert.deepEqual(await readFile(path.join(f.root, '.vcp', 'manifest.json')), backupManifestBytes);
  } finally { await teardownControlledFixture(f); }
});

// --- v1/v2 CLI boundary (R-INT-1) ---

test('P5-02-B1 — live v1 rollback on a v1 backup still succeeds (CLI behavior unchanged)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p5-02-b1-'));
  const backup = await createBackup(root, [], { installedVersion: '0.8.0' });
  const restored = await rollbackProject({ targetDir: root, backupId: backup.id });
  assert.equal(restored.backupId, backup.id);
  assert.equal(restored.restoredVersion, '0.8.0');
});

test('P5-02-B2 — live v1 rollback refuses schema-v2 state', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'vcp-p5-02-b2-'));
  const targetDir = path.join(sandbox, 'proj');
  await mkdir(targetDir, { recursive: true });
  await seedLegacyV1Fixture({ targetDir });
  const v1 = JSON.parse(await readFile(path.join(targetDir, '.vcp', 'manifest.json'), 'utf8'));
  const v2 = constructAdaptiveManifest({ legacyShape: v1,
    assetSet: 'legacy-full-v1', readerVersion: await getCliVersion() });
  await writeFile(path.join(targetDir, '.vcp', 'manifest.json'),
    JSON.stringify(v2, null, 2) + '\n');
  await assert.rejects(
    rollbackProject({ targetDir }),
    /Legacy rollback refuses schema-v2 state/);
});

test('P5-02-B3 — live v1 rollback refuses versioned-journal state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p5-02-b3-'));
  const backupId = 'p5-02-b3';
  const manifestBytes = Buffer.from('{"schemaVersion":2,"v":1}\n');
  const manifestHash = sha256(manifestBytes);
  await mkdir(path.join(root, '.vcp', 'backups', backupId), { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, '.vcp', 'backups', backupId, 'manifest.json'), manifestBytes);
  const backup = describeVersionedBackup({ id: backupId, operationId: backupId,
    operation: 'update',
    preLockSnapshot: { vcpDirectoryExisted: true, manifestExisted: true,
      baselinesExisted: false, lockBootstrapCreatedVcpDirectory: false,
      installedVersion: '0.9.3' },
    entries: [], minimumReaderVersion: '0.9.4',
    restoredManifestHash: manifestHash });
  await writeFile(path.join(root, '.vcp', 'backups', backupId, 'backup.json'),
    JSON.stringify(backup, null, 2) + '\n');
  const journal = describeVersionedTransaction({ operationId: backupId,
    backupId, operation: 'update', phase: 'prepared',
    minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
    plannedManifestHash: manifestHash });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify(journal, null, 2) + '\n');
  await assert.rejects(
    rollbackProject({ targetDir: root }),
    /Versioned recovery state requires the dedicated schema-v2 handler/);
});

test('P5-02-B4 — the CLI never calls rollbackV2 (live rollback is v1 only)', async () => {
  const cli = await readFile(
    path.join(import.meta.dirname, '..', 'lib', 'cli.mjs'), 'utf8');
  assert.ok(!cli.includes('rollbackV2'),
    'lib/cli.mjs must not reference rollbackV2');
  assert.ok(cli.includes('rollbackProject'),
    'lib/cli.mjs must still call the frozen v1 rollbackProject');
  const handler = cli.slice(cli.indexOf("parsed.command === 'rollback'"));
  assert.ok(handler.includes('rollbackProject'),
    'the rollback command handler must call rollbackProject');
});
