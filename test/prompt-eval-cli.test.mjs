import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');

async function run(args, cwd = repoRoot) {
  return execFileAsync(process.execPath, [bin, ...args], { cwd });
}

test('prompt-eval list exposes canonical scenarios and all Stage 7 properties as JSON', async () => {
  const { stdout, stderr } = await run(['prompt-eval', 'list', '--json']);
  assert.equal(stderr, '');
  const listing = JSON.parse(stdout);
  assert.equal(listing.suiteId, 'vcp-stage7-core');
  assert.equal(listing.scenarios.length, 4);
  assert.equal(listing.properties.length, 9);
});

test('prompt-eval evaluates one canonical reference record through the public CLI', async () => {
  const { stdout, stderr } = await run([
    'prompt-eval',
    'discovery-boundaries',
    '--dir',
    repoRoot,
    '--response',
    'evaluations/prompt-behavior/reference-pass/discovery-boundaries.json',
    '--json'
  ]);
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.kind, 'scenario');
  assert.equal(report.scenarioId, 'discovery-boundaries');
  assert.equal(report.success, true);
  assert.equal(report.summary.propertiesFail, 0);
});

test('prompt-eval all evaluates the complete canonical reference suite through the public CLI', async () => {
  const { stdout, stderr } = await run([
    'prompt-eval',
    'all',
    '--dir',
    repoRoot,
    '--responses',
    'evaluations/prompt-behavior/reference-pass',
    '--json'
  ]);
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.kind, 'suite');
  assert.equal(report.success, true);
  assert.equal(report.summary.scenariosPass, 4);
  assert.equal(report.summary.propertiesPass, 9);
  assert.equal(report.summary.propertiesFail, 0);
});

test('prompt-eval CLI returns non-zero and structured failure for false verification reporting', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'vcp-prompt-eval-cli-'));
  const source = JSON.parse(await readFile(
    path.join(repoRoot, 'evaluations', 'prompt-behavior', 'reference-pass', 'verification-followup.json'),
    'utf8'
  ));
  source.observations.checks.find((item) => item.id === 'check.security').reportedStatus = 'pass';
  await writeFile(path.join(temp, 'verification-followup.json'), JSON.stringify(source, null, 2));

  await assert.rejects(
    run([
      'prompt-eval',
      'verification-followup',
      '--dir',
      temp,
      '--response',
      'verification-followup.json',
      '--json'
    ]),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.equal(report.success, false);
      const property = report.properties.find((item) => item.property === 'verification-reporting-accurate');
      assert.equal(property.success, false);
      assert.ok(property.assertions.some((item) => item.id === 'check-reported:check.security' && item.status === 'fail'));
      return true;
    }
  );
});

test('prompt-eval all returns non-zero when a required canonical response is missing', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'vcp-prompt-eval-suite-cli-'));
  const discovery = await readFile(
    path.join(repoRoot, 'evaluations', 'prompt-behavior', 'reference-pass', 'discovery-boundaries.json'),
    'utf8'
  );
  await writeFile(path.join(temp, 'discovery-boundaries.json'), discovery);

  await assert.rejects(
    run(['prompt-eval', 'all', '--dir', temp, '--responses', '.', '--json']),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.equal(report.success, false);
      assert.ok(report.summary.scenariosFail >= 1);
      assert.ok(report.summary.propertiesFail >= 1);
      return true;
    }
  );
});


test('prompt-eval human failure output includes the failed property and assertion detail', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'vcp-prompt-eval-human-'));
  const source = JSON.parse(await readFile(
    path.join(repoRoot, 'evaluations', 'prompt-behavior', 'reference-pass', 'verification-followup.json'),
    'utf8'
  ));
  source.observations.checks.find((item) => item.id === 'check.security').reportedStatus = 'pass';
  await writeFile(path.join(temp, 'verification-followup.json'), JSON.stringify(source, null, 2));

  await assert.rejects(
    run([
      'prompt-eval',
      'verification-followup',
      '--dir',
      temp,
      '--response',
      'verification-followup.json'
    ]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stdout, /FAIL verification-reporting-accurate/);
      assert.match(error.stdout, /check-reported:check\.security/);
      assert.match(error.stdout, /expected fail/);
      return true;
    }
  );
});
