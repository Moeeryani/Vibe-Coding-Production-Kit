// Phase N+3 adversarial suite (PN3-01..PN3-10).
// R-2 closure targets: descriptor-bound lifecycle lock and
// versioned journal, plus the staging provenance contract.
//   PN3-01: anchored lock lifecycle (acquire/assert/release).
//   PN3-02: lock file replacement refuses assert and release.
//   PN3-03: .vcp copy-swap before release refuses; nothing deleted.
//   PN3-04: concurrent acquisition + foreign lock never stolen.
//   PN3-05: anchored journal write records provenance.
//   PN3-06: byte-identical journal in a copied namespace refuses
//     clear on provenance; the genuine journal clears.
//   PN3-07: recovery cleanup deletes only provenance-proven
//     artifacts of the recovered transaction; substitution and
//     foreign files survive; repeat runs are stable.
//   PN3-08: whole-root replacement between authorization and use.
//   PN3-09: audit evidence records the transaction's lock mode.
//   PN3-10: symlinked .vcp refuses lock acquisition, creates
//     nothing at the target.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cp, lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile,
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
  readVersionedJournalDigest } =
  await import('../lib/versioned-journal.mjs');
const { recordStagingCreation, recoveryCleanupStaging,
  listUnknownStaging, listStagingProvenance } =
  await import('../lib/staging-provenance.mjs');
const { LinuxFsProvider } = await import('../lib/linux-fs-provider.mjs');
const { recordWriterEvidence } =
  await import('../lib/production-writer.mjs');
const { createControlledFixture, teardownControlledFixture } =
  await import('./helpers/controlled-writer-fixture.mjs');

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
  const root = await mkdtemp(path.join(REPO, '.pn3-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function swapDir(dir) {
  const aside = dir + '-aside';
  await rename(dir, aside);
  await cp(aside, dir, { recursive: true });
  return aside;
}
const descriptor = (id) => ({
  formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
  backupId: id, operation: 'update', phase: 'prepared',
  minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
  plannedManifestHash: 'a'.repeat(64), createdFiles: [],
});

test('PN3-01 — anchored lock lifecycle: acquire, assert, release', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const lock = await acquireLifecycleLock(root);
  assert.equal(lock.anchored, true);
  const proof = await assertOwnedLifecycleLock(root, lock);
  assert.equal(proof.liveOwner, true);
  await lock.release();
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'update.lock')), false);
});

test('PN3-02 — replaced lock file refuses assert and release; substitute survives', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const lock = await acquireLifecycleLock(root);
  const lockFile = path.join(root, '.vcp', 'update.lock');
  // Allocate the substitute while the original exists (distinct
  // inode), then substitute it for the original.
  const sub = path.join(root, '.vcp', 'substitute');
  await cp(lockFile, sub);
  await rename(sub, lockFile);
  await assert.rejects(assertOwnedLifecycleLock(root, lock),
    /E_LIFECYCLE_LOCK_INODE_CHANGED/);
  await assert.rejects(lock.release(), /E_LOCK_OWNERSHIP/);
  assert.equal(fs.existsSync(lockFile), true, 'substitute preserved');
});

test('PN3-03 — .vcp copy-swap before release refuses; substitute lock intact', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const lock = await acquireLifecycleLock(root);
  const aside = await swapDir(path.join(root, '.vcp'));
  await assert.rejects(lock.release(), /E_STATE_BOOTSTRAP_CHANGED/);
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'update.lock')), true,
    'lock in the substitute namespace untouched');
  await rm(path.join(root, '.vcp'), { recursive: true });
  await rename(aside, path.join(root, '.vcp'));
  await lock.release();
  assert.equal(fs.existsSync(path.join(root, '.vcp', 'update.lock')), false);
});

test('PN3-04 — concurrent acquisition refused; foreign lock never stolen', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const first = await acquireLifecycleLock(root);
  await assert.rejects(acquireLifecycleLock(root), /E_LOCK_ALREADY_HELD/);
  await first.release();
  // A foreign pre-existing lock file is not ours to remove.
  const foreign = path.join(root, '.vcp', 'update.lock');
  await writeFile(foreign, '{"foreign":true}\n');
  await assert.rejects(acquireLifecycleLock(root), /E_LOCK_ALREADY_HELD/);
  assert.equal(await readFile(foreign, 'utf8'), '{"foreign":true}\n');
});

test('PN3-05 — anchored journal write records matching provenance', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const out = await writeVersionedJournal(f.root, descriptor('pn3-j1'),
    { readerVersion: '0.9.4' }, f.capability);
  assert.equal(out.anchored, true);
  const st = await lstat(path.join(f.root, '.vcp', 'transaction.json'),
    { bigint: true });
  assert.equal(out.identity.dev, st.dev.toString());
  assert.equal(out.identity.ino, st.ino.toString());
  const entries = await listStagingProvenance(f.root);
  const mine = entries.find((e) => e.name === '.vcp/transaction.json');
  assert.ok(mine, 'provenance entry recorded');
  assert.equal(mine.transactionId, 'pn3-j1');
  assert.equal(mine.ino, st.ino.toString());
  const digest = await readVersionedJournalDigest(f.root);
  assert.equal(digest, out.sha256);
});

test('PN3-06 — identical journal in copied namespace refuses clear (provenance)', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const out = await writeVersionedJournal(f.root, descriptor('pn3-j2'),
    { readerVersion: '0.9.4' }, f.capability);
  const aside = await swapDir(path.join(f.root, '.vcp'));
  // Byte-identical content, copied registry — different inodes.
  await assert.rejects(
    clearVersionedJournal(f.root, { expectedHash: out.sha256 },
      f.capability),
    /E_JOURNAL_CHANGED/);
  assert.equal(
    fs.existsSync(path.join(f.root, '.vcp', 'transaction.json')), true);
  await rm(path.join(f.root, '.vcp'), { recursive: true });
  await rename(aside, path.join(f.root, '.vcp'));
  // Phase N+4: in the genuine namespace the provenance check
  // PASSES and the clear now SUCCEEDS — the 0.9.3 decode blocker
  // is fixed by the 0.9.4 development version (clear decodes with
  // reader 0.9.4 >= minimum 0.9.4). The journal is removed and its
  // provenance entry forgotten.
  await clearVersionedJournal(f.root, { expectedHash: out.sha256 },
    f.capability);
  assert.equal(
    fs.existsSync(path.join(f.root, '.vcp', 'transaction.json')), false);
  const entries = await listStagingProvenance(f.root);
  assert.equal(
    entries.some((e) => e.name === '.vcp/transaction.json'), false,
    'provenance forgotten after proven clear');
});

test('PN3-07 — recovery cleanup: provenance-bound, substitution-safe, repeatable', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const provider = new LinuxFsProvider();
  async function stage(name, tx) {
    const r = await provider.writeFileSynced(
      root, `.vcp/${name}`, Buffer.from('staged\n'));
    await recordStagingCreation(root, {
      name: `.vcp/${name}`, transactionId: tx, dev: r.dev, ino: r.ino });
    return r;
  }
  await stage('.stage-a.vcp-aa.tmp', 'tx-a');
  const b = await stage('.stage-b.vcp-bb.tmp', 'tx-b');
  // Foreign pattern-named artifact: no provenance.
  await writeFile(path.join(root, '.vcp', '.foreign.vcp-cc.tmp'), 'x\n');
  const first = await recoveryCleanupStaging(root, { transactionId: 'tx-a' });
  assert.deepEqual([...first.removed], ['.vcp/.stage-a.vcp-aa.tmp']);
  assert.equal(fs.existsSync(path.join(root, '.vcp', '.stage-b.vcp-bb.tmp')), true);
  assert.equal(fs.existsSync(path.join(root, '.vcp', '.foreign.vcp-cc.tmp')), true);
  // Substitute tx-b's artifact (new inode, same name/content).
  const sub = path.join(root, '.vcp', 'sub-file');
  await writeFile(sub, 'staged\n');
  await rename(sub, path.join(root, '.vcp', '.stage-b.vcp-bb.tmp'));
  const second = await recoveryCleanupStaging(root, { transactionId: 'tx-b' });
  assert.deepEqual([...second.removed], []);
  assert.equal(second.skipped[0]?.reason, 'IDENTITY_MISMATCH');
  assert.equal(fs.existsSync(path.join(root, '.vcp', '.stage-b.vcp-bb.tmp')), true);
  // Unknown-provenance listing reports, never deletes. The
  // substituted tx-b artifact is KNOWN (it has an entry) but
  // identity-mismatched — reported by cleanup above, not here.
  const unknown = await listUnknownStaging(root, '.vcp', /\.tmp$/);
  assert.deepEqual([...unknown], ['.vcp/.foreign.vcp-cc.tmp']);
  // Repeatability: tx-a again -> nothing removed, no error.
  const third = await recoveryCleanupStaging(root, { transactionId: 'tx-a' });
  assert.deepEqual([...third.removed], []);
  void b;
});

test('PN3-08 — whole-root replacement refuses lock assert and journal clear', async (t) => {
  if (!await requireLinux(t)) return;
  const f = await createControlledFixture({
    allowedOperations: ['journal-write', 'journal-clear'] });
  t.after(() => teardownControlledFixture(f));
  await mkdir(path.join(f.root, '.vcp'));
  const lock = await acquireLifecycleLock(f.root);
  const out = await writeVersionedJournal(f.root, descriptor('pn3-j3'),
    { readerVersion: '0.9.4' }, f.capability);
  const aside = f.root + '-aside';
  await rename(f.root, aside);
  await cp(aside, f.root, { recursive: true });
  await assert.rejects(assertOwnedLifecycleLock(f.root, lock),
    /E_LIFECYCLE_LOCK_INODE_CHANGED/);
  // The clear is refused — in this fixture environment the
  // capability layer's own root-identity guard fires first; the
  // journal-provenance layer's refusal is proven in PN3-06.
  await assert.rejects(
    clearVersionedJournal(f.root, { expectedHash: out.sha256 },
      f.capability),
    /E_JOURNAL|E_TEST_CAPABILITY_IDENTITY/);
  assert.equal(
    fs.existsSync(path.join(f.root, '.vcp', 'transaction.json')), true,
    'journal in the copied tree untouched');
  await rm(f.root, { recursive: true, force: true });
  await rename(aside, f.root);
  await lock.release();
});

test('PN3-09 — writer evidence records the lock mode of its transaction', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  await recordWriterEvidence({
    root, operation: 'pn3-evidence', principal: null,
    result: { ok: true }, lock: { anchored: true } });
  const lines = (await readFile(
    path.join(root, '.vcp', 'writer-audit.log'), 'utf8')).trim().split('\n');
  const entry = JSON.parse(lines.at(-1));
  assert.equal(entry.lockAnchored, true);
  assert.ok(entry.namespace?.parent, 'namespace recorded (N+2)');
});

test('PN3-10 — symlinked .vcp refuses lock acquisition; nothing created at target', async (t) => {
  if (!await requireLinux(t)) return;
  const root = await fixture(t);
  const elsewhere = await fixture(t);
  await symlink(elsewhere, path.join(root, '.vcp'), 'dir');
  await assert.rejects(acquireLifecycleLock(root), /E_/);
  assert.deepEqual(fs.readdirSync(elsewhere), [],
    'no lock or state created through the symlink');
});
