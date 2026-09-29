import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { ignorePath, trackPath } from '../lib/manage.mjs';
import { applyUpdate, planUpdate, rollbackProject } from '../lib/update.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-update-'));
}

async function manifest(root) {
  return JSON.parse(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'));
}

async function writeManifest(root, value) {
  await writeFile(path.join(root, '.vcp/manifest.json'), `${JSON.stringify(value, null, 2)}\n`);
}

test('fresh auto install records requested stack separately from resolved stack', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'fixture' }, null, 2)}\n`, 'utf8');
  await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });

  const installed = await manifest(root);
  assert.equal(installed.install.stack, 'javascript');
  assert.equal(installed.install.requestedStack, 'auto');
});

test('fresh v0.9 install is update-idempotent', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  assert.equal((await manifest(root)).install.requestedStack, 'generic');
  const plan = await planUpdate({ targetDir: root });
  assert.equal(plan.upToDate, true);
  assert.equal(plan.conflicts, 0);
  assert.equal(plan.changes, 0);
});

test('legacy generic install with unknown stack provenance stays generic', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'legacy-js' }, null, 2)}\n`, 'utf8');
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });

  const oldManifest = await manifest(root);
  delete oldManifest.install.requestedStack;
  oldManifest.installedVersion = '0.9.0';
  for (const entry of Object.values(oldManifest.managedFiles)) entry.templateVersion = '0.9.0';
  await writeManifest(root, oldManifest);

  const plan = await planUpdate({ targetDir: root });
  assert.equal(plan.stack, 'generic');
  assert.equal(plan.migratedManifest.install.requestedStack, undefined);
});

test('local AGENTS edits are preserved on same-version planning', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agents = path.join(root, 'AGENTS.md');
  await writeFile(agents, `${await readFile(agents, 'utf8')}\n## Local rule\nKeep this line.\n`);
  const plan = await planUpdate({ targetDir: root });
  const action = plan.actions.find((item) => item.path === 'AGENTS.md');
  assert.equal(action.type, 'PRESERVE');
  assert.equal(plan.conflicts, 0);
});

test('manage ignore and track change ownership without deleting local content', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const agents = path.join(root, 'AGENTS.md');
  const before = await readFile(agents, 'utf8');
  await ignorePath({ targetDir: root, relativePath: 'AGENTS.md' });
  assert.equal((await manifest(root)).ignoredFiles.includes('AGENTS.md'), true);
  assert.equal(await readFile(agents, 'utf8'), before);
  await trackPath({ targetDir: root, relativePath: 'AGENTS.md' });
  assert.equal((await manifest(root)).ignoredFiles.includes('AGENTS.md'), false);
  assert.equal(await readFile(agents, 'utf8'), before);
});

test('doctor fails when an existing VCP manifest is corrupted', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(root, '.vcp/manifest.json'), '{ definitely not json\n', 'utf8');

  const report = await runDoctor(root);
  const updateState = report.checks.find((item) => item.id === 'update-state');
  assert.equal(updateState.status, 'fail');
  assert.ok(report.summary.fail > 0);
});

test('doctor fails when update transaction state is corrupted', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(root, '.vcp/transaction.json'), '{ broken transaction\n', 'utf8');

  const report = await runDoctor(root);
  const transaction = report.checks.find((item) => item.id === 'update-transaction');
  assert.equal(transaction.status, 'fail');
  assert.match(transaction.detail, /Cannot read update transaction/);
});

test('doctor fails when an interrupted update transaction is present', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(root, '.vcp/transaction.json'), `${JSON.stringify({
    schemaVersion: 1,
    id: 'interrupted-1',
    backupId: 'backup-1',
    fromVersion: '0.8.0',
    toVersion: '0.9.0',
    phase: 'applying',
    startedAt: '2026-09-23T00:00:00.000Z'
  }, null, 2)}\n`, 'utf8');

  const report = await runDoctor(root);
  const transaction = report.checks.find((item) => item.id === 'update-transaction');
  assert.equal(transaction.status, 'fail');
  assert.match(transaction.detail, /Incomplete VCP update transaction/);
});

test('0.8 manifest migrates transactionally to the current 0.9 release and can roll back', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const oldManifest = await manifest(root);
  oldManifest.installedVersion = '0.8.0';
  for (const entry of Object.values(oldManifest.managedFiles)) entry.templateVersion = '0.8.0';
  await writeManifest(root, oldManifest);

  const applied = await applyUpdate({ targetDir: root });
  assert.equal(applied.applied, true);
  assert.equal(applied.blocked, false);
  assert.equal((await manifest(root)).installedVersion, '0.9.2');
  assert.ok(applied.backupId);

  const rolledBack = await rollbackProject({ targetDir: root, backupId: applied.backupId });
  assert.equal(rolledBack.restoredVersion, '0.8.0');
  assert.equal((await manifest(root)).installedVersion, '0.8.0');
});
