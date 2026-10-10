import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { createContextPack } from '../lib/context.mjs';

const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-context-'));
}

test('context pack bundles task, repository rules, mode prompt, and source-of-truth documents', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'codex', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'accept-invite', title: 'Accept invitation' });

  const result = await createContextPack({ targetDir: target, task: 'accept-invite', mode: 'plan' });

  assert.equal(result.mode, 'plan');
  assert.ok(result.files.includes('AGENTS.md'));
  assert.ok(result.files.includes('prompts/02-plan-task.md'));
  assert.ok(result.files.includes('docs/tasks/accept-invite.md'));
  assert.ok(result.files.includes('docs/product/PRD.md'));
  assert.match(result.content, /# VCP Context Pack — plan/);
  assert.match(result.content, /## Execution prompt/);
  assert.match(result.content, /## Repository instructions/);
  assert.match(result.content, /## Referenced source of truth/);
});

test('context pack supports explicit includes and safe repository-local output', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'rotate-key' });
  await mkdir(path.join(target, 'src'), { recursive: true });
  await writeFile(path.join(target, 'src', 'key-service.md'), '# Existing key service\nPreserve rotation audit events.\n');

  const result = await createContextPack({
    targetDir: target,
    task: 'rotate-key',
    mode: 'review',
    includes: ['src/key-service.md'],
    output: '.vcp/context/rotate-key-review.md'
  });

  assert.equal(result.output, '.vcp/context/rotate-key-review.md');
  assert.ok(result.files.includes('src/key-service.md'));
  const written = await readFile(path.join(target, result.output), 'utf8');
  assert.match(written, /Prompt: Independent Code Review/);
  assert.match(written, /Preserve rotation audit events/);

  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'rotate-key',
      mode: 'review',
      output: '.vcp/context/rotate-key-review.md'
    }),
    /Refusing to overwrite existing context pack/
  );
});

test('implement context supports explicit planned paths for greenfield files', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'greenfield-service' });

  const result = await createContextPack({
    targetDir: target,
    task: 'greenfield-service',
    mode: 'implement',
    planned: ['src/service.mjs', 'test/service.test.mjs']
  });

  assert.deepEqual(result.planned, ['src/service.mjs', 'test/service.test.mjs']);
  assert.match(result.content, /## Planned implementation paths/);
  assert.match(result.content, /`src\/service\.mjs` — planned path/);
  assert.match(result.content, /`test\/service\.test\.mjs` — planned path/);
  assert.equal(result.files.includes('src/service.mjs'), false);
});

test('planned paths are implement-only and must not already exist', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'planned-guard' });
  await mkdir(path.join(target, 'src'), { recursive: true });
  await writeFile(path.join(target, 'src', 'existing.mjs'), 'export const value = 1;\n');

  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'planned-guard',
      mode: 'review',
      planned: ['src/future.mjs']
    }),
    /--planned is only supported in implement context mode/
  );

  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'planned-guard',
      mode: 'implement',
      planned: ['src/existing.mjs']
    }),
    /Planned path already exists: src\/existing\.mjs\. Use --include/
  );
});

test('context pack rejects repository escape paths and enforces the context budget', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'safe-context' });

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'safe-context', includes: ['../outside.md'] }),
    /escapes the repository root/
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'safe-context', mode: 'implement', planned: ['../future.mjs'] }),
    /escapes the repository root/
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'safe-context', maxBytes: 100 }),
    /above the 100-byte limit/
  );
});

test('context pack exposes portable slash-separated paths on every OS', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'portable-context' });

  const result = await createContextPack({
    targetDir: target,
    task: 'portable-context',
    mode: 'implement',
    planned: ['src/new-service.mjs']
  });
  assert.equal(result.task, 'docs/tasks/portable-context.md');
  assert.ok(result.files.every((relative) => !relative.includes('\\')));
  assert.ok(result.planned.every((relative) => !relative.includes('\\')));
  assert.match(result.content, /Task: `docs\/tasks\/portable-context\.md`/);
  assert.match(result.content, /Source: `prompts\/03-implement-task\.md`/);
});

test('context CLI emits a usable bounded pack with planned paths', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'context-cli' });

  const bin = path.resolve('bin/vibe-coding-production.mjs');
  const { stdout } = await execFileAsync(process.execPath, [
    bin,
    'context',
    'context-cli',
    '--dir',
    target,
    '--mode',
    'implement',
    '--planned',
    'src/context-cli.mjs'
  ]);
  assert.match(stdout, /# VCP Context Pack — implement/);
  assert.match(stdout, /Prompt: Implement an Approved Task/);
  assert.match(stdout, /docs\/tasks\/context-cli\.md/);
  assert.match(stdout, /src\/context-cli\.mjs/);
});
