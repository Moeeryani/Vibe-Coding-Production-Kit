// B-4 controlled concurrency tests — EXECUTE ONLY AFTER EXPLICIT OWNER APPROVAL.
// See B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md. These tests perform
// gate-bypassed mutations through the controlled lane against disposable
// fixtures. They MUST NOT run without approval.
//
// REPAIRED (Windows campaign 2026-10-16): assertions of the form
//   assert.rejects(op, /E_TEST_CAPABILITY_IDENTITY|E_WRITER/)
// accepted a rejection raised by any layer, and the success-path tests could
// not distinguish "concurrency enforced" from "never reached concurrency".
// Each test now names exactly one enforcement layer; a pre-empting earlier
// guard is reported INCONCLUSIVE, never PASS. No security guard was weakened.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { runWriterTransaction } from '../lib/production-writer.mjs';
import { requireLayer, assertLayerPassed, mutationTest } from './helpers/layer-assertion.mjs';
import { LAYER } from './helpers/writer-layers.mjs';
import { runPostMutationReverifyScenario } from './helpers/post-mutation-reverify.mjs';
import { CONTROLLED_LANE_APPROVED_FOR_EXECUTION } from './helpers/controlled-lane-approval.mjs';

// The security gate lives in one place: test/helpers/controlled-lane-approval.mjs.
// SECURITY GATE: the controlled lane runs ONLY after explicit owner approval
// (OWNER AUTHORIZATION GRANTED 2026-10-14: B-4/B-5 controlled validation
// execution). See the helper for the full note, including what that approval
// does NOT cover.
const LANE_APPROVED_FOR_EXECUTION = CONTROLLED_LANE_APPROVED_FOR_EXECUTION;
// Two distinct gates, chosen by what the test needs to RUN:
//  mutGate     - asserts a mutation SUCCEEDED. Where namespace durability is
//                unproven no mutation can happen, so INCONCLUSIVE (not pass, not defect).
//  refusalGate - asserts a REFUSAL that is raised before any mutation
//                (capability forgery/scope, pre-lock identity). These are fully
//                meaningful on Windows and must not be masked as INCONCLUSIVE.
const mutGate = (name, fn) => mutationTest(name, fn, { skip: !LANE_APPROVED_FOR_EXECUTION });
const refusalGate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['b4-concurrency'];


mutGate('B4-01 — two concurrent writers: lock serializes, no corruption', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const writer = (content) => runWriterTransaction({
      root: f.root, operation: 'b4-concurrency', mode: 'init',
      testCapability: f.capability,
      mutate: async ({ atomic }) => {
        await atomic.writeFile(f.root, 'shared.txt', Buffer.from(content));
        return { wrote: content };
      },
    });
    const results = await Promise.allSettled([writer('writer-A\n'), writer('writer-B\n')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    // At least one succeeds; the other is refused (lock) — never both mutate torn.
    assert.ok(fulfilled.length >= 1, 'at least one writer must succeed');
    const content = await readFile(path.join(f.root, 'shared.txt'), 'utf8');
    assert.ok(content === 'writer-A\n' || content === 'writer-B\n', `torn content: ${content}`);
  } finally { await teardownControlledFixture(f); }
});

mutGate('B4-02 — conflicting updates: one valid outcome or safe refusal', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await runWriterTransaction({
      root: f.root, operation: 'b4-concurrency', mode: 'init',
      testCapability: f.capability,
      mutate: async ({ atomic }) => {
        await atomic.writeFile(f.root, 'config.txt', Buffer.from('v1\n'));
      },
    });
    // Second transaction proposes incompatible change; must serialize safely.
    await runWriterTransaction({
      root: f.root, operation: 'b4-concurrency', mode: 'update',
      testCapability: f.capability,
      mutate: async ({ atomic }) => {
        await atomic.writeFile(f.root, 'config.txt', Buffer.from('v2-incompatible\n'));
      },
    });
    const content = await readFile(path.join(f.root, 'config.txt'), 'utf8');
    assert.ok(['v1\n', 'v2-incompatible\n'].includes(content), `corrupt: ${content}`);
  } finally { await teardownControlledFixture(f); }
});

// B4-03 exercises the writer core's POST-mutation re-verification (step 5b,
// lib/production-writer.mjs). Named honestly: the code that rejects a
// mid-mutation fixture replacement is the post-mutation re-verification, NOT
// the step-4b pin (which runs BEFORE mutate and cannot see a replacement made
// during it). The previous `/E_TEST_CAPABILITY_IDENTITY|E_WRITER/` regex
// implied B-9 pin coverage that this scenario never provided.
//
// FINDING-001 (2026-10-23, Linux review of candidate 690138ee): the claim
// used to name the step-2 CAPABILITY layer and to list G_FENCE among the
// guards before it. Both were wrong. G_FENCE is the production ALTERNATIVE
// at step 2 — a test capability REPLACES it, it never runs after it — so it
// cannot preempt a controlled transaction, and because the old layer order
// placed G_FENCE after CAPABILITY the claim was rejected outright. The layer
// under test is the step-5b re-verification: a separate enforcement site with
// its own code, so a refusal raised by the INITIAL capability check can never
// be reported as a step-5b pass. The scenario itself is shared with the
// mutation test (test/writer-post-mutation-reverify.test.mjs) so both prove
// the same detection path.
mutGate('B4-03 — fixture replaced during mutate is refused by step 5b re-verification', async () => {
  const { outcome, mutated } = await runPostMutationReverifyScenario(runWriterTransaction);
  // The verdict comes first: a scenario that was preempted by an earlier
  // guard is INCONCLUSIVE, and that classification must not be lost to a
  // scenario-precondition assertion.
  assertLayerPassed(outcome);
  assert.equal(outcome.actual, LAYER.CAPABILITY_REVERIFY,
    'the refusal must be attributed to the post-mutation re-verification');
  assert.equal(mutated, true,
    'replacement was intended to happen mid-mutate; if it did not, the scenario did not run');
});

mutGate('B4-04 — interrupted transaction: journal consistent, no torn files', async (t) => {
  const { spawn } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { forceKill, waitExit } = await import('./helpers/child-kill.mjs');
  const sha256 = (b) => createHash('sha256').update(b).digest('hex');
  const childPath = path.resolve(import.meta.dirname, 'helpers', 'controlled-crash-child.mjs');

  // Same reachability gate as B5-04: where namespace durability is unproven no
  // mutation can start, so there is no crash window to interrupt. Report
  // INCONCLUSIVE instead of spawning a child that can only die early.
  const { lifecycleDurabilityCapability } = await import('../lib/file-durability.mjs');
  const durability = lifecycleDurabilityCapability();
  if (!durability.supported) {
    const e = new Error(`INCONCLUSIVE: mutation is unreachable on '${durability.reason}'` +
      ` — no transaction can be interrupted`);
    e.code = 'E_TEST_INCONCLUSIVE';
    throw e;
  }

  const child = spawn(process.execPath, [childPath, 'transaction'], {
    env: { ...process.env, TMPDIR: process.env.TMPDIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let fixtureRoot = null;
  let childErr = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child startup timeout')), 15000);
    child.once('exit', (code, signal) => {
      childErr = { code, signal };
      if (!fixtureRoot) { clearTimeout(timer); resolve(); }
    });
    child.stdout.on('data', (d) => {
      const s = d.toString();
      const m = s.match(/FIXTURE_ROOT=(\S+)/);
      if (m) fixtureRoot = m[1];
      if (s.includes('READY')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
  });
  assert.ok(fixtureRoot, `child reported fixture root (exit ${JSON.stringify(childErr)})`);
  if (childErr) {
    const { rm } = await import('node:fs/promises');
    await rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
    const e = new Error(`INCONCLUSIVE: child exited (${childErr.code ?? childErr.signal})` +
      ' before the mutation window — crash-atomicity not exercised');
    e.code = 'E_TEST_INCONCLUSIVE';
    throw e;
  }
  await new Promise((r) => setTimeout(r, 800));
  const kill = await forceKill(child, { timeoutMs: 10_000 });
  const post = await waitExit(child, 10_000);
  assert.equal(kill.terminated && post.exited, true,
    `child was not terminated: ${JSON.stringify(kill)}`);
  t.diagnostic(`child killed; fixture=${fixtureRoot}`);
  // Verify: fixture intact, no torn files, journal consistent or absent.
  const { readdir, readFile: rf } = await import('node:fs/promises');
  const entries = await readdir(fixtureRoot);
  // No temp files left behind (atomic writes clean up).
  const temps = entries.filter((e) => e.includes('.tmp') || e.startsWith('.vcp-tmp'));
  assert.equal(temps.length, 0, `temp files leaked: ${temps}`);
  // crash-target.txt is either absent or complete (atomic rename).
  let content = null;
  try { content = await rf(path.join(fixtureRoot, 'crash-target.txt'), 'utf8'); } catch {}
  if (content !== null) {
    assert.equal(content, 'partial-write\n', 'torn file detected');
    assert.equal(sha256(content), sha256('partial-write\n'));
  }
  // Journal: if present, must be valid JSON (not torn).
  try {
    const j = await rf(path.join(fixtureRoot, '.vcp', 'journal.json'), 'utf8').catch(() => null);
    if (j) JSON.parse(j);
  } catch { assert.fail('torn journal'); }
  // Cleanup: remove the orphaned fixture (child is dead; verify identity first).
  const { rm } = await import('node:fs/promises');
  await rm(fixtureRoot, { recursive: true, force: true });
  t.diagnostic('B4-04 evidence: no torn files, no temp leaks, journal valid/absent');
});

// B4-05 needs a live lock to contend with. On Windows acquisition itself is
// refused by the durability guard, so the correct Windows verdict is
// INCONCLUSIVE — not a pass, and not a product defect either.
mutGate('B4-05 — lock contention: mutation while locked is refused', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  let lock = null;
  try {
    const { acquireLifecycleLock } = await import('../lib/lifecycle-lock-v2.mjs');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(f.root, '.vcp'), { recursive: true });
    // Wrapped by `gate`/mutationTest: on a platform where the lifecycle lock
    // cannot be acquired this body never runs, so no inverted assertion is
    // needed and the fixture is not leaked.
    lock = await acquireLifecycleLock(f.root, { mode: 'update' });
    // Single expected code, no alternation: the second writer must be refused
    // because the lock is held, not because some earlier guard objected.
    await assert.rejects(
      runWriterTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'update',
        testCapability: f.capability, mutate: async () => {},
      }),
      (e) => e.code === 'E_LOCK_ALREADY_HELD',
      'a held lifecycle lock must refuse the second writer');
  } finally {
    if (lock) await lock.release().catch(() => {});
    await teardownControlledFixture(f).catch(() => {});
  }
});

// B4-06 targets the capability SCOPE control. Note the repair: the previous
// form spread the capability object, which breaks WeakSet membership, so it
// proved E_TEST_CAPABILITY_INVALID (forgery) — an earlier check — while its
// regex /E_TEST_CAPABILITY/ claimed scope enforcement. A genuine capability
// is now verified against a foreign root, which is how runWriterTransaction
// reaches the scope branch (production-writer.mjs:84).
refusalGate('B4-06 — capability scoped to another fixture is refused (CAPABILITY_SCOPE layer)', async () => {
  const a = await createControlledFixture({ allowedOperations: OPS });
  const b = await createControlledFixture({ allowedOperations: OPS });
  try {
    const { verifyTestCapability } = await import(
      './helpers/controlled-writer-capability.mjs');
    const outcome = await requireLayer(
      () => verifyTestCapability(a.capability, { root: b.root, operation: OPS[0] }),
      { intended: LAYER.CAPABILITY_SCOPE, guardsBefore: [] },
    );
    assertLayerPassed(outcome);
  } finally {
    await teardownControlledFixture(a).catch(() => {});
    await teardownControlledFixture(b).catch(() => {});
  }
});

// The forgery property the old B4-06 accidentally exercised, now named for
// what it actually proves.
refusalGate('B4-07 — copied capability object is refused (forgery, CAPABILITY layer)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const outcome = await requireLayer(
      () => runWriterTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'init',
        testCapability: { ...f.capability },
        mutate: async () => { throw new Error('mutate must not run'); },
      }),
      { intended: LAYER.CAPABILITY_INVALID, guardsBefore: [LAYER.BOUNDARY] },
    );
    assertLayerPassed(outcome);
  } finally { await teardownControlledFixture(f); }
});
