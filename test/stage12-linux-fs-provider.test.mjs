// Stage 12 Linux durability provider tests.
//
// Real filesystem tests on disposable directories: every case exercises the
// native helper and asserts kernel-observed behavior.
// Power-loss persistence is NOT claimed: any power-loss assertion would be
// recorded UNVERIFIED (see docs/STAGE12-LINUX-DURABILITY-BOUNDARIES.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, symlink, link, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LinuxFsProvider } from '../lib/linux-fs-provider.mjs';

const LINUX = process.platform === 'linux';

async function makeProvider(t) {
  if (!LINUX) t.skip('linux-only');
  const p = new LinuxFsProvider();
  try {
    await p.probeCapabilities();
  } catch (e) {
    if (e?.code === 'E_NATIVE_HELPER_MISSING')
      t.skip('native helper not built (npm run build:native-linux)');
    throw e;
  }
  return p;
}
async function scratch(t) {
  // btrfs-backed disposable dir (durable namespace semantics); /tmp here
  // is tmpfs and is used only where tmpfs is specifically required.
  const base = path.join(
    path.dirname(new URL(import.meta.url).pathname), '..', '..', 'test-scratch');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'vcp-prov-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('probe reports kernel, filesystem and capability matrix', async t => {
  const p = await makeProvider(t);
  const base = path.join(
    path.dirname(new URL(import.meta.url).pathname), '..', '..', 'test-scratch');
  await mkdir(base, { recursive: true });
  const c = await p.probeCapabilities(base);
  assert.equal(typeof c.kernel, 'string');
  assert.equal(typeof c.filesystem, 'string');
  assert.equal(typeof c.renameat2Noreplace, 'boolean');
  assert.equal(typeof c.directoryFsync, 'boolean');
  assert.equal(typeof c.immutableSettable, 'boolean');
  t.diagnostic(`kernel=${c.kernel} arch=${c.arch} fs=${c.filesystem} ` +
    `noreplace=${c.renameat2Noreplace} dirFsync=${c.directoryFsync} ` +
    `immutable=${c.immutableSettable}(${c.immutableErrno})`);
  // On this Linux/btrfs host both primitives must hold; elsewhere the
  // provider fails closed instead of pretending.
  assert.equal(c.filesystem, 'btrfs');
  assert.equal(c.renameat2Noreplace, true);
  assert.equal(c.directoryFsync, true);
});

test('writeFileSynced creates exclusive, synced files; second create fails', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  const r = await p.writeFileSynced(dir, 'a.txt', Buffer.from('hello'), 0o600);
  assert.equal(r.ok, true);
  assert.equal(r.dataSynced, true);
  assert.equal(r.directorySynced, true);
  assert.equal(await readFile(path.join(dir, 'a.txt'), 'utf8'), 'hello');
  await assert.rejects(p.writeFileSynced(dir, 'a.txt', Buffer.from('x')),
    /E_FS_DESTINATION_EXISTS|EEXIST/);
  const id = await p.statIdentity(dir, 'a.txt');
  assert.equal(id.type, 'file');
  assert.equal(id.mode, 0o600);
});

test('replaceFileAtomic swaps content and leaves no staging files', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.writeFileSynced(dir, 'm.txt', Buffer.from('v1'));
  const r = await p.replaceFileAtomic(dir, 'm.txt', Buffer.from('v2'));
  assert.equal(r.completed, true);
  assert.equal(r.dataSynced, true);
  assert.equal(r.directorySynced, true);
  assert.equal(await readFile(path.join(dir, 'm.txt'), 'utf8'), 'v2');
  const names = await readdir(dir);
  assert.deepEqual(names, ['m.txt']);
});

test('moveNoReplace succeeds fresh and refuses collisions atomically', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.createDirectory(dir, 'src');
  await p.writeFileSynced(dir, 'src/inner.txt', Buffer.from('data'));
  const moved = await p.moveNoReplace(dir, 'src', 'dst');
  assert.equal(moved.ok, true);
  assert.equal(moved.srcParentSynced, true);
  assert.equal(moved.dstParentSynced, true);
  assert.equal(await readFile(path.join(dir, 'dst', 'inner.txt'), 'utf8'), 'data');
  // Collision: destination exists -> EEXIST, source preserved.
  await p.createDirectory(dir, 'src2');
  await p.createDirectory(dir, 'dst2');
  await assert.rejects(p.moveNoReplace(dir, 'src2', 'dst2'),
    e => e.code === 'E_FS_DESTINATION_EXISTS');
  const names = await readdir(dir);
  assert.ok(names.includes('src2') && names.includes('dst2'));
});

test('moveNoReplace refuses symlink at destination and symlink parents', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.createDirectory(dir, 'victim-target');
  await p.createDirectory(dir, 's');
  // Symlink AS the destination name: renameat2 sees an existing name.
  await symlink('victim-target', path.join(dir, 'dstlink'));
  await assert.rejects(p.moveNoReplace(dir, 's', 'dstlink'),
    e => e.code === 'E_FS_DESTINATION_EXISTS');
  // The symlink target is untouched.
  assert.deepEqual(await readdir(path.join(dir, 'victim-target')), []);
  // Symlink as an intermediate component of the source path.
  await symlink('.', path.join(dir, 'loop'));
  await assert.rejects(p.moveNoReplace(dir, 'loop/s', 'fresh'),
    /E_FS_PROVIDER_PATH|E_FS_OS_ERROR|E_FS_HELPER_FAILED/);
});

test('hardlink destination collision is refused; source hardlink survives move', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.writeFileSynced(dir, 'orig.txt', Buffer.from('keep'));
  await link(path.join(dir, 'orig.txt'), path.join(dir, 'hard.txt'));
  await p.createDirectory(dir, 'other');
  await assert.rejects(p.moveNoReplace(dir, 'other', 'hard.txt'),
    e => e.code === 'E_FS_DESTINATION_EXISTS');
  assert.equal(await readFile(path.join(dir, 'orig.txt'), 'utf8'), 'keep');
});

test('cross-filesystem rename fails closed with E_CROSS_FILESYSTEM', async t => {
  const p = await makeProvider(t);
  const a = await scratch(t); // btrfs
  const b = await mkdtemp(path.join('/tmp', 'vcp-prov-xdev-')); // tmpfs
  t.after(() => rm(b, { recursive: true, force: true }));
  const fsA = (await import('node:fs/promises').then(m => m.statfs(a))).type;
  const fsB = (await import('node:fs/promises').then(m => m.statfs(b))).type;
  t.diagnostic(`src fs=${os.platform()}:${fsA} dst fs=${fsB}`);
  assert.notEqual(fsA, fsB, 'test needs two different filesystems');
  await p.createDirectory(a, 'x');
  // Pin --root at / is too broad; instead drive the helper directly with
  // two disposable subtrees on different filesystems via relative paths
  // from a common pinned root is impossible by design, so call the raw
  // helper with --root=/ on strictly controlled disposable names.
  const relA = path.relative('/', path.join(a, 'x'));
  const relB = path.relative('/', path.join(b, 'y'));
  const { spawnSync } = await import('node:child_process');
  const done = spawnSync(p.helperPath,
    ['--root', '/', '--op', 'rename-noreplace', relA, relB],
    { encoding: 'utf8', timeout: 15000 });
  const doc = JSON.parse(done.stdout.trim().split('\n').pop());
  assert.equal(done.status, 11);
  assert.equal(doc.crossFilesystem, true);
  assert.equal(doc.errno, 'EXDEV');
});

test('deleteFile and removeEmptyDirectory sync parents; ENOTEMPTY is safe', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.createDirectory(dir, 'd');
  await p.writeFileSynced(dir, 'd/f.txt', Buffer.from('x'));
  await assert.rejects(p.removeEmptyDirectory(dir, 'd'),
    e => e.code === 'E_FS_OS_ERROR' || /ENOTEMPTY/.test(e.message));
  const del = await p.deleteFile(dir, 'd/f.txt');
  assert.equal(del.ok, true);
  assert.equal(del.directorySynced, true);
  const rd = await p.removeEmptyDirectory(dir, 'd');
  assert.equal(rd.ok, true);
  assert.deepEqual(await readdir(dir), []);
});

test('reapStaging removes only provider staging files', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.writeFileSynced(dir, '.keep.vcp-deadbeef.tmp', Buffer.from('s'));
  await writeFile(path.join(dir, 'user.txt'), 'user');
  await writeFile(path.join(dir, '.user-notes.tmp'), 'decoy without staging pattern');
  const r = await p.reapStaging(dir, '.');
  assert.deepEqual(r.removed, ['.keep.vcp-deadbeef.tmp']);
  assert.equal(await readFile(path.join(dir, 'user.txt'), 'utf8'), 'user');
  assert.equal(await readFile(path.join(dir, '.user-notes.tmp'), 'utf8'),
    'decoy without staging pattern');
});

test('interrupted replace leaves original intact and staging is reapable', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.writeFileSynced(dir, 'm.txt', Buffer.from('original'));
  // Simulate a crash between staging-write and rename: stage manually,
  // then "crash" (never rename).
  const staged = await p.writeFileSynced(dir, '.m.txt.vcp-abc123.tmp', Buffer.from('torn'));
  assert.equal(staged.dataSynced, true);
  assert.equal(await readFile(path.join(dir, 'm.txt'), 'utf8'), 'original');
  const reaped = await p.reapStaging(dir, '.');
  assert.ok(reaped.removed.includes('.m.txt.vcp-abc123.tmp'));
  assert.equal(await readFile(path.join(dir, 'm.txt'), 'utf8'), 'original');
});

test('SIGKILL during a write burst leaves no torn committed files', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  await p.writeFileSynced(dir, 'stable.txt', Buffer.from('stable'));
  const childCode = `
    const {LinuxFsProvider}=await import(${JSON.stringify(
      path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'lib', 'linux-fs-provider.mjs'))});
    const p=new LinuxFsProvider();
    let i=0;
    for(;;){ i++;
      await p.writeFileSynced(${JSON.stringify(dir)}, 'burst-'+i+'.txt', Buffer.alloc(4096, i%256));
    }`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', childCode],
    { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  child.kill('SIGKILL');
  await new Promise(r => child.on('exit', r));
  // The committed file is untouched; burst files are either complete or
  // absent (exclusive create => no torn partial at a committed name).
  assert.equal(await readFile(path.join(dir, 'stable.txt'), 'utf8'), 'stable');
  for (const n of await readdir(dir)) {
    if (!n.startsWith('burst-')) continue;
    const st = await readFile(path.join(dir, n));
    assert.equal(st.length, 4096, 'torn burst file: ' + n);
  }
  const reaped = await p.reapStaging(dir, '.');
  t.diagnostic(`burst files reaped as staging: ${reaped.removed.length}`);
});

test('path validation rejects escapes before touching the helper', async t => {
  const p = await makeProvider(t);
  const dir = await scratch(t);
  for (const bad of ['../x', '/abs', 'a//b', 'a/../b', '', '.',
    'x'.repeat(129) + '/y']) {
    await assert.rejects(p.writeFileSynced(dir, bad, Buffer.from('x')),
      e => e.code === 'E_FS_PROVIDER_PATH', 'accepted: ' + bad);
  }
});
