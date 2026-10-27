// Phase 8 CLI: vcp ci-gate-plan is read-only and produces contracts + snippets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const BIN = path.resolve('bin/vibe-coding-production.mjs');
const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
async function run(args, env = {}) {
  return execFileAsync(process.execPath, [BIN, ...args], { env: { ...process.env, ...env } });
}

test('gitlab explicit task produces a GATE_RUN contract with a snippet', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-plan-'));
  try {
    const { stdout } = await run(['ci-gate-plan', dir, '--provider', 'gitlab', '--task', 'fix-login', '--base-sha', BASE, '--head-sha', HEAD, '--json']);
    const report = JSON.parse(stdout);
    assert.equal(report.mode, 'GATE_RUN');
    assert.equal(report.jobName, 'vcp-gate');
    assert.equal(report.selection.task, 'fix-login');
    assert.ok(report.snippet.text.includes('vcp-gate'));
    assert.equal(report.enforcement.providerEnforced, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('no task and no SHAs produce a BLOCKED contract, not a command', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-plan-'));
  try {
    const { stdout } = await run(['ci-gate-plan', dir, '--provider', 'gitlab', '--json']);
    const report = JSON.parse(stdout);
    assert.equal(report.mode, 'BLOCKED');
    assert.ok(report.blockers.includes('MISSING_BASE_HEAD'));
    assert.equal(report.command, null);
    assert.equal(report.snippet, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('multiple --task flags block deterministically', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-plan-'));
  try {
    const { stdout } = await run(['ci-gate-plan', dir, '--provider', 'gitlab', '--task', 'a-task', '--task', 'b-task', '--base-sha', BASE, '--head-sha', HEAD, '--json']);
    const report = JSON.parse(stdout);
    assert.equal(report.mode, 'BLOCKED');
    assert.ok(report.blockers.includes('MULTIPLE_TASK_SELECTORS'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('github trailer file resolves the selector; VCP_TASK env works for gitlab', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-plan-'));
  try {
    const bodyFile = path.join(dir, 'pr-body.txt');
    await writeFile(bodyFile, 'Fix login.\n\nVCP-Task: fix-login\n');
    const gh = JSON.parse((await run(['ci-gate-plan', dir, '--provider', 'github', '--pr-body-file', bodyFile, '--base-sha', BASE, '--head-sha', HEAD, '--json'])).stdout);
    assert.equal(gh.mode, 'GATE_RUN');
    assert.equal(gh.selection.task, 'fix-login');
    const gl = JSON.parse((await run(['ci-gate-plan', dir, '--provider', 'gitlab', '--base-sha', BASE, '--head-sha', HEAD, '--json'], { VCP_TASK: 'env-task' })).stdout);
    assert.equal(gl.selection.task, 'env-task');
    await assert.rejects(run(['ci-gate-plan', dir, '--provider', 'github', '--base-sha', BASE, '--head-sha', HEAD, '--json']), /requires --task or --pr-body-file/);
    await assert.rejects(run(['ci-gate-plan', dir, '--provider', 'github', '--pr-body-file', path.join(dir, 'missing.txt'), '--json']), /Cannot read PR body file/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('detected project CI is reported; provider mismatch is flagged, not hidden', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-plan-'));
  try {
    await writeFile(path.join(dir, '.gitlab-ci.yml'), 'stages: [test]\n');
    const match = JSON.parse((await run(['ci-gate-plan', dir, '--provider', 'gitlab', '--task', 'fix-login', '--base-sha', BASE, '--head-sha', HEAD, '--json'])).stdout);
    assert.equal(match.detectedCI.providerStatus, 'detected');
    assert.equal(match.providerMismatch, null);
    const mismatch = JSON.parse((await run(['ci-gate-plan', dir, '--provider', 'circleci', '--task', 'fix-login', '--base-sha', BASE, '--head-sha', HEAD, '--json'])).stdout);
    assert.match(mismatch.providerMismatch, /differs from detected project CI/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ci-gate-plan rejects mutation flags and unknown providers', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-plan-'));
  try {
    await assert.rejects(run(['ci-gate-plan', dir, '--provider', 'gitlab', '--force', '--json']), /read-only/);
    await assert.rejects(run(['ci-gate-plan', dir, '--provider', 'bitbucket', '--json']), /E_CI_PROVIDER/);
    await assert.rejects(run(['ci-gate-plan', dir, '--json']), /requires --provider/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
