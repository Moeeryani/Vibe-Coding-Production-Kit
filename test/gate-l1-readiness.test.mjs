// D-PC-01: L1 uses plan-stage readiness, with conservative promotion to L2
// for material behavioral changes. L1 never executes verification commands,
// so the implement bar (implementation plan + command authority) must not
// gate L1 changes; L2/L3 keep the implement bar; L0 keeps its lightweight
// changed-surface contract. Proven live against disposable Git fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { runMechanicalGate } from '../lib/gate-run.mjs';
import { runGatePreview } from '../lib/gate-preview.mjs';
import { classifyChangeSet, previewGateDecision, readinessStageForLevel } from '../lib/gate-contract.mjs';

process.env.GIT_AUTHOR_NAME = 'L1Probe';
process.env.GIT_AUTHOR_EMAIL = 'l1probe@example.invalid';
process.env.GIT_COMMITTER_NAME = 'L1Probe';
process.env.GIT_COMMITTER_EMAIL = 'l1probe@example.invalid';
const GIT_ENV = { ...process.env };
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim();
}
const PASS = 'node -e "process.exit(0)"';

function taskPack({ implementationPlan = true, outcome = true } = {}) {
  return `# Task — L1 fixture
Status: Review

## Outcome

${outcome ? 'Ship one verified change.' : ''}

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

async function makeFixture({ change, plan = true, outcome = true }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-l1-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agentsPath = path.join(root, 'AGENTS.md');
  const agentsText = await readFile(agentsPath, 'utf8');
  await writeFile(agentsPath, agentsText.replace('UNIT_TEST_COMMAND=<define>', `UNIT_TEST_COMMAND=${PASS}`), 'utf8');
  const taskDir = path.join(root, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'l1-task.md'), taskPack({ implementationPlan: plan, outcome }), 'utf8');
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

test('readiness stage follows the level', () => {
  assert.equal(readinessStageForLevel('L0'), 'none');
  assert.equal(readinessStageForLevel('L1'), 'plan');
  assert.equal(readinessStageForLevel('L2'), 'implement');
  assert.equal(readinessStageForLevel('L3'), 'implement');
  assert.throws(() => readinessStageForLevel('L9'), /E_GATE_LEVEL/);
});

test('material content under a governing-doc directory promotes to L2', () => {
  const level = (p) => classifyChangeSet([{ status: 'M', path: p, from: null }]).requiredLevel;
  assert.equal(level('docs/product/PRD.md'), 'L1');
  assert.equal(level('docs/testing/TEST-STRATEGY.md'), 'L1');
  assert.equal(level('docs/architecture/ARCHITECTURE.md'), 'L1');
  assert.equal(level('docs/product/migration.sql'), 'L2');
  assert.equal(level('docs/product/config.json'), 'L2');
  assert.equal(level('docs/product/flags.yaml'), 'L2');
  assert.equal(level('docs/testing/run-tests.sh'), 'L2');
  assert.equal(level('docs/testing/helper.test.js'), 'L2');
  assert.equal(level('README.md'), 'L0');
  assert.equal(level('docs/guide.md'), 'L0');
  assert.equal(level('src/index.js'), 'L2');
  assert.equal(level('config.json'), 'L2');
  const sql = classifyChangeSet([{ status: 'M', path: 'docs/product/migration.sql', from: null }]);
  assert.equal(sql.readinessStage, 'implement');
  assert.equal(classifyChangeSet([{ status: 'M', path: 'docs/product/PRD.md', from: null }]).readinessStage, 'plan');
  assert.equal(classifyChangeSet([{ status: 'M', path: 'README.md', from: null }]).readinessStage, 'none');
});

test('a requested minimum level promotes the readiness bar; downgrades refuse', () => {
  const changes = classifyChangeSet([{ status: 'M', path: 'docs/product/PRD.md', from: null }], { selection: { minimumLevel: 'L2' } });
  assert.equal(changes.requiredLevel, 'L2');
  assert.equal(changes.readinessStage, 'implement');
  const decision = previewGateDecision({ changes, task: { status: 'Review' }, requestedLevel: 'L0' });
  assert.ok(decision.reasons.includes('LEVEL_DOWNGRADE_REFUSED'));
  const ok = previewGateDecision({ changes: classifyChangeSet([{ status: 'M', path: 'docs/product/PRD.md', from: null }]), task: { status: 'Review' }, requestedLevel: 'L2' });
  assert.equal(ok.readinessStage, 'plan');
  assert.ok(!ok.reasons.includes('LEVEL_DOWNGRADE_REFUSED'));
});

test('preview reports the level readiness bar', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }] });
  try {
    const preview = await runGatePreview({ targetDir: root, task: 'l1-task', baseRef: base });
    assert.equal(preview.changes.requiredLevel, 'L1');
    assert.equal(preview.decision.readinessStage, 'plan');
    assert.equal(preview.changes.readinessStage, 'plan');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L1 gate passes with plan-stage readiness (no implementation plan needed)', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }], plan: false });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'l1-task', baseRef: base, run: true });
    assert.equal(report.preflight.changes.requiredLevel, 'L1');
    assert.equal(report.readinessStage, 'plan');
    assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
    assert.deepEqual(report.blockingReasons, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L1 gate blocks when plan-stage core readiness fails', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }], plan: false, outcome: false });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'l1-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('READINESS_UNSATISFIED'));
    assert.ok(report.readinessSummary.fail > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L2 gate keeps the implement bar: plan-only readiness blocks', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'src/index.js', content: 'export default 1;\n' }], plan: false });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'l1-task', baseRef: base, run: true });
    assert.equal(report.preflight.changes.requiredLevel, 'L2');
    assert.equal(report.readinessStage, 'implement');
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('READINESS_UNSATISFIED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('L0 keeps its lightweight contract: no readiness bar even with a task', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'README.md', content: 'Changed\n' }], plan: false });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'l1-task', baseRef: base, run: true });
    assert.equal(report.preflight.changes.requiredLevel, 'L0');
    assert.equal(report.readinessStage, 'none');
    assert.equal(report.readinessSummary, null);
    assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('minimum-level promotion raises the L1 bar to implement', async () => {
  const { root, base } = await makeFixture({ change: [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }], plan: false });
  try {
    const report = await runMechanicalGate({ targetDir: root, task: 'l1-task', baseRef: base, minimumLevel: 'L2', run: true });
    assert.equal(report.preflight.changes.requiredLevel, 'L2');
    assert.equal(report.readinessStage, 'implement');
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('READINESS_UNSATISFIED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
