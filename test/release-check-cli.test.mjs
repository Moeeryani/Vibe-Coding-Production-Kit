import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');

async function git(root, args) {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function commitAll(root, message) {
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', message]);
}

async function makeCliReleaseFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-release-cli-fixture-'));
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'release-cli-test@example.com']);
  await git(root, ['config', 'user.name', 'Release CLI Test']);

  await writeJson(path.join(root, 'package.json'), {
    name: 'vibe-coding-production',
    version: '0.9.2'
  });
  await writeJson(path.join(root, 'package-lock.json'), {
    name: 'vibe-coding-production',
    version: '0.9.2',
    lockfileVersion: 3,
    packages: { '': { name: 'vibe-coding-production', version: '0.9.2' } }
  });
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [0.9.2] - 2026-09-25\n');
  await commitAll(root, 'previous release');
  const previousCommit = await git(root, ['rev-parse', 'HEAD']);
  await git(root, ['tag', '-a', 'v0.9.2', '-m', 'v0.9.2']);
  const tagObjectSha = await git(root, ['rev-parse', 'refs/tags/v0.9.2']);

  await writeJson(path.join(root, 'package.json'), {
    name: 'vibe-coding-production',
    version: '0.9.3'
  });
  await writeJson(path.join(root, 'package-lock.json'), {
    name: 'vibe-coding-production',
    version: '0.9.3',
    lockfileVersion: 3,
    packages: { '': { name: 'vibe-coding-production', version: '0.9.3' } }
  });
  await writeFile(
    path.join(root, 'CHANGELOG.md'),
    '# Changelog\n\n## [Unreleased]\n\n## [0.9.3] - 2026-10-04\n\n- Candidate.\n\n## [0.9.2] - 2026-09-25\n'
  );
  await mkdir(path.join(root, 'docs', 'releases'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', 'releases', 'v0.9.3.md'),
    '# Fixture v0.9.3\n\nRelease status: Candidate — publication requires HUMAN DECISION.\n'
  );
  await writeJson(path.join(root, '.github', 'release-policy.json'), {
    schemaVersion: 1,
    packageName: 'vibe-coding-production',
    changelog: 'CHANGELOG.md',
    releaseNotesPattern: 'docs/releases/v{version}.md',
    previousRelease: {
      version: '0.9.2',
      tag: 'v0.9.2',
      tagObjectSha,
      commitSha: previousCommit
    },
    binNames: ['vcp', 'vibe-coding-production'],
    requiredPackageFiles: ['package.json']
  });
  await commitAll(root, 'candidate');
  return root;
}

test('release-check preview is exposed through the public CLI as structured evidence', async () => {
  const target = await makeCliReleaseFixture();
  // A blocked release-check still returns structured JSON with a nonzero
  // process exit; do not make a blocked candidate appear successful.
  let stdout='', stderr='', exitCode=0;
  try {
    ({ stdout, stderr } = await execFileAsync(process.execPath, [
      bin,'release-check','0.9.3','--dir',target,'--json'
    ],{cwd:repoRoot}));
  } catch(error) {
    ({ stdout, stderr }=error);
    exitCode=error.code;
  }
  assert.equal(exitCode,1);
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.kind, 'release-candidate');
  assert.equal(report.mode, 'preview');
  assert.equal(report.version, '0.9.3');
  assert.equal(report.success, false);
  assert.equal(report.checks.find(x=>x.id==='adaptive-managed-migration-safety').status,'fail');
  assert.equal(report.releaseApproved, false);
  assert.equal(report.published, false);
  assert.equal(report.checks.find((item) => item.id === 'candidate-tag').status, 'human-decision');
  assert.equal(report.checks.find((item) => item.id === 'npm-publish').status, 'human-decision');
  assert.equal(report.summary.planned, 4);
});

test('release-check human output states that release approval remains a human decision', async () => {
  const target = await makeCliReleaseFixture();
  let stdout='', exitCode=0;
  try {
    ({stdout}=await execFileAsync(process.execPath,[
      bin,'release-check','0.9.3','--dir',target
    ],{cwd:repoRoot}));
  }catch(error){
    stdout=error.stdout;
    exitCode=error.code;
  }
  assert.equal(exitCode,1);
  assert.match(stdout,/D-01\/G-FENCE NO-GO/);

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

test('release-check rejects a non-numeric timeout instead of silently using a default', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      bin,
      'release-check',
      '0.9.3',
      '--dir',
      repoRoot,
      '--timeout-ms',
      'nope'
    ], { cwd: repoRoot }),
    (error) => {
      assert.match(error.stderr, /--timeout-ms must be a non-negative integer/);
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
