// Phase 5 regression for child-process teardown portability.
// Root cause of the Windows suite stall: child.kill('SIGKILL') is a no-op on
// win32 (node:child_process documents signals as unsupported there), so the
// awaited 'exit' event never fires and the suite hangs forever. A crash test
// whose kill does not land cannot claim crash-atomicity, so this must FAIL —
// never hang, and never pass silently.
import assert from 'node:assert/strict';
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
