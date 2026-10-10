import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(repoRoot, 'bin/vibe-coding-production.mjs');

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-update-status-'));
}

async function run(args) {
  return execFileAsync(process.execPath, [bin, ...args], {
    cwd: repoRoot,
    maxBuffer: 2 * 1024 * 1024
  });
}

async function init(root, stack = 'generic') {
  return seedLegacyV1Fixture({targetDir:root,agent:'generic',stack,includeGitHub:false});
}

test('update check exits zero and reports no-work when nothing is pending', async () => {
  const root = await tempDir();
  await init(root);

  const { stdout } = await run(['update', root, '--check', '--offline', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.lifecycleStatus, 'no-work');
  assert.equal(report.updateAvailable, false);
});

test('update check exits zero and reports available when lifecycle work is pending', async () => {
  const root = await tempDir();
  await init(root, 'auto');
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'now-js' }, null, 2)}\n`, 'utf8');

  const { stdout } = await run(['update', root, '--check', '--offline', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.lifecycleStatus, 'available');
  assert.equal(report.updateAvailable, true);
});

test('dry-run reports available without changing the existing zero exit contract', async () => {
  const root = await tempDir();
  await init(root, 'auto');
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'now-js' }, null, 2)}\n`, 'utf8');

  const { stdout } = await run(['update', root, '--dry-run', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.lifecycleStatus, 'available');
  assert.equal(report.needsApply, true);
  assert.equal(report.applied, false);
});

test('blocked dry-run exits one with a valid blocked lifecycle report', async () => {
  const root = await tempDir();
  await init(root);
  await rm(path.join(root, 'AGENTS.md'));

  await assert.rejects(
    run(['update', root, '--dry-run', '--json']),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.equal(report.lifecycleStatus, 'blocked');
      assert.ok(report.conflicts > 0);
      return true;
    }
  );
});

test('successful apply reports applied and exits zero', async () => {
  const root = await tempDir();
  await init(root);
  const manifestPath = path.join(root, '.vcp/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.installedVersion = '0.8.0';
  for (const entry of Object.values(manifest.managedFiles)) entry.templateVersion = '0.8.0';
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const { stdout } = await run(['update', root, '--offline', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.lifecycleStatus, 'applied');
  assert.equal(report.applied, true);
});

test('execution failure exits one through the error channel, not a normal lifecycle report', async () => {
  const root = await tempDir();
  await init(root);
  await writeFile(path.join(root, '.vcp/manifest.json'), '{ broken manifest\n', 'utf8');

  await assert.rejects(
    run(['update', root, '--check', '--offline', '--json']),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.match(error.stderr, /Error:/);
      return true;
    }
  );
});
