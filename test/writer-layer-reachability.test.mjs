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
import { lifecycleDurabilityCapability } from '../lib/file-durability.mjs';
import { requireLayer, assertLayerPassed, REACH } from './helpers/layer-assertion.mjs';
import { LAYER } from './helpers/writer-layers.mjs';

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
  // The attack Phase B.1 must close: list every guard, then claim the far layer.
  const outcome = await requireLayer(() => throwCode(LAYER.CAPABILITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.BOUNDARY, LAYER.CAPABILITY_INVALID, LAYER.CAPABILITY_SCOPE,
                   LAYER.CAPABILITY, LAYER.G_FENCE, LAYER.DURABILITY, LAYER.PRINCIPAL],
  });
  assert.notEqual(outcome.status, 'PASS');
  assert.equal(outcome.status, 'BLOCKED');
  assert.throws(() => assertLayerPassed(outcome), (e) => e.code === 'E_TEST_INCONCLUSIVE');
});

test('B-10 — completion is FAIL even when guards are listed, never an accidental PASS', async () => {
  const outcome = await requireLayer(async () => 'ok', {
    intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY],
  });
  assert.equal(outcome.status, 'FAIL');
  assert.equal(outcome.actual, 'NO_ERROR');
});
