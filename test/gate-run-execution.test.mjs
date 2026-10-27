// Phase 7 gate EXECUTION contract, proven live against disposable Git fixtures.
// Unlike the earlier stub-harness tests, these fixtures run the real
// runMechanicalGate -> runTaskReadiness -> runVerification path, with real
// Task Packs, real AGENTS.md command authority, and real Git base/head refs.
// Every fixture is created in a temp dir and deleted afterwards; no command
// here touches the VCP checkout itself. Verification commands are bounded
// local `node -e` one-liners only (exit, marker write, task append, git commit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { runMechanicalGate, mechanicalGateExitCode } from '../lib/gate-run.mjs';
import { classifyChangeSet, previewGateDecision, parseTaskLifecycle } from '../lib/gate-contract.mjs';

// Verification commands spawned by the gate inherit this process env, so the
// commit-during-execution fixture needs Git identity here, not in the fixture.
process.env.GIT_AUTHOR_NAME = 'Fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@example.invalid';
process.env.GIT_COMMITTER_NAME = 'Fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';

const GIT_ENV = { ...process.env };
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim();
}
async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

const PASS = 'node -e "process.exit(0)"';
const FAIL = 'node -e "process.exit(2)"';
const MARKER = `node -e "require('node:fs').writeFileSync('gate-marker','ran')"`;
const TASK_APPEND = `node -e "require('node:fs').appendFileSync('docs/tasks/gate-task.md','\\n<!-- gate probe -->\\n')"`;
const COMMIT_DURING = `node -e "require('node:fs').writeFileSync('during.txt','x')" && git add during.txt && git commit -qm during`;

function taskPack(command) {
  return `# Task — Gate fixture
Status: Review

## Outcome

Ship one verified change.

## Source of truth

| Source | Reference |
|---|---|
| Product / PRD | \`docs/product/PRD.md\` |
| Security | \`docs/security/THREAT-MODEL.md\` |

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
3. Record deterministic pass/fail evidence.

## Verification commands

- \`UNIT_TEST_COMMAND\`: \`${command}\`
`;
}

// change: [{file, content}] written on top of the base commit and committed.
// agentsCommand/taskCommand default to PASS; set taskCommand without changing
// agentsCommand to build the unauthorized-command fixture.
async function makeFixture({ change, agentsCommand = PASS, taskCommand = agentsCommand } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-gate-exec-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsText = await readFile(agentsPath, 'utf8');
  await writeFile(agentsPath, agentsText.replace('UNIT_TEST_COMMAND=<define>', `UNIT_TEST_COMMAND=${agentsCommand}`), 'utf8');
  const taskDir = path.join(root, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'gate-task.md'), taskPack(taskCommand), 'utf8');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  for (const { file, content } of change) {
    const dest = path.join(root, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf8');
  }
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'change');
  return { root, base };
}

const L2_CHANGE = [{ file: 'src/index.js', content: 'export default 1;\n' }];

test('clean L0 execution collects evidence but never authorizes anything', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'README.md', content: 'Changed\n' }] });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: null, baseRef: base, run: true });
    assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
    assert.equal(mechanicalGateExitCode(report), 2);
    assert.equal(report.verificationExecuted, false);
    assert.equal(report.evidence.status, 'VERIFICATION_EVIDENCED_NOT_APPROVED');
    assert.equal(report.preflight.changes.requiredLevel, 'L0');
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.mergeAuthorized, false);
    assert.equal(report.ciEnforced, false);
    assert.equal(report.productionWriterAuthorized, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('clean L2 execution runs real verification and stays unapproved', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
    assert.equal(mechanicalGateExitCode(report), 2);
    assert.equal(report.verificationExecuted, true);
    assert.equal(report.verificationSucceeded, true);
    assert.deepEqual(report.verificationSummary, { pass: 1, fail: 0, skipped: 0, planned: 0 });
    assert.equal(report.readinessSummary.fail, 0);
    assert.equal(report.evidence.status, 'VERIFICATION_EVIDENCED_NOT_APPROVED');
    assert.equal(report.evidence.commandsPassed, 1);
    assert.equal(report.evidence.independentReviewAccepted, false);
    assert.equal(report.executionAuthorized, false);
    assert.equal(report.mergeAuthorized, false);
    assert.equal(report.ciEnforced, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L1 scoped execution is readiness-gated and runs no verification command', async () => {
  const { root, base } = await makeFixture({
    change: [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }],
    agentsCommand: MARKER,
  });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.preflight.changes.requiredLevel, 'L1');
    assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
    assert.equal(report.verificationExecuted, false);
    assert.equal(report.readinessSummary.fail, 0);
    // The marker command was never executed: L1 requires no verification.
    assert.equal(await exists(path.join(root, 'gate-marker')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L3 change is refused before any verification executes', async () => {
  const { root, base } = await makeFixture({
    change: [{ file: '.github/workflows/ci.yml', content: 'name: CI\n' }],
    agentsCommand: MARKER,
  });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.equal(mechanicalGateExitCode(report), 1);
    assert.ok(report.blockingReasons.includes('INDEPENDENT_L3_REVIEW_REQUIRED'));
    assert.equal(report.verificationExecuted, false);
    assert.equal(await exists(path.join(root, 'gate-marker')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dirty worktree before execution blocks and never runs verification', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE, agentsCommand: MARKER });
  try {
    await writeFile(path.join(root, 'untracked.txt'), 'not committed');
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('DIRTY_WORKTREE'));
    assert.equal(report.verificationExecuted, false);
    assert.equal(await exists(path.join(root, 'gate-marker')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dirty worktree after verification blocks despite a passing command', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE, agentsCommand: MARKER });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(await exists(path.join(root, 'gate-marker')), true);
    assert.equal(report.verificationSucceeded, true);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('DIRTY_AFTER_VERIFICATION'));
    assert.ok(report.evidence.blockingReasons.includes('DIRTY_WORKTREE'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('task changed during verification blocks the gate', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE, agentsCommand: TASK_APPEND });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('TASK_CHANGED'));
    assert.ok(report.evidence.blockingReasons.includes('TASK_CHANGED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HEAD changed during verification is stale evidence and blocks', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE, agentsCommand: COMMIT_DURING });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.verificationSucceeded, true);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('GIT_HEAD_CHANGED'));
    assert.ok(report.evidence.blockingReasons.includes('GIT_HEAD_OR_BASE_CHANGED'));
    assert.notEqual(report.postflight.headSha, report.preflight.headSha);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('failed verification command blocks and is never re-labeled success', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE, agentsCommand: FAIL });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.verificationExecuted, true);
    assert.equal(report.verificationSucceeded, false);
    assert.equal(report.verificationSummary.fail, 1);
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('VERIFICATION_FAILED'));
    assert.ok(report.evidence.blockingReasons.includes('VERIFICATION_NOT_PROVEN'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unauthorized command is refused by readiness before any execution', async () => {
  const { root, base } = await makeFixture({
    change: L2_CHANGE, agentsCommand: PASS, taskCommand: MARKER,
  });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('READINESS_UNSATISFIED'));
    assert.equal(report.verificationExecuted, false);
    // The task's unauthorized marker command never ran.
    assert.equal(await exists(path.join(root, 'gate-marker')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing Git base or head refs reject instead of producing a gate result', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE });
  try {
    await assert.rejects(
      runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: 'does-not-exist', run: true }),
      /Review base could not be resolved/);
    await assert.rejects(
      runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, headRef: 'does-not-exist', run: true }),
      /Review head could not be resolved/);
    await assert.rejects(
      runMechanicalGate({ targetDir: root, task: 'gate-task', run: true }),
      { code: 'E_GATE_BASE_REQUIRED' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('draft task is refused at preview; minimum level is a floor, not a downgrade', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE });
  try {
    const taskPath = path.join(root, 'docs', 'tasks', 'gate-task.md');
    const content = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, content.replace('Status: Review', 'Status: Draft'), 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'draft task');
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('PREFLIGHT_BLOCKED'));
    assert.ok(report.preflight.decision.reasons.includes('TASK_DRAFT'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('requested level below the classified level is a downgrade refusal (unit)', () => {
  const changes = classifyChangeSet([{ status: 'M', path: 'src/index.js', from: null }]);
  assert.equal(changes.requiredLevel, 'L2');
  const decision = previewGateDecision({
    task: parseTaskLifecycle('Status: Review\n'), changes, requestedLevel: 'L0',
  });
  assert.equal(decision.status, 'BLOCKED');
  assert.ok(decision.reasons.includes('LEVEL_DOWNGRADE_REFUSED'));
});

test('minimum level raises the classification floor to L3 and blocks', async () => {
  const { root, base } = await makeFixture({ change: L2_CHANGE });
  try {
    const report = await runMechanicalGate({
      targetDir: root, task: 'gate-task', baseRef: base, minimumLevel: 'L3', run: true,
    });
    assert.equal(report.preflight.changes.requiredLevel, 'L3');
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('INDEPENDENT_L3_REVIEW_REQUIRED'));
    assert.equal(report.verificationExecuted, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
