// Portable, bounded child-process termination for crash-path tests.
//
// ROOT CAUSE (measured, see test/writer-child-kill.test.mjs CK-03): kill()
// DOES terminate a child on this win32 host, so the historical suite stall was
// NOT a signal-support problem. It was listener-registration order: the crash
// child died at the durability guard, and the parent only then did
// `child.on('exit', r)`, so the event had already been emitted and the promise
// never settled. waitExit() closes that race; forceKill() bounds every wait so
// a crash test can fail but never hang.
import { spawnSync } from 'node:child_process';

// Three states, because "my liveness probe could not run" is NOT evidence that a
// process ended. The boolean form made every crash test pass vacuously the moment
// the probe degraded: on a PATH without `tasklist`, spawnSync returns ENOENT, the
// old code read stdout (empty), and reported a LIVE process as gone.
export const LIVENESS = Object.freeze({ ALIVE: 'ALIVE', DEAD: 'DEAD', UNKNOWN: 'UNKNOWN' });

// Isolated so the semantics are testable without privileges: EPERM cannot be
// produced on demand by an unprivileged runner, but its classification can still
// be pinned by a unit assertion (CK-18).
export function livenessFromErrno(code) {
  if (code === 'ESRCH') return LIVENESS.DEAD;      // no such process: proven absent
  if (code === 'EPERM') return LIVENESS.ALIVE;     // exists; we are not allowed to signal it
  return LIVENESS.UNKNOWN;                          // anything else proves nothing
}

// Pure decision table for a win32 `tasklist` probe result, separated from the
// spawn so every branch is testable: Windows resolves tasklist.exe from System32
// regardless of PATH, so a failed probe cannot be provoked by editing the
// environment of a child. The reviewed scenario — spawn error while the subject
// is alive — is reproduced here as data instead.
export function classifyWin32Probe(result, pid) {
  const r = result ?? {};
  if (r.error) return { state: LIVENESS.UNKNOWN, detail: `probe failed: ${r.error.code ?? r.error.message}` };
  if (r.signal) return { state: LIVENESS.UNKNOWN, detail: `probe killed by ${r.signal}` };
  if (r.status !== 0)
    return { state: LIVENESS.UNKNOWN, detail: `probe exit ${r.status}` };
  const out = `${r.stdout ?? ''}`;
  if (!/\S/.test(out)) return { state: LIVENESS.UNKNOWN, detail: 'probe returned no output' };
  // Measured phrasing for an excluded pid on this host (status 0):
  //   "INFO: No tasks are running which match the specified criteria."
  // A localized build prints something else and falls through to UNKNOWN, which
  // refuses cleanup rather than falsely asserting a process finished.
  if (/No tasks are running|No Running Tasks Match/i.test(out))
    return { state: LIVENESS.DEAD, detail: 'filtered out by the OS' };
  // A matching row must carry the pid as a standalone field; a substring hit inside
  // a window title or a memory column is not identity.
  const row = out.split(/\r?\n/)
    .find((l) => new RegExp(`(^|\\s)${pid}(\\s|$)`).test(l) && !/No tasks are running/i.test(l));
  return row ? { state: LIVENESS.ALIVE, detail: row.trim().slice(0, 80) }
    : { state: LIVENESS.UNKNOWN, detail: 'unparseable probe output' };
}

export function processLiveness(pid) {
  if (!Number.isInteger(pid) || pid <= 0)
    return { state: LIVENESS.UNKNOWN, detail: `not a pid: ${String(pid)}` };

  if (process.platform === 'win32') {
    // READ-ONLY query: `tasklist /FI` never terminates anything.
    return classifyWin32Probe(
      spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'],
        { encoding: 'utf8', windowsHide: true, timeout: 15_000 }), pid);
  }

  try {
    process.kill(pid, 0);
    return { state: LIVENESS.ALIVE, detail: 'signal 0 accepted' };
  } catch (e) {
    const state = livenessFromErrno(e?.code);
    if (state === LIVENESS.DEAD) return { state, detail: 'ESRCH' };
    if (state === LIVENESS.ALIVE) return { state, detail: 'EPERM: exists, different uid' };
    return { state, detail: `probe error ${e?.code ?? e?.message}` };
  }
}

export function processAlive(pid) {
  return processLiveness(pid).state === LIVENESS.ALIVE;
}

// The assertion a crash test must use. ALIVE is a real failure (the kill did not
// land); UNKNOWN is INCONCLUSIVE, never a pass — a probe that could not run has
// not shown anything. Only DEAD satisfies it.
export function requireProcessDead(pid, { what = 'child' } = {}) {
  const { state, detail } = processLiveness(pid);
  if (state === LIVENESS.DEAD) return { state, detail };
  const err = new Error(state === LIVENESS.ALIVE
    ? `FAILED: ${what} pid ${pid} is still ALIVE (${detail})`
    : `INCONCLUSIVE: ${what} pid ${pid} liveness UNPROVEN (${detail})`);
  err.code = state === LIVENESS.ALIVE ? 'E_TEST_ASSERTION' : 'E_TEST_INCONCLUSIVE';
  throw err;
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode) return true;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once?.('exit', () => finish(true));
    child.once?.('close', () => finish(true));
    if (child.exitCode !== null || child.signalCode) finish(true);
  });
}

// Waits for a child to exit WITHOUT the listener-registration race.
//
// Root cause of the historical Windows suite stall: the crash child dies at
// the durability guard, and `await new Promise(r => child.on('exit', r))` was
// registered AFTER that exit had already been emitted, so the promise never
// settled. POSIX teardown timing hid it. A kill-based test must be able to
// fail — never hang.
export async function waitExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { exited: true, alreadyExited: true,
      code: child.exitCode, signal: child.signalCode };
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => finish({ exited: false, timedOut: true }), timeoutMs);
    child.once('exit', (code, signal) => finish({ exited: true, code, signal }));
    child.once('close', (code, signal) => finish({ exited: true, code, signal, closed: true }));
    if (child.exitCode !== null || child.signalCode !== null) {
      finish({ exited: true, alreadyExited: true,
        code: child.exitCode, signal: child.signalCode });
    }
  });
}

// Attempts, in order: plain kill, SIGKILL, then on Windows taskkill /F.
// Returns { terminated, methods } and NEVER throws for a failed kill.
export async function forceKill(child, { timeoutMs = 10_000 } = {}) {
  const methods = [];
  if (!child || child.pid === undefined) {
    return { terminated: false, methods, reason: 'NO_PID' };
  }
  if (await waitForExit(child, 0)) {
    child.removeAllListeners?.();
    return { terminated: true, methods, reason: 'ALREADY_EXITED' };
  }
  for (const signal of [undefined, 'SIGKILL']) {
    try {
      methods.push(signal ? `kill(${signal})` : 'kill()');
      if (child.kill(signal) === true && await waitForExit(child, 1000)) {
        child.removeAllListeners?.();
        return { terminated: true, methods };
      }
    } catch { /* keep trying; a throw here is not a termination */ }
  }
  if (process.platform === 'win32') {
    methods.push('taskkill(/F)');
    const r = spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)],
      { windowsHide: true });
    if (r.status === 0 && await waitForExit(child, Math.min(timeoutMs, 5000))) {
      child.removeAllListeners?.();
      return { terminated: true, methods };
    }
  }
  const gaveUp = Math.max(timeoutMs - 1000, 1000);
  const dead = await waitForExit(child, gaveUp);
  if (dead) { child.removeAllListeners?.(); return { terminated: true, methods }; }
  return { terminated: false, methods, reason: 'KILL_DID_NOT_LAND',
    remainingMs: gaveUp };
}
