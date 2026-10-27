// D-PC-03 CLI: `vcp workflow` executes real transitions. Auto runs without
// prompts; Manual with a declined answer executes nothing; a session file
// resumes completed work instead of repeating it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

const BIN = path.resolve('bin/vibe-coding-production.mjs');
process.env.GIT_AUTHOR_NAME = 'Fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@example.invalid';
process.env.GIT_COMMITTER_NAME = 'Fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';
const GIT_ENV = { ...process.env };
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim();
}
const PASS = 'node -e "process.exit(0)"';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-wfcli-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsText = await readFile(agentsPath, 'utf8');
  await writeFile(agentsPath, agentsText.replace('UNIT_TEST_COMMAND=<define>', `UNIT_TEST_COMMAND=${PASS}`), 'utf8');
  const taskDir = path.join(root, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'wf-task.md'), `# Task — CLI fixture
Status: Review

## Outcome

Ship one verified change.

## Source of truth

| Source | Reference |
|---|---|
| Product / PRD | \`docs/product/PRD.md\` |

## Acceptance criteria

- [ ] AC-001 — Commands produce recorded evidence.

## Scope

### In scope
- Verification command execution.

### Out of scope
- Deployment.
`, 'utf8');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  return root;
}

function runCli(args, { answers = null, cwd = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    let promptsSeen = 0;
    let answered = 0;
    child.stdout.on('data', (d) => {
      stdout += d;
      if (answers === null) return;
      const prompts = (stdout.match(/Authorize which step\?|Approve this step\?/g) || []).length;
      while (promptsSeen < prompts && answered < answers.length) {
        promptsSeen += 1;
        child.stdin.write(answers[answered] + '\n');
        answered += 1;
      }
      if (answered >= answers.length && promptsSeen >= prompts) {
        // Keep stdin open until the process asks again or exits; end it
        // once every queued answer is consumed and no prompt is pending.
      }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (answers === null) child.stdin.end();
    // If answers run out, stdin stays open until the child exits on its own
    // (a declined/stopped run ends by itself); guard against a hang.
    setTimeout(() => { try { child.stdin.end(); } catch { /* already closed */ } }, 10000).unref();
  });
}

test('help lists the workflow command and all three modes', async () => {
  const { code, stdout } = await runCli(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /vcp workflow /);
  assert.match(stdout, /manual\|assisted\|auto/);
});

test('CLI auto runs the plan phase without prompts', async () => {
  const root = await fixture();
  try {
    const { code, stdout } = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'plan', '--dir', root, '--json']);
    assert.equal(code, 0, stdout);
    const session = JSON.parse(stdout);
    assert.equal(session.status, 'COMPLETED');
    assert.deepEqual(session.completedSteps.map((s) => s.id), ['readiness-plan', 'context-plan']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI manual with an empty answer stops without executing anything', async () => {
  const root = await fixture();
  try {
    const { code, stdout } = await runCli(['workflow', 'wf-task', '--workflow-mode', 'manual', '--workflow-phase', 'plan', '--dir', root], { answers: [''] });
    assert.equal(code, 1);
    assert.match(stdout, /STOPPED/);
    assert.match(stdout, /Completed steps: none/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI manual choosing a later step waits for confirmation without executing', async () => {
  const root = await fixture();
  try {
    const { code, stdout } = await runCli(['workflow', 'wf-task', '--workflow-mode', 'manual', '--workflow-phase', 'plan', '--dir', root], { answers: ['context-plan'] });
    assert.equal(code, 1);
    assert.match(stdout, /AWAITING_CONFIRMATION/);
    assert.match(stdout, /Completed steps: none/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI manual with approved answers executes the plan phase', async () => {
  const root = await fixture();
  try {
    const { code, stdout } = await runCli(['workflow', 'wf-task', '--workflow-mode', 'manual', '--workflow-phase', 'plan', '--dir', root], { answers: ['readiness-plan', 'context-plan'] });
    assert.equal(code, 0, stdout);
    assert.match(stdout, /COMPLETED/);
    assert.match(stdout, /readiness-plan/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI session file resumes completed work instead of repeating it', async () => {
  const root = await fixture();
  try {
    const sessionFile = path.join(root, 'session.json');
    const first = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'plan', '--dir', root, '--session-file', sessionFile, '--json']);
    assert.equal(first.code, 0, first.stdout);
    const saved = JSON.parse(await readFile(sessionFile, 'utf8'));
    assert.equal(saved.mode, 'auto');
    assert.equal(saved.completedSteps.length, 2);

    const second = await runCli(['workflow', 'wf-task', '--workflow-phase', 'plan', '--dir', root, '--session-file', sessionFile, '--json']);
    assert.equal(second.code, 0, second.stdout);
    const resumed = JSON.parse(second.stdout);
    assert.equal(resumed.completedSteps.length, 2, 'completed steps are not re-executed');
    assert.ok(resumed.transcript.length > saved.transcript.length, 'resume is recorded');
  } finally { await rm(root, { recursive: true, force: true }); }
});
