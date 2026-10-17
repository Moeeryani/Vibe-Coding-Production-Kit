// Phase G helper: owned-fixture teardown.
// Rules enforced here:
//   1. A fixture is only deleted when this process can prove it created it.
//      Ownership is vouched for by an in-process registry plus a per-fixture
//      random token, NOT by anything the directory itself claims - a marker
//      that merely restates its own path can be planted by any other process,
//      and deleting on that basis destroys data this campaign never made.
//   2. If ownership cannot be proven, cleanup is REFUSED, never forced.
//      An unowned directory on disk is a finding; deleting a directory we cannot
//      prove is ours is a worse one.
//   3. If a mutation outcome is unknown, cleanup is refused (STOP+PRESERVE),
//      per the campaign safety rule. Unknown is the DEFAULT, so a caller has to
//      affirmatively state that the write outcome is known.
import { lstat, mkdtemp, rm, writeFile, readdir, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const LEDGER = process.env.VCP_FIXTURE_LEDGER || null;
const MARKER = '.vcp-owned-fixture.json';
const OWNED_PREFIXES = ['vcp-neg-', 'vcp-wid-', 'vcp-wa-', 'vcp-controlled-',
  'vcp-nrc-', 'vcp-m2-', 'la10-'];

// abs path -> token minted in THIS process. Survives nothing across processes,
// which is intended: a fixture created elsewhere is not ours to delete.
const CREATED_HERE = new Map();

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
  const abs = path.resolve(dir);
  const token = randomBytes(16).toString('hex');
  const record = {
    path: abs, prefix, createdAt: new Date().toISOString(),
    pid: process.pid, platform: process.platform, token,
  };
  CREATED_HERE.set(abs, token);
  await writeFile(path.join(abs, MARKER), JSON.stringify(record) + '\n', { mode: 0o600 });
  await ledger({ event: 'created', ...record });
  return { dir, record };
}

// Proves ownership BEFORE deleting. Returns {removed, reason}.
// `mutationOutcome` must be the string 'known' for cleanup to be allowed;
// anything else (including the default) preserves the directory as evidence.
// `holderPid`, when supplied, names a process that may still be writing here: the
// delete is refused unless its liveness is proven DEAD. A probe that could not run
// reports UNKNOWN, and UNKNOWN must never be read as "the process finished".
export async function removeOwnedFixture(dir, {
  mutationOutcome = 'unknown', holderPid = null,
} = {}) {
  const abs = path.resolve(dir);
  const deny = async (reason) => {
    await ledger({ event: 'cleanup-refused', path: abs, reason });
    return { removed: false, reason };
  };
  if (mutationOutcome !== 'known') return deny(`UNKNOWN_MUTATION_OUTCOME:${mutationOutcome}`);
  if (holderPid !== null && holderPid !== undefined) {
    const { LIVENESS, processLiveness } = await import('./child-kill.mjs');
    const { state, detail } = processLiveness(holderPid);
    if (state !== LIVENESS.DEAD) return deny(`POSSIBLY_LIVE_HOLDER:${state}:${detail}`);
  }
  if (!withinTemp(abs)) return deny('OUTSIDE_TEMP_DIR');
  const base = path.basename(abs);
  if (!OWNED_PREFIXES.some((p) => base.startsWith(p)))
    return deny(`UNOWNED_PREFIX:${base}`);
  if (!CREATED_HERE.has(abs)) return deny('NOT_CREATED_BY_THIS_PROCESS');
  let marker;
  try {
    marker = JSON.parse(await readFile(path.join(abs, MARKER), 'utf8'));
  } catch { return deny('NO_OWNERSHIP_MARKER'); }
  if (marker.path !== abs) return deny('MARKER_PATH_MISMATCH');
  // The token is never written by anyone but createOwnedFixture in this process,
  // so a planted or swapped marker cannot authorize the delete.
  if (marker.token !== CREATED_HERE.get(abs)) return deny('OWNERSHIP_TOKEN_MISMATCH');
  // Refuse to delete anything that contains a real repository or managed state
  // belonging to a project, regardless of ownership. A top-level-only check left
  // `payload/.git` unprotected, so the scan is bounded-recursive and refuses on
  // overflow rather than skipping the question.
  let entries;
  try {
    entries = await readdir(abs, { recursive: true });
  } catch { return deny('CONTENTS_UNREADABLE'); }
  if (entries.length > 5000) return deny(`TOO_MANY_ENTRIES_TO_VERIFY:${entries.length}`);
  if (entries.some((e) => String(e).split(/[\\/]/).includes('.git')))
    return deny('CONTAINS_GIT_DIR');
  await rm(abs, { recursive: true, force: true });
  CREATED_HERE.delete(abs);
  await ledger({ event: 'removed', path: abs, at: new Date().toISOString() });
  return { removed: true, reason: null };
}

// Runs a body with cleanup that refuses unless ownership AND outcome are proven.
// `makeDir` must return the dir path.
//
// The default is 'unknown' — auto-cleanup is OPT-IN. A caller that passes
// `mutationOutcome: 'known'` is asserting its writes stayed inside the fixture;
// nothing here can verify that assertion, so it must be made explicitly rather
// than inherited from a wrapper default. A body that THROWS is downgraded to
// 'unknown' regardless, so a failed test always preserves evidence.
export async function withOwnedFixture(makeDir, fn, { mutationOutcome = 'unknown' } = {}) {
  const created = await makeDir();
  const dir = typeof created === 'string' ? created : created.dir;
  let bodyThrew = true;
  try {
    const out = await fn(dir, created);
    bodyThrew = false;
    return out;
  } finally {
    const r = await removeOwnedFixture(dir, {
      mutationOutcome: bodyThrew ? 'unknown' : mutationOutcome,
    });
    if (!r.removed) {
      // Loud, but does not throw over the real test failure.
      console.error(`FIXTURE PRESERVED (not cleaned) ${dir}: ${r.reason}`);
    }
  }
}

export async function fixtureExists(dir) {
  try { await lstat(dir); return true; } catch { return false; }
}
