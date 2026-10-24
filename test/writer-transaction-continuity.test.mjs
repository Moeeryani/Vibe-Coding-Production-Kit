// Phase N+1 — Secure Transaction Continuity tests.
//
// Validator findings X-02 (no transaction-wide identity continuity)
// and X-05 (unauthenticated native helper), reproduced
// deterministically and asserted REFUSED.
//
// Interposition is at the helper-spawn boundary, never a timing race:
// a proxy helper delegates every invocation to the real native helper,
// except that — when armed via VCPN1_ATTACK — it performs the
// validator's namespace attack (real-directory parent swap + staged
// relocation, root swap, staged-file substitution) immediately BEFORE
// the rename/write/unlink invocation it targets. On Phase N code these
// attacks completed with success receipts; here every one must refuse
// with E_FS_IDENTITY_CHANGED, no receipt, and no payload outside the
// authorized namespace.
import assert from 'node:assert/strict';
import {
  mkdtemp, mkdir, writeFile, readFile, readdir, lstat, chmod, rm,
  rename, cp,
} from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { LinuxFsProvider } from '../lib/linux-fs-provider.mjs';
import { selectSecureWriterProvider } from '../lib/secure-fs-provider.mjs';

const LINUX = process.platform === 'linux';
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REAL_HELPER = path.join(REPO, 'scripts', 'native', 'vcp-linux-fsops');
const MANIFEST = REAL_HELPER + '.manifest.json';

async function requireLinux(t) {
  if (!LINUX) { t.skip('linux-only'); return false; }
  if (!existsSync(REAL_HELPER) || !existsSync(MANIFEST)) {
    t.skip('native helper/manifest unavailable: npm run build:native-linux');
    return false;
  }
  return true;
}
async function fresh(t, label) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-pn1-' + label + '-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

const PROXY = `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const get = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const root = get('--root'); const op = get('--op');
const args = argv.slice(argv.indexOf('--op') + 2);
const stdin = fs.readFileSync(0);
const attack = process.env.VCPN1_ATTACK || '';
const stagedIn = dir => fs.readdirSync(dir).find(n => n.includes('.vcp-') && n.endsWith('.tmp'));
function swapParent(srcRel, { relocate = true } = {}) {
  const parentRel = path.posix.dirname(srcRel);
  const parentAbs = path.join(root, parentRel);
  const evil = parentAbs + '-evil';
  fs.mkdirSync(evil);
  if (relocate) {
    const staged = stagedIn(parentAbs);
    if (staged) fs.renameSync(path.join(parentAbs, staged), path.join(evil, staged));
  }
  fs.renameSync(parentAbs, parentAbs + '-orig');
  fs.renameSync(evil, parentAbs);
}
function swapRoot(srcRel) {
  const parentRel = path.posix.dirname(srcRel);
  const staged = stagedIn(path.join(root, parentRel));
  const orig = root + '-orig';
  fs.renameSync(root, orig);
  fs.mkdirSync(root); fs.mkdirSync(path.join(root, parentRel));
  if (staged) fs.renameSync(path.join(orig, parentRel, staged), path.join(root, parentRel, staged));
}
function substitute(srcRel, content) {
  const abs = path.join(root, srcRel);
  fs.renameSync(abs, path.join(root, 'staged-away.bin'));
  fs.writeFileSync(abs, content, { mode: 0o600 });
}
const isRename = op === 'rename-replace' || op === 'rename-noreplace';
if (attack === 'swap-parent' && isRename) swapParent(args[0]);
else if (attack === 'swap-root' && isRename) swapRoot(args[0]);
else if (attack === 'substitute-staged' && isRename) substitute(args[0], 'ATTACKER-CONTENT');
else if (attack === 'swap-parent-write' && op === 'write-file-sync') swapParent(args[0], { relocate: false });
else if (attack === 'substitute-unlink' && op === 'unlink-sync') substitute(args[0], 'ATTACKER-REAP');
const done = spawnSync(process.env.VCPN1_REAL_HELPER, argv, { input: stdin });
if (done.stdout) process.stdout.write(done.stdout);
process.exit(done.status ?? 3);
`;

async function proxyProvider(t, attack) {
  const bin = await fresh(t, 'bin');
  const proxy = path.join(bin, 'proxy-helper');
  await writeFile(proxy, PROXY);
  await chmod(proxy, 0o755);
  process.env.VCPN1_REAL_HELPER = REAL_HELPER;
  process.env.VCPN1_ATTACK = attack;
  t.after(() => { delete process.env.VCPN1_ATTACK; });
  return new LinuxFsProvider({ helperPath: proxy, allowUnverifiedHelper: true });
}

test('PN1-01 — X-02: parent swap + staged relocation at the rename refuses; payload lands nowhere', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  t.after(() => rm(root + '-orig', { recursive: true, force: true }));
  await mkdir(path.join(root, 'sub'));
  const provider = await proxyProvider(t, 'swap-parent');
  await assert.rejects(
    provider.replaceFileAtomic(root, 'sub/doc.txt', Buffer.from('payload'), { mode: 0o644 }),
    e => e?.code === 'E_FS_IDENTITY_CHANGED');
  // The write completed in NO namespace: not the swapped-in parent,
  // not the displaced original parent.
  await assert.rejects(lstat(path.join(root, 'sub', 'doc.txt')), /ENOENT/);
  await assert.rejects(lstat(path.join(root + '-orig', 'sub', 'doc.txt')), /ENOENT/);
});

test('PN1-02 — X-02: root swap at the rename refuses on root identity', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  t.after(() => rm(root + '-orig', { recursive: true, force: true }));
  await mkdir(path.join(root, 'sub'));
  const provider = await proxyProvider(t, 'swap-root');
  await assert.rejects(
    provider.replaceFileAtomic(root, 'sub/doc.txt', Buffer.from('payload'), { mode: 0o644 }),
    e => e?.code === 'E_FS_IDENTITY_CHANGED');
  await assert.rejects(lstat(path.join(root, 'sub', 'doc.txt')), /ENOENT/);
  await assert.rejects(lstat(path.join(root + '-orig', 'sub', 'doc.txt')), /ENOENT/);
});

test('PN1-03 — staged-file substitution refuses; cleanup never deletes the substituted object', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, 'sub'));
  const provider = await proxyProvider(t, 'substitute-staged');
  await assert.rejects(
    provider.replaceFileAtomic(root, 'sub/doc.txt', Buffer.from('payload'), { mode: 0o644 }),
    e => e?.code === 'E_FS_IDENTITY_CHANGED');
  await assert.rejects(lstat(path.join(root, 'sub', 'doc.txt')), /ENOENT/);
  const names = await readdir(path.join(root, 'sub'));
  const staged = names.find(n => n.includes('.vcp-') && n.endsWith('.tmp'));
  assert.ok(staged, 'the substituted staging entry must survive cleanup');
  assert.equal(await readFile(path.join(root, 'sub', staged), 'utf8'),
    'ATTACKER-CONTENT',
    'cleanup must not delete an object whose identity is not the staged one');
});

test('PN1-04 — parent swap before the staging write refuses at the write itself', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  t.after(() => rm(root + '-orig', { recursive: true, force: true }));
  await mkdir(path.join(root, 'sub'));
  const provider = await proxyProvider(t, 'swap-parent-write');
  await assert.rejects(
    provider.replaceFileAtomic(root, 'sub/doc.txt', Buffer.from('payload'), { mode: 0o644 }),
    e => e?.code === 'E_FS_IDENTITY_CHANGED');
  assert.deepEqual(await readdir(path.join(root, 'sub')), [],
    'nothing may be staged into the replacement parent');
});

test('PN1-05 — X-05: a JSON-speaking fake helper is refused by trust verification (no seam flag)', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const bin = await fresh(t, 'bin');
  const fake = await writeFakeHelper(bin);
  const provider = new LinuxFsProvider({ helperPath: fake });
  await assert.rejects(
    provider.replaceFileAtomic(root, 'doc.txt', Buffer.from('data'), { mode: 0o644 }),
    e => e?.code === 'E_NATIVE_HELPER_UNTRUSTED');
  assert.deepEqual(await readdir(root), [], 'no file may be created');
});

test('PN1-06 — X-05: with the seam flag, a no-op fake still cannot mint a receipt (independent content verification)', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, 'sub'));
  const bin = await fresh(t, 'bin');
  const fake = await writeFakeHelper(bin);
  const provider = new LinuxFsProvider({
    helperPath: fake, allowUnverifiedHelper: true,
  });
  await assert.rejects(
    provider.replaceFileAtomic(root, 'sub/doc.txt', Buffer.from('data'), { mode: 0o644 }),
    e => e?.code === 'E_FS_REPLACE_UNVERIFIED',
    'helper-reported success without the bytes on disk must not verify');
  assert.deepEqual(await readdir(path.join(root, 'sub')), []);
});

test('PN1-07 — helper trust: binary or manifest tampering refuses; untampered copies work', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const bin = await fresh(t, 'bin');
  const helperCopy = path.join(bin, 'vcp-linux-fsops');
  await cp(REAL_HELPER, helperCopy);
  await cp(MANIFEST, helperCopy + '.manifest.json');
  await cp(REAL_HELPER + '.cpp', helperCopy + '.cpp');
  await chmod(helperCopy, 0o755);
  const good = new LinuxFsProvider({ helperPath: helperCopy });
  const id = await good.statIdentity(root, '.');
  assert.equal(id.type, 'dir', 'untampered copies must verify and run');
  // Binary tamper: one appended byte breaks the manifest binding.
  const bin2 = await fresh(t, 'bin2');
  const tamperedBin = path.join(bin2, 'vcp-linux-fsops');
  await cp(REAL_HELPER, tamperedBin);
  await cp(MANIFEST, tamperedBin + '.manifest.json');
  await cp(REAL_HELPER + '.cpp', tamperedBin + '.cpp');
  await chmod(tamperedBin, 0o755);
  const { appendFile } = await import('node:fs/promises');
  await appendFile(tamperedBin, 'X');
  await assert.rejects(
    new LinuxFsProvider({ helperPath: tamperedBin }).statIdentity(root, '.'),
    e => e?.code === 'E_NATIVE_HELPER_UNTRUSTED');
  // Manifest tamper: a forged digest refuses even with a genuine binary.
  const bin3 = await fresh(t, 'bin3');
  const forged = path.join(bin3, 'vcp-linux-fsops');
  await cp(REAL_HELPER, forged);
  await cp(REAL_HELPER + '.cpp', forged + '.cpp');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  manifest.binarySha256 = '0'.repeat(64);
  await writeFile(forged + '.manifest.json', JSON.stringify(manifest));
  await chmod(forged, 0o755);
  await assert.rejects(
    new LinuxFsProvider({ helperPath: forged }).statIdentity(root, '.'),
    e => e?.code === 'E_NATIVE_HELPER_UNTRUSTED');
});

test('PN1-08 — production path: receipt carries the anchor and the measured helper identity', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  await mkdir(path.join(root, 'sub'));
  const provider = selectSecureWriterProvider();
  const receipt = await provider.replaceFileAtomic(
    root, 'sub/doc.txt', Buffer.from('evidence'), { mode: 0o640 });
  assert.equal(receipt.completed, true);
  assert.ok(receipt.anchor?.root?.ino && receipt.anchor?.parent?.ino,
    'receipt must record the transaction anchor');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(receipt.helper?.sha256, manifest.binarySha256,
    'receipt must record the measured helper hash for external verification');
  assert.equal(await readFile(path.join(root, 'sub', 'doc.txt'), 'utf8'), 'evidence');
});

test('PN1-09 — journal staging (writeFileSynced) is bound by the same continuity', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  t.after(() => rm(root + '-orig', { recursive: true, force: true }));
  await mkdir(path.join(root, 'sub'));
  const provider = await proxyProvider(t, 'swap-parent');
  await assert.rejects(
    provider.writeFileSynced(root, 'sub/journal.json', Buffer.from('{}'), 0o600),
    e => e?.code === 'E_FS_IDENTITY_CHANGED');
  await assert.rejects(lstat(path.join(root, 'sub', 'journal.json')), /ENOENT/);
});

test('PN1-10 — reapStaging never deletes a substituted staging object', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const name = '.doc.txt.vcp-ab12cd34.tmp';
  await writeFile(path.join(root, name), 'ORIGINAL-STAGED');
  const control = new LinuxFsProvider();
  const reapedControl = await control.reapStaging(root, '.');
  assert.deepEqual(reapedControl.removed, [name],
    'control: the genuine staging file is reaped');
  await writeFile(path.join(root, name), 'ORIGINAL-STAGED');
  const provider = await proxyProvider(t, 'substitute-unlink');
  const reaped = await provider.reapStaging(root, '.');
  assert.deepEqual(reaped.removed, [],
    'a substituted staging object must not be reaped');
  assert.equal(await readFile(path.join(root, name), 'utf8'), 'ATTACKER-REAP');
});

// A protocol-perfect impostor: answers every op with success JSON and
// creates nothing (the validator's X-05 fixture shape).
async function writeFakeHelper(bin) {
  const state = path.join(bin, 'fake-state.json');
  await writeFile(state, JSON.stringify({ bytes: 0 }));
  const fake = path.join(bin, 'fake-helper');
  await writeFile(fake, `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
const get = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const op = get('--op');
const args = argv.slice(argv.indexOf('--op') + 2);
const emit = o => process.stdout.write(JSON.stringify(o) + '\\n');
if (op === 'stat-id') {
  const rel = args[0];
  if (rel === '.') emit({ ok: true, op, path: rel, type: 'dir', dev: 1, ino: 7, devExact: '1', inoExact: '7', modeOct: '755', uid: 0, gid: 0, size: 0 });
  else if (!rel.includes('.txt')) emit({ ok: true, op, path: rel, type: 'dir', dev: 1, ino: 8, devExact: '1', inoExact: '8', modeOct: '755', uid: 0, gid: 0, size: 0 });
  else {
    const st = JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'));
    emit({ ok: true, op, path: rel, type: 'file', dev: 1, ino: 99, devExact: '1', inoExact: '99', modeOct: '644', uid: 0, gid: 0, size: st.bytes });
  }
} else if (op === 'write-file-sync') {
  const data = fs.readFileSync(0);
  fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify({ bytes: data.length }));
  emit({ ok: true, op, path: args[0], bytes: data.length, dataSynced: true, directorySynced: true, dev: 1, ino: 99 });
} else if (op === 'rename-replace') {
  emit({ ok: true, op, src: args[0], dst: args[1], srcParentSynced: true, dstParentSynced: true });
} else if (op === 'unlink-sync') {
  emit({ ok: true, op, path: args[0], directorySynced: true });
} else { process.exit(2); }
`);
  await chmod(fake, 0o755);
  return fake;
}
