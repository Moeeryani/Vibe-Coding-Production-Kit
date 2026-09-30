import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const exampleRoot = path.join(repoRoot, 'examples', 'reference-saas-invite');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const promptNames = [
  '01-discovery.md',
  '02-plan-task.md',
  '03-implement-task.md',
  '04-code-review.md',
  '05-security-review.md',
  '06-refactor.md',
  '07-release-review.md'
];

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-reference-context-'));
}

async function copyReferenceFixture() {
  const target = await tempDir();
  await cp(exampleRoot, target, { recursive: true });
  return target;
}

async function writeContextTask(target) {
  const taskDir = path.join(target, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'context-fixture.md'), `# Task — Reference context fixture\n\n## Outcome\n\nProve the checked-in reference project can build bounded VCP context without copying prompts at runtime.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n| Security | \`docs/security/THREAT-MODEL.md\` |\n\n## Acceptance criteria\n\n- [ ] AC-001 — Plan, implement, and review context build from a clean fixture copy.\n\n## Scope\n\n### In scope\n- Context-pack fixture conformance.\n\n### Out of scope\n- Changing invitation behavior.\n\n## Affected boundaries\n\n- Modules/files likely affected: reference prompt fixture only.\n- Public API/contract impact: n/a — fixture-only validation.\n- Data/schema/migration impact: n/a — no persisted data change.\n- External integration impact: n/a — local repository files only.\n\n## Domain invariants\n\nn/a — no invitation behavior changes.\n\n## Security and privacy\n\n- Authentication impact: n/a — fixture-only validation.\n- Authorization/resource ownership: n/a — fixture-only validation.\n- Tenant isolation: n/a — fixture-only validation.\n- Input/trust boundaries: repository-local task and prompt files only.\n- Secrets/PII/logging: n/a — no sensitive output.\n- Abuse/rate/replay considerations: n/a — local tooling only.\n- Relevant threat IDs: n/a — no product security change.\n\n## Failure modes and edge cases\n\n- Missing or stale local prompt snapshot.\n\n## Observability\n\nn/a — deterministic tests provide evidence.\n\n## Test plan\n\n### Unit\n- Compare prompt snapshots byte-for-byte.\n\n### Integration / contract\n- Build context through the CLI for all required phases.\n\n### E2E / regression\n- Reproduce the clean-checkout reference workflow.\n\n### Negative/security paths\n- Existing context path-safety tests remain authoritative.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: n/a — fixture-only change.\n- Migration/backfill: n/a — no migration.\n- Rollback or recovery: revert the fixture snapshot.\n\n## Implementation plan\n\n1. Keep local canonical prompt snapshots.\n2. Build context from the selected project root.\n3. Fail validation if snapshots drift.\n\n## Verification commands\n\n- \`CHECK_COMMAND\`: \`npm run check\`\n- \`UNIT_TEST_COMMAND\`: \`npm test\`\n`, 'utf8');
}

async function runContext(target, mode) {
  return execFileAsync(process.execPath, [
    bin,
    'context',
    'context-fixture',
    '--dir',
    target,
    '--mode',
    mode
  ], { cwd: repoRoot });
}

test('reference SaaS prompt snapshots stay identical to canonical prompts', async () => {
  for (const name of promptNames) {
    const canonical = await readFile(path.join(repoRoot, 'prompts', name), 'utf8');
    const snapshot = await readFile(path.join(exampleRoot, 'prompts', name), 'utf8');
    assert.equal(snapshot, canonical, `${name} drifted from the canonical prompt`);
  }
});

test('reference SaaS builds plan, implement, and review context from a clean fixture copy', async () => {
  const target = await copyReferenceFixture();
  await writeContextTask(target);

  const expectedPrompts = new Map([
    ['plan', 'prompts/02-plan-task.md'],
    ['implement', 'prompts/03-implement-task.md'],
    ['review', 'prompts/04-code-review.md']
  ]);

  for (const [mode, expectedPrompt] of expectedPrompts) {
    const { stdout, stderr } = await runContext(target, mode);
    assert.equal(stderr, '');
    assert.match(stdout, new RegExp(`# VCP Context Pack — ${mode}`));
    assert.match(stdout, new RegExp(expectedPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(stdout, /docs\/product\/PRD\.md/);
    assert.match(stdout, /docs\/security\/THREAT-MODEL\.md/);
    assert.doesNotMatch(stdout, /Context file not found/);
  }
});
