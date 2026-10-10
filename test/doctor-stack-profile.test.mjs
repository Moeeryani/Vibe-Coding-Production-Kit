import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { formatDoctorReport, runDoctor } from '../lib/doctor.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-doctor-stack-profile-'));
}

async function addJavascriptEvidence(target) {
  await writeFile(path.join(target, 'package.json'), `${JSON.stringify({ name: 'doctor-stack-fixture' }, null, 2)}\n`, 'utf8');
}

async function removeRequestedStack(target) {
  const manifestPath = path.join(target, '.vcp/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.install.requestedStack;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

test('doctor reports auto-selected generic profile as eligible when concrete evidence appears', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
  await addJavascriptEvidence(target);

  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.stack, 'javascript');
  assert.equal(report.lifecycleStack.detectedStack, 'javascript');
  assert.equal(report.lifecycleStack.installedStack, 'generic');
  assert.equal(report.lifecycleStack.requestedStack, 'auto');
  assert.equal(report.lifecycleStack.reprofileEligible, true);
  assert.equal(report.lifecycleStack.reprofileTarget, 'javascript');
  assert.equal(report.lifecycleStack.reprofileState, 'eligible');
  assert.match(formatted, /Detected stack: javascript/);
  assert.match(formatted, /Installed profile: generic/);
  assert.match(formatted, /Requested stack: auto/);
  assert.match(formatted, /Re-profile: eligible -> javascript/);
});

test('doctor explains that explicit generic provenance preserves the installed profile', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await addJavascriptEvidence(target);

  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.stack, 'javascript');
  assert.equal(report.lifecycleStack.installedStack, 'generic');
  assert.equal(report.lifecycleStack.requestedStack, 'generic');
  assert.equal(report.lifecycleStack.reprofileEligible, false);
  assert.equal(report.lifecycleStack.reprofileTarget, null);
  assert.equal(report.lifecycleStack.reprofileState, 'withheld-explicit');
  assert.match(report.lifecycleStack.reason, /explicitly selected/);
  assert.match(formatted, /Re-profile: withheld-explicit/);
  assert.match(formatted, /repository detection does not override that choice/);
});

test('doctor explains that legacy unknown provenance preserves generic conservatively', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await removeRequestedStack(target);
  await addJavascriptEvidence(target);

  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.stack, 'javascript');
  assert.equal(report.lifecycleStack.installedStack, 'generic');
  assert.equal(report.lifecycleStack.requestedStack, null);
  assert.equal(report.lifecycleStack.reprofileEligible, false);
  assert.equal(report.lifecycleStack.reprofileTarget, null);
  assert.equal(report.lifecycleStack.reprofileState, 'withheld-unknown-provenance');
  assert.match(report.lifecycleStack.reason, /intentionally withheld/);
  assert.match(formatted, /Requested stack: unknown \(legacy provenance not recorded\)/);
  assert.match(formatted, /Re-profile: withheld-unknown-provenance/);
});
