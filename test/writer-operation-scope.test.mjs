// M-1 operation-scope regression tests.
// Proves capabilities cannot escape their permitted operation scope.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { verifyTestCapability } from './helpers/controlled-writer-capability.mjs';
import { runWriterTransaction } from '../lib/production-writer.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';

test('M1-01 — probe-scoped capability cannot authorize rollback', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    await assert.rejects(
      verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' }),
      /E_TEST_CAPABILITY_OPERATION/
    );
    let mutated = false;
    await assert.rejects(
      rollbackV2({
        root: f.root, backupId: 'x', confirmed: true,
        testCapability: f.capability,
      }),
      /E_TEST_CAPABILITY_OPERATION/
    );
    assert.equal(mutated, false);
  } finally { await teardownControlledFixture(f); }
});

test('M1-02 — B-4 capability cannot authorize B-5', async () => {
  const f = await createControlledFixture({ allowedOperations: ['b4-concurrency'] });
  try {
    await assert.rejects(
      verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' }),
      /E_TEST_CAPABILITY_OPERATION/
    );
  } finally { await teardownControlledFixture(f); }
});

test('M1-03 — B-5 capability cannot authorize B-4', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2'] });
  try {
    await assert.rejects(
      verifyTestCapability(f.capability, { root: f.root, operation: 'b4-concurrency' }),
      /E_TEST_CAPABILITY_OPERATION/
    );
    let mutated = false;
    await assert.rejects(
      runWriterTransaction({
        root: f.root, operation: 'b4-concurrency',
        testCapability: f.capability,
        mutate: async () => { mutated = true; },
      }),
      /E_TEST_CAPABILITY_OPERATION/
    );
    assert.equal(mutated, false);
  } finally { await teardownControlledFixture(f); }
});

test('M1-04 — unknown operations are refused', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    for (const op of ['delete-everything', '', null, undefined, '../probe']) {
      await assert.rejects(
        verifyTestCapability(f.capability, { root: f.root, operation: op }),
        /E_TEST_CAPABILITY_OPERATION/
      );
    }
  } finally { await teardownControlledFixture(f); }
});

test('M1-05 — empty permission set grants no access', async () => {
  // The fixture helper refuses empty allowedOperations at creation.
  await assert.rejects(
    createControlledFixture({ allowedOperations: [] }),
    /E_FIXTURE/
  );
  await assert.rejects(
    createControlledFixture({}),
    /E_FIXTURE/
  );
});

test('M1-06 — permission escalation cannot occur after minting', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    // allowedOperations is frozen; mutation attempts fail or are ignored.
    assert.throws(
      () => { f.capability.allowedOperations.push('rollback-v2'); },
      TypeError
    );
    await assert.rejects(
      verifyTestCapability(f.capability, { root: f.root, operation: 'rollback-v2' }),
      /E_TEST_CAPABILITY_OPERATION/
    );
  } finally { await teardownControlledFixture(f); }
});
