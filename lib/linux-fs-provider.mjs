// Stage 12 Linux durability provider.
//
// A real, production-wired provider for the filesystem operations that need
// durability guarantees on Linux. It delegates dirfd-bound operations to the
// audited native helper scripts/native/vcp-linux-fsops (renameat2 with
// RENAME_NOREPLACE, O_NOFOLLOW-pinned chains, directory fsync).
//
// Honesty contract of every method:
//   * The returned receipt distinguishes "operation completed" from
//     "operation synced". A caller MUST treat {completed:true, synced:false}
//     as *detached evidence*, never as durable.
//   * Unsupported filesystems fail closed: E_FS_NOREPLACE_UNSUPPORTED,
//     E_DIRECTORY_SYNC_UNSUPPORTED. No silent fallback to plain rename.
//   * Cross-filesystem renames fail closed: E_CROSS_FILESYSTEM. The provider
//     never silently copies (copying changes atomicity semantics).
//   * Symlinks are never traversed: every path is validated and resolved
//     beneath a pinned root fd by the helper (O_NOFOLLOW /
//     AT_SYMLINK_NOFOLLOW at every component).
//   * Power-loss persistence is NOT attested by fsync success; see
//     docs/STAGE12-LINUX-DURABILITY-BOUNDARIES.md. Methods report what the
//     kernel acknowledged, nothing more.
//
// This provider operates on disposable/owned directory trees. It does not
// bypass the Stage 12 managed-mutation gate: managed entry points keep
// calling assertManagedMigrationGate() before any selected-root write.
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_HELPER_PATH = path.join(
  HERE, '..', 'scripts', 'native', 'vcp-linux-fsops');

const REL_COMPONENT = /^[A-Za-z0-9._-]{1,128}$/;
function fail(code, detail) {
  const e = new Error(code + (detail ? ': ' + detail : ''));
  e.code = code;
  throw e;
}
function checkRoot(root) {
  const abs = path.resolve(root);
  if (!path.isAbsolute(abs)) fail('E_FS_PROVIDER_ROOT');
  return abs;
}
// Relative names accepted by the helper: dot-separated components only,
// max 32 deep. The helper re-validates; this is the JS-side pre-check.
function checkRel(rel, { allowDot = false } = {}) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 4096)
    fail('E_FS_PROVIDER_PATH');
  if (rel === '.') {
    if (!allowDot) fail('E_FS_PROVIDER_PATH');
    return '.';
  }
  if (path.isAbsolute(rel) || rel.includes('..') || rel.includes('//'))
    fail('E_FS_PROVIDER_PATH');
  const parts = rel.split('/');
  if (parts.length > 32 || parts.some(p => !REL_COMPONENT.test(p)))
    fail('E_FS_PROVIDER_PATH');
  return parts.join('/');
}
function parseHelperJson(stdout, op) {
  let doc;
  try { doc = JSON.parse(String(stdout).trim().split('\n').pop()); }
  catch { fail('E_FS_HELPER_PROTOCOL', op); }
  if (!doc || typeof doc !== 'object' || doc.op !== op)
    fail('E_FS_HELPER_PROTOCOL', op);
  return doc;
}

export class LinuxFsProvider {
  constructor({ helperPath = DEFAULT_HELPER_PATH } = {}) {
    this.helperPath = helperPath;
    this._capabilities = null;
  }

  _run({ root = null, probeDir = null, op, args = [], stdin = null }) {
    const argv = [];
    if (probeDir !== null) argv.push('--probe-dir', probeDir);
    else argv.push('--root', checkRoot(root));
    argv.push('--op', op, ...args);
    let done;
    try {
      done = spawnSync(this.helperPath, argv, {
        input: stdin ?? undefined,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (e) {
      fail('E_FS_HELPER_SPAWN', String(e?.message ?? e));
    }
    if (done.error) {
      if (done.error.code === 'ENOENT')
        fail('E_NATIVE_HELPER_MISSING',
          'build it: npm run build:native-linux');
      fail('E_FS_HELPER_SPAWN', done.error.message);
    }
    const doc = parseHelperJson(done.stdout, op);
    if (done.status === 0 && doc.ok === true) return doc;
    // Map helper exit codes to provider errors, preserving OS truth.
    if (done.status === 10 && doc.osDenied) {
      if (doc.errno === 'EEXIST') fail('E_FS_DESTINATION_EXISTS');
      fail('E_FS_OS_DENIED', doc.errno);
    }
    if (done.status === 11) fail('E_CROSS_FILESYSTEM');
    if (done.status === 12) {
      if (op === 'rename-noreplace') fail('E_FS_NOREPLACE_UNSUPPORTED', doc.errno);
      if (op === 'rename-exchange') fail('E_FS_EXCHANGE_UNSUPPORTED', doc.errno);
      fail('E_DIRECTORY_SYNC_UNSUPPORTED', doc.errno);
    }
    if (doc.errno) {
      // Keep the existing error code/message contract while exposing the
      // native errno as a typed property. Stage13 forensic inspections
      // may treat exactly ENOENT as absence, never EPERM/ELOOP/EIO.
      const error = new Error('E_FS_OS_ERROR: ' + doc.errno);
      error.code = 'E_FS_OS_ERROR';
      error.errno = doc.errno;
      throw error;
    }
    fail('E_FS_HELPER_FAILED', 'exit=' + done.status);
  }

  // Probe kernel/filesystem capabilities inside a disposable directory.
  // Never probes a live project root. probeBase (optional) selects the
  // filesystem to probe; defaults to os.tmpdir().
  async probeCapabilities(probeBase = null) {
    if (this._capabilities && probeBase === null) return this._capabilities;
    const scratch = await mkdtemp(path.join(
      probeBase ?? os.tmpdir(), 'vcp-fsprobe-'));
    try {
      const doc = this._run({ probeDir: scratch, op: 'probe' });
      const caps = Object.freeze({
        kernel: doc.kernel, arch: doc.arch, filesystem: doc.filesystem,
        renameat2Noreplace:
          doc.renameat2NoreplaceFresh === true &&
          doc.renameat2NoreplaceDeniedOnCollision === true,
        directoryFsync: doc.directoryFsyncOk === true,
        immutableSettable: doc.immutableSettable === true,
        immutableErrno: doc.immutableErrno || null,
        probedAtUtc: new Date().toISOString(),
      });
      if (probeBase === null) this._capabilities = caps;
      return caps;
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  async createDirectory(root, rel, mode = 0o700) {
    const name = checkRel(rel);
    return this._run({ root, op: 'mkdir-sync', args: [name, mode.toString(8)] });
  }

  // Write bytes to a new file with crash-atomic exclusive-create semantics:
  // payload -> unique temp name (O_CREAT|O_EXCL|O_NOFOLLOW, data fsync,
  // parent fsync) -> renameat2(RENAME_NOREPLACE) to the final name.
  // A crash can only leave a reapable temp file; the final name is either
  // absent or complete, never torn. An existing final name -> EEXIST from
  // inside the atomic operation (no lstat+rename race).
  async writeFileSynced(root, rel, bytes, mode = 0o600) {
    const name = checkRel(rel);
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    if (payload.length > 64 * 1024 * 1024) fail('E_FS_PAYLOAD_TOO_LARGE');
    const dir = path.posix.dirname(name);
    const base = path.posix.basename(name);
    const tmp = (dir === '.' ? '' : dir + '/') +
      '.' + base + '.vcp-' + randomSuffix() + '.tmp';
    const staged = this._run({
      root, op: 'write-file-sync',
      args: [tmp, mode.toString(8)], stdin: payload,
    });
    try {
      const moved = this._run({ root, op: 'rename-noreplace', args: [tmp, name] });
      return {
        ok: true, op: 'write-file-sync', path: name,
        bytes: staged.bytes,
        dataSynced: staged.dataSynced === true,
        directorySynced: moved.srcParentSynced === true &&
          moved.dstParentSynced === true,
        dev: staged.dev, ino: staged.ino,
      };
    } catch (e) {
      try { this._run({ root, op: 'unlink-sync', args: [tmp] }); } catch {}
      throw e;
    }
  }

  // Raw temp staging primitive (no rename). Used internally and by callers
  // that manage the final rename themselves per their own contract.
  async writeTempSynced(root, rel, bytes, mode = 0o600) {
    const name = checkRel(rel);
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    if (payload.length > 64 * 1024 * 1024) fail('E_FS_PAYLOAD_TOO_LARGE');
    return this._run({
      root, op: 'write-file-sync',
      args: [name, mode.toString(8)], stdin: payload,
    });
  }

  // Atomic manifest-style replacement: temp + data fsync + rename(replace)
  // + parent fsync. The rename *replaces* per the operation contract
  // (unlike moveNoReplace below).
  async replaceFileAtomic(root, rel, bytes, { mode = null } = {}) {
    const name = checkRel(rel);
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    const dir = path.posix.dirname(name);
    const base = path.posix.basename(name);
    const tmp = (dir === '.' ? '' : dir + '/') +
      '.' + base + '.vcp-' + randomSuffix() + '.tmp';
    const staged = await this.writeTempSynced(root, tmp, payload, mode ?? 0o600);
    try {
      const moved = this._run({
        root, op: 'rename-replace', args: [tmp, name],
      });
      return {
        operation: 'replaceFileAtomic', path: name,
        completed: true,
        dataSynced: staged.dataSynced === true,
        directorySynced: moved.dstParentSynced === true &&
          moved.srcParentSynced === true,
        bytes: staged.bytes,
      };
    } catch (e) {
      // Best-effort staging cleanup; the temp name is unique and the
      // reapStaging() sweep is the durable cleanup path.
      try { this._run({ root, op: 'unlink-sync', args: [tmp] }); } catch {}
      throw e;
    }
  }

  // No-replace move: the OS refuses with E_FS_DESTINATION_EXISTS when the
  // destination exists. Never falls back to replacing rename.
  async moveNoReplace(root, srcRel, dstRel) {
    const src = checkRel(srcRel), dst = checkRel(dstRel);
    if (src === dst) fail('E_FS_PROVIDER_PATH', 'src==dst');
    return this._run({ root, op: 'rename-noreplace', args: [src, dst] });
  }

  // Both existing names must be present. The kernel exchanges directory
  // entries atomically; neither inode is destroyed. This is a preservation
  // primitive, NOT independent proof of exclusive writer isolation or
  // authorization to replace user document contents.
  async exchangeNames(root, stagedRel, liveRel) {
    const staged=checkRel(stagedRel), live=checkRel(liveRel);
    if(staged===live)fail('E_FS_PROVIDER_PATH','same exchange names');
    return this._run({root,op:'rename-exchange',args:[staged,live]});
  }

  async deleteFile(root, rel) {
    return this._run({ root, op: 'unlink-sync', args: [checkRel(rel)] });
  }

  async removeEmptyDirectory(root, rel) {
    return this._run({ root, op: 'rmdir-sync', args: [checkRel(rel)] });
  }

  async syncDirectory(root, rel = '.') {
    return this._run({ root, op: 'fsync-dir', args: [checkRel(rel, { allowDot: true })] });
  }

  async listNames(root, rel = '.') {
    return this._run({ root, op: 'list-names', args: [checkRel(rel, { allowDot: true })] });
  }

  async statIdentity(root, rel) {
    const doc = this._run({ root, op: 'stat-id', args: [checkRel(rel)] });
    // The helper emits mode as an octal string ("640"); normalize to int.
    if (typeof doc.modeOct === 'string') {
      const parsed = parseInt(doc.modeOct, 8);
      if (!Number.isSafeInteger(parsed)) fail('E_FS_HELPER_PROTOCOL', 'stat-id');
      doc.mode = parsed;
    }
    return doc;
  }

  async getFlags(root, rel) {
    return this._run({ root, op: 'get-flags', args: [checkRel(rel)] });
  }

  async setImmutable(root, rel) {
    return this._run({ root, op: 'set-immutable', args: [checkRel(rel)] });
  }

  async clearImmutable(root, rel) {
    return this._run({ root, op: 'clear-immutable', args: [checkRel(rel)] });
  }

  // ---- composed Stage 12 operations ----

  // Journal stage: write temp journal entry + data sync. The caller renames
  // via replaceFileAtomic or moveNoReplace per its contract.
  async stageJournal(root, rel, bytes) {
    const receipt = await this.writeFileSynced(root, rel, bytes, 0o600);
    return {
      operation: 'stageJournal', path: rel, completed: true,
      dataSynced: receipt.dataSynced === true,
      directorySynced: receipt.directorySynced === true,
      bytes: receipt.bytes, dev: receipt.dev, ino: receipt.ino,
    };
  }

  // Backup data write: exclusive create + data sync + parent sync.
  async writeBackupData(root, rel, bytes) {
    const receipt = await this.writeFileSynced(root, rel, bytes, 0o600);
    return {
      operation: 'writeBackupData', path: rel, completed: true,
      dataSynced: receipt.dataSynced === true,
      directorySynced: receipt.directorySynced === true,
      bytes: receipt.bytes,
    };
  }

  // Explicit, non-recursive staging-file sweep. The candidate names are
  // listed through the pinned directory fd (never a racy readdir on an
  // untrusted path); only the provider's own staging pattern is removed.
  async reapStaging(root, relDir = '.') {
    const dir = checkRel(relDir, { allowDot: true });
    const listed = this._run({ root, op: 'list-names', args: [dir] });
    const staged = (listed.names ?? []).filter(n =>
      /^\.[A-Za-z0-9._-]+\.vcp-[a-f0-9]+\.tmp$/.test(n));
    const removed = [];
    for (const n of staged) {
      const rel = dir === '.' ? n : dir + '/' + n;
      try {
        await this.deleteFile(root, rel);
        removed.push(n);
      } catch { /* leave for the next sweep; never fail the sweep */ }
    }
    await this.syncDirectory(root, dir);
    return { operation: 'reapStaging', directory: dir, removed };
  }
}

import { randomBytes } from 'node:crypto';
function randomSuffix() {
  return randomBytes(8).toString('hex');
}
