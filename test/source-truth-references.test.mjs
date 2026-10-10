import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContextPack } from '../lib/context.mjs';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { runTaskReadiness } from '../lib/readiness.mjs';
import { extractSourceTruthReferences } from '../lib/source-truth-references.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-source-ref-'));
}

async function writeTask(target, slug, sourceSection) {
  const taskDir = path.join(target, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, `${slug}.md`), `# Task — Source reference fixture\n\n## Outcome\n\nKeep Source-of-Truth path parsing explicit without treating domain prose as files.\n\n## Source of truth\n\n${sourceSection}\n\n## Acceptance criteria\n\n- [ ] AC-001 — Explicit repository references resolve while inline code identifiers remain prose.\n\n## Scope\n\n### In scope\n- Source-of-Truth reference parsing.\n\n### Out of scope\n- Changing product behavior.\n\n## Affected boundaries\n\n- Modules/files likely affected: readiness and context parsing.\n- Public API/contract impact: Task Pack Markdown parsing only.\n- Data/schema/migration impact: n/a — no persisted schema.\n- External integration impact: n/a — local files only.\n\n## Domain invariants\n\nOnly explicit reference positions define repository files.\n\n## Security and privacy\n\n- Authentication impact: n/a — local tooling.\n- Authorization/resource ownership: n/a — local tooling.\n- Tenant isolation: n/a — local tooling.\n- Input/trust boundaries: Task Pack Markdown is repository-controlled input.\n- Secrets/PII/logging: n/a — no sensitive output added.\n- Abuse/rate/replay considerations: n/a — local parsing only.\n- Relevant threat IDs: n/a — no product trust-boundary change.\n\n## Failure modes and edge cases\n\n- Inline code spans resemble filenames but are not references.\n\n## Observability\n\nn/a — parser behavior is covered by deterministic tests.\n\n## Test plan\n\n### Unit\n- Parse only explicit reference positions.\n\n### Integration / contract\n- Run readiness and context against mixed prose/reference Markdown.\n\n### E2E / regression\n- Reproduce the dogfood code-span failure.\n\n### Negative/security paths\n- Existing unsafe explicit reference checks remain unchanged.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: preserve canonical table references.\n- Migration/backfill: n/a — no schema change.\n- Rollback or recovery: revert the parser change.\n\n## Implementation plan\n\n1. Parse explicit reference positions.\n2. Share the parser across readiness and context.\n3. Verify regression coverage.\n\n## Verification commands\n\n- \`UNIT_TEST_COMMAND\`: \`node --test\`\n`, 'utf8');
}

test('parser ignores ordinary code spans and reads explicit table/labeled references', () => {
  const task = `# Task\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product | \`docs/product/PRD.md#FR-001\` |\n\nPermission is \`members.invite\`, state is \`pending\`, and the project check is \`npm test\`.\n\n- Source: \`docs/security/THREAT-MODEL.md#T-001\`\n- Permission: \`members.invite\`\n- \`pending\`\n\n## Acceptance criteria\n`;

  assert.deepEqual(extractSourceTruthReferences(task), [
    'docs/product/PRD.md#FR-001',
    'docs/security/THREAT-MODEL.md#T-001'
  ]);
});

test('parser supports plain or linked values in the canonical Reference column', () => {
  const task = `## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product | docs/product/PRD.md |\n| Security | [Threat model](docs/security/THREAT-MODEL.md#T-001) |\n`;
  assert.deepEqual(extractSourceTruthReferences(task), [
    'docs/product/PRD.md',
    'docs/security/THREAT-MODEL.md#T-001'
  ]);
});

test('parser preserves malformed explicit references for readiness diagnostics and ignores reasoned n/a', () => {
  const task = `## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product | \`<define-path>\` |\n| Security | n/a — no separate security source |\n`;
  assert.deepEqual(extractSourceTruthReferences(task), ['<define-path>']);
});

test('readiness does not interpret Source-of-Truth prose code spans as repository paths', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(target, 'docs/product/PRD.md'), '# Accepted PRD\n\nThe requirement is approved.\n', 'utf8');
  await writeTask(target, 'mixed-source-prose', `| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n\nThe permission is \`members.invite\`, the state is \`pending\`, and verification uses \`npm test\`.`);

  const report = await runTaskReadiness({ targetDir: target, task: 'mixed-source-prose', stage: 'plan' });
  const source = report.checks.find((item) => item.id === 'source-truth');
  assert.equal(source.status, 'pass');
  assert.match(source.detail, /^1 repository reference\(s\) resolve successfully\.$/);
});

test('context includes only explicit Source-of-Truth files from mixed prose', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(target, 'docs/product/PRD.md'), '# Accepted PRD\n\nThe requirement is approved.\n', 'utf8');
  await writeTask(target, 'mixed-context-prose', `| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n\nPermission \`members.invite\`, state \`pending\`, command \`npm test\`.`);

  const result = await createContextPack({ targetDir: target, task: 'mixed-context-prose', mode: 'plan' });
  assert.ok(result.files.includes('docs/product/PRD.md'));
  assert.equal(result.files.includes('members.invite'), false);
  assert.equal(result.files.includes('pending'), false);
  assert.equal(result.files.includes('npm test'), false);
});
