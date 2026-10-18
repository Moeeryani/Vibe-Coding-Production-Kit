// B-9 parent namespace adversarial tests.
//
// REPAIRED (Windows campaign 2026-10-16). The previous version asserted
//   assert.rejects(op, /E_TEST_CAPABILITY_IDENTITY|E_WRITER_IDENTITY_CHANGED/)
// which is satisfied by EITHER layer. On Windows the controlled capability
// check (step 2) rejects first, so all three tests reported PASS while the
// B-9 production writer identity check (step 4b, lib/production-writer.mjs:99)
// never executed. Each test now names exactly one enforcement layer, and an
// earlier guard pre-empting it is reported INCONCLUSIVE — never PASS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, rm, rename } from 'node:fs/promises';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { runWriterTransaction } from '../lib/production-writer.mjs';
import { requireLayer, assertLayerPassed } from './helpers/layer-assertion.mjs';
import { LAYER, PREEMPTING_TEST_LANE } from './helpers/writer-layers.mjs';

const OPS = ['b9-test', 'journal-write', 'journal-clear'];

// A test that can end INCONCLUSIVE: a preempting earlier guard is a real
// outcome — neither a product defect nor a pass. It surfaces under a distinct
// marker so the Windows matrix can count it separately from FAIL.
const layerTest = (name, fn) => test(name, async (t) => {
  try {
    await fn(t);
  } catch (e) {
    if (e?.code === 'E_TEST_INCONCLUSIVE') {
      t.diagnostic(e.message);
      throw new Error(`INCONCLUSIVE — ${e.message}`, { cause: e });
    }
    throw e;
  }
});

// B9-01a claims ONLY the capability layer, which is the layer that actually
// rejects on Windows. Nothing precedes it but the boundary, so the rejection
// is attributable.
test('B9-01a — controlled capability rejects a replaced fixture root (CAPABILITY layer)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  const origRoot = f.root;
  await rm(origRoot, { recursive: true, force: true });
  await mkdir(origRoot, { recursive: true, mode: 0o700 });
  try {
    const outcome = await requireLayer(
      () => runWriterTransaction({
        root: origRoot, operation: 'b9-test', mode: 'update',
        testCapability: f.capability,
        mutate: async () => { throw new Error('mutate must not run'); },
      }),
      { intended: LAYER.CAPABILITY, guardsBefore: [LAYER.BOUNDARY] },
    );
    assertLayerPassed(outcome);
    assert.equal(outcome.actual, 'E_TEST_CAPABILITY_IDENTITY');
  } finally {
    await rm(origRoot, { recursive: true, force: true }).catch(() => {});
  }
});

// B9-01b is the B-9 control itself: the writer's own root identity check.
// The capability lane is an ACCEPTED guard here, so Windows reports INCONCLUSIVE.
test('B9-01b — production writer identity rejects a replaced root (WRITER_IDENTITY layer)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  const origRoot = f.root;
  await rm(origRoot, { recursive: true, force: true });
  await mkdir(origRoot, { recursive: true, mode: 0o700 });
  try {
    const outcome = await requireLayer(
      () => runWriterTransaction({
        root: origRoot, operation: 'b9-test', mode: 'update',
        testCapability: f.capability,
        mutate: async () => { throw new Error('mutate must not run'); },
      }),
      {
        intended: LAYER.WRITER_IDENTITY,
        // Capability lane only. G_FENCE used to be listed here too, describing a
        // run that takes both authorization branches at once; requireLayer now
        // rejects that mix instead of letting code-matching resolve it silently.
        // The step-2 CAPABILITY check IS a legitimate pre-emptor of this layer, so
        // Windows stays INCONCLUSIVE rather than being dressed up as a pass.
        guardsBefore: [...PREEMPTING_TEST_LANE, LAYER.CAPABILITY,
                       LAYER.DURABILITY, LAYER.PRINCIPAL],
      },
    );
    assertLayerPassed(outcome);   // throws E_TEST_INCONCLUSIVE on Windows
    assert.equal(outcome.actual, 'E_WRITER_IDENTITY_CHANGED');
  } finally {
    await rm(origRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test('B9-02 — primitive: unchanged root identity verifies (PRIMITIVE proof only)', async () => {
  const { pinPathIdentity, verifyPathIdentity } = await import('../lib/writer-identity.mjs');
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const pin = await pinPathIdentity(f.root);
    await verifyPathIdentity(f.root, pin);
  } finally { await teardownControlledFixture(f); }
});

// B9-03 now rejects a VACUOUS identity. `typeof ino === 'number'` passed even
// where the filesystem reports ino 0 for every object, which would make every
// replacement test below pass for the wrong reason.
test('B9-03 — primitive: pin carries non-vacuous (dev, ino) on this filesystem', async () => {
  const { pinPathIdentity, verifyPathIdentity } = await import('../lib/writer-identity.mjs');
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const pin = await pinPathIdentity(f.root);
    assert.ok(pin, 'pin created');
    assert.equal(typeof pin.dev, 'number', 'pin has dev');
    assert.equal(typeof pin.ino, 'number', 'pin has ino');
    assert.notEqual(pin.ino, 0,
      'ino is 0: this filesystem exposes no object identity — replacement tests would be VACUOUS');
    assert.notEqual(pin.dev, 0, 'dev is 0: volume identity not exposed');
    await verifyPathIdentity(f.root, pin);
  } finally { await teardownControlledFixture(f); }
});

// Negative control for B9-02: proves the primitives CAN fail, so B9-02's
// PASS means something.
test('B9-04 — primitive: parent rename/replacement IS detected (negative control)', async () => {
  const { pinPathIdentity, verifyPathIdentity } = await import('../lib/writer-identity.mjs');
  const f = await createControlledFixture({ allowedOperations: OPS });
  const parent = f.root + '.renamed';
  try {
    const pin = await pinPathIdentity(f.root);
    await rename(f.root, parent);
    await mkdir(f.root, { recursive: true });
    const outcome = await requireLayer(
      () => verifyPathIdentity(f.root, pin),
      { intended: LAYER.WRITER_IDENTITY, guardsBefore: [] },
    );
    assertLayerPassed(outcome);
  } finally {
    await rm(parent, { recursive: true, force: true }).catch(() => {});
    await rm(f.root, { recursive: true, force: true }).catch(() => {});
    await teardownControlledFixture(f).catch(() => {});
  }
});
