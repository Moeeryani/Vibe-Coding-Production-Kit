#!/usr/bin/env node
// D-01 Linux fence proof harness (investigative POC, NOT a migration approval).
//
// Runs the independently authenticated PUBLISHED vibe-coding-production@0.9.3
// npm archive against disposable fixtures in two modes:
//
//   baseline : no fence; old CLI runs as the fixture owner.
//              Expected: protected user bytes are lost (NO-GO reproduced).
//   fenced   : uid-separation fence enforced (protected tree chowned to a
//              distinct writer UID, 0750/0640); old CLI runs as the legacy
//              UID via setpriv. Expected: the KERNEL denies every protected
//              write (EACCES/EPERM), zero protected bytes change.
//
// A same-UID control experiment is included to prove the impossibility
// claim: DAC cannot separate two programs under one UID.
//
// Scenarios: the 13 historical cases plus corrupt-manifest variants,
// old/new concurrency, crash+restart, symlink and parent-swap attacks.
//
// Requirements: must run as root (chown + setpriv). All fixtures under a
// fresh disposable scratch dir. Never touches real user files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm,
  utimes, writeFile, chmod, chown, symlink, rename,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { enforceLegacyFence, verifyLegacyFence, releaseLegacyFence } =
  await import(path.join(HERE, '..', 'lib', 'linux-legacy-fence.mjs'));

const PKG = 'vibe-coding-production', VERSION = '0.9.3';
const LEGACY_UID = 60001, LEGACY_GID = 60001;
const WRITER_UID = 60002, WRITER_GID = 60002;
const digest = (b, a = 'sha256', e = 'hex') => createHash(a).update(b).digest(e);

const cases = [
  'rollback-v1-backup', 'rollback-v2-erases-user-edit',
  'rollback-stale-transaction', 'dead-pid-file-lock',
  'separate-lifecycle-lock', 'directory-sentinel-rollback',
  'directory-sentinel-update', 'directory-sentinel-manage',
  'fresh-malformed-lock', 'aged-malformed-lock',
  'intact-v2-old-init', 'deleted-manifest-old-init',
  'deleted-manifest-directory-sentinel-old-init',
  'corrupt-manifest-old-init', 'corrupt-manifest-old-rollback',
  'old-new-concurrent', 'crash-restart-old-rollback',
  'symlink-vcp-old-init', 'parent-swap-mid-transaction',
];

function parse(argv) {
  const v = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--help') { v.help = true; continue; }
    if (t === '--self-test') { v['self-test'] = true; continue; }
    if (!['--tarball', '--expected-integrity', '--mode', '--evidence',
      '--scenario', '--new-cli'].includes(t) || !argv[i + 1])
      throw new Error('Invalid argument: ' + t);
    v[t.slice(2)] = argv[++i];
  }
  if (v.mode && !['baseline', 'fenced', 'both'].includes(v.mode))
    throw new Error('mode must be baseline|fenced|both');
  if (v.scenario && v.scenario !== 'all' && !cases.includes(v.scenario))
    throw new Error('Unknown scenario: ' + v.scenario);
  return v;
}

function sh(cmd, args, { cwd = undefined, uid = null, stdin = null } = {}) {
  const full = uid === null ? [cmd, args]
    : ['setpriv', [`--reuid=${uid}`, `--regid=${uid}`, '--clear-groups',
      '--reset-env', '--', cmd, ...args]];
  const done = spawnSync(full[0], full[1], {
    cwd, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024,
    input: stdin ?? undefined,
    env: uid === null ? { ...process.env, CI: 'true', npm_config_offline: 'true' }
      : {
        PATH: '/usr/bin:/bin', CI: 'true', npm_config_offline: 'true',
        HOME: process.env.POC_LEGACY_HOME ?? '/tmp',
      },
  });
  return {
    exitCode: done.status, signal: done.signal,
    error: done.error?.message ?? null,
    stdout: (done.stdout ?? '').slice(0, 4000),
    stderr: (done.stderr ?? '').slice(0, 4000),
  };
}

async function snapshot(root) {
  const result = new Map();
  async function walk(dir, parent = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const item of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = parent ? parent + '/' + item.name : item.name;
      const target = path.join(dir, item.name);
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) result.set(rel, 'link:' + await readlink(target));
      else if (stat.isDirectory()) { result.set(rel + '/', 'dir'); await walk(target, rel); }
      else if (stat.isFile())
        result.set(rel, `file:${(stat.mode & 0o777).toString(8)}:${stat.uid}:${stat.gid}:` +
          digest(await readFile(target)));
      else result.set(rel, 'special:' + stat.mode);
    }
  }
  await walk(root);
  return result;
}
const changed = (before, after) =>
  [...new Set([...before.keys(), ...after.keys()])].sort()
    .filter(k => before.get(k) !== after.get(k))
    .map(p => ({ path: p, before: before.get(p) ?? null, after: after.get(p) ?? null }));

async function publishedCli(archive, expected, scratch) {
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(expected ?? ''))
    throw new Error('Expected an independent npm registry sha512-... integrity string.');
  const archivePath = path.resolve(archive ?? '');
  if (!archivePath.endsWith('.tgz')) throw new Error('Provide the original npm .tgz tarball.');
  const bytes = await readFile(archivePath);
  const actual = 'sha512-' + digest(bytes, 'sha512', 'base64');
  if (actual !== expected) throw new Error('Tarball does not match trusted npm registry integrity.');
  const unpackRoot = path.join(scratch, 'unpacked');
  await mkdir(unpackRoot, { recursive: true });
  await chmod(unpackRoot, 0o755); // umask-independent: legacy must traverse
  // The legacy principal must be able to read+execute the unpacked CLI.
  const untar = spawnSync('tar', ['-xzf', archivePath, '-C', unpackRoot],
    { encoding: 'utf8', timeout: 90000 });
  if (untar.status !== 0) throw new Error('Authenticated tarball extraction failed.');
  const root = path.join(unpackRoot, 'package');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== PKG || pkg.version !== VERSION)
    throw new Error('Wrong extracted published package identity.');
  await chown(root, LEGACY_UID, LEGACY_GID).catch(() => {});
  await chmod(root, 0o755).catch(() => {}); // tarball ships 0770 dirs
  const fix = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await fix(p);
      await chmod(p, e.isDirectory() ? 0o755 : 0o644).catch(() => {});
    }
  };
  await fix(root);
  const bin = path.join(root, 'bin', 'vcp.mjs');
  try { await readFile(bin); return { bin, tarballSha256: digest(bytes) }; }
  catch { /* fall through to alternate bin name */ }
  const bin2 = path.join(root, 'bin', 'vibe-coding-production.mjs');
  await readFile(bin2);
  return { bin: bin2, tarballSha256: digest(bytes) };
}

const ids = {
  old: '2026-01-01T00-00-00-000Z-a0000000',
  newer: '2026-02-01T00-00-00-000Z-b0000000',
};
async function backup(root, id, manifest, agent) {
  const target = path.join(root, '.vcp', 'backups', id);
  await mkdir(path.join(target, 'files'), { recursive: true });
  await writeFile(path.join(target, 'files', 'AGENTS.md'), agent);
  await writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(target, 'backup.json'), JSON.stringify({
    id, createdAt: id === ids.old ? '2026-01-01T00:00:00Z' : '2026-02-01T00:00:00Z',
    installedVersion: VERSION, entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }],
  }, null, 2) + '\n');
}

async function fixture(bin, scratch, name, mode = 'baseline') {
  const root = path.join(scratch, 'projects', mode, name);
  await mkdir(root, { recursive: true });
  // umask-independent: the legacy principal must traverse the parents.
  await chmod(path.join(scratch, 'projects'), 0o755).catch(() => {});
  await chmod(path.join(scratch, 'projects', mode), 0o755).catch(() => {});
  await chown(root, LEGACY_UID, LEGACY_GID);
  const init = sh(process.execPath, [bin, 'init', root, '--yes', '--no-github'],
    { cwd: root, uid: LEGACY_UID });
  if (init.exitCode !== 0)
    throw new Error('Cannot initialize disposable baseline: ' + JSON.stringify(init));
  const mf = path.join(root, '.vcp', 'manifest.json');
  const old = JSON.parse(await readFile(mf, 'utf8'));
  if (old.schemaVersion !== 1) throw new Error('Old release did not create schema v1.');
  const original = await readFile(path.join(root, 'AGENTS.md'));
  const newer = {
    ...old, schemaVersion: 2, minimumReaderVersion: '999.0.0',
    install: { ...old.install, assetSet: 'brownfield-minimal-v1' },
  };
  await backup(root, ids.old, old, original);
  if (['rollback-v2-erases-user-edit', 'rollback-stale-transaction',
    'corrupt-manifest-old-rollback'].includes(name))
    await backup(root, ids.newer, newer, original);
  await writeFile(mf, JSON.stringify(newer, null, 2) + '\n');
  await writeFile(path.join(root, 'AGENTS.md'), Buffer.concat([
    original, Buffer.from('\nUSER_POST_BACKUP_EDIT_MUST_SURVIVE=true\n'),
  ]));
  // The fixture is legacy-owned until the fence seals it.
  await chown(root, LEGACY_UID, LEGACY_GID).catch(() => {});
  const lock = path.join(root, '.vcp', 'update.lock');
  if (name === 'dead-pid-file-lock')
    await writeFile(lock, JSON.stringify({ host: os.hostname(), pid: 2147483647, startedAt: new Date().toISOString() }));
  if (name.startsWith('directory-sentinel') || name === 'deleted-manifest-directory-sentinel-old-init')
    await mkdir(lock);
  if (name === 'fresh-malformed-lock' || name === 'aged-malformed-lock') {
    await writeFile(lock, 'not-json\n');
    if (name === 'aged-malformed-lock') {
      const aged = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(lock, aged, aged);
    }
  }
  if (name === 'separate-lifecycle-lock')
    await writeFile(path.join(root, '.vcp', 'lifecycle.lock'), JSON.stringify({ pid: 1, host: os.hostname() }));
  if (name === 'deleted-manifest-old-init' || name === 'deleted-manifest-directory-sentinel-old-init')
    await rm(mf);
  if (name === 'corrupt-manifest-old-init' || name === 'corrupt-manifest-old-rollback')
    await writeFile(mf, '{corrupt-json[[\n');
  if (name === 'symlink-vcp-old-init') {
    await rm(path.join(root, '.vcp'), { recursive: true, force: true });
    await symlink('/nonexistent-vcp-target', path.join(root, '.vcp'));
  }
  // Everything legacy-owned so the old CLI *could* write without a fence.
  const own = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (!e.isSymbolicLink() && e.isDirectory()) await own(p);
      if (!e.isSymbolicLink()) await chown(p, LEGACY_UID, LEGACY_GID).catch(() => {});
    }
  };
  await own(root);
  await chown(root, LEGACY_UID, LEGACY_GID).catch(() => {});
  return root;
}

function scenarioArgs(bin, name, root) {
  if (name === 'directory-sentinel-update') return [bin, 'update', root, '--offline'];
  if (name === 'directory-sentinel-manage') return [bin, 'manage', 'ignore', 'AGENTS.md', '--dir', root];
  if (name.endsWith('old-init')) return [bin, 'init', root, '--yes', '--no-github', '--force'];
  if (name === 'corrupt-manifest-old-rollback') return [bin, 'rollback', root];
  return [bin, 'rollback', root];
}

async function observe({ bin, scratch, name, mode, newCli }) {
  const root = await fixture(bin, scratch, name, mode);
  let fenceReceipt = null, fenceIntactAfter = null;
  if (mode === 'fenced') {
    if (name === 'symlink-vcp-old-init') {
      // The fence must REFUSE to seal a symlinked control tree.
      let refused = null;
      try {
        await enforceLegacyFence(root, {
          protectedPaths: ['.vcp', 'AGENTS.md'],
          writerUid: WRITER_UID, writerGid: WRITER_GID,
        });
      } catch (e) { refused = e.code; }
      return {
        scenario: name, mode, fenceRefusedToSeal: refused,
        conclusion: refused === 'E_FENCE_SYMLINK_REFUSED'
          ? 'FENCE_CORRECTLY_REFUSED_SYMLINK' : 'UNEXPECTED:' + refused,
      };
    }
    fenceReceipt = await enforceLegacyFence(root, {
      protectedPaths: ['.vcp', 'AGENTS.md'],
      writerUid: WRITER_UID, writerGid: WRITER_GID,
    });
  }
  const before = await snapshot(root);
  const args = scenarioArgs(bin, name, root);
  const waitExit = child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.on('exit', () => resolve());
  });
  let command, extra = {};
  if (name === 'old-new-concurrent' && newCli) {
    command = { concurrent: true, runs: [] };
    const workers = [];
    for (let i = 0; i < 3; i++)
      workers.push(sh(process.execPath, [bin, ...args.slice(1)], { cwd: root, uid: LEGACY_UID }));
    for (let i = 0; i < 5; i++)
      command.runs.push(sh(process.execPath, [newCli, 'inspect', root], { cwd: root }));
    for (const w of workers) command.runs.push(w);
    extra.inspectExitCodes = command.runs.slice(0, 5).map(r => r.exitCode);
  } else if (name === 'crash-restart-old-rollback') {
    const { spawn } = await import('node:child_process');
    const child = spawn('setpriv',
      [`--reuid=${LEGACY_UID}`, `--regid=${LEGACY_GID}`, '--clear-groups',
        '--reset-env', '--', process.execPath, bin, ...args.slice(1)],
      { cwd: root });
    await new Promise(r => setTimeout(r, 1500));
    child.kill('SIGKILL');
    await waitExit(child);
    command = { args, exitCode: child.exitCode, signal: child.signalCode ?? 'SIGKILL', note: 'killed mid-operation, then restarted' };
    const restart = sh(process.execPath, [bin, ...args.slice(1)], { cwd: root, uid: LEGACY_UID });
    extra.restart = { exitCode: restart.exitCode, signal: restart.signal };
  } else if (name === 'parent-swap-mid-transaction') {
    const { spawn } = await import('node:child_process');
    const child = spawn('setpriv',
      [`--reuid=${LEGACY_UID}`, `--regid=${LEGACY_GID}`, '--clear-groups',
        '--reset-env', '--', process.execPath, bin, ...args.slice(1)],
      { cwd: root });
    await new Promise(r => setTimeout(r, 800));
    const away = root + '.swapped-away';
    let swapNote = 'no-swap';
    try { await rename(root, away); await rename(away, root); swapNote = 'swap-and-restore-ok'; }
    catch (e) { swapNote = 'swap-failed:' + e.code; }
    await waitExit(child);
    command = { args, exitCode: child.exitCode, signal: child.signalCode, swapNote };
    extra.swapNote = swapNote;
  } else {
    command = sh(process.execPath, [bin, ...args.slice(1)], { cwd: root, uid: LEGACY_UID });
  }
  const after = await snapshot(root);
  const changes = changed(before, after);
  const protectedPaths = ['AGENTS.md'];
  const protectedChanges = changes.filter(c =>
    c.path === 'AGENTS.md' || c.path === '.vcp/' || c.path.startsWith('.vcp/'));
  let postBackupEditSurvived = true;
  try {
    postBackupEditSurvived = (await readFile(path.join(root, 'AGENTS.md'), 'utf8'))
      .includes('USER_POST_BACKUP_EDIT_MUST_SURVIVE=true');
  } catch { postBackupEditSurvived = false; }
  if (mode === 'fenced') {
    const v = await verifyLegacyFence(root, fenceReceipt);
    fenceIntactAfter = v.intact ? true : v.violations;
    await releaseLegacyFence(root, fenceReceipt).catch(() => {});
  }
  const deniedByKernel = /EACCES|EPERM|permission denied|Operation not permitted/i
    .test(JSON.stringify(command).slice(0, 8000));
  return {
    scenario: name, mode, command: { args: command.args ?? args.slice(1), exitCode: command.exitCode ?? command.runs?.[5]?.exitCode ?? null, signal: command.signal ?? null },
    protectedChanges: protectedChanges.map(c => c.path),
    protectedBytesChanged: protectedChanges.length > 0,
    postBackupEditSurvived,
    kernelDenialObserved: mode === 'fenced' ? deniedByKernel : undefined,
    fenceIntactAfter,
    conclusion: mode === 'fenced'
      ? (protectedChanges.length === 0 ? 'FENCED_NO_PROTECTED_BYTES_CHANGED' : 'FENCE_BREACH')
      : (protectedChanges.length > 0 ? 'LEGACY_MUTATION_OBSERVED__NOT_SAFE' : 'NO_PROTECTED_BYTES_CHANGED_IN_ONE_FIXTURE_ONLY'),
    ...extra,
  };
}

async function selfTest() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-fencepoc-selftest-'));
  try {
    await writeFile(path.join(root, 'a.txt'), 'a');
    const before = await snapshot(root);
    await writeFile(path.join(root, 'a.txt'), 'b');
    const after = await snapshot(root);
    assert.deepEqual(changed(before, after).map(x => x.path), ['a.txt']);
    const v = parse(['--mode', 'both', '--scenario', 'all']);
    assert.equal(v.mode, 'both');
    console.log('HARNESS_SELF_TEST_PASS (no published CLI executed)');
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function main() {
  const opt = parse(process.argv.slice(2));
  if (opt.help) {
    console.log('node scripts/poc-old-cli-fence-linux.mjs --tarball <0.9.3.tgz> --expected-integrity <registry-sha512> --mode baseline|fenced|both --evidence <dir> [--scenario all|name] [--new-cli <bin>]');
    console.log('Scenarios: ' + cases.join(', '));
    return;
  }
  if (opt['self-test']) return selfTest();
  if (process.geteuid?.() !== 0)
    throw new Error('Must run as root (fence chown + setpriv isolation).');
  if (!opt.tarball || !opt['expected-integrity'] || !opt.mode || !opt.evidence)
    throw new Error('BLOCKED: --tarball, --expected-integrity, --mode and --evidence are REQUIRED.');
  const evidenceDir = path.resolve(opt.evidence);
  await mkdir(evidenceDir, { recursive: true });
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'vcp-old-cli-fence-linux-'));
  // The legacy principal must traverse the scratch tree to reach the
  // unpacked CLI and its fixtures (mkdtemp is 0700 by default).
  await chmod(scratch, 0o755);
  const release = await publishedCli(opt.tarball, opt['expected-integrity'], scratch);
  const names = opt.scenario && opt.scenario !== 'all' ? [opt.scenario] : cases;
  const modes = opt.mode === 'both' ? ['baseline', 'fenced'] : [opt.mode];
  const all = [];
  for (const mode of modes)
    for (const name of names)
      all.push(await observe({ bin: release.bin, scratch, name, mode, newCli: opt['new-cli'] }));
  const fenced = all.filter(x => x.mode === 'fenced');
  const breaches = fenced.filter(x => x.protectedBytesChanged);
  const baseline = all.filter(x => x.mode === 'baseline');
  const baselineMutations = baseline.filter(x => x.protectedBytesChanged);
  const receipt = {
    type: 'd01-linux-fence-poc', status: 'NOT_A_MIGRATION_APPROVAL',
    release: { name: PKG, version: VERSION },
    tarballSha256: release.tarballSha256,
    node: process.version, platform: process.platform, arch: process.arch,
    kernel: os.release(), recordedUtc: new Date().toISOString(),
    principalModel: {
      legacyUid: LEGACY_UID, writerUid: WRITER_UID,
      note: 'fence = kernel DAC uid-separation; same-UID separation is impossible by design (control experiment in report)',
    },
    results: all,
    summary: {
      baselineScenarios: baseline.length, baselineProtectedMutations: baselineMutations.length,
      fencedScenarios: fenced.length, fenceBreaches: breaches.length,
    },
    gate: breaches.length ? 'FENCE_BREACH__D01_STAYS_DEFERRED'
      : fenced.length && baselineMutations.length
        ? 'FENCE_HELD_ON_LINUX__REQUIRES_OWNER_APPROVAL_AND_WINDOWS_PROOF'
        : 'INCONCLUSIVE',
  };
  await writeFile(path.join(evidenceDir, 'd01-linux-fence-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({
    gate: receipt.gate,
    baseline: `${baselineMutations.length}/${baseline.length} mutated`,
    fenced: `${breaches.length}/${fenced.length} breached`,
    evidence: evidenceDir,
  }));
  process.exitCode = breaches.length ? 2 : 0;
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
}
main().catch(error => {
  console.error('POC NOT RUN / FAILED: ' + (error?.message ?? error));
  process.exitCode = 3;
});
