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

// READ-ONLY liveness probe. Must not terminate or otherwise alter its subject.
export function processAlive(pid) {
  if (!pid) return false;
  if (process.platform === 'win32') {
    const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { windowsHide: true });
    const out = `${r.stdout ?? ''}`;
    return out.includes(String(pid));
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
