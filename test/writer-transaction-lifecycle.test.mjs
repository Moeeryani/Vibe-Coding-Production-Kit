// Phase N+2 — secure transaction lifecycle tests.
//
// PN2-01/02: Finding 003 — reap provenance (no anchor → no deletions;
//   mid-sweep substitution skipped, never unanchored).
// PN2-03:    S3b — stat-preserving helper swap refused by an
//   already-measured instance (per-spawn content re-verification).
// PN2-04..06: R-3 — anchored audit evidence (namespace + helper hash
//   recorded; redirection and tamper refuse; NO_MANAGED_STATE kept).
// PN2-07:    R-2 — journal namespace pin (content-identical .vcp
//   copy is a different namespace).
// PN2-08:    R-2 — lock ownership survives .vcp copy-swap attempts:
//   assertions refuse, release deletes nothing in the substitute.
// PN2-09:    provider append is identity-bound end to end.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

const { LinuxFsProvider } = await import('../lib/linux-fs-provider.mjs');
const { recordWriterEvidence } = await import('../lib/production-writer.mjs');
const { acquireLifecycleLock, assertOwnedLifecycleLock } =
  await import('../lib/lifecycle-lock-v2.mjs');
const { pinJournalNamespace, assertJournalNamespace } =
  await import('../lib/versioned-journal.mjs');

async function requireLinux(t) {
  if (process.platform !== 'linux') { t.skip('linux only'); return false; }
  if (!fs.existsSync(REAL_HELPER)) {
    spawnSync('npm', ['run', 'build:native-linux'],
      { cwd: REPO, stdio: 'ignore' });
  }
  return true;
}
async function fresh(t, label) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pn2-' + label + '-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const sha256 = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('PN2-01 — Finding 003: anchor failure means reap deletes NOTHING', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const name = '.doc.txt.vcp-ab12cd34.tmp';
  await writeFile(path.join(root, name), 'STAGED-LEFTOVER');
  const provider = new LinuxFsProvider();
  // Deterministic anchor failure (any cause: namespace churn, IO).
  provider.anchorIdentities = async () => {
    const e = new Error('E_FS_OS_ERROR: ENOENT'); e.code = 'E_FS_OS_ERROR'; throw e;
  };
  const reaped = await provider.reapStaging(root, '.');
  assert.deepEqual(reaped.removed, []);
  assert.deepEqual(reaped.skipped, [name]);
  assert.equal(reaped.refused, 'E_FS_ANCHOR_UNAVAILABLE');
  assert.equal(await readFile(path.join(root, name), 'utf8'), 'STAGED-LEFTOVER',
    'failure to establish provenance must never enable unanchored deletion');
});

test('PN2-02 — reap: mid-sweep substitution is skipped, substitute survives', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const name = '.doc.txt.vcp-ab12cd34.tmp';
  const target = path.join(root, name);
  await writeFile(target, 'ORIGINAL-STAGED');
  const provider = new LinuxFsProvider();
  const origStat = provider.statIdentity.bind(provider);
  let swapped = false;
  provider.statIdentity = async (...a) => {
    const doc = await origStat(...a);
    if (!swapped && a[1] === name) {
      // substitute between the reap's stat of the FILE and its unlink;
      // allocate the substitute's inode while the original still
      // exists so inode reuse cannot mask the swap
      swapped = true;
      const sub = target + '.sub';
      await writeFile(sub, 'ATTACKER-REAP');
      await rm(target);
      await rename(sub, target);
    }
    return doc;
  };
  const reaped = await provider.reapStaging(root, '.');
  assert.deepEqual(reaped.removed, []);
  assert.deepEqual(reaped.skipped, [name]);
  assert.equal(await readFile(target, 'utf8'), 'ATTACKER-REAP');
});

test('PN2-03 — S3b: stat-preserving helper swap refused by a measured instance', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const bin = await fresh(t, 'bin');
  const h = path.join(bin, 'vcp-linux-fsops');
  await cp(REAL_HELPER, h);
  await cp(REAL_HELPER + '.manifest.json', h + '.manifest.json');
  await cp(REAL_HELPER + '.cpp', h + '.cpp');
  fs.chmodSync(h, 0o755);
  // Variant binary: same-length string change, padded to exact size.
  const src = fs.readFileSync(REAL_HELPER + '.cpp', 'utf8')
    .replace('cannot open root directory', 'cannot open root directorx');
  const vSrc = path.join(bin, 'v.cpp');
  await writeFile(vSrc, src);
  spawnSync('c++', ['-std=c++17', '-O2', '-o', path.join(bin, 'v'), vSrc],
    { stdio: 'ignore' });
  const variant = path.join(bin, 'v');
  const sizeReal = fs.lstatSync(h).size;
  const sizeVar = fs.lstatSync(variant).size;
  if (sizeVar < sizeReal) fs.appendFileSync(variant, Buffer.alloc(sizeReal - sizeVar));
  assert.equal(fs.lstatSync(variant).size, sizeReal);
  assert.notEqual(sha256(variant), sha256(h));

  const provider = new LinuxFsProvider({ helperPath: h });
  await provider.statIdentity(root, '.');           // instance measures
  const m = fs.lstatSync(h);
  fs.copyFileSync(variant, h);                       // in place, same inode
  fs.utimesSync(h, m.atimeMs / 1000, m.mtimeMs / 1000); // float-exact mtime
  const after = fs.lstatSync(h);
  assert.equal(after.ino, m.ino);
  assert.equal(after.size, m.size);
  assert.equal(after.mtimeMs, m.mtimeMs);
  await assert.rejects(provider.statIdentity(root, '.'),
    /E_NATIVE_HELPER_UNTRUSTED/,
    'metadata is not proof of content: the swapped binary must refuse');
});

test('PN2-04 — R-3: evidence append is anchored and self-describing', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, '.vcp'));
  const receipt = await recordWriterEvidence(
    { root, operation: 'pn2Probe', result: { ok: true } });
  assert.deepEqual(receipt, { audited: true, anchored: true });
  const log = await readFile(path.join(root, '.vcp', 'writer-audit.log'), 'utf8');
  const entry = JSON.parse(log.trim());
  assert.equal(entry.operation, 'pn2Probe');
  assert.match(entry.namespace.root, /^\d+:\d+$/);
  assert.match(entry.namespace.parent, /^\d+:\d+$/);
  const manifest = JSON.parse(
    fs.readFileSync(REAL_HELPER + '.manifest.json', 'utf8'));
  assert.equal(entry.helperSha256, manifest.binarySha256);
  const receipt2 = await recordWriterEvidence(
    { root, operation: 'pn2Probe2', result: { ok: true } });
  assert.deepEqual(receipt2, { audited: true, anchored: true });
  const lines = (await readFile(path.join(root, '.vcp', 'writer-audit.log'), 'utf8'))
    .trim().split('\n');
  assert.equal(lines.length, 2, 'append-only: both entries present');
});

test('PN2-05 — R-3: evidence refuses redirection (symlinked .vcp) and helper tamper', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  await symlink(outside, path.join(root, '.vcp'), 'dir');
  await assert.rejects(
    recordWriterEvidence({ root, operation: 'pn2Evil', result: {} }),
    /E_FS_(OS_ERROR|IDENTITY_CHANGED|SYMLINK)/,
    'evidence must not be written through a substituted .vcp');
  assert.equal(fs.existsSync(path.join(outside, 'writer-audit.log')), false);
});

test('PN2-06 — R-3: NO_MANAGED_STATE receipt preserved on the anchored path', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const receipt = await recordWriterEvidence(
    { root, operation: 'pn2None', result: {} });
  assert.deepEqual(receipt, { audited: false, reason: 'NO_MANAGED_STATE' });
});

test('PN2-07 — R-2: journal namespace pin detects a content-identical .vcp copy', async t => {
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, '.vcp'));
  await writeFile(path.join(root, '.vcp', 'transaction.json'), '{"x":1}\n');
  const pin = await pinJournalNamespace(root);
  await assertJournalNamespace(root, pin);   // unchanged: passes
  await rename(path.join(root, '.vcp'), path.join(root, '.vcp-orig'));
  await cp(path.join(root, '.vcp-orig'), path.join(root, '.vcp'),
    { recursive: true });
  // Content is byte-identical; the namespace is not the pinned one.
  await assert.rejects(assertJournalNamespace(root, pin),
    /E_JOURNAL_NAMESPACE_CHANGED/);
});

test('PN2-08 — R-2: lock ownership refuses a .vcp copy-swap; release deletes nothing there', async t => {
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, '.vcp'));
  const lock = await acquireLifecycleLock(root, { mode: 'update' });
  await rename(path.join(root, '.vcp'), path.join(root, '.vcp-orig'));
  await cp(path.join(root, '.vcp-orig'), path.join(root, '.vcp'),
    { recursive: true });
  await assert.rejects(assertOwnedLifecycleLock(root, lock),
    /E_LIFECYCLE_LOCK_INODE_CHANGED/);
  await assert.rejects(lock.release(), /E_STATE_BOOTSTRAP_CHANGED/);
  assert.equal(
    fs.existsSync(path.join(root, '.vcp', 'update.lock')), true,
    'release must not delete a lock file in a substituted namespace');
});

test('PN2-09 — append is identity-bound: parent swap between anchor and append refuses', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, 'sub'));
  const provider = new LinuxFsProvider();
  const anchor = await provider.anchorIdentities(root, 'sub');
  const ok = await provider.appendFileSynced(root, 'sub/audit.log',
    Buffer.from('one\n'), { root: anchor.root, parent: anchor.parent });
  assert.equal(ok.dataSynced, true);
  await rename(path.join(root, 'sub'), path.join(root, 'sub-orig'));
  await mkdir(path.join(root, 'sub'));
  await assert.rejects(
    provider.appendFileSynced(root, 'sub/audit.log', Buffer.from('two\n'),
      { root: anchor.root, parent: anchor.parent }),
    /E_FS_IDENTITY_CHANGED/);
  assert.equal(await readFile(path.join(root, 'sub-orig', 'audit.log'), 'utf8'), 'one\n');
  assert.equal(fs.existsSync(path.join(root, 'sub', 'audit.log')), false);
});
