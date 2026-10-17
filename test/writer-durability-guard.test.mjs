// Phase 5 regression tests for durability-guard integrity.
// Requirement: never convert the Windows fail-closed guard into a pass, and
// never let a caller switch it off. These tests are the regression fence for
// "no silent unsupported filesystem fallback".
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
  // `undefined` is deliberately NOT in this list: it is the no-argument case and
  // hits the default parameter, so asserting it would test whatever platform the
  // runner happens to be on (it reported durable=true on Linux CI). The default
  // is asserted explicitly below instead, platform-relative.
  for (const bogus of [null, 'WIN32', 'win32 ', 'windows', 'Linux', 0, {}, '']) {
    const cap = lifecycleDurabilityCapability(bogus);
    assert.equal(cap.supported, false,
      `platform ${JSON.stringify(bogus)} must not be reported as durable`);
    assert.equal(cap.requiresNativeProof, true,
      `platform ${JSON.stringify(bogus)} must demand native proof`);
  }
  // Omitting the argument must report the ACTUAL platform, and no more.
  const real = lifecycleDurabilityCapability();
  assert.deepEqual(real, lifecycleDurabilityCapability(process.platform),
    'the default platform must be process.platform, not a constant');
  assert.equal(real.supported, process.platform === 'linux',
    `default capability must follow the real platform (${process.platform})`);
});

test('DUR-03 — durability capability is a frozen value object', () => {
  const cap = lifecycleDurabilityCapability('win32');
  assert.equal(Object.isFrozen(cap), true);
  assert.throws(() => { cap.supported = true; }, TypeError);
});

test('DUR-03b — a platform with no reviewed provider is unproven, NOT Windows-labelled', () => {
  // The allow-list exists because the old code treated everything except win32
  // as durable. Unreviewed platforms must be refused under their OWN reason, so
  // a darwin/CI runner is never reported as a Windows-specific finding.
  for (const platform of ['darwin', 'freebsd', 'sunos', 'cygwin']) {
    const cap = lifecycleDurabilityCapability(platform);
    assert.equal(cap.supported, false, `${platform} has no reviewed provider`);
    assert.equal(cap.reason, 'NAMESPACE_DURABILITY_PROVIDER_UNREVIEWED',
      `${platform} must not inherit the win32 reason`);
    assert.equal(cap.requiresNativeProof, true);
  }
  // The win32 reason stays exact, so DUR-01's attribution has a source.
  assert.equal(lifecycleDurabilityCapability('win32').reason,
    'WINDOWS_NAMESPACE_DURABILITY_UNPROVEN');
});

test('DUR-11 — a platform refusal reason has exactly one source, never a literal at a guard site', () => {
  // Why this test exists: DUR-08 cannot detect a re-hardcoded Windows reason on
  // win32, because on win32 the hardcoded string and the capability's own reason
  // are the same value — the defect is only observable on another platform, which
  // this host is not. So the invariant is enforced structurally instead.
  // Refusal reasons come from the capability object; guard sites pass tokens that
  // name a FILESYSTEM failure mode, which are a disjoint vocabulary.
  const src = readFileSync(path.join(import.meta.dirname, '..', 'lib', 'file-durability.mjs'), 'utf8');

  // Observed, not hardcoded: every reason the capability function can emit.
  const capabilityReasons = new Set(
    ['win32', 'darwin', 'linux', 'freebsd'].map((p) => lifecycleDurabilityCapability(p).reason));

  const literalReasonsAtBlockSites = [...src.matchAll(/\bblock\(\s*['"]([A-Z0-9_]+)['"]/g)]
    .map((m) => m[1]);
  assert.ok(literalReasonsAtBlockSites.length > 0,
    'detector found no block() literals at all — the scan is vacuous');

  const offenders = literalReasonsAtBlockSites.filter((r) => capabilityReasons.has(r));
  assert.deepEqual(offenders, [],
    `guard sites hardcode a platform capability reason: ${offenders.join(', ')}`);

  // The capability reason must reach the refusal through exactly one expression.
  const reasonSourcedCalls = [...src.matchAll(/\bblock\(\s*capability\.reason\s*\)/g)].length;
  assert.equal(reasonSourcedCalls, 1,
    'exactly one site may refuse on capability.reason; duplicates let two guards drift');

  // Positive control: the reviewed defect, expressed in synthetic source.
  const MUTATED = "function syncContainingDirectory(){ const c=cap(); if(!c.supported){ block('WINDOWS_NAMESPACE_DURABILITY_UNPROVEN'); } }\n";
  const detect = (text) => [...text.matchAll(/\bblock\(\s*['"]([A-Z0-9_]+)['"]/g)]
    .map((m) => m[1]).some((r) => capabilityReasons.has(r));
  assert.equal(detect(MUTATED), true, 'detector cannot see a re-hardcoded reason');
  // Negative controls: failure-mode tokens are legitimate at guard sites.
  assert.equal(detect("block('PARENT_UNSAFE'); block('DIRECTORY_SYNC_UNSUPPORTED');"), false);
});
