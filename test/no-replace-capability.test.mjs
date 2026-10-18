// Phase 5 regression tests for the reparse-point capability report.
// These assert only what is measurable on the current host: the report must
// never describe an application-level lstat pre-check as atomic open-time
// protection, and it must name the exact residual gap.
import assert from 'node:assert/strict';
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

test('NRC-01 — capability report never claims atomic protection it lacks', async () => {
  const c = noFollowCapability();
  assert.equal(typeof c.flagAvailable, 'boolean');
  assert.equal(typeof c.atomicAtOpenTime, 'boolean');
  assert.equal(typeof c.preCheckOnly, 'boolean');
  if (IS_WINDOWS) {
    assert.equal(c.flagAvailable, false,
      'node:fs does not define O_NOFOLLOW on win32');
    assert.equal(c.atomicAtOpenTime, false,
      'claiming atomic open-time reparse refusal on Windows would be a false guarantee');
    assert.equal(c.preCheckOnly, true);
    assert.match(c.nativeRequirement, /FILE_FLAG_OPEN_REPARSE_POINT|native/);
  }
});

test('NRC-02 — a `constants.O_NOFOLLOW ?? 0` site is a silent no-op where the flag is undefined', () => {
  // The whole point of this finding: the source *reads* like a guard.
  assert.equal(isNoFollowAtomic(), noFollowCapability().atomicAtOpenTime);
  const sites = unsafeNoFollowOpenSites();
  assert.ok(Array.isArray(sites));
  if (IS_WINDOWS) {
    assert.ok(sites.length > 0,
      'lib/ must report at least one `?? 0` open site on Windows');
    assert.ok(sites.some((s) => s.includes('writer-atomic.mjs')),
      'the production writer atomic path must appear in the inventory');
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

test('NRC-04 — open() follows a reparse point: the gap is at open time, not at stat time', async (t) => {
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
    // What is actually measured, stated per platform. The old POSIX branch asserted
    // "POSIX O_NOFOLLOW must refuse traversal" about a call that never passed
    // O_NOFOLLOW, so it claimed a mechanism it had not exercised — and failed on
    // Linux, where a plain open() follows a symlink exactly as on Windows.
    const tryOpen = async (flags) => {
      try {
        const fh = await open(path.join(holder, 'link', 'secret.txt'), flags);
        await fh.readFile(); await fh.close();
        return true;   // traversed
      } catch { return false; }
    };
    assert.equal(await tryOpen('r'), true,
      'plain open() unexpectedly refused to traverse — the capability report is stale');

    if (IS_WINDOWS) {
      assert.equal(noFollowCapability().atomicAtOpenTime, false,
        'win32 defines no O_NOFOLLOW, so nothing at open time can refuse');
    } else {
      // POSIX can refuse, but only when asked: this is the assertion the previous
      // version believed it was making.
      const { constants } = await import('node:fs');
      assert.ok(constants.O_NOFOLLOW !== undefined,
        'POSIX is expected to define O_NOFOLLOW; otherwise this branch is wrong');
      assert.equal(await tryOpen(constants.O_RDONLY | constants.O_NOFOLLOW), false,
        'O_NOFOLLOW must refuse symlink traversal at open time');
      assert.equal(noFollowCapability().atomicAtOpenTime, true,
        'the report must match the mechanism just demonstrated');
    }
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

// NOT a demonstration of the race firing — that would require a second thread
// or process to win a sub-millisecond window, which this test does not attempt.
// What it establishes is narrower and factual: the pre-check sees the plain
// directory, the pre-check cannot see a swap made afterwards, and the platform
// capability report declares that gap rather than hiding it.
test('NRC-06 — a reparse swapped in AFTER the pre-check is undetectable by the pre-check', async (t) => {
  // The scenario is "the pre-check is the only line of defence". On a platform
  // where open() itself refuses to traverse, that premise does not hold, so the
  // test is skipped — with the reason ASSERTED, not assumed. This is a platform
  // skip in the test, not a classifier change: nothing here can turn a real
  // failure into SKIPPED, because the skip is taken before any assertion runs.
  const cap = noFollowCapability();
  if (cap.atomicAtOpenTime) {
    assert.equal(cap.preCheckOnly, false,
      'skipping because open-time refusal is atomic; the capability says otherwise');
    t.skip(`open-time no-follow is atomic on ${cap.platform}: the pre-check-only `
      + 'scenario cannot be expressed here');
    return;
  }
  assert.equal(cap.preCheckOnly, true,
    'the skipped branch requires a pre-check-only platform; this one is not');
  // Demonstrates the TOCTOU window concretely: pre-check passes on a plain
  // directory, then the same path becomes a reparse point before open.
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
    await rm(plain, { recursive: true, force: true });
    await symlink(elsewhere, plain, linkKind);
    const st = await lstat(plain);
    assert.ok(st.isSymbolicLink(),
      'a swap this test depends on did not take effect on this host');
    // Re-checking at open time is what O_NOFOLLOW makes atomic on POSIX; here
    // it is only a second, racy observation. The capability report must say so.
    assert.equal(noFollowCapability().preCheckOnly, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
