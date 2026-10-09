import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readdir, symlink, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { planSmartInit, detectAdoptionStack } from '../lib/adoption-plan.mjs';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('new root yields zero-write greenfield plan with unapproved CLAIM actions', async t => {
  const root = await fixture(t), plan = await planSmartInit(root);
  assert.equal(plan.planVersion, 1);
  assert.equal(plan.planKind, 'init');
  assert.equal(plan.assetSet, 'greenfield-safe-v1');
  assert.equal(plan.actions.length, 3);
  assert.ok(plan.actions.every(a => a.action === 'CLAIM' && !a.executionAuthorized));
  assert.deepEqual(await readdir(root), []);
});

test('existing unmanaged content is only skipped, never adopted or overwritten', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'AGENTS.md'), 'CUSTOM\r\nBYTES');
  const before = await readFile(path.join(root, 'AGENTS.md'));
  const plan = await planSmartInit(root);
  assert.equal(plan.classification, 'EXISTING');
  assert.equal(plan.assetSet, 'brownfield-minimal-v1');
  assert.equal(plan.skippedPaths.length, 1);
  assert.equal(plan.skippedPaths[0].path, 'AGENTS.md');
  assert.ok(plan.humanDecisionRequired);
  assert.deepEqual(await readFile(path.join(root, 'AGENTS.md')), before);
  assert.deepEqual(await readdir(root), ['AGENTS.md']);
});

test('ambiguous JS/Python root reports generic and competing evidence', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'package.json'), '{}');
  await writeFile(path.join(root, 'pyproject.toml'), '');
  const result = await detectAdoptionStack(root);
  assert.equal(result.stack, 'generic');
  assert.equal(result.polyglot, true);
  assert.equal(result.decisionRequired, true);
  assert.equal(result.evidence.length, 2);
  const plan = await planSmartInit(root);
  assert.equal(plan.stack, 'generic');
  assert.equal(plan.humanDecisionRequired, true);
  assert.equal(plan.assetSet, 'brownfield-minimal-v1');
  assert.ok(plan.actions.every(a => !a.executionAuthorized));
});

test('JS/TS marker family resolves TypeScript deterministically', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'package.json'), '{}');
  await writeFile(path.join(root, 'tsconfig.json'), '{}');
  const result = await detectAdoptionStack(root);
  assert.equal(result.stack, 'typescript');
  assert.equal(result.polyglot, false);
});

test('symlinked source evidence fails closed without reading outside root', async t => {
  if (process.platform === 'win32') t.skip('Native Windows junction test pending');
  const root = await fixture(t);
  await symlink('/etc/hosts', path.join(root, 'pyproject.toml'));
  const plan = await planSmartInit(root);
  assert.equal(plan.blocked, true);
  assert.equal(plan.reason, 'UNSAFE_PROJECT_PATH');
});

test('managed v1 root blocks init plan and remains intact', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.vcp'));
  const bytes = JSON.stringify({ schemaVersion: 1, installedVersion: '0.9.3', install: {}, managedFiles: {} });
  await writeFile(path.join(root, '.vcp/manifest.json'), bytes);
  const plan = await planSmartInit(root);
  assert.equal(plan.blocked, true);
  assert.equal(plan.reason, 'ALREADY_MANAGED_USE_UPDATE');
  assert.equal(await readFile(path.join(root, '.vcp/manifest.json'), 'utf8'), bytes);
});
