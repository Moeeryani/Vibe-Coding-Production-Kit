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

test('closure D5: CLI rejects a forged session claiming gate evidence', async () => {
  const root = await fixture();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    // Commit an L3 change so the re-executed gate blocks deterministically.
    const ciDir = path.join(root, '.github', 'workflows');
    await mkdir(ciDir, { recursive: true });
    await writeFile(path.join(ciDir, 'ci.yml'), 'name: CI\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'l3 change');
    // Forged session lives OUTSIDE the project so it cannot dirty the gate.
    const holder = await mkdtemp(path.join(os.tmpdir(), 'vcp-forged-'));
    const sessionFile = path.join(holder, 'session.json');
    const forged = {
      schemaVersion: 1, runnerVersion: 'workflow-runner/1', sessionId: 'wf-forged',
      targetDir: root, task: 'wf-task', mode: 'auto', phase: 'implement', status: 'PENDING',
      completedSteps: ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence'].map((id) => ({
        id, kind: 'GATE_EVIDENCE', phase: 'implement', status: 'COMPLETED',
        evidence: { forged: true, gateStatus: 'APPROVED', headSha: '0'.repeat(40) }, at: new Date().toISOString(),
      })),
      blockedSteps: [], transcript: [], blockers: [],
      modeHistory: [{ mode: 'auto', at: new Date().toISOString(), reason: 'session-created' }],
      stopRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await writeFile(sessionFile, JSON.stringify(forged), 'utf8');
    const run = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile, '--json']);
    assert.notEqual(run.code, 0, run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_BLOCKED']);
    assert.equal(result.completedSteps.some((s) => s.id === 'gate-evidence'), false);
    assert.ok(result.transcript.some((t) => t.event === 'STEP_CLAIM_REJECTED' && t.stepId === 'gate-evidence'));
    const saved = JSON.parse(await readFile(sessionFile, 'utf8'));
    assert.equal(saved.completedSteps.some((s) => s.id === 'gate-evidence'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closure D4: CLI prints the underlying blocker reason, not only the code', async () => {
  const root = await fixture();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    const ciDir = path.join(root, '.github', 'workflows');
    await mkdir(ciDir, { recursive: true });
    await writeFile(path.join(ciDir, 'ci.yml'), 'name: CI\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'l3 change');
    const run = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'review',
      '--base', base, '--dir', root]);
    assert.notEqual(run.code, 0, run.stdout);
    assert.match(run.stdout, /GATE_PREVIEW_BLOCKED/);
    assert.match(run.stdout, /HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED/);
    assert.match(run.stdout, /Blocker detail:/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Final session integrity (F-D5 / F-D4a): CLI reports only live gate
// outcomes, in both text and JSON modes; a blocked-then-completed
// session shows no obsolete blockers.

// The CLI fixture's minimal task pack fails implement-stage readiness.
// N3 needs a pack that passes readiness so the run reaches the gate.
function fullPack() {
  return `# Task — workflow fixture
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

## Affected boundaries

- Modules/files likely affected: verification runner.
- Public API/contract impact: CLI report only.
- Data/schema/migration impact: n/a.
- External integration impact: n/a.

## Domain invariants

Evidence must never claim a command passed unless it exited successfully.

## Security and privacy

- Authentication impact: n/a.
- Authorization/resource ownership: n/a.
- Tenant isolation: n/a.
- Input/trust boundaries: repository-controlled commands are untrusted until --run.
- Secrets/PII/logging: raw stdout/stderr are not persisted by default.
- Abuse/rate/replay considerations: commands execute sequentially.
- Relevant threat IDs: n/a.

## Failure modes and edge cases

- One command exits non-zero.

## Observability

Record command key, exact command, duration, exit status.

## Test plan

### Unit
- Parse commands and preview.

### Integration / contract
- Execute deterministic local Node commands.

### E2E / regression
- Exercise the public CLI JSON path.

### Negative/security paths
- Prove failure stops later commands.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive CLI command.
- Migration/backfill: n/a.
- Rollback or recovery: remove the command.

## Implementation plan

1. Build a preview from task-defined verification commands.
2. Require explicit --run and implementation readiness.

## Verification commands

- \`UNIT_TEST_COMMAND\`: \`${PASS}\`
`;
}

async function forgedCliSession({ root, holder, headSha }) {
  const sessionFile = path.join(holder, 'session.json');
  const forged = {
    schemaVersion: 1, runnerVersion: 'workflow-runner/1', sessionId: 'wf-forged',
    targetDir: root, task: 'wf-task', mode: 'auto', phase: 'implement', status: 'PENDING',
    completedSteps: ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence'].map((id) => ({
      id, kind: 'GATE_EVIDENCE', phase: 'implement', status: 'COMPLETED',
      evidence: { task: 'wf-task', gateStatus: 'APPROVED', verificationExecuted: true, headSha }, at: '2099-01-01T00:00:00.000Z',
    })),
    blockedSteps: [], transcript: [], blockers: [],
    modeHistory: [{ mode: 'auto', at: new Date().toISOString(), reason: 'session-created' }],
    stopRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  await writeFile(sessionFile, JSON.stringify(forged), 'utf8');
  return sessionFile;
}

test('F-D5 N1: CLI text mode reports a live BLOCKED outcome for a same-HEAD forgery', async () => {
  const root = await fixture();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    const ciDir = path.join(root, '.github', 'workflows');
    await mkdir(ciDir, { recursive: true });
    await writeFile(path.join(ciDir, 'ci.yml'), 'name: CI\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'l3 change');
    const holder = await mkdtemp(path.join(os.tmpdir(), 'vcp-forged-'));
    const sessionFile = await forgedCliSession({ root, holder, headSha: git(root, 'rev-parse', 'HEAD') });
    const run = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile]);
    assert.notEqual(run.code, 0, run.stdout);
    assert.match(run.stdout, /VCP workflow: BLOCKED/);
    assert.match(run.stdout, /GATE_BLOCKED/);
    assert.match(run.stdout, /Blockers: GATE_BLOCKED/);
    assert.doesNotMatch(run.stdout, /Completed steps: [^\n]*gate-evidence/);
    const saved = JSON.parse(await readFile(sessionFile, 'utf8'));
    assert.equal(saved.completedSteps.some((s) => s.id === 'gate-evidence'), false);
    assert.ok(saved.transcript.some((t) => t.event === 'STEP_GATE_REVALIDATED' && t.stepId === 'gate-evidence'));
    await rm(holder, { recursive: true, force: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 N2: CLI JSON mode reports live gate evidence, not the forged values', async () => {
  const root = await fixture();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    await writeFile(path.join(root, 'docs', 'product', 'PRD.md'), '# Product\n\nChanged.\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'l1 change');
    const holder = await mkdtemp(path.join(os.tmpdir(), 'vcp-forged-'));
    const sessionFile = await forgedCliSession({ root, holder, headSha: git(root, 'rev-parse', 'HEAD') });
    const run = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile, '--json']);
    assert.equal(run.code, 0, run.stdout);
    const result = JSON.parse(run.stdout);
    assert.equal(result.status, 'COMPLETED');
    const gate = result.completedSteps.find((s) => s.id === 'gate-evidence');
    assert.equal(gate.evidence.gateStatus, 'EVIDENCE_ONLY_NOT_APPROVED', 'forged APPROVED status must be replaced by the live outcome');
    assert.ok(Date.parse(gate.at) > Date.parse('2026-01-01T00:00:00.000Z'), 'forged 2099 timestamp must be replaced');
    assert.ok(result.transcript.some((t) => t.event === 'STEP_GATE_REVALIDATED' && t.stepId === 'gate-evidence'));
    assert.ok(result.transcript.some((t) => t.event === 'STEP_COMPLETED' && t.stepId === 'gate-evidence'));
    await rm(holder, { recursive: true, force: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D4a N3: CLI shows current blockers only — none after completion, history in JSON transcript', async () => {
  const root = await fixture();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    await writeFile(path.join(root, 'docs', 'tasks', 'wf-task.md'), fullPack(), 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'full task pack');
    await writeFile(path.join(root, 'docs', 'product', 'PRD.md'), '# Product\n\nChanged.\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'l1 change');
    const holder = await mkdtemp(path.join(os.tmpdir(), 'vcp-sess-'));
    const sessionFile = path.join(holder, 'session.json');
    await writeFile(path.join(root, 'uncommitted.txt'), 'dirty\n', 'utf8');
    const handoff = await runCli(['workflow', 'wf-task', '--workflow-mode', 'auto', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile]);
    assert.match(handoff.stdout, /VCP workflow: AWAITING_IMPLEMENTATION/);
    const blocked = await runCli(['workflow', 'wf-task', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile]);
    assert.notEqual(blocked.code, 0, blocked.stdout);
    assert.match(blocked.stdout, /Blocker detail: gate-evidence:.*DIRTY_WORKTREE/);
    await rm(path.join(root, 'uncommitted.txt'), { force: true });
    const completed = await runCli(['workflow', 'wf-task', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile]);
    assert.equal(completed.code, 0, completed.stdout);
    assert.match(completed.stdout, /VCP workflow: COMPLETED/);
    assert.match(completed.stdout, /Blockers: none/);
    assert.doesNotMatch(completed.stdout, /Blocker detail:/);
    const again = await runCli(['workflow', 'wf-task', '--workflow-phase', 'implement',
      '--base', base, '--dir', root, '--session-file', sessionFile, '--json']);
    assert.equal(again.code, 0, again.stdout);
    const result = JSON.parse(again.stdout);
    assert.deepEqual(result.blockers, []);
    assert.deepEqual(result.blockedSteps, []);
    assert.ok(result.transcript.some((t) => t.event === 'STEP_BLOCKED' && t.stepId === 'gate-evidence'),
      'historical blocking event remains available for audit');
    await rm(holder, { recursive: true, force: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 J: CLI refuses a session file for a different task', async () => {
  const root = await fixture();
  try {
    const holder = await mkdtemp(path.join(os.tmpdir(), 'vcp-sess-'));
    const sessionFile = path.join(holder, 'session.json');
    await writeFile(sessionFile, JSON.stringify({
      schemaVersion: 1, runnerVersion: 'workflow-runner/1', sessionId: 'wf-x',
      targetDir: root, task: 'wf-task', mode: 'auto', phase: 'plan', status: 'PENDING',
      completedSteps: [], blockedSteps: [], transcript: [], blockers: [],
      modeHistory: [{ mode: 'auto', at: new Date().toISOString(), reason: 'session-created' }],
      stopRequested: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }), 'utf8');
    const run = await runCli(['workflow', 'other-task', '--workflow-mode', 'auto', '--workflow-phase', 'plan',
      '--dir', root, '--session-file', sessionFile]);
    assert.notEqual(run.code, 0, run.stdout + run.stderr);
    assert.match(run.stdout + run.stderr, /Session file is for task wf-task, not other-task/);
    await rm(holder, { recursive: true, force: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});
