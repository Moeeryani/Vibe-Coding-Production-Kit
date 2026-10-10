// Stage 12 terminal archive retention policy.
//
// The forensic archive created by terminal retirement is evidence. It is
// NEVER deleted automatically: there is no background garbage collector,
// no TTL sweep, and no implicit prune path anywhere in Stage 12.
//
// Explicit pruning is possible only through executeArchivePrune(), which
// requires:
//   1. an explicit operator approval object (approvedBy + reason +
//      exact archive names + their manifest digests),
//   2. re-verification of each archive's manifest immediately before
//      removal (name + journal hash + manifest digest must match),
//   3. minimum retention age (default 30 days),
//   4. symlink refusal at every level (provider-owned content only).
//
// planArchivePrune() is read-only and never authorizes removal.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { LinuxFsProvider } from './linux-fs-provider.mjs';
import { isRetiredArchiveName, RETIRED_ARCHIVE_PREFIX } from './terminal-detach-protocol.mjs';

export const RETIREMENT_MANIFEST_NAME = 'vcp-retirement-manifest.json';
export const RETENTION_POLICY = Object.freeze({
  neverAutoDelete: true,
  minAgeMs: 30 * 24 * 3600 * 1000,
  requireExplicitApproval: true,
  backgroundSweeps: 0,
});

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(code, detail) {
  const e = new Error(code + (detail ? ': ' + detail : ''));
  e.code = code;
  throw e;
}

// Forensic index written into the archive right after detach, via the
// durability provider (exclusive create + data sync + parent sync).
export async function writeArchiveManifest(archiveDir, {
  journalSha256, lockTokenSha256, backupId, rootIdentity, scope,
  provider = null,
} = {}) {
  const prov = provider ?? new LinuxFsProvider();
  if (!/^[a-f0-9]{64}$/.test(journalSha256 ?? ''))
    fail('E_ARCHIVE_MANIFEST_INPUT');
  const manifest = {
    kind: 'vcp-retirement-manifest',
    version: 1,
    backupId: backupId ?? null,
    journalSha256,
    lockTokenSha256: lockTokenSha256 ?? null,
    scope: scope ?? 'in-root',
    rootIdentity: rootIdentity ?? null,
    retiredAtUtc: new Date().toISOString(),
    retentionPolicy: { ...RETENTION_POLICY },
    note: 'Evidence bundle: journal + owned lock preserved as one unit. ' +
      'Never auto-deleted; see lib/terminal-archive-retention.mjs.',
  };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  // The archive dir itself is the provider root here: manifest is created
  // exclusively at its top level.
  const receipt = await prov.writeFileSynced(
    archiveDir, RETIREMENT_MANIFEST_NAME, bytes, 0o600);
  if (receipt.dataSynced !== true || receipt.directorySynced !== true)
    fail('E_ARCHIVE_MANIFEST_NOT_DURABLE');
  return { manifestSha256: sha(bytes), bytes: bytes.length };
}

export async function readArchiveManifest(root, archiveName, { provider = null } = {}) {
  const prov = provider ?? new LinuxFsProvider();
  if (!isRetiredArchiveName(archiveName)) fail('E_ARCHIVE_NAME');
  const abs = path.resolve(root);
  // The archive itself must be a real directory, never a symlink.
  const id = await prov.statIdentity(abs, archiveName);
  if (id.type !== 'dir') fail('E_ARCHIVE_NOT_A_DIRECTORY', archiveName);
  const { readFile } = await import('node:fs/promises');
  const full = path.join(abs, archiveName, RETIREMENT_MANIFEST_NAME);
  let bytes;
  try { bytes = await readFile(full); }
  catch (e) { fail('E_ARCHIVE_MANIFEST_UNREADABLE', e.code ?? ''); }
  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); }
  catch { fail('E_ARCHIVE_MANIFEST_MALFORMED'); }
  if (manifest?.kind !== 'vcp-retirement-manifest' ||
      !/^[a-f0-9]{64}$/.test(manifest.journalSha256 ?? ''))
    fail('E_ARCHIVE_MANIFEST_MALFORMED');
  return { manifest, manifestSha256: sha(bytes) };
}

// Read-only prune planning. Returns candidates with their verified
// manifests; never authorizes removal.
export async function planArchivePrune(root, {
  olderThanMs = RETENTION_POLICY.minAgeMs,
  nowMs = Date.now(),
  provider = null,
} = {}) {
  const prov = provider ?? new LinuxFsProvider();
  const abs = path.resolve(root);
  const listed = await prov.listNames(abs, '.');
  const candidates = [];
  const skipped = [];
  for (const name of listed.names ?? []) {
    if (!isRetiredArchiveName(name)) continue;
    let entry;
    try {
      entry = await readArchiveManifest(abs, name, { provider: prov });
    } catch (e) {
      skipped.push({ name, code: e.code ?? 'E_ARCHIVE_MANIFEST_UNREADABLE' });
      continue;
    }
    const retiredAt = Date.parse(entry.manifest.retiredAtUtc ?? '');
    const ageMs = Number.isFinite(retiredAt) ? nowMs - retiredAt : -1;
    if (ageMs >= 0 && ageMs >= olderThanMs)
      candidates.push({ name, manifestSha256: entry.manifestSha256, ageMs });
    else skipped.push({ name, code: 'E_ARCHIVE_RETENTION_NOT_MET', ageMs });
  }
  return Object.freeze({
    root: abs, readOnly: true, writeAuthorized: false,
    policy: { ...RETENTION_POLICY },
    candidates: Object.freeze(candidates),
    skipped: Object.freeze(skipped),
  });
}

// Explicit, approval-bound prune. Removes ONLY archives whose name and
// manifest digest re-verify at execution time. Symlinks or unexpected
// entry types abort the whole prune (fail closed, nothing half-removed
// is reported as success).
export async function executeArchivePrune(root, {
  archives, approval, provider = null,
} = {}) {
  const prov = provider ?? new LinuxFsProvider();
  validatePruneApproval(approval);
  if (!Array.isArray(archives) || !archives.length) fail('E_PRUNE_INPUT');
  const abs = path.resolve(root);
  const removed = [];
  for (const item of archives) {
    if (!item || !isRetiredArchiveName(item.name) ||
        !/^[a-f0-9]{64}$/.test(item.manifestSha256 ?? ''))
      fail('E_PRUNE_INPUT');
    if (!approval.archives.some(a =>
      a.name === item.name && a.manifestSha256 === item.manifestSha256))
      fail('E_PRUNE_NOT_APPROVED', item.name);
    // Re-verify immediately before removal: the approved manifest must be
    // exactly what is on disk, otherwise abort.
    let current;
    try {
      current = await readArchiveManifest(abs, item.name, { provider: prov });
    } catch {
      fail('E_PRUNE_MANIFEST_CHANGED', item.name);
    }
    if (current.manifestSha256 !== item.manifestSha256)
      fail('E_PRUNE_MANIFEST_CHANGED', item.name);
    await removeOwnedTree(prov, abs, item.name);
    removed.push(item.name);
  }
  await prov.syncDirectory(abs, '.');
  return Object.freeze({ pruned: Object.freeze(removed), root: abs });
}

function validatePruneApproval(approval) {
  if (!approval || typeof approval !== 'object' ||
      typeof approval.approvedBy !== 'string' || !approval.approvedBy ||
      typeof approval.reason !== 'string' || !approval.reason ||
      !Array.isArray(approval.archives) || !approval.archives.length)
    fail('E_PRUNE_APPROVAL_REQUIRED');
}

async function removeOwnedTree(prov, abs, rel) {
  // Bounded recursive removal of provider-created evidence ONLY:
  // every entry must be a regular file or directory; any symlink,
  // socket, fifo or device aborts the prune.
  const listed = await prov.listNames(abs, rel);
  for (const name of [...(listed.names ?? [])].sort().reverse()) {
    const child = rel + '/' + name;
    const id = await prov.statIdentity(abs, child);
    if (id.type === 'symlink') fail('E_PRUNE_SYMLINK_REFUSED', child);
    if (id.type === 'dir') await removeOwnedTree(prov, abs, child);
    else if (id.type === 'file') await prov.deleteFile(abs, child);
    else fail('E_PRUNE_UNEXPECTED_TYPE', child + ':' + id.type);
  }
  await prov.removeEmptyDirectory(abs, rel);
}
