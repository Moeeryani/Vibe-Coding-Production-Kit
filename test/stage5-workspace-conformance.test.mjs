import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const sourceFixture = path.join(repoRoot, 'examples', 'reference-workspace-monorepo');
const promptNames = ['02-plan-task.md', '03-implement-task.md', '04-code-review.md'];

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function runVcp(args) {
  return execFileAsync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

async function expectVcpFailure(args, pattern) {
  try {
    await runVcp(args);
    assert.fail(`Expected VCP command to fail: ${args.join(' ')}`);
  } catch (error) {
    const output = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n');
    assert.match(output, pattern);
  }
}

async function freshWorkspace() {
  const container = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage5-workspace-'));
  const root = path.join(container, 'workspace');
  await cp(sourceFixture, root, { recursive: true });

  await git(root, 'init');
  await git(root, 'config', 'user.email', 'vcp-stage5@example.test');
  await git(root, 'config', 'user.name', 'VCP Stage 5');
  await git(root, 'add', '-A');
  await git(root, 'commit', '-m', 'fixture baseline');

  return {
    root,
    project: path.join(root, 'packages', 'orders-api'),
    baseline: await git(root, 'rev-parse', 'HEAD')
  };
}

test('workspace fixture prompt snapshots remain canonical', async () => {
  for (const name of promptNames) {
    const canonical = await readFile(path.join(repoRoot, 'prompts', name), 'utf8');
    const snapshot = await readFile(path.join(sourceFixture, 'packages', 'orders-api', 'prompts', name), 'utf8');
    assert.equal(snapshot, canonical, `${name} drifted from the canonical prompt`);
  }
});

test('fresh workspace checkout reconstructs bounded package context, verification evidence, and root-aware review', async () => {
  const { root, project, baseline } = await freshWorkspace();

  const readyResult = await runVcp([
    'ready',
    'format-order-id',
    '--dir',
    project,
    '--stage',
    'implement',
    '--json'
  ]);
  const ready = JSON.parse(readyResult.stdout);
  assert.equal(ready.summary.fail, 0);

  for (const mode of ['plan', 'implement']) {
    const context = await runVcp([
      'context',
      'format-order-id',
      '--dir',
      project,
      '--mode',
      mode
    ]);
    assert.match(context.stdout, /ORDERS-LOCAL-AUTHORITY/);
    assert.match(context.stdout, /SHARED-WORKSPACE-AUTHORITY/);
    assert.match(context.stdout, /workspace:docs\/platform\/SHARED-ORDER-POLICY\.md/);
    assert.doesNotMatch(context.stdout, /UNRELATED-ROOT-SENTINEL/);
    assert.doesNotMatch(context.stdout, /SIBLING-PACKAGE-SENTINEL/);
  }

  await runVcp([
    'verify',
    'format-order-id',
    '--dir',
    project,
    '--run',
    '--output',
    '.vcp/evidence/format-order-id.json',
    '--json'
  ]);

  const evidence = JSON.parse(await readFile(
    path.join(project, '.vcp', 'evidence', 'format-order-id.json'),
    'utf8'
  ));

  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.success, true);
  assert.deepEqual(evidence.scope, {
    kind: 'git-worktree',
    projectPath: 'packages/orders-api'
  });
  assert.deepEqual(evidence.revision, {
    system: 'git',
    headSha: baseline,
    dirty: false
  });
  assert.equal(evidence.commands.every((command) => command.status === 'pass'), true);
  await assert.rejects(
    readFile(path.join(root, '.vcp', 'evidence', 'format-order-id.json'), 'utf8'),
    /ENOENT/
  );

  await rm(path.join(project, '.vcp'), { recursive: true, force: true });

  const sharedPath = path.join(root, 'docs', 'platform', 'SHARED-ORDER-POLICY.md');
  const shared = await readFile(sharedPath, 'utf8');
  await writeFile(
    sharedPath,
    `${shared.trimEnd()}\n\nReview marker: ROOT-WORKSPACE-CHANGE-VISIBLE\n`,
    'utf8'
  );
  await git(root, 'add', 'docs/platform/SHARED-ORDER-POLICY.md');
  await git(root, 'commit', '-m', 'adjust shared workspace policy');
  const head = await git(root, 'rev-parse', 'HEAD');

  const review = await runVcp([
    'context',
    'format-order-id',
    '--dir',
    project,
    '--mode',
    'review',
    '--base',
    baseline,
    '--head',
    head
  ]);

  assert.match(review.stdout, /## Git review surface/);
  assert.match(review.stdout, /docs\/platform\/SHARED-ORDER-POLICY\.md/);
  assert.match(review.stdout, /ROOT-WORKSPACE-CHANGE-VISIBLE/);
  assert.doesNotMatch(review.stdout, /UNRELATED-ROOT-SENTINEL/);
  assert.doesNotMatch(review.stdout, /SIBLING-PACKAGE-SENTINEL/);
});

test('realistic nested project path boundaries reject sibling, root-output, and workspace traversal escapes', async () => {
  const { project } = await freshWorkspace();

  await expectVcpFailure([
    'context',
    'format-order-id',
    '--dir',
    project,
    '--mode',
    'implement',
    '--include',
    '../billing-worker/docs/product/PRD.md'
  ], /escapes|outside/i);

  await expectVcpFailure([
    'context',
    'format-order-id',
    '--dir',
    project,
    '--mode',
    'implement',
    '--planned',
    '../billing-worker/src/generated.mjs'
  ], /escapes|outside/i);

  await expectVcpFailure([
    'context',
    'format-order-id',
    '--dir',
    project,
    '--mode',
    'plan',
    '--output',
    '../workspace-context.md'
  ], /escapes|outside/i);

  const canonicalTask = await readFile(
    path.join(project, 'docs', 'tasks', 'format-order-id.md'),
    'utf8'
  );
  const escapedTask = canonicalTask
    .replace('Slug: `format-order-id`', 'Slug: `workspace-escape`')
    .replace(
      'workspace:docs/platform/SHARED-ORDER-POLICY.md',
      'workspace:../outside.md'
    );
  await writeFile(
    path.join(project, 'docs', 'tasks', 'workspace-escape.md'),
    escapedTask,
    'utf8'
  );

  await expectVcpFailure([
    'context',
    'workspace-escape',
    '--dir',
    project,
    '--mode',
    'plan'
  ], /escapes the enclosing Git worktree/i);
});
