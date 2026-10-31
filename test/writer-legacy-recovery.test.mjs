// P5-03 — legacy recovery + OD-4 fail-closed classification.
//
// OD-4 direction: fail closed on ambiguous legacy state and provide
// an actionable manual recovery contract. An unknown transaction is
// never reinterpreted as absent: a legacy v1 journal, a malformed
// journal, and a journal written for a newer reader all refuse
// automated replay before any mutation, and the journal bytes are
// left untouched for manual recovery (see the P5 manual recovery
// runbook, deliverable #4).
//
// Controlled lane only for the replay tests: disposable fixtures,
// gate-bypassed mutations through the controlled lane. See
// B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
const gateNestedMut = (name, fn) => mutationTest(name, fn);
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { replayVersionedJournal } from '../lib/writer-recovery.mjs';
import { classifyJournalCrashState } from '../lib/versioned-journal.mjs';
import {
  decodeManagedTransaction, decodeBackupMetadata,
  describeVersionedTransaction,
} from '../lib/managed-recovery-v2.mjs';
import { probeD01PublishedLegacyCli } from '../lib/d01-linux-isolation-fixture.mjs';

const OPS = ['recovery-replay', 'journal-write', 'journal-clear'];

async function writeJournal(f, text) {
  await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
  await writeFile(path.join(f.root, '.vcp', 'transaction.json'), text);
  return text;
}

gateNestedMut('P5-03-A — legacy v1 journal: replay refuses, journal untouched, classifier agrees', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const bytes = await writeJournal(f,
      JSON.stringify({ id: 'legacy-1', phase: 'committed', backupId: 'legacy-1' }) + '\n');
    const state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'legacy');
    await assert.rejects(
      replayVersionedJournal(f.root, {}, f.capability),
      (e) => e.code === 'E_RECOVERY_LEGACY_JOURNAL');
    assert.equal(await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'), bytes,
      'a legacy journal is quarantined, never deleted or overwritten');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-03-B — malformed journal: replay refuses, journal untouched, classifier agrees', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const bytes = await writeJournal(f, '{torn json\n');
    const state = await classifyJournalCrashState(f.root);
    assert.equal(state.state, 'partial-malformed');
    await assert.rejects(
      replayVersionedJournal(f.root, {}, f.capability),
      (e) => e.code === 'E_RECOVERY_JOURNAL_TORN');
    assert.equal(await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'), bytes,
      'a torn journal is quarantined, never deleted');
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-03-C — journal for a newer reader: decode refuses, no mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    // Built with minimumReaderVersion 99.0.0 (self-consistent), but
    // this CLI is 0.9.4: the decoder must refuse instead of trusting
    // the journal about our capability.
    const journal = describeVersionedTransaction({
      operationId: 'p5-03-c', backupId: 'p5-03-c', operation: 'update',
      phase: 'prepared', minimumReaderVersion: '99.0.0',
      startedAt: new Date().toISOString(),
      plannedManifestHash: 'e'.repeat(64),
    });
    const bytes = await writeJournal(f, JSON.stringify(journal, null, 2) + '\n');
    await assert.rejects(
      replayVersionedJournal(f.root, {}, f.capability),
      (e) => e.code === 'E_TRANSACTION_FORMAT');
    assert.equal(await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'), bytes);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-03-D — replay twice: second replay returns NO_JOURNAL (idempotent)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    const journal = describeVersionedTransaction({
      operationId: 'p5-03-d', backupId: 'p5-03-d', operation: 'update',
      phase: 'prepared', minimumReaderVersion: '0.9.4',
      startedAt: new Date().toISOString(),
      plannedManifestHash: 'e'.repeat(64),
    });
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(journal, null, 2) + '\n');
    let restores = 0;
    const handlers = { restore: async () => { restores += 1; } };
    const first = await replayVersionedJournal(f.root, handlers, f.capability);
    assert.equal(first.recovered, true);
    assert.equal(first.action, 'restored-from-backup');
    assert.equal(first.journalTransition, 'succeeded');
    assert.equal(first.journalCleared, true);
    assert.equal(first.journalRetained, false);
    assert.equal(restores, 1);
    const second = await replayVersionedJournal(f.root, handlers, f.capability);
    assert.deepEqual({ recovered: second.recovered, reason: second.reason },
      { recovered: false, reason: 'NO_JOURNAL' });
    assert.equal(restores, 1, 'the restore handler must not run twice');
  } finally { await teardownControlledFixture(f); }
});

test('P5-03-E — bwrap canary fails closed with a D01 code, never a raw OS error', async () => {
  // F-VAL-6: an absent bwrap binary threw a raw ENOENT from lstat.
  // In this tree both approved bwrap paths exist, so the absent-
  // binary branch cannot be exercised without mutating /usr/bin
  // (unacceptable for a test); the validator's cell, where bwrap may
  // be absent, must exercise it (see the P5 validation handoff).
  // What IS exercisable here: an unusable bwrap path refuses with a
  // D01 fail-closed code, never a raw OS error.
  const fixture = { root: '/tmp/vcp-p5-03-e', oldUid: 1000, oldGid: 1000,
    setprivPath: '/usr/bin/setpriv', projects: [] };
  const staged = { kind: 'D01_STAGED_PUBLISHED_OLD_CLI_V1',
    packageRoot: '/tmp/vcp-p5-03-e/legacy-package/package' };
  await assert.rejects(
    probeD01PublishedLegacyCli(fixture, staged, { bwrapPath: '/tmp/no-such-bwrap' }),
    (e) => typeof e.code === 'string' && e.code.startsWith('E_D01_'));
});

test('P5-03-F — legacy records are read-only visible, never silently upgraded', () => {
  // A v1 backup (no formatVersion) decodes as legacy: visible for
  // inspection, with no v2 capability claimed for it.
  const backup = decodeBackupMetadata({ id: 'legacy-1', entries: [] });
  assert.equal(backup.formatVersion, 1);
  assert.equal(backup.legacy, true);
  assert.equal(backup.recoveryCapability, 'legacy');
  // A v1 journal decodes as legacy with an explicit manual-recovery
  // recommendation — it is never mistaken for a v2 journal and never
  // treated as absent.
  const journal = decodeManagedTransaction(
    { id: 'legacy-1', phase: 'committed', backupId: 'legacy-1' });
  assert.equal(journal.formatVersion, 1);
  assert.equal(journal.legacy, true);
  assert.equal(journal.committed, false);
  assert.equal(journal.recommendation, 'require-manual-legacy-recovery');
});

test('P5-03-G — unknown journal fields refuse decoding (no silent tolerance)', () => {
  assert.throws(
    () => decodeManagedTransaction({ formatVersion: 2, transactionSchemaVersion: 2,
      operation: 'update', id: 'x', operationId: 'x', backupId: 'x',
      phase: 'prepared', minimumReaderVersion: '0.9.4',
      startedAt: new Date().toISOString(), plannedManifestHash: 'e'.repeat(64),
      unexpectedField: true }),
    (e) => e.code === 'E_TRANSACTION_UNKNOWN_FIELDS');
  assert.throws(
    () => decodeBackupMetadata({ formatVersion: 2, backupSchemaVersion: 2,
      minimumReaderVersion: '0.9.4', restoredManifestHash: 'e'.repeat(64),
      id: 'x', operationId: 'x', operation: 'update',
      priorVcpDirectoryExisted: true, priorManifestExisted: true,
      priorBaselinesExisted: false, priorInstalledVersion: '0.9.3',
      lockBootstrapCreatedVcpDirectory: false, entries: [],
      unexpectedField: true }),
    (e) => e.code === 'E_BACKUP_UNKNOWN_FIELDS');
});
