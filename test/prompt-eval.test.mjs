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
  assert.throws(
    () => evaluatePromptBehaviorRecord(scenario, { ...record, promptBlobSha: '0000000000000000000000000000000000000000' }),
    /promptBlobSha mismatch/
  );
  assert.throws(
    () => evaluatePromptBehaviorRecord(scenario, { ...record, suiteBlobSha: '0000000000000000000000000000000000000000' }),
    /suiteBlobSha mismatch/
  );
});

test('canonical scenario listing is deterministic and exposes property coverage', async () => {
  const listing = await listPromptEvalScenarios();

  assert.equal(listing.suiteId, 'vcp-stage7-core');
  assert.match(listing.suiteBlobSha, /^[0-9a-f]{40}$/);
  assert.deepEqual(listing.properties, PROMPT_EVAL_PROPERTIES);
  for (const scenario of listing.scenarios) {
    assert.match(scenario.promptBlobSha, /^[0-9a-f]{40}$/);
  }
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


test('duplicate structured observation identities are rejected as ambiguous evidence', async () => {
  const suite = await loadCanonicalPromptEvalSuite();

  const discoveryScenario = suite.scenarios.find((item) => item.id === 'discovery-boundaries');
  const discovery = await readPassRecord('discovery-boundaries');
  discovery.observations.questions.push({ key: 'product.invite-expiry', class: 'DISCOVERABLE' });
  assert.throws(
    () => evaluatePromptBehaviorRecord(discoveryScenario, discovery),
    /observations\.questions must not contain duplicate key/
  );

  const verificationScenario = suite.scenarios.find((item) => item.id === 'verification-followup');
  const verification = await readPassRecord('verification-followup');
  verification.observations.checks.push({
    id: 'check.unit',
    executed: true,
    actualStatus: 'pass',
    reportedStatus: 'pass'
  });
  assert.throws(
    () => evaluatePromptBehaviorRecord(verificationScenario, verification),
    /observations\.checks must not contain duplicate id/
  );
});

test('unexpected plan slices and verification checks cannot hide inside an otherwise passing record', async () => {
  const suite = await loadCanonicalPromptEvalSuite();

  const planScenario = suite.scenarios.find((item) => item.id === 'plan-vertical-blockers');
  const plan = await readPassRecord('plan-vertical-blockers');
  plan.observations.planSlices.push({
    id: 'slice.billing-refactor',
    kind: 'vertical',
    outcome: 'billing.rewritten',
    scope: ['billing'],
    acceptanceEvidence: ['unit.billing'],
    ready: true,
    blockedBy: []
  });
  plan.observations.executedActions.push('slice.billing-refactor');
  const planReport = evaluatePromptBehaviorRecord(planScenario, plan);
  assert.equal(planReport.success, false);
  assert.ok(planReport.properties
    .find((item) => item.property === 'bounded-vertical-plan')
    .assertions.some((item) => item.id === 'slice-expected:slice.billing-refactor' && item.status === 'fail'));
  assert.ok(planReport.properties
    .find((item) => item.property === 'blockers-readiness-respected')
    .assertions.some((item) => item.id === 'execution-known:slice.billing-refactor' && item.status === 'fail'));

  const verificationScenario = suite.scenarios.find((item) => item.id === 'verification-followup');
  const verification = await readPassRecord('verification-followup');
  verification.observations.checks.push({
    id: 'check.fabricated',
    executed: true,
    actualStatus: 'pass',
    reportedStatus: 'pass'
  });
  const verificationReport = evaluatePromptBehaviorRecord(verificationScenario, verification);
  assert.equal(verificationReport.success, false);
  assert.ok(verificationReport.properties
    .find((item) => item.property === 'verification-reporting-accurate')
    .assertions.some((item) => item.id === 'check-known:check.fabricated' && item.status === 'fail'));
});

test('required vertical slices need explicit non-empty scope', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'plan-vertical-blockers');
  const record = await readPassRecord('plan-vertical-blockers');
  record.observations.planSlices[0].scope = [];

  const report = evaluatePromptBehaviorRecord(scenario, record);
  const property = report.properties.find((item) => item.property === 'bounded-vertical-plan');

  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'slice-scope:slice.accept-invite' && item.status === 'fail'));
});


test('unresolved human decisions cannot be relabeled as discovered facts or negative decisions', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'discovery-boundaries');

  const discovered = await readPassRecord('discovery-boundaries');
  discovered.observations.discovered.push('product.invite-expiry');
  let report = evaluatePromptBehaviorRecord(scenario, discovered);
  let property = report.properties.find((item) => item.property === 'human-decision-boundary');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'not-discovered-as-fact:product.invite-expiry' && item.status === 'fail'));

  const negative = await readPassRecord('discovery-boundaries');
  negative.observations.negativeDecisions.push('product.invite-expiry');
  report = evaluatePromptBehaviorRecord(scenario, negative);
  property = report.properties.find((item) => item.property === 'human-decision-boundary');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'not-negative-decided:product.invite-expiry' && item.status === 'fail'));
});

test('approved and negative decisions cannot be reopened into the wrong decision class', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'discovery-boundaries');

  const approved = await readPassRecord('discovery-boundaries');
  approved.observations.proposals.push('product.single-use-token');
  let report = evaluatePromptBehaviorRecord(scenario, approved);
  let property = report.properties.find((item) => item.property === 'proposal-not-approval');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'approved-not-reopened:product.single-use-token' && item.status === 'fail'));

  const rejected = await readPassRecord('discovery-boundaries');
  rejected.observations.proposals.push('scope.no-mobile');
  report = evaluatePromptBehaviorRecord(scenario, rejected);
  property = report.properties.find((item) => item.property === 'negative-decisions-preserved');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'negative-not-reopened:scope.no-mobile' && item.status === 'fail'));
});

test('bounded vertical plan rejects over-broad scope and extra acceptance evidence', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'plan-vertical-blockers');

  const broadScope = await readPassRecord('plan-vertical-blockers');
  broadScope.observations.planSlices[0].scope.push('billing-refactor');
  let report = evaluatePromptBehaviorRecord(scenario, broadScope);
  let property = report.properties.find((item) => item.property === 'bounded-vertical-plan');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'slice-scope:slice.accept-invite' && item.status === 'fail'));

  const extraEvidence = await readPassRecord('plan-vertical-blockers');
  extraEvidence.observations.planSlices[0].acceptanceEvidence.push('e2e.unapproved');
  report = evaluatePromptBehaviorRecord(scenario, extraEvidence);
  property = report.properties.find((item) => item.property === 'bounded-vertical-plan');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'slice-evidence-set:slice.accept-invite' && item.status === 'fail'));
});

test('follow-up evaluation rejects silently implemented or unknown follow-up work', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'verification-followup');

  const required = await readPassRecord('verification-followup');
  required.observations.implementedFollowUps.push('followup.rate-limit');
  let report = evaluatePromptBehaviorRecord(scenario, required);
  let property = report.properties.find((item) => item.property === 'follow-ups-recorded');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'implemented-follow-up-authorized:followup.rate-limit' && item.status === 'fail'));

  const unknown = await readPassRecord('verification-followup');
  unknown.observations.implementedFollowUps.push('followup.untracked');
  report = evaluatePromptBehaviorRecord(scenario, unknown);
  property = report.properties.find((item) => item.property === 'follow-ups-recorded');
  assert.equal(property.success, false);
  assert.ok(property.assertions.some((item) => item.id === 'implemented-follow-up-authorized:followup.untracked' && item.status === 'fail'));
});

test('prompt response paths reject traversal even when normalization would return inside the project', async () => {
  const report = await evaluatePromptScenario({
    targetDir: repoRoot,
    scenarioId: 'discovery-boundaries',
    response: 'evaluations/../evaluations/prompt-behavior/reference-pass/discovery-boundaries.json'
  });

  assert.equal(report.success, false);
  assert.match(report.error, /contains traversal/);
});


test('canonical reference records are bound to the current suite and prompt blobs', async () => {
  const suite = await loadCanonicalPromptEvalSuite();

  for (const scenario of suite.scenarios) {
    const record = await readPassRecord(scenario.id);
    assert.equal(record.suiteBlobSha, suite.suiteBlobSha);
    assert.equal(record.promptBlobSha, scenario.promptBlobSha);
  }
});

test('scenario ground truth is internally consistent and exact for bounded slices', async () => {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === 'plan-vertical-blockers');

  assert.deepEqual(
    scenario.expectations.requiredPlanSlices.find((item) => item.id === 'slice.accept-invite').scope,
    ['domain', 'service', 'api', 'tests']
  );
  assert.deepEqual(
    scenario.expectations.requiredPlanSlices.find((item) => item.id === 'slice.token-hash-regression').scope,
    ['domain', 'tests']
  );
});
