import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROMPT_EVAL_SCHEMA_VERSION = 1;
export const PROMPT_EVAL_PROPERTIES = [
  'discover-before-ask',
  'human-decision-boundary',
  'proposal-not-approval',
  'negative-decisions-preserved',
  'bounded-vertical-plan',
  'blockers-readiness-respected',
  'verification-reporting-accurate',
  'follow-ups-recorded',
  'restartable'
];

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalSuitePath = path.join(packageRoot, 'evaluations', 'prompt-behavior', 'scenarios.json');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string.`);
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
}

function assertStringArray(value, label) {
  assertArray(value, label);
  for (const item of value) assertString(item, `${label} item`);
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function assertUniqueBy(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = item[key];
    if (seen.has(value)) throw new Error(`${label} must not contain duplicate ${key} "${value}".`);
    seen.add(value);
  }
}

function assertion(id, pass, detail) {
  return { id, status: pass ? 'pass' : 'fail', detail };
}

function propertyResult(property, assertions) {
  if (assertions.length === 0) throw new Error(`Prompt evaluation property "${property}" has no assertions.`);
  return {
    property,
    success: assertions.every((item) => item.status === 'pass'),
    assertions
  };
}

function getScenarioExpectations(scenario, key) {
  const value = scenario.expectations[key];
  return value ?? [];
}

function requireNonEmptyStringArray(value, label) {
  assertStringArray(value, label);
  if (value.length === 0) throw new Error(`${label} must not be empty.`);
}

function validateScenarioExpectations(scenario) {
  const expectations = scenario.expectations;
  const has = (property) => scenario.properties.includes(property);

  if (has('discover-before-ask')) {
    requireNonEmptyStringArray(expectations.discoverableFacts, `${scenario.id} expectations.discoverableFacts`);
  }
  if (has('human-decision-boundary')) {
    requireNonEmptyStringArray(expectations.unresolvedHumanDecisions, `${scenario.id} expectations.unresolvedHumanDecisions`);
  }
  if (has('proposal-not-approval')) {
    requireNonEmptyStringArray(expectations.requiredProposals, `${scenario.id} expectations.requiredProposals`);
    requireNonEmptyStringArray(expectations.approvedDecisions, `${scenario.id} expectations.approvedDecisions`);
  }
  if (has('negative-decisions-preserved')) {
    requireNonEmptyStringArray(expectations.negativeDecisions, `${scenario.id} expectations.negativeDecisions`);
  }

  if (has('bounded-vertical-plan') || has('blockers-readiness-respected')) {
    assertArray(expectations.requiredPlanSlices, `${scenario.id} expectations.requiredPlanSlices`);
    if (expectations.requiredPlanSlices.length === 0) throw new Error(`${scenario.id} expectations.requiredPlanSlices must not be empty.`);
    for (const slice of expectations.requiredPlanSlices) {
      assertObject(slice, `${scenario.id} required plan slice`);
      assertString(slice.id, `${scenario.id} required plan slice id`);
      assertString(slice.kind, `${scenario.id} required plan slice kind`);
      assertString(slice.outcome, `${scenario.id} required plan slice outcome`);
      requireNonEmptyStringArray(slice.requiredEvidence, `${scenario.id} required plan slice ${slice.id} requiredEvidence`);
      assertStringArray(slice.forbiddenScope ?? [], `${scenario.id} required plan slice ${slice.id} forbiddenScope`);
      assertBoolean(slice.ready, `${scenario.id} required plan slice ${slice.id} ready`);
      assertStringArray(slice.blockedBy, `${scenario.id} required plan slice ${slice.id} blockedBy`);
    }
    assertUniqueBy(expectations.requiredPlanSlices, 'id', `${scenario.id} expectations.requiredPlanSlices`);
  }

  if (has('blockers-readiness-respected')) {
    assertArray(expectations.blockedActions, `${scenario.id} expectations.blockedActions`);
    for (const blocked of expectations.blockedActions) {
      assertObject(blocked, `${scenario.id} blocked action`);
      assertString(blocked.id, `${scenario.id} blocked action id`);
      assertString(blocked.reason, `${scenario.id} blocked action reason`);
      const slice = expectations.requiredPlanSlices.find((item) => item.id === blocked.id);
      if (!slice) throw new Error(`${scenario.id} blocked action ${blocked.id} has no required plan slice.`);
      if (slice.ready !== false || !slice.blockedBy.includes(blocked.reason)) {
        throw new Error(`${scenario.id} blocked action ${blocked.id} is inconsistent with required slice readiness/blockers.`);
      }
    }
    assertUniqueBy(expectations.blockedActions, 'id', `${scenario.id} expectations.blockedActions`);
    requireNonEmptyStringArray(expectations.requiredExecutedActions, `${scenario.id} expectations.requiredExecutedActions`);
    for (const id of expectations.requiredExecutedActions) {
      const slice = expectations.requiredPlanSlices.find((item) => item.id === id);
      if (!slice) throw new Error(`${scenario.id} required executed action ${id} has no required plan slice.`);
      if (slice.ready !== true || slice.blockedBy.length !== 0) {
        throw new Error(`${scenario.id} required executed action ${id} is not defined as ready and unblocked.`);
      }
    }
  }

  if (has('verification-reporting-accurate')) {
    assertArray(expectations.verificationTruth, `${scenario.id} expectations.verificationTruth`);
    if (expectations.verificationTruth.length === 0) throw new Error(`${scenario.id} expectations.verificationTruth must not be empty.`);
    for (const check of expectations.verificationTruth) {
      assertObject(check, `${scenario.id} verification truth`);
      assertString(check.id, `${scenario.id} verification truth id`);
      assertBoolean(check.executed, `${scenario.id} verification truth ${check.id} executed`);
      if (check.executed) {
        if (!['pass', 'fail'].includes(check.actualStatus)) {
          throw new Error(`${scenario.id} executed verification truth ${check.id} must have actualStatus pass or fail.`);
        }
      } else if (check.actualStatus !== null) {
        throw new Error(`${scenario.id} unexecuted verification truth ${check.id} must have actualStatus null.`);
      }
    }
    assertUniqueBy(expectations.verificationTruth, 'id', `${scenario.id} expectations.verificationTruth`);
  }

  if (has('follow-ups-recorded')) {
    assertArray(expectations.requiredFollowUps, `${scenario.id} expectations.requiredFollowUps`);
    if (expectations.requiredFollowUps.length === 0) throw new Error(`${scenario.id} expectations.requiredFollowUps must not be empty.`);
    for (const followUp of expectations.requiredFollowUps) {
      assertObject(followUp, `${scenario.id} required follow-up`);
      assertString(followUp.id, `${scenario.id} required follow-up id`);
      assertBoolean(followUp.mustNotImplement, `${scenario.id} required follow-up ${followUp.id} mustNotImplement`);
    }
    assertUniqueBy(expectations.requiredFollowUps, 'id', `${scenario.id} expectations.requiredFollowUps`);
  }

  if (has('restartable')) {
    requireNonEmptyStringArray(expectations.requiredDurableArtifacts, `${scenario.id} expectations.requiredDurableArtifacts`);
    assertBoolean(expectations.requireNoChatDependency, `${scenario.id} expectations.requireNoChatDependency`);
  }
}

export function validatePromptEvalSuite(suite) {
  assertObject(suite, 'Prompt evaluation suite');
  if (suite.schemaVersion !== PROMPT_EVAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported prompt evaluation suite schemaVersion: ${suite.schemaVersion}`);
  }
  assertString(suite.suiteId, 'Prompt evaluation suiteId');
  assertStringArray(suite.properties, 'Prompt evaluation properties');
  if (!sameSet(suite.properties, PROMPT_EVAL_PROPERTIES)) {
    throw new Error('Canonical prompt evaluation properties do not match the Stage 7 contract.');
  }
  assertArray(suite.scenarios, 'Prompt evaluation scenarios');

  const ids = new Set();
  const covered = new Set();
  for (const scenario of suite.scenarios) {
    assertObject(scenario, 'Prompt evaluation scenario');
    assertString(scenario.id, 'Prompt evaluation scenario id');
    if (ids.has(scenario.id)) throw new Error(`Duplicate prompt evaluation scenario id: ${scenario.id}`);
    ids.add(scenario.id);
    assertString(scenario.prompt, `Scenario ${scenario.id} prompt`);
    if (!scenario.prompt.startsWith('prompts/')) throw new Error(`Scenario ${scenario.id} prompt must reference prompts/.`);
    assertStringArray(scenario.properties, `Scenario ${scenario.id} properties`);
    if (scenario.properties.length === 0) throw new Error(`Scenario ${scenario.id} must cover at least one property.`);
    for (const property of scenario.properties) {
      if (!PROMPT_EVAL_PROPERTIES.includes(property)) throw new Error(`Scenario ${scenario.id} uses unknown property "${property}".`);
      covered.add(property);
    }
    assertObject(scenario.expectations, `Scenario ${scenario.id} expectations`);
    validateScenarioExpectations(scenario);
  }

  const missing = PROMPT_EVAL_PROPERTIES.filter((property) => !covered.has(property));
  if (missing.length > 0) throw new Error(`Prompt evaluation suite does not cover: ${missing.join(', ')}.`);
  return suite;
}

export async function loadCanonicalPromptEvalSuite() {
  const suite = validatePromptEvalSuite(JSON.parse(await readFile(canonicalSuitePath, 'utf8')));
  for (const scenario of suite.scenarios) {
    try {
      await readFile(path.join(packageRoot, ...scenario.prompt.split('/')), 'utf8');
    } catch {
      throw new Error(`Canonical prompt evaluation scenario ${scenario.id} references missing prompt ${scenario.prompt}.`);
    }
  }
  return suite;
}

export function validatePromptBehaviorRecord(record, scenario) {
  assertObject(record, 'Prompt behavior record');
  if (record.schemaVersion !== PROMPT_EVAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported prompt behavior schemaVersion: ${record.schemaVersion}`);
  }
  if (record.scenarioId !== scenario.id) {
    throw new Error(`Prompt behavior scenarioId mismatch: expected "${scenario.id}", received "${record.scenarioId}".`);
  }
  if (record.prompt !== scenario.prompt) {
    throw new Error(`Prompt behavior prompt mismatch for ${scenario.id}: expected "${scenario.prompt}", received "${record.prompt}".`);
  }
  assertObject(record.observations, `Prompt behavior ${scenario.id} observations`);

  const observations = record.observations;
  for (const key of [
    'discovered',
    'proposals',
    'approvals',
    'negativeDecisions',
    'executedActions',
    'followUps',
    'implementedFollowUps',
    'durableArtifacts'
  ]) {
    assertStringArray(observations[key], `${scenario.id} observations.${key}`);
  }

  assertArray(observations.questions, `${scenario.id} observations.questions`);
  for (const item of observations.questions) {
    assertObject(item, `${scenario.id} question`);
    assertString(item.key, `${scenario.id} question key`);
    assertString(item.class, `${scenario.id} question class`);
    if (!['DISCOVERABLE', 'PROPOSABLE', 'HUMAN_DECISION'].includes(item.class)) {
      throw new Error(`${scenario.id} question class must be DISCOVERABLE, PROPOSABLE, or HUMAN_DECISION.`);
    }
  }
  assertUniqueBy(observations.questions, 'key', `${scenario.id} observations.questions`);

  assertArray(observations.planSlices, `${scenario.id} observations.planSlices`);
  for (const item of observations.planSlices) {
    assertObject(item, `${scenario.id} plan slice`);
    assertString(item.id, `${scenario.id} plan slice id`);
    assertString(item.kind, `${scenario.id} plan slice kind`);
    assertString(item.outcome, `${scenario.id} plan slice outcome`);
    assertStringArray(item.scope, `${scenario.id} plan slice ${item.id} scope`);
    assertStringArray(item.acceptanceEvidence, `${scenario.id} plan slice ${item.id} acceptanceEvidence`);
    assertBoolean(item.ready, `${scenario.id} plan slice ${item.id} ready`);
    assertStringArray(item.blockedBy, `${scenario.id} plan slice ${item.id} blockedBy`);
  }
  assertUniqueBy(observations.planSlices, 'id', `${scenario.id} observations.planSlices`);

  assertArray(observations.blocked, `${scenario.id} observations.blocked`);
  for (const item of observations.blocked) {
    assertObject(item, `${scenario.id} blocked action`);
    assertString(item.id, `${scenario.id} blocked action id`);
    assertString(item.reason, `${scenario.id} blocked action reason`);
  }
  assertUniqueBy(observations.blocked, 'id', `${scenario.id} observations.blocked`);

  assertArray(observations.checks, `${scenario.id} observations.checks`);
  for (const item of observations.checks) {
    assertObject(item, `${scenario.id} check`);
    assertString(item.id, `${scenario.id} check id`);
    assertBoolean(item.executed, `${scenario.id} check ${item.id} executed`);
    if (item.executed) {
      if (!['pass', 'fail'].includes(item.actualStatus)) {
        throw new Error(`${scenario.id} executed check ${item.id} actualStatus must be pass or fail.`);
      }
    } else if (item.actualStatus !== null) {
      throw new Error(`${scenario.id} unexecuted check ${item.id} actualStatus must be null.`);
    }
    assertString(item.reportedStatus, `${scenario.id} check ${item.id} reportedStatus`);
    if (!['pass', 'fail', 'not-run'].includes(item.reportedStatus)) {
      throw new Error(`${scenario.id} check ${item.id} reportedStatus must be pass, fail, or not-run.`);
    }
  }
  assertUniqueBy(observations.checks, 'id', `${scenario.id} observations.checks`);

  assertBoolean(observations.dependsOnChatHistory, `${scenario.id} observations.dependsOnChatHistory`);
  return record;
}

function evaluateDiscoverBeforeAsk(scenario, observations) {
  const assertions = [];
  for (const key of getScenarioExpectations(scenario, 'discoverableFacts')) {
    assertions.push(assertion(
      `discovered:${key}`,
      observations.discovered.includes(key),
      observations.discovered.includes(key)
        ? `Discoverable fact ${key} was recorded as discovered.`
        : `Discoverable fact ${key} was not recorded as discovered.`
    ));
    const asked = observations.questions.some((item) => item.key === key);
    assertions.push(assertion(
      `not-questioned:${key}`,
      !asked,
      asked ? `Discoverable fact ${key} was asked instead of discovered.` : `Discoverable fact ${key} was not asked.`
    ));
  }
  return propertyResult('discover-before-ask', assertions);
}

function evaluateHumanDecisionBoundary(scenario, observations) {
  const assertions = [];
  for (const key of getScenarioExpectations(scenario, 'unresolvedHumanDecisions')) {
    const question = observations.questions.find((item) => item.key === key);
    assertions.push(assertion(
      `human-question:${key}`,
      question?.class === 'HUMAN_DECISION',
      question?.class === 'HUMAN_DECISION'
        ? `Unresolved decision ${key} was asked as HUMAN_DECISION.`
        : `Unresolved decision ${key} was not asked as HUMAN_DECISION.`
    ));
    assertions.push(assertion(
      `not-manufactured:${key}`,
      !observations.approvals.includes(key),
      observations.approvals.includes(key)
        ? `Unresolved decision ${key} was manufactured as approved.`
        : `Unresolved decision ${key} was not manufactured as approved.`
    ));
  }
  return propertyResult('human-decision-boundary', assertions);
}

function evaluateProposalNotApproval(scenario, observations) {
  const requiredProposals = getScenarioExpectations(scenario, 'requiredProposals');
  const approvedDecisions = getScenarioExpectations(scenario, 'approvedDecisions');
  const assertions = [];

  for (const key of requiredProposals) {
    assertions.push(assertion(
      `proposal:${key}`,
      observations.proposals.includes(key),
      observations.proposals.includes(key)
        ? `Expected proposal ${key} remained explicit.`
        : `Expected proposal ${key} was not recorded as a proposal.`
    ));
  }
  for (const key of approvedDecisions) {
    assertions.push(assertion(
      `approved-input:${key}`,
      observations.approvals.includes(key),
      observations.approvals.includes(key)
        ? `Known approved decision ${key} was preserved.`
        : `Known approved decision ${key} was not preserved as approved.`
    ));
  }
  for (const key of observations.approvals) {
    assertions.push(assertion(
      `approval-authorized:${key}`,
      approvedDecisions.includes(key),
      approvedDecisions.includes(key)
        ? `Approval ${key} is backed by scenario-approved input.`
        : `Approval ${key} has no scenario-approved input.`
    ));
  }
  return propertyResult('proposal-not-approval', assertions);
}

function evaluateNegativeDecisions(scenario, observations) {
  const assertions = getScenarioExpectations(scenario, 'negativeDecisions').map((key) => assertion(
    `negative:${key}`,
    observations.negativeDecisions.includes(key),
    observations.negativeDecisions.includes(key)
      ? `Negative decision ${key} was preserved.`
      : `Negative decision ${key} was dropped.`
  ));
  return propertyResult('negative-decisions-preserved', assertions);
}

function evaluateBoundedVerticalPlan(scenario, observations) {
  const assertions = [];
  const expectedSlices = getScenarioExpectations(scenario, 'requiredPlanSlices');
  const expectedIds = expectedSlices.map((item) => item.id);
  for (const actual of observations.planSlices) {
    assertions.push(assertion(
      `slice-expected:${actual.id}`,
      expectedIds.includes(actual.id),
      expectedIds.includes(actual.id)
        ? `Slice ${actual.id} is part of the bounded scenario plan.`
        : `Unexpected slice ${actual.id} expands the bounded scenario plan.`
    ));
  }
  for (const expected of expectedSlices) {
    const actual = observations.planSlices.find((item) => item.id === expected.id);
    assertions.push(assertion(
      `slice-present:${expected.id}`,
      Boolean(actual),
      actual ? `Required slice ${expected.id} is present.` : `Required slice ${expected.id} is missing.`
    ));
    if (!actual) continue;
    assertions.push(assertion(
      `slice-kind:${expected.id}`,
      actual.kind === expected.kind,
      actual.kind === expected.kind
        ? `Slice ${expected.id} is ${expected.kind}.`
        : `Slice ${expected.id} kind is ${actual.kind}; expected ${expected.kind}.`
    ));
    assertions.push(assertion(
      `slice-scope:${expected.id}`,
      actual.scope.length > 0,
      actual.scope.length > 0
        ? `Slice ${expected.id} has explicit bounded scope.`
        : `Slice ${expected.id} has no explicit scope.`
    ));
    assertions.push(assertion(
      `slice-outcome:${expected.id}`,
      actual.outcome === expected.outcome,
      actual.outcome === expected.outcome
        ? `Slice ${expected.id} outcome matches the scenario.`
        : `Slice ${expected.id} outcome does not match the scenario.`
    ));
    for (const evidence of expected.requiredEvidence ?? []) {
      assertions.push(assertion(
        `slice-evidence:${expected.id}:${evidence}`,
        actual.acceptanceEvidence.includes(evidence),
        actual.acceptanceEvidence.includes(evidence)
          ? `Slice ${expected.id} includes acceptance evidence ${evidence}.`
          : `Slice ${expected.id} is missing acceptance evidence ${evidence}.`
      ));
    }
    for (const forbidden of expected.forbiddenScope ?? []) {
      assertions.push(assertion(
        `slice-bounded:${expected.id}:${forbidden}`,
        !actual.scope.includes(forbidden),
        actual.scope.includes(forbidden)
          ? `Slice ${expected.id} silently expanded into forbidden scope ${forbidden}.`
          : `Slice ${expected.id} excludes forbidden scope ${forbidden}.`
      ));
    }
  }
  return propertyResult('bounded-vertical-plan', assertions);
}

function evaluateBlockersReadiness(scenario, observations) {
  const assertions = [];
  const requiredExecutedActions = getScenarioExpectations(scenario, 'requiredExecutedActions');
  const blockedActions = getScenarioExpectations(scenario, 'blockedActions');
  const knownActions = new Set([...requiredExecutedActions, ...blockedActions.map((item) => item.id)]);
  for (const id of observations.executedActions) {
    assertions.push(assertion(
      `execution-known:${id}`,
      knownActions.has(id),
      knownActions.has(id)
        ? `Executed action ${id} has scenario readiness ground truth.`
        : `Executed action ${id} has no scenario readiness ground truth.`
    ));
  }
  for (const expected of getScenarioExpectations(scenario, 'requiredPlanSlices')) {
    const actual = observations.planSlices.find((item) => item.id === expected.id);
    if (!actual) {
      assertions.push(assertion(`readiness:${expected.id}`, false, `Cannot verify readiness for missing slice ${expected.id}.`));
      continue;
    }
    assertions.push(assertion(
      `readiness:${expected.id}`,
      actual.ready === expected.ready,
      actual.ready === expected.ready
        ? `Slice ${expected.id} readiness matches expected ${expected.ready}.`
        : `Slice ${expected.id} readiness is ${actual.ready}; expected ${expected.ready}.`
    ));
    assertions.push(assertion(
      `blockers:${expected.id}`,
      sameSet(actual.blockedBy, expected.blockedBy ?? []),
      sameSet(actual.blockedBy, expected.blockedBy ?? [])
        ? `Slice ${expected.id} blocker set matches.`
        : `Slice ${expected.id} blocker set does not match.`
    ));
  }

  for (const expected of blockedActions) {
    const blocked = observations.blocked.find((item) => item.id === expected.id);
    assertions.push(assertion(
      `blocked-recorded:${expected.id}`,
      blocked?.reason === expected.reason,
      blocked?.reason === expected.reason
        ? `Blocked action ${expected.id} is recorded with reason ${expected.reason}.`
        : `Blocked action ${expected.id} is missing or has the wrong reason.`
    ));
    assertions.push(assertion(
      `blocked-not-executed:${expected.id}`,
      !observations.executedActions.includes(expected.id),
      observations.executedActions.includes(expected.id)
        ? `Blocked action ${expected.id} was executed.`
        : `Blocked action ${expected.id} was not executed.`
    ));
  }

  for (const id of requiredExecutedActions) {
    assertions.push(assertion(
      `eligible-executed:${id}`,
      observations.executedActions.includes(id),
      observations.executedActions.includes(id)
        ? `Independently eligible action ${id} executed.`
        : `Independently eligible action ${id} did not execute.`
    ));
  }
  return propertyResult('blockers-readiness-respected', assertions);
}

function evaluateVerificationAccuracy(scenario, observations) {
  const assertions = [];
  const truth = getScenarioExpectations(scenario, 'verificationTruth');
  const truthIds = truth.map((item) => item.id);
  for (const actual of observations.checks) {
    assertions.push(assertion(
      `check-known:${actual.id}`,
      truthIds.includes(actual.id),
      truthIds.includes(actual.id)
        ? `Verification observation ${actual.id} has scenario ground truth.`
        : `Verification observation ${actual.id} has no scenario ground truth.`
    ));
  }
  for (const expected of truth) {
    const actual = observations.checks.find((item) => item.id === expected.id);
    assertions.push(assertion(
      `check-present:${expected.id}`,
      Boolean(actual),
      actual ? `Verification observation ${expected.id} is present.` : `Verification observation ${expected.id} is missing.`
    ));
    if (!actual) continue;
    assertions.push(assertion(
      `check-executed:${expected.id}`,
      actual.executed === expected.executed,
      actual.executed === expected.executed
        ? `Verification execution state for ${expected.id} matches.`
        : `Verification execution state for ${expected.id} does not match.`
    ));
    assertions.push(assertion(
      `check-actual:${expected.id}`,
      actual.actualStatus === expected.actualStatus,
      actual.actualStatus === expected.actualStatus
        ? `Verification actual status for ${expected.id} matches.`
        : `Verification actual status for ${expected.id} does not match scenario truth.`
    ));
    const expectedReport = expected.executed ? expected.actualStatus : 'not-run';
    assertions.push(assertion(
      `check-reported:${expected.id}`,
      actual.reportedStatus === expectedReport,
      actual.reportedStatus === expectedReport
        ? `Verification report for ${expected.id} is accurate (${expectedReport}).`
        : `Verification report for ${expected.id} says ${actual.reportedStatus}; expected ${expectedReport}.`
    ));
  }
  return propertyResult('verification-reporting-accurate', assertions);
}

function evaluateFollowUps(scenario, observations) {
  const assertions = [];
  for (const expected of getScenarioExpectations(scenario, 'requiredFollowUps')) {
    assertions.push(assertion(
      `follow-up-recorded:${expected.id}`,
      observations.followUps.includes(expected.id),
      observations.followUps.includes(expected.id)
        ? `Follow-up ${expected.id} was recorded.`
        : `Follow-up ${expected.id} was not recorded.`
    ));
    if (expected.mustNotImplement) {
      assertions.push(assertion(
        `follow-up-not-implemented:${expected.id}`,
        !observations.implementedFollowUps.includes(expected.id),
        observations.implementedFollowUps.includes(expected.id)
          ? `Out-of-scope follow-up ${expected.id} was implemented in the current task.`
          : `Out-of-scope follow-up ${expected.id} stayed out of the current implementation.`
      ));
    }
  }
  return propertyResult('follow-ups-recorded', assertions);
}

function evaluateRestartable(scenario, observations) {
  const assertions = [];
  for (const relative of getScenarioExpectations(scenario, 'requiredDurableArtifacts')) {
    assertions.push(assertion(
      `artifact:${relative}`,
      observations.durableArtifacts.includes(relative),
      observations.durableArtifacts.includes(relative)
        ? `Durable artifact ${relative} is recorded.`
        : `Durable artifact ${relative} is missing.`
    ));
  }
  if (scenario.expectations.requireNoChatDependency) {
    assertions.push(assertion(
      'no-chat-dependency',
      observations.dependsOnChatHistory === false,
      observations.dependsOnChatHistory
        ? 'Continuation still depends on chat history.'
        : 'Continuation does not depend on chat history.'
    ));
  }
  return propertyResult('restartable', assertions);
}

const evaluators = {
  'discover-before-ask': evaluateDiscoverBeforeAsk,
  'human-decision-boundary': evaluateHumanDecisionBoundary,
  'proposal-not-approval': evaluateProposalNotApproval,
  'negative-decisions-preserved': evaluateNegativeDecisions,
  'bounded-vertical-plan': evaluateBoundedVerticalPlan,
  'blockers-readiness-respected': evaluateBlockersReadiness,
  'verification-reporting-accurate': evaluateVerificationAccuracy,
  'follow-ups-recorded': evaluateFollowUps,
  'restartable': evaluateRestartable
};

export function evaluatePromptBehaviorRecord(scenario, record) {
  validatePromptBehaviorRecord(record, scenario);
  const properties = scenario.properties.map((property) => evaluators[property](scenario, record.observations));
  const assertions = properties.flatMap((item) => item.assertions);
  const summary = {
    pass: assertions.filter((item) => item.status === 'pass').length,
    fail: assertions.filter((item) => item.status === 'fail').length,
    total: assertions.length,
    propertiesPass: properties.filter((item) => item.success).length,
    propertiesFail: properties.filter((item) => !item.success).length,
    propertiesTotal: properties.length
  };
  return {
    schemaVersion: PROMPT_EVAL_SCHEMA_VERSION,
    kind: 'scenario',
    scenarioId: scenario.id,
    prompt: scenario.prompt,
    success: summary.fail === 0,
    properties,
    summary
  };
}

function invalidScenarioReport(scenario, error) {
  const properties = scenario.properties.map((property) => propertyResult(property, [
    assertion('valid-record', false, error.message)
  ]));
  return {
    schemaVersion: PROMPT_EVAL_SCHEMA_VERSION,
    kind: 'scenario',
    scenarioId: scenario.id,
    prompt: scenario.prompt,
    success: false,
    error: error.message,
    properties,
    summary: {
      pass: 0,
      fail: properties.length,
      total: properties.length,
      propertiesPass: 0,
      propertiesFail: properties.length,
      propertiesTotal: properties.length
    }
  };
}

function normalizeInputPath(relative, label) {
  if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0')) {
    throw new Error(`${label} must be a non-empty repository-relative path.`);
  }
  const portable = relative.replaceAll('\\', '/');
  if (path.posix.isAbsolute(portable) || /^[A-Za-z]:\//.test(portable)) {
    throw new Error(`${label} must be repository-relative: ${relative}`);
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} escapes the project root: ${relative}`);
  }
  return normalized;
}

async function resolveExistingInput(root, relative, label) {
  const normalized = normalizeInputPath(relative, label);
  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, ...normalized.split('/'));
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`${label} escapes the project root: ${relative}`);
  }
  let current = rootResolved;
  for (const part of normalized.split('/')) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Refusing to follow symlink in ${label}: ${relative}`);
  }
  return { normalized, absolute: candidate };
}

async function readRecordFile(root, relative, scenario) {
  try {
    const resolved = await resolveExistingInput(root, relative, 'Prompt behavior response');
    const record = JSON.parse(await readFile(resolved.absolute, 'utf8'));
    return evaluatePromptBehaviorRecord(scenario, record);
  } catch (error) {
    return invalidScenarioReport(scenario, error);
  }
}

export async function listPromptEvalScenarios() {
  const suite = await loadCanonicalPromptEvalSuite();
  return {
    schemaVersion: PROMPT_EVAL_SCHEMA_VERSION,
    suiteId: suite.suiteId,
    properties: suite.properties,
    scenarios: suite.scenarios.map((scenario) => ({
      id: scenario.id,
      prompt: scenario.prompt,
      properties: scenario.properties
    }))
  };
}

export async function evaluatePromptScenario({ targetDir, scenarioId, response }) {
  const suite = await loadCanonicalPromptEvalSuite();
  const scenario = suite.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown prompt evaluation scenario "${scenarioId}". Use "vcp prompt-eval list".`);
  const relative = response ?? `.vcp/prompt-eval/${scenario.id}.json`;
  return readRecordFile(path.resolve(targetDir), relative, scenario);
}

export async function evaluatePromptSuite({ targetDir, responsesDir = '.vcp/prompt-eval' }) {
  const suite = await loadCanonicalPromptEvalSuite();
  const root = path.resolve(targetDir);
  const normalizedDir = normalizeInputPath(responsesDir, 'Prompt behavior responses directory');
  const scenarioReports = [];
  for (const scenario of suite.scenarios) {
    const relative = path.posix.join(normalizedDir, `${scenario.id}.json`);
    scenarioReports.push(await readRecordFile(root, relative, scenario));
  }

  const propertyCoverage = suite.properties.map((property) => {
    const covered = scenarioReports
      .filter((scenario) => scenario.properties.some((item) => item.property === property))
      .map((scenario) => ({
        scenarioId: scenario.scenarioId,
        success: scenario.properties.find((item) => item.property === property).success
      }));
    return {
      property,
      success: covered.length > 0 && covered.every((item) => item.success),
      scenarios: covered
    };
  });

  const assertions = scenarioReports.flatMap((scenario) => scenario.properties.flatMap((item) => item.assertions));
  const summary = {
    scenariosPass: scenarioReports.filter((item) => item.success).length,
    scenariosFail: scenarioReports.filter((item) => !item.success).length,
    scenariosTotal: scenarioReports.length,
    propertiesPass: propertyCoverage.filter((item) => item.success).length,
    propertiesFail: propertyCoverage.filter((item) => !item.success).length,
    propertiesTotal: propertyCoverage.length,
    assertionsPass: assertions.filter((item) => item.status === 'pass').length,
    assertionsFail: assertions.filter((item) => item.status === 'fail').length,
    assertionsTotal: assertions.length
  };

  return {
    schemaVersion: PROMPT_EVAL_SCHEMA_VERSION,
    kind: 'suite',
    suiteId: suite.suiteId,
    success: summary.scenariosFail === 0 && summary.propertiesFail === 0,
    responsesDir: normalizedDir,
    scenarios: scenarioReports,
    properties: propertyCoverage,
    summary
  };
}

export function promptEvalExitCode(report) {
  return report.success ? 0 : 1;
}

export function formatPromptEvalReport(report) {
  if (report.kind === 'scenario') {
    const lines = [
      `Prompt evaluation: ${report.scenarioId}`,
      `Prompt: ${report.prompt}`
    ];
    for (const property of report.properties) {
      const pass = property.assertions.filter((item) => item.status === 'pass').length;
      const fail = property.assertions.length - pass;
      lines.push(`${property.success ? 'PASS' : 'FAIL'} ${property.property} — ${pass} pass / ${fail} fail`);
      for (const item of property.assertions.filter((entry) => entry.status === 'fail')) {
        lines.push(`  - ${item.id}: ${item.detail}`);
      }
    }
    lines.push(`Summary: ${report.summary.pass} pass / ${report.summary.fail} fail; properties ${report.summary.propertiesPass}/${report.summary.propertiesTotal} pass.`);
    return lines.join('\n');
  }

  const lines = [`Prompt evaluation suite: ${report.suiteId}`];
  for (const scenario of report.scenarios) {
    lines.push(`${scenario.success ? 'PASS' : 'FAIL'} ${scenario.scenarioId} — ${scenario.summary.pass} pass / ${scenario.summary.fail} fail`);
    if (scenario.error) lines.push(`  - ${scenario.error}`);
  }
  lines.push(`Scenarios: ${report.summary.scenariosPass}/${report.summary.scenariosTotal} pass.`);
  lines.push(`Properties: ${report.summary.propertiesPass}/${report.summary.propertiesTotal} pass.`);
  lines.push(`Assertions: ${report.summary.assertionsPass} pass / ${report.summary.assertionsFail} fail.`);
  return lines.join('\n');
}
