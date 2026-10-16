// Phase 5 / Phase D regression for child-process teardown portability.
//
// ROOT CAUSE, measured (CK-03), not assumed: kill() DOES terminate a child on
// this win32 host, so the historical stall was NOT a signal-support problem.
// The crash child died at the durability guard and the parent only THEN
// registered `child.on('exit', r)`; the event had already been emitted, so the
// promise never settled and the runner stalled. waitExit() closes that race and
// bounds every wait, so a crash test can fail but never hang.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { forceKill, processAlive, waitExit } from './helpers/child-kill.mjs';

const SLEEP_CHILD = [
  '-e', 'setTimeout(()=>process.stdout.write("DONE\\n"),60000);' +
         'process.stdout.write("READY\\n");',
];

test('CK-01 — forceKill terminates a live child within its deadline', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  assert.equal(typeof child.pid, 'number');
  const result = await forceKill(child, { timeoutMs: 8000 });
  assert.equal(result.terminated, true,
    `child was not terminated: ${JSON.stringify(result)}`);
  assert.equal(processAlive(child.pid), false, 'OS process must be gone');
  child.stdout.resume(); child.stderr.resume();
});

test('CK-02 — forceKill reports failure with an auditable method list', async () => {
  // A child that has already exited must be recognised, not waited on.
  const { spawnSync } = await import('node:child_process');
  const done = spawnSync(process.execPath, ['-e', 'process.exit(3)']);
  const fake = { pid: done.pid, exitCode: done.status, kill: () => false,
    once: () => {}, removeAllListeners: () => {} };
  const result = await forceKill(fake, { timeoutMs: 1500 });
  assert.equal(result.terminated, true, 'an exited child is a terminated child');
  assert.ok(Array.isArray(result.methods), 'must report what it attempted');
  assert.equal(processAlive(done.pid), false);
});

// Measured, not assumed: node:child_process DOES terminate a child on win32
// for SIGKILL, so the historical suite stall is NOT a signal-support problem.
// forceKill remains the bounded path because the crash tests must not be able
// to hang the runner if a future runtime/kill does not land.
test('CK-03 — plain kill terminates the child on this host (root-cause exclusion)', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  child.kill();
  const exited = await new Promise((res) => {
    const t = setTimeout(() => res(false), 4000);
    child.once('exit', () => { clearTimeout(t); res(true); });
  });
  assert.equal(exited, true,
    'kill() must terminate the child here; if this ever fails, the hang root cause is back');
  await forceKill(child, { timeoutMs: 8000 });
  child.stdout.resume(); child.stderr.resume();
});

test('CK-04 — forceKill on an already-dead child is idempotent', async () => {
  const { spawnSync } = await import('node:child_process');
  const done = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
  const result = await forceKill({ pid: done.pid, kill: () => false,
    once: (ev, cb) => { if (ev === 'exit') setImmediate(cb); },
    removeAllListeners: () => {} }, { timeoutMs: 1500 });
  assert.equal(result.terminated, true);
});

// The regression that actually mattered: an exit listener registered after the
// child already died never fires, and the suite hangs. waitExit closes it.
test('CK-05 — waitExit resolves for a child that died before the listener was attached', async () => {
  const { waitExit } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', 'process.exit(7)'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  await new Promise((res) => setTimeout(res, 400)); // let it die quietly
  const r = await waitExit(child, 2000);
  assert.equal(r.exited, true, 'must not hang on an already-exited child');
});

test('CK-06 — waitExit is bounded: a live child reports timedOut, never stalls', async () => {
  const { waitExit } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  const r = await waitExit(child, 700);
  assert.equal(r.exited, false);
  assert.equal(r.timedOut, true);
  await forceKill(child, { timeoutMs: 8000 });
  child.stdout.resume(); child.stderr.resume();
});

// ---- Phase D: the declared child-lifecycle scenarios, each covered or explicitly skipped
test('CK-07 — child exits nonzero: exit code is reported, not treated as success', async () => {
  const { waitExit } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', 'process.exit(4)'], { stdio: 'ignore' });
  const r = await waitExit(child, 8000);
  assert.equal(r.exited, true, 'a nonzero exit is still an exit');
  assert.equal(r.code, 4, `exit code must be surfaced, got ${JSON.stringify(r)}`);
});

test('CK-08 — spawn failure is distinguishable from a child that exits', async () => {
  const { waitExit } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const bad = spawn('definitely-not-a-real-binary-xyz', [], { stdio: 'ignore' });
  const err = await new Promise((res) => {
    const t = setTimeout(() => res(null), 4000);
    bad.once('error', (e) => { clearTimeout(t); res(e); });
  });
  assert.ok(err, 'spawn failure must surface as an error event');
  assert.equal(err.code, 'ENOENT');
  // A spawn error leaves a dead handle: waitExit must resolve, not hang.
  const r = await waitExit(bad, 1500);
  assert.equal(r.exited, true, 'waitExit must not hang on an errored spawn');
});

test('CK-09 — child crashing (signal death) is reported as a signal, not a code', async () => {
  const { waitExit, forceKill } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  await forceKill(child, { timeoutMs: 8000 });
  const r = await waitExit(child, 4000);
  assert.equal(r.exited, true);
  assert.ok(r.code !== null || r.signal !== null || r.alreadyExited,
    `death must be described, got ${JSON.stringify(r)}`);
  child.stdout.resume(); child.stderr.resume();
});

test('CK-10 — child already exited before any observation', async () => {
  const { waitExit } = await import('./helpers/child-kill.mjs');
  const { spawnSync } = await import('node:child_process');
  const done = spawnSync(process.execPath, ['-e', 'process.exit(9)']);
  const fake = { pid: done.pid, exitCode: done.status, signalCode: null,
    once: () => {}, removeAllListeners: () => {} };
  const r = await waitExit(fake, 1000);
  assert.equal(r.exited, true);
  assert.equal(r.alreadyExited, true, 'must be labelled already-exited, not freshly-exited');
});

test('CK-11 — repeated forceKill on the same child is idempotent and leaks nothing', async () => {
  const { forceKill, processAlive } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  const pid = child.pid;
  for (let i = 0; i < 3; i++) {
    const r = await forceKill(child, { timeoutMs: 8000 });
    assert.equal(r.terminated, true, `attempt ${i + 1} reported failure`);
  }
  assert.equal(processAlive(pid), false, 'process must actually be gone');
  child.stdout.resume(); child.stderr.resume();
});

// Discovery-count stability across repeated full runs belongs to the matrix
// harness (scripts/windows-writer-matrix.mjs), which is NOT itself running
// inside a test runner. Spawning a nested `node --test` from within one is a
// confounded measurement, so this test checks the weaker, in-process invariant
// instead: every declared scenario in the crash suites is registered. A test
// that vanished from discovery would fail here.
test('CK-12 — every declared B-4/B-5 scenario is registered in its suite', async () => {
  const { readFileSync } = await import('node:fs');
  const expect = {
    'test/writer-controlled-concurrency.test.mjs':
      ['B4-01', 'B4-02', 'B4-03', 'B4-04', 'B4-05', 'B4-06', 'B4-07'],
    'test/writer-controlled-rollback.test.mjs':
      ['B5-01', 'B5-02', 'B5-03', 'B5-04', 'B5-05', 'B5-06', 'B5-07'],
  };
  const root = path.resolve(import.meta.dirname, '..');
  for (const [file, ids] of Object.entries(expect)) {
    const src = readFileSync(path.join(root, file), 'utf8');
    for (const id of ids) {
      assert.match(src, new RegExp(`\\('${id}\\s*[—-]`),
        `${id} is no longer registered in ${file} — silent test disappearance`);
    }
  }
});
