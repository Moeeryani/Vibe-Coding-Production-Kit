// Stage 12 D-01 Linux legacy-writer fence (OS-enforced).
//
// What this module is: a real Linux enforcement mechanism that makes the
// kernel — not JavaScript — deny the published 0.9.3 CLI write access to
// protected project state. It does NOT pretend that same-UID DAC can
// separate two programs: enforceLegacyFence() performs a privileged
// ownership transfer to a distinct writer UID:GID, so the legacy principal
// (the invoking user the old CLI runs as) receives EACCES from the kernel
// on every protected write/unlink/rename-inside.
//
// Backends:
//   'uid-separation'  chown -R writerUid:writerGid + 0750/0640 modes.
//                     Provable in this sandbox (chown works as uid 0).
//   'immutable'       FS_IMMUTABLE_FL via the native helper on top of
//                     uid-separation. The kernel then denies even rename of
//                     the protected directory itself through a writable
//                     parent (closes the parent-rename hole). Requires
//                     CAP_LINUX_IMMUTABLE at enforce time; where the
//                     capability is absent the backend reports
//                     E_FENCE_IMMUTABLE_UNAVAILABLE instead of pretending.
//
// What this module is NOT:
//   * It cannot stop the old CLI executed AS the writer principal or as
//     root/CAP_DAC_OVERRIDE. That residual risk is reported, never hidden,
//     and is why D-01 stays DEFERRED without MAC + owner approval.
//   * Enforcement needs privilege (euid 0 or CAP_CHOWN). Without it the
//     module throws E_FENCE_PRIVILEGE_REQUIRED and names the exact
//     contract change required. It never reports success it did not earn.
//   * This module never enables schema-v2 migration writes; the managed
//     gate (managedV2MutationAuthorized=false) is untouched.
//
// Protected set: the caller names explicit relative paths (default:
// '.vcp' plus caller-supplied managed files). Symlinks are refused.
// Parent directories are NOT re-owned: the fence verifies integrity
// instead (verifyLegacyFence detects moves/replacements and the new CLI
// must refuse to proceed on violation).
import { lstat, readdir, chmod, chown } from 'node:fs/promises';
import path from 'node:path';
import { LinuxFsProvider } from './linux-fs-provider.mjs';

const DIR_MODE = 0o750, FILE_MODE = 0o640;
const NAME_RE = /^[A-Za-z0-9._-]{1,128}$/;

function fail(code, detail) {
  const e = new Error(code + (detail ? ': ' + detail : ''));
  e.code = code;
  throw e;
}
function checkRelPath(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 1024)
    fail('E_FENCE_PATH');
  if (path.isAbsolute(rel)) fail('E_FENCE_PATH');
  const parts = rel.split('/');
  if (parts.length > 32 || parts.some(p => !NAME_RE.test(p) || p === '.' || p === '..'))
    fail('E_FENCE_PATH');
  return parts.join('/');
}

// Walk a protected tree without following symlinks. Returns entries as
// {rel, type:'dir'|'file', mode, uid, gid, immutable}.
async function inventoryTree(root, rels, provider) {
  const out = [];
  const seen = new Set();
  async function walk(rel) {
    const norm = checkRelPath(rel);
    if (seen.has(norm)) return;
    seen.add(norm);
    let id;
    try { id = await provider.statIdentity(root, norm); }
    catch (e) {
      if (e.code === 'E_FS_OS_ERROR') return; // absent: reported by caller
      throw e;
    }
    if (id.type === 'symlink') fail('E_FENCE_SYMLINK_REFUSED', norm);
    if (id.type !== 'dir' && id.type !== 'file')
      fail('E_FENCE_UNSUPPORTED_TYPE', norm + ':' + id.type);
    let immutable = false;
    try {
      const flags = await provider.getFlags(root, norm);
      immutable = flags.immutable === true;
    } catch { /* flags unsupported: recorded as false */ }
    out.push({
      rel: norm, type: id.type, mode: id.mode,
      uid: id.uid, gid: id.gid, immutable,
    });
    if (id.type === 'dir') {
      const listed = await provider.listNames(root, norm);
      for (const name of listed.names ?? []) await walk(norm + '/' + name);
    }
  }
  for (const rel of rels) await walk(rel);
  return out;
}

export function defaultProtectedPaths() {
  return ['.vcp'];
}

// Read-only plan: what WOULD be sealed, and its current kernel state.
export async function planLegacyFence(root, {
  protectedPaths = defaultProtectedPaths(),
  writerUid, writerGid,
  backend = 'uid-separation',
  provider = null,
} = {}) {
  const abs = path.resolve(root);
  const prov = provider ?? new LinuxFsProvider();
  const rels = protectedPaths.map(checkRelPath);
  const entries = await inventoryTree(abs, rels, prov);
  return Object.freeze({
    root: abs, backend,
    writerUid: writerUid ?? null, writerGid: writerGid ?? null,
    protectedPaths: Object.freeze(rels),
    entryCount: entries.length,
    entries: Object.freeze(entries.map(e => Object.freeze({ ...e }))),
    privileged: process.geteuid?.() === 0,
    readOnly: true,
  });
}

// Privileged enforcement. Transfers ownership of the protected tree to the
// writer principal and hardens modes; optionally sets the immutable bit.
// Throws E_FENCE_PRIVILEGE_REQUIRED without privilege — never fake success.
export async function enforceLegacyFence(root, {
  protectedPaths = defaultProtectedPaths(),
  writerUid, writerGid,
  backend = 'uid-separation',
  provider = null,
} = {}) {
  if (!Number.isSafeInteger(writerUid) || writerUid < 0 ||
      !Number.isSafeInteger(writerGid) || writerGid < 0)
    fail('E_FENCE_PRINCIPAL', 'writerUid/writerGid required');
  if (!['uid-separation', 'immutable'].includes(backend))
    fail('E_FENCE_BACKEND');
  if (process.geteuid?.() !== 0)
    fail('E_FENCE_PRIVILEGE_REQUIRED',
      'enforcement needs privilege (CAP_CHOWN); contract change required: ' +
      'isolated migration space with formal ownership transfer, owner approval');
  const abs = path.resolve(root);
  const prov = provider ?? new LinuxFsProvider();
  const rels = protectedPaths.map(checkRelPath);
  // Refuse to seal a tree that contains symlinks or non-regular entries.
  const before = await inventoryTree(abs, rels, prov);
  if (!before.length) fail('E_FENCE_NOTHING_TO_SEAL');
  const sealedSet = new Set(before.map(e => e.rel));
  for (const rel of rels) {
    if (!sealedSet.has(rel))
      fail('E_FENCE_PROTECTED_PATH_MISSING', rel);
  }
  const sealed = [];
  // Deepest first so directory modes don't block the walk.
  const ordered = [...before].sort((a, b) =>
    b.rel.split('/').length - a.rel.split('/').length);
  for (const entry of ordered) {
    const full = path.join(abs, entry.rel);
    const st = await lstat(full); // no-follow recheck before chown
    if (st.isSymbolicLink()) fail('E_FENCE_SYMLINK_REFUSED', entry.rel);
    await chown(full, writerUid, writerGid);
    await chmod(full, entry.type === 'dir' ? DIR_MODE : FILE_MODE);
    sealed.push(entry.rel);
  }
  // Re-own parents' entries in normal order for the receipt.
  const receiptEntries = [];
  for (const entry of before) {
    const id = await prov.statIdentity(abs, entry.rel);
    let immutable = false;
    if (backend === 'immutable') {
      try {
        const r = await prov.setImmutable(abs, entry.rel);
        immutable = r.immutable === true;
      } catch (e) {
        if (e.code === 'E_FS_OS_DENIED' || e.code === 'E_DIRECTORY_SYNC_UNSUPPORTED' ||
            e.code === 'E_FS_OS_ERROR') {
          // Roll back ownership change? No: report honestly instead.
          // The uid-separation part is already effective; immutable is
          // the unverifiable-here hardening.
          fail('E_FENCE_IMMUTABLE_UNAVAILABLE',
            'CAP_LINUX_IMMUTABLE missing: ' + (e.code ?? ''));
        }
        throw e;
      }
    }
    receiptEntries.push({
      rel: entry.rel, type: entry.type, uid: id.uid, gid: id.gid,
      mode: id.mode, immutable,
    });
  }
  // Fence the parent-rename hole note: the receipt pins the protected
  // root's own identity so verifyLegacyFence can detect a moved tree.
  const rootId = await prov.statIdentity(abs, '.vcp');
  return Object.freeze({
    root: abs, backend, writerUid, writerGid,
    protectedPaths: Object.freeze(rels),
    sealed: Object.freeze([...sealed].sort()),
    entries: Object.freeze(receiptEntries.map(e => Object.freeze({ ...e }))),
    protectedRootIdentity: Object.freeze({
      dev: rootId.dev, ino: rootId.ino, uid: rootId.uid, gid: rootId.gid,
    }),
    enforcedAtUtc: new Date().toISOString(),
    kernelDenialExpectation:
      'EACCES for the legacy principal on write/unlink/rename-inside; ' +
      'EPERM on rename of immutable entries (immutable backend)',
    residualRisks: Object.freeze([
      'old CLI executed AS the writer principal or root bypasses DAC ' +
      '(needs MAC confinement; UNPROVEN here)',
      'parent-rename of the protected dir via a writable parent is ' +
      'denied only by the immutable backend; uid-separation alone ' +
      'DETECTS it via verifyLegacyFence (integrity check)',
    ]),
  });
}

// Verify the fence is intact: ownership, modes, flags, and identity of the
// protected root. Any violation -> {intact:false, violations:[...]} and the
// caller must refuse managed operations.
export async function verifyLegacyFence(root, receipt, { provider = null } = {}) {
  const abs = path.resolve(root);
  const prov = provider ?? new LinuxFsProvider();
  const violations = [];
  if (!receipt || receipt.root !== abs) {
    violations.push({ code: 'E_FENCE_RECEIPT_MISMATCH' });
    return { intact: false, violations };
  }
  for (const expected of receipt.entries ?? []) {
    let id;
    try { id = await prov.statIdentity(abs, expected.rel); }
    catch (e) {
      violations.push({ code: 'E_FENCE_ENTRY_MISSING', rel: expected.rel });
      continue;
    }
    if (id.uid !== receipt.writerUid || id.gid !== receipt.writerGid)
      violations.push({ code: 'E_FENCE_OWNERSHIP_CHANGED', rel: expected.rel });
    const wantMode = expected.type === 'dir' ? DIR_MODE : FILE_MODE;
    if (id.mode !== wantMode)
      violations.push({ code: 'E_FENCE_MODE_CHANGED', rel: expected.rel });
    if (expected.immutable) {
      try {
        const flags = await prov.getFlags(abs, expected.rel);
        if (flags.immutable !== true)
          violations.push({ code: 'E_FENCE_IMMUTABLE_CLEARED', rel: expected.rel });
      } catch {
        violations.push({ code: 'E_FENCE_FLAGS_UNREADABLE', rel: expected.rel });
      }
    }
    if (id.type === 'symlink')
      violations.push({ code: 'E_FENCE_SYMLINK_REFUSED', rel: expected.rel });
  }
  // Detect the protected tree being moved aside and replaced.
  try {
    const cur = await prov.statIdentity(abs, '.vcp');
    const pin = receipt.protectedRootIdentity;
    if (pin && (cur.dev !== pin.dev || cur.ino !== pin.ino))
      violations.push({ code: 'E_FENCE_ROOT_REPLACED' });
  } catch {
    violations.push({ code: 'E_FENCE_ENTRY_MISSING', rel: '.vcp' });
  }
  return { intact: violations.length === 0, violations };
}

// Privileged, receipt-bound release (test cleanup / operational unseal).
// Only releases exactly what the receipt sealed; requires privilege.
export async function releaseLegacyFence(root, receipt, { provider = null } = {}) {
  if (process.geteuid?.() !== 0) fail('E_FENCE_PRIVILEGE_REQUIRED');
  const abs = path.resolve(root);
  if (!receipt || receipt.root !== abs) fail('E_FENCE_RECEIPT_MISMATCH');
  const prov = provider ?? new LinuxFsProvider();
  const entries = [...(receipt.entries ?? [])].sort((a, b) =>
    a.rel.split('/').length - b.rel.split('/').length);
  for (const entry of entries) {
    const full = path.join(abs, entry.rel);
    try {
      if (entry.immutable) await prov.clearImmutable(abs, entry.rel);
    } catch { /* best effort; chown/chmod below still restore access */ }
    try { await lstat(full); } catch { continue; }
    await chown(full, 0, 0);
    await chmod(full, entry.type === 'dir' ? 0o755 : 0o644);
  }
  return { released: true, root: abs, count: entries.length };
}
