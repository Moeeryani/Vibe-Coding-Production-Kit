import { constants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseSemver } from './semver.mjs';
import { validateAdaptiveManifest } from './manifest-v2.mjs';
import { getCliVersion } from './version.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { validateLegacyManifestFields } from './manifest-v1-guard.mjs';

// Stage 12 read-only classification. This module never calls mkdir/write/rename.
// It does not authorize init, update, migration, or taking ownership of any files.
const MAX_MANIFEST_BYTES = 256 * 1024;
const KNOWN_ASSET_SETS = new Set([
  'legacy-full-v1', 'greenfield-safe-v1', 'brownfield-minimal-v1'
]);
function validVersion(version) {
  try { parseSemver(version); return true; }
  catch { return false; }
}

function report(root, classification, reason = null, extra = {}) {
  return { root, classification, readOnly: true, reason, ...extra };
}

async function tryLstat(file) {
  try { return await lstat(file); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function verifySelectedRoot(root) {
  // Reject linked parent components, including selected roots that are symlinks.
  // On Windows, junction/reparse handling still needs native conformance tests.
  const components = [];
  let current = root;
  for (;;) {
    components.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const component of components.reverse()) {
    const stat = await tryLstat(component);
    if (!stat) return 'ROOT_MISSING';
    if (stat.isSymbolicLink()) return 'ROOT_LINK_REFUSED';
    if (!stat.isDirectory()) return 'ROOT_NOT_DIRECTORY';
  }
  return null;
}

function unchanged(before, after) {
  return Boolean(after && after.isFile() && !after.isSymbolicLink() &&
    before.dev === after.dev && before.ino === after.ino &&
    before.size === after.size && before.mtimeMs === after.mtimeMs);
}

async function readTrustedManifest(file, root) {
  const first = await tryLstat(file);
  if (!first) return report(root, 'BLOCKED', 'MANIFEST_MISSING');
  if (first.isSymbolicLink() || !first.isFile()) {
    return report(root, 'BLOCKED', 'MANIFEST_NOT_REGULAR');
  }
  if (first.size > MAX_MANIFEST_BYTES) return report(root, 'BLOCKED', 'MANIFEST_TOO_LARGE');

  let bytes;
  // O_NOFOLLOW prevents following a swapped final symlink on supported POSIX
  // hosts. Parent-directory races remain unproven, especially on Windows.
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || !unchanged(first, opened) ||
        opened.size > MAX_MANIFEST_BYTES) return report(root, 'BLOCKED', 'MANIFEST_CHANGED');
    bytes = await handle.readFile();
  } finally {
    await handle.close();
  }
  const after = await tryLstat(file);
  if (!unchanged(first, after)) return report(root, 'BLOCKED', 'MANIFEST_CHANGED');
  if (bytes.length > MAX_MANIFEST_BYTES) return report(root, 'BLOCKED', 'MANIFEST_TOO_LARGE');

  let manifest;
  try { manifest = JSON.parse(bytes.toString('utf8')); }
  catch { return report(root, 'BLOCKED', 'MANIFEST_INVALID_JSON'); }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      !Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
    return report(root, 'BLOCKED', 'MANIFEST_INVALID');
  }
  if (manifest.schemaVersion === 2) {
    try {
      const compatible = validateAdaptiveManifest(manifest, { readerVersion: await getCliVersion() });
      return report(root, 'MANAGED', null, {
        schemaVersion: 2, installedVersion: manifest.installedVersion,
        assetSet: compatible.assetSet, minimumReaderVersion: compatible.minimumReaderVersion,
        // Inspection is read-only. This never enables v2 updates or migration.
        lifecycleMutationAllowed: false
      });
    } catch (error) {
      return report(root, 'BLOCKED', error.code ?? 'SCHEMA_UNSUPPORTED', {
        schemaVersion: 2
      });
    }
  }
  if (manifest.schemaVersion !== 1) {
    return report(root, 'BLOCKED', 'SCHEMA_UNSUPPORTED', {
      schemaVersion: manifest.schemaVersion
    });
  }
  if (!validVersion(manifest.installedVersion) ||
      !manifest.install || typeof manifest.install !== 'object' ||
      Array.isArray(manifest.install) ||
      !manifest.managedFiles || typeof manifest.managedFiles !== 'object' ||
      Array.isArray(manifest.managedFiles)) {
    return report(root, 'BLOCKED', 'MANIFEST_INVALID');
  }
  if (Object.hasOwn(manifest, 'assetSet')) {
    return report(root, 'BLOCKED', 'METADATA_UNSUPPORTED');
  }
  if (Object.hasOwn(manifest.install, 'assetSet')) {
    // Schema v1 never granted ownership of this behavior-bearing field.
    return report(root, 'BLOCKED', KNOWN_ASSET_SETS.has(manifest.install.assetSet)
      ? 'METADATA_UNSUPPORTED' : 'ASSETSET_UNKNOWN');
  }
  if (Object.hasOwn(manifest, 'minimumReaderVersion')) {
    // v1 never promised this semantic field: do not guess that it is inert.
    return report(root, 'BLOCKED', 'METADATA_UNSUPPORTED');
  }
  try { validateLegacyManifestFields(manifest); }
  catch(error) { return report(root,'BLOCKED',error.code??'E_V1_METADATA'); }
  return report(root, 'MANAGED', null, {
    schemaVersion: 1,
    installedVersion: manifest.installedVersion,
    assetSet: manifest.install.assetSet ?? null
  });
}

export async function inspectProject(targetDir = '.') {
  const root = path.resolve(targetDir);
  try {
    const invalidRoot = await verifySelectedRoot(root);
    if (invalidRoot) return report(root, 'BLOCKED', invalidRoot);

    const entries = await readdir(root);
    const statePath = path.join(root, '.vcp');
    const state = await tryLstat(statePath);
    if (!state) return report(root, entries.length === 0 ? 'NEW' : 'EXISTING');
    if (state.isSymbolicLink() || !state.isDirectory()) {
      return report(root, 'BLOCKED', 'STATE_NOT_DIRECTORY');
    }
    const manifestFile = path.join(statePath, 'manifest.json');
    const result = await readTrustedManifest(manifestFile, root);
    // Recheck the parent after reading; this isn't an atomic filesystem snapshot.
    const after = await tryLstat(statePath);
    if (!after || !after.isDirectory() || after.isSymbolicLink() ||
        state.dev !== after.dev || state.ino !== after.ino) {
      return report(root, 'BLOCKED', 'STATE_CHANGED');
    }
    if (result.classification === 'MANAGED') {
      const recovery = await inspectManagedRecovery(root);
      if (recovery.blocked) return report(root, 'BLOCKED', recovery.reason);
      if (recovery.needsRecovery) {
        return report(root, 'BLOCKED', 'MANAGED_RECOVERY_REQUIRED', {
          schemaVersion: result.schemaVersion
        });
      }
      const activeLock = await tryLstat(path.join(statePath, 'update.lock'));
      if (activeLock) return report(root, 'BLOCKED', 'ACTIVE_OR_STALE_LOCK');
    }
    return result;
  } catch (error) {
    if (error?.code === 'ELOOP') return report(root, 'BLOCKED', 'LINK_REFUSED');
    // Do not leak manifest contents, sensitive paths or OS error internals.
    return report(root, 'BLOCKED', 'INSPECTION_FAILED');
  }
}
