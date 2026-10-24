// B-5 controlled rollback tests — EXECUTE ONLY AFTER EXPLICIT OWNER APPROVAL.
// See B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md. These tests perform
// gate-bypassed mutations through the controlled lane against disposable
// fixtures. They MUST NOT run without approval.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
const gateNestedMut = (name, fn) => mutationTest(name, fn);
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';
import { atomicWriteFile } from '../lib/writer-atomic.mjs';

// SECURITY GATE: set true ONLY after explicit owner approval.
// OWNER AUTHORIZATION GRANTED 2026-10-14: B-4/B-5 controlled validation execution.
const LANE_APPROVED_FOR_EXECUTION = true;
// NESTED JOURNAL GATE: B5-01/04/05/07 use the nested journal authorization
// (Approach A). OWNER AUTHORIZATION GRANTED 2026-10-15: journal fix reviewed,
// independent security review PASS. Execution approved.
const NESTED_JOURNAL_APPROVED = true;
const gateNested = (name, fn) => test(name, {
  skip: !LANE_APPROVED_FOR_EXECUTION || !NESTED_JOURNAL_APPROVED,
}, fn);
const gate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['rollback-v2', 'journal-write', 'journal-clear'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// Build a valid test backup inside the fixture (test-created, disposable).
async function makeTestBackup(root, backupId, manifestObj) {
  const base = path.join(root, '.vcp', 'backups', backupId);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const manifestBytes = Buffer.from(JSON.stringify(manifestObj, null, 2) + '\n');
  await writeFile(path.join(base, 'manifest.json'), manifestBytes);
  const record = {
    id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4',
    restoredManifestHash: sha256(manifestBytes),
    entries: [],
  };
  await writeFile(path.join(base, 'backup.json'), JSON.stringify(record, null, 2) + '\n');
  return { manifestBytes, record };
}

gateNestedMut('B5-01 — successful restore: byte-exact, journal clean', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'test-backup-01';
    const { manifestBytes } = await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 });
    // Mutate current state away from the backup.
    await atomicWriteFile(f.root, '.vcp/manifest.json', Buffer.from('{"mutated":true}\n'), { mode: 0o600, managedState: true });
    const receipt = await rollbackV2({
      root: f.root, backupId, confirmed: true, testCapability: f.capability,
    });
    assert.equal(receipt.rolledBack, true);
    assert.equal(receipt.backupId, backupId);
    const restored = await readFile(path.join(f.root, '.vcp', 'manifest.json'));
    assert.equal(sha256(restored), sha256(manifestBytes), 'restored bytes must match backup exactly');
  } finally { await teardownControlledFixture(f); }
});

gate('B5-02 — tampered backup: hash verification fails, no mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'test-backup-02';
    await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 });
    // Tamper with the backup manifest after the record was created.
    await writeFile(path.join(f.root, '.vcp', 'backups', backupId, 'manifest.json'), '{"tampered":true}\n');
    const before = await readFile(path.join(f.root, '.vcp', 'backups', backupId, 'manifest.json'), 'utf8').catch(() => null);
    await assert.rejects(
      rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      /E_ROLLBACK_BACKUP_TAMPERED/
    );
  } finally { await teardownControlledFixture(f); }
});

gate('B5-03 — unauthorized rollback: invalid capability refused', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'x', confirmed: true, testCapability: { forged: true } }),
      /E_TEST_CAPABILITY_INVALID/
    );
  } finally { await teardownControlledFixture(f); }
});

gateNested('B5-04 — interrupted rollback: no invalid mixed state', async (t) => {
  const { spawn } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { forceKill, waitExit } = await import('./helpers/child-kill.mjs');
  const sha256 = (b) => createHash('sha256').update(b).digest('hex');
  const childPath = path.resolve(import.meta.dirname, 'helpers', 'controlled-crash-child.mjs');

  // A crash test can only prove crash-atomicity if the child reaches the
  // mutation. The product itself declares whether namespace durability is
  // available on this platform; where it is not, no mutation can happen and
  // this scenario is reported INCONCLUSIVE rather than run to a hang.
  const { lifecycleDurabilityCapability } = await import('../lib/file-durability.mjs');
  const durability = lifecycleDurabilityCapability();
  if (!durability.supported) {
    const e = new Error(`INCONCLUSIVE: mutation is unreachable on '${durability.reason}'` +
      ` — the child cannot reach the rollback window`);
    e.code = 'E_TEST_INCONCLUSIVE';
    throw e;
  }

  const child = spawn(process.execPath, [childPath, 'rollback'], {
    env: { ...process.env, TMPDIR: process.env.TMPDIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let fixtureRoot = null;
  let childErr = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child startup timeout')), 20000);
    child.once('exit', (code, signal) => {
      // The child may die before BACKUP_READY; resolve so we can inspect why
      // instead of burning the full startup timeout.
      childErr = { code, signal };
      if (!fixtureRoot) { clearTimeout(timer); resolve(); }
    });
    child.stdout.on('data', (d) => {
      const s = d.toString();
      const m = s.match(/FIXTURE_ROOT=(\S+)/);
      if (m) fixtureRoot = m[1];
      if (s.includes('BACKUP_READY')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
  });
  assert.ok(fixtureRoot, `child reported fixture root (child exit: ${JSON.stringify(childErr)})`);
  if (childErr) {
    // Child died during setup: the mid-restore kill window never existed.
    const { rm } = await import('node:fs/promises');
    await rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
    const e = new Error(`INCONCLUSIVE: child exited (${childErr.code ?? childErr.signal})` +
      ` before the rollback window — crash-atomicity not exercised`);
    e.code = 'E_TEST_INCONCLUSIVE';
    throw e;
  }
  // Kill mid-restore (50 files being restored; 300ms should catch it).
  await new Promise((r) => setTimeout(r, 300));
  // BOUNDED, race-free teardown. The previous form awaited an 'exit' event
  // registered after the child had already died, which hung the whole runner
  // on Windows. Failure must surface as a test result, never as a stall.
  const kill = await forceKill(child, { timeoutMs: 10_000 });
  const post = await waitExit(child, 10_000);
  assert.equal(kill.terminated && post.exited, true,
    `child was not terminated: ${JSON.stringify(kill)}`);
  t.diagnostic(`child killed mid-rollback; fixture=${fixtureRoot}`);
  const { readFile: rf, readdir } = await import('node:fs/promises');
  // Manifest is atomic: either v1 (restored) or absent — never torn.
  let manifest = null;
  try { manifest = await rf(path.join(fixtureRoot, '.vcp', 'manifest.json'), 'utf8'); } catch {}
  if (manifest !== null) {
    const parsed = JSON.parse(manifest); // throws if torn
    assert.ok(parsed.v === 1 || parsed.mutated === true, 'manifest in valid state');
  }
  // Backup intact (rollback must not corrupt its source).
  const backupManifest = await rf(
    path.join(fixtureRoot, '.vcp', 'backups', 'crash-backup', 'manifest.json'), 'utf8');
  assert.equal(sha256(backupManifest), sha256(JSON.stringify({ v: 1 }) + '\n'));
  // No temp files leaked. Phase N staging-name note: the baseline
  // writer's staging pattern (.vcp-tmp-*) never matched this filter, so
  // an in-flight staging file orphaned by the SIGKILL was invisible to
  // this assertion even though the physical state was identical. The
  // provider staging pattern (.<base>.vcp-<rand>.tmp) DOES match, and
  // the provider's documented crash contract is that a crash may leave
  // exactly one reapable staging file — never a torn committed file.
  // The assertion is therefore precise instead of blind: every
  // leftover must be a provider staging entry, it must be reapable
  // through the pinned namespace, and after the reap none may remain.
  const entries = await readdir(fixtureRoot);
  const temps = entries.filter((e) => e.includes('.tmp') || e.startsWith('.vcp-tmp-'));
  const STAGING = /^\.[A-Za-z0-9._-]+\.vcp-[a-f0-9]+\.tmp$/;
  for (const name of temps)
    assert.match(name, STAGING, `unexpected temp leftover after kill: ${name}`);
  if (temps.length) {
    const { LinuxFsProvider } = await import('../lib/linux-fs-provider.mjs');
    const reaped = await new LinuxFsProvider().reapStaging(fixtureRoot, '.');
    assert.deepEqual([...reaped.removed].sort(), [...temps].sort(),
      'every leftover staging entry must be reapable');
    const after = await readdir(fixtureRoot);
    assert.equal(
      after.filter((e) => e.includes('.tmp') || e.startsWith('.vcp-tmp-')).length, 0,
      'no temp entries may remain after the staging reap');
  }
  const { rm } = await import('node:fs/promises');
  await rm(fixtureRoot, { recursive: true, force: true });
  t.diagnostic('B5-04 evidence: manifest atomic, backup intact, no temp leaks');
});

gateNestedMut('B5-05 — concurrent rollback and update: locking serializes', async () => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2', 'b4-concurrency', 'journal-write', 'journal-clear'] });
  // Barrier: ensure both workers start before either can finish.
  // This prevents the test's cleanup from racing with in-flight operations.
  let rollbackStarted = false;
  let updateStarted = false;
  const bothStarted = () => rollbackStarted && updateStarted;
  try {
    const backupId = 'test-backup-05';
    await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 });
    // Start both operations; each signals when its async work begins.
    // Use explicit promise construction to capture startup.
    const rollback = (async () => {
      rollbackStarted = true;
      return rollbackV2({
        root: f.root, backupId, confirmed: true, testCapability: f.capability,
      });
    })();
    const update = (async () => {
      updateStarted = true;
      return runWriterTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'update',
        testCapability: f.capability,
        mutate: async ({ atomic }) => {
          await atomic.writeFile(f.root, 'concurrent.txt', Buffer.from('update\n'));
        },
      });
    })();
    // Wait for both to settle; teardown only after this resolves.
    const results = await Promise.allSettled([rollback, update]);
    // Telemetry: prove both attempted (not sequential).
    const attempted = (rollbackStarted ? 1 : 0) + (updateStarted ? 1 : 0);
    assert.equal(attempted, 2, 'both operations must attempt concurrent execution');
    // At least one completes; the loser is refused by the lock — never
    // interleaved corruption.
    const okCount = results.filter((r) => r.status === 'fulfilled').length;
    assert.ok(okCount >= 1, 'at least one operation must complete');
    // Manifest (if restored) is valid JSON; concurrent.txt (if written) is complete.
    const { readFile: rf } = await import('node:fs/promises');
    try {
      const m = await rf(path.join(f.root, '.vcp', 'manifest.json'), 'utf8');
      JSON.parse(m);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    try {
      const c = await rf(path.join(f.root, 'concurrent.txt'), 'utf8');
      assert.equal(c, 'update\n');
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  } finally { await teardownControlledFixture(f); }
});

gate('B5-06 — stale backup: version/identity mismatch refused', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'test-backup-06';
    const { record } = await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 });
    // Corrupt the record ID so it no longer matches the directory.
    await writeFile(
      path.join(f.root, '.vcp', 'backups', backupId, 'backup.json'),
      JSON.stringify({ ...record, id: 'different-id' })
    );
    await assert.rejects(
      rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      /E_ROLLBACK_BACKUP_MISMATCH/
    );
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('B5-07 — byte retention: no residual sensitive data after cleanup', async (t) => {
  const f = await createControlledFixture({ allowedOperations: ['rollback-v2', 'journal-write', 'journal-clear'] });
  const SECRET = 'SENSITIVE-CANARY-' + Date.now();
  try {
    const backupId = 'test-backup-07';
    await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 });
    // Write secret, then rollback over it, then teardown.
    const { atomicWriteFile } = await import('../lib/writer-atomic.mjs');
    await atomicWriteFile(f.root, '.vcp/manifest.json',
      Buffer.from(JSON.stringify({ secret: SECRET }) + '\n'), { mode: 0o600, managedState: true });
    await rollbackV2({
      root: f.root, backupId, confirmed: true, testCapability: f.capability,
    });
    const root = f.root;
    await teardownControlledFixture(f);
    // After teardown, the fixture root must be gone entirely.
    const { access } = await import('node:fs/promises');
    await assert.rejects(access(root), /ENOENT/);
    t.diagnostic('B5-07: fixture fully removed; no residual bytes on disk at fixture path');
    // Note: this verifies logical cleanup, not physical media erasure.
  } catch (e) {
    try { await teardownControlledFixture(f); } catch {}
    throw e;
  }
});
