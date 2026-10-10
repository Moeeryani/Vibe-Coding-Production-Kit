import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContextPack } from '../lib/context.mjs';
// Test-only preinstalled historical v1 state; production init stays fenced.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';

async function fixture() {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-workspace-path-reservation-'));
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(target, 'docs', 'tasks', 'reserved-workspace-path.md'), `# Task — Reserved workspace path fixture

## Source of truth

| Source | Reference |
|---|---|
| Product | \`docs/product/PRD.md\` |
`, 'utf8');
  return target;
}

test('workspace qualifier is rejected for planned project-local paths', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'implement',
      planned: ['workspace:docs/new-file.md']
    }),
    /Planned path does not support workspace: qualification\./
  );
});

test('leading whitespace cannot bypass workspace qualifier rejection for planned paths', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'implement',
      planned: [' workspace:docs/new-file.md']
    }),
    /Planned path does not support workspace: qualification\./
  );
});

test('workspace qualifier is rejected for project-local output paths', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'plan',
      output: 'workspace:docs/context.md',
      dryRun: true
    }),
    /Output path does not support workspace: qualification\./
  );
});

test('leading whitespace cannot bypass workspace qualifier rejection for output paths', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'plan',
      output: ' workspace:docs/context.md',
      dryRun: true
    }),
    /Output path does not support workspace: qualification\./
  );
});

test('leading whitespace preserves the dedicated workspace include refusal', async () => {
  const target = await fixture();
  await assert.rejects(
    createContextPack({
      targetDir: target,
      task: 'reserved-workspace-path',
      mode: 'plan',
      includes: [' workspace:docs/context.md']
    }),
    /workspace: qualification is only supported for governing Task Pack Source-of-Truth references, not --include\./
  );
});
