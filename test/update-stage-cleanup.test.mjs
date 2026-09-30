import assert from 'node:assert/strict';
import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { applyUpdate, rollbackProject } from '../lib/update.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-stage-cleanup-'));
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function appliedFixture() {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'stage-cleanup-fixture',
    scripts: { test: 'node --test' }
  }, null, 2)}\n`, 'utf8');

  const applied = await applyUpdate({ targetDir: root });
  assert.equal(applied.applied, true);
  assert.ok(applied.backupId);
  return { root, applied };
}

test('successful update removes its stage subtree and the empty stage directory', async () => {
  const { root } = await appliedFixture();
  assert.equal(await exists(path.join(root, '.vcp', 'stage')), false);
});

test('interrupted-update rollback removes its staged subtree and empty stage directory', async () => {
  const { root, applied } = await appliedFixture();
  const stageRoot = path.join(root, '.vcp', 'stage', applied.backupId);
  await mkdir(stageRoot, { recursive: true });
  await writeFile(path.join(stageRoot, 'partial.txt'), 'staged but not applied\n', 'utf8');
  await writeFile(path.join(root, '.vcp', 'transaction.json'), `${JSON.stringify({
    schemaVersion: 1,
    id: applied.backupId,
    backupId: applied.backupId,
    fromVersion: '0.9.2',
    toVersion: '0.9.2',
    phase: 'applying',
    startedAt: new Date().toISOString()
  }, null, 2)}\n`, 'utf8');

  const rolledBack = await rollbackProject({ targetDir: root });
  assert.equal(rolledBack.recoveredInterruptedUpdate, true);
  assert.equal(await exists(path.join(root, '.vcp', 'stage')), false);
});

test('stage cleanup never sweeps unrelated non-empty stage content', async () => {
  const { root, applied } = await appliedFixture();
  const unrelated = path.join(root, '.vcp', 'stage', 'unrelated');
  await mkdir(unrelated, { recursive: true });
  await writeFile(path.join(unrelated, 'keep.txt'), 'keep\n', 'utf8');

  await rollbackProject({ targetDir: root, backupId: applied.backupId });

  assert.equal(await exists(path.join(unrelated, 'keep.txt')), true);
  assert.equal(await exists(path.join(root, '.vcp', 'stage')), true);
});
