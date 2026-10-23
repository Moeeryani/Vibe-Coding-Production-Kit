// Phase 1 repair harness — classifies a test outcome by ENFORCEMENT LAYER.
// Root cause of the Windows false positives: assertions of the form
//   assert.rejects(op, /CODE_A|CODE_B/)
// accept a rejection raised by an EARLIER guard, so the suite reports PASS
// while the intended layer never executed. This module makes the layer a
// first-class, asserted fact: PASS requires the intended code, BLOCKED
// requires proof an earlier guard preempted it, and neither is a pass.
// test/helpers/writer-layers.mjs. A test that claims to prove a later layer
// is INCONCLUSIVE when an earlier guard raises first.
import { appendFileSync } from 'node:fs';
import test from 'node:test';
import { LAYER, LAYER_ORDER, LAYER_PRODUCTION_BRANCH } from './writer-layers.mjs';

// How a verdict KNOWS the intended layer executed. Ranked weakest → strongest;
// a guardsBefore list is an assertion about code order, not an observation, so
// it is never recorded as proof of arrival.
export const REACH = Object.freeze({
  // a guard that precedes the intended layer raised first: nothing at or after
  // the guard's position executed
  GUARD_ORDER_ASSERTED: 'GUARD_ORDER_ASSERTED',
  // the raised code is produced at exactly one site in lib/, so the code
  // identity itself locates the executing layer
  CODE_IDENTIFIES_LAYER: 'CODE_IDENTIFIES_LAYER',
  // an execution marker was observed at the intended layer (witnessed, not inferred)
  MARKER_OBSERVED: 'MARKER_OBSERVED',
});
const REACH_VALUES = new Set(Object.values(REACH));

export class Outcome {
  constructor(status, { intended, actual, preemptedBy = null, message = '',
    reachability, ceiling = null } = {}) {
    this.status = status;           // 'PASS' | 'BLOCKED' | 'FAIL'
    this.intended = intended;       // error code the test claims to prove
    this.actual = actual;           // error code actually observed
    this.preemptedBy = preemptedBy; // earlier guard code that ran first
    this.message = message;
    this.reachability = reachability;
    this.ceiling = ceiling;         // layer at/after which nothing can execute
  }
  get passed() { return this.status === 'PASS'; }
  toString() {
    if (this.status === 'BLOCKED') {
      const ceil = this.ceiling
        ? ` — layer ${this.intended} is UNREACHABLE on this platform (ceiling ${this.ceiling})`
        : ` — preempted by earlier guard ${this.preemptedBy}`;
      return `BLOCKED / INCONCLUSIVE — intended ${this.intended}${ceil}`;
    }
    return `${this.status} — intended ${this.intended}, actual ${this.actual}` +
      (this.status === 'PASS' ? ` [${this.reachability}]` : '');
  }
}

// Rejects when the observed error is not the one the test claims to prove.
// A preempting earlier guard yields BLOCKED (inconclusive), never PASS.
export async function requireLayer(op, { intended, guardsBefore = [],
  witness = null, ceiling = null } = {}) {
  if (!LAYER_ORDER.includes(intended))
    throw new Error(`Unknown enforcement layer for intended code: ${intended}`);
  for (const g of guardsBefore) {
    // FINDING-001 (2026-10-23): a production-branch layer is not a link in
    // the controlled lane's chain, it is the OTHER authorization path at
    // step 2. A test capability REPLACES the G-FENCE gate, so G_FENCE never
    // executes here and can never preempt anything. Listing it asserted a
    // guard that never runs, so it is refused outright instead of being
    // silently tolerated.
    if (LAYER_PRODUCTION_BRANCH.includes(g))
      throw new Error(
        `${g} is the production alternative at step 2, not a link in the ` +
        `controlled lane's chain: a test capability REPLACES the G-FENCE gate ` +
        `rather than running after it, so ${g} never executes in a controlled ` +
        `transaction and cannot preempt anything. Remove it from guardsBefore.`);
    if (!LAYER_ORDER.includes(g))
      throw new Error(`Unknown enforcement layer in guardsBefore: ${g}`);
  }
  if (guardsBefore.some((g) => LAYER_ORDER.indexOf(g) >= LAYER_ORDER.indexOf(intended)))
    throw new Error(`guardsBefore must all precede the intended layer: ${intended}`);
  if (witness !== null && !REACH_VALUES.has(witness))
    throw new Error(`Unknown reachability witness: ${witness}`);
  if (ceiling !== null) {
    if (!LAYER_ORDER.includes(ceiling))
      throw new Error(`Unknown reachability ceiling: ${ceiling}`);
    if (guardsBefore.length && LAYER_ORDER.indexOf(ceiling) < LAYER_ORDER.indexOf(guardsBefore[0]))
      throw new Error(`ceiling must not precede the guards it claims are passable: ${ceiling}`);
  }

  let error = null;
  let completed = false;
  try {
    await op();
    completed = true;
  } catch (e) {
    error = e;
  }

  if (completed) {
    return new Outcome('FAIL', {
      intended, actual: 'NO_ERROR', ceiling,
      reachability: witness ?? REACH.CODE_IDENTIFIES_LAYER,
      message: 'transaction completed; the control under test did not reject',
    });
  }
  const code = error?.code ?? 'E_NO_CODE';
  if (guardsBefore.includes(code)) {
    return new Outcome('BLOCKED', { intended, actual: code, preemptedBy: code,
      reachability: REACH.GUARD_ORDER_ASSERTED, ceiling });
  }
  if (code === intended) {
    return new Outcome('PASS', { intended, actual: code, ceiling,
      reachability: witness ?? REACH.CODE_IDENTIFIES_LAYER });
  }
  return new Outcome('FAIL', {
    intended, actual: code, ceiling,
    reachability: REACH.GUARD_ORDER_ASSERTED,
    message: `unexpected error code (attribution defect): ${error?.message ?? ''}`,
  });
}

// Asserts the outcome is PASS. BLOCKED throws with an explicit inconclusive
// message so a preempted test can never be silently counted as green.
// When VCP_LAYER_EVIDENCE names a file, every non-pass outcome is appended
// there as one machine-readable line, so a run can be classified into a
// PASS / FAIL / BLOCKED / NOT_PROVEN matrix without parsing test stdout.
export function assertLayerPassed(outcome) {
  if (outcome.status === 'PASS') { record(outcome); return; }
  const e = new Error(
    outcome.status === 'BLOCKED'
      ? `INCONCLUSIVE: ${outcome}`
      : `FAILED: ${outcome} — ${outcome.message}`);
  e.code = outcome.status === 'BLOCKED' ? 'E_TEST_INCONCLUSIVE' : 'E_TEST_ASSERTION';
  record(outcome);
  throw e;
}

function record(outcome, extra = {}) {
  const file = process.env.VCP_LAYER_EVIDENCE;
  if (!file) return;
  try {
    appendFileSync(file, JSON.stringify({
      ts: new Date().toISOString(),
      status: outcome.status,
      intended: outcome.intended,
      actual: outcome.actual,
      preemptedBy: outcome.preemptedBy,
      reachability: outcome.reachability,
      ceiling: outcome.ceiling,
      // Synthetic rows come from the assertion helper's own unit tests, which
      // use invented codes (E_TOTALLY_UNRELATED, E_NO_CODE, 'x'). Anything whose
      // observed code is not a real enforcement layer cannot describe product
      // behaviour, so it is tagged and must never be read as a product failure.
      synthetic: !LAYER_ORDER.includes(outcome.actual) && outcome.actual !== 'NO_ERROR',
      source: extra.source ?? null,
      platform: process.platform,
      pid: process.pid,
    }) + '\n');
  } catch { /* evidence is best-effort; never changes the test verdict */ }
}

// Wraps a test whose assertions are only meaningful if a mutation can actually
// be performed. Where the platform's own durability capability reports
// namespace durability unproven (win32, and any platform without a reviewed
// provider), the test is reported INCONCLUSIVE — never PASS, and never a
// product FAIL for a guard that is behaving as designed.
// This READS the guard. It does not bypass, stub, or reconfigure it.
//
// IMPORTANT: a test wrapped here asserts SUCCESS. Do not wrap a body with
// requireLayer expecting a rejection — requireLayer reports a COMPLETED
// transaction as FAIL, which would make a correct product look broken.
//
// LIMITATION (independent review 2026-10-16): `process.platform` is spoofable
// in-process via Object.defineProperty, so this is a self-report, not a
// measurement. It cannot enable anything: the durability guard still fires at
// the real filesystem call inside syncContainingDirectory.
export function mutationTest(name, fn, options = {}) {
  return test(name, options, async (t) => {
    const { lifecycleDurabilityCapability } = await import('../../lib/file-durability.mjs');
    const cap = lifecycleDurabilityCapability();
    if (!cap.supported) {
      const e = new Error(`INCONCLUSIVE: mutation unreachable — ${cap.reason}`);
      e.code = 'E_TEST_INCONCLUSIVE';
      t.diagnostic(e.message);
      // Record it: an unrecorded INCONCLUSIVE is indistinguishable from an
      // unrun test in the evidence file.
      record(new Outcome('BLOCKED', {
        intended: 'MUTATION_PATH', actual: 'E_DIRECTORY_SYNC_UNPROVEN',
        preemptedBy: 'E_DIRECTORY_SYNC_UNPROVEN',
        reachability: REACH.GUARD_ORDER_ASSERTED, ceiling: LAYER.DURABILITY,
      }), { source: name });
      throw e;
    }
    return fn(t);
  });
}
