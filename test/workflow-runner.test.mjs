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

// Closure D4: blocked steps retain their underlying evidence in the
// saved session and explain themselves in the transcript.
test('closure D4: dirty-worktree block preserves gate reasons in the session', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    await writeFile(path.join(root, 'uncommitted.txt'), 'dirty\n', 'utf8');
    const resumed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'BLOCKED');
    assert.equal(resumed.blockedSteps.length, 1);
    assert.equal(resumed.blockedSteps[0].id, 'gate-evidence');
    assert.ok(resumed.blockedSteps[0].evidence.blockingReasons.includes('DIRTY_WORKTREE'),
      `expected DIRTY_WORKTREE in ${JSON.stringify(resumed.blockedSteps[0].evidence)}`);
    assert.match(resumed.blockedSteps[0].detail, /DIRTY_WORKTREE/);
    const blockedEvent = resumed.transcript.find((t) => t.event === 'STEP_BLOCKED' && t.stepId === 'gate-evidence');
    assert.match(blockedEvent.detail, /DIRTY_WORKTREE/);
    const restored = deserializeWorkflowSession(serializeWorkflowSession(resumed));
    assert.equal(restored.blockedSteps.length, 1);
    assert.ok(restored.blockedSteps[0].evidence.blockingReasons.includes('DIRTY_WORKTREE'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closure D4: L3 preview block preserves review reasons in the session', async () => {
  const { root, base } = await fixture({ change: L3_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    const result = await runWorkflowSession(session, { phases: ['review'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_PREVIEW_BLOCKED']);
    assert.equal(result.blockedSteps.length, 1);
    assert.ok(result.blockedSteps[0].evidence.reasons.includes('HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED'));
    assert.match(result.blockedSteps[0].detail, /HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closure D4: failed readiness preserves the failed check ids', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE, implementationPlan: false });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    const result = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.blockedSteps.length, 1);
    assert.ok(Array.isArray(result.blockedSteps[0].evidence.failed) && result.blockedSteps[0].evidence.failed.length > 0);
    assert.match(result.blockedSteps[0].detail, /failed checks:/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closure D4: missing base ref blocks with a self-explaining detail', async () => {
  const { root } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    const result = await runWorkflowSession(session, { phases: ['review'] });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.blockedSteps.length, 1);
    assert.match(result.blockedSteps[0].detail, /GATE_BASE_REQUIRED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Closure D5: gate-evidence claims are revalidated on resume.
test('closure D5: stale gate-evidence claim re-executes after the HEAD moves', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    const resumed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'COMPLETED');
    const firstHead = resumed.completedSteps.find((s) => s.id === 'gate-evidence').evidence.headSha;
    assert.match(firstHead, /^[0-9a-f]{40}$/);

    await writeFile(path.join(root, 'README.md'), '# Later change\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'later change');
    const newHead = git(root, 'rev-parse', 'HEAD');
    const again = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(again.status, 'COMPLETED');
    const rejection = again.transcript.find((t) => t.event === 'STEP_CLAIM_REJECTED' && t.stepId === 'gate-evidence');
    assert.ok(rejection, 'stale claim must be rejected in the transcript');
    assert.match(rejection.detail, /STALE_HEAD/);
    assert.equal(again.completedSteps.find((s) => s.id === 'gate-evidence').evidence.headSha, newHead);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closure D5: forged gate-evidence claim never completes without execution', async () => {
  const { root, base } = await fixture({ change: L3_CHANGE });
  try {
    const forged = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    for (const id of ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence', 'context-review', 'gate-preview']) {
      forged.completedSteps.push({
        id, kind: 'GATE_EVIDENCE', phase: 'implement', status: 'COMPLETED',
        evidence: { forged: true, gateStatus: 'APPROVED', headSha: '0'.repeat(40) }, at: new Date().toISOString(),
      });
    }
    const session = deserializeWorkflowSession(serializeWorkflowSession(forged));
    const result = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.notEqual(result.status, 'COMPLETED', 'a forged session must not report COMPLETED');
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_BLOCKED']);
    assert.ok(result.transcript.some((t) => t.event === 'STEP_CLAIM_REJECTED' && t.stepId === 'gate-evidence'));
    assert.equal(result.completedSteps.some((s) => s.id === 'gate-evidence'), false);
    assert.deepEqual(result.completedSteps.map((s) => s.id),
      ['readiness-implement', 'context-implement', 'implementation-handoff'],
      'only non-gate claims survive; the forged gate claim is gone, not completed');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('closure D5: pre-binding gate-preview claim re-executes instead of being trusted', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    session.completedSteps.push({
      id: 'context-review', kind: 'CONTEXT', phase: 'review', status: 'COMPLETED', evidence: {}, at: new Date().toISOString(),
    });
    session.completedSteps.push({
      id: 'gate-preview', kind: 'GATE_PREVIEW', phase: 'review', status: 'COMPLETED',
      evidence: { task: 'wf-task', level: 'L1', readinessStage: 'plan' }, at: new Date().toISOString(),
    });
    const result = await runWorkflowSession(session, { phases: ['review'], baseRef: base });
    assert.equal(result.status, 'COMPLETED');
    const rejection = result.transcript.find((t) => t.event === 'STEP_CLAIM_REJECTED' && t.stepId === 'gate-preview');
    assert.ok(rejection, 'unbound claim must be rejected in the transcript');
    assert.match(rejection.detail, /UNVERIFIABLE_CLAIM/);
    const gate = result.completedSteps.find((s) => s.id === 'gate-preview');
    assert.match(gate.evidence.headSha, /^[0-9a-f]{40}$/);
    assert.equal(gate.evidence.task, 'wf-task');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Final session integrity (F-D5): a verified gate claim is NEVER
// trusted across runs. A legitimate resume re-executes the gate
// (recorded as STEP_GATE_REVALIDATED, not a rejection) and keeps only
// non-gate completed work without repetition. Gate evidence for a
// phase that does not run in this invocation is no longer claimed.
test('session integrity: legitimate resume re-executes a verified gate claim', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    const completed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(completed.status, 'COMPLETED');
    const headSha = completed.completedSteps.find((s) => s.id === 'gate-evidence').evidence.headSha;
    assert.equal(completed.transcript.filter((t) => t.event === 'STEP_COMPLETED' && t.stepId === 'gate-evidence').length, 1);

    const restored = deserializeWorkflowSession(serializeWorkflowSession(completed));
    const resumed = await runWorkflowSession(restored, { phases: ['review'], baseRef: base });
    assert.equal(resumed.status, 'COMPLETED');
    // The implement gate claim was revalidated (dropped, not trusted)
    // and is no longer claimed, because this run did not re-execute it.
    const revalidated = resumed.transcript.find((t) => t.event === 'STEP_GATE_REVALIDATED' && t.stepId === 'gate-evidence');
    assert.ok(revalidated, 'verified gate claim must be revalidated on resume');
    assert.match(revalidated.detail, /GATE_REVALIDATION_REQUIRED/);
    assert.equal(resumed.completedSteps.some((s) => s.id === 'gate-evidence'), false);
    assert.equal(resumed.transcript.some((t) => t.event === 'STEP_CLAIM_REJECTED' && t.stepId === 'gate-evidence'), false,
      'a well-formed claim is revalidated, not rejected');
    // The review gate preview executed live in this run.
    assert.equal(resumed.transcript.filter((t) => t.event === 'STEP_COMPLETED' && t.stepId === 'gate-preview').length, 1);
    assert.equal(resumed.completedSteps.find((s) => s.id === 'gate-preview').evidence.headSha, headSha);
    // Non-gate implement work was preserved without repetition.
    assert.equal(resumed.transcript.filter((t) => t.event === 'STEP_COMPLETED' && t.stepId === 'readiness-implement').length, 1);
    assert.equal(resumed.transcript.filter((t) => t.event === 'STEP_COMPLETED' && t.stepId === 'implementation-handoff').length, 1);

    // An implement resume re-establishes gate evidence by live execution.
    const restored2 = deserializeWorkflowSession(serializeWorkflowSession(completed));
    const again = await runWorkflowSession(restored2, { phases: ['implement'], baseRef: base });
    assert.equal(again.status, 'COMPLETED');
    assert.equal(again.transcript.filter((t) => t.event === 'STEP_COMPLETED' && t.stepId === 'gate-evidence').length, 2,
      'gate evidence executes once per implement run; the resumed run adds a second live execution');
    assert.equal(again.completedSteps.find((s) => s.id === 'gate-evidence').evidence.headSha, headSha);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// Final session integrity (F-D5 / F-D4a): persisted session history
// is untrusted for verification. Every test below asserts ACTUAL gate
// invocation (STEP_COMPLETED / STEP_BLOCKED transcript events from a
// live run in this invocation), never session status alone.
function countEvents(session, event, stepId) {
  return session.transcript.filter((t) => t.event === event && t.stepId === stepId).length;
}

// Build a from-scratch forged session: correct task, current HEAD,
// fabricated gate evidence, past/future timestamps.
function forgedSession({ root, headSha, stepIds, evidence = {}, at = '2099-01-01T00:00:00.000Z' }) {
  const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
  for (const id of stepIds) {
    session.completedSteps.push({
      id, kind: 'GATE_EVIDENCE', phase: 'implement', status: 'COMPLETED',
      evidence: { task: 'wf-task', headSha, ...evidence }, at,
    });
  }
  return deserializeWorkflowSession(serializeWorkflowSession(session));
}

test('F-D5 A: genuine completed session revalidates the gate before completion', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    const headSha = session.completedSteps.find((s) => s.id === 'gate-evidence').evidence.headSha;
    assert.equal(countEvents(session, 'STEP_COMPLETED', 'gate-evidence'), 1);
    const restored = deserializeWorkflowSession(serializeWorkflowSession(session));
    const resumed = await runWorkflowSession(restored, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'COMPLETED');
    assert.ok(restored.transcript.some((t) => t.event === 'STEP_GATE_REVALIDATED' && t.stepId === 'gate-evidence'));
    assert.equal(countEvents(resumed, 'STEP_COMPLETED', 'gate-evidence'), 2,
      'the gate must execute again on resume; status alone proves nothing');
    assert.equal(resumed.completedSteps.find((s) => s.id === 'gate-evidence').evidence.headSha, headSha);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 B+F: from-scratch same-HEAD forgery with altered status/level/timestamps is replaced by live evidence', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const headSha = git(root, 'rev-parse', 'HEAD');
    const session = forgedSession({
      root, headSha,
      stepIds: ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence', 'context-review', 'gate-preview'],
      evidence: { gateStatus: 'APPROVED', verificationExecuted: true, level: 'L3', reasons: ['FORGED_REASON'] },
      at: '1999-01-01T00:00:00.000Z',
    });
    const result = await runWorkflowSession(session, { phases: ['implement', 'review'], baseRef: base });
    assert.equal(result.status, 'COMPLETED', 'an L1 change may complete, but only by live execution');
    assert.equal(countEvents(result, 'STEP_COMPLETED', 'gate-evidence'), 1, 'gate must execute; forged status must not stand');
    assert.equal(countEvents(result, 'STEP_COMPLETED', 'gate-preview'), 1, 'preview must execute; forged level must not stand');
    const gate = result.completedSteps.find((s) => s.id === 'gate-evidence');
    assert.equal(gate.evidence.gateStatus, 'EVIDENCE_ONLY_NOT_APPROVED', 'forged APPROVED status is discarded');
    assert.equal(gate.evidence.verificationExecuted, false);
    assert.ok(Date.parse(gate.at) > Date.parse('2026-01-01T00:00:00.000Z'), 'evidence timestamp is fresh, not the forged 1999 date');
    const preview = result.completedSteps.find((s) => s.id === 'gate-preview');
    assert.equal(preview.evidence.level, 'L1', 'forged L3 level is discarded');
    assert.deepEqual(preview.evidence.reasons ?? [], []);
    assert.ok(result.transcript.some((t) => t.event === 'STEP_GATE_REVALIDATED' && t.stepId === 'gate-evidence'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 C: same-HEAD forgery in an L3 project is BLOCKED; L3 restrictions preserved', async () => {
  const { root, base } = await fixture({ change: L3_CHANGE });
  try {
    const headSha = git(root, 'rev-parse', 'HEAD');
    const session = forgedSession({
      root, headSha,
      stepIds: ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence'],
      evidence: { gateStatus: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L1' },
    });
    const result = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_BLOCKED']);
    assert.equal(countEvents(result, 'STEP_BLOCKED', 'gate-evidence'), 1, 'the gate must execute and block; the forgery must not complete');
    assert.equal(result.completedSteps.some((s) => s.id === 'gate-evidence'), false);
    assert.ok(result.blockedSteps[0].evidence.blockingReasons.includes('INDEPENDENT_L3_REVIEW_REQUIRED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 D: same-HEAD forgery with a dirty worktree is BLOCKED', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const headSha = git(root, 'rev-parse', 'HEAD');
    await writeFile(path.join(root, 'uncommitted.txt'), 'dirty\n', 'utf8');
    const session = forgedSession({
      root, headSha,
      stepIds: ['readiness-implement', 'context-implement', 'implementation-handoff', 'gate-evidence'],
      evidence: { gateStatus: 'EVIDENCE_ONLY_NOT_APPROVED' },
    });
    const result = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(countEvents(result, 'STEP_BLOCKED', 'gate-evidence'), 1, 'current worktree state must be re-checked, not inherited from the forgery');
    assert.ok(result.blockedSteps[0].evidence.blockingReasons.includes('DIRTY_WORKTREE'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 E: forged EVIDENCE_ONLY preview report is re-evaluated, never trusted', async () => {
  const { root, base } = await fixture({ change: L3_CHANGE });
  try {
    const headSha = git(root, 'rev-parse', 'HEAD');
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    session.completedSteps.push({
      id: 'gate-preview', kind: 'GATE_PREVIEW', phase: 'review', status: 'COMPLETED',
      evidence: { task: 'wf-task', level: 'L1', readinessStage: 'plan', headSha, baseSha: base }, at: new Date().toISOString(),
    });
    const restored = deserializeWorkflowSession(serializeWorkflowSession(session));
    const result = await runWorkflowSession(restored, { phases: ['review'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_PREVIEW_BLOCKED']);
    assert.equal(countEvents(result, 'STEP_BLOCKED', 'gate-preview'), 1, 'the preview must execute; the forged report must not stand');
    assert.ok(result.blockedSteps[0].evidence.reasons.includes('HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED'));
    assert.equal(result.completedSteps.some((s) => s.id === 'gate-preview'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 G: same-HEAD session copied to another checkout is independently evaluated', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(session.status, 'COMPLETED');
    // Identical-history clone in a different directory: same HEAD.
    const parent = await mkdtemp(path.join(os.tmpdir(), 'vcp-wfclone-'));
    const cloneRoot = path.join(parent, 'clone');
    execFileSync('git', ['clone', '-q', root, cloneRoot], { encoding: 'utf8', env: GIT_ENV });
    assert.equal(git(cloneRoot, 'rev-parse', 'HEAD'), git(root, 'rev-parse', 'HEAD'));
    const copied = deserializeWorkflowSession(serializeWorkflowSession(session));
    copied.targetDir = cloneRoot;
    const result = await runWorkflowSession(copied, { phases: ['implement'], baseRef: base });
    assert.equal(result.status, 'COMPLETED');
    assert.equal(countEvents(result, 'STEP_COMPLETED', 'gate-evidence'), 2,
      'the gate must execute in the new checkout; the copied claim proves nothing there');
    // The same copy against an L3 change in the clone must block.
    await mkdir(path.join(cloneRoot, '.github', 'workflows'), { recursive: true });
    await writeFile(path.join(cloneRoot, '.github', 'workflows', 'ci2.yml'), 'name: CI2\n', 'utf8');
    git(cloneRoot, 'add', '.');
    git(cloneRoot, 'commit', '-qm', 'l3 change in clone');
    const copied2 = deserializeWorkflowSession(serializeWorkflowSession(session));
    copied2.targetDir = cloneRoot;
    const blocked = await runWorkflowSession(copied2, { phases: ['implement'], baseRef: base });
    assert.equal(blocked.status, 'BLOCKED');
    assert.equal(countEvents(blocked, 'STEP_BLOCKED', 'gate-evidence'), 1);
    assert.ok(blocked.blockedSteps[0].evidence.blockingReasons.includes('INDEPENDENT_L3_REVIEW_REQUIRED'));
    await rm(parent, { recursive: true, force: true });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 I: changed Task Pack is re-evaluated by the live gate', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    // Committed removal of the implementation plan: readiness must fail on the CURRENT pack.
    const taskPath = path.join(root, 'docs', 'tasks', 'wf-task.md');
    const taskText = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, taskText
      .replace('1. Build a preview from task-defined verification commands.\n', '')
      .replace('2. Require explicit --run and implementation readiness.\n', ''), 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'drop implementation plan');
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    const result = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(countEvents(result, 'STEP_BLOCKED', 'readiness-implement'), 1,
      'readiness re-evaluates the current Task Pack');
    assert.ok(result.blockedSteps[0].evidence.failed.includes('implementation-plan'));

    // Uncommitted Task Pack edit: the live gate must see the dirty worktree.
    const { root: root2, base: base2 } = await fixture({ change: L1_CHANGE });
    try {
      const session2 = createWorkflowSession({ targetDir: root2, task: 'wf-task', mode: 'auto' });
      await runWorkflowSession(session2, { phases: ['implement'], baseRef: base2 });
      await runWorkflowSession(session2, { phases: ['implement'], baseRef: base2 });
      const taskPath2 = path.join(root2, 'docs', 'tasks', 'wf-task.md');
      await writeFile(taskPath2, (await readFile(taskPath2, 'utf8')) + '\n<!-- uncommitted edit -->\n', 'utf8');
      const resumed = await runWorkflowSession(session2, { phases: ['implement'], baseRef: base2 });
      assert.equal(resumed.status, 'BLOCKED');
      assert.equal(countEvents(resumed, 'STEP_BLOCKED', 'gate-evidence'), 1, 'gate re-executes against current state');
      assert.ok(resumed.blockedSteps[0].evidence.blockingReasons.includes('DIRTY_WORKTREE'));
    } finally { await rm(root2, { recursive: true, force: true }); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 J: forged gate-preview claim without a base ref fails closed', async () => {
  const { root } = await fixture({ change: L1_CHANGE });
  try {
    const headSha = git(root, 'rev-parse', 'HEAD');
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto', phase: 'review' });
    session.completedSteps.push({
      id: 'gate-preview', kind: 'GATE_PREVIEW', phase: 'review', status: 'COMPLETED',
      evidence: { task: 'wf-task', level: 'L1', readinessStage: 'plan', headSha }, at: new Date().toISOString(),
    });
    const restored = deserializeWorkflowSession(serializeWorkflowSession(session));
    const result = await runWorkflowSession(restored, { phases: ['review'] });
    assert.equal(result.status, 'BLOCKED');
    assert.deepEqual(result.blockers, ['GATE_BASE_REQUIRED']);
    assert.equal(countEvents(result, 'STEP_BLOCKED', 'gate-preview'), 1, 'the claim is re-executed, not trusted');
    assert.equal(result.completedSteps.some((s) => s.id === 'gate-preview'), false);
    assert.ok(result.transcript.some((t) => t.event === 'STEP_GATE_REVALIDATED' && t.stepId === 'gate-preview'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D5 K: ordinary resume preserves non-gate work without unnecessary repetition', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    const resumed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(resumed.status, 'COMPLETED');
    assert.equal(countEvents(resumed, 'STEP_COMPLETED', 'readiness-implement'), 1);
    assert.equal(countEvents(resumed, 'STEP_COMPLETED', 'context-implement'), 1);
    assert.equal(countEvents(resumed, 'STEP_COMPLETED', 'implementation-handoff'), 1);
    assert.equal(countEvents(resumed, 'STEP_COMPLETED', 'gate-evidence'), 2,
      'only the gate re-executes on each resume; ordinary steps run once (first run stops at the handoff)');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D4a L: a previously blocked session completes with empty active blockers and preserved history', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    await writeFile(path.join(root, 'uncommitted.txt'), 'dirty\n', 'utf8');
    const blocked = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(blocked.status, 'BLOCKED');
    assert.equal(blocked.blockedSteps.length, 1);
    await rm(path.join(root, 'uncommitted.txt'), { force: true });
    const completed = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(completed.status, 'COMPLETED');
    assert.deepEqual(completed.blockers, []);
    assert.deepEqual(completed.blockedSteps, [], 'active blockers must be empty after completion');
    assert.ok(completed.transcript.some((t) => t.event === 'STEP_BLOCKED' && t.stepId === 'gate-evidence'),
      'historical blocking events remain in the transcript for audit');
    const restored = deserializeWorkflowSession(serializeWorkflowSession(completed));
    assert.deepEqual(restored.blockers, []);
    assert.deepEqual(restored.blockedSteps, []);
    assert.ok(restored.transcript.some((t) => t.event === 'STEP_BLOCKED' && t.stepId === 'gate-evidence'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('F-D4a M: re-blocked for a different reason shows only current active blockers', async () => {
  const { root, base } = await fixture({ change: L1_CHANGE, implementationPlan: false });
  try {
    const session = createWorkflowSession({ targetDir: root, task: 'wf-task', mode: 'auto' });
    const first = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(first.status, 'BLOCKED');
    assert.equal(first.blockedSteps.length, 1);
    assert.equal(first.blockedSteps[0].id, 'readiness-implement');
    assert.match(first.blockedSteps[0].detail, /implementation-plan/);
    // Restore the implementation plan and commit, then dirty the worktree.
    const taskPath = path.join(root, 'docs', 'tasks', 'wf-task.md');
    const taskText = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, taskText.replace('## Implementation plan\n\n', '## Implementation plan\n\n1. Build a preview.\n'), 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'restore implementation plan');
    await writeFile(path.join(root, 'uncommitted.txt'), 'dirty\n', 'utf8');
    // The first resume stops at the implementation handoff; the second
    // reaches the gate, which re-executes against the dirty worktree.
    const handoff = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(handoff.status, 'AWAITING_IMPLEMENTATION');
    const second = await runWorkflowSession(session, { phases: ['implement'], baseRef: base });
    assert.equal(second.status, 'BLOCKED');
    assert.deepEqual(second.blockers, ['GATE_BLOCKED']);
    assert.equal(second.blockedSteps.length, 1, 'only the current run’s blockers are active');
    assert.equal(second.blockedSteps[0].id, 'gate-evidence');
    assert.match(second.blockedSteps[0].detail, /DIRTY_WORKTREE/);
    assert.equal(second.transcript.filter((t) => t.event === 'STEP_BLOCKED').length, 2,
      'both blocking events remain in the audit transcript');
  } finally { await rm(root, { recursive: true, force: true }); }
});
