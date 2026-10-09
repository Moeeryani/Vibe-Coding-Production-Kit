import { access, chmod, cp, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { assertPathInsideRoot, normalizeManagedPath } from './template.mjs';

export const MANIFEST_SCHEMA_VERSION = 1;
export const VCP_DIR = '.vcp';
export const MANIFEST_PATH = '.vcp/manifest.json';
export const BASELINES_DIR = '.vcp/baselines';
export const BACKUPS_DIR = '.vcp/backups';
export const STAGE_DIR = '.vcp/stage';
export const LOCK_PATH = '.vcp/update.lock';
export const TRANSACTION_PATH = '.vcp/transaction.json';

async function assertInternalPath(root, relative, { allowMissing = true } = {}) {
  const normalized = relative.replaceAll('\\', '/');
  if (
    !(normalized === VCP_DIR || normalized.startsWith(`${VCP_DIR}/`))
    || normalized.includes('..')
    || path.posix.isAbsolute(normalized)
  ) {
    throw new Error(`Unsafe VCP state path: ${relative}`);
  }

  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, normalized);
  if (!candidate.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`VCP state path escapes repository root: ${relative}`);
  }

  let current = rootResolved;
  for (const part of normalized.split('/')) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        throw new Error(`Refusing to follow symlink in VCP state path: ${relative}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT' && allowMissing) break;
      throw error;
    }
  }

  return candidate;
}

export function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function baselineRelative(relative) {
  return path.posix.join(BASELINES_DIR, normalizeManagedPath(relative));
}

export async function readManifest(root) {
  const file = await assertInternalPath(root, MANIFEST_PATH);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('This repository has no VCP manifest. Run `vcp init` with v0.9.0 or newer before using updates.');
    }
    throw new Error(`Cannot read ${MANIFEST_PATH}: ${error.message}`);
  }

  if (!Number.isInteger(parsed.schemaVersion)) {
    throw new Error('VCP manifest is missing schemaVersion.');
  }
  if (parsed.schemaVersion > MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Manifest schema ${parsed.schemaVersion} is newer than this CLI supports (${MANIFEST_SCHEMA_VERSION}).`);
  }
  if (parsed.schemaVersion < 1) {
    throw new Error(`Unsupported manifest schema: ${parsed.schemaVersion}.`);
  }
  if (typeof parsed.installedVersion !== 'string') {
    throw new Error('VCP manifest is missing installedVersion.');
  }
  if (!parsed.install || typeof parsed.install !== 'object') {
    throw new Error('VCP manifest is missing install metadata.');
  }
  if (!parsed.managedFiles || typeof parsed.managedFiles !== 'object' || Array.isArray(parsed.managedFiles)) {
    throw new Error('VCP manifest is missing managedFiles.');
  }
  if (parsed.schemaVersion === 1 && Object.hasOwn(parsed.install, 'assetSet')) {
    throw new Error('Schema-v1 cannot carry adaptive install.assetSet semantics; refuse lifecycle mutation.');
  }
  if (!Array.isArray(parsed.ignoredFiles)) parsed.ignoredFiles = [];
  return parsed;
}

export async function writeManifest(root, manifest) {
  const file = await assertInternalPath(root, MANIFEST_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function snapshotBaselines(root, fileMap, manifest) {
  const baselineRoot = await assertInternalPath(root, BASELINES_DIR);
  await rm(baselineRoot, { recursive: true, force: true });

  for (const [relative, file] of fileMap) {
    const safe = normalizeManagedPath(relative);
    const entry = manifest.managedFiles[safe];
    entry.baselinePath = await writeBaseline(root, safe, file.content);
    entry.baselineHash = hashContent(file.content);
  }
}

export async function readBaseline(root, entry) {
  if (!entry?.baselinePath) throw new Error('Managed file is missing baselinePath.');
  const safe = entry.baselinePath.replaceAll('\\', '/');
  if (!safe.startsWith(`${BASELINES_DIR}/`)) {
    throw new Error(`Unsafe baseline path in manifest: ${entry.baselinePath}`);
  }
  return readFile(await assertInternalPath(root, safe, { allowMissing: false }), 'utf8');
}

export async function writeBaseline(root, relative, content) {
  const safe = normalizeManagedPath(relative);
  const destination = await assertInternalPath(root, baselineRelative(safe));
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
  return baselineRelative(safe);
}

export async function removeBaseline(root, relative) {
  const safe = normalizeManagedPath(relative);
  await rm(await assertInternalPath(root, baselineRelative(safe)), { force: true });
}

export async function replaceBaselines(root, entries, contents) {
  const baselineRoot = await assertInternalPath(root, BASELINES_DIR);
  await rm(baselineRoot, { recursive: true, force: true });

  for (const [relative, entry] of Object.entries(entries)) {
    if (!contents.has(relative)) throw new Error(`Missing baseline content for ${relative}.`);
    const content = contents.get(relative);
    entry.baselinePath = await writeBaseline(root, relative, content);
    entry.baselineHash = hashContent(content);
  }
}

export function buildManifest({ version, agent, stack, includeGitHub, files, previous = null }) {
  const now = new Date().toISOString();
  const managedFiles = {};

  for (const [relativeRaw, file] of files) {
    const relative = normalizeManagedPath(relativeRaw);
    managedFiles[relative] = {
      policy: file.policy,
      origin: file.origin,
      mode: file.mode,
      baselineHash: hashContent(file.content),
      baselinePath: baselineRelative(relative),
      templateVersion: version
    };
  }

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    installedVersion: version,
    installedAt: previous?.installedAt ?? now,
    updatedAt: now,
    install: {
      agent,
      stack,
      includeGitHub: Boolean(includeGitHub)
    },
    ignoredFiles: previous?.ignoredFiles ?? [],
    managedFiles
  };
}

export async function ensureVcpGitignore(root) {
  const file = await assertInternalPath(root, `${VCP_DIR}/.gitignore`);
  await mkdir(path.dirname(file), { recursive: true });
  const content = ['backups/', 'stage/', 'update.lock', 'transaction.json', ''].join('\n');
  await writeFile(file, content, 'utf8');
}

export async function assertManagedDestination(root, relative, options) {
  return assertPathInsideRoot(root, relative, options);
}

export async function readManagedFile(root, relative) {
  const file = await assertManagedDestination(root, relative);
  try {
    const info = await lstat(file);
    if (!info.isFile()) throw new Error(`Managed path is not a regular file: ${relative}`);
    return {
      exists: true,
      content: await readFile(file, 'utf8'),
      mode: info.mode & 0o777
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, content: null, mode: null };
    throw error;
  }
}

export async function writeManagedFile(root, relative, content, mode = 0o644) {
  const file = await assertManagedDestination(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
  await chmod(file, mode);
}

export async function removeManagedFile(root, relative) {
  const file = await assertManagedDestination(root, relative);
  await rm(file, { force: true });
}

async function lockFile(root) {
  return assertInternalPath(root, LOCK_PATH);
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export async function acquireUpdateLock(root, { staleMs = 60 * 60 * 1000 } = {}) {
  const file = await lockFile(root);
  await mkdir(path.dirname(file), { recursive: true });
  const payload = {
    pid: process.pid,
    host: os.hostname(),
    startedAt: new Date().toISOString()
  };

  try {
    await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    return payload;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  let existing = null;
  try {
    existing = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    // Malformed locks are only removed after staleMs to avoid racing a writer.
  }

  let age = 0;
  try {
    age = Date.now() - (await stat(file)).mtimeMs;
  } catch {
    age = staleMs + 1;
  }

  const sameHost = existing?.host === os.hostname();
  const liveSameHostOwner = sameHost && processAlive(existing?.pid);
  const stale = existing
    ? (sameHost ? !liveSameHostOwner : age > staleMs)
    : age > staleMs;

  if (stale) {
    await rm(file, { force: true });
    return acquireUpdateLock(root, { staleMs });
  }

  const owner = existing?.pid ? ` (pid ${existing.pid}${existing.host ? ` on ${existing.host}` : ''})` : '';
  throw new Error(`Another VCP update appears to be running${owner}. If it was interrupted, use \`vcp rollback\` or remove a confirmed stale ${LOCK_PATH}.`);
}

export async function releaseUpdateLock(root) {
  await rm(await lockFile(root), { force: true });
}

export async function writeTransaction(root, transaction) {
  const file = await assertInternalPath(root, TRANSACTION_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(transaction, null, 2)}\n`, 'utf8');
}

export async function readTransaction(root) {
  try {
    return JSON.parse(await readFile(await assertInternalPath(root, TRANSACTION_PATH), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Cannot read update transaction: ${error.message}`);
  }
}

export async function clearTransaction(root) {
  await rm(await assertInternalPath(root, TRANSACTION_PATH), { force: true });
}

export async function createBackup(root, actions, manifest) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${timestamp}-${crypto.randomBytes(4).toString('hex')}`;
  const backupRoot = await assertInternalPath(root, path.posix.join(BACKUPS_DIR, id));
  await mkdir(path.join(backupRoot, 'files'), { recursive: true });

  const paths = [...new Set(
    actions.flatMap((action) => [action.path, action.fromPath].filter(Boolean))
  )].sort();
  const entries = [];

  for (const relative of paths) {
    const current = await readManagedFile(root, relative);
    entries.push({ path: relative, exists: current.exists, mode: current.mode });
    if (current.exists) {
      const destination = path.join(backupRoot, 'files', relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, current.content, 'utf8');
      if (current.mode) await chmod(destination, current.mode);
    }
  }

  if (await pathExists(path.join(root, MANIFEST_PATH))) {
    await cp(path.join(root, MANIFEST_PATH), path.join(backupRoot, 'manifest.json'));
  }
  if (await pathExists(path.join(root, BASELINES_DIR))) {
    await cp(path.join(root, BASELINES_DIR), path.join(backupRoot, 'baselines'), { recursive: true });
  }

  const metadata = {
    id,
    createdAt: new Date().toISOString(),
    installedVersion: manifest.installedVersion,
    entries
  };
  await writeFile(
    path.join(backupRoot, 'backup.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8'
  );
  return metadata;
}

export async function listBackups(root) {
  try {
    const backupsRoot = await assertInternalPath(root, BACKUPS_DIR);
    const entries = await readdir(backupsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function restoreBackup(root, id) {
  const backupRoot = await assertInternalPath(root, path.posix.join(BACKUPS_DIR, id));
  let metadata;
  try {
    metadata = JSON.parse(await readFile(path.join(backupRoot, 'backup.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read backup ${id}: ${error.message}`);
  }
  if (!metadata || !Array.isArray(metadata.entries)) {
    throw new Error(`Backup ${id} has invalid metadata.`);
  }

  for (const entry of metadata.entries) {
    const relative = normalizeManagedPath(entry.path);
    if (entry.exists) {
      const source = await assertInternalPath(
        root,
        path.posix.join(BACKUPS_DIR, id, 'files', relative),
        { allowMissing: false }
      );
      await writeManagedFile(
        root,
        relative,
        await readFile(source, 'utf8'),
        entry.mode ?? 0o644
      );
    } else {
      await removeManagedFile(root, relative);
    }
  }

  const manifestBackup = path.join(backupRoot, 'manifest.json');
  if (await pathExists(manifestBackup)) {
    await cp(manifestBackup, path.join(root, MANIFEST_PATH), { force: true });
  }

  const baselineBackup = path.join(backupRoot, 'baselines');
  if (await pathExists(baselineBackup)) {
    await rm(path.join(root, BASELINES_DIR), { recursive: true, force: true });
    await cp(baselineBackup, path.join(root, BASELINES_DIR), { recursive: true });
  }

  await clearTransaction(root);
  await releaseUpdateLock(root);
  return metadata;
}
