// Portable, bounded child-process termination for crash-path tests.
//
// node:child_process documents signals as unsupported on Windows, so
// child.kill('SIGKILL') returns without killing anything. Tests that then
// await the 'exit' event hang for the whole runner. Every crash-atomicity
// claim therefore needs a kill that is (a) actually effective on the host and
// (b) bounded, so failure surfaces as a test failure instead of a stall.
import { spawnSync } from 'node:child_process';

const EXIT_POLL_MS = 25;

export function processAlive(pid) {
  if (!pid) return false;
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T'], { windowsHide: true });
    // taskkill reports ODBC_NOT_FOUND (128) when the process is gone; it also
    // succeeds here, so treat "we just killed it" as alive and re-check.
    if (r.status === 0) return true;
    return /not found/i.test(`${r.stderr ?? ''}${r.stdout ?? ''}`) ? false : true;
  }
  try { process.kill(pid, 0); return true; } catch { return false; }
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
