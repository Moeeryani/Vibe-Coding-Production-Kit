// M-3 authorization injection regression tests.
// Proves the `authorize` injection parameter is removed and the gate
// cannot be bypassed by caller-supplied callbacks.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  runWriterTransaction, authorizeV2Operation, authorizeLegacyOperation,
} from '../lib/production-writer.mjs';

test('M3-01 — caller-supplied no-op authorization cannot authorize writes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m3-'));
  let mutated = false;
  // The `authorize` parameter no longer exists; passing it is ignored.
  await assert.rejects(
    runWriterTransaction({
      root: dir, operation: 'probe',
      authorize: async () => {}, // ignored: not a recognized parameter
      mutate: async () => { mutated = true; },
    }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
  assert.equal(mutated, false);
});

test('M3-02 — production entrypoints always reach the mandatory gate', async () => {
  // runWriterTransaction without testCapability always calls the gate.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m3-'));
  await assert.rejects(
    runWriterTransaction({ root: dir, operation: 'probe', mutate: async () => {} }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
  // The CLI has no testCapability path (static check in validator).
  const cli = await (await import('node:fs/promises')).readFile(
    path.resolve(import.meta.dirname, '..', 'lib', 'cli.mjs'), 'utf8');
  assert.ok(!cli.includes('testCapability'));
});

test('M3-03 — missing capability fails closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m3-'));
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: dir, operation: 'probe', testCapability: null,
      mutate: async () => { mutated = true; },
    }),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
  assert.equal(mutated, false);
});

test('M3-04 — fake capability fails closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m3-'));
  let mutated = false;
  await assert.rejects(
    runWriterTransaction({
      root: dir, operation: 'probe',
      testCapability: { id: 'fake', fixtureRoot: dir, revoked: false },
      mutate: async () => { mutated = true; },
    }),
    /E_TEST_CAPABILITY_INVALID/
  );
  assert.equal(mutated, false);
});

test('M3-05 — existing v2 authorization remains effective', async () => {
  // The production gate still refuses while writers are disabled.
  assert.throws(
    () => authorizeV2Operation(),
    (e) => e && e.code === 'E_G_FENCE_NO_GO'
  );
});

test('M3-06 — legacy behavior remains within its documented contract', async () => {
  // authorizeLegacyOperation preserves existing semantics: boundary check
  // only, no gate change. It must not throw for a valid boundary.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m3-'));
  const result = await authorizeLegacyOperation({ root: dir, operation: 'legacy-probe' });
  assert.ok(result && typeof result === 'object', 'legacy authorize returns boundary');
});
