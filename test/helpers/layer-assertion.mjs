// Phase 1 repair harness — classifies a test outcome by ENFORCEMENT LAYER.
// Root cause of the Windows false positives: assertions of the form
//   assert.rejects(op, /CODE_A|CODE_B/)
// accept a rejection raised by an EARLIER guard, so the suite reports PASS
// while the intended layer never executed. This module makes the layer a
// first-class, asserted fact: PASS requires the intended code, BLOCKED
// requires proof an earlier guard preempted it, and neither is a pass.
import { LAYER_ORDER } from './writer-layers.mjs';

export class Outcome {
  constructor(status, { intended, actual, preemptedBy = null, message = '' } = {}) {
    this.status = status;           // 'PASS' | 'BLOCKED' | 'FAIL'
    this.intended = intended;       // error code the test claims to prove
    this.actual = actual;           // error code actually observed
    this.preemptedBy = preemptedBy; // earlier guard code that ran first
    this.message = message;
  }
  get passed() { return this.status === 'PASS'; }
  toString() {
    return this.status === 'BLOCKED'
      ? `BLOCKED / INCONCLUSIVE — intended ${this.intended}, preempted by earlier guard ${this.preemptedBy}`
      : `${this.status} — intended ${this.intended}, actual ${this.actual}`;
  }
}

// Rejects when the observed error is not the one the test claims to prove.
// A preempting earlier guard yields BLOCKED (inconclusive), never PASS.
export async function requireLayer(op, { intended, guardsBefore = [] }) {
  if (!LAYER_ORDER.includes(intended))
    throw new Error(`Unknown enforcement layer for intended code: ${intended}`);
  for (const g of guardsBefore)
    if (!LAYER_ORDER.includes(g))
      throw new Error(`Unknown enforcement layer in guardsBefore: ${g}`);
  if (guardsBefore.some((g) => LAYER_ORDER.indexOf(g) >= LAYER_ORDER.indexOf(intended)))
    throw new Error(`guardsBefore must all precede the intended layer: ${intended}`);

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
      intended, actual: 'NO_ERROR',
      message: 'transaction completed; the control under test did not reject',
    });
  }
  const code = error?.code ?? 'E_NO_CODE';
  if (guardsBefore.includes(code)) {
    return new Outcome('BLOCKED', { intended, actual: code, preemptedBy: code });
  }
  if (code === intended) return new Outcome('PASS', { intended, actual: code });
  return new Outcome('FAIL', {
    intended, actual: code,
    message: `unexpected error code (attribution defect): ${error?.message ?? ''}`,
  });
}

// Asserts the outcome is PASS. BLOCKED throws with an explicit inconclusive
// message so a preempted test can never be silently counted as green.
export function assertLayerPassed(outcome) {
  if (outcome.status === 'PASS') return;
  const e = new Error(
    outcome.status === 'BLOCKED'
      ? `INCONCLUSIVE: ${outcome}`
      : `FAILED: ${outcome} — ${outcome.message}`);
  e.code = outcome.status === 'BLOCKED' ? 'E_TEST_INCONCLUSIVE' : 'E_TEST_ASSERTION';
  throw e;
}
