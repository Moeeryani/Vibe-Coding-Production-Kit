import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { formatDoctorReport, runDoctor } from '../lib/doctor.mjs';
import { initProject } from '../lib/init.mjs';
import { detectStack, STACK_CHOICES } from '../lib/stacks.mjs';

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

async function addReactNativeEvidence(target, marker = 'app.json') {
  await writePackage(target, {
    name: 'react-native-fixture',
    dependencies: { 'react-native': '0.76.0' }
  });
  await addMarker(target, marker);
}

async function removeRequestedStack(target) {
  const manifestPath = path.join(target, '.vcp/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.install.requestedStack;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

test('react-native is an explicit supported stack selector without Go fallthrough', async () => {
  assert.ok(STACK_CHOICES.includes('react-native'));

  const target = await tempDir();
  const result = await initProject({
    targetDir: target,
    agent: 'generic',
    stack: 'react-native',
    includeGitHub: false
  });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'react-native');
  assert.doesNotMatch(agents, /## 16\. Go stack profile/);
  assert.doesNotMatch(agents, /LINT_COMMAND=go vet/);
  assert.doesNotMatch(agents, /BUILD_COMMAND=go build/);
});

test('React Native detection accepts every canonical application marker', async () => {
  for (const marker of ['android', 'ios', 'app.json', 'app.config.js', 'app.config.cjs', 'app.config.mjs', 'app.config.ts']) {
    const target = await tempDir();
    await addReactNativeEvidence(target, marker);
    assert.equal(await detectStack(target), 'react-native', marker);
  }
});

test('TypeScript React Native application specializes before TypeScript fallback', async () => {
  const target = await tempDir();
  await addReactNativeEvidence(target);
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n', 'utf8');

  assert.equal(await detectStack(target), 'react-native');
});

test('application marker without React Native runtime dependency remains Node-family', async () => {
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

test('React Native runtime dependency without application marker remains Node-family', async () => {
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

test('Go and Python detection precedence remains above React Native', async () => {
  const go = await tempDir();
  await addReactNativeEvidence(go);
  await writeFile(path.join(go, 'go.mod'), 'module example.com/mobile\n\ngo 1.24\n', 'utf8');
  assert.equal(await detectStack(go), 'go');

  const python = await tempDir();
  await addReactNativeEvidence(python);
  await writeFile(path.join(python, 'pyproject.toml'), '[project]\nname = "mobile"\n', 'utf8');
  assert.equal(await detectStack(python), 'python');
});

test('Doctor reports auto-selected JavaScript profile as React Native specialization-eligible', async () => {
  const target = await tempDir();
  await writePackage(target, { name: 'doctor-js' });
  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });

  await addReactNativeEvidence(target);
  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.stack, 'react-native');
  assert.equal(report.lifecycleStack.installedStack, 'javascript');
  assert.equal(report.lifecycleStack.requestedStack, 'auto');
  assert.equal(report.lifecycleStack.reprofileEligible, false);
  assert.equal(report.lifecycleStack.specializationEligible, true);
  assert.equal(report.lifecycleStack.specializationTarget, 'react-native');
  assert.equal(report.lifecycleStack.specializationState, 'eligible');
  assert.match(formatted, /React Native specialization: eligible -> react-native/);
});

test('Doctor reports auto-selected TypeScript profile as React Native specialization-eligible', async () => {
  const target = await tempDir();
  await writePackage(target, { name: 'doctor-ts' });
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n', 'utf8');
  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });

  await addReactNativeEvidence(target);
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n', 'utf8');
  const report = await runDoctor(target);

  assert.equal(report.stack, 'react-native');
  assert.equal(report.lifecycleStack.installedStack, 'typescript');
  assert.equal(report.lifecycleStack.requestedStack, 'auto');
  assert.equal(report.lifecycleStack.reprofileEligible, false);
  assert.equal(report.lifecycleStack.specializationEligible, true);
  assert.equal(report.lifecycleStack.specializationTarget, 'react-native');
});

test('Doctor reports auto-selected generic profile with both existing re-profile and React Native specialization evidence', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });

  await addReactNativeEvidence(target);
  const report = await runDoctor(target);

  assert.equal(report.lifecycleStack.installedStack, 'generic');
  assert.equal(report.lifecycleStack.requestedStack, 'auto');
  assert.equal(report.lifecycleStack.reprofileEligible, true);
  assert.equal(report.lifecycleStack.reprofileTarget, 'react-native');
  assert.equal(report.lifecycleStack.specializationEligible, true);
  assert.equal(report.lifecycleStack.specializationTarget, 'react-native');
});

test('Doctor withholds React Native specialization for explicit lifecycle choice', async () => {
  const target = await tempDir();
  await writePackage(target, { name: 'doctor-explicit-js' });
  await initProject({ targetDir: target, agent: 'generic', stack: 'javascript', includeGitHub: false });

  await addReactNativeEvidence(target);
  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.lifecycleStack.installedStack, 'javascript');
  assert.equal(report.lifecycleStack.requestedStack, 'javascript');
  assert.equal(report.lifecycleStack.specializationEligible, false);
  assert.equal(report.lifecycleStack.specializationState, 'withheld-explicit');
  assert.match(formatted, /React Native specialization: withheld-explicit/);
});

test('Doctor withholds React Native specialization when legacy requestedStack provenance is missing', async () => {
  const target = await tempDir();
  await writePackage(target, { name: 'doctor-legacy-js' });
  await initProject({ targetDir: target, agent: 'generic', stack: 'javascript', includeGitHub: false });
  await removeRequestedStack(target);

  await addReactNativeEvidence(target);
  const report = await runDoctor(target);

  assert.equal(report.lifecycleStack.requestedStack, null);
  assert.equal(report.lifecycleStack.specializationEligible, false);
  assert.equal(report.lifecycleStack.specializationState, 'withheld-unknown-provenance');
  assert.match(report.lifecycleStack.specializationReason, /provenance is unavailable/);
});
