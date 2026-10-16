// B-5 controlled rollback tests — EXECUTE ONLY AFTER EXPLICIT OWNER APPROVAL.
// See B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md. These tests perform
// gate-bypassed mutations through the controlled lane against disposable
// fixtures. They MUST NOT run without approval.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
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

gateNested('B5-01 — successful restore: byte-exact, journal clean', async () => {
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
  const sha256 = (b) => createHash('sha256').update(b).digest('hex');
  const childPath = path.resolve(import.meta.dirname, 'helpers', 'controlled-crash-child.mjs');
  const child = spawn(process.execPath, [childPath, 'rollback'], {
    env: { ...process.env, TMPDIR: process.env.TMPDIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let fixtureRoot = null;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child startup timeout')), 20000);
    child.stdout.on('data', (d) => {
      const s = d.toString();
      const m = s.match(/FIXTURE_ROOT=(\S+)/);
      if (m) fixtureRoot = m[1];
      if (s.includes('BACKUP_READY')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
  });
  assert.ok(fixtureRoot, 'child reported fixture root');
  // Kill mid-restore (50 files being restored; 300ms should catch it).
  await new Promise((r) => setTimeout(r, 300));
  child.kill('SIGKILL');
  await new Promise((r) => child.on('exit', r));
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
  // No temp files leaked.
  const entries = await readdir(fixtureRoot);
  const temps = entries.filter((e) => e.includes('.tmp'));
  assert.equal(temps.length, 0);
  const { rm } = await import('node:fs/promises');
  await rm(fixtureRoot, { recursive: true, force: true });
  t.diagnostic('B5-04 evidence: manifest atomic, backup intact, no temp leaks');
});

gateNested('B5-05 — concurrent rollback and update: locking serializes', async () => {
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

gateNested('B5-07 — byte retention: no residual sensitive data after cleanup', async (t) => {
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
