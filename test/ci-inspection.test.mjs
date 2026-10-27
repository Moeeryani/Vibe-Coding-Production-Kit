import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectProjectCI } from '../lib/ci-inspection.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-inspect-'));
  const put = async (relative, content) => {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), content);
  };
  try { await run({ root, put }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('CI inspection: absent configurations are not assumed broken', async () => fixture(async ({ root }) => {
  const result = await inspectProjectCI(root);
  assert.equal(result.providerStatus, 'not-detected');
  assert.deepEqual(result.providers, []);
  assert.equal(result.gateIntegration, 'not-observed');
  assert.equal(result.verificationCoverage, 'unassessed');
  assert.equal(result.requiredChecks, 'unassessed');
}));

test('CI inspection: multiple providers remain evidence, not claimed coverage', async () => fixture(async ({ root, put }) => {
  await put('.github/workflows/check.yml', 'jobs:\n  check:\n    steps: []\n');
  await put('.gitlab-ci.yml', 'stages: [test]\n');
  await put('azure-pipelines.yaml', 'trigger: none\n');
  const result = await inspectProjectCI(root);
  assert.deepEqual(result.providers, ['azure-pipelines', 'github-actions', 'gitlab-ci']);
  assert.equal(result.providerStatus, 'detected');
  assert.equal(result.verificationCoverage, 'unassessed');
  assert.equal(result.gateIntegration, 'not-observed');
}));

test('CI inspection: VCP gate text is not treated as execution evidence', async () => fixture(async ({ root, put }) => {
  await put('.circleci/config.yml', 'steps:\n  - run: npx vcp gate my-task --run\n');
  const result = await inspectProjectCI(root);
  assert.equal(result.gateIntegration, 'text-observed');
  assert.equal(result.executionStatus, 'unassessed');
  assert.equal(result.requiredChecks, 'unassessed');
}));

test('CI inspection: custom CI is not an error', async () => fixture(async ({ root, put }) => {
  await put('Jenkinsfile', 'pipeline {}');
  const result = await inspectProjectCI(root);
  assert.deepEqual(result.providers, ['custom-ci']);
  assert.equal(result.issues.length, 0);
}));

test('CI inspection: linked workflow directory is never traversed', async (t) => {
  await fixture(async ({ root, put }) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'vcp-ci-outside-'));
    try {
      await put('README.md', 'safe');
      await mkdir(path.join(root, '.github'), { recursive: true });
      try { await symlink(outside, path.join(root, '.github/workflows'), 'dir'); }
      catch (e) { if (['EPERM','EACCES','ENOTSUP'].includes(e.code)) return t.skip('symlink privileges unavailable'); throw e; }
      const result = await inspectProjectCI(root);
      assert.equal(result.providerStatus, 'unassessed');
      assert.ok(result.issues.includes('UNSAFE_WORKFLOW_DIRECTORY'));
      assert.deepEqual(result.providers, []);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});

test('CI inspection: oversized workflow cannot grant a coverage claim', async () => fixture(async ({ root, put }) => {
  await put('.github/workflows/huge.yml', 'x'.repeat(300_000));
  const result = await inspectProjectCI(root);
  assert.equal(result.providerStatus, 'unassessed');
  assert.equal(result.gateIntegration, 'unknown');
  assert.equal(result.verificationCoverage, 'unassessed');
  assert.ok(result.issues.includes('UNSAFE_OR_UNREADABLE_CI_CONFIG'));
}));
