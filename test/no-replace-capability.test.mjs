// Phase 5 regression tests for the reparse-point capability report.
// These assert only what is measurable on the current host: the report must
// never describe an application-level lstat pre-check as atomic open-time
// protection, and it must name the exact residual gap.
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile, symlink, lstat, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  noFollowCapability, isNoFollowAtomic, unsafeNoFollowOpenSites,
} from '../lib/no-replace-capability.mjs';
import { verifyNamespaceContained } from '../lib/writer-identity.mjs';

const IS_WINDOWS = process.platform === 'win32';
const linkKind = IS_WINDOWS ? 'junction' : 'dir';
const HAS_O_NOFOLLOW = constants.O_NOFOLLOW !== undefined;
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

// The honesty invariant, factored out so NRC-07 can prove it rejects a
// forged report. NRC-01 pins the real one.
function assertCapabilityHonest(c) {
  assert.equal(typeof c.flagAvailable, 'boolean');
  assert.equal(typeof c.atomicAtOpenTime, 'boolean');
  assert.equal(typeof c.preCheckOnly, 'boolean');
  // FINDING-002: the boolean alone is ambiguous on POSIX, where the kernel
  // applies O_NOFOLLOW to the FINAL component only. The scope must be
  // explicit and must never be wider than the mechanism.
  assert.equal(typeof c.atomicScope, 'string');
  assert.ok(['none', 'final-component'].includes(c.atomicScope),
    `unknown atomicScope: ${c.atomicScope}`);
  assert.equal(typeof c.intermediateComponentsAtomic, 'boolean');
  assert.equal(c.intermediateComponentsAtomic, false,
    'no current platform refuses an intermediate symlink at open time');
  assert.equal(c.atomicAtOpenTime, c.atomicScope === 'final-component',
    'atomicAtOpenTime and atomicScope must agree');
  if (c.atomicScope === 'final-component')
    assert.match(c.residualRisk, /FINAL COMPONENT ONLY|intermediate/i,
      'a final-component-only guarantee must name the intermediate gap');
}

test('NRC-01 — capability report never claims atomic protection it lacks', async () => {
  const c = noFollowCapability();
  assertCapabilityHonest(c);
  if (IS_WINDOWS) {
    assert.equal(c.flagAvailable, false,
      'node:fs does not define O_NOFOLLOW on win32');
    assert.equal(c.atomicAtOpenTime, false,
      'claiming atomic open-time reparse refusal on Windows would be a false guarantee');
    assert.equal(c.atomicScope, 'none');
    assert.equal(c.preCheckOnly, true);
    assert.match(c.nativeRequirement, /FILE_FLAG_OPEN_REPARSE_POINT|native/);
  }
});

test('NRC-07 — MUTATION: a report claiming intermediate atomicity is rejected', () => {
  // A gate that cannot fail is not a gate. If the capability ever claims that
  // intermediate components are pinned at open time — or widens atomicScope
  // beyond the kernel's final-component behaviour — the invariant NRC-01
  // relies on must reject the forged report.
  const real = noFollowCapability();
  const forgedScope = Object.freeze({ ...real, intermediateComponentsAtomic: true });
  assert.throws(() => assertCapabilityHonest(forgedScope),
    /intermediate symlink at open time/,
    'a report claiming intermediate atomicity must be rejected');
  const widened = Object.freeze({
    ...real, atomicScope: 'all-components', atomicAtOpenTime: true,
    residualRisk: null,
  });
  assert.throws(() => assertCapabilityHonest(widened),
    /unknown atomicScope/,
    'a report with an undefined scope must be rejected');
});

test('NRC-02 — a `constants.O_NOFOLLOW ?? 0` site is a silent no-op where the flag is undefined', () => {
  // The whole point of this finding: the source *reads* like a guard.
  assert.equal(isNoFollowAtomic(), noFollowCapability().atomicAtOpenTime);
  const sites = unsafeNoFollowOpenSites();
  assert.ok(Array.isArray(sites));
  if (IS_WINDOWS) {
    assert.ok(sites.length > 0,
      'lib/ must report at least one `?? 0` open site on Windows');
    // Phase N (SEC-FINDING-002 remediation): writer-atomic.mjs no longer
    // contains a path-based open site — it routes through the secure
    // provider boundary and fails closed on Windows. The inventory must
    // still surface the remaining class-wide sites (e.g. safe-replace).
    assert.ok(!sites.some((s) => s.includes('writer-atomic.mjs')),
      'Phase N: the production writer atomic path must NOT appear in the inventory');
    assert.ok(sites.some((s) => s.includes('safe-replace.mjs')),
      'remaining path-based sites must still appear in the inventory');
  }
});

test('NRC-03 — lstat DOES expose a reparse point on Windows (pre-check is real)', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-nrc-'));
  try {
    const real = path.join(dir, 'real');
    const holder = path.join(dir, 'holder');
    await mkdir(real); await mkdir(holder);
    await writeFile(path.join(real, 'secret.txt'), 'SECRET-VIA-TARGET');
    try {
      await symlink(real, path.join(holder, 'link'), linkKind);
    } catch (e) {
      t.skip(`reparse creation unavailable (${e.code}) — cannot measure here`);
      return;
    }
    const st = await lstat(path.join(holder, 'link'));
    assert.equal(st.isSymbolicLink(), true,
      'lstat must report the reparse point; if it stops doing so, the app-level pre-check is void');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// FINDING-002 (2026-10-23): the old NRC-04 asserted "O_NOFOLLOW must refuse
// symlink traversal" about `holder/link/secret.txt`, where `link` is an
// INTERMEDIATE component. Linux applies O_NOFOLLOW to the FINAL component
// only, so the open succeeded and the suite failed on Linux. The proof is now
// split into three independent cases, each asserting the mechanism it
// actually exercises. None of them claims traversal prevention that the
// kernel does not provide.
test('NRC-04a — O_NOFOLLOW does not stop an INTERMEDIATE symlink (Linux follows it)', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-nrc-'));
  try {
    const real = path.join(dir, 'real');
    const holder = path.join(dir, 'holder');
    await mkdir(real); await mkdir(holder);
    await writeFile(path.join(real, 'secret.txt'), 'SECRET-VIA-TARGET');
    try {
      await symlink(real, path.join(holder, 'link'), linkKind);
    } catch (e) {
      t.skip(`reparse creation unavailable (${e.code})`);
      return;
    }
    const cap = noFollowCapability();
    assert.equal(cap.intermediateComponentsAtomic, false,
      'the report must not claim intermediate components are pinned at open time');
    // `link` is intermediate, `secret.txt` is the final component. On POSIX
    // the flag is defined and still does NOT refuse this open.
    const flags = HAS_O_NOFOLLOW ? (constants.O_RDONLY | NOFOLLOW) : 'r';
    const fh = await open(path.join(holder, 'link', 'secret.txt'), flags);
    let body;
    try { body = await fh.readFile(); } finally { await fh.close(); }
    assert.equal(body.toString(), 'SECRET-VIA-TARGET',
      HAS_O_NOFOLLOW
        ? 'O_NOFOLLOW unexpectedly refused an intermediate symlink; the kernel semantics this test pins have changed'
        : 'a plain open() through a junction must traverse');
    if (HAS_O_NOFOLLOW) {
      assert.equal(cap.atomicScope, 'final-component');
      assert.equal(cap.atomicAtOpenTime, true,
        'the report must describe the final-component-only guarantee it has');
    } else {
      assert.equal(cap.atomicScope, 'none');
      assert.equal(cap.atomicAtOpenTime, false);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('NRC-04b — O_NOFOLLOW refuses a FINAL-component symlink with ELOOP', async (t) => {
  if (!HAS_O_NOFOLLOW) {
    // A real platform skip, asserted before any behaviour is claimed: win32
    // does not define the flag, so the final-component refusal cannot be
    // exercised. The Windows facts are pinned by NRC-01/NRC-04a instead.
    assert.equal(noFollowCapability().flagAvailable, false);
    t.skip('O_NOFOLLOW is undefined on win32; ELOOP refusal is not expressible');
    return;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-nrc-'));
  try {
    const real = path.join(dir, 'real');
    const holder = path.join(dir, 'holder');
    await mkdir(real); await mkdir(holder);
    const secret = path.join(real, 'secret.txt');
    await writeFile(secret, 'SECRET-VIA-TARGET');
    try {
      await symlink(secret, path.join(holder, 'filelink'), 'file');
    } catch (e) {
      t.skip(`reparse creation unavailable (${e.code})`);
      return;
    }
    await assert.rejects(
      open(path.join(holder, 'filelink'), constants.O_RDONLY | NOFOLLOW),
      (e) => {
        assert.equal(e.code, 'ELOOP',
          `the kernel must report ELOOP, got ${e.code}: ${e.message}`);
        return true;
      },
      'O_NOFOLLOW must refuse a symlink in the FINAL component');
    const cap = noFollowCapability();
    assert.equal(cap.atomicAtOpenTime, true);
    assert.equal(cap.atomicScope, 'final-component');
    assert.equal(cap.intermediateComponentsAtomic, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('NRC-04c — without O_NOFOLLOW, intermediate and final symlinks are both followed', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-nrc-'));
  try {
    const real = path.join(dir, 'real');
    const holder = path.join(dir, 'holder');
    await mkdir(real); await mkdir(holder);
    const secret = path.join(real, 'secret.txt');
    await writeFile(secret, 'SECRET-VIA-TARGET');
    try {
      await symlink(real, path.join(holder, 'link'), linkKind);
      // A file symlink needs elevation on Windows; the junction case already
      // proves the no-flag traversal there.
      if (!IS_WINDOWS) await symlink(secret, path.join(holder, 'filelink'), 'file');
    } catch (e) {
      t.skip(`reparse creation unavailable (${e.code})`);
      return;
    }
    const viaIntermediate = await open(path.join(holder, 'link', 'secret.txt'), constants.O_RDONLY);
    let body;
    try { body = await viaIntermediate.readFile(); } finally { await viaIntermediate.close(); }
    assert.equal(body.toString(), 'SECRET-VIA-TARGET',
      'plain open() follows an intermediate symlink');
    if (!IS_WINDOWS) {
      const viaFinal = await open(path.join(holder, 'filelink'), constants.O_RDONLY);
      let body2;
      try { body2 = await viaFinal.readFile(); } finally { await viaFinal.close(); }
      assert.equal(body2.toString(), 'SECRET-VIA-TARGET',
        'plain open() follows a final-component symlink');
    }
    const cap = noFollowCapability();
    assert.equal(cap.intermediateComponentsAtomic, false);
    assert.equal(cap.atomicScope, HAS_O_NOFOLLOW ? 'final-component' : 'none');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('NRC-05 — application-level containment still refuses the reparse path', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-nrc-'));
  try {
    const real = path.join(dir, 'real');
    await mkdir(real);
    const link = path.join(dir, 'link');
    try {
      await symlink(real, link, linkKind);
    } catch (e) {
      t.skip(`reparse creation unavailable (${e.code})`);
      return;
    }
    await assert.rejects(
      verifyNamespaceContained(dir, path.join(dir, 'link', 'x')),
      /E_WRITER_NAMESPACE_UNSAFE/,
      'the lstat pre-check must reject a reparse component');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// The race itself is not demonstrated (that needs a second process winning a
// sub-millisecond window). What is demonstrated, deterministically, is the
// ordering gap the race exploits: the pre-check passes on a plain directory,
// the path is then swapped for a reparse point, and open() still follows the
// INTERMEDIATE component even with O_NOFOLLOW set, because the kernel applies
// the flag to the FINAL component only. The capability report declares that
// gap instead of hiding it.
test('NRC-06 — a reparse swapped in AFTER the pre-check defeats the pre-check', async (t) => {
  // FINDING-002: this scenario is about an INTERMEDIATE component, so the old
  // skip on `atomicAtOpenTime` was wrong: POSIX pins only the last component.
  // The skip condition is now the narrow, measured one. Any platform that
  // genuinely pinned every component at open time would skip; none does.
  const cap = noFollowCapability();
  assert.equal(cap.intermediateComponentsAtomic, false,
    'the scenario requires intermediate components to be non-atomic; the capability says otherwise');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-nrc-'));
  try {
    const plain = path.join(dir, 'plain');
    const elsewhere = path.join(dir, 'elsewhere');
    await mkdir(plain); await mkdir(elsewhere);
    await writeFile(path.join(elsewhere, 'victim.txt'), 'OUTSIDE-ROOT');
    // Pre-check on the plain directory succeeds.
    const okPath = await verifyNamespaceContained(dir, path.join(plain, 'victim.txt'));
    assert.ok(okPath);
    // Attacker replaces it with a reparse point before the open happens.
    try {
      await rm(plain, { recursive: true, force: true });
      await symlink(elsewhere, plain, linkKind);
    } catch (e) {
      t.skip(`reparse creation unavailable (${e.code})`);
      return;
    }
    const st = await lstat(plain);
    assert.ok(st.isSymbolicLink(),
      'a swap this test depends on did not take effect on this host');
    // The pre-check cannot see the swap. The subsequent open may use the same
    // flag production uses; it still traverses the intermediate component.
    const fh = await open(path.join(plain, 'victim.txt'), constants.O_RDONLY | NOFOLLOW);
    let body;
    try { body = await fh.readFile(); } finally { await fh.close(); }
    assert.equal(body.toString(), 'OUTSIDE-ROOT',
      'the swapped intermediate component must still be traversable here; '
      + 'if this failed, the platform gained per-component protection and this test should be re-derived');
    // The report must describe the residual gap, not a broader guarantee.
    assert.equal(cap.atomicScope, HAS_O_NOFOLLOW ? 'final-component' : 'none');
    assert.match(cap.residualRisk, /intermediate/i,
      'the capability report must name the intermediate-component gap');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
