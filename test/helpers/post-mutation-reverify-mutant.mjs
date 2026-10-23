// Mutation probe: runs the post-mutation re-verification detector against a
// production writer whose step-5b re-verification has been removed by the
// loader in remove-post-mutation-reverify-loader.mjs.
//
// Exit 0 — MUTATION KILLED: the detector refused the transaction, so removing
//          the step-5b re-verification cannot go unnoticed.
// Exit 1 — MUTATION SURVIVED: the detector still reported a pass.
// Exit 2 — MUTATION NOT APPLIED: the loader could not locate the block, so
//          nothing was proven. This is never reported as a kill.
// Exit 3 — probe error: the scenario itself could not run.
//
// This file is a helper, not a test. It is executed as a child process by
// test/writer-post-mutation-reverify.test.mjs.
//
// The test runner treats every file under test/ as a test file, so this module
// is ALSO executed by discovery, not only when the parent spawns it. Without
// the explicit mode it must do nothing: it registers a loader that rewrites
// the production writer, so running it by accident would rewrite the writer
// inside the test run.
if (process.argv[2] !== 'probe') {
  console.log('SKIPPED: the mutation probe requires the explicit "probe" mode');
  process.exit(0);
}

import { register } from 'node:module';
import { rmSync } from 'node:fs';
import { mutationMarkerPath } from './remove-post-mutation-reverify-loader.mjs';

// The loader thread writes this marker when it rewrites the writer, and only
// then. A stale marker must not be mistaken for an applied mutation.
const marker = mutationMarkerPath();
try { rmSync(marker, { force: true }); } catch { /* nothing to remove */ }

register('./remove-post-mutation-reverify-loader.mjs', import.meta.url);

let runWriterTransaction;
let runPostMutationReverifyScenario;
try {
  ({ runWriterTransaction } = await import('../../lib/production-writer.mjs'));
  ({ runPostMutationReverifyScenario } = await import('./post-mutation-reverify.mjs'));
} catch (e) {
  console.error(`MUTATION_PROBE_ERROR: ${e?.message ?? e}`);
  process.exit(3);
}

let applied = true;
try { applied = (await import('node:fs')).existsSync(marker); } catch { applied = false; }
if (!applied) {
  console.error('MUTATION_NOT_APPLIED: the step-5b re-verification block was not found ' +
    'in lib/production-writer.mjs, so nothing was mutated and nothing was proven');
  process.exit(2);
}

let result;
try {
  result = await runPostMutationReverifyScenario(runWriterTransaction);
} catch (e) {
  console.error(`MUTATION_PROBE_ERROR: ${e?.message ?? e}`);
  process.exit(3);
}

if (result.outcome.status === 'PASS') {
  console.error('MUTATION_SURVIVED: the detector still reported a pass after the ' +
    'step-5b re-verification was removed');
  process.exit(1);
}
if (result.outcome.status === 'BLOCKED') {
  // The platform cannot run the scenario at all (no mutation is reachable), so
  // the mutation is neither proven nor disproven here. This is never a kill.
  console.error('MUTATION_INCONCLUSIVE: the scenario was blocked before the ' +
    'mutation could run, so the mutation was not proven either way');
  process.exit(4);
}
console.log(`MUTATION_KILLED: the detector refused the transaction ` +
  `(status=${result.outcome.status}, actual=${result.outcome.actual})`);
process.exit(0);
