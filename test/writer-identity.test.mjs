// B-1 Phase 6: identity layer security tests.
//
// REPAIRED (Windows campaign 2026-10-16). These tests hard-coded POSIX
// assumptions (kind === 'posix', numeric uid, symlink creation), so on Windows
// they failed as apparent product defects while proving nothing about Windows.
// Platform-specific cases now declare their platform, and the Windows principal
// gap is asserted explicitly as a fail-closed requirement rather than left
// implicit. No guard was weakened.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, lstat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  currentPrincipal,verifyPrincipal,pinPathIdentity,verifyPathIdentity,
  verifyNamespaceContained,verifyWriterBoundary,principalProofStatus
} from '../lib/writer-identity.mjs';

const IS_WINDOWS = process.platform === 'win32';
const IS_POSIX = !IS_WINDOWS && typeof process.getuid === 'function';

// --- POSIX-specific identity semantics -------------------------------------
test('valid writer: current principal verifies against itself',
  { skip: IS_WINDOWS ? 'posix uid semantics do not exist on win32' : false },
  () => {
    const p = currentPrincipal();
    assert.equal(p.kind, 'posix');
    assert.ok(Number.isInteger(p.uid));
    const back = verifyPrincipal(p);
    assert.equal(back.uid, p.uid);
  });

test('wrong principal rejected',
  { skip: IS_WINDOWS ? 'constructs a fake posix uid; win32 has no uid' : false },
  () => {
    const p = currentPrincipal();
    const wrong = { ...p, uid: p.uid + 999999 };
    assert.throws(() => verifyPrincipal(wrong, p), /E_WRITER_PRINCIPAL_MISMATCH/);
  });

// --- Windows principal: fail-closed is the contract -------------------------
test('unproven Windows identity fails closed', () => {
  const win = { kind: 'windows', sid: null, proven: false };
  assert.throws(() => verifyPrincipal(win, win), /E_WRITER_PRINCIPAL_UNPROVEN/);
});

test('WIN-01 — currentPrincipal on win32 never claims proof without a native provider', () => {
  const p = currentPrincipal();
  if (!IS_WINDOWS) return;
  assert.equal(p.kind, 'windows');
  assert.equal(p.proven, false,
    'proven:true without a native token provider would be a forged principal');
  assert.equal(p.sid, null, 'no SID may be reported without native proof');
  // The reason must distinguish "provider exists but failed" from "no provider
  // exists at all" — otherwise an unimplemented seam looks like a runtime error.
  assert.equal(p.reason, 'NO_NATIVE_PROVIDER_CONFIGURED');
});

// WIN-02 is a WINDOWS-ONLY claim, and the skip that says so is derived from a
// MEASURED host fact — the kind of the host's current principal — not from a
// hardcoded platform string.
//
// The claim: a CALLER-SUPPLIED windows principal must not satisfy
// verification. That comparison needs a windows principal on THIS host: the
// scenario is about a platform whose real principal is UNPROVEN, so a
// fabricated "proven" windows principal must be refused as unproven. On a
// POSIX host the current principal is posix, the kind check fires first, and
// the correct refusal is E_WRITER_PRINCIPAL_MISMATCH — the windows branch of
// verifyPrincipal is never reached, so the scenario cannot be expressed.
//
// The underlying property is not left untested on POSIX: "wrong principal
// rejected" above already proves that a fabricated posix uid is refused, and
// WIN-03 proves the kind-change refusal.
//
// The TAP classifier is NOT touched: a skip is a TAP directive on the test's
// own `ok` line, which the matrix parser already reads. Nothing here
// downgrades a real failure.
function hostPrincipalKind() {
  try { return currentPrincipal().kind; } catch { return 'unknown'; }
}
const HOST_PRINCIPAL_KIND = hostPrincipalKind();
const WIN02_APPLICABLE = HOST_PRINCIPAL_KIND === 'windows';
const WIN02_SKIP = WIN02_APPLICABLE ? false
  : `no windows principal exists on this host (currentPrincipal().kind=` +
    `${HOST_PRINCIPAL_KIND}); the windows-principal refusal cannot be exercised here`;

test('WIN-02 — a pinned windows principal cannot be self-certified by the caller',
  { skip: WIN02_SKIP }, () => {
  // Mirrors the removed `authorize` injection parameter (production-writer.mjs:66-69):
  // a caller-supplied "proven" principal must never satisfy verification.
  // One named code, not an alternation: on this host the process principal is
  // unproven, so the refusal MUST be E_WRITER_PRINCIPAL_UNPROVEN.
  const forged = { kind: 'windows', sid: 'S-1-5-21-0-0-0-1000', proven: true };
  const actual = currentPrincipal();
  assert.throws(
    () => verifyPrincipal(forged, actual),
    (e) => e.code === 'E_WRITER_PRINCIPAL_UNPROVEN',
    'a fabricated proven:true principal must be refused as unproven, not as a mismatch');
});

test('WIN-02-PROOF — the WIN-02 skip follows a measured host fact, not a guess', () => {
  // The skip is only honest if it is bound to something this host can be
  // asked about. It is: the kind of the current principal.
  assert.equal(WIN02_APPLICABLE, HOST_PRINCIPAL_KIND === 'windows',
    'the applicability flag must follow the measured principal kind');
  assert.equal(WIN02_APPLICABLE, !WIN02_SKIP,
    'an applicable case must not be skipped, and an inapplicable one must be');
  if (WIN02_APPLICABLE) return;
  // On this host the scenario is inexpressible, and the refusal that DOES
  // happen is the correct one: the kind check fires before the windows
  // branch, so a fabricated windows principal is refused as a kind change.
  const actual = currentPrincipal();
  assert.throws(
    () => verifyPrincipal({ kind: 'windows', sid: 'S-1-5-21-0-0-0-1000', proven: true }, actual),
    (e) => e.code === 'E_WRITER_PRINCIPAL_MISMATCH',
    'on a non-windows host the kind mismatch is the correct refusal');
});

test('WIN-03 — principal kind change is refused (PRINCIPAL layer)', () => {
  // Given two DIFFERENT kinds, the kind check must fire first. Passing an
  // actual windows principal of the same kind would test nothing about kinds,
  // so the expected code is asserted exactly.
  const posixActual = { kind: 'posix', uid: 1000, gid: 100, proven: true };
  assert.throws(
    () => verifyPrincipal({ kind: 'windows', sid: 'S-1-5-21-x', proven: true }, posixActual),
    (e) => e.code === 'E_WRITER_PRINCIPAL_MISMATCH',
    'kind change must be reported as a mismatch');
  // And the reverse direction, still exactly one code.
  assert.throws(
    () => verifyPrincipal(posixActual, { kind: 'windows', sid: 'S-1-5-21-x', proven: true }),
    (e) => e.code === 'E_WRITER_PRINCIPAL_MISMATCH');
});

test('WIN-04 — principalProofStatus reports the seam, not a guess', () => {
  const s = principalProofStatus();
  assert.equal(typeof s.providerPresent, 'boolean');
  assert.equal(s.securePathAuthorized, false,
    'the production writer mutation path must never be authorized by this status');
  if (IS_WINDOWS) {
    assert.equal(s.providerPresent, false,
      'no native principal provider is wired yet; claiming otherwise would be a false proof');
    assert.match(s.reason, /NO_NATIVE_PROVIDER_CONFIGURED/);
  }
});

// --- boundary contract ------------------------------------------------------
test('writer boundary requires a named operation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-wid-'));
  try {
    await assert.rejects(verifyWriterBoundary({ root: dir }), /E_WRITER_BOUNDARY/);
    const ok = await verifyWriterBoundary({ root: dir, operation: 'test-op' });
    assert.equal(ok.operation, 'test-op');
    // Previously asserted `ok.principal.proven`, which is false on Windows and
    // made a real contract mismatch look like a platform defect. verifyWriterBoundary
    // resolves namespace containment and snapshots the principal; proof of the
    // principal is verified later, at step 4 of the transaction.
    assert.ok(Object.prototype.hasOwnProperty.call(ok.principal, 'proven'),
      'boundary must report the principal proof state');
    if (IS_POSIX) assert.equal(ok.principal.proven, true);
    if (IS_WINDOWS) assert.equal(ok.principal.proven, false);
    assert.equal(ok.principalVerified, false,
      'the boundary itself must not claim principal verification');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// --- object identity --------------------------------------------------------
test('object identity pinning detects replacement', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-wid-'));
  try {
    const f = path.join(dir, 'file.txt');
    await writeFile(f, 'v1');
    const pin = await pinPathIdentity(f);
    assert.ok(await verifyPathIdentity(f, pin));
    await writeFile(f, 'v2'); // same inode: still valid
    assert.ok(await verifyPathIdentity(f, pin));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('identity is non-vacuous on this filesystem', async () => {
  // Guards the whole replacement-detection family: if (dev, ino) were constant,
  // every detection test would pass for the wrong reason.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-wid-'));
  try {
    const a = path.join(dir, 'a'); const b = path.join(dir, 'b');
    await writeFile(a, '1'); await writeFile(b, '1');
    const pa = await pinPathIdentity(a); const pb = await pinPathIdentity(b);
    assert.notEqual(pa.ino, 0, 'ino 0: no object identity exposed');
    assert.notEqual(pa.ino, pb.ino, 'distinct files must have distinct inodes');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// --- namespace containment --------------------------------------------------
test('namespace containment rejects escapes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-wid-'));
  try {
    await assert.rejects(
      verifyNamespaceContained(dir, path.join(dir, '..', 'escape')),
      /E_WRITER_NAMESPACE_ESCAPE/);
    const outside = IS_WINDOWS ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    await assert.rejects(verifyNamespaceContained(dir, outside),
      /E_WRITER_NAMESPACE_ESCAPE/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('namespace rejects symlink components', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-wid-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'vcp-wid-out-'));
  try {
    try {
      await symlink(outside, path.join(dir, 'link'));
    } catch (e) {
      // Windows refuses symlink creation without SeCreateSymbolicLinkPrivilege.
      // That is an absent capability, NOT a passing containment test.
      t.skip(`symlink creation unavailable (${e.code}); reparse-point containment is NOT_PROVEN here`);
      return;
    }
    await assert.rejects(
      verifyNamespaceContained(dir, path.join(dir, 'link', 'x')),
      /E_WRITER_NAMESPACE_UNSAFE/);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
