import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContextPack } from '../lib/context.mjs';
import { runTaskReadiness } from '../lib/readiness.mjs';
import { parseSourceTruthAuthority } from '../lib/source-truth-authority.mjs';

async function tempProject() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-sot-'));
  await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
  await mkdir(path.join(root, 'docs', 'product'), { recursive: true });
  await mkdir(path.join(root, 'prompts'), { recursive: true });
  await writeFile(path.join(root, 'prompts', '02-plan-task.md'), '# Plan prompt\n');
  await writeFile(path.join(root, 'prompts', '03-implement-task.md'), '# Implement prompt\n');
  return root;
}

function taskContent(reference = 'docs/product/PRD.md') {
  return `# Task — Authority fixture

Status: Ready
Slug: \`authority-fixture\`

## Outcome

Implement one bounded authority-aware behavior.

## Source of truth

| Source | Reference |
|---|---|
| Product / PRD | \`${reference}\` |

## Requirement restatement

Use only current governing Source-of-Truth material.

## Acceptance criteria

- [ ] AC-001 — Authority handling is deterministic.

## Scope

### In scope
- Source-of-Truth authority handling.

### Out of scope
- Revision databases.

## Affected boundaries

- Modules/files likely affected: authority fixture.
- Public API/contract impact: internal test only.
- Data/schema/migration impact: n/a — no stored schema.
- External integration impact: n/a — local test only.

## Domain invariants

Current authority must not be confused with historical material.

## Security and privacy

- Authentication impact: n/a — test fixture.
- Authorization/resource ownership: n/a — test fixture.
- Tenant isolation: n/a — test fixture.
- Input/trust boundaries: repository Markdown only.
- Secrets/PII/logging: n/a — no secrets.
- Abuse/rate/replay considerations: n/a — local parser.
- Relevant threat IDs: n/a — workflow metadata only.

## Failure modes and edge cases

- Invalid explicit authority markers fail visibly.

## Observability

n/a — deterministic CLI diagnostics are sufficient.

## Test plan

### Unit
- authority parsing.

### Integration / contract
- readiness and context behavior.

### E2E / regression
- n/a — no delivery surface.

### Negative/security paths
- historical authority cannot govern implementation.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: legacy unmarked documents remain compatible.
- Migration/backfill: n/a — no migration required.
- Rollback or recovery: revert the bounded change.

## Implementation plan

1. Parse authority.
2. Enforce it in readiness/context.

## Verification commands

- \`CHECK_COMMAND\`: \`node --check example.mjs\`
- \`UNIT_TEST_COMMAND\`: \`node --test\`
`;
}

async function writeFixture(root, authorityLine, body = 'Current requirement.\nRejected option: B remains rejected.\n') {
  const prefix = authorityLine ? `${authorityLine}\n\n` : '';
  await writeFile(path.join(root, 'docs', 'product', 'PRD.md'), `# PRD\n\n${prefix}${body}`);
  await writeFile(path.join(root, 'docs', 'tasks', 'authority-fixture.md'), taskContent());
}

function sourceFinding(report) {
  return report.checks.find((item) => item.id === 'source-truth');
}

test('authority parser keeps legacy compatibility and rejects ambiguous explicit markers', () => {
  assert.deepEqual(parseSourceTruthAuthority('# PRD\n'), { explicit: false, state: 'LEGACY', error: null });
  assert.equal(parseSourceTruthAuthority('Authority: accepted\n').state, 'ACCEPTED');
  assert.match(parseSourceTruthAuthority('Authority: current\n').error, /Unknown Source-of-Truth authority/);
  assert.match(parseSourceTruthAuthority('Authority: DRAFT\nAuthority: ACCEPTED\n').error, /Multiple Authority markers/);
});

test('legacy and ACCEPTED documents remain implementation-ready', async () => {
  for (const marker of [null, 'Authority: ACCEPTED']) {
    const root = await tempProject();
    await writeFixture(root, marker);
    const report = await runTaskReadiness({ targetDir: root, task: 'authority-fixture', stage: 'implement' });
    assert.equal(sourceFinding(report).status, 'pass');
  }
});

test('DRAFT is plan-usable but cannot authorize implementation', async () => {
  const root = await tempProject();
  await writeFixture(root, 'Authority: DRAFT');

  const plan = await runTaskReadiness({ targetDir: root, task: 'authority-fixture', stage: 'plan' });
  assert.equal(sourceFinding(plan).status, 'pass');
  assert.match(sourceFinding(plan).detail, /plan stage explicitly permits draft authority/);

  const implement = await runTaskReadiness({ targetDir: root, task: 'authority-fixture', stage: 'implement' });
  assert.equal(sourceFinding(implement).status, 'fail');
  assert.match(sourceFinding(implement).detail, /authority is DRAFT/);

  const context = await createContextPack({ targetDir: root, task: 'authority-fixture', mode: 'plan' });
  assert.match(context.content, /Authority: DRAFT/);
  await assert.rejects(
    createContextPack({ targetDir: root, task: 'authority-fixture', mode: 'implement' }),
    /only plan context may use draft governing material/
  );
});

test('SUPERSEDED and ARCHIVED material cannot silently govern current execution', async () => {
  for (const state of ['SUPERSEDED', 'ARCHIVED']) {
    const root = await tempProject();
    await writeFixture(root, `Authority: ${state}`);
    const report = await runTaskReadiness({ targetDir: root, task: 'authority-fixture', stage: 'implement' });
    assert.equal(sourceFinding(report).status, 'fail');
    assert.match(sourceFinding(report).detail, new RegExp(`authority is ${state}`));
    await assert.rejects(
      createContextPack({ targetDir: root, task: 'authority-fixture', mode: 'implement' }),
      new RegExp(`authority is ${state}`)
    );
  }
});

test('invalid explicit authority fails visibly instead of falling back to legacy behavior', async () => {
  const root = await tempProject();
  await writeFixture(root, 'Authority: CURRENT');
  const report = await runTaskReadiness({ targetDir: root, task: 'authority-fixture', stage: 'implement' });
  assert.equal(sourceFinding(report).status, 'fail');
  assert.match(sourceFinding(report).detail, /Unknown Source-of-Truth authority/);
  await assert.rejects(
    createContextPack({ targetDir: root, task: 'authority-fixture', mode: 'implement' }),
    /Unknown Source-of-Truth authority/
  );
});

test('accepted negative decisions stay in context while historical material requires deliberate include', async () => {
  const root = await tempProject();
  await writeFixture(root, 'Authority: ACCEPTED');
  await writeFile(
    path.join(root, 'docs', 'product', 'HISTORY.md'),
    '# Historical policy\n\nAuthority: SUPERSEDED\n\nOld option A.\n'
  );

  const current = await createContextPack({ targetDir: root, task: 'authority-fixture', mode: 'implement' });
  assert.match(current.content, /Rejected option: B remains rejected/);
  assert.doesNotMatch(current.content, /Old option A/);

  const withHistory = await createContextPack({
    targetDir: root,
    task: 'authority-fixture',
    mode: 'implement',
    includes: ['docs/product/HISTORY.md']
  });
  assert.match(withHistory.content, /Explicit extra context/);
  assert.match(withHistory.content, /Authority: SUPERSEDED/);
  assert.match(withHistory.content, /Old option A/);
});
