import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { ignorePath, trackPath } from '../lib/manage.mjs';
import { applyUpdate, checkForUpdate, planUpdate, rollbackProject } from '../lib/update.mjs';

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

test('proven automatic generic install re-profiles when deterministic evidence appears', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });
  assert.equal((await manifest(root)).install.stack, 'generic');
  assert.equal((await manifest(root)).install.requestedStack, 'auto');

  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'now-javascript',
    scripts: { test: 'node --test' }
  }, null, 2)}\n`, 'utf8');

  const check = await checkForUpdate({ targetDir: root, fetchLatest: false });
  assert.equal(check.versionUpdateAvailable, false);
  assert.equal(check.updateAvailable, true);
  assert.equal(check.stackProfileChange.from, 'generic');
  assert.equal(check.stackProfileChange.to, 'javascript');

  const plan = await planUpdate({ targetDir: root });
  assert.equal(plan.stack, 'javascript');
  assert.equal(plan.stackProfileChange.from, 'generic');
  assert.equal(plan.stackProfileChange.to, 'javascript');
  assert.equal(plan.needsApply, true);
  assert.equal(plan.upToDate, false);

  const applied = await applyUpdate({ targetDir: root });
  assert.equal(applied.applied, true);
  assert.equal(applied.blocked, false);
  const updated = await manifest(root);
  assert.equal(updated.install.stack, 'javascript');
  assert.equal(updated.install.requestedStack, 'auto');
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /JavaScript \/ Node\.js stack profile/);

  const after = await planUpdate({ targetDir: root });
  assert.equal(after.stackProfileChange, null);
  assert.equal(after.upToDate, true);
});

test('automatic re-profiling does not overwrite a local verification-command decision', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });
  const agentsPath = path.join(root, 'AGENTS.md');
  const originalAgents = await readFile(agentsPath, 'utf8');
  assert.match(originalAgents, /UNIT_TEST_COMMAND=<define>/);
  const customizedAgents = originalAgents.replace(
    'UNIT_TEST_COMMAND=<define>',
    'UNIT_TEST_COMMAND=node custom-tests.mjs'
  );
  await writeFile(agentsPath, customizedAgents, 'utf8');
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'conflicting-js',
    scripts: { test: 'node --test' }
  }, null, 2)}\n`, 'utf8');

  const plan = await planUpdate({ targetDir: root });
  const agentsAction = plan.actions.find((item) => item.path === 'AGENTS.md');
  assert.equal(plan.stackProfileChange.to, 'javascript');
  assert.equal(agentsAction.type, 'CONFLICT');
  assert.equal(plan.conflicts > 0, true);

  const applied = await applyUpdate({ targetDir: root });
  assert.equal(applied.blocked, true);
  assert.equal(applied.applied, false);
  assert.equal((await manifest(root)).install.stack, 'generic');
  assert.equal((await manifest(root)).install.requestedStack, 'auto');
  assert.equal(await readFile(agentsPath, 'utf8'), customizedAgents);
});

test('explicit generic install stays generic when new stack evidence appears', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'explicit-generic' }, null, 2)}\n`, 'utf8');

  const check = await checkForUpdate({ targetDir: root, fetchLatest: false });
  assert.equal(check.stackProfileChange, null);
  assert.equal(check.updateAvailable, false);

  const plan = await planUpdate({ targetDir: root });
  assert.equal(plan.stack, 'generic');
  assert.equal(plan.stackProfileChange, null);
  assert.equal(plan.upToDate, true);
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
  assert.equal(plan.stackProfileChange, null);
  assert.equal(plan.migratedManifest.install.requestedStack, undefined);
});


async function addReactNativeEvidence(root, {
  scripts = { test: 'node --test', build: 'node scripts/build.mjs' },
  typeScript = false
} = {}) {
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name: 'lifecycle-react-native',
    dependencies: { 'react-native': '0.76.0' },
    scripts
  }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(root, 'app.json'), '{}\n', 'utf8');
  if (typeScript) await writeFile(path.join(root, 'tsconfig.json'), '{}\n', 'utf8');
}

test('auto-selected generic specializes transactionally to React Native and is idempotent', async () => {
  const root = await tempDir();
  await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });
  await addReactNativeEvidence(root);

  const check = await checkForUpdate({ targetDir: root, fetchLatest: false });
  assert.equal(check.updateAvailable, true);
  assert.deepEqual(
    { from: check.stackProfileChange.from, to: check.stackProfileChange.to },
    { from: 'generic', to: 'react-native' }
  );

  const plan = await planUpdate({ targetDir: root });
  assert.equal(plan.stack, 'react-native');
  assert.equal(plan.stackProfileChange.from, 'generic');
  assert.equal(plan.stackProfileChange.to, 'react-native');
  assert.equal(plan.conflicts, 0);

  const applied = await applyUpdate({ targetDir: root });
  assert.equal(applied.applied, true);
  assert.ok(applied.backupId);
  const updated = await manifest(root);
  assert.equal(updated.install.stack, 'react-native');
  assert.equal(updated.install.requestedStack, 'auto');
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /## 16\. React Native stack profile/);

  const after = await planUpdate({ targetDir: root });
  assert.equal(after.stackProfileChange, null);
  assert.equal(after.upToDate, true);

  const rolledBack = await rollbackProject({ targetDir: root, backupId: applied.backupId });
  assert.equal(rolledBack.restoredVersion, updated.installedVersion);
  assert.equal((await manifest(root)).install.stack, 'generic');
  assert.doesNotMatch(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /## 16\. React Native stack profile/);
});

test('auto-selected JavaScript and TypeScript specialize to React Native while retaining auto provenance', async () => {
  for (const prior of ['javascript', 'typescript']) {
    const root = await tempDir();
    await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: `prior-${prior}` }, null, 2)}\n`, 'utf8');
    if (prior === 'typescript') await writeFile(path.join(root, 'tsconfig.json'), '{}\n', 'utf8');
    await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });
    assert.equal((await manifest(root)).install.stack, prior);

    await mkdir(path.join(root, 'scripts'), { recursive: true });
    await writeFile(path.join(root, 'scripts', 'build.mjs'), 'process.exit(0);\n', 'utf8');
    await addReactNativeEvidence(root, { typeScript: prior === 'typescript' });

    const plan = await planUpdate({ targetDir: root });
    assert.equal(plan.stackProfileChange.from, prior);
    assert.equal(plan.stackProfileChange.to, 'react-native');
    assert.equal(plan.conflicts, 0);

    const applied = await applyUpdate({ targetDir: root });
    assert.equal(applied.applied, true);
    const updated = await manifest(root);
    assert.equal(updated.install.stack, 'react-native');
    assert.equal(updated.install.requestedStack, 'auto');
    assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /## 16\. React Native stack profile/);

    const again = await planUpdate({ targetDir: root });
    assert.equal(again.stackProfileChange, null);
    assert.equal(again.upToDate, true);
  }
});

test('explicit and legacy-unknown concrete selections do not specialize to React Native', async () => {
  const explicit = await tempDir();
  await writeFile(path.join(explicit, 'package.json'), `${JSON.stringify({ name: 'explicit-js' }, null, 2)}\n`, 'utf8');
  await initProject({ targetDir: explicit, agent: 'generic', stack: 'javascript', includeGitHub: false });
  await addReactNativeEvidence(explicit);
  assert.equal((await planUpdate({ targetDir: explicit })).stackProfileChange, null);
  assert.equal((await checkForUpdate({ targetDir: explicit, fetchLatest: false })).updateAvailable, false);

  const legacy = await tempDir();
  await writeFile(path.join(legacy, 'package.json'), `${JSON.stringify({ name: 'legacy-ts' }, null, 2)}\n`, 'utf8');
  await writeFile(path.join(legacy, 'tsconfig.json'), '{}\n', 'utf8');
  await initProject({ targetDir: legacy, agent: 'generic', stack: 'typescript', includeGitHub: false });
  const old = await manifest(legacy);
  delete old.install.requestedStack;
  await writeManifest(legacy, old);
  await addReactNativeEvidence(legacy, { typeScript: true });
  assert.equal((await planUpdate({ targetDir: legacy })).stackProfileChange, null);
});


test('auto-selected Go and Python profiles are not generalized into React Native specialization', async () => {
  const cases = [
    {
      stack: 'go',
      marker: 'go.mod',
      content: 'module example.com/mobile\n\ngo 1.24\n'
    },
    {
      stack: 'python',
      marker: 'pyproject.toml',
      content: '[project]\nname = "mobile"\n'
    }
  ];

  for (const item of cases) {
    const root = await tempDir();
    await addReactNativeEvidence(root);
    await writeFile(path.join(root, item.marker), item.content, 'utf8');
    await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });

    const installed = await manifest(root);
    assert.equal(installed.install.stack, item.stack);
    assert.equal(installed.install.requestedStack, 'auto');

    await rm(path.join(root, item.marker));
    const plan = await planUpdate({ targetDir: root });
    assert.equal(plan.stackProfileChange, null);
    assert.equal(plan.stack, item.stack);

    const check = await checkForUpdate({ targetDir: root, fetchLatest: false });
    assert.equal(check.stackProfileChange, null);
    assert.equal(check.updateAvailable, false);
  }
});

test('React Native specialization respects local AGENTS verification decisions and blocks on conflict', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'conflict-js' }, null, 2)}\n`, 'utf8');
  await initProject({ targetDir: root, agent: 'generic', stack: 'auto', includeGitHub: false });

  const agentsPath = path.join(root, 'AGENTS.md');
  const before = await readFile(agentsPath, 'utf8');
  const customized = before.replace('UNIT_TEST_COMMAND=<define>', 'UNIT_TEST_COMMAND=node custom-mobile-tests.mjs');
  await writeFile(agentsPath, customized, 'utf8');

  await addReactNativeEvidence(root, { scripts: { test: 'node --test' } });
  const plan = await planUpdate({ targetDir: root });
  assert.equal(plan.stackProfileChange.to, 'react-native');
  const agentsAction = plan.actions.find((item) => item.path === 'AGENTS.md');
  assert.equal(agentsAction.type, 'CONFLICT');

  const applied = await applyUpdate({ targetDir: root });
  assert.equal(applied.blocked, true);
  assert.equal(applied.applied, false);
  assert.equal((await manifest(root)).install.stack, 'javascript');
  assert.equal(await readFile(agentsPath, 'utf8'), customized);
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
  assert.equal((await manifest(root)).installedVersion, '0.9.3');
  assert.ok(applied.backupId);

  const rolledBack = await rollbackProject({ targetDir: root, backupId: applied.backupId });
  assert.equal(rolledBack.restoredVersion, '0.8.0');
  assert.equal((await manifest(root)).installedVersion, '0.8.0');
});
