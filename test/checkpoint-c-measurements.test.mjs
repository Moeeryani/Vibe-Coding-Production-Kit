// Checkpoint C measurements, pinned as tests: classification accuracy across
// representative L0/L1/L2/L3 changes on disposable Git fixtures, clean-path
// gate outcomes, and the rename stale-reference catch. Qualitative analysis
// (interruptions, friction, recommendation) lives in
// VCP-ADAPTIVE-CHECKPOINT-C-REPORT.md; this file pins the numbers it cites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { runGatePreview } from '../lib/gate-preview.mjs';
import { runMechanicalGate } from '../lib/gate-run.mjs';
import { runTaskReadiness } from '../lib/readiness.mjs';

process.env.GIT_AUTHOR_NAME = 'Fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@example.invalid';
process.env.GIT_COMMITTER_NAME = 'Fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env } }).trim();
}
const PASS = 'node -e "process.exit(0)"';
function taskPack() {
  return `# Task — Checkpoint C fixture
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

- \`UNIT_TEST_COMMAND\`: \`${PASS}\`
`;
}
async function fixture({ change = [], rename = null, withTask = true } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-cpc-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agentsPath = path.join(root, 'AGENTS.md');
  await writeFile(agentsPath, (await readFile(agentsPath, 'utf8')).replace('UNIT_TEST_COMMAND=<define>', `UNIT_TEST_COMMAND=${PASS}`), 'utf8');
  if (withTask) {
    await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
    await writeFile(path.join(root, 'docs', 'tasks', 'gate-task.md'), taskPack(), 'utf8');
  }
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  if (rename) git(root, 'mv', rename.from, rename.to);
  else for (const { file, content } of change) {
    const dest = path.join(root, file);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, content, 'utf8');
  }
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'change');
  return { root, base };
}
async function classify(change, opts = {}) {
  const { root, base } = await fixture({ change, ...opts });
  try {
    const preview = await runGatePreview({ targetDir: root, task: opts.withTask === false ? null : 'gate-task', baseRef: base });
    return preview;
  } finally { await rm(root, { recursive: true, force: true }); }
}

const CASES = [
  ['docs-only README change', [{ file: 'README.md', content: 'Changed\n' }], 'L0', { withTask: false }],
  ['product doc change', [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }], 'L1', {}],
  ['other task file change', [{ file: 'docs/tasks/other-task.md', content: '# Other\n' }], 'L1', {}],
  ['source change', [{ file: 'src/index.js', content: 'export default 1;\n' }], 'L2', {}],
  ['test change', [{ file: 'test/foo.test.mjs', content: 'import test from "node:test";\n' }], 'L2', {}],
  ['unknown file type', [{ file: 'data.bin', content: 'binary\n' }], 'L2', {}],
  ['workflow change', [{ file: '.github/workflows/ci.yml', content: 'name: CI\n' }], 'L3', {}],
  ['security doc change', [{ file: 'docs/security/notes.md', content: '# Notes\n' }], 'L3', {}],
  ['package manifest change', [{ file: 'package.json', content: '{"name":"x"}\n' }], 'L3', {}],
  ['auth source change', [{ file: 'src/auth/login.js', content: 'export default 1;\n' }], 'L3', {}],
  ['agent instructions change', [{ file: 'AGENTS.md', content: 'changed\n' }], 'L3', {}],
];
for (const [name, change, expected, opts] of CASES) {
  test(`classification: ${name} -> ${expected}`, async () => {
    const preview = await classify(change, opts);
    assert.equal(preview.changes.requiredLevel, expected);
  });
}

test('representative clean L0/L1/L2 gates reach evidence-only; L3 blocks', async () => {
  const reps = [
    { change: [{ file: 'README.md', content: 'Changed\n' }], withTask: false, level: 'L0', verify: false },
    { change: [{ file: 'docs/product/PRD.md', content: '# Product\n\nChanged.\n' }], withTask: true, level: 'L1', verify: false },
    { change: [{ file: 'src/index.js', content: 'export default 1;\n' }], withTask: true, level: 'L2', verify: true },
    { change: [{ file: '.github/workflows/ci.yml', content: 'name: CI\n' }], withTask: true, level: 'L3', verify: false },
  ];
  for (const rep of reps) {
    const { root, base } = await fixture({ change: rep.change, withTask: rep.withTask });
    try {
      const report = await runMechanicalGate({ targetDir: root, task: rep.withTask ? 'gate-task' : null, baseRef: base, run: true });
      assert.equal(report.preflight.changes.requiredLevel, rep.level);
      assert.equal(report.verificationExecuted, rep.verify);
      if (rep.level === 'L3') {
        assert.equal(report.status, 'BLOCKED');
        assert.ok(report.blockingReasons.includes('INDEPENDENT_L3_REVIEW_REQUIRED'));
      } else {
        assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
        assert.equal(report.mergeAuthorized, false);
        assert.equal(report.ciEnforced, false);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('empty diff is blocked, never classified as a pass', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-cpc-empty-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  try {
    const preview = await runGatePreview({ targetDir: root, task: null, baseRef: base });
    assert.equal(preview.decision.status, 'BLOCKED');
    assert.ok(preview.decision.reasons.includes('NO_CHANGED_FILES'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rename of a task-referenced doc is caught as a stale reference, not a false positive', async () => {
  const { root, base } = await fixture({ rename: { from: 'docs/product/PRD.md', to: 'docs/product/PRD-OLD.md' } });
  try {
    const preview = await runGatePreview({ targetDir: root, task: 'gate-task', baseRef: base });
    assert.equal(preview.changes.requiredLevel, 'L2');
    const readiness = await runTaskReadiness({ targetDir: root, task: 'gate-task', stage: 'implement' });
    assert.equal(readiness.summary.fail, 1);
    const failed = readiness.checks.find((c) => c.status === 'fail');
    assert.equal(failed.id, 'source-truth');
    assert.match(failed.detail, /docs\/product\/PRD\.md/);
    const report = await runMechanicalGate({ targetDir: root, task: 'gate-task', baseRef: base, run: true });
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('READINESS_UNSATISFIED'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('gate decision context stays small across levels', async () => {
  for (const change of [[{ file: 'README.md', content: 'Changed\n' }], [{ file: 'src/index.js', content: 'export default 1;\n' }], [{ file: '.github/workflows/ci.yml', content: 'name: CI\n' }]]) {
    const preview = await classify(change, { withTask: false });
    const bytes = Buffer.byteLength(JSON.stringify(preview), 'utf8');
    assert.ok(bytes > 0 && bytes < 4096, `preview JSON ${bytes} bytes exceeds 4KB budget`);
  }
});
