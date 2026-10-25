// Phase N+3 (R-2/§4): staging provenance registry.
//
// The Phase N+2 validation determined that reapStaging proves
// namespace + stat-to-unlink continuity but NOT original ownership
// of a staging artifact: a filename matching the staging pattern is
// not proof the writer created the file. This module is the
// ownership contract for recovery-controlled artifacts:
//
//   - When a transaction stages an artifact, it records
//     {name, transactionId, dev, ino} in .vcp/staging-provenance.json
//     through the anchored provider (the registry file itself is
//     written with replaceFileAtomic).
//   - Recovery cleanup deletes ONLY artifacts whose current identity
//     still matches a registry entry for a transaction being
//     recovered. Identity mismatch -> reported, never deleted.
//   - Artifacts with no registry entry are NEVER deleted by recovery;
//     they can only be listed as unknown-provenance for a human or a
//     higher authority to disposition.
//
// The registry requires the secure provider (it is a security
// record, not a convenience cache): when the helper is unavailable
// the recording call fails closed. Callers hold the lifecycle lock
// while mutating the registry, so no additional locking is done here.
import path from 'node:path';
import { selectSecureWriterProvider,
  secureWriterProviderStatus } from './secure-fs-provider.mjs';

export const PROVENANCE_FILE = '.vcp/staging-provenance.json';
const MAX_ENTRIES = 4096;

function fail(code, message) {
  // Message carries the code (codebase convention: code-as-message
  // in versioned-journal's reject()), so regex-based assertions and
  // logs see the classification, not only the .code property.
  const error = new Error(message ? `${code}: ${message}` : code);
  error.code = code;
  throw error;
}

function providerOrFail() {
  const status = secureWriterProviderStatus();
  if (status.provider !== 'linux-native' || !status.helper.present)
    fail('E_PROVENANCE_PROVIDER_UNAVAILABLE',
      'staging provenance requires the secure native provider');
  return selectSecureWriterProvider(); // present-but-invalid throws
}

async function readRegistry(root, provider) {
  const anchor = await provider.anchorIdentities(root, '.vcp');
  try {
    const doc = await provider.readFileVerified(root, PROVENANCE_FILE,
      { root: anchor.root, parent: anchor.parent });
    let parsed;
    try { parsed = JSON.parse(doc.bytes.toString('utf8')); }
    catch { fail('E_PROVENANCE_FORMAT', 'staging provenance registry malformed'); }
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries))
      fail('E_PROVENANCE_FORMAT', 'staging provenance registry malformed');
    return { entries: parsed.entries, anchor };
  } catch (e) {
    if (e.code === 'E_FS_OS_ERROR' || e.code === 'ENOENT') {
      return { entries: [], anchor };
    }
    throw e;
  }
}

async function writeRegistry(root, provider, entries) {
  if (entries.length > MAX_ENTRIES)
    fail('E_PROVENANCE_FORMAT', 'staging provenance registry too large');
  const bytes = Buffer.from(JSON.stringify(
    { version: 1, entries }, null, 2) + '\n');
  await provider.replaceFileAtomic(root, PROVENANCE_FILE, bytes);
}

// Record (or refresh) the provenance of a staged artifact. `dev` and
// `ino` are decimal strings or numbers; they are stored as strings.
export async function recordStagingCreation(rootPath, {
  name, transactionId, dev, ino, size, sha256,
}) {
  const provider = providerOrFail();
  const root = path.resolve(rootPath);
  const { entries } = await readRegistry(root, provider);
  const entry = {
    name, transactionId: transactionId ?? null,
    dev: String(dev), ino: String(ino),
    ...(size !== undefined ? { size: Number(size) } : {}),
    ...(sha256 ? { sha256 } : {}),
    recordedAt: new Date().toISOString(),
  };
  const next = entries.filter((e) => e.name !== name);
  next.push(entry);
  await writeRegistry(root, provider, next);
  return Object.freeze(entry);
}

export async function forgetStaging(rootPath, name) {
  const provider = providerOrFail();
  const root = path.resolve(rootPath);
  const { entries } = await readRegistry(root, provider);
  const next = entries.filter((e) => e.name !== name);
  if (next.length !== entries.length)
    await writeRegistry(root, provider, next);
  return Object.freeze({ forgotten: next.length !== entries.length });
}

export async function listStagingProvenance(rootPath) {
  const provider = providerOrFail();
  const root = path.resolve(rootPath);
  const { entries } = await readRegistry(root, provider);
  return Object.freeze(entries.map((e) => Object.freeze({ ...e })));
}

// Phase N+4 (§4): committed-control artifacts are NEVER deleted by
// recovery cleanup, even when a provenance entry matches: the
// journal's own entry identifies its committed inode, and a generic
// recovery deletion for that transaction must not turn that entry
// into journal deletion. Journal/control removal requires explicit
// terminal-clear authorization (clearVersionedJournal) with its
// safety preconditions. Control names below are skipped with reason
// 'CONTROL_ARTIFACT' and retained.
export const CONTROL_ARTIFACTS = Object.freeze([
  '.vcp/transaction.json', '.vcp/update.lock',
  '.vcp/writer-audit.log', '.vcp/staging-provenance.json',
]);

// Recovery cleanup bound to provenance. Only registry entries (for
// `transactionId`, or all entries when null) are candidates. Each
// candidate's CURRENT identity is measured through the anchor; the
// unlink carries full root+parent+file expectations. Anything else —
// identity mismatch, foreign file — is preserved and reported.
// Entries whose object has vanished (ENOENT) for the recovered
// transaction are forgotten (nothing remains to delete); ambiguous
// stat failures retain the entry. Registry entries are forgotten
// only after a proven removal or a proven vanishing.
export async function recoveryCleanupStaging(rootPath, {
  transactionId = null,
} = {}) {
  const provider = providerOrFail();
  const root = path.resolve(rootPath);
  const { entries, anchor } = await readRegistry(root, provider);
  const removed = [], skipped = [], retained = [];
  const remaining = [];
  for (const entry of entries) {
    if (transactionId !== null &&
        entry.transactionId !== transactionId) {
      remaining.push(entry);
      retained.push(entry.name);
      continue;
    }
    if (CONTROL_ARTIFACTS.includes(entry.name)) {
      remaining.push(entry);
      skipped.push({ name: entry.name, reason: 'CONTROL_ARTIFACT' });
      continue;
    }
    let current = null;
    let statError = null;
    try {
      current = await provider.statIdentity(root, entry.name,
        { root: anchor.root });
    } catch (e) { statError = e; current = null; }
    if (!current) {
      // Proven vanishing (ENOENT) for the recovered transaction:
      // forget the entry — nothing remains to delete. Any other
      // failure retains it (the object may still exist).
      if (statError?.code === 'E_FS_OS_ERROR' &&
          statError?.errno === 'ENOENT') {
        skipped.push({ name: entry.name, reason: 'VANISHED' });
        continue;
      }
      remaining.push(entry); skipped.push(
        { name: entry.name, reason: 'STAT_FAILED' }); continue;
    }
    if (current.devExact !== entry.dev ||
        current.inoExact !== entry.ino) {
      remaining.push(entry);
      skipped.push({ name: entry.name, reason: 'IDENTITY_MISMATCH' });
      continue;
    }
    // Inode-reuse mitigation (N+4): when the recording captured the
    // staged content digest, the current bytes must match it too —
    // a recycled inode under the same name does not authorize
    // deletion of different content.
    if (entry.sha256) {
      const doc = await provider.readFileVerified(root, entry.name,
        { root: anchor.root }).catch(() => null);
      if (!doc || doc.sha256 !== entry.sha256 ||
          (entry.size !== undefined &&
           Number(entry.size) !== doc.size)) {
        remaining.push(entry);
        skipped.push({ name: entry.name, reason: 'CONTENT_MISMATCH' });
        continue;
      }
    }
    const dir = path.posix.dirname(entry.name);
    const parentAnchor = dir === '.vcp' ? anchor
      : await provider.anchorIdentities(root, dir);
    try {
      await provider.deleteFile(root, entry.name, {
        root: parentAnchor.root ?? anchor.root,
        parent: parentAnchor.parent,
        file: { dev: entry.dev, ino: entry.ino },
      });
      removed.push(entry.name);
    } catch (e) {
      remaining.push(entry);
      skipped.push({ name: entry.name, reason: e.code ?? 'DELETE_FAILED' });
    }
  }
  if (remaining.length !== entries.length)
    await writeRegistry(root, provider, remaining);
  return Object.freeze({
    removed: Object.freeze(removed),
    skipped: Object.freeze(skipped),
    retained: Object.freeze(retained),
  });
}

// Report artifacts in a directory whose names match the staging
// pattern but which have NO registry entry. Report only — recovery
// never deletes from this list.
export async function listUnknownStaging(rootPath, relDir, pattern) {
  const provider = providerOrFail();
  const root = path.resolve(rootPath);
  const { entries } = await readRegistry(root, provider);
  const known = new Set(entries.map((e) => e.name));
  const listing = await provider.listNames(root, relDir);
  const unknown = [];
  for (const name of listing.names ?? []) {
    const rel = relDir === '.' ? name : `${relDir}/${name}`;
    if (pattern.test(name) && !known.has(rel)) unknown.push(rel);
  }
  return Object.freeze(unknown);
}
