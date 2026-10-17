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
import {
  classifyWin32Probe, forceKill, livenessFromErrno, processAlive, processLiveness, LIVENESS,
  requireProcessDead, waitExit,
} from './helpers/child-kill.mjs';

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
    requireProcessDead(child.pid, { what: 'CK-01 child' });
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
  requireProcessDead(done.pid, { what: 'CK-02 already-exited child' });
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
  const { forceKill } = await import('./helpers/child-kill.mjs');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  const pid = child.pid;
  for (let i = 0; i < 3; i++) {
    const r = await forceKill(child, { timeoutMs: 8000 });
    assert.equal(r.terminated, true, `attempt ${i + 1} reported failure`);
  }
    requireProcessDead(pid, { what: 'CK-11 child' });
  child.stdout.resume(); child.stderr.resume();
});

// Discovery-count stability across repeated full runs belongs to the matrix
// harness (dev/windows-writer-matrix.mjs, excluded from the published package),
// which is NOT itself running
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

// ---------------------------------------------------------------------------
// M-W F3: liveness is THREE states. Before this, every crash assertion was
// `processAlive(pid) === false` and NOTHING asserted true — so a probe that could
// not run reported a living process as gone and the test passed vacuously.
// ---------------------------------------------------------------------------

test('CK-13 — the probe reports ALIVE for a live child (the missing positive control)', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  try {
    const seen = processLiveness(child.pid);
    assert.equal(seen.state, LIVENESS.ALIVE,
      `a running child must be ALIVE, got ${seen.state} (${seen.detail}) — if this fails,`
      + ' every DEAD assertion below is vacuous');
    assert.equal(processAlive(child.pid), true);
    // This process itself: a second, independent ALIVE observation.
    assert.equal(processLiveness(process.pid).state, LIVENESS.ALIVE);
  } finally {
    await forceKill(child, { timeoutMs: 8000 });
    child.stdout.resume(); child.stderr.resume();
  }
});

test('CK-14 — DEAD is asserted only after the child is actually reaped', async () => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, SLEEP_CHILD, { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => child.stdout.once('data', res));
  const k = await forceKill(child, { timeoutMs: 8000 });
  assert.equal(k.terminated, true, JSON.stringify(k));
  child.stdout.resume(); child.stderr.resume();
  // Bounded poll: a PID can be briefly un-reaped right after the kill.
  let state = null;
  for (let i = 0; i < 20; i++) {
    state = processLiveness(child.pid).state;
    if (state === LIVENESS.DEAD) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(state, LIVENESS.DEAD, 'a reaped child must read DEAD, not UNKNOWN');
});

test('CK-15 — a probe that could not run is UNKNOWN, never DEAD', () => {
  // Windows resolves tasklist.exe from System32 regardless of PATH, so a failed
  // probe cannot be provoked by sandboxing a child's environment. The reviewed
  // scenario is reproduced as data against the same classifier the live path uses.
  const LIVE_PID = process.pid;
  const cases = [
    ['spawn ENOENT (tasklist missing)', { error: Object.assign(new Error('spawn tasklist ENOENT'), { code: 'ENOENT' }), status: null, stdout: '' }, LIVENESS.UNKNOWN],
    ['probe killed by a signal', { signal: 'SIGTERM', status: null, stdout: '' }, LIVENESS.UNKNOWN],
    ['non-zero exit', { status: 1, stdout: '' }, LIVENESS.UNKNOWN],
    ['zero exit, no output', { status: 0, stdout: '' }, LIVENESS.UNKNOWN],
    ['zero exit, unparseable output', { status: 0, stdout: 'something else entirely' }, LIVENESS.UNKNOWN],
    ['the real DEAD line (measured)', { status: 0, stdout: 'INFO: No tasks are running which match the specified criteria.\r\n' }, LIVENESS.DEAD],
    ['a row naming the live pid', { status: 0, stdout: `\r\nnode.exe  ${LIVE_PID} Console  2  54,340 K\r\n` }, LIVENESS.ALIVE],
    // A pid appearing only inside another column must not read as identity.
    ['pid as a coincidental substring', { status: 0, stdout: 'notepad.exe  1  Console  2  12 K\r\n' }, LIVENESS.UNKNOWN],
  ];
  for (const [label, result, expected] of cases)
    assert.equal(classifyWin32Probe(result, LIVE_PID).state, expected,
      `${label} must classify ${expected}`);

  // And UNKNOWN must never satisfy a crash assertion, even via the classifier.
  const { state } = classifyWin32Probe({ error: { code: 'ENOENT' }, status: null, stdout: '' }, LIVE_PID);
  assert.notEqual(state, LIVENESS.DEAD,
    'a failed probe reading DEAD is the fail-open the reviewer reproduced');
});

test('CK-16 — a malformed pid is UNKNOWN, not an assertion of death', () => {
  for (const bad of [0, -1, 1.5, 'x', null, undefined, NaN])
    assert.equal(processLiveness(bad).state, LIVENESS.UNKNOWN,
      `${JSON.stringify(bad)} must not read as DEAD`);
});

test('CK-17 — requireProcessDead: ALIVE fails, UNKNOWN is inconclusive', () => {
  // The DEAD path is exercised by CK-01/02/11/14, which call requireProcessDead
  // on genuinely reaped children and pass.
  const alive = (() => {
    try { requireProcessDead(process.pid, { what: 'self' }); return null; }
    catch (e) { return e; }
  })();
  assert.ok(alive, 'a live pid must not satisfy requireProcessDead');
  assert.equal(alive.code, 'E_TEST_ASSERTION', 'ALIVE is a real failure, not inconclusive');

  const unknown = (() => {
    try { requireProcessDead('not-a-pid', { what: 'unprobeable' }); return null; }
    catch (e) { return e; }
  })();
  assert.ok(unknown, 'UNKNOWN must not satisfy requireProcessDead');
  assert.equal(unknown.code, 'E_TEST_INCONCLUSIVE',
    'an unrunnable probe must surface as INCONCLUSIVE, never as a pass');
});

test('CK-18 — errno semantics are pinned: ESRCH dead, EPERM alive, other unknown', () => {
  assert.equal(livenessFromErrno('ESRCH'), LIVENESS.DEAD);
  // EPERM means the process EXISTS and simply is not ours to signal. Treating it
  // as absence is the fail-open the reviewer flagged on the POSIX branch.
  assert.equal(livenessFromErrno('EPERM'), LIVENESS.ALIVE);
  for (const other of ['EINVAL', 'EACCES', 'ENOMEM', undefined, null, 'UNKNOWN_CODE'])
    assert.equal(livenessFromErrno(other), LIVENESS.UNKNOWN,
      `${String(other)} proves nothing about liveness`);
});

test('CK-19 — DEAD is reachable on this host, not a state the probe can only guess at', () => {
  // The regression that found the bug: the win32 branch originally matched a
  // phrase tasklist never prints ("No Running Tasks Match"), so NO process could
  // ever be read as DEAD — every requireProcessDead would have thrown INCONCLUSIVE,
  // and on a POSIX host the mismatch is invisible. Pin the real observed output.
  const absent = (() => {
    // A pid the OS will not have: PID 0 is invalid here, and pids at the top of the
    // range are unallocated on this host.
    for (const pid of [999999, 999998]) {
      const r = processLiveness(pid);
      if (r.state === LIVENESS.DEAD) return r;
    }
    return processLiveness(-1);
  })();
  assert.equal(absent.state, LIVENESS.DEAD,
    `an absent pid must read DEAD (${absent.detail})`);
  assert.doesNotThrow(() => requireProcessDead(999999, { what: 'absent pid' }));
  // And ALIVE/DEAD must be distinguishable: our own pid is unambiguously alive.
  assert.equal(processLiveness(process.pid).state, LIVENESS.ALIVE);
});
