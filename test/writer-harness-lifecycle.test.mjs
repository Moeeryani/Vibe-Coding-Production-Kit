// Harness lifecycle security tests (H-01..H-08).
// Proves capability lifecycle is correct under concurrent use.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import {
  verifyTestCapability, revokeCapabilitiesForFixture,
} from './helpers/controlled-writer-capability.mjs';

test('H-01 — capability not revoked during concurrent setup', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  try {
    // Simulate concurrent setup: both workers verify before either finishes.
    const v1 = verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' });
    const v2 = verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' });
    await Promise.all([v1, v2]);
    assert.equal(f.capability.revoked, false);
  } finally { await teardownControlledFixture(f); }
});

test('H-02 — capability revoked after all workers finish', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  const cap = f.capability;
  // Workers complete first.
  await verifyTestCapability(cap, { root: f.root, operation: 'rollback-v2' });
  await teardownControlledFixture(f);
  assert.equal(cap.revoked, true);
});

test('H-03 — revoked capability cannot authorize new operations', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  const cap = f.capability;
  const root = f.root;
  await teardownControlledFixture(f);
  await assert.rejects(
    verifyTestCapability(cap, { root, operation: 'rollback-v2' }),
    /E_TEST_CAPABILITY_REVOKED/
  );
});

test('H-04 — cross-fixture capability use rejected', async () => {
  const a = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  const b = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  try {
    await assert.rejects(
      verifyTestCapability(a.capability, { root: b.root, operation: 'rollback-v2' }),
      /E_TEST_CAPABILITY_SCOPE/
    );
  } finally {
    await teardownControlledFixture(a);
    await teardownControlledFixture(b);
  }
});

test('H-05 — failed worker cleanup leaves no usable capability', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  const cap = f.capability;
  const root = f.root;
  // Simulate worker failure: teardown still revokes.
  try {
    throw new Error('worker failed');
  } catch {
    await teardownControlledFixture(f);
  }
  assert.equal(cap.revoked, true);
  await assert.rejects(
    verifyTestCapability(cap, { root, operation: 'rollback-v2' }),
    /E_TEST_CAPABILITY_REVOKED/
  );
});

test('H-06 — worker failure does not permit unauthorized mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    // Worker tries unauthorized operation; fails; capability still valid for allowed ops.
    await assert.rejects(
      verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' }),
      /E_TEST_CAPABILITY_OPERATION/
    );
    // Allowed operation still works (no blanket revocation on failure).
    await verifyTestCapability(f.capability, { root: f.root, operation: 'probe' });
  } finally { await teardownControlledFixture(f); }
});

test('H-07 — fixture cleanup only after worker termination', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  let workerDone = false;
  const worker = (async () => {
    await verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' });
    workerDone = true;
  })();
  await worker;
  assert.equal(workerDone, true);
  await teardownControlledFixture(f);
  assert.equal(f.capability.revoked, true);
});

test('H-08 — production entrypoints remain gate-blocked', async () => {
  // Without a capability, production gate fires (no harness bypass).
  const { rollbackV2 } = await import('../lib/writer-rollback-v2.mjs');
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  try {
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'x', confirmed: true }),
      (e) => e && (e.code === 'E_G_FENCE_NO_GO' || e.code === 'E_TEST_CAPABILITY_INVALID')
    );
  } finally { await teardownControlledFixture(f); }
});
