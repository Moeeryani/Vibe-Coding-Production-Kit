// Phase F item 6: operation completion is NOT durability proof.
// Written against the real receipt contract in
// lib/windows-fs-provider-candidate.mjs:
//   - checkReceipt() REJECTS any receipt claiming
//     directoryDurabilityProven / managedMutationAuthorized / powerLossAttested
//     true (lines 59-61) — the protocol cannot express durability, by design.
//   - interpretWindowsScratchResult() maps "completed but directory flush
//     returned false" (native exit 7) to E_DIRECTORY_SYNC_UNPROVEN (lines 112-117),
//     i.e. a SUCCESSFUL completion is still refused.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { lifecycleDurabilityCapability, syncContainingDirectory } from '../lib/file-durability.mjs';
import { windowsNativeCandidateStatus, interpretWindowsScratchResult } from
  '../lib/windows-fs-provider-candidate.mjs';

const baseReceipt = (over = {}) => ({
  kind: 'VCP_WINDOWS_SCRATCH_NAMESPACE_CANDIDATE', protocolVersion: 3,
  operation: 'rename-no-replace', completed: true,
  fileFlushReturned: false, directoryFlushReturned: true,
  mayHaveMutated: true, lastWin32Error: 0,
  managedMutationAuthorized: false, directoryDurabilityProven: false,
  powerLossAttested: false, ...over,
});

test('DUR-04 — a COMPLETED native operation with unflushed parent is refused', () => {
  // exit 7 + completed:true + directoryFlushReturned:false is the documented
  // "operation succeeded, durability unproven" state.
  const run = { status: 7, stdout: JSON.stringify(baseReceipt({
    directoryFlushReturned: false,
  })) };
  assert.throws(
    () => interpretWindowsScratchResult('rename-no-replace', run),
    (e) => e.code === 'E_DIRECTORY_SYNC_UNPROVEN',
    'completion must never be promoted into durability',
  );
});

test('DUR-05 — the receipt protocol cannot even EXPRESS a durability claim', () => {
  // A helper that tried to report durability must be rejected as protocol-violating.
  const run = { status: 0, stdout: JSON.stringify(baseReceipt({
    directoryDurabilityProven: true,
  })) };
  assert.throws(
    () => interpretWindowsScratchResult('rename-no-replace', run),
    (e) => e.code === 'E_WINDOWS_SCRATCH_HELPER_PROTOCOL',
    'a receipt claiming durability must not be accepted',
  );
  for (const field of ['managedMutationAuthorized', 'powerLossAttested']) {
    const r = { status: 0, stdout: JSON.stringify(baseReceipt({ [field]: true })) };
    assert.throws(
      () => interpretWindowsScratchResult('rename-no-replace', r),
      (e) => e.code === 'E_WINDOWS_SCRATCH_HELPER_PROTOCOL',
      `${field}:true must be refused`);
  }
});

test('DUR-06 — a well-formed completed receipt still reports durability unproven', () => {
  const run = { status: 0, stdout: JSON.stringify(baseReceipt()) };
  const v = interpretWindowsScratchResult('rename-no-replace', run);
  assert.equal(v.completed, true, 'the operation itself did complete');
  assert.equal(v.directoryDurabilityProven, false, 'and that is NOT durability');
  assert.equal(v.managedMutationAuthorized, false);
});

test('DUR-07 — the candidate provider cannot mark Windows durable', () => {
  const s = windowsNativeCandidateStatus();
  assert.equal(s.directoryDurabilityProven, false);
  assert.equal(s.mutationAuthorized, false);
  assert.equal(s.productionBackendConnected, false);
  assert.equal(lifecycleDurabilityCapability('win32').supported, false,
    'the capability stays refused regardless of any candidate status');
});

test('DUR-08 — win32 refusal is a capability statement, not a syscall outcome', async (t) => {
  // win32-only claim, so it is SKIPPED (never passed) elsewhere. The old version
  // asserted only the error CODE - a code seven failure modes share - and pointed
  // at a nonexistent directory, so on Linux it passed via ENOENT while claiming to
  // prove a Windows capability guard. It now asserts the guard's own `reason` and
  // requires that no filesystem attempt was made at all.
  if (process.platform !== 'win32') {
    t.skip('WINDOWS_ONLY — this asserts the win32 capability guard');
    return;
  }
  const cap = lifecycleDurabilityCapability();
  assert.equal(cap.supported, false, 'precondition: win32 must be unsupported here');
  // The parent exists and is fsyncable on a supported platform; the guard must
  // still refuse, and must refuse BECAUSE OF THE CAPABILITY, not the path.
  const e = await syncContainingDirectory(path.join(process.cwd(), 'probe.txt'))
    .then(() => null, (err) => err);
  assert.ok(e, 'win32 durability must be refused');
  assert.equal(e.code, 'E_DIRECTORY_SYNC_UNPROVEN');
  assert.equal(e.reason, cap.reason,
    `refusal must name the capability guard, got ${e.reason}`);
  assert.equal(e.cause, undefined,
    'no syscall was attempted, so there must be no underlying filesystem error');
});

test('DUR-08b — capability refusals are distinguishable from syscall failures', async () => {
  // The falsifiability control for DUR-08, and it must run EVERYWHERE: a missing
  // parent is reported as a filesystem failure where durability is supported, and
  // as a capability refusal where it is not. A guard that reused one reason for
  // every failure mode cannot satisfy both branches.
  const cap = lifecycleDurabilityCapability();
  const ghost = path.join(process.cwd(), 'vcp-no-such-dir-xyz', 'child.txt');
  const e = await syncContainingDirectory(ghost).then(() => null, (err) => err);
  assert.ok(e, 'a missing parent must never report success');
  assert.equal(e.code, 'E_DIRECTORY_SYNC_UNPROVEN');
  if (cap.supported) {
    assert.equal(e.reason, 'PARENT_MISSING_OR_UNREADABLE',
      'on a supported platform the reason must be the syscall, not a platform claim');
    assert.ok(e.cause, 'the underlying ENOENT must be preserved as cause');
  } else {
    assert.equal(e.reason, cap.reason);
    assert.equal(e.cause, undefined);
  }
});

test('DUR-09 — contract: all operations green but no power-loss replay = NO_GO', async () => {
  const { assessWindowsDurabilityEvidence } = await import('../lib/windows-durability-contract.mjs');
  const phases = ['create','file-flush','rename-write-through','directory-sync',
    'owned-unlink','owned-rmdir','no-replace-collision','journal-replay','lock-release'];
  const v = assessWindowsDurabilityEvidence({
    platform: 'win32', filesystem: 'NTFS', nativeWindows: true, disposableFixture: true,
    publishedImplementationHashVerified: true,
    fileFlushReturned: true, moveWriteThroughReturned: true, parentMetadataPersisted: true,
    realPowerInterruptionReplayed: false,
    userBytesUntouched: true, foreignBytesUntouched: true,
    scenarios: Object.fromEntries(phases.map((k) => [k, true])),
  });
  assert.equal(v.status, 'NO_GO');
  assert.ok(v.defects.includes('E_REAL_POWER_LOSS_UNVERIFIED'), `defects: ${v.defects}`);
  assert.equal(v.mutationAuthorized, false);
});

test('DUR-10 — contract ceiling: a fully satisfied review is CANDIDATE, never authorization', async () => {
  const { assessWindowsDurabilityEvidence } = await import('../lib/windows-durability-contract.mjs');
  const phases = ['create','file-flush','rename-write-through','directory-sync',
    'owned-unlink','owned-rmdir','no-replace-collision','journal-replay','lock-release'];
  const v = assessWindowsDurabilityEvidence({
    platform: 'win32', filesystem: 'NTFS', nativeWindows: true, disposableFixture: true,
    publishedImplementationHashVerified: true,
    fileFlushReturned: true, moveWriteThroughReturned: true, parentMetadataPersisted: true,
    realPowerInterruptionReplayed: true,
    userBytesUntouched: true, foreignBytesUntouched: true,
    scenarios: Object.fromEntries(phases.map((k) => [k, true])),
  });
  assert.equal(v.status, 'NATIVE_PROVIDER_REVIEW_CANDIDATE');
  assert.equal(v.mutationAuthorized, false, 'the contract must never self-authorize');
  assert.equal(v.directoryDurabilityProven, false);
  assert.equal(v.nativeIndependentAcceptanceRequired, true);
});
