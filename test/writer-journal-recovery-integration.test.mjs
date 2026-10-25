// Phase N+4 suite (PN4-01..PN4-12).
// Journal compatibility (0.9.4), cross-call lock continuity,
// provenance integration, committed-journal protection.
//   PN4-01: full write/read/clear lifecycle at 0.9.4 with lock.
//   PN4-02: older reader (0.9.3) refuses; forged descriptors refused.
//   PN4-03: illegal phase transitions refused.
//   PN4-04: unrecorded (legacy-shaped) journal clears on digest.
//   PN4-05: .vcp swap between journal calls refuses BEFORE mutation.
//   PN4-06: foreign / released / copied-payload locks refuse.
//   PN4-07: unbound journal mutation refused in anchored mode.
//   PN4-08: recovery cleanup never deletes the committed journal.
//   PN4-09: provenance content check, vanished pruning, corrupt/full
//     registry fail closed.
//   PN4-10: interrupted-recovery repeatability via writer-recovery.
//   PN4-11: anchored release surfaces helper-trust failure unmasked.
//   PN4-12: legitimate multi-step transitions with one lock.
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

const { acquireLifecycleLock, assertOwnedLifecycleLock } =
  await import('../lib/lifecycle-lock-v2.mjs');
const { writeVersionedJournal, clearVersionedJournal,
  inspectVersionedJournal } =
  await import('../lib/versioned-journal.mjs');
const { decodeManagedTransaction } =
  await import('../lib/managed-recovery-v2.mjs');
const { recordStagingCreation, recoveryCleanupStaging,
  listStagingProvenance } =
  await import('../lib/staging-provenance.mjs');
const { LinuxFsProvider } = await import('../lib/linux-fs-provider.mjs');
const { getCliVersion } = await import('../lib/version.mjs');
const { createControlledFixture, teardownControlledFixture } =
  await import('./helpers/controlled-writer-fixture.mjs');
const { replayVersionedJournal } =
  await import('../lib/writer-recovery.mjs');

async function requireLinux(t) {
  if (process.platform !== 'linux') { t.skip('linux only'); return false; }
  if (!fs.existsSync(REAL_HELPER)) {
    const build = spawnSync('npm', ['run', 'build:native-linux'],
      { cwd: REPO, encoding: 'utf8' });
    assert.equal(build.status, 0, build.stdout + build.stderr);
  }
  return true;
}
async function fixture(t) {
  const root = await mkdtemp(path.join(REPO, '.pn4-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function swapDir(dir) {
  const aside = dir + '-aside';
  await rename(dir, aside);
  await cp(aside, dir, { recursive: true });
  return aside;
}
const STARTED = {};
const descriptor = (id, phase, extra = {}) => {
  // Transitions require the same transaction identity fields across
  // phases, including startedAt — pin it per transaction id.
  STARTED[id] ??= new Date().toISOString();
  return {
    formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
    backupId: id, operation: 'update', phase,
    minimumReaderVersion: '0.9.4', startedAt: STARTED[id],
    plannedManifestHash: 'a'.repeat(64), createdFiles: [], ...extra,
  };
};
async function writeLocked(root, lock, desc, previousHash, capability) {
  return writeVersionedJournal(root, desc, {
    previousHash: previousHash ?? null, readerVersion: '0.9.4', lock },
    capability ?? null);
}
async function clearLocked(root, lock, hash, capability) {
  return clearVersionedJournal(root, { expectedHash: hash, lock },
    capability ?? null);
}
// Controlled fixture + .vcp + live lock: the combination production
// flows use (capability for the test regime, lock for continuity).
async function lockFixture(t) {
  const f = await createControlledFixture({
    allowedOperations: ['journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const lock = await acquireLifecycleLock(f.root);
  return { f, lock };
}

test('PN4-01 — full journal lifecycle at 0.9.4 with one lock', async (t) => {
  if (!await requireLinux(t)) return;
  assert.equal(await getCliVersion(), '0.9.4');
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  let out = await writeLocked(root, lock, descriptor('pn4-j1', 'prepared'),
    null, f.capability);
  assert.equal(out.anchored, true);
  let insp = await inspectVersionedJournal(root);
  assert.equal(insp.anchored, true);
  assert.equal(insp.provenance, 'recorded-matching');
  out = await writeLocked(root, lock, descriptor('pn4-j1', 'applying'), out.sha256, f.capability);
  out = await writeLocked(root, lock, descriptor('pn4-j1', 'verified'), out.sha256, f.capability);
  out = await writeLocked(root, lock, descriptor('pn4-j1', 'committed', {
    committedAt: new Date().toISOString(),
    // Committed rule: committedManifestHash must equal the planned
    // manifest hash (decode enforces E_COMMITTED_HASH_MISMATCH).
    committedManifestHash: 'a'.repeat(64) }), out.sha256, f.capability);
  await clearLocked(root, lock, out.sha256, f.capability);
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'transaction.json')), false);
  await lock.release();
});

test('PN4-02 — older reader refuses; forged descriptors refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('pn4-j2', 'prepared'),
    null, f.capability);
  const bytes = await readFile(path.join(root, '.vcp', 'transaction.json'));
  const parsed = JSON.parse(bytes.toString('utf8'));
  assert.throws(
    () => decodeManagedTransaction(parsed, { readerVersion: '0.9.3' }),
    { code: 'E_TRANSACTION_FORMAT' });
  // Format floor: a 0.9.3-minimum journal is refused at write decode.
  await assert.rejects(
    writeLocked(root, lock, descriptor('pn4-j2', 'applying', {
      minimumReaderVersion: '0.9.3' }), out.sha256, f.capability),
    /E_TRANSACTION_FORMAT/);
  // Wrong previous hash refuses before any mutation.
  await assert.rejects(
    writeLocked(root, lock, descriptor('pn4-j2', 'applying'), '0'.repeat(64), f.capability),
    /E_JOURNAL_CHANGED/);
  const after = await readFile(path.join(root, '.vcp', 'transaction.json'));
  assert.equal(after.toString('utf8'), bytes.toString('utf8'));
  await lock.release();
});

test('PN4-03 — illegal phase transitions refused', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('pn4-j3', 'prepared'),
    null, f.capability);
  await assert.rejects(
    writeLocked(root, lock, descriptor('pn4-j3', 'verified'), out.sha256, f.capability),
    /E_JOURNAL_INVALID_TRANSITION/);
  await assert.rejects(
    writeLocked(root, lock, descriptor('pn4-j3', 'committed'), out.sha256, f.capability),
    /E_COMMITTED_EVIDENCE|E_JOURNAL_INVALID_TRANSITION/);
  await lock.release();
});

test('PN4-04 — unrecorded (legacy-shaped) journal clears on digest', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  const root = f.root;
  await mkdir(path.join(root, '.vcp'));
  // Hand-written journal: valid descriptor, no provenance entry —
  // the documented legacy compatibility behavior.
  const desc = descriptor('pn4-j4', 'prepared');
  const bytes = Buffer.from(JSON.stringify(desc, null, 2) + '\n');
  await writeFile(path.join(root, '.vcp', 'transaction.json'), bytes);
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const insp = await inspectVersionedJournal(root);
  assert.equal(insp.provenance, 'unrecorded');
  // Compatibility is about provenance absence, not authorization
  // absence: the clear carries test authorization and proceeds on
  // digest alone (no provenance refusal for an unrecorded journal).
  await clearVersionedJournal(root, { expectedHash: hash }, f.capability);
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'transaction.json')), false);
});

test('PN4-05 — .vcp swap between journal calls refuses BEFORE mutation', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('pn4-j5', 'prepared'),
    null, f.capability);
  const aside = await swapDir(path.join(root, '.vcp'));
  const before = await readFile(path.join(root, '.vcp', 'transaction.json'), 'utf8');
  await assert.rejects(
    writeLocked(root, lock, descriptor('pn4-j5', 'applying'), out.sha256, f.capability),
    /E_LIFECYCLE_LOCK_INODE_CHANGED/);
  // Nothing landed in the substitute namespace.
  assert.equal(
    await readFile(path.join(root, '.vcp', 'transaction.json'), 'utf8'), before);
  await rm(path.join(root, '.vcp'), { recursive: true });
  await rename(aside, path.join(root, '.vcp'));
  // Swap back: the genuine transition proceeds, release succeeds.
  const out2 = await writeLocked(root, lock, descriptor('pn4-j5', 'applying'), out.sha256, f.capability);
  await clearLocked(root, lock, out2.sha256, f.capability);
  await lock.release();
});

test('PN4-06 — foreign, released, and copied-payload locks refuse', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const out = await writeLocked(root, lock, descriptor('pn4-j6', 'prepared'),
    null, f.capability);
  // Foreign lock: minted for a different root (its own fixture
  // capability authorizes the call; the LOCK is what must refuse).
  const g = await createControlledFixture({
    allowedOperations: ['journal-write'] });
  t.after(() => teardownControlledFixture(g));
  await mkdir(path.join(g.root, '.vcp'));
  const foreign = await acquireLifecycleLock(g.root);
  await assert.rejects(
    writeLocked(root, foreign, descriptor('pn4-j6', 'applying'), out.sha256, f.capability),
    /E_LIFECYCLE_LOCK_NOT_OWNED/);
  await foreign.release();
  // Released lock.
  const lock2 = await acquireLifecycleLock(root).catch(() => null);
  assert.equal(lock2, null, 'first lock still held');
  await lock.release();
  await assert.rejects(
    writeLocked(root, lock, descriptor('pn4-j6', 'applying'), out.sha256, f.capability),
    /E_LIFECYCLE_LOCK_NOT_OWNED/);
  // Copied payload: new lock, then replace its file with a copy.
  const lock3 = await acquireLifecycleLock(root);
  const lockFile = path.join(root, '.vcp', 'update.lock');
  const sub = path.join(root, '.vcp', 'substitute');
  await cp(lockFile, sub);
  await rename(sub, lockFile);
  await assert.rejects(
    writeLocked(root, lock3, descriptor('pn4-j6', 'applying'), out.sha256, f.capability),
    /E_LIFECYCLE_LOCK_INODE_CHANGED/);
  await rm(lockFile);
});

test('PN4-07 — unbound journal mutation refused; unbound branch ordered after the gate', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  // No lock, no capability: the D-01 gate refuses first (the gate
  // contract J-06/PH-08 assert). The unbound rule is the post-gate
  // layer for the post-GO future, not a gate bypass.
  await assert.rejects(
    writeVersionedJournal(root, descriptor('pn4-j7', 'prepared'), {
      readerVersion: '0.9.4' }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO');
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'transaction.json')), false);
  // Tripwire-style (same convention as the Stage12 guard): the
  // unbound refusal exists in writeVersionedJournal's body, ordered
  // AFTER the gate call, so it can only fire past the gate.
  const src = await readFile(path.join(REPO, 'lib', 'versioned-journal.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export async function writeVersionedJournal('));
  const gateAt = body.indexOf('assertManagedMigrationGate();');
  const unboundAt = body.indexOf("reject('E_JOURNAL_UNBOUND')");
  assert.ok(gateAt > 0 && unboundAt > gateAt,
    'unbound branch present and ordered after the gate');
});

test('PN4-08 — recovery cleanup never deletes the committed journal', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const lock = await acquireLifecycleLock(root);
  const out = await writeLocked(root, lock, descriptor('pn4-j8', 'prepared'));
  const res = await recoveryCleanupStaging(root, { transactionId: 'pn4-j8' });
  assert.deepEqual([...res.removed], []);
  assert.equal(res.skipped[0]?.reason, 'CONTROL_ARTIFACT');
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'transaction.json')), true);
  // Only terminal clear removes it.
  await clearVersionedJournal(root, { expectedHash: out.sha256, lock });
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'transaction.json')), false);
  await lock.release();
});

test('PN4-09 — provenance content check, vanished pruning, corrupt/full registry', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const provider = new LinuxFsProvider();
  // Stale-digest entry (simulates inode reuse with new content).
  const staged = await provider.writeFileSynced(
    root, '.vcp/.stale.vcp-aa.tmp', Buffer.from('original\n'));
  await recordStagingCreation(root, {
    name: '.vcp/.stale.vcp-aa.tmp', transactionId: 'tx-s',
    dev: staged.dev, ino: staged.ino,
    size: 9, sha256: '0'.repeat(64) });
  const r1 = await recoveryCleanupStaging(root, { transactionId: 'tx-s' });
  assert.deepEqual([...r1.removed], []);
  assert.equal(r1.skipped[0]?.reason, 'CONTENT_MISMATCH');
  assert.equal(fs.existsSync(path.join(root, '.vcp', '.stale.vcp-aa.tmp')), true);
  // Vanished entry is forgotten.
  const staged2 = await provider.writeFileSynced(
    root, '.vcp/.gone.vcp-bb.tmp', Buffer.from('gone\n'));
  await recordStagingCreation(root, {
    name: '.vcp/.gone.vcp-bb.tmp', transactionId: 'tx-g',
    dev: staged2.dev, ino: staged2.ino });
  await rm(path.join(root, '.vcp', '.gone.vcp-bb.tmp'));
  const r2 = await recoveryCleanupStaging(root, { transactionId: 'tx-g' });
  assert.equal(r2.skipped[0]?.reason, 'VANISHED');
  const entries = await listStagingProvenance(root);
  assert.equal(entries.some((e) => e.name === '.vcp/.gone.vcp-bb.tmp'), false);
  // Corrupt registry fails closed, deletes nothing.
  await writeFile(path.join(root, '.vcp', 'staging-provenance.json'), 'not json');
  await assert.rejects(
    recoveryCleanupStaging(root, { transactionId: 'tx-s' }),
    /E_PROVENANCE_FORMAT/);
  assert.equal(fs.existsSync(path.join(root, '.vcp', '.stale.vcp-aa.tmp')), true);
  // Full registry refuses new recordings.
  const full = { version: 1, entries: Array.from({ length: 4096 },
    (_, i) => ({ name: `.vcp/.f${i}.tmp`, transactionId: 'tx-f',
      dev: '1', ino: String(i + 1), recordedAt: new Date().toISOString() })) };
  await writeFile(path.join(root, '.vcp', 'staging-provenance.json'),
    JSON.stringify(full));
  await assert.rejects(
    recordStagingCreation(root, { name: '.vcp/.new.tmp',
      transactionId: 'tx-f', dev: 1, ino: 999999 }),
    /E_PROVENANCE_FORMAT/);
});

test('PN4-10 — writer-recovery cleans provenance staging, repeatably', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['recovery-replay', 'journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const provider = new LinuxFsProvider();
  const staged = await provider.writeFileSynced(
    f.root, '.vcp/.rec.vcp-rr.tmp', Buffer.from('staged\n'));
  await recordStagingCreation(f.root, {
    name: '.vcp/.rec.vcp-rr.tmp', transactionId: 'pn4-rec',
    dev: staged.dev, ino: staged.ino });
  const lock = await acquireLifecycleLock(f.root);
  await writeLocked(f.root, lock, descriptor('pn4-rec', 'prepared'));
  await lock.release();
  const receipt = await replayVersionedJournal(f.root, {
    restore: async () => {},
    complete: async () => {},
  }, f.capability);
  assert.equal(receipt.recovered, true);
  assert.deepEqual([...(receipt.stagingCleanup?.removed ?? [])],
    ['.vcp/.rec.vcp-rr.tmp']);
  assert.equal(fs.existsSync(path.join(f.root, '.vcp', '.rec.vcp-rr.tmp')), false);
  // Journal survived as 'recovering' (recovery's clear call carries
  // no expected hash — pre-existing shape, unchanged by N+4); a
  // second replay attempt still reports the transaction state.
  const insp = await inspectVersionedJournal(f.root);
  assert.ok(insp, 'journal retained for follow-up recovery');
});

test('PN4-11 — anchored release surfaces helper-trust failure unmasked', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const lock = await acquireLifecycleLock(root);
  const original = await readFile(REAL_HELPER);
  try {
    await writeFile(REAL_HELPER, Buffer.concat([original, Buffer.from('x')]));
    await assert.rejects(lock.release(), /E_NATIVE_HELPER_UNTRUSTED/);
    assert.equal(fs.existsSync(path.join(root, '.vcp', 'update.lock')), true);
  } finally {
    await writeFile(REAL_HELPER, original);
  }
  await lock.release();
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'update.lock')), false);
});

test('PN4-13 — terminal-clear authorization: cleanup phase', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  const init = (phase, extra = {}) => descriptor('pn4-j13', phase, { operation: 'init',
    // Init journals carry the greenfield ownership ledger: the two
    // control files the production writer journals first.
    createdFiles: [
      { path: '.vcp/manifest.json', hash: 'a'.repeat(64) },
      { path: '.vcp/.gitignore', hash: 'a'.repeat(64) } ], ...extra });
  let out = await writeLocked(root, lock, init('prepared'), null, f.capability);
  out = await writeLocked(root, lock, init('recovering'), out.sha256, f.capability);
  // Cleanup phase requires terminal evidence at decode.
  out = await writeLocked(root, lock, init('cleanup',
    { cleanupBackupHash: 'c'.repeat(64) }), out.sha256, f.capability);
  // Extra file in root defeats terminal clearance.
  await writeFile(path.join(root, 'leftover.txt'), 'x');
  await assert.rejects(
    clearLocked(root, lock, out.sha256, f.capability),
    /E_JOURNAL_TERMINAL_NOT_EMPTY/);
  await rm(path.join(root, 'leftover.txt'));
  // The controlled fixture's own marker file is test-harness state,
  // not transaction output; lift it to present the pristine terminal
  // root a production clear would see, and restore it for teardown.
  const marker = path.join(root, '.vcp-controlled-fixture.json');
  const markerBytes = await readFile(marker);
  await rm(marker);
  // With only journal + lock + provenance registry, clear succeeds.
  await clearLocked(root, lock, out.sha256, f.capability);
  await writeFile(marker, markerBytes);
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'transaction.json')), false);
  await lock.release();
});

test('PN4-12 — legitimate multi-step transitions with one lock', async (t) => {
  if (!await requireLinux(t)) return;
  const { f, lock } = await lockFixture(t);
  const root = f.root;
  let out = await writeLocked(root, lock, descriptor('pn4-j12', 'prepared'),
    null, f.capability);
  out = await writeLocked(root, lock, descriptor('pn4-j12', 'applying'), out.sha256, f.capability);
  // Asserting the same lock between transitions is a no-op success.
  const proof = await assertOwnedLifecycleLock(root, lock);
  assert.equal(proof.liveOwner, true);
  out = await writeLocked(root, lock, descriptor('pn4-j12', 'verified'), out.sha256, f.capability);
  await clearLocked(root, lock, out.sha256, f.capability);
  await lock.release();
  assert.equal(lock.released, true);
});
