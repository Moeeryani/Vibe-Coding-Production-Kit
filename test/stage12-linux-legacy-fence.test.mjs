// Stage 12 D-01 Linux fence tests (uid-separation backend).
//
// Real kernel-enforced tests on disposable fixtures. Require privilege
// (chown); when not privileged the enforcement cases skip with a recorded
// reason instead of fake-passing. The immutable backend is implemented
// but its enforcement is UNVERIFIED where CAP_LINUX_IMMUTABLE is absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtemp, rm, writeFile, mkdir, symlink, readFile, chown, chmod, lstat,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  planLegacyFence, enforceLegacyFence, verifyLegacyFence, releaseLegacyFence,
} from '../lib/linux-legacy-fence.mjs';

const LINUX = process.platform === 'linux';
const LEGACY_UID = 60011, LEGACY_GID = 60011;
const WRITER_UID = 60012, WRITER_GID = 60012;
const ROOT = process.geteuid?.() === 0;

async function makeProvider(t) {
  if (!LINUX) t.skip('linux-only');
  const { LinuxFsProvider } = await import('../lib/linux-fs-provider.mjs');
  const p = new LinuxFsProvider();
  try { await p.probeCapabilities(); }
  catch (e) {
    if (e?.code === 'E_NATIVE_HELPER_MISSING')
      t.skip('native helper not built (npm run build:native-linux)');
    throw e;
  }
  return p;
}
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-fence-test-'));
  t.after(async () => {
    // Best-effort release then remove (tests run as root).
    try {
      const { LinuxFsProvider } = await import('../lib/linux-fs-provider.mjs');
      void LinuxFsProvider;
    } catch {}
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  await mkdir(path.join(dir, '.vcp', 'backups'), { recursive: true });
  await writeFile(path.join(dir, '.vcp', 'manifest.json'), '{"v":1}\n');
  await writeFile(path.join(dir, '.vcp', 'update.lock'), '{"token":"t"}\n');
  await writeFile(path.join(dir, 'AGENTS.md'), '# notes\nUSER_EDIT=true\n');
  return dir;
}
// Run a snippet as the legacy UID; returns {exitCode, stdout, stderr}.
function asLegacy(code, cwd) {
  const done = spawnSync('setpriv',
    [`--reuid=${LEGACY_UID}`, `--regid=${LEGACY_GID}`, '--clear-groups',
      '--reset-env', '--', process.execPath, '--input-type=module', '-e', code],
    { cwd, encoding: 'utf8', timeout: 15000, env: { PATH: '/usr/bin:/bin' } });
  return {
    exitCode: done.status, error: done.error?.message ?? null,
    stdout: (done.stdout ?? '').slice(0, 2000),
    stderr: (done.stderr ?? '').slice(0, 2000),
  };
}

test('planLegacyFence is read-only and reports kernel state', async t => {
  await makeProvider(t);
  const dir = await fixture(t);
  const plan = await planLegacyFence(dir, {
    protectedPaths: ['.vcp', 'AGENTS.md'],
    writerUid: WRITER_UID, writerGid: WRITER_GID,
  });
  assert.equal(plan.readOnly, true);
  assert.ok(plan.entryCount >= 4);
  assert.ok(plan.entries.every(e => typeof e.uid === 'number'));
});

test('enforce refuses without privilege', async t => {
  if (!LINUX) t.skip('linux-only');
  const dir = await fixture(t);
  // Stage the modules where the legacy UID can read them (/home/hatch is
  // not traversable by other UIDs — itself a correct OS denial).
  const stage = await mkdtemp(path.join(os.tmpdir(), 'vcp-fence-stage-'));
  t.after(() => rm(stage, { recursive: true, force: true }));
  const libDir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'lib');
  for (const f of ['linux-legacy-fence.mjs', 'linux-fs-provider.mjs']) {
    await writeFile(path.join(stage, f), await readFile(path.join(libDir, f)));
    await chmod(path.join(stage, f), 0o644);
  }
  await chmod(stage, 0o755);
  const r = asLegacy(`
    const m = await import(${JSON.stringify(path.join(stage, 'linux-legacy-fence.mjs'))});
    try { await m.enforceLegacyFence(${JSON.stringify(dir)},
      { protectedPaths: ['.vcp'], writerUid: 60012, writerGid: 60012 });
      console.log('NO_THROW'); }
    catch (e) { console.log('THREW:' + e.code); }`, dir);
  assert.match(r.stdout, /THREW:E_FENCE_PRIVILEGE_REQUIRED/);
});

test('enforced fence: kernel denies legacy writes (EACCES), bytes unchanged', async t => {
  if (!LINUX) t.skip('linux-only');
  if (!ROOT) t.skip('needs privilege (chown)');
  await makeProvider(t);
  const dir = await fixture(t);
  // Fixture owned by the legacy principal so writes would succeed unfenced.
  const own = async d => {
    for (const e of await (await import('node:fs/promises')).readdir(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await own(p);
      await chown(p, LEGACY_UID, LEGACY_GID).catch(() => {});
    }
  };
  await own(dir);
  await chown(dir, LEGACY_UID, LEGACY_GID);
  const receipt = await enforceLegacyFence(dir, {
    protectedPaths: ['.vcp', 'AGENTS.md'],
    writerUid: WRITER_UID, writerGid: WRITER_GID,
  });
  assert.equal(receipt.backend, 'uid-separation');
  const before = await readFile(path.join(dir, 'AGENTS.md'), 'utf8');
  // Attempted writes as the legacy UID: every one must be denied by the OS.
  const attempts = [
    `await import('node:fs/promises').then(m=>m.writeFile('AGENTS.md','pwned'))`,
    `await import('node:fs/promises').then(m=>m.writeFile('.vcp/manifest.json','{}'))`,
    `await import('node:fs/promises').then(m=>m.unlink('.vcp/update.lock'))`,
    `await import('node:fs/promises').then(m=>m.rename('.vcp/manifest.json','.vcp/m2'))`,
    `await import('node:fs/promises').then(m=>m.mkdir('.vcp/evil'))`,
  ];
  for (const code of attempts) {
    const r = asLegacy(`try { ${code}; console.log('WROTE'); } catch(e){ console.log('DENIED:'+e.code); }`, dir);
    assert.match(r.stdout, /DENIED:EACCES/, 'legacy write was not denied: ' + code);
  }
  assert.equal(await readFile(path.join(dir, 'AGENTS.md'), 'utf8'), before);
  const v = await verifyLegacyFence(dir, receipt);
  assert.equal(v.intact, true);
  await releaseLegacyFence(dir, receipt);
});

test('verify detects ownership, mode and replacement violations', async t => {
  if (!LINUX) t.skip('linux-only');
  if (!ROOT) t.skip('needs privilege (chown)');
  await makeProvider(t);
  const dir = await fixture(t);
  const receipt = await enforceLegacyFence(dir, {
    protectedPaths: ['.vcp'], writerUid: WRITER_UID, writerGid: WRITER_GID,
  });
  // 1. mode change
  await chmod(path.join(dir, '.vcp', 'manifest.json'), 0o666);
  let v = await verifyLegacyFence(dir, receipt);
  assert.equal(v.intact, false);
  assert.ok(v.violations.some(x => x.code === 'E_FENCE_MODE_CHANGED'));
  await chmod(path.join(dir, '.vcp', 'manifest.json'), 0o640);
  // 2. ownership change
  await chown(path.join(dir, '.vcp', 'manifest.json'), 0, 0);
  v = await verifyLegacyFence(dir, receipt);
  assert.ok(v.violations.some(x => x.code === 'E_FENCE_OWNERSHIP_CHANGED'));
  await chown(path.join(dir, '.vcp', 'manifest.json'), WRITER_UID, WRITER_GID);
  // 3. protected dir renamed aside via writable parent (the parent-rename hole)
  const { rename } = await import('node:fs/promises');
  await rename(path.join(dir, '.vcp'), path.join(dir, '.vcp.moved'));
  await mkdir(path.join(dir, '.vcp'));
  v = await verifyLegacyFence(dir, receipt);
  assert.equal(v.intact, false);
  assert.ok(v.violations.some(x =>
    x.code === 'E_FENCE_ENTRY_MISSING' || x.code === 'E_FENCE_ROOT_REPLACED'));
  // restore for cleanup
  await rm(path.join(dir, '.vcp'), { recursive: true, force: true });
  await rename(path.join(dir, '.vcp.moved'), path.join(dir, '.vcp'));
  v = await verifyLegacyFence(dir, receipt);
  assert.equal(v.intact, true);
  await releaseLegacyFence(dir, receipt);
});

test('enforce refuses a symlinked control tree', async t => {
  if (!LINUX) t.skip('linux-only');
  if (!ROOT) t.skip('needs privilege (chown)');
  await makeProvider(t);
  const dir = await fixture(t);
  await rm(path.join(dir, '.vcp'), { recursive: true, force: true });
  await symlink('/tmp', path.join(dir, '.vcp'));
  await assert.rejects(
    enforceLegacyFence(dir, { protectedPaths: ['.vcp'], writerUid: WRITER_UID, writerGid: WRITER_GID }),
    e => e.code === 'E_FENCE_SYMLINK_REFUSED');
});

test('immutable backend reports honestly when the capability is absent', async t => {
  if (!LINUX) t.skip('linux-only');
  if (!ROOT) t.skip('needs privilege (chown)');
  const p = await makeProvider(t);
  const caps = await p.probeCapabilities();
  const dir = await fixture(t);
  if (!caps.immutableSettable) {
    await assert.rejects(
      enforceLegacyFence(dir, {
        protectedPaths: ['.vcp'], writerUid: WRITER_UID, writerGid: WRITER_GID,
        backend: 'immutable',
      }),
      e => e.code === 'E_FENCE_IMMUTABLE_UNAVAILABLE');
    t.diagnostic('immutable enforcement UNVERIFIED here (no CAP_LINUX_IMMUTABLE)');
  } else {
    const receipt = await enforceLegacyFence(dir, {
      protectedPaths: ['.vcp'], writerUid: WRITER_UID, writerGid: WRITER_GID,
      backend: 'immutable',
    });
    assert.ok(receipt.entries.every(e => e.immutable));
    await releaseLegacyFence(dir, receipt);
  }
});
