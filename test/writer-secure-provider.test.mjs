// Phase N — SEC-FINDING-002 remediation tests.
//
// Deterministic adversarial tests for the descriptor-relative writer:
// every case places the hostile filesystem state BEFORE the operation
// runs, so refusal is a property of the pinned openat/renameat chain
// itself, never of winning a timing race. One concurrency case (PN-05)
// asserts the escape invariant under a live swap loop. All fixtures
// are disposable directories under os.tmpdir() owned by this test.
//
// Power-loss persistence is NOT asserted anywhere here: receipts claim
// kernel acknowledgment (fsync results), nothing more.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp, mkdir, writeFile, readFile, readdir, symlink, rename,
  unlink, lstat, chmod, rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { atomicWriteFile } from '../lib/writer-atomic.mjs';
import { LinuxFsProvider } from '../lib/linux-fs-provider.mjs';
import {
  secureWriterProviderStatus, selectSecureWriterProvider,
} from '../lib/secure-fs-provider.mjs';

const LINUX = process.platform === 'linux';

async function requireLinux(t) {
  if (!LINUX) { t.skip('linux-only: secure writer provider is Linux-native'); return false; }
  const st = secureWriterProviderStatus();
  if (!st.available) {
    t.skip('native helper unavailable: ' + st.reason);
    return false;
  }
  return true;
}
async function fresh(t, label) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-pn-' + label + '-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

test('PN-01 — intermediate symlink component is refused; outside untouched', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  await writeFile(path.join(outside, 'victim.txt'), 'OUTSIDE-ORIGINAL');
  await symlink(outside, path.join(root, 'link'), 'dir');
  await assert.rejects(
    atomicWriteFile(root, 'link/evil.txt', Buffer.from('pwned')),
    e => typeof e?.code === 'string' && e.code.startsWith('E_'),
    'a write through an intermediate symlink must be refused');
  assert.equal(await readFile(path.join(outside, 'victim.txt'), 'utf8'),
    'OUTSIDE-ORIGINAL');
  assert.deepEqual((await readdir(outside)).sort(), ['victim.txt'],
    'no file may be created outside the root');
});

test('PN-02 — the pinned provider chain itself refuses an intermediate symlink (no pre-check involved)', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  await symlink(outside, path.join(root, 'link'), 'dir');
  const provider = new LinuxFsProvider();
  // LinuxFsProvider performs NO lstat pre-check: this refusal can only
  // come from openat(O_NOFOLLOW) at the intermediate component inside
  // the native helper. This is the deterministic core of the fix.
  await assert.rejects(
    provider.replaceFileAtomic(root, 'link/evil.txt', Buffer.from('pwned'), { mode: 0o644 }),
    e => e?.code === 'E_FS_OS_ERROR' || e?.code === 'E_FS_HELPER_FAILED' ||
         e?.code === 'E_FS_DESTINATION_UNSAFE',
    'pinned chain must refuse the symlink component');
  assert.deepEqual(await readdir(outside), [],
    'no file may be created outside the root');
});

test('PN-03 — final-component symlink destination is refused, never replaced through', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  await writeFile(path.join(outside, 'secret.txt'), 'ORIGINAL-SECRET');
  await symlink(path.join(outside, 'secret.txt'), path.join(root, 'target.txt'), 'file');
  // Two layers may refuse: the writer's lstat pre-check sees the final
  // component (E_WRITER_NAMESPACE_UNSAFE); the provider refuses on its
  // own (proven directly below). Either is a correct refusal — what
  // must never happen is a successful replace.
  await assert.rejects(
    atomicWriteFile(root, 'target.txt', Buffer.from('replaced')),
    e => e?.code === 'E_FS_DESTINATION_UNSAFE' ||
         e?.code === 'E_WRITER_NAMESPACE_UNSAFE',
    'a symlink destination must be refused outright');
  const provider = new LinuxFsProvider();
  await assert.rejects(
    provider.replaceFileAtomic(root, 'target.txt', Buffer.from('replaced'), { mode: 0o644 }),
    e => e?.code === 'E_FS_DESTINATION_UNSAFE',
    'the provider itself must refuse a symlink destination');
  assert.equal(await readFile(path.join(outside, 'secret.txt'), 'utf8'),
    'ORIGINAL-SECRET', 'the symlink target must not be modified');
  const st = await lstat(path.join(root, 'target.txt'));
  assert.equal(st.isSymbolicLink(), true,
    'the destination entry itself must not be silently swapped either');
});

test('PN-04 — a symlinked root is refused by the pinned root open', async t => {
  if (!await requireLinux(t)) return;
  const real = await fresh(t, 'realroot');
  const holder = await fresh(t, 'holder');
  const rootLink = path.join(holder, 'rootlink');
  await symlink(real, rootLink, 'dir');
  await assert.rejects(
    atomicWriteFile(rootLink, 'file.txt', Buffer.from('x')),
    e => typeof e?.code === 'string' && e.code.startsWith('E_'),
    'opening the root through a symlink must be refused');
  assert.deepEqual(await readdir(real), [],
    'nothing may be written into the real directory');
});

test('PN-05 — parent-directory swap loop never redirects a write outside the pinned namespace', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  await writeFile(path.join(outside, 'file.txt'), 'OUTSIDE-ORIGINAL');
  await mkdir(path.join(root, 'sub'));
  let stop = false;
  let successes = 0;
  const attacker = (async () => {
    while (!stop) {
      try {
        // Hostile window: the parent path is a symlink to outside.
        await rename(path.join(root, 'sub'), path.join(root, 'sub-real'));
        await symlink(outside, path.join(root, 'sub'), 'dir');
        await sleep(25);
        await unlink(path.join(root, 'sub'));
        await rename(path.join(root, 'sub-real'), path.join(root, 'sub'));
        // Honest window: the parent is the real directory again. It is
        // deliberately longer than one provider write so honest writes
        // can complete; the invariant below holds in BOTH windows.
        await sleep(150);
      } catch { /* mid-swap states are the point; keep cycling */ }
    }
  })();
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await atomicWriteFile(root, 'sub/file.txt',
          Buffer.from('inside-' + i));
        successes++;
      } catch (e) {
        // Refusal during a hostile swap is correct fail-closed
        // behaviour; a non-filesystem error would not be.
        assert.match(e?.code ?? '', /^E_/,
          'failures must be typed refusals, got: ' + (e?.message ?? e));
        await sleep(5);
      }
    }
  } finally {
    stop = true;
    await attacker;
  }
  assert.ok(successes >= 1, 'at least one honest write must succeed');
  assert.equal(await readFile(path.join(outside, 'file.txt'), 'utf8'),
    'OUTSIDE-ORIGINAL',
    'the outside file must never be redirected into or overwritten');
  assert.deepEqual((await readdir(outside)).sort(), ['file.txt']);
});

test('PN-06 — no-replace preserves an existing destination', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const provider = new LinuxFsProvider();
  const r = await provider.writeFileSynced(root, 'keep.txt', Buffer.from('keep-me'), 0o600);
  assert.equal(r.dataSynced, true);
  await assert.rejects(
    provider.writeFileSynced(root, 'keep.txt', Buffer.from('overwrite')),
    e => e?.code === 'E_FS_DESTINATION_EXISTS');
  assert.equal(await readFile(path.join(root, 'keep.txt'), 'utf8'), 'keep-me');
  await provider.writeFileSynced(root, 'staged.txt', Buffer.from('staged'), 0o600);
  await assert.rejects(
    provider.moveNoReplace(root, 'staged.txt', 'keep.txt'),
    e => e?.code === 'E_FS_DESTINATION_EXISTS');
  assert.equal(await readFile(path.join(root, 'keep.txt'), 'utf8'), 'keep-me');
  assert.equal(await readFile(path.join(root, 'staged.txt'), 'utf8'), 'staged',
    'a refused no-replace move must preserve the source');
});

test('PN-07 — atomic replacement contract: content, mode, verified receipt, no staging left', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const first = await atomicWriteFile(root, 'doc.txt', Buffer.from('v1'), { mode: 0o640 });
  assert.equal(first.dataSynced, true);
  assert.equal(first.directorySynced, true);
  assert.equal(first.identityVerified, true);
  const second = await atomicWriteFile(root, 'doc.txt', Buffer.from('v2-longer'), { mode: 0o640 });
  assert.match(second.sha256, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(path.join(root, 'doc.txt'), 'utf8'), 'v2-longer');
  const st = await lstat(path.join(root, 'doc.txt'));
  assert.equal(st.mode & 0o777, 0o640);
  assert.deepEqual((await readdir(root)).sort(), ['doc.txt'],
    'no staging files may remain after a committed replace');
});

test('PN-08 — unknown or unsynced native outcomes fail closed with no receipt', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const bin = await fresh(t, 'fakebin');
  // A protocol test double (NOT the real helper): it performs the fs
  // effects with plain fs but reports directorySynced:false for the
  // rename — the exact "completed but not acknowledged" state that
  // must never become a success receipt.
  const fake = path.join(bin, 'fake-helper');
  await writeFile(fake, `#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
const argv = process.argv.slice(2);
const root = argv[argv.indexOf('--root') + 1];
const op = argv[argv.indexOf('--op') + 1];
const args = argv.slice(argv.indexOf('--op') + 2);
const emit = o => process.stdout.write(JSON.stringify(o) + '\\n');
if (op === 'stat-id') {
  try {
    const st = statSync(path.join(root, args[0]));
    emit({ ok: true, op, path: args[0], type: 'file', dev: st.dev, ino: st.ino,
      devExact: String(st.dev), inoExact: String(st.ino),
      modeOct: (st.mode & 0o7777).toString(8), uid: st.uid, gid: st.gid, size: st.size });
  } catch {
    emit({ ok: false, op, errno: 'ENOENT', errnoNum: 2 });
    process.exit(3);
  }
} else if (op === 'write-file-sync') {
  const data = readFileSync(0);
  const target = path.join(root, args[0]);
  writeFileSync(target, data, { mode: 0o600 });
  const st = statSync(target);
  emit({ ok: true, op, path: args[0], bytes: data.length, dataSynced: true,
    directorySynced: true, dev: st.dev, ino: st.ino });
} else if (op === 'rename-replace') {
  renameSync(path.join(root, args[0]), path.join(root, args[1]));
  emit({ ok: true, op, src: args[0], dst: args[1],
    srcParentSynced: false, dstParentSynced: false });
} else if (op === 'unlink-sync') {
  try { (await import('node:fs')).unlinkSync(path.join(root, args[0])); } catch {}
  emit({ ok: true, op, path: args[0], directorySynced: true });
} else { process.exit(2); }
`);
  await chmod(fake, 0o755);
  // Phase N+1 declared seam change: fixture helpers now require the
  // explicit allowUnverifiedHelper opt-out (trust verification is the
  // default); this test's subject is protocol/sync-proof behavior.
  const provider = new LinuxFsProvider({ helperPath: fake, allowUnverifiedHelper: true });
  await assert.rejects(
    provider.replaceFileAtomic(root, 'doc.txt', Buffer.from('data'), { mode: 0o644 }),
    e => e?.code === 'E_FS_SYNC_UNPROVEN',
    'unsynced parent acknowledgment must refuse the receipt');
  // Garbage protocol: a helper that answers nonsense must also refuse.
  const garbage = path.join(bin, 'garbage-helper');
  await writeFile(garbage, '#!/bin/sh\necho not-json\nexit 3\n');
  await chmod(garbage, 0o755);
  const broken = new LinuxFsProvider({ helperPath: garbage, allowUnverifiedHelper: true });
  await assert.rejects(
    broken.replaceFileAtomic(root, 'doc.txt', Buffer.from('data'), { mode: 0o644 }),
    e => typeof e?.code === 'string' && e.code.startsWith('E_FS_'),
    'an unparseable helper outcome must fail closed');
});

test('PN-09 — a directory destination is refused and cleanup unlink never follows a symlink', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  await mkdir(path.join(root, 'adir'));
  await assert.rejects(
    atomicWriteFile(root, 'adir', Buffer.from('x')),
    e => e?.code === 'E_FS_DESTINATION_UNSAFE');
  assert.equal((await lstat(path.join(root, 'adir'))).isDirectory(), true);
  // Cleanup semantics: deleting a staging entry that was swapped for a
  // symlink removes the LINK inside the pinned namespace, never the
  // outside target it points at.
  await writeFile(path.join(outside, 'victim.txt'), 'VICTIM');
  await symlink(path.join(outside, 'victim.txt'), path.join(root, 'staged.tmp'), 'file');
  const provider = new LinuxFsProvider();
  await provider.deleteFile(root, 'staged.tmp');
  assert.equal(await readFile(path.join(outside, 'victim.txt'), 'utf8'), 'VICTIM');
  await assert.rejects(lstat(path.join(root, 'staged.tmp')), /ENOENT/);
});

test('PN-10 — provider selection is fail-closed off Linux and not caller-controlled', async t => {
  const win = secureWriterProviderStatus('win32');
  assert.equal(win.available, false);
  assert.equal(win.provider, null);
  assert.match(win.reason, /WINDOWS_NATIVE_PROVIDER_UNREVIEWED/);
  const mac = secureWriterProviderStatus('darwin');
  assert.equal(mac.available, false);
  assert.equal(mac.provider, null);
  if (!await requireLinux(t)) return;
  const provider = selectSecureWriterProvider();
  assert.ok(provider instanceof LinuxFsProvider);
  // The writer source must stay routed through the boundary: no direct
  // path-based mutation primitives may reappear in writer-atomic.mjs.
  const src = await readFile(
    new URL('../lib/writer-atomic.mjs', import.meta.url), 'utf8');
  assert.match(src, /secure-fs-provider\.mjs/);
  assert.doesNotMatch(src, /from 'node:fs\/promises'/,
    'writer-atomic must not regain path-based fs mutation imports');
  assert.doesNotMatch(src, /syncContainingDirectory/,
    'writer-atomic must not regain the path-based directory sync');
});

test('PN-11 — staging reap removes only provider-owned staging entries, never targets', async t => {
  if (!await requireLinux(t)) return;
  const root = await fresh(t, 'root');
  const outside = await fresh(t, 'outside');
  const provider = new LinuxFsProvider();
  await writeFile(path.join(outside, 'victim.txt'), 'VICTIM');
  await provider.writeFileSynced(root, '.doc.txt.vcp-deadbeef.tmp', Buffer.from('staged'), 0o600);
  await writeFile(path.join(root, 'user.txt'), 'user');
  await writeFile(path.join(root, '.user-notes.tmp'), 'decoy');
  // A staging-pattern symlink pointing outside: reaping may remove
  // the entry, but the outside object must survive byte-for-byte.
  await symlink(path.join(outside, 'victim.txt'),
    path.join(root, '.evil.vcp-cafef00d.tmp'), 'file');
  const reaped = await provider.reapStaging(root, '.');
  assert.ok(reaped.removed.includes('.doc.txt.vcp-deadbeef.tmp'));
  assert.equal(await readFile(path.join(outside, 'victim.txt'), 'utf8'), 'VICTIM');
  assert.equal(await readFile(path.join(root, 'user.txt'), 'utf8'), 'user');
  assert.equal(await readFile(path.join(root, '.user-notes.tmp'), 'utf8'), 'decoy');
});
