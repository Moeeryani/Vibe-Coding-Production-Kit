import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createContextPack } from '../lib/context.mjs';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { createTaskPack } from '../lib/task.mjs';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function commitAll(root, message) {
  await git(root, 'add', '-A');
  await git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-git-review-'));
  const target = path.join(root, 'app');
  await mkdir(target, { recursive: true });
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'bounded-review', title: 'Bounded review' });
  await mkdir(path.join(target, 'src'), { recursive: true });
  await writeFile(path.join(target, 'src', 'service.mjs'), 'export const value = 1;\n');
  await writeFile(path.join(root, 'outside.txt'), 'baseline\n');

  await git(root, 'init');
  await git(root, 'config', 'user.email', 'vcp@example.test');
  await git(root, 'config', 'user.name', 'VCP Test');
  const base = await commitAll(root, 'baseline');

  await writeFile(path.join(target, 'src', 'service.mjs'), 'export const value = 2;\n');
  await writeFile(path.join(root, 'outside.txt'), 'changed outside project\n');
  const head = await commitAll(root, 'change implementation and unrelated root file');

  return { root, target, base, head };
}

test('review context binds task and Source of Truth to an explicit Git base/head surface', async () => {
  const { target, base, head } = await fixture();
  const result = await createContextPack({
    targetDir: target,
    task: 'bounded-review',
    mode: 'review',
    gitBase: base,
    gitHead: head
  });

  assert.equal(result.gitReview.baseSha, base);
  assert.equal(result.gitReview.headSha, head);
  assert.equal(result.gitReview.projectFromGitRoot, 'app');
  assert.deepEqual(
    result.gitReview.changedFiles.map((item) => item.path).sort(),
    ['app/src/service.mjs', 'outside.txt']
  );
  assert.match(result.content, /## Git review surface/);
  assert.match(result.content, new RegExp(`Base: .*${base}`));
  assert.match(result.content, new RegExp(`Head: .*${head}`));
  assert.match(result.content, /app\/src\/service\.mjs/);
  assert.match(result.content, /outside\.txt/);
  assert.match(result.content, /changed outside project/);
  assert.match(result.content, /Referenced source of truth/);
  assert.match(result.content, /Git comparison .*2 changed files/);
});

test('review context surfaces dirty working-tree state separately from the committed comparison', async () => {
  const { root, target, base } = await fixture();
  await writeFile(path.join(root, 'scratch.txt'), 'not committed\n');

  const result = await createContextPack({
    targetDir: target,
    task: 'bounded-review',
    mode: 'review',
    gitBase: base
  });

  assert.equal(result.gitReview.headRef, 'HEAD');
  assert.equal(result.gitReview.dirty, true);
  assert.match(result.content, /Working tree state \(not part of the committed base\/head comparison\)/);
  assert.match(result.content, /scratch\.txt/);
});

test('Git comparison options are review-only, non-blank, and head requires an explicit base', async () => {
  const { target, base } = await fixture();

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'bounded-review', mode: 'implement', gitBase: base }),
    /only supported in review context mode/
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'bounded-review', mode: 'review', gitHead: 'HEAD' }),
    /--head requires --base/
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'bounded-review', mode: 'review', gitBase: '' }),
    /--base requires a value/
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'bounded-review', mode: 'review', gitBase: base, gitHead: '   ' }),
    /--head requires a value/
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'bounded-review', mode: 'review', gitBase: '  -c' }),
    /Review base must not start with "-": -c/
  );
});

test('invalid Git base fails visibly instead of producing an incomplete review surface', async () => {
  const { target } = await fixture();

  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'bounded-review',
      mode: 'review',
      gitBase: 'definitely-not-a-ref'
    }),
    /Review base could not be resolved/
  );
});

test('Git-aware review fails clearly outside a Git worktree', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-non-git-review-'));
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'bounded-review', title: 'Bounded review' });

  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'bounded-review',
      mode: 'review',
      gitBase: 'HEAD'
    }),
    /requires the project directory to be inside a Git worktree/
  );
});

test('Git review evidence counts against the existing context byte budget', async () => {
  const { target, base } = await fixture();
  const plain = await createContextPack({ targetDir: target, task: 'bounded-review', mode: 'review' });

  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'bounded-review',
      mode: 'review',
      gitBase: base,
      maxBytes: plain.bytes + 64
    }),
    /above the .*byte limit.*narrow the Git comparison/
  );
});

test('binary changes are identified by Git rather than represented as complete text content', async () => {
  const { root, target } = await fixture();
  const base = await git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(target, 'src', 'binary.bin'), Buffer.from([0, 1, 2, 0, 255, 4]));
  await commitAll(root, 'add binary');

  const result = await createContextPack({
    targetDir: target,
    task: 'bounded-review',
    mode: 'review',
    gitBase: base
  });

  assert.match(result.content, /binary\.bin/);
  assert.match(result.content, /Binary files .* differ/);
});

test('committed gitlink changes remain visible when repository config ignores submodules', async () => {
  const { root, target, base, head } = await fixture();
  await git(root, 'update-index', '--add', '--cacheinfo', `160000,${base},vendor/sub`);
  await git(root, 'commit', '-m', 'add gitlink');
  const comparisonBase = await git(root, 'rev-parse', 'HEAD');

  await git(root, 'update-index', '--cacheinfo', `160000,${head},vendor/sub`);
  await git(root, 'commit', '-m', 'move gitlink');
  await git(root, 'config', 'diff.ignoreSubmodules', 'all');

  const result = await createContextPack({
    targetDir: target,
    task: 'bounded-review',
    mode: 'review',
    gitBase: comparisonBase
  });

  assert.ok(result.gitReview.changedFiles.some((item) => item.path === 'vendor/sub'));
  assert.match(result.content, /vendor\/sub/);
  assert.match(result.content, /Subproject commit/);
});

test('context CLI forwards explicit Git base/head into review mode', async () => {
  const { target, base, head } = await fixture();
  const bin = path.resolve('bin/vibe-coding-production.mjs');
  const { stdout } = await execFileAsync(process.execPath, [
    bin,
    'context',
    'bounded-review',
    '--dir',
    target,
    '--mode',
    'review',
    '--base',
    base,
    '--head',
    head
  ], { encoding: 'utf8' });

  assert.match(stdout, /# VCP Context Pack — review/);
  assert.match(stdout, /## Git review surface/);
  assert.match(stdout, new RegExp(base));
  assert.match(stdout, new RegExp(head));
  assert.match(stdout, /outside\.txt/);
});

test('CLI rejects explicitly blank equals-form Git refs before command dispatch', async () => {
  const bin = path.resolve('bin/vibe-coding-production.mjs');

  await assert.rejects(
    execFileAsync(process.execPath, [bin, 'doctor', '--base='], { encoding: 'utf8' }),
    (error) => error.code === 1 && /--base requires a value/.test(error.stderr)
  );

  await assert.rejects(
    execFileAsync(process.execPath, [bin, 'context', 'anything', '--mode', 'review', '--head=   '], { encoding: 'utf8' }),
    (error) => error.code === 1 && /--head requires a value/.test(error.stderr)
  );
});
