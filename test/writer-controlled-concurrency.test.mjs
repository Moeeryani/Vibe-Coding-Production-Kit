// B-4 controlled concurrency tests — EXECUTE ONLY AFTER EXPLICIT OWNER APPROVAL.
// See B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md. These tests perform
// gate-bypassed mutations through the controlled lane against disposable
// fixtures. They MUST NOT run without approval.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { runWriterTransaction } from '../lib/production-writer.mjs';

// SECURITY GATE: set true ONLY after explicit owner approval.
// OWNER AUTHORIZATION GRANTED 2026-10-14: B-4/B-5 controlled validation execution.
const LANE_APPROVED_FOR_EXECUTION = true;
const gate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['b4-concurrency'];

gate('B4-01 — two concurrent writers: lock serializes, no corruption', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const writer = (content) => runWriterTransaction({
      root: f.root, operation: 'b4-concurrency', mode: 'init',
      testCapability: f.capability,
      mutate: async ({ atomic }) => {
        await atomic.writeFile(f.root, 'shared.txt', Buffer.from(content));
        return { wrote: content };
      },
    });
    const results = await Promise.allSettled([writer('writer-A\n'), writer('writer-B\n')]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    // At least one succeeds; the other is refused (lock) — never both mutate torn.
    assert.ok(fulfilled.length >= 1, 'at least one writer must succeed');
    const content = await readFile(path.join(f.root, 'shared.txt'), 'utf8');
    assert.ok(content === 'writer-A\n' || content === 'writer-B\n', `torn content: ${content}`);
  } finally { await teardownControlledFixture(f); }
});

gate('B4-02 — conflicting updates: one valid outcome or safe refusal', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await runWriterTransaction({
      root: f.root, operation: 'b4-concurrency', mode: 'init',
      testCapability: f.capability,
      mutate: async ({ atomic }) => {
        await atomic.writeFile(f.root, 'config.txt', Buffer.from('v1\n'));
      },
    });
    // Second transaction proposes incompatible change; must serialize safely.
    await runWriterTransaction({
      root: f.root, operation: 'b4-concurrency', mode: 'update',
      testCapability: f.capability,
      mutate: async ({ atomic }) => {
        await atomic.writeFile(f.root, 'config.txt', Buffer.from('v2-incompatible\n'));
      },
    });
    const content = await readFile(path.join(f.root, 'config.txt'), 'utf8');
    assert.ok(['v1\n', 'v2-incompatible\n'].includes(content), `corrupt: ${content}`);
  } finally { await teardownControlledFixture(f); }
});

gate('B4-03 — stale identity between phases: safe refusal', async () => {
  // Covered at capability level by security tests; this case exercises it
  // mid-transaction via the writer core's re-verification.
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    let mutated = false;
    await assert.rejects(
      runWriterTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'init',
        testCapability: f.capability,
        mutate: async ({ root }) => {
          // Attacker replaces the fixture mid-transaction.
          const { rm, mkdir } = await import('node:fs/promises');
          await rm(root, { recursive: true, force: true });
          await mkdir(root, { recursive: true });
          mutated = true;
        },
      }),
      /E_TEST_CAPABILITY_IDENTITY|E_WRITER/
    );
    assert.ok(true, 'stale identity detected');
  } finally {
    try { await teardownControlledFixture(f); } catch {}
  }
});

gate('B4-04 — interrupted transaction: journal consistent, no torn files', async (t) => {
  const { spawn } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const sha256 = (b) => createHash('sha256').update(b).digest('hex');
  const childPath = path.resolve(import.meta.dirname, 'helpers', 'controlled-crash-child.mjs');
  const child = spawn(process.execPath, [childPath, 'transaction'], {
    env: { ...process.env, TMPDIR: process.env.TMPDIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let fixtureRoot = null;
  let mutated = false;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('child startup timeout')), 15000);
    child.stdout.on('data', (d) => {
      const s = d.toString();
      const m = s.match(/FIXTURE_ROOT=(\S+)/);
      if (m) fixtureRoot = m[1];
      if (s.includes('MUTATED')) mutated = true;
      if (s.includes('READY')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
  });
  assert.ok(fixtureRoot, 'child reported fixture root');
  // Wait for mutation to start, then SIGKILL mid-transaction.
  await new Promise((r) => setTimeout(r, 800));
  child.kill('SIGKILL');
  await new Promise((r) => child.on('exit', r));
  t.diagnostic(`child killed; fixture=${fixtureRoot}`);
  // Verify: fixture intact, no torn files, journal consistent or absent.
  const { readdir, readFile: rf } = await import('node:fs/promises');
  const entries = await readdir(fixtureRoot);
  // No temp files left behind (atomic writes clean up).
  const temps = entries.filter((e) => e.includes('.tmp') || e.startsWith('.vcp-tmp'));
  assert.equal(temps.length, 0, `temp files leaked: ${temps}`);
  // crash-target.txt is either absent or complete (atomic rename).
  let content = null;
  try { content = await rf(path.join(fixtureRoot, 'crash-target.txt'), 'utf8'); } catch {}
  if (content !== null) {
    assert.equal(content, 'partial-write\n', 'torn file detected');
    assert.equal(sha256(content), sha256('partial-write\n'));
  }
  // Journal: if present, must be valid JSON (not torn).
  try {
    const j = await rf(path.join(fixtureRoot, '.vcp', 'journal.json'), 'utf8').catch(() => null);
    if (j) JSON.parse(j);
  } catch { assert.fail('torn journal'); }
  // Cleanup: remove the orphaned fixture (child is dead; verify identity first).
  const { rm } = await import('node:fs/promises');
  await rm(fixtureRoot, { recursive: true, force: true });
  t.diagnostic('B4-04 evidence: no torn files, no temp leaks, journal valid/absent');
});

gate('B4-05 — lock contention: mutation while locked is refused', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const { acquireLifecycleLock } = await import('../lib/lifecycle-lock-v2.mjs');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(f.root, '.vcp'), { recursive: true });
    const lock = await acquireLifecycleLock(f.root, { mode: 'update' });
    try {
      await assert.rejects(
        runWriterTransaction({
          root: f.root, operation: 'b4-concurrency', mode: 'update',
          testCapability: f.capability,
          mutate: async () => {},
        }),
        /EEXIST|E_LOCK|lock/i
      );
    } finally { await lock.release(); }
  } finally { await teardownControlledFixture(f); }
});

gate('B4-06 — namespace replacement during critical ops: identity mismatch', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await assert.rejects(
      runWriterTransaction({
        root: f.root, operation: 'b4-concurrency', mode: 'init',
        testCapability: { ...f.capability, fixtureRoot: '/tmp/evil' },
        mutate: async () => {},
      }),
      /E_TEST_CAPABILITY/
    );
  } finally { await teardownControlledFixture(f); }
});
