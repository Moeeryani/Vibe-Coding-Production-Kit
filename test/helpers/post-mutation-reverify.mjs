// The B4-03 scenario, factored out so the scenario test (B4-03) and the
// mutation test (PMR-02) exercise the SAME detection path. If the two
// diverged, the mutation test would prove nothing about the scenario test.
//
// WHAT THE SCENARIO CLAIMS: a fixture replaced DURING the mutation is
// refused by the writer's post-mutation re-verification (step 5b), and that
// refusal is attributable to step 5b alone.
//
// WHY THE LAYER LIST IS WHAT IT IS (FINDING-001, 2026-10-23): step 2 of the
// writer transaction is a choice — a controlled test capability REPLACES the
// production G-FENCE gate, it does not run after it. G_FENCE therefore never
// executes in this lane and cannot preempt anything; listing it in
// guardsBefore asserted a guard that never runs, and because G_FENCE sits
// after CAPABILITY in the old layer order it also made the layer harness
// reject the claim outright. The controlled chain is: boundary, the three
// capability checks, the lock's durability refusal, the principal check, the
// B-9 identity pin — and only then the mutation, and after it the step-5b
// re-verification.
import { rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createControlledFixture, teardownControlledFixture,
} from './controlled-writer-fixture.mjs';
import { requireLayer } from './layer-assertion.mjs';
import { LAYER } from './writer-layers.mjs';

export const REVERIFY_OPS = ['b4-concurrency'];

// The controlled lane's real chain, minus the layer under test. G_FENCE is
// absent on purpose — see the note above.
export const REVERIFY_GUARDS_BEFORE = Object.freeze([
  LAYER.BOUNDARY,
  LAYER.CAPABILITY_INVALID,
  LAYER.CAPABILITY_SCOPE,
  LAYER.CAPABILITY,
  LAYER.DURABILITY,
  LAYER.PRINCIPAL,
  LAYER.WRITER_IDENTITY,
]);

// Only a directory this scenario itself created is removed by the guarded
// cleanup below. The fixture helper's own identity check stays untouched: it
// refuses to delete a root whose identity changed, and that refusal is a
// safety property, not a problem to route around.
function isControlledFixturePath(p) {
  const r = path.resolve(p);
  const tmp = path.resolve(os.tmpdir());
  return r.startsWith(tmp + path.sep) && path.basename(r).startsWith('vcp-controlled-');
}

// Runs the scenario against the given transaction runner. The runner is
// injected so the mutation test can hand it a writer whose step-5b
// re-verification has been removed.
export async function runPostMutationReverifyScenario(runTransaction) {
  const f = await createControlledFixture({ allowedOperations: REVERIFY_OPS });
  const state = { mutated: false };
  try {
    const outcome = await requireLayer(
      () => runTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'init',
        testCapability: f.capability,
        mutate: async ({ root }) => {
          // The attacker replaces the fixture mid-transaction: the root is
          // removed and a new directory is created at the same path, so the
          // (dev, ino) identity the capability pinned no longer matches.
          await rm(root, { recursive: true, force: true });
          await mkdir(root, { recursive: true });
          state.mutated = true;
        },
      }),
      {
        intended: LAYER.CAPABILITY_REVERIFY,
        guardsBefore: REVERIFY_GUARDS_BEFORE,
      },
    );
    return { outcome, mutated: state.mutated };
  } finally {
    try {
      await teardownControlledFixture(f);
    } catch {
      // The fixture root was replaced, so the helper refuses to delete it.
      // The replacement directory this scenario created is removed here
      // instead — and only after re-checking the controlled-fixture guards.
      if (isControlledFixturePath(f.root))
        await rm(f.root, { recursive: true, force: true }).catch(() => {});
    }
  }
}
