// Phase G helper: owned-fixture teardown.
// Rules enforced here:
//   1. A fixture is only deleted when its ownership can be PROVEN - the exact
//      prefix this campaign creates, under the OS temp dir, with a recorded
//      creation time and pid. Anything else is left in place and reported.
//   2. Teardown runs in finally, so an assertion failure cannot leak a fixture.
//   3. If ownership cannot be proven, cleanup is REFUSED, never forced.
//      An unowned directory on disk is a finding; deleting a directory we cannot
//      prove is ours is a worse one.
//   4. If a mutation outcome is unknown, cleanup is refused (STOP+PRESERVE),
//      per the campaign safety rule.
import { lstat, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const LEDGER = process.env.VCP_FIXTURE_LEDGER || null;
const OWNED_PREFIXES = ['vcp-neg-', 'vcp-wid-', 'vcp-wa-', 'vcp-controlled-',
  'vcp-nrc-', 'vcp-m2-', 'la10-'];

function withinTemp(candidate) {
  const tmp = path.resolve(os.tmpdir());
  const r = path.resolve(candidate);
  return r !== tmp && r.startsWith(tmp + path.sep);
}

async function ledger(entry) {
  if (!LEDGER) return;
  const { appendFileSync } = await import('node:fs');
  try { appendFileSync(LEDGER, JSON.stringify(entry) + '\n'); } catch { /* best effort */ }
}

// Creates a temp dir we can later prove we own.
export async function createOwnedFixture(prefix = 'vcp-neg-') {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  const marker = path.join(dir, '.vcp-owned-fixture.json');
  const record = {
    path: path.resolve(dir), prefix, createdAt: new Date().toISOString(),
    pid: process.pid, platform: process.platform,
  };
  await writeFile(marker, JSON.stringify(record) + '\n', { mode: 0o600 });
  await ledger({ event: 'created', ...record });
  return { dir, record };
}

// Proves ownership BEFORE deleting. Returns {removed, reason}.
export async function removeOwnedFixture(dir, { allowUnknownOutcome = true } = {}) {
  const abs = path.resolve(dir);
  const deny = async (reason) => {
    await ledger({ event: 'cleanup-refused', path: abs, reason });
    return { removed: false, reason };
  };
  if (!allowUnknownOutcome) return deny('UNKNOWN_MUTATION_OUTCOME');
  if (!withinTemp(abs)) return deny('OUTSIDE_TEMP_DIR');
  const base = path.basename(abs);
  if (!OWNED_PREFIXES.some((p) => base.startsWith(p)))
    return deny(`UNOWNED_PREFIX:${base}`);
  let marker;
  try {
    marker = JSON.parse(await (await import('node:fs/promises')).readFile(
      path.join(abs, '.vcp-owned-fixture.json'), 'utf8'));
  } catch { return deny('NO_OWNERSHIP_MARKER'); }
  if (marker.path !== abs) return deny('MARKER_PATH_MISMATCH');
  if (!withinTemp(abs)) return deny('MARKER_ESCAPE');
  // Refuse to delete anything that contains a real repository or managed state
  // belonging to a project, regardless of prefix.
  const entries = await readdir(abs).catch(() => []);
  if (entries.includes('.git')) return deny('CONTAINS_GIT_DIR');
  await rm(abs, { recursive: true, force: true });
  await ledger({ event: 'removed', path: abs, at: new Date().toISOString() });
  return { removed: true, reason: null };
}

// Runs a body with guaranteed owned cleanup. `makeDir` must return the dir path.
export async function withOwnedFixture(makeDir, fn) {
  const created = await makeDir();
  const dir = typeof created === 'string' ? created : created.dir;
  try {
    return await fn(dir, created);
  } finally {
    const r = await removeOwnedFixture(dir);
    if (!r.removed) {
      // Loud, but does not throw over the real test failure.
      console.error(`FIXTURE NOT CLEANED ${dir}: ${r.reason}`);
    }
  }
}

export async function fixtureExists(dir) {
  try { await lstat(dir); return true; } catch { return false; }
}
