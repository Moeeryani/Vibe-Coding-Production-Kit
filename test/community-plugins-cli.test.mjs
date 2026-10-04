import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const example = path.join(repoRoot, 'examples', 'community-profile-react-native');

test('CLI help advertises plugin inspection and digest authoring', async () => {
  const { stdout } = await execFileAsync(process.execPath, [bin, '--help'], { cwd: repoRoot });
  assert.match(stdout, /vcp plugins \[--dir <directory>\] \[--digest <bundle>\] \[--json\]/);
  assert.match(stdout, /--digest <path>\s+Plugins: compute canonical SHA-256/);
  assert.match(stdout, /vibe-coding-production plugins --dir \. --json/);
});

test('plugins CLI inspects the pinned reference fixture as JSON without applying proposals', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    bin,
    'plugins',
    '--dir',
    example,
    '--json'
  ], { cwd: repoRoot });

  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.success, true);
  assert.equal(report.plugins.length, 1);
  assert.equal(report.plugins[0].id, 'community.react-native-readiness');
  assert.equal(report.plugins[0].digest, 'sha256:718bd7da8f7a124e946b359cc9f57140d292f708154c215cbc7af36285985a0e');
  assert.equal(report.plugins[0].verificationProposals[0].status, 'proposal-not-applied');
  assert.equal(report.trust.proposalsApplied, false);
});

test('plugins CLI human report preserves the HUMAN DECISION boundary', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    bin,
    'plugins',
    '--dir',
    example
  ], { cwd: repoRoot });

  assert.match(stdout, /community\.react-native-readiness@1\.0\.0/);
  assert.match(stdout, /PROPOSAL E2E_COMMAND=npm run test:e2e — not applied by VCP/);
  assert.match(stdout, /remain HUMAN DECISION actions/);
});

test('plugins --digest reproduces the canonical fixture pin without selecting or mutating trust', async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    bin,
    'plugins',
    '--dir',
    example,
    '--digest',
    'community-plugins\\react-native-readiness',
    '--json'
  ], { cwd: repoRoot });

  const report = JSON.parse(stdout);
  assert.equal(report.bundle, 'community-plugins/react-native-readiness');
  assert.equal(report.digest, 'sha256:718bd7da8f7a124e946b359cc9f57140d292f708154c215cbc7af36285985a0e');
  assert.deepEqual(report.files, [
    'guidance/mobile-boundaries.md',
    'plugin.json'
  ]);
});

test('plugins rejects positional project roots and keeps --digest scoped to the plugins command', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [bin, 'plugins', example], { cwd: repoRoot }),
    (error) => {
      assert.match(error.stderr, /Plugins project root must be supplied with --dir/);
      return true;
    }
  );

  await assert.rejects(
    execFileAsync(process.execPath, [bin, 'doctor', '.', '--digest', 'community-plugins/example'], { cwd: repoRoot }),
    (error) => {
      assert.match(error.stderr, /--digest is only supported by the plugins command/);
      return true;
    }
  );
});
