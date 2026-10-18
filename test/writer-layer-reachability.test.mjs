// Phase B.1/B.2 regressions.
// Two defects being closed:
//  1. lifecycleDurabilityCapability(undefined) reported a WINDOWS-specific reason
//     because the win32 test ran before the allow-list test. An unset/absent
//     platform must not be attributed to Windows.
//  2. requireLayer accepted a guardsBefore list as an unproven assertion that
//     earlier guards were passed. A PASS must now carry EVIDENCE of how the
//     intended layer was reached, and BLOCKED must state the reachability ceiling.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lifecycleDurabilityCapability } from '../lib/file-durability.mjs';
import { requireLayer, assertLayerPassed, REACH } from './helpers/layer-assertion.mjs';
import {
  LAYER, PREEMPTING_TEST_LANE, PREEMPTING_PRODUCTION_LANE,
} from './helpers/writer-layers.mjs';

const throwCode = async (code) => { const e = new Error(`${code}: synthetic`); e.code = code; throw e; };

test('B-01 — an absent platform is not reported as a Windows condition', () => {
  // NOTE: passing `undefined` explicitly triggers the default parameter
  // (process.platform), so on a Windows host it legitimately reports win32.
  // The genuine "absent platform" sentinels are null and ''.
  for (const v of [null, '', '  ']) {
    const cap = lifecycleDurabilityCapability(v);
    assert.equal(cap.supported, false, `${JSON.stringify(v)} must fail closed`);
    assert.doesNotMatch(cap.reason, /WINDOWS/,
      `reason for ${JSON.stringify(v)} must not claim Windows: ${cap.reason}`);
    assert.match(cap.reason, /UNREVIEWED|UNSUPPORTED_PLATFORM/);
  }
});

test('B-02 — the exact win32 reason is reserved for the actual win32 string', () => {
  assert.match(lifecycleDurabilityCapability('win32').reason, /WINDOWS_NAMESPACE_DURABILITY_UNPROVEN/);
  assert.match(lifecycleDurabilityCapability('WIN32').reason, /UNREVIEWED|UNSUPPORTED_PLATFORM/,
    'case must be exact, not case-insensitive');
});

test('B-03 — only allow-listed platforms are supported, and say why', () => {
  const cap = lifecycleDurabilityCapability('linux');
  assert.equal(cap.supported, true);
  assert.equal(cap.reason, 'DIRECTORY_FSYNC_PROBE_REQUIRED',
    'supported is a CONTRACT, not a proof: callers must still probe');
});

test('B-04 — PASS requires reachability evidence, not an unproven guards list', async () => {
  const outcome = await requireLayer(() => throwCode(LAYER.WRITER_IDENTITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.CAPABILITY, LAYER.DURABILITY],
    witness: REACH.CODE_IDENTIFIES_LAYER,   // declared: the code alone identifies the layer
  });
  assert.equal(outcome.status, 'PASS');
  assert.equal(outcome.reachability, REACH.CODE_IDENTIFIES_LAYER,
    'a PASS must record HOW it knows the intended layer executed');
});

test('B-05 — default reachability is asserted, which is NOT proof of arrival', async () => {
  const o1 = await requireLayer(() => throwCode(LAYER.WRITER_IDENTITY),
    { intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY] });
  assert.equal(o1.reachability, REACH.CODE_IDENTIFIES_LAYER,
    'default must be the honest weakest claim, never "witnessed"');
  const o2 = await requireLayer(() => throwCode(LAYER.CAPABILITY),
    { intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY] });
  assert.equal(o2.status, 'BLOCKED');
  assert.equal(o2.reachability, REACH.GUARD_ORDER_ASSERTED);
});

test('B-06 — BLOCKED must state a reachability ceiling when one exists', async () => {
  const outcome = await requireLayer(() => throwCode(LAYER.DURABILITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.CAPABILITY, LAYER.DURABILITY, LAYER.PRINCIPAL],
    ceiling: LAYER.DURABILITY,   // nothing at or after the ceiling can execute
  });
  assert.equal(outcome.status, 'BLOCKED');
  assert.equal(outcome.ceiling, LAYER.DURABILITY);
  assert.match(String(outcome), /UNREACHABLE on this platform/,
    'the message must say the layer is UNREACHABLE, not merely "not reached this time"');
});

test('B-07 — a ceiling earlier than every guard is rejected as a misconfiguration', async () => {
  await assert.rejects(() => requireLayer(async () => {}, {
    intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY],
    ceiling: LAYER.BOUNDARY,
  }), /ceiling must not precede/);
});

test('B-08 — witness values are validated, so a test cannot invent a proof class', async () => {
  await assert.rejects(() => requireLayer(() => throwCode(LAYER.WRITER_IDENTITY), {
    intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY],
    witness: 'I_SAW_IT',
  }), /Unknown reachability witness/);
});

test('B-09 — padding guardsBefore still cannot manufacture a PASS', async () => {
  // The attack Phase B.1 must close: list every guard that can precede in THIS
  // lane, then claim the far layer. G_FENCE is excluded because a capability-lane
  // run never evaluates the production gate — see B-11.
  const outcome = await requireLayer(() => throwCode(LAYER.CAPABILITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.BOUNDARY, LAYER.CAPABILITY_INVALID, LAYER.CAPABILITY_SCOPE,
                   LAYER.CAPABILITY, LAYER.DURABILITY, LAYER.PRINCIPAL],
  });
  assert.notEqual(outcome.status, 'PASS');
  assert.equal(outcome.status, 'BLOCKED');
  assert.throws(() => assertLayerPassed(outcome), (e) => e.code === 'E_TEST_INCONCLUSIVE');
});

// FINDING-001 (Linux validation): B4-03 named G_FENCE as a guard preceding a
// CAPABILITY assertion. LAYER_ORDER put G_FENCE after CAPABILITY, so requireLayer's
// own ordering rule threw the moment a host reached the body — Windows had masked it
// behind the durability gate. The deeper error was the pairing itself:
// runWriterTransaction chooses `verifyTestCapability()` OR `authorizeV2Operation()`
// (production-writer.mjs:81-87), so one run cannot be pre-empted by both.
test('B-12 — the capability site B4-03 claims must exist AFTER the mutation', async () => {
  // Why this is structural: B4-03 is wrapped in mutationTest, so on win32 the
  // durability gate refuses the mutation and the runtime path can never be
  // observed here. A mutation of step 5b would therefore read MISSED, and an
  // invisible detector is not a detector. Placement is checked in the source
  // that performs it, which IS observable on every host, and the runtime claim
  // stays with B4-03 for hosts that can reach it.
  const src = readFileSync(path.join(import.meta.dirname, '..', 'lib',
    'production-writer.mjs'), 'utf8');
  const body = src.slice(src.indexOf('export async function runWriterTransaction'));
  assert.ok(body.length > 200, 'runWriterTransaction body not found — scan would be vacuous');

  const mutateCall = body.indexOf('const result=await mutate(');
  const reverify = body.indexOf('await reverify(testCapability');
  assert.ok(mutateCall > 0, 'the mutate() call site disappeared from runWriterTransaction');
  assert.ok(reverify > 0,
    'step 5b capability re-verification is gone — B4-03 would claim a site that no longer runs');
  assert.ok(reverify > mutateCall,
    're-verification must come after mutate(), or it cannot detect a mid-mutation replacement');

  // It must be the capability verifier being re-run, not some other call, and it
  // must be conditional on the test lane (the production lane has no capability).
  const between = body.slice(mutateCall, reverify);
  assert.match(between, /if\(testCapability\)/,
    'step 5b must apply to the capability lane specifically');
  assert.match(body.slice(0, reverify), /verifyTestCapability/,
    'step 5b must re-run the same verifier used at authorization');

  // The evidence hook runs after 5b, so a refused re-verification cannot write a
  // success record.
  const evidence = body.indexOf('await recordWriterEvidence(');
  assert.ok(evidence > reverify,
    'evidence must be recorded only after post-mutation re-verification succeeds');
});

test('B-11 — guardsBefore cannot mix the two mutually exclusive authorization lanes', async () => {
  // The pairing that B4-03 actually used: ordering alone already forbids it,
  // because G_FENCE sits after CAPABILITY in LAYER_ORDER. Asserted separately so
  // the two rules are not confused for one another.
  await assert.rejects(() => requireLayer(() => throwCode(LAYER.CAPABILITY), {
    intended: LAYER.CAPABILITY, guardsBefore: [LAYER.BOUNDARY, LAYER.G_FENCE],
  }), /must all precede the intended layer/,
    'a guard listed after its intended layer must be rejected by the ordering rule');

  // The case ordering cannot catch: both guards precede DURABILITY, but they come
  // from opposite authorization branches, so no single run can be pre-empted by
  // both. This is the shape B9-01b used to carry.
  const mixed = () => requireLayer(() => throwCode(LAYER.DURABILITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.BOUNDARY, LAYER.CAPABILITY, LAYER.G_FENCE],
  });
  await assert.rejects(mixed(), /mixes authorization lanes/,
    'a lane-mixing guard list must be rejected, not resolved by code match');

  // Mirror case: a production-lane assertion naming a capability guard.
  await assert.rejects(() => requireLayer(() => throwCode(LAYER.DURABILITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.BOUNDARY, LAYER.G_FENCE, LAYER.CAPABILITY_SCOPE],
  }), /mixes authorization lanes/);

  // Each lane on its own stays expressible, so this is a lane rule and not a
  // blanket ban on guardsBefore.
  const okTest = await requireLayer(() => throwCode(LAYER.CAPABILITY), {
    intended: LAYER.CAPABILITY, guardsBefore: PREEMPTING_TEST_LANE,
  });
  assert.equal(okTest.status, 'PASS');
  const okProd = await requireLayer(() => throwCode(LAYER.G_FENCE), {
    intended: LAYER.DURABILITY, guardsBefore: PREEMPTING_PRODUCTION_LANE,
  });
  assert.equal(okProd.status, 'BLOCKED');
});

test('B-10 — completion is FAIL even when guards are listed, never an accidental PASS', async () => {
  const outcome = await requireLayer(async () => 'ok', {
    intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY],
  });
  assert.equal(outcome.status, 'FAIL');
  assert.equal(outcome.actual, 'NO_ERROR');
});
