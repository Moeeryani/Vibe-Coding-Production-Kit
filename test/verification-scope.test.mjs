import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject } from '../lib/init.mjs';
import { runVerification } from '../lib/verify.mjs';

const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-verification-scope-'));
}

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function commitAll(root, message) {
  await git(root, 'add', '-A');
  await git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

async function writeReadyTask(target, slug, command = 'node -e "process.exit(0)"') {
  const dir = path.join(target, 'docs', 'tasks');
  await mkdir(dir, { recursive: true });
  const content = `# Task — Verification scope fixture

## Outcome

Verify one bounded project with durable workspace-aware evidence.

## Source of truth

| Source | Reference |
|---|---|
| Product / PRD | \`docs/product/PRD.md\` |
| Security | \`docs/security/THREAT-MODEL.md\` |

## Acceptance criteria

- [ ] AC-001 — The configured verification command exits successfully.

## Scope

### In scope
- Verification scope and provenance evidence.

### Out of scope
- Deployment and remote CI APIs.

## Affected boundaries

- Modules/files likely affected: verification runner.
- Public API/contract impact: additive evidence metadata only.
- Data/schema/migration impact: evidence schema v2; existing evidence remains historical input.
- External integration impact: n/a — local Git inspection only when available.

## Domain invariants

Verification commands execute from the selected VCP project root; Git workspace discovery does not expand path authority.

## Security and privacy

- Authentication impact: n/a — local developer tool.
- Authorization/resource ownership: n/a — local developer tool.
- Tenant isolation: n/a — local developer tool.
- Input/trust boundaries: repository-controlled commands execute only after explicit --run.
- Secrets/PII/logging: raw stdout/stderr are not persisted in evidence by default.
- Abuse/rate/replay considerations: commands execute sequentially and stop after a failure.
- Relevant threat IDs: n/a — local workflow tooling.

## Failure modes and edge cases

- Project is not in Git.
- Project is nested below the Git worktree root.
- Worktree is dirty before verification.

## Observability

Record project/workspace scope, Git revision when available, command result, duration, and exit status.

## Test plan

### Unit
- Inspect project-only and Git-backed scope metadata.

### Integration / contract
- Execute a command from a nested selected project root.

### E2E / regression
- Persist the same evidence shape regardless of local or CI execution environment.

### Negative/security paths
- Workspace discovery never changes the selected project root or output boundary.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive evidence fields; historical v1 evidence remains valid.
- Migration/backfill: none; do not rewrite historical evidence.
- Rollback or recovery: remove additive provenance fields and retain existing verification behavior.

## Implementation plan

1. Inspect the enclosing Git worktree without changing project ownership.
2. Add portable project path and Git revision metadata to evidence.
3. Preserve non-Git verification behavior.

## Verification commands

- \`UNIT_TEST_COMMAND\`: \`${command}\`
`;
  await writeFile(path.join(dir, `${slug}.md`), content, 'utf8');
}

async function initializedProject(target, slug, command) {
  await mkdir(target, { recursive: true });
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, slug, command);
}

test('non-Git verification preserves execution and reports project-only scope', async () => {
  const target = await tempDir();
  await initializedProject(target, 'non-git');

  const report = await runVerification({ targetDir: target, task: 'non-git', run: true, quiet: true });

  assert.equal(report.schemaVersion, 2);
  assert.equal(report.target, path.resolve(target));
  assert.deepEqual(report.scope, { kind: 'project', projectPath: '.' });
  assert.equal(report.revision, null);
  assert.equal(report.success, true);
});

test('Git workspace root project is represented by portable dot project path', async () => {
  const root = await tempDir();
  await initializedProject(root, 'root-project');
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'vcp@example.test');
  await git(root, 'config', 'user.name', 'VCP Test');
  const head = await commitAll(root, 'baseline');

  const report = await runVerification({ targetDir: root, task: 'root-project', run: true, quiet: true });

  assert.deepEqual(report.scope, { kind: 'git-worktree', projectPath: '.' });
  assert.deepEqual(report.revision, { system: 'git', headSha: head, dirty: false });
});

test('nested project verification runs in selected project root and persists workspace-relative evidence', async () => {
  const root = await tempDir();
  const target = path.join(root, 'packages', 'api');
  const command = `node -e "process.exit(require('node:path').basename(process.cwd()) === 'api' ? 0 : 9)"`;
  await initializedProject(target, 'nested-project', command);
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'vcp@example.test');
  await git(root, 'config', 'user.name', 'VCP Test');
  const head = await commitAll(root, 'nested baseline');

  const report = await runVerification({
    targetDir: target,
    task: 'nested-project',
    run: true,
    quiet: true,
    output: '.vcp/evidence/nested-project.json'
  });
  const evidence = JSON.parse(await readFile(path.join(target, '.vcp', 'evidence', 'nested-project.json'), 'utf8'));

  assert.equal(report.success, true);
  assert.deepEqual(report.scope, { kind: 'git-worktree', projectPath: 'packages/api' });
  assert.equal(report.revision.headSha, head);
  assert.equal(report.revision.dirty, false);
  assert.deepEqual(evidence.scope, report.scope);
  assert.deepEqual(evidence.revision, report.revision);
  await assert.rejects(readFile(path.join(root, '.vcp', 'evidence', 'nested-project.json'), 'utf8'), /ENOENT/);
});

test('Git-backed evidence records dirty state before verification without blocking execution', async () => {
  const root = await tempDir();
  const target = path.join(root, 'packages', 'worker');
  await initializedProject(target, 'dirty-project');
  await git(root, 'init');
  await git(root, 'config', 'user.email', 'vcp@example.test');
  await git(root, 'config', 'user.name', 'VCP Test');
  const head = await commitAll(root, 'clean baseline');
  await writeFile(path.join(root, 'scratch.txt'), 'uncommitted\n');

  const report = await runVerification({ targetDir: target, task: 'dirty-project', run: true, quiet: true });

  assert.equal(report.success, true);
  assert.equal(report.revision.headSha, head);
  assert.equal(report.revision.dirty, true);
});
