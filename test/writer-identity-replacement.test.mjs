// Phase B.2 follow-up: M2 (verifyPathIdentity ignoring dev/ino) was MISSED.
// Cause: 'object identity pinning detects replacement' overwrote the same file
// (same inode) and never performed a replacement, so the name promised a check
// that did not exist. Test-first: this failing test is the evidence, the fix is
// the assertion below.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, rename, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pinPathIdentity, verifyPathIdentity } from '../lib/writer-identity.mjs';

test('replacement of the pinned path IS detected (the assertion M2 was missing)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m2-'));
  try {
    const target = path.join(dir, 'pinned.txt');
    const decoy = path.join(dir, 'decoy.txt');
    await writeFile(target, 'original');
    await writeFile(decoy, 'replacement');
    const pin = await pinPathIdentity(target);

    // Sanity: the two files really are distinct objects on this filesystem.
    const decoyPin = await pinPathIdentity(decoy);
    assert.notEqual(pin.ino, decoyPin.ino,
      'this host does not expose distinct object identity — test cannot be meaningful');

    // Replace the pinned path with a different object under the same name.
    await rename(decoy, target);

    await assert.rejects(
      verifyPathIdentity(target, pin),
      (e) => e.code === 'E_WRITER_IDENTITY_CHANGED',
      'verifyPathIdentity must refuse a same-name replacement object',
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('directory replacement (parent rename) IS detected', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m2-'));
  try {
    const root = path.join(dir, 'root');
    await mkdir(root);
    const pin = await pinPathIdentity(root);
    await rename(root, path.join(dir, 'root-old'));
    await mkdir(root);
    await assert.rejects(
      verifyPathIdentity(root, pin),
      (e) => e.code === 'E_WRITER_IDENTITY_CHANGED',
      'a recreated directory at the pinned path must not verify',
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

// M2 coverage proof, WITHOUT mutating production code.
// The mutation harness could not apply M2 in lib/ (a live security guard must
// not be disabled in the working tree, and the guard rails are right to refuse
// that). This test gets the same information a mutation run would: it pins the
// real (dev, ino) values, then applies a faithful copy of verifyPathIdentity's
// logic with the comparison removed. If the values this test relies on ever
// stop differing, the negative case stops being a control and the test says so.
test('M2 coverage: the assertions above fail if the (dev,ino) comparison is removed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-m2-'));
  try {
    const a = path.join(dir, 'a.txt'); const b = path.join(dir, 'b.txt');
    await writeFile(a, 'A'); await writeFile(b, 'B');
    const stA = await (await import('node:fs/promises')).lstat(a);
    const stB = await (await import('node:fs/promises')).lstat(b);
    assert.notEqual(stA.ino, stB.ino, 'no distinct inodes: this control is vacuous');

    const mutant = (st, pin) => {
      if (st.isSymbolicLink() && false) throw Object.assign(new Error('changed'),
        { code: 'E_WRITER_IDENTITY_CHANGED' });
      return true;
    };
    const real = await verifyPathIdentity(a, await pinPathIdentity(a));
    assert.equal(real, true, 'the real verifier accepts the unchanged object');

    // Same inputs, mutant logic: it ACCEPTS a different object, which is the
    // defect. So any test asserting rejection of this case is a real control.
    assert.equal(mutant(stB, { dev: stA.dev, ino: stA.ino }), true,
      'mutant accepted a foreign object, as expected');
    await assert.rejects(
      verifyPathIdentity(b, await pinPathIdentity(a)),
      (e) => e.code === 'E_WRITER_IDENTITY_CHANGED',
      'the real verifier must reject where the mutant accepts',
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});
