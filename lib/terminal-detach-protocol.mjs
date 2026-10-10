// Stage 12 terminal detach protocol (Linux).
//
// Splits the "move .vcp to a forensic archive" operation into resumable,
// idempotent steps so crash injection can be tested at every boundary:
//   1. verifyDetachPreconditions  (pure checks; no writes)
//   2. performDetachMove           (single native no-replace rename)
//   3. acknowledgeDetach            (parent syncs + identity re-verification)
//
// Resume semantics:
//   * Crash before step 2: nothing moved; re-running starts clean.
//   * Crash after step 2, before step 3: the archive exists at the
//     destination and the source is gone. Re-running DETECTS this
//     "detached-evidence" state and completes step 3 WITHOUT re-moving
//     or deleting anything.
//   * Crash after step 3: re-running is a no-op success (idempotent).
//   * A destination collision is never replaced: E_FS_DESTINATION_EXISTS.
//
// The archive NEVER auto-deletes and no user-owned path is ever removed
// here. Retention/pruning lives in lib/terminal-archive-retention.mjs and
// is never invoked implicitly.
import { createHash, randomBytes } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { planNoReplaceMove, moveDirectoryNoReplace } from './native-no-replace.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(code, detail) {
  const e = new Error(code + (detail ? ': ' + detail : ''));
  e.code = code;
  throw e;
}

// Reserved in-root archive name. Planners must treat this prefix as
// retired evidence (read-only), never as live control state.
export const RETIRED_ARCHIVE_PREFIX = '.vcp-recovery-retired-';
export function buildArchiveName({ backupId, inRoot = true, basename = '' }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(backupId ?? ''))
    fail('E_TERMINAL_ARCHIVE_IDENTITY');
  const suffix = backupId + '-' + randomBytes(20).toString('hex');
  if (inRoot) return RETIRED_ARCHIVE_PREFIX + suffix;
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(basename)) fail('E_TERMINAL_PARENT_SCOPE');
  return '.' + basename + '.vcp-recovery-retired-' + suffix;
}
export function isRetiredArchiveName(name) {
  return typeof name === 'string' &&
    new RegExp('^' + RETIRED_ARCHIVE_PREFIX.replace(/\./g, '\\.') +
      '[A-Za-z0-9][A-Za-z0-9._-]{0,127}-[a-f0-9]{40}$').test(name);
}

// Step 1: pure preconditions. Returns the exact plan the move will use.
// Throws on: missing/corrupt journal+lock bundle, unexpected state names,
// destination collision (checked again atomically by the OS in step 2),
// lock token mismatch, or a pre-existing detached archive for this backup.
export async function verifyDetachPreconditions({
  root, expectedJournalHash, ownedLock, archiveName,
  siblingScopeApproval = null,
} = {}) {
  const base = path.resolve(root);
  if (!ownedLock || ownedLock.root !== base || typeof ownedLock.token !== 'string')
    fail('E_TERMINAL_LOCK_UNPROVEN');
  if (!/^[a-f0-9]{64}$/.test(expectedJournalHash ?? ''))
    fail('E_TERMINAL_JOURNAL_CHANGED');
  const state = path.join(base, '.vcp');
  const inRoot = !archiveName.startsWith('.') || archiveName.startsWith(RETIRED_ARCHIVE_PREFIX);
  const destination = inRoot
    ? path.join(base, archiveName)
    : path.join(path.dirname(base), archiveName);
  if (siblingScopeApproval === null && !inRoot)
    fail('E_TERMINAL_SIBLING_SCOPE_APPROVAL_REQUIRED');
  if (siblingScopeApproval !== null && !inRoot)
    validateSiblingApproval(siblingScopeApproval, { root: base, destination });
  const plan = planNoReplaceMove({ source: state, destination, root: base });
  if (plan.scope === 'sibling' && siblingScopeApproval === null)
    fail('E_TERMINAL_SIBLING_SCOPE_APPROVAL_REQUIRED');
  // State shape checks (read-only).
  const [rootEntries, stateNames, journalBytes, lockBytes] = await Promise.all([
    readdir(base),
    readdir(state),
    readBounded(path.join(state, 'transaction.json'), 512 * 1024),
    readBounded(path.join(state, 'update.lock'), 4096),
  ]);
  // No foreign content may appear at the selected root during terminal
  // cleanup: only the live control dir and retired evidence archives.
  for (const entry of rootEntries) {
    if (entry !== '.vcp' && !isRetiredArchiveName(entry))
      fail('E_TERMINAL_FOREIGN_CONTENT', entry);
  }
  const names = [...stateNames].sort();
  if (names.length !== 2 || names[0] !== 'transaction.json' || names[1] !== 'update.lock')
    fail('E_TERMINAL_CONTROL_RESIDUE');
  if (digest(journalBytes) !== expectedJournalHash) fail('E_TERMINAL_JOURNAL_CHANGED');
  let lockRecord;
  try { lockRecord = JSON.parse(lockBytes.toString('utf8')); }
  catch { fail('E_TERMINAL_LOCK_UNPROVEN'); }
  if (lockRecord?.token !== ownedLock.token) fail('E_TERMINAL_LOCK_UNPROVEN');
  const original = await lstat(state);
  if (!original.isDirectory() || original.isSymbolicLink())
    fail('E_TERMINAL_STATE_OWNER');
  // Destination pre-check is advisory only: the OS enforces non-existence
  // atomically inside renameat2. A collision here is reported early.
  let collision = false;
  try { await lstat(destination); collision = true; }
  catch (e) { if (e?.code !== 'ENOENT') throw e; }
  if (collision) fail('E_TERMINAL_ARCHIVE_COLLISION');
  return Object.freeze({
    root: base, source: state, destination, scope: plan.scope,
    journalHash: expectedJournalHash,
    lockToken: ownedLock.token,
    sourceIdentity: Object.freeze({ dev: original.dev, ino: original.ino }),
    plan,
  });
}

function validateSiblingApproval(approval, { root, destination }) {
  if (!approval || typeof approval !== 'object' ||
      approval.scope !== 'sibling-archive-write' ||
      approval.root !== root || approval.destination !== destination ||
      typeof approval.approvedBy !== 'string' || !approval.approvedBy ||
      typeof approval.reason !== 'string' || !approval.reason)
    fail('E_TERMINAL_SIBLING_SCOPE_APPROVAL_REQUIRED');
}

// Step 2: the single native no-replace move. Idempotent resume: if the
// source is already gone AND the destination holds the pinned identity,
// the move already happened (crash between step 2 and 3) and this step
// reports {alreadyDetached:true} without touching anything.
export async function performDetachMove(verified) {
  const { root, source, destination, sourceIdentity, lockToken } = verified;
  let sourceGone = false;
  try { await lstat(source); }
  catch (e) {
    if (e?.code === 'ENOENT') sourceGone = true;
    else throw e;
  }
  if (sourceGone) {
    const at = await lstat(destination);
    if (!at.isDirectory() || at.isSymbolicLink() ||
        at.dev !== sourceIdentity.dev || at.ino !== sourceIdentity.ino)
      fail('E_TERMINAL_DETACH_AMBIGUOUS');
    return { alreadyDetached: true, destination };
  }
  // Re-verify the lock immediately before the move: a lock change between
  // verification and the move aborts the detach (fail closed).
  if (typeof lockToken === 'string') {
    let current;
    try {
      current = JSON.parse((await readBounded(
        path.join(source, 'update.lock'), 4096)).toString('utf8'));
    } catch { fail('E_TERMINAL_LOCK_UNPROVEN'); }
    if (current?.token !== lockToken) fail('E_TERMINAL_LOCK_CHANGED');
  }
  try {
    await moveDirectoryNoReplace({ source, destination, root });
  } catch (e) {
    if (e?.code === 'E_FS_DESTINATION_EXISTS')
      fail('E_TERMINAL_ARCHIVE_COLLISION');
    throw e;
  }
  return { alreadyDetached: false, destination };
}

// Step 3: acknowledge the detach. Syncs the affected parents (root always;
// the grandparent too for sibling scope) and re-verifies that the archive
// at the destination is the pinned source identity. Never unlinks the old
// path: after a successful move that path is either gone or occupied by
// something else, and unlinking it would be unsafe.
export async function acknowledgeDetach(verified, { provider = null } = {}) {
  const { root, source, destination, sourceIdentity, scope } = verified;
  const { LinuxFsProvider } = await import('./linux-fs-provider.mjs');
  const prov = provider ?? new LinuxFsProvider();
  await prov.syncDirectory(root, '.');
  if (scope === 'sibling') {
    const parent = path.dirname(root);
    await prov.syncDirectory(parent, '.');
  }
  const at = await lstat(destination);
  if (!at.isDirectory() || at.isSymbolicLink() ||
      at.dev !== sourceIdentity.dev || at.ino !== sourceIdentity.ino)
    fail('E_TERMINAL_ARCHIVE_UNVERIFIED');
  let sourceEntries = null;
  try { sourceEntries = await readdir(source); }
  catch (e) { if (e?.code !== 'ENOENT') throw e; }
  // sourceEntries===null means the source name is gone (expected).
  // If it exists again, someone recreated it: report, do not delete.
  return Object.freeze({
    detached: true, destination,
    sourceNameAbsent: sourceEntries === null,
    sourceRecreated: sourceEntries !== null,
    parentsSynced: true,
  });
}

async function readBounded(file, maxBytes) {
  const { open } = await import('node:fs/promises');
  const { constants } = await import('node:fs');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const st = await handle.stat();
    if (!st.isFile() || st.size > maxBytes) fail('E_TERMINAL_READ_BOUNDS');
    const buf = Buffer.alloc(Number(st.size));
    await handle.read(buf, 0, buf.length, 0);
    const after = await handle.stat();
    if (after.ino !== st.ino || after.size !== st.size) fail('E_TERMINAL_READ_RACE');
    return buf;
  } finally { await handle.close(); }
}
