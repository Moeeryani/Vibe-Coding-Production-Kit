// Phase 8 invocation contract: selection resolution, ref fail-closed,
// stable job identity, and the local-evidence vs enforcement distinction.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGateInvocation } from '../lib/ci-gate-invocation.mjs';
import { validateGatePolicy, defaultGatePolicy } from '../lib/ci-gate-policy.mjs';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

test('explicit selector with resolved SHAs produces the exact gate command', () => {
  const c = buildGateInvocation({ provider: 'gitlab', selectors: ['fix-login'], baseSha: BASE, headSha: HEAD });
  assert.equal(c.mode, 'GATE_RUN');
  assert.equal(c.jobName, 'vcp-gate');
  assert.deepEqual(c.command.argv, ['vcp', 'gate', 'fix-login', '--base', BASE, '--head', HEAD, '--run', '--json']);
  assert.equal(c.checkOutcome, 'PASS_ONLY_IF_L0');
  assert.deepEqual(c.blockers, []);
  assert.equal(c.enforcement.providerEnforced, false);
  assert.equal(c.enforcement.mergeProtectionObserved, false);
  assert.equal(c.enforcement.localEvidenceOnly, true);
  assert.match(c.enforcement.toEnforce, /branch protection/);
  assert.ok(c.snippet.text.includes('vcp-gate'));
});

test('no selector attempts L0 only, with no task in the command', () => {
  const c = buildGateInvocation({ provider: 'github', selectors: [], baseSha: BASE, headSha: HEAD });
  assert.equal(c.mode, 'L0_ATTEMPT');
  assert.deepEqual(c.command.argv, ['vcp', 'gate', '--base', BASE, '--head', HEAD, '--run', '--json']);
  assert.equal(c.selection.kind, 'NONE');
  assert.match(c.selection.message, /provide one VCP task selector/);
});

test('multiple selectors block with no command and no snippet', () => {
  const c = buildGateInvocation({ provider: 'gitlab', selectors: ['a-task', 'b-task'], baseSha: BASE, headSha: HEAD });
  assert.equal(c.mode, 'BLOCKED');
  assert.ok(c.blockers.includes('MULTIPLE_TASK_SELECTORS'));
  assert.equal(c.command, null);
  assert.equal(c.snippet, null);
  assert.equal(c.checkOutcome, 'BLOCK');
});

test('invalid selector slug blocks instead of silently vanishing', () => {
  const c = buildGateInvocation({ provider: 'gitlab', selectors: ['Bad_Slug'], baseSha: BASE, headSha: HEAD });
  assert.equal(c.mode, 'BLOCKED');
  assert.ok(c.blockers.includes('INVALID_TASK_SELECTOR'));
  assert.equal(c.command, null);
});

test('missing, malformed, identical, and shallow refs all fail closed', () => {
  const cases = [
    [{ baseSha: null, headSha: HEAD }, 'MISSING_BASE_HEAD'],
    [{ baseSha: BASE, headSha: null }, 'MISSING_BASE_HEAD'],
    [{ baseSha: 'xyz', headSha: HEAD }, 'INVALID_SHA'],
    [{ baseSha: BASE, headSha: BASE }, 'IDENTICAL_BASE_HEAD'],
    [{ baseSha: BASE, headSha: HEAD, isShallow: true }, 'SHALLOW_HISTORY'],
  ];
  for (const [refs, blocker] of cases) {
    const c = buildGateInvocation({ provider: 'azure', selectors: ['fix-login'], ...refs });
    assert.equal(c.mode, 'BLOCKED');
    assert.ok(c.blockers.includes(blocker), `${blocker} missing for ${JSON.stringify(refs)}`);
    assert.equal(c.command, null);
  }
});

test('unknown provider throws; policy-disallowed provider blocks', () => {
  assert.throws(() => buildGateInvocation({ provider: 'bitbucket', selectors: [], baseSha: BASE, headSha: HEAD }), /E_CI_PROVIDER/);
  const c = buildGateInvocation({ provider: 'azure', selectors: [], baseSha: BASE, headSha: HEAD, policy: { allowedProviders: ['github'] } });
  assert.equal(c.mode, 'BLOCKED');
  assert.ok(c.blockers.includes('PROVIDER_NOT_ALLOWED'));
});

test('policy validation is strict and shallow tolerance is not a flag', () => {
  assert.equal(defaultGatePolicy().stableJobName, 'vcp-gate');
  assert.throws(() => validateGatePolicy({ version: 1, stableJobName: 'Bad Name' }), /E_CI_POLICY_JOB_NAME/);
  assert.throws(() => validateGatePolicy({ version: 1, unknownField: true }), /E_CI_POLICY_UNKNOWN_FIELD/);
  assert.throws(() => validateGatePolicy({ version: 2 }), /E_CI_POLICY_VERSION/);
  assert.throws(() => validateGatePolicy({ version: 1, requireFullHistory: false }), /E_CI_POLICY_SHALLOW_NOT_ALLOWED/);
  assert.equal(validateGatePolicy({ version: 1, stableJobName: 'my-gate' }).stableJobName, 'my-gate');
  const c = buildGateInvocation({ provider: 'gitlab', selectors: [], baseSha: BASE, headSha: HEAD, policy: { allowL0CheckPass: false } });
  assert.equal(c.checkOutcome, 'BLOCK');
});

test('custom CI needs explicit policy opt-in, then gets a command but no snippet', () => {
  const blocked = buildGateInvocation({ provider: 'custom', selectors: ['fix-login'], baseSha: BASE, headSha: HEAD });
  assert.equal(blocked.mode, 'BLOCKED');
  assert.ok(blocked.blockers.includes('PROVIDER_NOT_ALLOWED'));
  const c = buildGateInvocation({ provider: 'custom', selectors: ['fix-login'], baseSha: BASE, headSha: HEAD, policy: { allowedProviders: ['custom'] } });
  assert.equal(c.mode, 'GATE_RUN');
  assert.equal(c.snippet, null);
  assert.match(c.snippetNote, /manually/);
});
