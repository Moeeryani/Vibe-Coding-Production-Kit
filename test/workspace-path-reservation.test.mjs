import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContextPack } from '../lib/context.mjs';
import { initProject } from '../lib/init.mjs';

async function fixture() {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-workspace-path-'));
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await mkdir(path.join(target, 'docs', 'tasks'), { recursive: true });
  await writeFile(
    path.join(target, 'docs', 'tasks', 'reserved-workspace-path.md'),
    '# Task — Reserved workspace path\n\n## Outcome\n\nKeep the workspace qualifier reserved for governing Source-of-Truth references.\n\n## Source of truth\n',
    'utf8'
  );
  return target;
}

test('workspace qualifier is rejected for planned project-local paths', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'implement',
      planned: ['workspace:src/new-module.mjs']
    }),
    /Planned path does not support workspace: qualification/
  );
});

test('workspace qualifier is rejected for output project-local paths', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'plan',
      output: 'workspace:docs/PACK.md',
      dryRun: true
    }),
    /Output path does not support workspace: qualification/
  );
});
