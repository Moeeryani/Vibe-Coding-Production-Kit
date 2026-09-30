import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rename } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const exampleRoot = path.join(repoRoot, 'examples', 'reference-saas-invite');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function copyReferenceFixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'vcp-task-convention-'));
  const target = path.join(parent, 'reference-saas-invite');
  await cp(exampleRoot, target, { recursive: true });
  return target;
}

async function runVcp(args) {
  return execFileAsync(process.execPath, [bin, ...args], { cwd: repoRoot });
}

test('reference example exposes one canonical machine-readable Task Pack', async () => {
  const canonical = path.join(exampleRoot, 'docs', 'tasks', 'accept-invite.md');
  const historical = path.join(exampleRoot, 'docs', 'delivery', 'TASK-001-accept-invite.md');
  assert.equal(await exists(canonical), true);
  assert.equal(await exists(historical), false);

  const task = await readFile(canonical, 'utf8');
  assert.match(task, /^# Task — Accept organization invitation/m);
  assert.match(task, /^Slug: `accept-invite`$/m);
  assert.match(task, /`CHECK_COMMAND`: `npm run check`/);
  assert.match(task, /`UNIT_TEST_COMMAND`: `npm test`/);
});

test('canonical reference Task Pack passes readiness and produces verification plan', async () => {
  const target = await copyReferenceFixture();
  const readyResult = await runVcp(['ready', 'accept-invite', '--dir', target, '--stage', 'implement', '--json']);
  const ready = JSON.parse(readyResult.stdout);
  assert.equal(ready.task, 'docs/tasks/accept-invite.md');
  assert.equal(ready.summary.fail, 0);

  const verifyResult = await runVcp(['verify', 'accept-invite', '--dir', target, '--json']);
  const verification = JSON.parse(verifyResult.stdout);
  assert.equal(verification.task, 'docs/tasks/accept-invite.md');
  assert.deepEqual(verification.commands.map((item) => item.key), ['CHECK_COMMAND', 'UNIT_TEST_COMMAND']);
  assert.deepEqual(verification.commands.map((item) => item.status), ['planned', 'planned']);
});

test('legacy delivery paths are explicit compatibility inputs, not a second slug namespace', async () => {
  const target = await copyReferenceFixture();
  const canonical = path.join(target, 'docs', 'tasks', 'accept-invite.md');
  const legacyDir = path.join(target, 'docs', 'delivery');
  const legacy = path.join(legacyDir, 'TASK-001-accept-invite.md');
  await mkdir(legacyDir, { recursive: true });
  await rename(canonical, legacy);

  await assert.rejects(
    runVcp(['ready', 'accept-invite', '--dir', target, '--stage', 'plan', '--json']),
    (error) => {
      const report = JSON.parse(error.stdout);
      assert.equal(report.task, 'docs/tasks/accept-invite.md');
      assert.equal(report.summary.fail, 1);
      assert.match(report.checks[0].detail, /Task file not found/);
      return true;
    }
  );

  const explicit = await runVcp(['ready', 'docs/delivery/TASK-001-accept-invite.md', '--dir', target, '--stage', 'implement', '--json']);
  const explicitReport = JSON.parse(explicit.stdout);
  assert.equal(explicitReport.task, 'docs/delivery/TASK-001-accept-invite.md');
  assert.equal(explicitReport.summary.fail, 0);
});

test('shipped delivery TASK-TEMPLATE is a compatibility pointer, not a competing template', async () => {
  const legacyTemplate = await readFile(path.join(repoRoot, 'docs', 'delivery', 'TASK-TEMPLATE.md'), 'utf8');
  assert.match(legacyTemplate, /not.*canonical Task Pack template/i);
  assert.match(legacyTemplate, /docs\/tasks\/<slug>\.md/);
  assert.match(legacyTemplate, /not silently deleted, migrated, or auto-discovered/i);
});
