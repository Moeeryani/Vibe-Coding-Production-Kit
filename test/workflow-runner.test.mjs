// D-PC-03: Manual / Assisted / Auto are observably different execution
// modes, not labels. Manual requires an explicit per-step choice, Assisted
// recommends exactly one step and requests confirmation, Auto advances
// without confirmation and stops on failed checks, stale/changed state,
// L3 review, or missing approvals. Proven live against disposable fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import {
  FORBIDDEN_AUTO_STEP_KINDS, createWorkflowSession, deserializeWorkflowSession,
  listWorkflowSteps, requestWorkflowStop, runWorkflowSession,
  serializeWorkflowSession, switchWorkflowMode, WORKFLOW_PHASES,
} from '../lib/workflow-runner.mjs';

process.env.GIT_AUTHOR_NAME = 'Fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@example.invalid';
process.env.GIT_COMMITTER_NAME = 'Fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';
const GIT_ENV = { ...process.env };
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim();
}
const PASS = 'node -e "process.exit(0)"';

function pack({ implementationPlan = true } = {}) {
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

${implementationPlan ? '1. Build a preview from task-defined verification commands.\n2. Require explicit --run and implementation readiness.' : ''}

## Verification commands

- \`UNIT_TEST_COMMAND\`: \`${PASS}\`
`;
}

async function fixture({ change, implementationPlan = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-wf-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsText = await readFile(agentsPath, 'utf8');
  await writeFile(agentsPath, agentsText.replace('UNIT_TEST_COMMAND=<define>', `UNIT_TEST_COMMAND=${PASS}`), 'utf8');
  const taskDir = path.join(root, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'wf-task.md'), pack({ implementationPlan }), 'utf8');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  for (const { file, content } of change ?? []) {
    const dest = path.join(root, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf8');
  }
  if (change?.length) {
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'change');
  }
  return { root, base };
}
const L1_CHANGE = [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }];
const L3_CHANGE = [{ file: '.github/workflows/ci.yml', content: 'name: CI\n' }];

test('no built step uses a forbidden Auto kind', () => {
  for (const phase of WORKFLOW_PHASES) {
    for (const step of listWorkflowSteps(phase)) {
      assert.ok(!FORBIDDEN_AUTO_STEP_KINDS.has(step.kind), step.id);
    }
  }
});

test('manual: caller sees all steps, picks the next one, each step needs approval', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'manual' });
    const seen = [];
    const decide = async ({ mode, availableSteps, nextStep }) => {
      seen.push({ mode, count: availableSteps.length, next: nextStep.id });
      return { stepId: nextStep.id, approved: true };
    };
    const result = await runWorkflowSession(session, { phases: ['plan'], decide });
    assert.equal(result.status, 'COMPLETED');
    assert.deepEqual(result.completedSteps.map((s) => s.id), ['readiness-plan', 'context-plan']);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].mode, 'manual');
    assert.equal(seen[0].count, 2, 'manual sees every available step');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('manual: no decision callback means nothing executes', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'manual' });
    const result = await runWorkflowSession(session, { phases: ['plan'] });
    assert.equal(result.status, 'AWAITING_CONFIRMATION');
    assert.deepEqual(result.completedSteps, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('manual: choosing a later step or declining stops without executing', async () => {
  const { root } = await fixture();
  try {
    const later = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'manual' });
    const laterResult = await runWorkflowSession(later, {
      phases: ['plan'],
      decide: async ({ nextStep, availableSteps }) => ({ stepId: availableSteps[1].id, approved: true, _next: nextStep }),
    });
    assert.equal(laterResult.status, 'AWAITING_CONFIRMATION');
    assert.deepEqual(laterResult.completedSteps, []);

    const declined = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'manual' });
    const declinedResult = await runWorkflowSession(declined, {
      phases: ['plan'],
      decide: async ({ nextStep }) => ({ stepId: nextStep.id, approved: false }),
    });
    assert.equal(declinedResult.status, 'AWAITING_CONFIRMATION');
    assert.deepEqual(declinedResult.completedSteps, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('assisted: exactly one recommendation with an explanation, confirmation required', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'assisted' });
    const seen = [];
    const result = await runWorkflowSession(session, {
      phases: ['plan'],
      decide: async ({ mode, recommendation, explanation }) => {
        seen.push({ mode, recommendation: recommendation.id, explanation });
        return { approved: true };
      },
    });
    assert.equal(result.status, 'COMPLETED');
    assert.deepEqual(result.completedSteps.map((s) => s.id), ['readiness-plan', 'context-plan']);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].mode, 'assisted');
    assert.equal(seen[0].recommendation, 'readiness-plan');
    assert.match(seen[0].explanation, /Plan-stage readiness/);
    assert.match(seen[0].explanation, /Evidence so far/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('assisted: declining the recommendation stops without executing further', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'assisted' });
    let calls = 0;
    const result = await runWorkflowSession(session, {
      phases: ['plan'],
      decide: async () => { calls += 1; return { approved: calls > 1 }; },
    });
    assert.equal(result.status, 'AWAITING_CONFIRMATION');
    assert.deepEqual(result.completedSteps, []);
    assert.equal(calls, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('auto: advances with no decision callback and never asks', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    let calls = 0;
    const result = await runWorkflowSession(session, {
      phases: ['plan'],
      decide: async () => { calls += 1; return { approved: true }; },
    });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(calls, 0, 'auto must not consult decide for ordinary steps');
    assert.deepEqual(result.completedSteps.map((s) => s.id), ['readiness-plan', 'context-plan']);
    assert.ok(result.transcript.some((t) => t.event === 'STEP_COMPLETED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('auto: failed implement readiness blocks before any gate work', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE, implementationPlan: false });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    const result = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['READINESS_FAILURES']);
    assert.deepEqual(result.completedSteps, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('auto: handoff then resume collects gate evidence for an L1 change', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    const first = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(first.status, 'AWAITING_IMPLEMENTATION');
    assert.deepEqual(first.completedSteps.map((s) => s.id), ['readiness-implement', 'context-implement', 'implementation-handoff']);

    const resumed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'COMPLETED');
    assert.deepEqual(resumed.completedSteps.map((s) => s.id),
      ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence']);
    const gate = resumed.completedSteps.find((s) => s.id === 'gate-evidence');
    assert.equal(gate.evidence.gateStatus, 'EVIDENCE_ONLY_NOT_APPROVED');
    assert.equal(gate.evidence.verificationExecuted, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('auto: dirty worktree after handoff stops the resumed run', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    await writeFile(path.join(root, 'uncommitted.txt'), 'dirty\n', 'utf8');
    const resumed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'BLOCKED');
    assert.deepEqual(resumed.blockers, ['GATE_BLOCKED']);
    const gate = resumed.transcript.find((t) => t.stepId === 'gate-evidence');
    assert.ok(gate, 'gate step was attempted and blocked');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('auto: L3 change blocks at gate evidence and never verifies', async () => {
  const { root, base } = await fixture({ change: L3_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    const resumed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'BLOCKED');
    assert.deepEqual(resumed.blockers, ['GATE_BLOCKED']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('auto review phase: gate preview passes, evidence step skips without supplied evidence', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    const result = await runWorkflowSession(session, { phases: ['review'], baseRef: base });
    assert.equal(result.status, 'COMPLETED');
    assert.deepEqual(result.completedSteps.map((s) => s.id), ['context-review', 'gate-preview']);
    assert.ok(result.transcript.some((t) => t.stepId === 'review-evidence' && t.event === 'STEP_SKIPPED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('review phase without a base ref blocks at the gate preview', async () => {
  const { root } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    const result = await runWorkflowSession(session, { phases: ['review'] });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_BASE_REQUIRED']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('release phase requires a version; without a release policy the check cannot run', async () => {
  const { root } = await fixture();
  try {
    const noVersion = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'release' });
    const blocked = await runWorkflowSession(noVersion, { phases: ['release'] });
    assert.equal(blocked.status, 'BLOCKED');
    assert.deepEqual(blocked.blockers, ['RELEASE_VERSION_REQUIRED']);

    const withVersion = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'release' });
    const checked = await runWorkflowSession(withVersion, { phases: ['release'], releaseVersion: '0.9.4' });
    assert.equal(checked.status, 'BLOCKED');
    // The fixture has no release policy, so release-check itself refuses to
    // evaluate (fail-closed at the release-check contract). The runner
    // reports that honestly instead of inventing a checks-failed verdict.
    assert.deepEqual(checked.blockers, ['STEP_EXECUTION_FAILED']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing task file blocks plan readiness (unclear intent stops the run)', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'no-such-task', mode: 'auto' });
    const result = await runWorkflowSession(session, { phases: ['plan'] });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['READINESS_FAILURES']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mode switching is recorded; invalid modes and tampered sessions refuse', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'manual' });
    switchWorkflowMode(session, 'auto', { reason: 'owner chose auto' });
    assert.equal(session.mode, 'auto');
    assert.equal(session.modeHistory.length, 2);
    assert.throws(() => switchWorkflowMode(session, 'turbo'), /E_WORKFLOW_MODE/);
    assert.throws(() => createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'turbo' }), /E_WORKFLOW_MODE/);

    const text = serializeWorkflowSession(session);
    const restored = deserializeWorkflowSession(text);
    assert.equal(restored.mode, 'auto');
    assert.equal(restored.task, 'wf-task');
    assert.throws(() => deserializeWorkflowSession('{"schemaVersion":99}'), /E_WORKFLOW_SESSION/);
    assert.throws(() => deserializeWorkflowSession(JSON.stringify({ ...JSON.parse(text), mode: 'turbo' })), /E_WORKFLOW_SESSION/);
    const badStep = JSON.parse(text);
    badStep.completedSteps = [{ id: 'merge-the-world', kind: 'MERGE' }];
    assert.throws(() => deserializeWorkflowSession(JSON.stringify(badStep)), /E_WORKFLOW_SESSION/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('explicit stop ends the run before the next step', async () => {
  const { root } = await fixture();
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    requestWorkflowStop(session);
    const result = await runWorkflowSession(session, { phases: ['plan'] });
    assert.equal(result.status, 'STOPPED');
    assert.deepEqual(result.completedSteps, []);

    const mid = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    let steps = 0;
    const midResult = await runWorkflowSession(mid, {
      phases: ['plan'],
      shouldStop: () => steps > 0,
      onProgress: () => { steps += 1; },
    });
    assert.equal(midResult.status, 'STOPPED');
    assert.equal(midResult.completedSteps.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('session round-trip preserves completed work across runs', async () => {
  const { root } = await fixture();
  try {
    const first = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(first, { phases: ['plan'] });
    const restored = deserializeWorkflowSession(serializeWorkflowSession(first));
    const second = await runWorkflowSession(restored, { phases: ['plan'] });
    assert.equal(second.status, 'COMPLETED');
    assert.deepEqual(second.completedSteps.map((s) => s.id), ['readiness-plan', 'context-plan']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
