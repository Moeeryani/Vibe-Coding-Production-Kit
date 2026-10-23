// RED-first tests for the layer-aware assertion helper. The bug being
// regression-tested is the helper's own failure mode: accepting an earlier
// guard's rejection as proof of a later layer.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { LAYER, LAYER_ORDER, LAYER_PRODUCTION_BRANCH } from './helpers/writer-layers.mjs';
import { requireLayer, assertLayerPassed, Outcome } from './helpers/layer-assertion.mjs';

const throwCode = async (code) => { const e = new Error(`${code}: synthetic`); e.code = code; throw e; };

test('LA-01 — intended layer rejects: PASS', async () => {
  const o = await requireLayer(() => throwCode(LAYER.WRITER_IDENTITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.CAPABILITY, LAYER.DURABILITY, LAYER.PRINCIPAL],
  });
  assert.equal(o.status, 'PASS');
  assert.equal(o.actual, LAYER.WRITER_IDENTITY);
  assert.doesNotThrow(() => assertLayerPassed(o));
});

test('LA-02 — earlier guard rejects first: BLOCKED, never PASS', async () => {
  // Exactly the B9-01 Windows defect: the capability lane rejects before the
  // writer's own identity check can run.
  const o = await requireLayer(() => throwCode(LAYER.CAPABILITY), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.CAPABILITY, LAYER.DURABILITY, LAYER.PRINCIPAL],
  });
  assert.equal(o.status, 'BLOCKED');
  assert.equal(o.preemptedBy, LAYER.CAPABILITY);
  assert.equal(o.passed, false);
  assert.match(String(o), /INCONCLUSIVE/i);
  assert.throws(() => assertLayerPassed(o), (e) => e.code === 'E_TEST_INCONCLUSIVE');
});

test('LA-03 — unrelated error code: FAIL as an attribution defect', async () => {
  const o = await requireLayer(() => throwCode('E_TOTALLY_UNRELATED'), {
    intended: LAYER.WRITER_IDENTITY,
    guardsBefore: [LAYER.CAPABILITY],
  });
  assert.equal(o.status, 'FAIL');
  assert.equal(o.actual, 'E_TOTALLY_UNRELATED');
  assert.match(o.message, /attribution defect/);
  assert.throws(() => assertLayerPassed(o), (e) => e.code === 'E_TEST_ASSERTION');
});

test('LA-04 — transaction completes without rejecting: FAIL', async () => {
  const o = await requireLayer(async () => {}, {
    intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY],
  });
  assert.equal(o.status, 'FAIL');
  assert.equal(o.actual, 'NO_ERROR');
});

test('LA-05 — guardsBefore must strictly precede the intended layer', async () => {
  // Listing the intended layer itself as a "guard" would let it self-certify.
  await assert.rejects(
    () => requireLayer(async () => {}, {
      intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.WRITER_IDENTITY],
    }),
    /must all precede/);
  await assert.rejects(
    () => requireLayer(async () => {}, {
      intended: LAYER.CAPABILITY, guardsBefore: [LAYER.WRITER_IDENTITY],
    }),
    /must all precede/);
});

test('LA-06 — unknown layer names are refused, not silently tolerated', async () => {
  for (const cfg of [
    { intended: 'E_NOT_A_LAYER', guardsBefore: [] },
    { intended: LAYER.WRITER_IDENTITY, guardsBefore: ['E_NOT_A_LAYER'] },
  ]) {
    await assert.rejects(() => requireLayer(async () => {}, cfg), /Unknown enforcement layer/);
  }
});

test('LA-07 — layer order matches the production writer sequence', async () => {
  // Guards the ordering claim: the controlled lane's capability checks run at
  // step 2, the lock's durability refusal at step 3, principal at step 4,
  // B-9 pinning at step 4b, and the post-mutation re-verification at step 5b
  // — after the mutation, therefore last.
  const idx = (c) => LAYER_ORDER.indexOf(c);
  assert.ok(idx(LAYER.BOUNDARY) < idx(LAYER.CAPABILITY_INVALID));
  // verifyTestCapability order: forgery -> scope -> identity.
  assert.ok(idx(LAYER.CAPABILITY_INVALID) < idx(LAYER.CAPABILITY_SCOPE));
  assert.ok(idx(LAYER.CAPABILITY_SCOPE) < idx(LAYER.CAPABILITY));
  assert.ok(idx(LAYER.CAPABILITY) < idx(LAYER.DURABILITY));
  assert.ok(idx(LAYER.DURABILITY) < idx(LAYER.PRINCIPAL));
  assert.ok(idx(LAYER.PRINCIPAL) < idx(LAYER.WRITER_IDENTITY));
  // step 5b runs after the mutation, so it is the last layer.
  assert.ok(idx(LAYER.WRITER_IDENTITY) < idx(LAYER.CAPABILITY_REVERIFY));
  assert.equal(idx(LAYER.CAPABILITY_REVERIFY), LAYER_ORDER.length - 1);
  assert.equal(LAYER_ORDER.length, 8);
  assert.equal(new Set(LAYER_ORDER).size, LAYER_ORDER.length, 'layer order has no duplicates');
});

test('LA-11 — the G-FENCE production branch is refused in guardsBefore', async () => {
  // FINDING-001 (2026-10-23): step 2 of the writer transaction is a CHOICE.
  // A controlled test capability REPLACES the G-FENCE gate, so G-FENCE never
  // executes in the controlled lane and cannot preempt anything. B4-03 listed
  // it in guardsBefore, which asserted a guard that never runs — and, because
  // the old layer order placed G_FENCE after CAPABILITY, it also made the
  // harness reject the claim outright. The harness must now refuse it with an
  // explanation instead of tolerating it.
  await assert.rejects(
    () => requireLayer(async () => {}, {
      intended: LAYER.CAPABILITY, guardsBefore: [LAYER.BOUNDARY, LAYER.G_FENCE],
    }),
    /production alternative at step 2/);
  await assert.rejects(
    () => requireLayer(async () => {}, {
      intended: LAYER.CAPABILITY_REVERIFY,
      guardsBefore: [LAYER.BOUNDARY, LAYER.CAPABILITY, LAYER.G_FENCE],
    }),
    /production alternative at step 2/);
  // The G-FENCE layer itself is still a known layer: it is the production
  // alternative, not an unknown name.
  assert.ok(LAYER_PRODUCTION_BRANCH.includes(LAYER.G_FENCE));
  assert.equal(LAYER_ORDER.includes(LAYER.G_FENCE), false,
    'G-FENCE is not a link in the controlled lane\'s chain');
});

test('LA-08 — error without a code property is FAIL, not a crash', async () => {
  const o = await requireLayer(async () => { throw new Error('codeless'); }, {
    intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY],
  });
  assert.equal(o.status, 'FAIL');
  assert.equal(o.actual, 'E_NO_CODE');
});

test('LA-09 — Outcome shape is machine-readable for the evidence matrix', async () => {
  const o = new Outcome('BLOCKED', { intended: LAYER.WRITER_IDENTITY, actual: LAYER.DURABILITY, preemptedBy: LAYER.DURABILITY });
  assert.deepEqual(
    { status: o.status, intended: o.intended, preemptedBy: o.preemptedBy },
    { status: 'BLOCKED', intended: LAYER.WRITER_IDENTITY, preemptedBy: LAYER.DURABILITY });
});

test('LA-10 — evidence sink records each verdict when VCP_LAYER_EVIDENCE is set', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const os = await import('node:os');
  // os.tmpdir(), not process.env.TMPDIR: on Windows TMPDIR is ignored by
  // libuv, and an unset TMPDIR made this path 'undefined/la10-' on Linux CI.
  const dir = mkdtempSync(path.join(os.tmpdir(), 'la10-'));
  const previousSink = process.env.VCP_LAYER_EVIDENCE;
  process.env.VCP_LAYER_EVIDENCE = path.join(dir, 'sink.jsonl');
  try {
    const passed = await requireLayer(() => throwCode(LAYER.WRITER_IDENTITY),
      { intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY] });
    assertLayerPassed(passed);
    const blocked = await requireLayer(() => throwCode(LAYER.CAPABILITY),
      { intended: LAYER.WRITER_IDENTITY, guardsBefore: [LAYER.CAPABILITY] });
    assert.throws(() => assertLayerPassed(blocked), (e) => e.code === 'E_TEST_INCONCLUSIVE');
    const lines = readFileSync(process.env.VCP_LAYER_EVIDENCE, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines.length, 2, 'one line per verdict');
    assert.equal(lines[0].status, 'PASS');
    assert.equal(lines[1].status, 'BLOCKED');
    assert.equal(lines[1].preemptedBy, LAYER.CAPABILITY);
    assert.equal(lines[1].platform, process.platform);
  } finally {
    // Restore, never delete: an outer runner may have set the sink.
    if (previousSink === undefined) delete process.env.VCP_LAYER_EVIDENCE;
    else process.env.VCP_LAYER_EVIDENCE = previousSink;
    rmSync(dir, { recursive: true, force: true });
  }
});
