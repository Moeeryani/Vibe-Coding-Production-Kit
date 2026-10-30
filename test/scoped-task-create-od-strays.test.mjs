// SC-01 OD-STRAYS correction — final root-state re-check tests.
//
// These tests cover the narrow correction on top of frozen 98c63ad:
// the final pre-open check in lib/scoped-task-create.mjs now re-runs
// the full E4 root-state validation (.vcp, root manifest/lock/
// recovery strays, and .vcp-adoption-* markers) via the shared
// refuseManagedState helper, instead of checking .vcp alone. They
// assert, for a marker appearing late:
//
//   - refusal with the existing typed code (E_SCOPED_MANAGED_STATE_
//     PRESENT for .vcp, E_SCOPED_RECOVERY_STATE_PRESENT for strays
//     and adoption markers) and the distinct "appeared during
//     creation" message, never an early-classification refusal
//     counted as final-check coverage;
//   - post-mutation classification, ledger cleanup, and accurate
//     filesystem evidence when this operation created parents;
//   - pre-mutation classification and no cleanup ledger when
//     parents already existed;
//   - the planted marker itself is never written, modified, or
//     followed (file, directory, symlink, and dangling-symlink
//     shapes; external targets untouched);
//   - no second write attempt and no managed state created by SC-01.
//
// Ordering control uses disposable-filesystem watcher loops only
// (plantWhen, as in the R3 tests) for the created-parents case,
// and a message-classified timing ladder for the pre-existing-
// parents case, where no parent-creation event exists to trigger
// on. The ladder classifies every trial by its EXACT error
// message, never by delay, and reports the split; a plant landing
// after the final check but before open(2) can still succeed and
// is counted separately as a residual success, never hidden.
// The extended final check narrows the late-marker window; it
// does not atomically eliminate the check-to-open interleaving.
// Fixtures are disposable real filesystems under os.tmpdir().
import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import {
  lstat, mkdir, mkdtemp, readFile, readlink, readdir
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTaskPack } from '../lib/task.mjs';
import { createScopedTaskFile } from '../lib/scoped-task-create.mjs';
import { inspectProject } from '../lib/adoption-inspect.mjs';
import { seedUnmanagedProject } from './helpers/unmanaged-fixture.mjs';

const PACK_BYTES = Buffer.from('# Task — Harness\n\nStatus: Draft\n', 'utf8');
const MARKER_BYTES = '{}';
const ADOPTION_NAME = '.vcp-adoption-test';

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-scoped-strays-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });
  return dir;
}

async function project(t, name = 'vcp-proj') {
  const base = await sandbox(t);
  const root = path.join(base, name);
  await mkdir(root, { recursive: true });
  return root;
}

async function walkFiles(root) {
  const out = [];
  async function walk(dir, rel) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const child = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(child, childRel);
      else out.push(childRel);
    }
  }
  await walk(root, '');
  return out.sort();
}

// Poll (setImmediate + synchronous lstat, no threadpool queueing)
// until `dir` exists as a real directory, then run `plant`
// synchronously. Returns true when the plant ran. The synchronous
// plant completes before the event loop proceeds, so it lands
// strictly between two of the helper's awaited filesystem steps.
async function plantWhen(dir, plant, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let st = null;
    try { st = lstatSync(dir); } catch { st = null; }
    if (st && st.isDirectory() && !st.isSymbolicLink()) {
      plant();
      return true;
    }
    if (Date.now() > deadline) return false;
    await new Promise((r) => setImmediate(r));
  }
}

async function assertNoTaskFile(root) {
  assert.equal((await lstat(path.join(root, 'docs', 'tasks', 'demo-task.md')).catch((e) => e.code)), 'ENOENT');
}

function assertLateStrayRefusal(error, { expectPostMutation }) {
  assert.equal(error.code, 'E_SCOPED_RECOVERY_STATE_PRESENT');
  assert.match(error.message, /appeared during creation/);
  assert.equal(error.scopedPhase, expectPostMutation ? 'post-mutation' : 'pre-mutation');
  assert.equal(error.scopedFile, undefined, 'late refusal must not name a created file');
}

function assertLateVcpRefusal(error, { expectPostMutation }) {
  assert.equal(error.code, 'E_SCOPED_MANAGED_STATE_PRESENT');
  assert.match(error.message, /\.vcp entry appeared during creation/);
  assert.equal(error.scopedPhase, expectPostMutation ? 'post-mutation' : 'pre-mutation');
  assert.equal(error.scopedFile, undefined, 'late refusal must not name a created file');
}

// Classify one helper-level ladder trial by EXACT error message.
// Returns 'classification' | 'early' | 'final-check' | 'success'
// ('success' only when the caller separately verified the file).
function classifyHelperOutcome(outcome) {
  if (outcome === 'created') return 'success';
  if (outcome.code === 'E_SCOPED_INELIGIBLE_STATE') return 'classification';
  if (outcome.code === 'E_SCOPED_MANAGED_STATE_PRESENT' && /\.vcp entry exists/.test(outcome.message)) return 'early';
  if (outcome.code === 'E_SCOPED_RECOVERY_STATE_PRESENT' && /unexpected root entry: /.test(outcome.message) && !/appeared/.test(outcome.message)) return 'early';
  if (outcome.code === 'E_SCOPED_RECOVERY_STATE_PRESENT' && /adoption marker present:/.test(outcome.message)) return 'early';
  if (outcome.code === 'E_SCOPED_MANAGED_STATE_PRESENT' && /appeared during creation/.test(outcome.message)) return 'final-check';
  if (outcome.code === 'E_SCOPED_RECOVERY_STATE_PRESENT' && /appeared during creation/.test(outcome.message)) return 'final-check';
  assert.fail(`unexpected helper refusal: ${outcome.code}: ${outcome.message}`);
  return 'unknown';
}

test('STRAYS-01 every root-marker class appearing after parent creation refuses post-mutation with cleanup, marker bytes untouched', async (t) => {
  const markers = ['manifest.json', 'update.lock', 'transaction.json', ADOPTION_NAME];
  for (const name of markers) {
    for (let i = 0; i < 10; i++) {
      const root = await project(t);
      await seedUnmanagedProject({ targetDir: root });
      const planter = plantWhen(path.join(root, 'docs'),
        () => writeFileSync(path.join(root, name), MARKER_BYTES));
      const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
        .then(() => 'created').catch((e) => e);
      assert.equal(await planter, true, `planter must fire for ${name}`);
      assert.notEqual(outcome, 'created', `late ${name} must refuse`);
      assertLateStrayRefusal(outcome, { expectPostMutation: true });
      assert.ok(outcome.scopedCleanup, 'post-mutation error must carry cleanup status');
      assert.equal(outcome.scopedCleanup.attempted, 2, 'both created parents must be cleaned up');
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT', 'created parents must be removed');
      assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES, 'planted marker bytes must survive exactly');
    }
  }
});

test('STRAYS-02 marker shapes: directory, symlink, and dangling symlink appearing after parent creation refuse, links and targets untouched', async (t) => {
  // manifest.json as a directory.
  for (let i = 0; i < 5; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = plantWhen(path.join(root, 'docs'),
      () => mkdirSync(path.join(root, 'manifest.json')));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire');
    assert.notEqual(outcome, 'created', 'late manifest.json directory must refuse');
    assertLateStrayRefusal(outcome, { expectPostMutation: true });
    assert.deepEqual(outcome.scopedCleanup.leftover, []);
    const st = await lstat(path.join(root, 'manifest.json'));
    assert.ok(st.isDirectory() && !st.isSymbolicLink(), 'planted manifest.json dir must survive');
    assert.deepEqual(await readdir(path.join(root, 'manifest.json')), []);
  }
  // Adoption marker as a directory.
  for (let i = 0; i < 5; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = plantWhen(path.join(root, 'docs'),
      () => mkdirSync(path.join(root, ADOPTION_NAME)));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire');
    assert.notEqual(outcome, 'created', 'late adoption-marker directory must refuse');
    assertLateStrayRefusal(outcome, { expectPostMutation: true });
    assert.deepEqual(outcome.scopedCleanup.leftover, []);
    assert.deepEqual(await readdir(path.join(root, ADOPTION_NAME)), []);
  }
  // Stray / adoption symlinks: live target and dangling.
  for (const [name, shape] of [['update.lock', 'live'], ['update.lock', 'dangling'], [ADOPTION_NAME, 'live'], [ADOPTION_NAME, 'dangling']]) {
    for (let i = 0; i < 5; i++) {
      const base = await sandbox(t);
      const root = path.join(base, 'vcp-proj');
      await mkdir(root, { recursive: true });
      await seedUnmanagedProject({ targetDir: root });
      const targetDir = path.join(base, 'vcp-elsewhere');
      await mkdir(targetDir, { recursive: true });
      await writeFileSync(path.join(targetDir, 'sentinel.txt'), 'sentinel');
      const linkTarget = shape === 'live' ? targetDir : path.join(base, 'no-such-target');
      const planter = plantWhen(path.join(root, 'docs'),
        () => symlinkSync(linkTarget, path.join(root, name)));
      const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
        .then(() => 'created').catch((e) => e);
      assert.equal(await planter, true, 'planter must fire');
      assert.notEqual(outcome, 'created', `late ${name} ${shape} symlink must refuse`);
      assertLateStrayRefusal(outcome, { expectPostMutation: true });
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      const link = await lstat(path.join(root, name));
      assert.ok(link.isSymbolicLink(), 'planted marker must remain a symlink');
      assert.equal(await readlink(path.join(root, name)), linkTarget);
      if (shape === 'live') {
        assert.equal(await readFile(path.join(targetDir, 'sentinel.txt'), 'utf8'), 'sentinel', 'link target must stay untouched');
      }
    }
  }
});

test('STRAYS-03 .vcp file and dangling symlink still refuse through the extended final check', async (t) => {
  for (const shape of ['file', 'dangling']) {
    for (let i = 0; i < 10; i++) {
      const base = await sandbox(t);
      const root = path.join(base, 'vcp-proj');
      await mkdir(root, { recursive: true });
      await seedUnmanagedProject({ targetDir: root });
      const plant = shape === 'file'
        ? () => writeFileSync(path.join(root, '.vcp'), 'planted-vcp-file')
        : () => symlinkSync(path.join(base, 'no-such-target'), path.join(root, '.vcp'));
      const planter = plantWhen(path.join(root, 'docs', 'tasks'), plant);
      const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
        .then(() => 'created').catch((e) => e);
      assert.equal(await planter, true, 'planter must fire on docs/tasks appearance');
      assert.notEqual(outcome, 'created', `late .vcp ${shape} must refuse`);
      assertLateVcpRefusal(outcome, { expectPostMutation: true });
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      if (shape === 'file') assert.equal(await readFile(path.join(root, '.vcp'), 'utf8'), 'planted-vcp-file');
      else assert.equal(await readlink(path.join(root, '.vcp')), path.join(base, 'no-such-target'));
    }
  }
});

test('STRAYS-04 late markers with pre-existing parents: message-classified timing ladder establishes genuine final-check landings', async (t) => {
  // No parent-creation event exists to trigger on here, so plants
  // are scheduled by delay and every trial is classified by its
  // exact error message. Early/classification landings are valid
  // pre-mutation refusals but are NOT counted as final-check
  // coverage; only 'final-check' landings are. A plant landing
  // after the final check may still succeed (residual success)
  // and must then be byte-exact with the marker untouched.
  const markers = ['manifest.json', 'update.lock', 'transaction.json', ADOPTION_NAME];
  // Delay band chosen from a calibration sweep on this machine
  // (probes/calibrate-ladder.mjs): plants at 0–12 ms land before
  // the early checks, plants at 26 ms+ land after return, and the
  // final-check window sits at roughly 15–22 ms in-process. The
  // band is deliberately wider than the calibrated window so a
  // slower run under load still spans it.
  const delays = [12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28];
  const counts = new Map(markers.map((m) => [m, { classification: 0, early: 0, finalCheck: 0, success: 0 }]));
  let totalFinalCheck = 0;
  for (const name of markers) {
    for (let i = 0; i < 90; i++) {
      const root = await project(t);
      await seedUnmanagedProject({ targetDir: root, docsDir: true });
      await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
      const delay = delays[i % delays.length];
      const timer = setTimeout(() => {
        try { writeFileSync(path.join(root, name), MARKER_BYTES); } catch {}
      }, delay);
      const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
        .then(() => 'created').catch((e) => e);
      clearTimeout(timer);
      // The plant may not have fired if creation returned first;
      // ensure the marker exists for the after-state checks only
      // when the trial is a refusal (a refusal implies the plant
      // was observed); for successes, plant explicitly if absent
      // is NOT done — success with no plant is a no-plant success
      // and is counted only as a success, never as a residual.
      const kind = classifyHelperOutcome(outcome);
      const c = counts.get(name);
      c[kind === 'final-check' ? 'finalCheck' : kind]++;
      if (kind === 'final-check') {
        totalFinalCheck++;
        assert.equal(outcome.scopedPhase, 'pre-mutation');
        assert.equal(outcome.scopedCleanup, undefined, 'no cleanup when nothing was created');
        assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES);
      } else if (kind === 'early' || kind === 'classification') {
        assert.equal(outcome.scopedPhase, 'pre-mutation');
        assert.equal(outcome.scopedCleanup, undefined);
        assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES);
      } else {
        // success: if the marker landed after return it must be
        // untouched and the file byte-exact; if it never landed,
        // the file is still byte-exact and no marker is required.
        assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
        const marker = await readFile(path.join(root, name), 'utf8').catch(() => null);
        if (marker !== null) assert.equal(marker, MARKER_BYTES);
      }
      await assertNoTaskFile(root).catch(() => {});
      // Re-assert no-file only for refusals: successes legitimately
      // created the file, so check the invariant conditionally.
      if (kind !== 'success') {
        assert.equal((await lstat(path.join(root, 'docs', 'tasks', 'demo-task.md')).catch((e) => e.code)), 'ENOENT');
      }
      assert.ok((await lstat(path.join(root, 'docs', 'tasks'))).isDirectory(), 'pre-existing parents must survive');
    }
  }
  const split = [...counts.entries()].map(([m, c]) => `${m}: classification=${c.classification} early=${c.early} final-check=${c.finalCheck} success=${c.success}`).join('; ');
  t.diagnostic(`STRAYS-04 ladder: ${split}`);
  assert.ok(totalFinalCheck >= 2, `timing ladder must establish genuine final-check landings with pre-existing parents (got ${totalFinalCheck}; ${split})`);
});

test('STRAYS-05 task-level late marker keeps the original error: no fall-through to the gate, no second attempt', async (t) => {
  for (const name of ['manifest.json', ADOPTION_NAME]) {
    for (let i = 0; i < 10; i++) {
      const root = await project(t);
      await seedUnmanagedProject({ targetDir: root });
      const planter = plantWhen(path.join(root, 'docs'),
        () => writeFileSync(path.join(root, name), MARKER_BYTES));
      const outcome = await createTaskPack({ targetDir: root, slug: 'demo-task' })
        .then(() => 'created').catch((e) => e);
      assert.equal(await planter, true, `planter must fire for ${name}`);
      assert.notEqual(outcome, 'created', `late ${name} must refuse at task level`);
      assert.equal(outcome.code, 'E_SCOPED_RECOVERY_STATE_PRESENT');
      assert.match(outcome.message, /appeared during creation/);
      assert.equal(outcome.scopedPhase, 'post-mutation');
      assert.equal(outcome.cause, undefined, 'original error must not be wrapped as a gate cause');
      assert.ok(outcome.scopedCleanup, 'post-mutation error must carry cleanup status');
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
      assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES);
    }
  }
});

test('STRAYS-06 task-level late markers with pre-existing parents refuse through the gate with the scoped cause preserved', async (t) => {
  // Timing ladder at task level, classified by the gate cause's
  // exact message. In-process the task-level final-check window
  // is only a few milliseconds wide (calibration probe
  // calibrate-task-ladder.mjs: early refusals to ~20 ms, successes
  // from ~25 ms, one final-check cause in 260 trials), so this
  // test asserts the properties that hold for EVERY landing —
  // valid pre-mutation cause, gate preservation, no file, parents
  // and marker intact — and reports the split, without asserting
  // a minimum number of final-check causes. Genuine task-level
  // final-check causes for every marker class were established
  // separately by the child-process ladder probe
  // (probes/strays-child-ladder.mjs, DG3-style READY signalling,
  // wider timing spread): 32 gate final-check causes in 660
  // focused trials (manifest 10, update.lock 6, transaction.json
  // 8, adoption 8), each with the exact scoped cause message,
  // pre-mutation phase, no cleanup ledger, marker bytes exact,
  // no destination, and parents intact. That per-trial evidence
  // is preserved in evidence/child-ladder-task-*-focus.jsonl.
  // The final-check gate cause is the same phase-based
  // fall-through already proven for .vcp by DG3-2.
  const markers = ['manifest.json', 'update.lock', 'transaction.json', ADOPTION_NAME];
  const delays = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30, 35, 40, 45];
  let finalCheckCauses = 0;
  let gateRefusals = 0;
  let successes = 0;
  for (const name of markers) {
    for (let i = 0; i < 45; i++) {
      const root = await project(t);
      await seedUnmanagedProject({ targetDir: root, docsDir: true });
      await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
      const delay = delays[i % delays.length];
      const timer = setTimeout(() => {
        try { writeFileSync(path.join(root, name), MARKER_BYTES); } catch {}
      }, delay);
      const outcome = await createTaskPack({ targetDir: root, slug: 'demo-task' })
        .then(() => 'created').catch((e) => e);
      clearTimeout(timer);
      if (outcome === 'created') {
        successes++;
        assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).length > 0);
        const marker = await readFile(path.join(root, name), 'utf8').catch(() => null);
        if (marker !== null) assert.equal(marker, MARKER_BYTES);
        continue;
      }
      gateRefusals++;
      // Task-level pre-inspection may refuse as BLOCKED before the
      // scoped attempt (classification landing); otherwise the
      // scoped pre-mutation error is the gate cause.
      if (outcome.code === 'E_G_FENCE_NO_GO') {
        const cause = outcome.cause;
        assert.ok(cause, 'gate refusal must preserve the scoped cause');
        const kind = classifyHelperOutcome(cause);
        assert.ok(kind === 'classification' || kind === 'early' || kind === 'final-check', `unexpected gate cause: ${cause.code}: ${cause.message}`);
        if (kind === 'final-check') {
          finalCheckCauses++;
          assert.equal(cause.scopedPhase, 'pre-mutation');
          assert.equal(outcome.causeCleanup ?? cause.scopedCleanup, undefined, 'no cleanup ledger for pre-mutation gate cause');
        }
        assert.equal(cause.scopedPhase, 'pre-mutation');
      } else {
        assert.match(outcome.message, /Task Pack creation blocked/, 'non-gate task refusal must be the pre-inspection block');
      }
      assert.equal((await lstat(path.join(root, 'docs', 'tasks', 'demo-task.md')).catch((e) => e.code)), 'ENOENT');
      assert.ok((await lstat(path.join(root, 'docs', 'tasks'))).isDirectory());
      assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES);
    }
  }
  t.diagnostic(`STRAYS-06 ladder: ${gateRefusals} gate/blocked refusals, ${finalCheckCauses} final-check causes, ${successes} successes`);
  assert.ok(gateRefusals >= 1, 'task-level ladder must produce gate/blocked refusals');
});

test('STRAYS-07 markers present before classification refuse pre-mutation and stay untouched', async (t) => {
  for (const name of ['manifest.json', 'update.lock', 'transaction.json', ADOPTION_NAME]) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await writeFileSync(path.join(root, name), MARKER_BYTES);
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_RECOVERY_STATE_PRESENT' && e.scopedPhase === 'pre-mutation');
    await assertNoTaskFile(root);
    assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES);
  }
  // A retired-adoption marker present before the call refuses via
  // classification (SC-T13 path); it must still refuse
  // pre-mutation with no file and no mutation by SC-01.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await writeFileSync(path.join(root, '.vcp-adoption-retired-abc'), 'evidence');
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.scopedPhase === 'pre-mutation');
    await assertNoTaskFile(root);
  }
  // .vcp present before the call still refuses pre-mutation. A
  // bare .vcp directory classifies BLOCKED (MANIFEST_MISSING)
  // before the E4 check runs — the same landing R3-04 records —
  // so either the classification refusal or the managed-state
  // refusal is the honest steady-state outcome; both are
  // pre-mutation with no file created.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await mkdirSync(path.join(root, '.vcp'));
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.scopedPhase === 'pre-mutation' &&
        (e.code === 'E_SCOPED_MANAGED_STATE_PRESENT' || e.code === 'E_SCOPED_INELIGIBLE_STATE'));
    await assertNoTaskFile(root);
  }
});

test('STRAYS-08 late markers planted on docs/tasks appearance: final-check reproduction for every marker class', async (t) => {
  // Reproduces the R-3 ordering at the latest trigger: the planter
  // fires when the LAST parent appears, after parent preparation
  // and immediately before the exclusive open. The extended final
  // check must catch the plant whenever it lands before the check.
  const markers = ['manifest.json', 'update.lock', 'transaction.json', ADOPTION_NAME];
  for (const name of markers) {
    for (let i = 0; i < 20; i++) {
      const root = await project(t);
      await seedUnmanagedProject({ targetDir: root });
      const planter = plantWhen(path.join(root, 'docs', 'tasks'),
        () => writeFileSync(path.join(root, name), MARKER_BYTES));
      const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
        .then(() => 'created').catch((e) => e);
      assert.equal(await planter, true, `planter must fire for ${name}`);
      assert.notEqual(outcome, 'created', `late ${name} at the final-check boundary must refuse`);
      assertLateStrayRefusal(outcome, { expectPostMutation: true });
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
      assert.equal(await readFile(path.join(root, name), 'utf8'), MARKER_BYTES);
    }
  }
});

test('STRAYS-09 concurrent sibling churn with a late marker: invariants hold, marker and siblings untouched', async (t) => {
  let refusals = 0, successes = 0;
  for (let i = 0; i < 15; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    await writeFileSync(path.join(root, 'sibling.txt'), 'sibling-content');
    let stop = false;
    const churn = (async () => {
      while (!stop) {
        await mkdir(path.join(root, 'concurrent-sibling'), { recursive: true }).catch(() => {});
        const { rm } = await import('node:fs/promises');
        await rm(path.join(root, 'concurrent-sibling'), { recursive: true, force: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    const planter = plantWhen(path.join(root, 'docs'),
      () => writeFileSync(path.join(root, 'transaction.json'), MARKER_BYTES));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then((r) => ({ ok: true, result: r })).catch((e) => ({ ok: false, error: e }));
    stop = true;
    await churn;
    assert.equal(await planter, true, 'planter must fire');
    assert.equal(await readFile(path.join(root, 'transaction.json'), 'utf8'), MARKER_BYTES, 'marker must stay untouched');
    assert.equal(await readFile(path.join(root, 'sibling.txt'), 'utf8'), 'sibling-content', 'unrelated sibling content must stay untouched');
    if (outcome.ok) {
      successes++;
      assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
    } else {
      refusals++;
      assert.equal(outcome.error.code, 'E_SCOPED_RECOVERY_STATE_PRESENT');
      assert.equal(outcome.error.scopedPhase, 'post-mutation');
      await assertNoTaskFile(root);
    }
  }
  t.diagnostic(`STRAYS-09 harness: ${refusals} refusals, ${successes} residual successes (plant after final check)`);
});

test('STRAYS-10 no unintended mutation: success writes exactly one file; refusal leaves no poisoned state', async (t) => {
  // Success: exactly one added file, AGENTS.md/package.json
  // byte-identical, classification unchanged, no marker state.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const beforeAgents = await readFile(path.join(root, 'AGENTS.md'));
    const beforePkg = await readFile(path.join(root, 'package.json'));
    const beforeClass = (await inspectProject(root)).classification;
    const result = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES);
    assert.equal(result.relative, 'docs/tasks/demo-task.md');
    assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'docs/tasks/demo-task.md', 'package.json']);
    assert.ok((await readFile(path.join(root, 'AGENTS.md'))).equals(beforeAgents));
    assert.ok((await readFile(path.join(root, 'package.json'))).equals(beforePkg));
    assert.equal((await inspectProject(root)).classification, 'EXISTING');
    assert.equal(beforeClass, 'EXISTING');
    for (const name of ['manifest.json', 'update.lock', 'transaction.json', ADOPTION_NAME, '.vcp']) {
      assert.equal((await lstat(path.join(root, name)).catch((e) => e.code)), 'ENOENT', `no ${name} may appear on success`);
    }
  }
  // Refusal then removal: no poisoned state; creation succeeds
  // after the marker is removed, and refuses again while present.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = plantWhen(path.join(root, 'docs'),
      () => writeFileSync(path.join(root, 'manifest.json'), MARKER_BYTES));
    const first = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire');
    assert.notEqual(first, 'created');
    assertLateStrayRefusal(first, { expectPostMutation: true });
    // Marker still present: a second call refuses again.
    await assert.rejects(createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES),
      (e) => e.code === 'E_SCOPED_RECOVERY_STATE_PRESENT');
    // Marker removed: creation succeeds with exactly one file.
    const { rm } = await import('node:fs/promises');
    await rm(path.join(root, 'manifest.json'));
    const result = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES);
    assert.equal(result.relative, 'docs/tasks/demo-task.md');
    assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
  }
});
