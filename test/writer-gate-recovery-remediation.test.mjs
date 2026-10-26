// Phase N+4 R1 suite (R1-01..R1-23).
// Strict D-01/G-FENCE fence at the journal API boundary, and accurate
// recovery/rollback bookkeeping with measured digests.
//   R1-01: lock-only direct write refuses E_G_FENCE_NO_GO, no mutation.
//   R1-02: lock-only direct clear refuses E_G_FENCE_NO_GO, journal survives.
//   R1-03: lock + valid scoped capability permitted (positive control).
//   R1-04: lock + stale (revoked) capability refused.
//   R1-05: lock + wrong-root capability refused.
//   R1-06: lock + wrong-operation capability refused.
//   R1-07: no lock, no capability clear refuses, journal survives.
//   R1-08: foreign lock refused (with capability).
//   R1-09: released lock refused.
//   R1-10: forged lock refused.
//   R1-11: copied-payload lock refused.
//   R1-12: direct module import cannot bypass the gate (source tripwire).
//   R1-13: post-GO unbound contract retained in both bodies (source order).
//   R1-14: production entrypoints gate before mutation.
//   R1-15: replay complete lifecycle: transition + measured clear.
//   R1-16: replay where restore succeeds but bookkeeping fails (hash mismatch).
//   R1-17: replay where terminal clearance is not legally permitted.
//   R1-18: partial rollback with retained pre-existing journal.
//   R1-19: repeated replay converges after a retained journal.
//   R1-20: journal namespace substitution during replay.
//   R1-21: audit evidence recording failure reported, not swallowed.
//   R1-22: foreign/held lock during recovery refuses before mutation.
//   R1-23: strict-fence tripwire: gate must not be lock-conditional.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile,
} from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const REAL_HELPER = path.join(REPO, 'scripts', 'native', 'vcp-linux-fsops');

const { acquireLifecycleLock } =
  await import('../lib/lifecycle-lock-v2.mjs');
const { writeVersionedJournal, clearVersionedJournal } =
  await import('../lib/versioned-journal.mjs');
const { createControlledFixture, teardownControlledFixture } =
  await import('./helpers/controlled-writer-fixture.mjs');
const { revokeCapabilitiesForFixture } =
  await import('./helpers/controlled-writer-capability.mjs');
const { replayVersionedJournal } =
  await import('../lib/writer-recovery.mjs');
const { rollbackV2 } =
  await import('../lib/writer-rollback-v2.mjs');
const { atomicWriteFile } =
  await import('../lib/writer-atomic.mjs');

async function requireLinux(t) {
  if (process.platform !== 'linux') { t.skip('linux only'); return false; }
  if (!fs.existsSync(REAL_HELPER)) {
    const build = spawnSync('npm', ['run', 'build:native-linux'],
      { cwd: REPO, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stdout + build.stderr);
  }
  return true;
}
async function plainFixture(t) {
  const root = await mkdtemp(path.join(REPO, '.r1-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, '.vcp'));
  return root;
}
const STARTED = {};
const descriptor = (id, phase, extra = {}) => {
  STARTED[id] ??= new Date().toISOString();
  return {
    formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
    backupId: id, operation: 'update', phase,
    minimumReaderVersion: '0.9.4', startedAt: STARTED[id],
    plannedManifestHash: 'a'.repeat(64), createdFiles: [], ...extra,
  };
};
async function lockFixture(t, ops = ['journal-write', 'journal-clear']) {
  const f = await createControlledFixture({ allowedOperations: ops });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const lock = await acquireLifecycleLock(f.root);
  return { f, lock };
}
async function writeLocked(root, lock, desc, previousHash, capability) {
  return writeVersionedJournal(root, desc, {
    previousHash: previousHash ?? null, readerVersion: '0.9.4', lock },
    capability ?? null);
}
const journalExists = (root) =>
  fs.existsSync(path.join(root, '.vcp', 'transaction.json'));

test('R1-01 — lock-only direct write refuses the gate, no mutation', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await plainFixture(t);
  const lock = await acquireLifecycleLock(root);
  await assert.rejects(
    writeVersionedJournal(root, descriptor('r1-j1', 'prepared'),
      { previousHash: null, readerVersion: '0.9.4', lock }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO');
  assert.equal(journalExists(root), false);
  await lock.release();
});

test('R1-02 — lock-only direct clear refuses the gate, journal survives', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('r1-j2', 'prepared'),
    null, f.capability);
  await assert.rejects(
    clearVersionedJournal(root, { expectedHash: out.sha256, lock }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO');
  assert.equal(journalExists(root), true);
  await lock.release();
});

test('R1-03 — lock + valid scoped capability permitted', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('r1-j3', 'prepared'),
    null, f.capability);
  assert.equal(out.anchored, true);
  await clearVersionedJournal(root, { expectedHash: out.sha256, lock },
    f.capability);
  assert.equal(journalExists(root), false);
  await lock.release();
});

test('R1-04 — lock + stale (revoked) capability refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const stale = f.capability;
  revokeCapabilitiesForFixture(f.root);
  await assert.rejects(
    writeLocked(root, lock, descriptor('r1-j4', 'prepared'), null, stale),
    /E_TEST_CAPABILITY/);
  assert.equal(journalExists(root), false);
  await lock.release();
});

test('R1-05 — lock + wrong-root capability refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const g = await createControlledFixture({
    allowedOperations: ['journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(g));
  await assert.rejects(
    writeLocked(f.root, lock, descriptor('r1-j5', 'prepared'),
      null, g.capability),
    /E_TEST_CAPABILITY_SCOPE/);
  assert.equal(journalExists(f.root), false);
  await lock.release();
});

test('R1-06 — lock + wrong-operation capability refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const clearOnly = await createControlledFixture({
    allowedOperations: ['journal-clear'] });
  t.after(() => teardownControlledFixture(clearOnly));
  // Wrong operation: a journal-clear capability cannot authorize a write.
  // (Scope differs too, so accept either capability refusal code.)
  await assert.rejects(
    writeLocked(f.root, lock, descriptor('r1-j6', 'prepared'),
      null, clearOnly.capability),
    /E_TEST_CAPABILITY/);
  assert.equal(journalExists(f.root), false);
  await lock.release();
});

test('R1-07 — no lock, no capability clear refuses, journal survives', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('r1-j7', 'prepared'),
    null, f.capability);
  await lock.release();
  await assert.rejects(
    clearVersionedJournal(root, { expectedHash: out.sha256 }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO');
  assert.equal(journalExists(root), true);
});

test('R1-08 — foreign lock refused with capability', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const g = await createControlledFixture({
    allowedOperations: ['journal-write'] });
  t.after(() => teardownControlledFixture(g));
  await mkdir(path.join(g.root, '.vcp'));
  const foreign = await acquireLifecycleLock(g.root);
  await assert.rejects(
    writeLocked(f.root, foreign, descriptor('r1-j8', 'prepared'),
      null, f.capability),
    /E_LIFECYCLE_LOCK_NOT_OWNED/);
  await foreign.release();
  await lock.release();
});

test('R1-09 — released lock refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  await writeLocked(root, lock, descriptor('r1-j9', 'prepared'),
    null, f.capability);
  await lock.release();
  await assert.rejects(
    writeLocked(root, lock, descriptor('r1-j9', 'applying'),
      null, f.capability),
    /E_LIFECYCLE_LOCK_NOT_OWNED/);
});

test('R1-10 — forged lock refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const forged = { root, operationId: 'r1-j10', mode: 'update' };
  await assert.rejects(
    writeLocked(root, forged, descriptor('r1-j10', 'prepared'),
      null, f.capability),
    /LOCK/);
  assert.equal(journalExists(root), false);
  await lock.release();
});

test('R1-11 — copied-payload lock refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('r1-j11', 'prepared'),
    null, f.capability);
  const lockFile = path.join(root, '.vcp', 'update.lock');
  const sub = path.join(root, '.vcp', 'substitute');
  await cp(lockFile, sub);
  await rename(sub, lockFile);
  await assert.rejects(
    writeLocked(root, lock, descriptor('r1-j11', 'applying'),
      out.sha256, f.capability),
    /E_LIFECYCLE_LOCK_INODE_CHANGED/);
  await rm(lockFile, { force: true });
});

test('R1-12 — direct module import cannot bypass the gate', async (t) => {
  if (!await requireLinux(t)) return;
  // This file imports the journal functions directly (no CLI, no
  // entrypoint) and R1-01/R1-02 prove the import path still gates.
  // Here the source tripwire: both bodies call the gate.
  const src = await readFile(path.join(REPO, 'lib', 'versioned-journal.mjs'), 'utf8');
  for (const fn of ['export async function writeVersionedJournal(',
    'export async function clearVersionedJournal(']) {
    const body = src.slice(src.indexOf(fn));
    const nextExport = body.indexOf('export ', 10);
    const slice = nextExport > 0 ? body.slice(0, nextExport) : body;
    assert.ok(slice.includes('assertManagedMigrationGate();'),
      `${fn} must call the production gate`);
  }
});

test('R1-13 — post-GO unbound contract retained in both bodies', async (t) => {
  if (!await requireLinux(t)) return;
  const src = await readFile(path.join(REPO, 'lib', 'versioned-journal.mjs'), 'utf8');
  for (const fn of ['export async function writeVersionedJournal(',
    'export async function clearVersionedJournal(']) {
    const body = src.slice(src.indexOf(fn));
    const gateAt = body.indexOf('assertManagedMigrationGate();');
    const unboundAt = body.indexOf("reject('E_JOURNAL_UNBOUND')");
    assert.ok(gateAt > 0 && unboundAt > gateAt,
      `${fn}: unbound branch present and ordered after the gate`);
  }
});

test('R1-14 — production entrypoints gate before mutation', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['recovery-replay', 'rollback-v2',
      'journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  await assert.rejects(
    replayVersionedJournal(f.root, {}, null),
    (e) => e && e.code === 'E_G_FENCE_NO_GO');
  await assert.rejects(
    rollbackV2({ root: f.root, backupId: 'x', confirmed: true }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO');
  assert.equal(journalExists(f.root), false);
});

async function replayFixture(t, id, phase = 'prepared') {
  const f = await createControlledFixture({
    allowedOperations: ['recovery-replay', 'journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const lock = await acquireLifecycleLock(f.root);
  await writeLocked(f.root, lock, descriptor(id, phase), null, f.capability);
  await lock.release();
  return f;
}

test('R1-15 — replay complete lifecycle: transition + measured clear', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await replayFixture(t, 'r1-r15');
  const receipt = await replayVersionedJournal(f.root,
    { restore: async () => {} }, f.capability);
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.action, 'restored-from-backup');
  assert.equal(receipt.journalTransition, 'succeeded');
  assert.equal(receipt.journalCleared, true);
  assert.equal(receipt.journalRetained, false);
  assert.equal(receipt.evidenceRecorded, true);
  assert.equal(journalExists(f.root), false);
  const second = await replayVersionedJournal(f.root,
    { restore: async () => {} }, f.capability);
  assert.deepEqual(second, { recovered: false, reason: 'NO_JOURNAL' });
});

test('R1-16 — restore succeeds but bookkeeping fails on hash mismatch', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await replayFixture(t, 'r1-r16');
  const tampered = JSON.stringify({
    ...descriptor('r1-r16', 'prepared'),
    plannedManifestHash: 'c'.repeat(64) }, null, 2) + '\n';
  const receipt = await replayVersionedJournal(f.root, {
    restore: async ({ root }) => {
      await writeFile(path.join(root, '.vcp', 'transaction.json'), tampered);
    } }, f.capability);
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.action, 'restored-from-backup');
  assert.equal(receipt.journalTransition, 'failed');
  assert.equal(receipt.journalError, 'E_JOURNAL_CHANGED');
  assert.equal(receipt.journalCleared, false);
  assert.equal(receipt.journalRetained, true);
  assert.equal(
    await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'),
    tampered, 'tampered journal must be untouched by the failed bookkeeping');
});

test('R1-17 — replay where terminal clearance is not legally permitted', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['recovery-replay', 'journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const lock = await acquireLifecycleLock(f.root);
  const ledger = [
    { path: '.vcp/manifest.json', hash: 'd'.repeat(64) },
    { path: '.vcp/.gitignore', hash: 'e'.repeat(64) } ];
  const initBase = {
    formatVersion: 2, transactionSchemaVersion: 2, id: 'r1-r17',
    operationId: 'r1-r17', backupId: 'r1-r17', operation: 'init',
    minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
    createdFiles: ledger };
  // Cleanup is reachable only via prepared -> recovering -> cleanup.
  let out = await writeLocked(f.root, lock, { ...initBase, phase: 'prepared' },
    null, f.capability);
  out = await writeLocked(f.root, lock, { ...initBase, phase: 'recovering' },
    out.sha256, f.capability);
  await writeLocked(f.root, lock,
    { ...initBase, phase: 'cleanup', cleanupBackupHash: 'f'.repeat(64) },
    out.sha256, f.capability);
  await lock.release();
  // Terminal clearance requires the root to contain exactly .vcp.
  await writeFile(path.join(f.root, 'extra.txt'), 'blocks terminal clearance\n');
  const receipt = await replayVersionedJournal(f.root, {}, f.capability);
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.action, 'finalize');
  assert.equal(receipt.journalTransition, 'skipped-terminal');
  assert.equal(receipt.journalCleared, false);
  assert.equal(receipt.journalRetained, true);
  assert.equal(typeof receipt.journalError, 'string');
  assert.equal(journalExists(f.root), true);
});

async function makeBackup(root, backupId, manifestObj) {
  const { createHash } = await import('node:crypto');
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const base = path.join(root, '.vcp', 'backups', backupId);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const manifestBytes = Buffer.from(JSON.stringify(manifestObj) + '\n');
  await writeFile(path.join(base, 'manifest.json'), manifestBytes);
  const record = { id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4', restoredManifestHash: sha(manifestBytes),
    entries: [] };
  await writeFile(path.join(base, 'backup.json'),
    JSON.stringify(record) + '\n');
  return manifestBytes;
}

test('R1-18 — partial rollback with retained pre-existing journal', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['rollback-v2', 'journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const lock = await acquireLifecycleLock(f.root);
  const pre = await writeLocked(f.root, lock,
    descriptor('r1-r18-pre', 'prepared'), null, f.capability);
  await lock.release();
  const before = await readFile(
    path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
  const manifestBytes = await makeBackup(f.root, 'r1-rb18', { schemaVersion: 2, v: 1 });
  await atomicWriteFile(f.root, '.vcp/manifest.json',
    Buffer.from('{"mutated":true}\n'), { mode: 0o600, managedState: true });
  const receipt = await rollbackV2({ root: f.root, backupId: 'r1-rb18',
    confirmed: true, testCapability: f.capability });
  assert.equal(receipt.rolledBack, true);
  const restored = await readFile(path.join(f.root, '.vcp', 'manifest.json'));
  assert.equal(restored.toString(), manifestBytes.toString());
  assert.equal(receipt.journalTransition, 'skipped-existing');
  assert.equal(receipt.journalCleared, false);
  assert.equal(receipt.journalRetained, true);
  assert.equal(receipt.journalError, 'JOURNAL_ALREADY_EXISTS');
  assert.equal(
    await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'),
    before, 'pre-existing journal must be untouched');
  assert.equal(pre.sha256.length, 64);
});

test('R1-19 — repeated replay converges after a retained journal', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await replayFixture(t, 'r1-r19');
  const tampered = JSON.stringify({
    ...descriptor('r1-r19', 'prepared'),
    plannedManifestHash: 'c'.repeat(64) }, null, 2) + '\n';
  const first = await replayVersionedJournal(f.root, {
    restore: async ({ root }) => {
      await writeFile(path.join(root, '.vcp', 'transaction.json'), tampered);
    } }, f.capability);
  assert.equal(first.journalRetained, true);
  const second = await replayVersionedJournal(f.root,
    { restore: async () => {} }, f.capability);
  assert.equal(second.journalTransition, 'succeeded');
  assert.equal(second.journalCleared, true);
  assert.equal(second.journalRetained, false);
  assert.equal(journalExists(f.root), false);
});

test('R1-20 — journal namespace substitution during replay', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await replayFixture(t, 'r1-r20');
  const before = await readFile(
    path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
  const receipt = await replayVersionedJournal(f.root, {
    restore: async ({ root }) => {
      const dir = path.join(root, '.vcp');
      const aside = dir + '-aside';
      await rename(dir, aside);
      await cp(aside, dir, { recursive: true });
    } }, f.capability);
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.journalTransition, 'failed');
  assert.equal(receipt.journalRetained, true);
  assert.equal(typeof receipt.journalError, 'string');
  assert.equal(
    await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'),
    before, 'substitute journal must be untouched by refused bookkeeping');
});

test('R1-21 — audit evidence failure reported, not swallowed', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await replayFixture(t, 'r1-r21');
  await mkdir(path.join(f.root, '.vcp', 'writer-audit.log'));
  const receipt = await replayVersionedJournal(f.root,
    { restore: async () => {} }, f.capability);
  assert.equal(receipt.recovered, true);
  assert.equal(receipt.journalCleared, true);
  assert.equal(receipt.evidenceRecorded, false);
  assert.equal(typeof receipt.evidenceError, 'string');
});

test('R1-22 — held lock during recovery refuses before mutation', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await replayFixture(t, 'r1-r22');
  const before = await readFile(
    path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
  const held = await acquireLifecycleLock(f.root);
  try {
    await assert.rejects(
      replayVersionedJournal(f.root, { restore: async () => {} }, f.capability),
      /E_LOCK_ALREADY_HELD/);
  } finally { await held.release(); }
  assert.equal(
    await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8'),
    before);
});

test('R1-23 — strict-fence tripwire: gate must not be lock-conditional', async (t) => {
  if (!await requireLinux(t)) return;
  const src = await readFile(path.join(REPO, 'lib', 'versioned-journal.mjs'), 'utf8');
  for (const fn of ['export async function writeVersionedJournal(',
    'export async function clearVersionedJournal(']) {
    const body = src.slice(src.indexOf(fn));
    const nextExport = body.indexOf('export ', 10);
    const slice = nextExport > 0 ? body.slice(0, nextExport) : body;
    assert.ok(!slice.includes('!testCapability&&!lock'),
      `${fn} must not gate only when lock is absent (lock-as-authorization hole)`);
    assert.ok(slice.includes('if(!testCapability){'),
      `${fn} must gate whenever no test capability is present`);
  }
});
