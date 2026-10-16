// B-9 parent namespace adversarial tests.
// Proves root identity pinning detects replacement/rename races.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { runWriterTransaction } from '../lib/production-writer.mjs';

const OPS = ['b9-test', 'journal-write', 'journal-clear'];

test('B9-01 — root replacement detected before mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  const origRoot = f.root;
  // Replace the root directory (simulates parent rename/replacement).
  await rm(origRoot, { recursive: true, force: true });
  await mkdir(origRoot, { recursive: true, mode: 0o700 });
  try {
    await assert.rejects(
      runWriterTransaction({
        root: origRoot, operation: 'b9-test', mode: 'update',
        testCapability: f.capability,
        mutate: async () => {},
      }),
      /E_TEST_CAPABILITY_IDENTITY|E_WRITER_IDENTITY_CHANGED/
    );
  } finally {
    await rm(origRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test('B9-02 — valid root identity passes verification', async () => {
  const { pinPathIdentity, verifyPathIdentity } = await import('../lib/writer-identity.mjs');
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const pin = await pinPathIdentity(f.root);
    // Re-verify should pass for unmodified root.
    await verifyPathIdentity(f.root, pin);
  } finally { await teardownControlledFixture(f); }
});

test('B9-03 — identity pinning available for mutations', async () => {
  const { pinPathIdentity, verifyPathIdentity } = await import('../lib/writer-identity.mjs');
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const pin = await pinPathIdentity(f.root);
    assert.ok(pin, 'pin created');
    assert.ok(typeof pin.dev === 'number', 'pin has dev');
    assert.ok(typeof pin.ino === 'number', 'pin has ino');
    await verifyPathIdentity(f.root, pin);
  } finally { await teardownControlledFixture(f); }
});
