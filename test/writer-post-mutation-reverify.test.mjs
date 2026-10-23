// Post-mutation re-verification (step 5b) — regression and mutation tests.
//
// FINDING-001 (2026-10-23, Linux review of candidate 690138ee). The B4-03
// scenario claimed the step-2 CAPABILITY layer while listing G_FENCE — the
// production ALTERNATIVE at step 2 — among the guards before it. Because the
// old layer order placed G_FENCE after CAPABILITY, the layer harness
// rejected the claim outright, so the detector never ran: the scenario was
// broken, not merely mislabelled.
//
// This file pins the repaired claim from three sides:
//   PMR-01  the scenario is refused by the step-5b re-verification, and the
//           refusal is attributed to that site and to no other;
//   PMR-02  a refusal raised by the INITIAL capability check is NOT accepted
//           as a step-5b pass — it is reported as blocked, never as green;
//   PMR-03  MUTATION: when the step-5b re-verification is removed from the
//           writer, the detector FAILS. A gate that can be deleted without
//           the test noticing is not a gate.
//
// PMR-01 and PMR-02 run against the same scenario helper as B4-03, so the
// scenario test and these tests cannot drift apart.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runWriterTransaction } from '../lib/production-writer.mjs';
import { requireLayer, mutationTest } from './helpers/layer-assertion.mjs';
import { LAYER } from './helpers/writer-layers.mjs';
import {
  runPostMutationReverifyScenario, REVERIFY_GUARDS_BEFORE, REVERIFY_OPS,
} from './helpers/post-mutation-reverify.mjs';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { CONTROLLED_LANE_APPROVED_FOR_EXECUTION } from './helpers/controlled-lane-approval.mjs';

const LIB_DIR = path.resolve(import.meta.dirname, '..', 'lib');
// A mutation test asserts SUCCESS of the mutation being killed, so it runs
// only where a mutation is reachable at all. Where it is not, the wrapper
// reports INCONCLUSIVE instead of a false green. The controlled lane itself
// needs the owner approval recorded in
// test/helpers/controlled-lane-approval.mjs — this suite performs the same
// gate-bypassed mutations as B4-03, so it obeys the same gate.
const mutGate = (name, fn) =>
  mutationTest(name, fn, { skip: !CONTROLLED_LANE_APPROVED_FOR_EXECUTION });

mutGate('PMR-01 — the step-5b re-verification refuses a fixture replaced during mutate', async () => {
  const { outcome, mutated } = await runPostMutationReverifyScenario(runWriterTransaction);
  assert.equal(outcome.status, 'PASS',
    `the scenario must be refused at the step-5b layer: ${outcome}`);
  assert.equal(outcome.actual, LAYER.CAPABILITY_REVERIFY,
    'the refusal must carry the step-5b code, not the step-2 capability code');
  assert.equal(mutated, true,
    'the replacement must actually have happened during the mutation');
  assert.equal(outcome.preemptedBy, null,
    'nothing may have preempted the intended layer');
});

test('PMR-02 — a refusal by the INITIAL capability check is not a step-5b pass', async () => {
  // The scenario of PMR-01, but the fixture is replaced BEFORE the
  // transaction starts. The step-2 authorization check then refuses, and
  // because the step-2 code is one of the guards before the intended layer,
  // the harness must report BLOCKED — never PASS. A "success" issued by the
  // initial capability check would be exactly the false green this file
  // exists to prevent.
  const f = await createControlledFixture({ allowedOperations: REVERIFY_OPS });
  try {
    await rm(f.root, { recursive: true, force: true });
    await mkdir(f.root, { recursive: true, mode: 0o700 });
    const outcome = await requireLayer(
      () => runWriterTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'init',
        testCapability: f.capability,
        mutate: async () => { throw new Error('the mutation must not run'); },
      }),
      { intended: LAYER.CAPABILITY_REVERIFY, guardsBefore: REVERIFY_GUARDS_BEFORE },
    );
    assert.equal(outcome.status, 'BLOCKED',
      `a step-2 refusal must block the step-5b claim, got: ${outcome}`);
    assert.equal(outcome.preemptedBy, LAYER.CAPABILITY,
      'the preempting guard must be named');
    assert.notEqual(outcome.actual, LAYER.CAPABILITY_REVERIFY,
      'the step-5b code must never be reported for a step-2 refusal');
  } finally {
    await teardownControlledFixture(f).catch(() => {});
  }
});

mutGate('PMR-03 — MUTATION: removing the step-5b re-verification makes the detector fail', async () => {
  // The writer is loaded through a loader that removes the step-5b block in
  // memory; the working tree is never touched. If the detector still reported
  // a pass, the mutation would have survived and the gate would be optional.
  const child = path.join(import.meta.dirname, 'helpers', 'post-mutation-reverify-mutant.mjs');
  const r = spawnSync(process.execPath, [child, 'probe'], {
    encoding: 'utf8', timeout: 180_000, windowsHide: true,
  });
  const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  assert.equal(r.status, 0,
    `the mutation must be killed by the detector; status=${r.status} output=${out}`);
  assert.match(out, /MUTATION_KILLED/,
    `the probe must report the mutation as killed: ${out}`);
  assert.doesNotMatch(out, /MUTATION_SURVIVED/,
    `the mutation survived the detector: ${out}`);
  assert.doesNotMatch(out, /MUTATION_NOT_APPLIED/,
    `the mutation was never applied, so nothing was proven: ${out}`);
});

test('PMR-04 — the step-5b code is raised at exactly one enforcement site', async () => {  // The layer harness credits a PASS with CODE_IDENTIFIES_LAYER only when the
  // code locates the layer by itself. That premise is asserted here rather
  // than assumed: the code must not appear anywhere else in lib/.
  const files = (await readdir(LIB_DIR)).filter((f) => f.endsWith('.mjs'));
  const offenders = [];
  for (const file of files) {
    const text = await readFile(path.join(LIB_DIR, file), 'utf8');
    if (!text.includes(LAYER.CAPABILITY_REVERIFY)) continue;
    if (file !== 'production-writer.mjs') { offenders.push(file); continue; }
    const block = text.slice(text.indexOf('// 5b.'));
    const outside = text.slice(0, text.indexOf('// 5b.'));
    assert.equal(outside.includes(LAYER.CAPABILITY_REVERIFY), false,
      'the step-5b code must not appear before the step-5b block');
    assert.ok(block.includes(LAYER.CAPABILITY_REVERIFY),
      'the step-5b block must raise the step-5b code');
  }
  assert.deepEqual(offenders, [],
    `the step-5b code must be unique to its enforcement site, found in: ${offenders}`);
});
