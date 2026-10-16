// C-1 adversarial regression tests: capability minting authority.
// These tests attack the minting path directly. All must prove refusal
// without mutating real repositories.
import assert from 'node:assert/strict';
import { lstat, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as capModule from './helpers/controlled-writer-capability.mjs';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { verifyTestCapability } from './helpers/controlled-writer-capability.mjs';

const {
  mintCapabilityForFixture, revokeCapabilitiesForFixture,
} = capModule;

test('C1-01 — direct minting against a real repository is impossible', async () => {
  const repoRoot = path.resolve(import.meta.dirname, '..');
  const st = await lstat(repoRoot);
  // The raw minter is not exported; the enforced entrypoint refuses non-fixture roots.
  assert.equal(typeof capModule.mintTestCapability, 'undefined');
  await assert.rejects(
    mintCapabilityForFixture({ fixtureRoot: repoRoot, allowedOperations: ['probe'] }),
    /E_CAPABILITY_ROOT/
  );
  // Even with correct dev/ino, the location check refuses.
  assert.ok(st.dev !== undefined, 'sanity: lstat works');
});

test('C1-02 — forged device/inode metadata rejected', async () => {
  // Attacker creates a plausible fixture dir but the minter pins identity
  // from its own lstat, never caller input. There is no caller-input path.
  const dir = path.join(os.tmpdir(), 'vcp-controlled-forged-' + Date.now());
  await mkdir(dir, { recursive: false, mode: 0o700 });
  try {
    // No identity file -> refused regardless of any metadata claims.
    await assert.rejects(
      mintCapabilityForFixture({ fixtureRoot: dir, allowedOperations: ['probe'] }),
      /E_CAPABILITY_ROOT/
    );
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('C1-03 — valid fixture capability accepted for its permitted scope', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe', 'b4-concurrency'] });
  try {
    await verifyTestCapability(f.capability, { root: f.root, operation: 'probe' });
    await verifyTestCapability(f.capability, { root: f.root, operation: 'b4-concurrency' });
  } finally { await teardownControlledFixture(f); }
});

test('C1-04 — cross-fixture capability rejected', async () => {
  const a = await createControlledFixture({ allowedOperations: ['probe'] });
  const b = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    await assert.rejects(
      verifyTestCapability(a.capability, { root: b.root, operation: 'probe' }),
      /E_TEST_CAPABILITY_SCOPE/
    );
  } finally {
    await teardownControlledFixture(a);
    await teardownControlledFixture(b);
  }
});

test('C1-05 — revoked capability rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  const cap = f.capability;
  const root = f.root;
  await teardownControlledFixture(f);
  await assert.rejects(
    verifyTestCapability(cap, { root, operation: 'probe' }),
    /E_TEST_CAPABILITY_REVOKED/
  );
});

test('C1-06 — replaced root identity rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  const { rm: rm2, mkdir: mkdir2 } = await import('node:fs/promises');
  await rm2(f.root, { recursive: true, force: true });
  await mkdir2(f.root, { recursive: true, mode: 0o700 });
  try {
    await assert.rejects(
      verifyTestCapability(f.capability, { root: f.root, operation: 'probe' }),
      /E_TEST_CAPABILITY_IDENTITY/
    );
  } finally { await rm2(f.root, { recursive: true, force: true }); }
});

test('C1-07 — symlinked fixture root rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  const linkPath = path.join(os.tmpdir(), 'vcp-controlled-link-' + Date.now());
  try {
    await symlink(f.root, linkPath);
    // Minting through a symlink path: lstat detects the link.
    await assert.rejects(
      mintCapabilityForFixture({ fixtureRoot: linkPath, allowedOperations: ['probe'] }),
      /E_CAPABILITY_ROOT/
    );
    // Using the real capability via the link path: scope check (resolved
    // path differs) or identity check denies.
    await assert.rejects(
      verifyTestCapability(f.capability, { root: linkPath, operation: 'probe' }),
      /E_TEST_CAPABILITY_(SCOPE|IDENTITY)/
    );
  } finally {
    await rm(linkPath, { force: true });
    await teardownControlledFixture(f);
  }
});

test('C1-08 — unsupported filesystem topology fails closed', async () => {
  // Non-directory root (a file) cannot be a fixture.
  const filePath = path.join(os.tmpdir(), 'vcp-controlled-file-' + Date.now());
  await writeFile(filePath, 'x');
  try {
    await assert.rejects(
      mintCapabilityForFixture({ fixtureRoot: filePath, allowedOperations: ['probe'] }),
      /E_CAPABILITY_ROOT/
    );
  } finally { await rm(filePath, { force: true }); }
  // Nonexistent path fails closed.
  await assert.rejects(
    mintCapabilityForFixture({
      fixtureRoot: path.join(os.tmpdir(), 'vcp-controlled-nope-' + Date.now()),
      allowedOperations: ['probe'],
    }),
    /E_CAPABILITY_ROOT/
  );
});

test('C1-09 — unauthorized root substitution rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    // Attacker mints for their own tmpdir fixture, then tries to use it
    // against the real repo: scope check denies.
    const repoRoot = path.resolve(import.meta.dirname, '..');
    await assert.rejects(
      verifyTestCapability(f.capability, { root: repoRoot, operation: 'probe' }),
      /E_TEST_CAPABILITY_SCOPE/
    );
  } finally { await teardownControlledFixture(f); }
});

test('C1-10 — cross-process capability reuse rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    // Simulate a capability from another process: same shape, different pid.
    // The WeakSet check is the primary defense; pid check is secondary.
    const foreign = { ...f.capability, mintedPid: process.pid + 999999 };
    await assert.rejects(
      verifyTestCapability(foreign, { root: f.root, operation: 'probe' }),
      /E_TEST_CAPABILITY_INVALID/
    );
    // A serialized-then-revived capability is not in the WeakSet.
    const revived = JSON.parse(JSON.stringify(f.capability));
    await assert.rejects(
      verifyTestCapability(revived, { root: f.root, operation: 'probe' }),
      /E_TEST_CAPABILITY_INVALID/
    );
  } finally { await teardownControlledFixture(f); }
});

test('C1-11 — scoped revocation does not affect other fixtures (L-2)', async () => {
  const a = await createControlledFixture({ allowedOperations: ['probe'] });
  const b = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    revokeCapabilitiesForFixture(a.root);
    await assert.rejects(
      verifyTestCapability(a.capability, { root: a.root, operation: 'probe' }),
      /E_TEST_CAPABILITY_REVOKED/
    );
    // b's capability still valid.
    await verifyTestCapability(b.capability, { root: b.root, operation: 'probe' });
  } finally {
    await teardownControlledFixture(a).catch(() => {});
    await teardownControlledFixture(b);
  }
});
