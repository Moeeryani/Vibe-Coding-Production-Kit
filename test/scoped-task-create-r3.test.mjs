// SC-01 R-3 hardening (OD-R3) — final .vcp-absence re-check tests.
//
// These tests cover the narrow corrective change on top of frozen
// 57e4df4: one final lstat-based .vcp check after parent preparation
// and immediately before the exclusive open in
// lib/scoped-task-create.mjs. They assert, for .vcp appearing late:
//
//   - refusal with the original error (E_SCOPED_MANAGED_STATE_PRESENT,
//     '.vcp entry appeared during creation'), never a fall-through to
//     the gated helper after a mutation;
//   - post-mutation classification, ledger cleanup, and accurate
//     filesystem evidence when this operation created parents;
//   - the planted .vcp entry itself is never written, modified, or
//     followed (directory, file, symlink, and dangling-symlink shapes);
//   - no second write attempt and no managed state created by SC-01.
//
// Ordering control uses disposable-filesystem watcher loops only: a
// planter polls (setImmediate + synchronous lstat) for a parent
// directory to appear, then plants .vcp with a synchronous filesystem
// call. No production test-only hook is added. The final check
// narrows the R-3 window; it does not atomically eliminate the
// check-to-open interleaving. The R-3 reproduction harness (R3-08)
// states that residual honestly: a plant landing after the final
// check but before open(2) can still succeed, and is counted
// separately from a missed check. Fixtures are disposable real
// filesystems under os.tmpdir().
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

async function sandbox(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-scoped-r3-'));
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

function assertLateRefusal(error, { expectPostMutation }) {
  assert.equal(error.code, 'E_SCOPED_MANAGED_STATE_PRESENT');
  assert.match(error.message, /\.vcp entry appeared during creation/);
  assert.equal(error.scopedPhase, expectPostMutation ? 'post-mutation' : 'pre-mutation');
  assert.equal(error.scopedFile, undefined, 'late refusal must not name a created file');
}

test('R3-01 .vcp directory appearing after parent creation refuses post-mutation with cleanup', async (t) => {
  for (let i = 0; i < 20; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const docs = path.join(root, 'docs');
    const planter = plantWhen(docs, () => mkdirSync(path.join(root, '.vcp')));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire on docs/ appearance');
    assert.notEqual(outcome, 'created', 'late .vcp must refuse');
    assertLateRefusal(outcome, { expectPostMutation: true });
    assert.ok(outcome.scopedCleanup, 'post-mutation error must carry cleanup status');
    assert.equal(outcome.scopedCleanup.attempted, 2, 'both created parents must be cleaned up');
    assert.deepEqual(outcome.scopedCleanup.leftover, []);
    await assertNoTaskFile(root);
    assert.equal((await lstat(docs).catch((e) => e.code)), 'ENOENT', 'created parents must be removed');
    const vcp = await lstat(path.join(root, '.vcp'));
    assert.ok(vcp.isDirectory() && !vcp.isSymbolicLink(), 'planted .vcp dir must survive untouched');
    assert.deepEqual(await readdir(path.join(root, '.vcp')), [], 'nothing may be written into .vcp');
  }
});

test('R3-02 .vcp regular file appearing after parent creation refuses, file bytes untouched', async (t) => {
  for (let i = 0; i < 20; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = plantWhen(path.join(root, 'docs'),
      () => writeFileSync(path.join(root, '.vcp'), 'planted-vcp-file'));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire');
    assert.notEqual(outcome, 'created', 'late .vcp file must refuse');
    assertLateRefusal(outcome, { expectPostMutation: true });
    assert.deepEqual(outcome.scopedCleanup.leftover, []);
    await assertNoTaskFile(root);
    assert.equal(await readFile(path.join(root, '.vcp'), 'utf8'), 'planted-vcp-file');
  }
});

test('R3-03 .vcp symlink (live target and dangling) appearing after parent creation refuses, link and target untouched', async (t) => {
  for (const shape of ['live', 'dangling']) {
    for (let i = 0; i < 10; i++) {
      const base = await sandbox(t);
      const root = path.join(base, 'vcp-proj');
      await mkdir(root, { recursive: true });
      await seedUnmanagedProject({ targetDir: root });
      const targetDir = path.join(base, 'vcp-elsewhere');
      await mkdir(targetDir, { recursive: true });
      const linkTarget = shape === 'live' ? targetDir : path.join(base, 'no-such-target');
      const planter = plantWhen(path.join(root, 'docs'),
        () => symlinkSync(linkTarget, path.join(root, '.vcp')));
      const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
        .then(() => 'created').catch((e) => e);
      assert.equal(await planter, true, 'planter must fire');
      assert.notEqual(outcome, 'created', `late .vcp ${shape} symlink must refuse`);
      assertLateRefusal(outcome, { expectPostMutation: true });
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      const link = await lstat(path.join(root, '.vcp'));
      assert.ok(link.isSymbolicLink(), 'planted .vcp must remain a symlink');
      assert.equal(await readlink(path.join(root, '.vcp')), linkTarget);
      if (shape === 'live') assert.deepEqual(await readdir(targetDir), [], 'link target must stay empty');
    }
  }
});

test('R3-04 .vcp appearing while parents pre-exist refuses pre-mutation, parents and .vcp intact', async (t) => {
  let classified = 0, early = 0, late = 0;
  for (let i = 0; i < 20; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root, docsDir: true });
    await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
    // Plant on the next macrotask turn: the plant may land before
    // classification, before the early eligibility checks, or between
    // them and the final check. All three landings must refuse
    // pre-mutation (nothing was created by this operation).
    const planter = (async () => {
      await new Promise((r) => setImmediate(r));
      mkdirSync(path.join(root, '.vcp'));
    })();
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    await planter;
    assert.notEqual(outcome, 'created', 'late .vcp must refuse');
    assert.equal(outcome.scopedPhase, 'pre-mutation', 'no mutation means pre-mutation phase');
    if (outcome.code === 'E_SCOPED_INELIGIBLE_STATE' && /classification (BLOCKED|MANAGED)/.test(outcome.message)) classified++;
    else if (outcome.code === 'E_SCOPED_MANAGED_STATE_PRESENT' && /\.vcp entry exists/.test(outcome.message)) early++;
    else if (outcome.code === 'E_SCOPED_MANAGED_STATE_PRESENT' && /appeared during creation/.test(outcome.message)) late++;
    else assert.fail(`unexpected refusal: ${outcome.code}: ${outcome.message}`);
    assert.equal(outcome.scopedCleanup, undefined, 'no cleanup when nothing was created');
    await assertNoTaskFile(root);
    assert.ok((await lstat(path.join(root, 'docs', 'tasks'))).isDirectory(), 'pre-existing parents must survive');
    assert.ok((await lstat(path.join(root, '.vcp'))).isDirectory(), 'planted .vcp must survive');
  }
  t.diagnostic(`R3-04 harness: ${classified} classification, ${early} early, ${late} final-check refusals (all valid pre-mutation)`);
});

test('R3-05 task-level late .vcp keeps the original error: no fall-through to the gate, no second attempt', async (t) => {
  for (let i = 0; i < 10; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = plantWhen(path.join(root, 'docs'), () => mkdirSync(path.join(root, '.vcp')));
    const outcome = await createTaskPack({ targetDir: root, slug: 'demo-task' })
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire');
    assert.notEqual(outcome, 'created', 'late .vcp must refuse at task level');
    // The original scoped error must surface, NOT E_G_FENCE_NO_GO:
    // a post-mutation failure is never retried through the gate.
    assert.equal(outcome.code, 'E_SCOPED_MANAGED_STATE_PRESENT');
    assert.match(outcome.message, /\.vcp entry appeared during creation/);
    assert.equal(outcome.scopedPhase, 'post-mutation');
    assert.equal(outcome.cause, undefined, 'original error must not be wrapped as a gate cause');
    assert.ok(outcome.scopedCleanup, 'post-mutation error must carry cleanup status');
    assert.deepEqual(outcome.scopedCleanup.leftover, []);
    await assertNoTaskFile(root);
    assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
    assert.deepEqual(await readdir(path.join(root, '.vcp')), [], '.vcp must stay untouched');
  }
});

test('R3-06 unmanaged normal creation still succeeds with the final check in place', async (t) => {
  // Parents absent: helper creates them, final check passes.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const result = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES);
    assert.equal(result.relative, 'docs/tasks/demo-task.md');
    assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
    assert.equal((await lstat(path.join(root, '.vcp')).catch((e) => e.code)), 'ENOENT');
    assert.equal((await inspectProject(root)).classification, 'EXISTING');
  }
  // Parents pre-existing: same outcome via the task-level path.
  {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root, docsDir: true });
    await mkdir(path.join(root, 'docs', 'tasks'), { recursive: true });
    await createTaskPack({ targetDir: root, slug: 'demo-task' });
    assert.deepEqual(await walkFiles(root), ['AGENTS.md', 'docs/tasks/demo-task.md', 'package.json']);
  }
});

test('R3-07 concurrent parent operations with a late .vcp: invariants hold, no corruption', async (t) => {
  let refusals = 0, successes = 0;
  for (let i = 0; i < 15; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    let stop = false;
    const churn = (async () => {
      while (!stop) {
        await mkdir(path.join(root, 'concurrent-sibling'), { recursive: true }).catch(() => {});
        const { rm } = await import('node:fs/promises');
        await rm(path.join(root, 'concurrent-sibling'), { recursive: true, force: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 0));
      }
    })();
    const planter = plantWhen(path.join(root, 'docs'), () => mkdirSync(path.join(root, '.vcp')));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then((r) => ({ ok: true, result: r })).catch((e) => ({ ok: false, error: e }));
    stop = true;
    await churn;
    assert.equal(await planter, true, 'planter must fire');
    const vcp = await lstat(path.join(root, '.vcp'));
    assert.ok(vcp.isDirectory(), '.vcp must exist and be untouched');
    assert.deepEqual(await readdir(path.join(root, '.vcp')), [], 'nothing may be written into .vcp');
    if (outcome.ok) {
      successes++;
      assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES));
    } else {
      refusals++;
      assert.equal(outcome.error.code, 'E_SCOPED_MANAGED_STATE_PRESENT');
      assert.equal(outcome.error.scopedPhase, 'post-mutation');
      await assertNoTaskFile(root);
    }
  }
  t.diagnostic(`R3-07 harness: ${refusals} refusals, ${successes} residual successes (plant after final check)`);
});

test('R3-08 R-3 reproduction: .vcp planted after parent preparation, precise ordering, honest residual', async (t) => {
  // Reproduces the G3-B6 ordering: the planter fires when the LAST
  // parent (docs/tasks) appears, i.e. after parent preparation and
  // immediately before the exclusive open. The new final check must
  // catch the plant whenever it lands before the check; a plant
  // landing in the remaining check-to-open micro-window may still
  // succeed. That residual is counted, not hidden: success here
  // requires exact bytes and an untouched .vcp, and refusal requires
  // the full post-mutation evidence set.
  let refusals = 0, residualSuccesses = 0;
  for (let i = 0; i < 20; i++) {
    const root = await project(t);
    await seedUnmanagedProject({ targetDir: root });
    const planter = plantWhen(path.join(root, 'docs', 'tasks'), () => mkdirSync(path.join(root, '.vcp')));
    const outcome = await createScopedTaskFile(root, 'docs/tasks/demo-task.md', PACK_BYTES)
      .then(() => 'created').catch((e) => e);
    assert.equal(await planter, true, 'planter must fire on docs/tasks appearance');
    const vcp = await lstat(path.join(root, '.vcp'));
    assert.ok(vcp.isDirectory(), '.vcp must survive');
    assert.deepEqual(await readdir(path.join(root, '.vcp')), [], 'nothing may be written into .vcp');
    if (outcome === 'created') {
      residualSuccesses++;
      assert.ok((await readFile(path.join(root, 'docs', 'tasks', 'demo-task.md'))).equals(PACK_BYTES),
        'residual success must still be byte-exact');
    } else {
      refusals++;
      assertLateRefusal(outcome, { expectPostMutation: true });
      assert.ok(outcome.scopedCleanup, 'refusal must carry cleanup status');
      assert.deepEqual(outcome.scopedCleanup.leftover, []);
      await assertNoTaskFile(root);
      assert.equal((await lstat(path.join(root, 'docs')).catch((e) => e.code)), 'ENOENT');
    }
  }
  assert.ok(refusals >= 1, 'the final check must fire in the reproduced ordering at least once');
  t.diagnostic(`R3-08 harness: ${refusals} final-check refusals, ${residualSuccesses} check-to-open residual successes`);
});
