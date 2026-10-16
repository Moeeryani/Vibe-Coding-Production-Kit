// Phase 5 regression tests for durability-guard integrity.
// Requirement: never convert the Windows fail-closed guard into a pass, and
// never let a caller switch it off. These tests are the regression fence for
// "no silent unsupported filesystem fallback".
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lifecycleDurabilityCapability, assertLifecycleDurabilitySupported,
} from '../lib/file-durability.mjs';

const IS_WINDOWS = process.platform === 'win32';

test('DUR-01 — win32 durability is refused, and refuses INDEPENDENT of the root given', async () => {
  if (!IS_WINDOWS) return;
  const cap = lifecycleDurabilityCapability('win32');
  assert.equal(cap.supported, false);
  assert.equal(cap.reason, 'WINDOWS_NAMESPACE_DURABILITY_UNPROVEN');
  assert.equal(cap.requiresNativeProof, true);
  // Any root must be refused: the guard is platform-level, not path-level, so
  // it cannot be dodged by choosing a friendlier directory.
  for (const root of ['D:\\', 'D:\\Windows', process.cwd(), 'D:\\nonexistent-zz']) {
    await assert.rejects(assertLifecycleDurabilitySupported(root),
      (e) => e.code === 'E_DIRECTORY_SYNC_UNPROVEN',
      `durability must refuse for root ${root}`);
  }
});

test('DUR-02 — there is no caller-supplied way to authorize durability', () => {
  // The capability function takes only a platform string; passing anything
  // other than an allow-listed platform must not conjure support. Matching is
  // exact and case-sensitive, so 'Linux' is NOT a synonym for 'linux'.
  assert.equal(lifecycleDurabilityCapability('linux').supported, true);
  for (const bogus of [undefined, null, 'WIN32', 'win32 ', 'windows', 'Linux', 0, {}, '']) {
    const cap = lifecycleDurabilityCapability(bogus);
    assert.equal(cap.supported, false,
      `platform ${JSON.stringify(bogus)} must not be reported as durable`);
    assert.equal(cap.requiresNativeProof, true,
      `platform ${JSON.stringify(bogus)} must demand native proof`);
  }
});

test('DUR-03 — durability capability is a frozen value object', () => {
  const cap = lifecycleDurabilityCapability('win32');
  assert.equal(Object.isFrozen(cap), true);
  assert.throws(() => { cap.supported = true; }, TypeError);
});
