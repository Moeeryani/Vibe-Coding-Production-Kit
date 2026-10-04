import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PROMPT_EVAL_PROPERTIES,
  evaluatePromptBehaviorRecord,
  evaluatePromptScenario,
  evaluatePromptSuite,
  listPromptEvalScenarios,
  loadCanonicalPromptEvalSuite,
  promptEvalExitCode
} from '../lib/prompt-eval.mjs';

const repoRoot = path.resolve('.');
const fixtureRoot = path.join(repoRoot, 'evaluations', 'prompt-behavior');
const passDir = path.join(fixtureRoot, 'reference-pass');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readPassRecord(scenarioId) {
  return readJson(path.join(passDir, `${scenarioId}.json`));
}

function applyMutation(record, mutation) {
  const clone = structuredClone(record);
  const parts = mutation.path.split('.');
  let current = clone;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = /^\d+$/.test(parts[index]) ? Number(parts[index]) : parts[index];
    current = current[key];
  }
  const lastRaw = parts.at(-1);
  const last = /^\d+$/.test(lastRaw) ? Number(lastRaw) : lastRaw;
  current[last] = structuredClone(mutation.value);
  return clone;
}

test('canonical Stage 7 suite covers every roadmap behavior property', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const covered = new Set(suite.scenarios.flatMap((scenario) => scenario.properties));

  assert.deepEqual([...covered].sort(), [...PROMPT_EVAL_PROPERTIES].sort());
  assert.equal(suite.scenarios.length, 4);
  assert.equal(PROMPT_EVAL_PROPERTIES.length, 9);
});

test('reference prompt behavior suite passes every scenario, property, and assertion', async () => {
  const report = await evaluatePromptSuite({
    targetDir: repoRoot,
    responsesDir: 'evaluations/prompt-behavior/reference-pass'
  });

  assert.equal(report.success, true);
  assert.equal(report.summary.scenariosFail, 0);
  assert.equal(report.summary.scenariosPass, 4);
  assert.equal(report.summary.propertiesFail, 0);
  assert.equal(report.summary.propertiesPass, 9);
  assert.ok(report.summary.assertionsPass > 20);
  assert.equal(promptEvalExitCode(report), 0);
});

test('verification behavior can pass while accurately reporting an executed failed check', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'verification-followup');
  const record = await readPassRecord('verification-followup');
  const report = evaluatePromptBehaviorRecord(scenario, record);
  const property = report.properties.find((item) => item.property === 'verification-reporting-accurate');

  assert.equal(report.success, true);
  assert.equal(record.observations.checks.find((item) => item.id === 'check.security').actualStatus, 'fail');
  assert.equal(record.observations.checks.find((item) => item.id === 'check.security').reportedStatus, 'fail');
  assert.equal(property.success, true);
});

test('free-form wording is ignored by deterministic behavior evaluation', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'discovery-boundaries');
  const record = await readPassRecord('discovery-boundaries');

  record.notes = 'Completely different prose, language, formatting, and tone.';
  record.observations.notes = 'This field is intentionally not scored.';

  const report = evaluatePromptBehaviorRecord(scenario, record);
  assert.equal(report.success, true);
});

test('every Stage 7 property has a mutation fixture that turns that property red', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const mutationFixture = await readJson(path.join(fixtureRoot, 'mutations.json'));

  assert.equal(mutationFixture.mutations.length, PROMPT_EVAL_PROPERTIES.length);
  assert.deepEqual(
    mutationFixture.mutations.map((item) => item.property).sort(),
    [...PROMPT_EVAL_PROPERTIES].sort()
  );

  for (const mutation of mutationFixture.mutations) {
    const scenario = suite.scenarios.find((item) => item.id === mutation.scenarioId);
    const record = await readPassRecord(mutation.scenarioId);
    const mutated = applyMutation(record, mutation);
    const report = evaluatePromptBehaviorRecord(scenario, mutated);
    const targeted = report.properties.find((item) => item.property === mutation.property);

    assert.ok(targeted, `mutation target property exists: ${mutation.property}`);
    assert.equal(targeted.success, false, `${mutation.property} mutation must fail`);
    assert.equal(report.success, false, `${mutation.property} mutation must make the scenario fail`);
  }
});

test('missing required observation fields fail visibly instead of defaulting to pass', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'discovery-boundaries');
  const record = await readPassRecord('discovery-boundaries');
  delete record.observations.negativeDecisions;

  assert.throws(
    () => evaluatePromptBehaviorRecord(scenario, record),
    /observations\.negativeDecisions must be an array/
  );
});

test('scenario id and prompt identity mismatches fail visibly', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'discovery-boundaries');
  const record = await readPassRecord('discovery-boundaries');

  assert.throws(
    () => evaluatePromptBehaviorRecord(scenario, { ...record, scenarioId: 'wrong-scenario' }),
    /scenarioId mismatch/
  );
  assert.throws(
    () => evaluatePromptBehaviorRecord(scenario, { ...record, prompt: 'prompts/99-wrong.md' }),
    /prompt mismatch/
  );
});

test('canonical scenario listing is deterministic and exposes property coverage', async () => {
  const listing = await listPromptEvalScenarios();

  assert.equal(listing.suiteId, 'vcp-stage7-core');
  assert.deepEqual(listing.properties, PROMPT_EVAL_PROPERTIES);
  assert.deepEqual(
    listing.scenarios.map((item) => item.id),
    ['discovery-boundaries', 'plan-vertical-blockers', 'verification-followup', 'review-restartability']
  );
});

test('single-scenario evaluation rejects unknown ids and reports unsafe response paths as failure evidence', async () => {
  await assert.rejects(
    evaluatePromptScenario({
      targetDir: repoRoot,
      scenarioId: 'does-not-exist',
      response: 'whatever.json'
    }),
    /Unknown prompt evaluation scenario/
  );

  const unsafe = await evaluatePromptScenario({
    targetDir: repoRoot,
    scenarioId: 'discovery-boundaries',
    response: '../outside.json'
  });
  assert.equal(unsafe.success, false);
  assert.match(unsafe.error, /escapes the project root/);
});

test('suite reports missing response files as failed scenarios and properties', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-prompt-eval-missing-'));
  const first = await readPassRecord('discovery-boundaries');
  await writeFile(path.join(target, 'discovery-boundaries.json'), JSON.stringify(first, null, 2));

  const report = await evaluatePromptSuite({ targetDir: target, responsesDir: '.' });

  assert.equal(report.success, false);
  assert.ok(report.summary.scenariosFail > 0);
  assert.ok(report.summary.propertiesFail > 0);
  assert.equal(promptEvalExitCode(report), 1);
});
