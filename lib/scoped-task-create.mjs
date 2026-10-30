// Caller-scoped exclusive Task Pack creation for eligible non-managed
// projects (SC-01, Linux only). This module is reachable only through
// Task Pack creation (lib/task.mjs, create-new-file branch). It creates
// exactly one file, docs/tasks/<slug>.md, and never creates managed
// state: no .vcp entry, no manifest, no lock, no backup, no AGENTS.md
// write, no lifecycle-lock acquisition. It does not call the managed
// migration gate and must never be used to bypass it: eligibility
// refusals detected before any mutation fall through to the gated
// helper in the caller; failures after a mutation keep their original
// error and are never retried through a second creation attempt.
// A final root-state re-check runs after parent preparation and
// immediately before the exclusive open (OD-R3, extended by
// OD-STRAYS): it re-runs the full E4 root-state validation —
// .vcp, root manifest/lock/recovery strays, and adoption markers —
// not .vcp alone. It narrows, but does not atomically eliminate,
// the final check-to-open race for any of those entries.
// Durability preflight restricts this operation to Linux; there is no
// Windows fallback. See docs/SC-01-ENGINEERING-AUTHORIZATION.md.
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rmdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory, assertLifecycleDurabilitySupported } from './file-durability.mjs';

const MAX_BYTES = 8 * 1024 * 1024;
const SCOPE_RE = /^docs\/tasks\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const ADOPTION_MARKER_RE = /^\.vcp-adoption-/;
const PARENT_SEGMENTS = ['docs', 'tasks'];

function fail(code, reason, phase) {
  const error = new Error(reason ? `${code}: ${reason}` : code);
  error.code = code;
  if (phase) error.scopedPhase = phase;
  return error;
}

async function lstatOrNull(file) {
  try { return await lstat(file, { bigint: true }); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}

async function pinAncestors(root) {
  const pins = [];
  let current = root;
  for (;;) {
    const info = await lstatOrNull(current);
    if (!info) throw fail('E_SCOPED_NAMESPACE_CHANGED', `ancestor missing: ${current}`, 'pre-mutation');
    if (info.isSymbolicLink()) throw fail('E_SCOPED_NAMESPACE_CHANGED', `symlinked ancestor: ${current}`, 'pre-mutation');
    if (!info.isDirectory()) throw fail('E_SCOPED_NAMESPACE_CHANGED', `ancestor not a directory: ${current}`, 'pre-mutation');
    pins.push({ path: current, dev: info.dev, ino: info.ino });
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return pins;
}

async function verifyPins(pins, phase) {
  for (const pin of pins) {
    const info = await lstatOrNull(pin.path);
    if (!info || info.dev !== pin.dev || info.ino !== pin.ino ||
        info.isSymbolicLink() || !info.isDirectory()) {
      throw fail('E_SCOPED_NAMESPACE_CHANGED', `identity changed: ${pin.path}`, phase);
    }
  }
}

const ROOT_STRAY_NAMES = ['manifest.json', 'update.lock', 'transaction.json'];

// E4 root-state validation, shared by the early checks and the final
// pre-open re-check (OD-STRAYS). The marker set, the typed codes, and
// the refusal priority (.vcp, then root strays in fixed order, then
// adoption markers) are identical in both modes; only the message
// wording and the phase differ. Early calls use the default
// (pre-mutation, "exists"/"present" wording) and are unchanged. The
// final call passes late: true with the phase derived from mutation
// state, and uses "appeared during creation" wording so a late
// refusal is distinguishable from an early one by exact message.
// The readdir listing is cross-checked against the four lstat'd
// names: an entry appearing between its lstat and the readdir is
// still refused, because it was present during this check. An entry
// appearing after the readdir remains in the check-to-open residual
// micro-window, which this check narrows but does not eliminate.
// All observations use lstat (no-follow) or a directory listing;
// no entry is followed, read, or modified.
async function refuseManagedState(root, { late = false, phase = 'pre-mutation' } = {}) {
  const state = await lstatOrNull(path.join(root, '.vcp'));
  if (state) {
    throw fail('E_SCOPED_MANAGED_STATE_PRESENT',
      late ? '.vcp entry appeared during creation' : '.vcp entry exists', phase);
  }
  for (const name of ROOT_STRAY_NAMES) {
    const entry = await lstatOrNull(path.join(root, name));
    if (entry) {
      throw fail('E_SCOPED_RECOVERY_STATE_PRESENT',
        late ? `unexpected root entry appeared during creation: ${name}` : `unexpected root entry: ${name}`, phase);
    }
  }
  const entries = await readdir(root);
  const listed = new Set(entries);
  if (listed.has('.vcp')) {
    throw fail('E_SCOPED_MANAGED_STATE_PRESENT',
      late ? '.vcp entry appeared during creation' : '.vcp entry exists', phase);
  }
  for (const name of ROOT_STRAY_NAMES) {
    if (listed.has(name)) {
      throw fail('E_SCOPED_RECOVERY_STATE_PRESENT',
        late ? `unexpected root entry appeared during creation: ${name}` : `unexpected root entry: ${name}`, phase);
    }
  }
  for (const name of entries) {
    if (ADOPTION_MARKER_RE.test(name)) {
      throw fail('E_SCOPED_RECOVERY_STATE_PRESENT',
        late ? `adoption marker appeared during creation: ${name}` : `adoption marker present: ${name}`, phase);
    }
  }
}

async function cleanupParents(created, pins) {
  const leftover = [];
  for (const dir of [...created].reverse()) {
    const pin = pins.get(dir);
    const info = await lstatOrNull(dir).catch(() => null);
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory() ||
        (pin && (info.dev !== pin.dev || info.ino !== pin.ino))) {
      leftover.push({ dir, reason: 'identity-changed' });
      continue;
    }
    try { await rmdir(dir); }
    catch (error) { leftover.push({ dir, reason: error?.code ?? 'rmdir-failed' }); }
  }
  return { attempted: created.length, leftover };
}

export async function createScopedTaskFile(rootPath, relative, bytes) {
  if (typeof rootPath !== 'string' || !rootPath) throw new TypeError('rootPath must be a non-empty string');
  if (typeof relative !== 'string' || !SCOPE_RE.test(relative)) {
    throw fail('E_SCOPED_SCOPE', `refusing out-of-scope relative path: ${String(relative)}`, 'pre-mutation');
  }
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) {
    throw fail('E_SCOPED_BYTES', 'task content must be a Buffer of at most 8 MiB', 'pre-mutation');
  }
  const root = path.resolve(rootPath);
  let mutated = false;
  let createdFile = null;
  const createdParents = [];
  const parentPins = new Map();
  try {
    // E8: durability preflight first — fail closed before any mutation.
    // On non-Linux platforms this throws E_DIRECTORY_SYNC_UNPROVEN.
    await assertLifecycleDurabilitySupported(root);
    // E1: default-deny classification. No bootstrap-lock exception:
    // inspectProject is called with default options only.
    const inspected = await inspectProject(root);
    if (inspected.classification !== 'NEW' && inspected.classification !== 'EXISTING') {
      throw fail('E_SCOPED_INELIGIBLE_STATE',
        `classification ${inspected.classification}${inspected.reason ? ` (${inspected.reason})` : ''}`, 'pre-mutation');
    }
    const classification = inspected.classification;
    // E5: pin root + ancestors, and pin any existing parent components.
    const pins = await pinAncestors(root);
    let current = root;
    for (const segment of PARENT_SEGMENTS) {
      current = path.join(current, segment);
      const info = await lstatOrNull(current);
      if (!info) continue;
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw fail('E_SCOPED_PARENT_UNSAFE', `unsafe parent component: ${current}`, 'pre-mutation');
      }
      parentPins.set(current, { dev: info.dev, ino: info.ino });
    }
    // E2–E4: no managed, recovery, or lock state.
    await refuseManagedState(root);
    // Re-validate immediately before creation: identities, state
    // absence, destination safety, durability. A CLI-level check
    // alone is insufficient; this runs inside the write operation.
    await verifyPins(pins, 'pre-mutation');
    await refuseManagedState(root);
    await assertLifecycleDurabilitySupported(root);
    let target;
    try {
      target = await resolveProjectPath(root, relative, { purpose: 'write-new' });
    } catch (error) {
      if (error?.code === 'E_VCP_PATH' && /DESTINATION_EXISTS/.test(error.message)) {
        throw fail('E_SCOPED_ALREADY_EXISTS', `destination already exists: ${relative}`, 'pre-mutation');
      }
      throw error;
    }
    // Parent loop: validate each existing parent, create missing
    // parents one at a time. EEXIST from a concurrent creator is
    // re-verified, never trusted as success.
    current = root;
    for (const segment of PARENT_SEGMENTS) {
      current = path.join(current, segment);
      let info = await lstatOrNull(current);
      if (info) {
        if (info.isSymbolicLink() || !info.isDirectory()) {
          throw fail('E_SCOPED_PARENT_UNSAFE', `unsafe parent component: ${current}`, 'pre-mutation');
        }
        const pinned = parentPins.get(current);
        if (pinned && (pinned.dev !== info.dev || pinned.ino !== info.ino)) {
          throw fail('E_SCOPED_NAMESPACE_CHANGED', `parent identity changed: ${current}`, 'pre-mutation');
        }
        parentPins.set(current, { dev: info.dev, ino: info.ino });
        continue;
      }
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        info = await lstatOrNull(current);
        if (!info || info.isSymbolicLink() || !info.isDirectory()) {
          throw fail('E_SCOPED_PARENT_UNSAFE', `parent race produced unsafe entry: ${current}`, 'pre-mutation');
        }
        parentPins.set(current, { dev: info.dev, ino: info.ino });
        continue;
      }
      mutated = true;
      createdParents.push(current);
      await syncContainingDirectory(current);
      info = await lstatOrNull(current);
      if (!info || info.isSymbolicLink() || !info.isDirectory()) {
        throw fail('E_SCOPED_PARENT_UNSAFE', `created parent changed: ${current}`, 'post-mutation');
      }
      parentPins.set(current, { dev: info.dev, ino: info.ino });
    }
    // R-3 hardening (OD-R3), extended by OD-STRAYS: final root-state
    // re-check, as late as practical before the exclusive open and
    // after parent preparation. Re-runs the full E4 validation
    // (.vcp, root manifest/lock/recovery strays, adoption markers)
    // via the shared refuseManagedState helper, so a marker
    // appearing after the earlier checks (for example, created
    // while parent directories were prepared) refuses here with
    // its existing typed code. The check uses lstat (no-follow)
    // and a directory listing: any entry — directory, file,
    // symlink, or dangling symlink — refuses, and a non-ENOENT
    // lstat failure propagates fail-closed. This narrows the
    // late-marker window; it does not atomically eliminate the
    // final check-to-open interleaving, which remains a residual
    // micro-window for every covered entry. Phase follows
    // mutation state: if this operation already created a parent
    // directory, the refusal is post-mutation, so the caller's
    // catch path preserves cleanup and evidence and lib/task.mjs
    // does not fall through to the gate; otherwise it is
    // pre-mutation and falls through as usual.
    await refuseManagedState(root, {
      late: true,
      phase: mutated ? 'post-mutation' : 'pre-mutation',
    });
    // Exclusive creation: O_EXCL makes existence a single kernel
    // decision; O_NOFOLLOW refuses a swapped-in final symlink.
    // Mode is fixed on the new handle; never chmod after close.
    let handleIdentity = null;
    let fd;
    try {
      fd = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL |
        (constants.O_NOFOLLOW ?? 0), 0o644);
    } catch (error) {
      if (error?.code === 'EEXIST') {
        throw fail('E_SCOPED_ALREADY_EXISTS', `destination already exists: ${relative}`, mutated ? 'post-mutation' : 'pre-mutation');
      }
      throw error;
    }
    mutated = true;
    createdFile = target;
    try {
      handleIdentity = await fd.stat({ bigint: true });
      await fd.writeFile(bytes);
      await fd.sync();
    } finally { await fd.close(); }
    await syncContainingDirectory(target);
    // Post-sync re-verification: the created file must be the file
    // opened, and its parent must still be the pinned directory.
    // A mismatch is detected after the fact — it does not retroactively
    // prevent the write (see parent-swap residual, R-1). The file is
    // left in place as evidence and never silently removed.
    const after = await lstatOrNull(target);
    if (!after || after.dev !== handleIdentity.dev || after.ino !== handleIdentity.ino ||
        !after.isFile() || after.isSymbolicLink()) {
      throw fail('E_SCOPED_IDENTITY_CHANGED_AFTER_SYNC', `created file identity changed: ${relative}`, 'post-mutation');
    }
    await verifyPins(pins, 'post-mutation');
    for (const [dir, pin] of parentPins) {
      const info = await lstatOrNull(dir);
      if (!info || info.dev !== pin.dev || info.ino !== pin.ino ||
          info.isSymbolicLink() || !info.isDirectory()) {
        throw fail('E_SCOPED_NAMESPACE_CHANGED', `parent identity changed after sync: ${dir}`, 'post-mutation');
      }
    }
    return {
      file: target,
      relative,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      classification,
      predicate: 'SC-01/E1-E10'
    };
  } catch (error) {
    if (!mutated) {
      if (!error.scopedPhase) error.scopedPhase = 'pre-mutation';
      throw error;
    }
    const cleanup = await cleanupParents(createdParents, parentPins);
    if (!error.scopedPhase) error.scopedPhase = 'post-mutation';
    if (createdFile) error.scopedFile = createdFile;
    error.scopedCleanup = cleanup;
    throw error;
  }
}
