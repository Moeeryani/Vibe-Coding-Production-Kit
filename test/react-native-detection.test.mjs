import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { createContextPack } from '../lib/context.mjs';
import { formatDoctorReport, runDoctor } from '../lib/doctor.mjs';
import { initProject } from '../lib/init.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { runVerification } from '../lib/verify.mjs';
import {
  applyStackProfileToContent,
  detectStack,
  isSensitiveMobileVerificationScript,
  STACK_CHOICES
} from '../lib/stacks.mjs';

const repoRoot = path.resolve('.');
const firstPartyFixture = path.join(repoRoot, 'examples', 'mobile-react-native');
const baseAgents = await readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8');
const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-react-native-'));
}

async function writePackage(target, value) {
  await writeFile(path.join(target, 'package.json'), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function addMarker(target, marker) {
  if (marker === 'android' || marker === 'ios') {
    await mkdir(path.join(target, marker), { recursive: true });
  } else {
    await writeFile(path.join(target, marker), '{}\n', 'utf8');
  }
}

async function addReactNativeEvidence(target, {
  marker = 'app.json',
  scripts = undefined,
  typeScript = false
} = {}) {
  const pkg = {
    name: 'react-native-fixture',
    dependencies: { 'react-native': '0.76.0' }
  };
  if (scripts) pkg.scripts = scripts;
  await writePackage(target, pkg);
  await addMarker(target, marker);
  if (typeScript) await writeFile(path.join(target, 'tsconfig.json'), '{}\n', 'utf8');
}

async function removeRequestedStack(target) {
  const manifestPath = path.join(target, '.vcp/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.install.requestedStack;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

test('react-native is an explicit supported stack and generates its first-party profile without Go fallthrough', async () => {
  assert.ok(STACK_CHOICES.includes('react-native'));
  const target = await tempDir();
  await addReactNativeEvidence(target, {
    scripts: {
      lint: 'node --check src/app.js',
      test: 'node --test',
      build: 'node scripts/build.mjs'
    }
  });

  const result = await initProject({
    targetDir: target,
    agent: 'generic',
    stack: 'react-native',
    includeGitHub: false
  });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'react-native');
  assert.match(agents, /## 16\. React Native stack profile/);
  assert.match(agents, /UNIT_TEST_COMMAND=npm run test/);
  assert.match(agents, /BUILD_COMMAND=npm run build/);
  assert.match(agents, /signing keys, keystores, certificates/);
  assert.match(agents, /separate HUMAN DECISION/);
  assert.doesNotMatch(agents, /## 16\. Go stack profile/);
  assert.doesNotMatch(agents, /LINT_COMMAND=go vet/);
});


test('explicit JavaScript selection is preserved even when React Native evidence is present', async () => {
  const target = await tempDir();
  await addReactNativeEvidence(target, { typeScript: true });

  const result = await initProject({
    targetDir: target,
    agent: 'generic',
    stack: 'javascript',
    includeGitHub: false
  });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'javascript');
  assert.match(agents, /## 16\. JavaScript \/ Node\.js stack profile/);
  assert.doesNotMatch(agents, /## 16\. React Native stack profile/);
});

test('React Native detection accepts every canonical application marker', async () => {
  for (const marker of ['android', 'ios', 'app.json', 'app.config.js', 'app.config.cjs', 'app.config.mjs', 'app.config.ts']) {
    const target = await tempDir();
    await addReactNativeEvidence(target, { marker });
    assert.equal(await detectStack(target), 'react-native', marker);
  }
});

test('TypeScript React Native specializes before TypeScript and maps configured fixture verification', async () => {
  assert.equal(await detectStack(firstPartyFixture), 'react-native');

  const result = await applyStackProfileToContent(firstPartyFixture, 'auto', baseAgents);
  assert.equal(result.stack, 'react-native');
  assert.match(result.content, /FORMAT_CHECK_COMMAND=npm run format:check/);
  assert.match(result.content, /LINT_COMMAND=npm run lint/);
  assert.match(result.content, /TYPECHECK_COMMAND=npm run typecheck/);
  assert.match(result.content, /CHECK_COMMAND=npm run check/);
  assert.match(result.content, /UNIT_TEST_COMMAND=npm run test:unit/);
  assert.match(result.content, /INTEGRATION_TEST_COMMAND=npm run test:integration/);
  assert.match(result.content, /BUILD_COMMAND=npm run build/);
  assert.match(result.content, /E2E_COMMAND=npm run test:e2e/);
  assert.match(result.content, /## 16\. React Native stack profile/);
});

test('marker-only projects remain in the Node family', async () => {
  const js = await tempDir();
  await writePackage(js, { name: 'marker-only-js' });
  await addMarker(js, 'app.json');
  assert.equal(await detectStack(js), 'javascript');

  const ts = await tempDir();
  await writePackage(ts, { name: 'marker-only-ts' });
  await writeFile(path.join(ts, 'tsconfig.json'), '{}\n', 'utf8');
  await addMarker(ts, 'ios');
  assert.equal(await detectStack(ts), 'typescript');
});

test('peer/dev dependency references do not activate React Native application detection', async () => {
  const target = await tempDir();
  await writePackage(target, {
    name: 'react-native-library',
    peerDependencies: { 'react-native': '^0.76.0' },
    devDependencies: { 'react-native': '0.76.0' }
  });
  await addMarker(target, 'ios');
  assert.equal(await detectStack(target), 'javascript');
});

test('runtime dependency without an application marker remains Node-family', async () => {
  const target = await tempDir();
  await writePackage(target, {
    name: 'incomplete-react-native',
    dependencies: { 'react-native': '0.76.0' }
  });
  assert.equal(await detectStack(target), 'javascript');
});

test('malformed package.json never activates React Native detection', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'package.json'), '{not-json\n', 'utf8');
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n', 'utf8');
  await addMarker(target, 'app.json');
  assert.equal(await detectStack(target), 'typescript');
});

test('Go and Python precedence remains above React Native', async () => {
  const go = await tempDir();
  await addReactNativeEvidence(go);
  await writeFile(path.join(go, 'go.mod'), 'module example.com/mobile\n\ngo 1.24\n', 'utf8');
  assert.equal(await detectStack(go), 'go');

  const python = await tempDir();
  await addReactNativeEvidence(python);
  await writeFile(path.join(python, 'pyproject.toml'), '[project]\nname = "mobile"\n', 'utf8');
  assert.equal(await detectStack(python), 'python');
});

test('React Native app markers must be real selected-root files/directories, not symlinks', async (t) => {
  const target = await tempDir();
  const external = await tempDir();
  await writePackage(target, {
    name: 'symlink-marker',
    dependencies: { 'react-native': '0.76.0' }
  });
  const externalMarker = path.join(external, 'app.json');
  await writeFile(externalMarker, '{}\n', 'utf8');

  try {
    await symlink(externalMarker, path.join(target, 'app.json'), 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('Host does not permit file symlinks.');
      return;
    }
    throw error;
  }

  assert.equal(await detectStack(target), 'javascript');
});

test('selected-root detection never recursively inherits parent or sibling mobile evidence', async () => {
  const root = await tempDir();
  await writePackage(root, { name: 'workspace-root' });

  const mobile = path.join(root, 'apps', 'mobile');
  const web = path.join(root, 'apps', 'web');
  await mkdir(mobile, { recursive: true });
  await mkdir(web, { recursive: true });

  await addReactNativeEvidence(mobile, { typeScript: true });
  await writePackage(web, { name: 'web-app' });
  await writeFile(path.join(web, 'tsconfig.json'), '{}\n', 'utf8');

  assert.equal(await detectStack(root), 'javascript');
  assert.equal(await detectStack(mobile), 'react-native');
  assert.equal(await detectStack(web), 'typescript');
});

test('React Native TypeScript/build/E2E applicability stays explicit when scripts are missing', async () => {
  const target = await tempDir();
  await addReactNativeEvidence(target, { typeScript: true });

  const result = await applyStackProfileToContent(target, 'auto', baseAgents);
  assert.match(result.content, /TYPECHECK_COMMAND=<define or n\/a>/);
  assert.match(result.content, /BUILD_COMMAND=<define or n\/a>/);
  assert.match(result.content, /E2E_COMMAND=<define or n\/a>/);
  assert.match(result.content, /UNIT_TEST_COMMAND=<define>/);
});

test('obvious sensitive-effect mobile scripts are not imported into general verification', async () => {
  const target = await tempDir();
  await addReactNativeEvidence(target, {
    scripts: {
      test: 'node --test',
      build: 'fastlane ios release',
      'test:e2e': 'aws devicefarm schedule-run --project-arn example',
      check: 'node --check src/app.js'
    }
  });

  assert.equal(isSensitiveMobileVerificationScript('fastlane ios release'), true);
  assert.equal(isSensitiveMobileVerificationScript('node --test'), false);

  const result = await applyStackProfileToContent(target, 'auto', baseAgents);
  assert.match(result.content, /UNIT_TEST_COMMAND=npm run test/);
  assert.match(result.content, /CHECK_COMMAND=npm run check/);
  assert.match(result.content, /BUILD_COMMAND=<define or n\/a>/);
  assert.match(result.content, /E2E_COMMAND=<define or n\/a>/);
  assert.doesNotMatch(result.content, /fastlane/);
  assert.doesNotMatch(result.content, /devicefarm/);
});


test('first-party React Native fixture dogfoods init, task verification, and bounded context without plugins', async () => {
  const parent = await tempDir();
  const target = path.join(parent, 'mobile-app');
  await cp(firstPartyFixture, target, { recursive: true });

  const initialized = await initProject({
    targetDir: target,
    agent: 'generic',
    stack: 'auto',
    includeGitHub: false
  });
  assert.equal(initialized.stack, 'react-native');

  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.match(agents, /## 16\. React Native stack profile/);
  assert.match(agents, /TYPECHECK_COMMAND=npm run typecheck/);
  assert.match(agents, /E2E_COMMAND=npm run test:e2e/);

  const task = await createTaskPack({
    targetDir: target,
    slug: 'mobile-dogfood',
    title: 'Mobile dogfood'
  });
  const taskContent = await readFile(path.join(target, task.relative), 'utf8');
  assert.match(taskContent, /UNIT_TEST_COMMAND.*npm run test:unit/);
  assert.match(taskContent, /BUILD_COMMAND.*npm run build/);
  assert.match(taskContent, /E2E_COMMAND.*npm run test:e2e/);

  const context = await createContextPack({
    targetDir: target,
    task: 'mobile-dogfood',
    mode: 'plan'
  });
  assert.deepEqual(context.communityPlugins, []);
  assert.match(context.content, /## 16\. React Native stack profile/);
  assert.doesNotMatch(context.content, /## Selected community plugins/);
  assert.equal(context.files.includes('docs/plugins/PLUGINS.json'), false);

  const verification = await runVerification({
    targetDir: target,
    task: 'mobile-dogfood',
    only: ['UNIT_TEST_COMMAND', 'BUILD_COMMAND', 'E2E_COMMAND'],
    run: false,
    quiet: true
  });
  assert.deepEqual(
    verification.commands.map((item) => [item.key, item.command, item.status]),
    [
      ['UNIT_TEST_COMMAND', 'npm run test:unit', 'planned'],
      ['BUILD_COMMAND', 'npm run build', 'planned'],
      ['E2E_COMMAND', 'npm run test:e2e', 'planned']
    ]
  );

  await execFileAsync(process.execPath, ['scripts/format-check.mjs'], { cwd: target });
  await execFileAsync(process.execPath, ['scripts/typecheck.mjs'], { cwd: target });
  await execFileAsync(process.execPath, ['scripts/build.mjs'], { cwd: target });
  await execFileAsync(process.execPath, [
    '--test',
    'test/unit.test.mjs',
    'test/integration.test.mjs',
    'test/e2e.test.mjs'
  ], { cwd: target });
});

test('Doctor reports auto-selected JavaScript as React Native specialization and lifecycle-transition eligible', async () => {
  const target = await tempDir();
  await writePackage(target, { name: 'doctor-js' });
  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
  await addReactNativeEvidence(target);

  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.stack, 'react-native');
  assert.equal(report.lifecycleStack.installedStack, 'javascript');
  assert.equal(report.lifecycleStack.requestedStack, 'auto');
  assert.equal(report.lifecycleStack.reprofileEligible, true);
  assert.equal(report.lifecycleStack.reprofileTarget, 'react-native');
  assert.equal(report.lifecycleStack.reprofileState, 'eligible-specialization');
  assert.equal(report.lifecycleStack.specializationEligible, true);
  assert.equal(report.lifecycleStack.specializationTarget, 'react-native');
  assert.match(formatted, /Re-profile: eligible -> react-native/);
  assert.match(formatted, /React Native specialization: eligible -> react-native/);
});

test('Doctor reports auto-selected TypeScript and generic profiles as React Native specialization eligible', async () => {
  for (const prior of ['typescript', 'generic']) {
    const target = await tempDir();
    if (prior === 'typescript') {
      await writePackage(target, { name: 'doctor-ts' });
      await writeFile(path.join(target, 'tsconfig.json'), '{}\n', 'utf8');
    }
    await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
    await addReactNativeEvidence(target, { typeScript: prior === 'typescript' });

    const report = await runDoctor(target);
    assert.equal(report.lifecycleStack.installedStack, prior);
    assert.equal(report.lifecycleStack.requestedStack, 'auto');
    assert.equal(report.lifecycleStack.reprofileEligible, true);
    assert.equal(report.lifecycleStack.reprofileTarget, 'react-native');
    assert.equal(report.lifecycleStack.specializationEligible, true);
  }
});

test('Doctor withholds specialization for explicit and legacy-unknown lifecycle choices', async () => {
  const explicit = await tempDir();
  await writePackage(explicit, { name: 'doctor-explicit-js' });
  await initProject({ targetDir: explicit, agent: 'generic', stack: 'javascript', includeGitHub: false });
  await addReactNativeEvidence(explicit);

  const explicitReport = await runDoctor(explicit);
  assert.equal(explicitReport.lifecycleStack.reprofileEligible, false);
  assert.equal(explicitReport.lifecycleStack.specializationEligible, false);
  assert.equal(explicitReport.lifecycleStack.specializationState, 'withheld-explicit');

  const legacy = await tempDir();
  await writePackage(legacy, { name: 'doctor-legacy-js' });
  await initProject({ targetDir: legacy, agent: 'generic', stack: 'javascript', includeGitHub: false });
  await removeRequestedStack(legacy);
  await addReactNativeEvidence(legacy);

  const legacyReport = await runDoctor(legacy);
  assert.equal(legacyReport.lifecycleStack.requestedStack, null);
  assert.equal(legacyReport.lifecycleStack.reprofileEligible, false);
  assert.equal(legacyReport.lifecycleStack.specializationEligible, false);
  assert.equal(legacyReport.lifecycleStack.specializationState, 'withheld-unknown-provenance');
});
