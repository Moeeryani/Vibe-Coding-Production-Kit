import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');

test('release-check preview is exposed through the public CLI as structured evidence', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    bin,
    'release-check',
    '0.9.3',
    '--dir',
    repoRoot,
    '--json'
  ], { cwd: repoRoot });

  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.kind, 'release-candidate');
  assert.equal(report.mode, 'preview');
  assert.equal(report.version, '0.9.3');
  assert.equal(report.success, true);
  assert.equal(report.releaseApproved, false);
  assert.equal(report.published, false);
  assert.equal(report.checks.find((item) => item.id === 'candidate-tag').status, 'human-decision');
  assert.equal(report.checks.find((item) => item.id === 'npm-publish').status, 'human-decision');
  assert.equal(report.summary.planned, 4);
});

test('release-check human output states that release approval remains a human decision', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    bin,
    'release-check',
    '0.9.3',
    '--dir',
    repoRoot
  ], { cwd: repoRoot });

  assert.match(stdout, /Release approval: HUMAN DECISION/);
  assert.match(stdout, /\[HUMAN_DECISION\] candidate-tag/);
  assert.match(stdout, /\[HUMAN_DECISION\] npm-publish/);
});

test('release-check requires an explicit candidate version', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [bin, 'release-check', '--dir', repoRoot]),
    (error) => {
      assert.match(error.stderr, /Release-check requires a candidate version/);
      return true;
    }
  );
});

test('--policy is scoped to release-check', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [bin, 'doctor', '.', '--policy', '.github/release-policy.json']),
    (error) => {
      assert.match(error.stderr, /--policy is only supported by the release-check command/);
      return true;
    }
  );
});
