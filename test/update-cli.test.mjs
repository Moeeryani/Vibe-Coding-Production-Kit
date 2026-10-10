import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(repoRoot, 'bin/vibe-coding-production.mjs');

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-update-cli-'));
}

async function run(args, options = {}) {
  return execFileAsync(process.execPath, [bin, ...args], {
    cwd: repoRoot,
    maxBuffer: 2 * 1024 * 1024,
    ...options
  });
}

async function init(root) {
  return seedLegacyV1Fixture({targetDir:root,agent:'generic',stack:'generic',includeGitHub:false});
}

async function initAuto(root) {
  return seedLegacyV1Fixture({targetDir:root,agent:'generic',stack:'auto',includeGitHub:false});
}

test('public CLI init refuses NEW schema writes before creating a manifest', async () => {
  const root = await tempDir();
  await assert.rejects(run(['init',root,'--agent','generic','--stack','generic',
    '--no-github','--yes']),error=>{
    assert.equal(error.code,1);
    assert.match(error.stderr,/D-01\/G-FENCE NO-GO/);
    return true;
  });
  await assert.rejects(readFile(path.join(root,'.vcp/manifest.json'),'utf8'),
    /ENOENT/);
});

test('test-only historical v1 fixture enables downstream CLI update conformance',async()=>{
  const root=await tempDir();
  await init(root);
  const manifest=JSON.parse(await readFile(path.join(root,'.vcp/manifest.json'),'utf8'));
  assert.equal(manifest.schemaVersion,1);
  assert.equal(manifest.installedVersion,'0.9.3');
  assert.ok(Object.keys(manifest.managedFiles).length>0);
});

test('CLI update check works offline without registry access', async () => {
  const root = await tempDir();
  await init(root);
  const { stdout } = await run(['update', root, '--check', '--offline', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.installedVersion, '0.9.3');
  assert.equal(report.cliVersion, '0.9.3');
  assert.equal(report.registryChecked, false);
  assert.equal(report.latestVersion, null);
  assert.equal(report.recommendedVersion, '0.9.3');
  assert.equal(report.updateAvailable, false);
});

test('CLI update check reports eligible automatic stack profile changes', async () => {
  const root = await tempDir();
  await initAuto(root);
  const before = JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'));
  assert.equal(before.install.stack, 'generic');
  assert.equal(before.install.requestedStack, 'auto');

  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'cli-js' }, null, 2)}\n`, 'utf8');

  const { stdout: human } = await run(['update', root, '--check', '--offline']);
  assert.match(human, /Stack profile: generic -> javascript/);
  assert.match(human, /Project update available/);

  const { stdout: json } = await run(['update', root, '--check', '--offline', '--json']);
  const report = JSON.parse(json);
  assert.equal(report.versionUpdateAvailable, false);
  assert.equal(report.updateAvailable, true);
  assert.equal(report.stackProfileChange.from, 'generic');
  assert.equal(report.stackProfileChange.to, 'javascript');
});

test('CLI update dry-run is machine-readable and write-free', async () => {
  const root = await tempDir();
  await init(root);
  const before = await readFile(path.join(root, '.vcp/manifest.json'), 'utf8');
  const { stdout } = await run(['update', root, '--dry-run', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.upToDate, true);
  assert.equal(report.applied, false);
  assert.equal(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'), before);
});

test('CLI dry-run exits non-zero on conflicts without repairing them silently', async () => {
  const root = await tempDir();
  await init(root);
  await rm(path.join(root, 'AGENTS.md'));

  await assert.rejects(
    run(['update', root, '--dry-run']),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /CONFLICT/);
      return true;
    }
  );

  await assert.rejects(readFile(path.join(root, 'AGENTS.md'), 'utf8'));
});

test('CLI manage ignore and track preserve local content', async () => {
  const root = await tempDir();
  await init(root);
  const agents = path.join(root, 'AGENTS.md');
  await writeFile(agents, `${await readFile(agents, 'utf8')}\n## Local addition\nKeep me.\n`);
  const before = await readFile(agents, 'utf8');

  await run(['manage', 'ignore', 'AGENTS.md', '--dir', root]);
  assert.equal(await readFile(agents, 'utf8'), before);
  let manifest = JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'));
  assert.ok(manifest.ignoredFiles.includes('AGENTS.md'));

  await run(['manage', 'track', 'AGENTS.md', '--dir', root]);
  assert.equal(await readFile(agents, 'utf8'), before);
  manifest = JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'));
  assert.equal(manifest.ignoredFiles.includes('AGENTS.md'), false);
});

test('CLI update and rollback restore the previous manifest version', async () => {
  const root = await tempDir();
  await init(root);
  const manifestPath = path.join(root, '.vcp/manifest.json');
  const oldManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  oldManifest.installedVersion = '0.8.0';
  for (const entry of Object.values(oldManifest.managedFiles)) entry.templateVersion = '0.8.0';
  await writeFile(manifestPath, `${JSON.stringify(oldManifest, null, 2)}\n`, 'utf8');

  const { stdout: updateStdout } = await run(['update', root, '--offline', '--json']);
  const update = JSON.parse(updateStdout);
  assert.equal(update.applied, true);
  assert.ok(update.backupId);
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).installedVersion, '0.9.3');

  const { stdout: rollbackStdout } = await run(['rollback', root, '--backup', update.backupId, '--json']);
  const rollback = JSON.parse(rollbackStdout);
  assert.equal(rollback.restoredVersion, '0.8.0');
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).installedVersion, '0.8.0');
});
