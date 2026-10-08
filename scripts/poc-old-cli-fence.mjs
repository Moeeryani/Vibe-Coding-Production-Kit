#!/usr/bin/env node
// Investigative POC, NOT a compatibility fence or migration implementation.
// Runs the independently authenticated PUBLISHED 0.9.3 npm archive on disposable projects only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const pkgName = 'vibe-coding-production';
const version = '0.9.3';
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const cases = [
  'rollback-v1-backup',
  'rollback-v2-erases-user-edit',
  'rollback-stale-transaction',
  'dead-pid-file-lock',
  'separate-lifecycle-lock',
  'directory-sentinel-rollback',
  'directory-sentinel-update',
  'directory-sentinel-manage',
  'fresh-malformed-lock',
  'aged-malformed-lock',
  'intact-v2-old-init',
  'deleted-manifest-old-init'
];

function parse(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (item === '--help' || item === '--self-test') {
      values[item.slice(2)] = true;
      continue;
    }
    if (!['--tarball', '--expected-integrity', '--scenario', '--evidence'].includes(item) || !argv[i + 1]) {
      throw new Error('Invalid argument: ' + item);
    }
    values[item.slice(2)] = argv[++i];
  }
  if (values.scenario && values.scenario !== 'all' && !cases.includes(values.scenario)) {
    throw new Error('Unknown scenario: ' + values.scenario);
  }
  return values;
}

function execute(bin, args, cwd, timeout = 20000) {
  const done = spawnSync(process.execPath, [bin, ...args], {
    cwd, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
    env: { ...process.env, CI: 'true', npm_config_offline: 'true' }
  });
  return {
    args, exitCode: done.status, signal: done.signal,
    error: done.error?.message ?? null,
    stdout: (done.stdout ?? '').slice(0, 4000),
    stderr: (done.stderr ?? '').slice(0, 4000)
  };
}

async function lockKind(root) {
  try {
    const stat = await lstat(path.join(root, '.vcp', 'update.lock'));
    return stat.isDirectory() ? 'directory' : stat.isFile() ? 'regular-file' : stat.isSymbolicLink() ? 'symlink' : 'other';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'absent';
    throw error;
  }
}

async function snapshot(root) {
  const result = new Map();
  async function walk(dir, parent = '') {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const item of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = parent ? parent + '/' + item.name : item.name;
      // Runtime lock is intentionally excluded; other .vcp state is NOT excluded.
      if (rel === '.vcp/update.lock') continue;
      const target = path.join(dir, item.name);
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) result.set(rel, 'link:' + await readlink(target));
      else if (stat.isDirectory()) {
        result.set(rel + '/', 'dir');
        await walk(target, rel);
      } else if (stat.isFile()) {
        result.set(rel, 'file:' + (stat.mode & 0o777) + ':' + digest(await readFile(target)));
      } else result.set(rel, 'special:' + stat.mode);
    }
  }
  await walk(root);
  return result;
}
function changed(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])].sort().filter(
    key => before.get(key) !== after.get(key)
  ).map(key => ({ path: key, before: before.get(key) ?? null, after: after.get(key) ?? null }));
}

async function publishedCli(archive, expected, scratch) {
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(expected ?? '')) {
    throw new Error('Expected an independent npm registry sha512-... integrity string.');
  }
  const archivePath = path.resolve(archive ?? '');
  if (!archivePath.endsWith('.tgz')) throw new Error('Provide the original npm .tgz tarball.');
  const bytes = await readFile(archivePath);
  const actual = 'sha512-' + digest(bytes, 'sha512', 'base64');
  if (actual !== expected) throw new Error('Tarball does not match trusted npm registry integrity.');
  const unpackRoot = path.join(scratch, 'unpacked');
  await mkdir(unpackRoot, { recursive: true });
  const untar = spawnSync('tar', ['-xzf', archivePath, '-C', unpackRoot], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024
  });
  if (untar.status !== 0) throw new Error('Authenticated tarball extraction failed: ' + (untar.error?.message || untar.stderr));
  const root = path.join(unpackRoot, 'package');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  if (pkg.name !== pkgName || pkg.version !== version) throw new Error('Wrong extracted published package identity.');
  const bin = path.join(root, 'bin', 'vibe-coding-production.mjs');
  await readFile(bin);
  return { bin, tarballSha256: digest(bytes), package: { name: pkg.name, version: pkg.version } };
}

const ids = {
  old: '2026-01-01T00-00-00-000Z-a0000000',
  newer: '2026-02-01T00-00-00-000Z-b0000000'
};
async function backup(root, id, manifest, agent) {
  const target = path.join(root, '.vcp', 'backups', id);
  await mkdir(path.join(target, 'files'), { recursive: true });
  await writeFile(path.join(target, 'files', 'AGENTS.md'), agent);
  await writeFile(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(target, 'backup.json'), JSON.stringify({
    id, createdAt: id === ids.old ? '2026-01-01T00:00:00Z' : '2026-02-01T00:00:00Z',
    installedVersion: version, entries: [{ path: 'AGENTS.md', exists: true, mode: 420 }]
  }, null, 2) + '\n');
}
async function fixture(bin, scratch, name) {
  const root = path.join(scratch, 'projects', name);
  await mkdir(root, { recursive: true });
  const init = execute(bin, ['init', root, '--yes', '--no-github'], root, 40000);
  if (init.exitCode !== 0) throw new Error('Cannot initialize disposable baseline: ' + JSON.stringify(init));
  const mf = path.join(root, '.vcp', 'manifest.json');
  const old = JSON.parse(await readFile(mf, 'utf8'));
  if (old.schemaVersion !== 1) throw new Error('Old release did not create schema v1.');
  const original = await readFile(path.join(root, 'AGENTS.md'));
  const newer = {
    ...old, schemaVersion: 2, minimumReaderVersion: '999.0.0',
    install: { ...old.install, assetSet: 'brownfield-minimal-v1' }
  };
  await backup(root, ids.old, old, original);
  if (['rollback-v2-erases-user-edit', 'rollback-stale-transaction'].includes(name)) {
    await backup(root, ids.newer, newer, original);
  }
  await writeFile(mf, JSON.stringify(newer, null, 2) + '\n');
  await writeFile(path.join(root, 'AGENTS.md'), Buffer.concat([
    original, Buffer.from('\nUSER_POST_BACKUP_EDIT_MUST_SURVIVE=true\n')
  ]));
  if (name === 'rollback-stale-transaction') {
    await writeFile(path.join(root, '.vcp', 'transaction.json'), JSON.stringify({
      schemaVersion: 1, backupId: ids.old, id: ids.old, phase: 'applying'
    }, null, 2) + '\n');
  }
  const lock = path.join(root, '.vcp', 'update.lock');
  if (name === 'dead-pid-file-lock') {
    await writeFile(lock, JSON.stringify({ host: os.hostname(), pid: 2147483647, startedAt: new Date().toISOString() }));
  }
  if (name.startsWith('directory-sentinel')) await mkdir(lock);
  if (name === 'fresh-malformed-lock' || name === 'aged-malformed-lock') {
    await writeFile(lock, 'not-json\n');
    if (name === 'aged-malformed-lock') {
      const aged = new Date(Date.now() - 2 * 60 * 60 * 1000);
      await utimes(lock, aged, aged);
    }
  }
  if (name === 'separate-lifecycle-lock') {
    await writeFile(path.join(root, '.vcp', 'lifecycle.lock'), JSON.stringify({ pid: process.pid, host: os.hostname() }));
  }
  if (name === 'deleted-manifest-old-init') await rm(mf);
  return root;
}

async function observe(bin, scratch, name) {
  const root = await fixture(bin, scratch, name);
  const before = await snapshot(root);
  const lockBefore = await lockKind(root);
  let args = ['rollback', root];
  if (name === 'directory-sentinel-update') args = ['update', root, '--offline'];
  if (name === 'directory-sentinel-manage') args = ['manage', 'ignore', 'AGENTS.md', '--dir', root];
  if (name.endsWith('old-init')) args = ['init', root, '--yes', '--no-github', '--force'];
  const command = execute(bin, args, root, 40000);
  const after = await snapshot(root);
  const lockAfter = await lockKind(root);
  const changes = changed(before, after);
  const expectedMutation = ![
    'directory-sentinel-rollback', 'directory-sentinel-update', 'directory-sentinel-manage',
    'fresh-malformed-lock', 'intact-v2-old-init'
  ].includes(name);
  let resultingSchema = null;
  try {
    resultingSchema = JSON.parse(await readFile(path.join(root, '.vcp', 'manifest.json'), 'utf8')).schemaVersion;
  } catch { /* absent or damaged, surfaced as null */ }
  const postBackupEditSurvived = (await readFile(path.join(root, 'AGENTS.md'), 'utf8')).includes('USER_POST_BACKUP_EDIT_MUST_SURVIVE=true');
  return {
    scenario: name, command, expectedMutation,
    observedMutation: changes.length > 0,
    expectedObservationMatched: (changes.length > 0) === expectedMutation &&
      (!name.startsWith('directory-sentinel-') || lockAfter === 'directory'),
    legacyLockBefore: lockBefore, legacyLockAfter: lockAfter,
    resultingSchema, postBackupEditSurvived, changes,
    conclusion: changes.length ? 'LEGACY_MUTATION_OBSERVED__NOT_SAFE' : 'NO_PROTECTED_BYTES_CHANGED_IN_ONE_FIXTURE_ONLY'
  };
}

async function selfTest() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-poc-selftest-'));
  try {
    await writeFile(path.join(root, 'test.txt'), 'a');
    const before = await snapshot(root);
    await writeFile(path.join(root, 'test.txt'), 'b');
    const after = await snapshot(root);
    assert.deepEqual(changed(before, after).map(x => x.path), ['test.txt']);
    await mkdir(path.join(root, '.vcp'));
    await mkdir(path.join(root, '.vcp', 'update.lock'));
    const ignored = await snapshot(root);
    assert.deepEqual(changed(after, ignored).map(x => x.path), ['.vcp/']);
    assert.equal(await lockKind(root), 'directory');
    console.log('HARNESS_SELF_TEST_PASS (no published CLI executed)');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function main() {
  const opt = parse(process.argv.slice(2));
  if (opt.help) {
    console.log('node scripts/poc-old-cli-fence.mjs --tarball <published-0.9.3.tgz> --expected-integrity <registry-sha512> [--scenario all|name] [--evidence <abs-output.json>]');
    console.log('Scenarios: ' + cases.join(', '));
    return;
  }
  if (opt['self-test']) return selfTest();
  if (!opt.tarball || !opt['expected-integrity']) {
    throw new Error('BLOCKED: published tarball and independent npm registry integrity are REQUIRED.');
  }
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'vcp-old-cli-fence-'));
  try {
    const release = await publishedCli(opt.tarball, opt['expected-integrity'], scratch);
    const names = opt.scenario && opt.scenario !== 'all' ? [opt.scenario] : cases;
    const results = [];
    for (const name of names) results.push(await observe(release.bin, scratch, name));
    const unsafe = results.filter(x => x.observedMutation);
    const unexpected = results.filter(x => !x.expectedObservationMatched);
    const receipt = {
      type: 'published-old-cli-fence-observation', status: 'NOT_A_MIGRATION_APPROVAL',
      baseline: '8ccb276545fdb3cc301ce7ce324812eb4c314586',
      release: release.package, tarballSha256: release.tarballSha256, node: process.version,
      platform: process.platform, arch: process.arch, recordedUtc: new Date().toISOString(),
      snapshotScope: 'all fixture files and modes except update.lock bytes; legacy lock path kind separately recorded; byte SHA256, no mtimes',
      results, expectedObservationsMatched: results.length - unexpected.length, unexpected: unexpected.length,
      unsafeMutationCount: unsafe.length,
      gate: unsafe.length ? 'NO_GO__LEGACY_MUTATION_DEMONSTRATED' : 'UNPROVEN__TESTED_CASES_ONLY',
      unverified: ['atomic file-to-directory sentinel conversion', 'actual new-vs-old CLI concurrency',
        'crash injection', 'cross-platform supported environments', 'independent registry provenance']
    };
    if (opt.evidence) {
      const dst = path.resolve(opt.evidence);
      if (dst.startsWith(scratch + path.sep)) throw new Error('Evidence path must be outside temp fixtures.');
      await mkdir(path.dirname(dst), { recursive: true });
      await writeFile(dst, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    }
    console.log(JSON.stringify({
      gate: receipt.gate, cases: results.length, unsafeMutationCount: unsafe.length,
      unexpectedObservations: unexpected.length, evidence: opt.evidence ?? 'stdout-only'
    }));
    process.exitCode = unexpected.length ? 3 : unsafe.length ? 2 : 0;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error('POC NOT RUN / FAILED: ' + error.message);
  process.exitCode = 3;
});
