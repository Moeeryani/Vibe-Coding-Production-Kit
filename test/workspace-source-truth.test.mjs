import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { createContextPack } from '../lib/context.mjs';
// Test-only preinstalled historical v1 state; production init stays fenced.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { runTaskReadiness } from '../lib/readiness.mjs';
import { resolveWorkspaceSourceTruthReference } from '../lib/source-truth-scope.mjs';

const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-workspace-source-'));
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function workspaceFixture() {
  const root = await tempDir();
  const project = path.join(root, 'packages', 'api');
  await initProject({ targetDir: project, agent: 'generic', stack: 'generic', includeGitHub: false });
  await git(root, 'init');
  await mkdir(path.join(root, 'docs', 'platform'), { recursive: true });
  await mkdir(path.join(root, 'packages', 'web', 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'platform', 'POLICY.md'), '# Shared platform policy\n\nAuthority: ACCEPTED\n\nShared workspace rule: API changes preserve tenant boundaries.\n', 'utf8');
  await writeFile(path.join(root, 'docs', 'platform', 'UNRELATED.md'), '# Unrelated root document\n\nAuthority: ACCEPTED\n\nDo not auto-include me.\n', 'utf8');
  await writeFile(path.join(root, 'packages', 'web', 'docs', 'SIBLING.md'), '# Sibling package truth\n\nAuthority: ACCEPTED\n\nDo not inherit sibling authority.\n', 'utf8');
  await writeFile(path.join(project, 'docs', 'product', 'PRD.md'), '# Package PRD\n\nAuthority: ACCEPTED\n\nPackage rule: implement the API endpoint.\n', 'utf8');
  return { root, project };
}

async function writeTask(project, slug, references) {
  await mkdir(path.join(project, 'docs', 'tasks'), { recursive: true });
  const rows = references.map((reference, index) => `| Source ${index + 1} | \`${reference}\` |`).join('\n');
  await writeFile(path.join(project, 'docs', 'tasks', `${slug}.md`), `# Task — Workspace Source-of-Truth fixture\n\nStatus: Review\nSlug: \`${slug}\`\n\n## Outcome\n\nProve explicit shared workspace authority without implicit cross-root inheritance.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n${rows}\n\n## Acceptance criteria\n\n- [ ] AC-001 — Only explicitly declared governing sources are used.\n\n## Scope\n\n### In scope\n- Explicit workspace authority.\n\n### Out of scope\n- Implicit inheritance.\n\n## Affected boundaries\n\n- Modules/files likely affected: Source-of-Truth resolution and context.\n- Public API/contract impact: explicit \`workspace:\` reference qualifier.\n- Data/schema/migration impact: n/a — Task Pack Markdown only.\n- External integration impact: local Git worktree discovery only.\n\n## Domain invariants\n\nProject-local paths remain project-local unless explicitly workspace-qualified.\n\n## Security and privacy\n\n- Authentication impact: n/a — local tooling.\n- Authorization/resource ownership: workspace authority is explicit and bounded.\n- Tenant isolation: n/a — fixture only.\n- Input/trust boundaries: repository Markdown and local Git metadata are untrusted inputs.\n- Secrets/PII/logging: n/a — no secret output.\n- Abuse/rate/replay considerations: n/a — local deterministic tooling.\n- Relevant threat IDs: n/a — no application security model change.\n\n## Failure modes and edge cases\n\n- Workspace reference outside Git fails visibly.\n- Traversal or symlink escape fails visibly.\n\n## Observability\n\nContext manifest and readiness diagnostics preserve the qualified portable reference.\n\n## Test plan\n\n### Unit\n- Resolve project-local and workspace-qualified references.\n\n### Integration / contract\n- Build bounded nested-project context.\n\n### E2E / regression\n- Preserve existing project-local behavior.\n\n### Negative/security paths\n- Reject stale authority and path escape.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: additive qualifier only.\n- Migration/backfill: none.\n- Rollback or recovery: remove qualifier support and keep project-local baseline.\n\n## Implementation plan\n\n1. Resolve explicit scope.\n2. Apply freshness.\n3. Keep context bounded.\n\n## Verification commands\n\n- \`CHECK_COMMAND\`: \`npm run check\`\n- \`UNIT_TEST_COMMAND\`: \`npm test\`\n`, 'utf8');
}

function sourceFinding(report) {
  return report.checks.find((item) => item.id === 'source-truth');
}

test('project-local references preserve existing selected-project behavior', async () => {
  const { project } = await workspaceFixture();
  await writeTask(project, 'project-local', ['docs/product/PRD.md']);

  const report = await runTaskReadiness({ targetDir: project, task: 'project-local', stage: 'implement' });
  const source = sourceFinding(report);
  assert.equal(source.status, 'pass');
  assert.equal(source.detail, '1 repository reference(s) resolve successfully.');

  const context = await createContextPack({ targetDir: project, task: 'project-local', mode: 'implement' });
  assert.ok(context.files.includes('docs/product/PRD.md'));
  assert.equal(context.files.some((item) => item.startsWith('workspace:')), false);
});

test('nested project can explicitly use accepted workspace authority without inheriting unrelated root or sibling files', async () => {
  const { root, project } = await workspaceFixture();
  await writeTask(project, 'shared-authority', ['docs/product/PRD.md', 'workspace:docs/platform/POLICY.md#shared-rule']);

  const report = await runTaskReadiness({ targetDir: project, task: 'shared-authority', stage: 'implement' });
  const source = sourceFinding(report);
  assert.equal(source.status, 'pass');
  assert.match(source.detail, /Explicit workspace governing reference\(s\): workspace:docs\/platform\/POLICY\.md/);

  const context = await createContextPack({ targetDir: project, task: 'shared-authority', mode: 'implement' });
  assert.ok(context.files.includes('docs/product/PRD.md'));
  assert.ok(context.files.includes('workspace:docs/platform/POLICY.md'));
  assert.equal(context.files.includes('workspace:docs/platform/UNRELATED.md'), false);
  assert.equal(context.files.includes('workspace:packages/web/docs/SIBLING.md'), false);
  assert.match(context.content, /Shared workspace rule: API changes preserve tenant boundaries\./);
  assert.doesNotMatch(context.content, /Do not auto-include me\./);
  assert.doesNotMatch(context.content, /Do not inherit sibling authority\./);
  assert.equal(context.content.includes(root), false);
});

test('workspace-qualified starter templates still trigger the existing readiness warning', async () => {
  const { root, project } = await workspaceFixture();
  await mkdir(path.join(root, 'docs', 'product'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'product', 'PRD.md'), '# Root PRD\n\nAuthority: ACCEPTED\n\nFR-001 — <Requirement name>\n', 'utf8');
  await writeTask(project, 'workspace-template', ['workspace:docs/product/PRD.md']);

  const report = await runTaskReadiness({ targetDir: project, task: 'workspace-template', stage: 'plan' });
  const source = sourceFinding(report);
  assert.equal(source.status, 'warn');
  assert.equal(source.title, 'Source of truth');
  assert.match(source.detail, /workspace:docs\/product\/PRD\.md/);
  assert.match(source.detail, /starter-template signals/);
});

test('workspace freshness rules match project-local governing authority rules', async () => {
  const { root, project } = await workspaceFixture();
  await writeTask(project, 'workspace-freshness', ['workspace:docs/platform/POLICY.md']);
  const policy = path.join(root, 'docs', 'platform', 'POLICY.md');

  await writeFile(policy, '# Shared platform policy\n\nAuthority: DRAFT\n\nDraft shared rule.\n', 'utf8');
  const plan = await runTaskReadiness({ targetDir: project, task: 'workspace-freshness', stage: 'plan' });
  assert.equal(sourceFinding(plan).status, 'pass');
  const implement = await runTaskReadiness({ targetDir: project, task: 'workspace-freshness', stage: 'implement' });
  assert.equal(sourceFinding(implement).status, 'fail');
  await assert.rejects(
    createContextPack({ targetDir: project, task: 'workspace-freshness', mode: 'implement' }),
    /workspace:docs\/platform\/POLICY\.md: Source-of-Truth authority is DRAFT/
  );

  await writeFile(policy, '# Shared platform policy\n\nAuthority: SUPERSEDED\n\nHistorical shared rule.\n', 'utf8');
  const superseded = await runTaskReadiness({ targetDir: project, task: 'workspace-freshness', stage: 'implement' });
  assert.equal(sourceFinding(superseded).status, 'fail');
  await assert.rejects(
    createContextPack({ targetDir: project, task: 'workspace-freshness', mode: 'review' }),
    /workspace:docs\/platform\/POLICY\.md: Source-of-Truth authority is SUPERSEDED; historical material cannot be included as governing Source of Truth/
  );
});

test('workspace reference fails clearly when selected project is outside Git', async () => {
  const project = await tempDir();
  await initProject({ targetDir: project, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeTask(project, 'non-git-workspace', ['workspace:docs/platform/POLICY.md']);

  const report = await runTaskReadiness({ targetDir: project, task: 'non-git-workspace', stage: 'plan' });
  assert.equal(sourceFinding(report).status, 'fail');
  assert.match(sourceFinding(report).detail, /workspace: Source-of-truth references require the selected VCP project to be inside an accessible Git worktree/);
  await assert.rejects(
    createContextPack({ targetDir: project, task: 'non-git-workspace', mode: 'plan' }),
    /workspace: Source-of-truth references require the selected VCP project to be inside an accessible Git worktree/
  );
});

test('workspace references reject traversal and filesystem symlink or junction escape', async () => {
  const { root, project } = await workspaceFixture();
  await assert.rejects(
    resolveWorkspaceSourceTruthReference(project, 'workspace:../outside.md'),
    /escapes the enclosing Git worktree/
  );

  const outside = await tempDir();
  await writeFile(path.join(outside, 'SECRET.md'), '# Outside\n\nAuthority: ACCEPTED\n', 'utf8');
  const link = path.join(root, 'linked-outside');
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(
    resolveWorkspaceSourceTruthReference(project, 'workspace:linked-outside/SECRET.md'),
    /escapes the enclosing Git worktree/
  );
});

test('workspace root discovery ignores ambient Git directory/worktree overrides', { concurrency: false }, async () => {
  const { root, project } = await workspaceFixture();
  const unrelated = await tempDir();
  await git(unrelated, 'init');
  const previousGitDir = process.env.GIT_DIR;
  const previousGitWorkTree = process.env.GIT_WORK_TREE;
  const previousGitCommonDir = process.env.GIT_COMMON_DIR;
  process.env.GIT_DIR = path.join(unrelated, '.git');
  process.env.GIT_WORK_TREE = unrelated;
  process.env.GIT_COMMON_DIR = path.join(unrelated, '.git');
  try {
    const resolved = await resolveWorkspaceSourceTruthReference(project, 'workspace:docs/platform/POLICY.md');
    assert.equal(resolved.relative, 'workspace:docs/platform/POLICY.md');
    assert.equal(resolved.workspaceRoot, await realpath(root));
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
    if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = previousGitWorkTree;
    if (previousGitCommonDir === undefined) delete process.env.GIT_COMMON_DIR;
    else process.env.GIT_COMMON_DIR = previousGitCommonDir;
  }
});

test('workspace qualifier is not a general cross-root include escape hatch', async () => {
  const { project } = await workspaceFixture();
  await writeTask(project, 'include-boundary', ['docs/product/PRD.md']);

  await assert.rejects(
    createContextPack({
      targetDir: project,
      task: 'include-boundary',
      mode: 'plan',
      includes: ['workspace:docs/platform/POLICY.md']
    }),
    /workspace: qualification is only supported for governing Task Pack Source-of-Truth references, not --include/
  );
});
