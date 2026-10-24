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
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNativeHelper } from './native-helper-trust.mjs';

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
  // Phase N+1 trust seam: helper verification (native-helper-trust)
  // runs by default for EVERY instance. `allowUnverifiedHelper: true`
  // exists ONLY so tests can drive the protocol with fixture helpers;
  // it is greppable, defaults off, and production code
  // (selectSecureWriterProvider) never passes it. An unverified
  // helper's receipts are still subject to the provider's independent
  // outcome verification, but its sync attestations cannot be trusted
  // — see docs/design/PHASE-N1-TRANSACTION-CONTINUITY.md.
  constructor({ helperPath = DEFAULT_HELPER_PATH,
                allowUnverifiedHelper = false } = {}) {
    this.helperPath = helperPath;
    this.allowUnverifiedHelper = allowUnverifiedHelper === true;
    this._capabilities = null;
    this._helperTrust = null;
  }

  // Phase N+2 (S3b hardening): the helper's CONTENT is re-verified on
  // every spawn, not only when stat metadata changes. The Phase N+1
  // acceptance supplement demonstrated that a stat-preserving in-place
  // replacement (same inode, same size, mtime restored with
  // float-second utimes) defeats a stat-triggered cache and the
  // swapped binary executes. Metadata is therefore never treated as
  // proof of content: verifyNativeHelper re-hashes the binary and
  // the in-tree source and compares both to the build manifest on
  // every call. Cost is one small file hash per spawn (~1 ms for the
  // reference helper) — negligible next to process spawn cost.
  // The verification-to-exec window inside a single spawn is NOT
  // closed by this (an attacker would need to win a sub-millisecond
  // race after the hash); closing it requires executing a pinned
  // copy of the binary and is recorded as a residual in the Phase
  // N+2 design document. Throws E_NATIVE_HELPER_* — _run lets it
  // propagate (fail closed, before any spawn).
  _ensureTrust() {
    if (this.allowUnverifiedHelper) return null;
    this._helperTrust = verifyNativeHelper(this.helperPath);
    return this._helperTrust;
  }

  _helperReceiptIdentity() {
    const t = this._helperTrust;
    return t ? { dev: t.dev, ino: t.ino, sha256: t.sha256 } : null;
  }

  _run({ root = null, probeDir = null, op, args = [], stdin = null,
         expect = null }) {
    const trust = this._ensureTrust();
    void trust;
    const argv = [];
    if (probeDir !== null) argv.push('--probe-dir', probeDir);
    else argv.push('--root', checkRoot(root));
    if (expect?.root) argv.push('--expect-root', `${expect.root.dev}:${expect.root.ino}`);
    if (expect?.parent) argv.push('--expect-parent', `${expect.parent.dev}:${expect.parent.ino}`);
    if (expect?.file) argv.push('--expect-file', `${expect.file.dev}:${expect.file.ino}`);
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
    // Phase N+1: identity mismatch (exit 13) is its own refusal class,
    // distinct from OS errors — the namespace changed under the
    // transaction; nothing was mutated by this invocation.
    if (done.status === 13 && doc.identityMismatch === true)
      fail('E_FS_IDENTITY_CHANGED',
        'namespace identity changed during transaction (' +
        String(doc.identity ?? 'unknown') + ')');
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
  // Phase N+1 — transaction anchor. Captures the identities a write
  // transaction is authorized to mutate: the root directory and the
  // destination parent, measured through the pinned chain. Every
  // later spawn of the transaction carries these identities back as
  // --expect-* flags and the helper verifies its pinned descriptors
  // against them before mutating, so a namespace object substituted
  // BETWEEN spawns (validator finding X-02) refuses the transaction
  // with E_FS_IDENTITY_CHANGED instead of completing in the wrong
  // namespace. Exact decimal strings are carried (devExact/inoExact)
  // so no float precision is lost.
  async anchorIdentities(root, parentRel) {
    const parent = checkRel(parentRel, { allowDot: true });
    const rootDoc = await this.statIdentity(root, '.');
    const rootId = { dev: rootDoc.devExact, ino: rootDoc.inoExact };
    const parentDoc = parent === '.'
      ? rootDoc
      : await this.statIdentity(root, parent, { root: rootId });
    return Object.freeze({
      parentRel: parent,
      root: rootId,
      parent: { dev: parentDoc.devExact, ino: parentDoc.inoExact },
    });
  }
  // Write bytes to a new file with crash-atomic exclusive-create
  // semantics: payload -> unique temp name (O_CREAT|O_EXCL|O_NOFOLLOW,
  // data fsync, parent fsync) -> renameat2(RENAME_NOREPLACE) to the
  // final name.
  // A crash can only leave a reapable temp file; the final name is either
  // absent or complete, never torn. An existing final name -> EEXIST from
  // inside the atomic operation (no lstat+rename race).
  // Phase N+1: the staging write and the rename are bound to a
  // transaction anchor (root + parent identities) exactly as in
  // replaceFileAtomic, so the journal/backup staging path cannot be
  // redirected between its two spawns either.
  async writeFileSynced(root, rel, bytes, mode = 0o600) {
    const name = checkRel(rel);
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    if (payload.length > 64 * 1024 * 1024) fail('E_FS_PAYLOAD_TOO_LARGE');
    const dir = path.posix.dirname(name);
    const base = path.posix.basename(name);
    const anchor = await this.anchorIdentities(root, dir);
    const expectBase = { root: anchor.root, parent: anchor.parent };
    const tmp = (dir === '.' ? '' : dir + '/') +
      '.' + base + '.vcp-' + randomSuffix() + '.tmp';
    const staged = this._run({
      root, op: 'write-file-sync',
      args: [tmp, mode.toString(8)], stdin: payload, expect: expectBase,
    });
    try {
      const moved = this._run({
        root, op: 'rename-noreplace', args: [tmp, name],
        expect: { ...expectBase,
                  file: { dev: staged.dev, ino: staged.ino } },
      });
      return {
        ok: true, op: 'write-file-sync', path: name,
        bytes: staged.bytes,
        dataSynced: staged.dataSynced === true,
        directorySynced: moved.srcParentSynced === true &&
          moved.dstParentSynced === true,
        dev: staged.dev, ino: staged.ino,
        anchor,
        helper: this._helperReceiptIdentity(),
      };
    } catch (e) {
      try {
        this._run({ root, op: 'unlink-sync', args: [tmp],
          expect: { ...expectBase,
                    file: { dev: staged.dev, ino: staged.ino } } });
      } catch {}
      throw e;
    }
  }

  // Raw temp staging primitive (no rename). Used internally and by callers
  // that manage the final rename themselves per their own contract.
  async writeTempSynced(root, rel, bytes, mode = 0o600, expect = null) {
    const name = checkRel(rel);
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    if (payload.length > 64 * 1024 * 1024) fail('E_FS_PAYLOAD_TOO_LARGE');
    return this._run({
      root, op: 'write-file-sync',
      args: [name, mode.toString(8)], stdin: payload, expect,
    });
  }

  // Atomic manifest-style replacement: temp + data fsync + rename(replace)
  // + parent fsync. The rename *replaces* per the operation contract
  // (unlike moveNoReplace below).
  //
  // Phase N hardening (SEC-FINDING-002 remediation): this method is the
  // provider contract the production writer now depends on, so a receipt
  // is issued ONLY for a kernel-acknowledged, identity-verified outcome:
  //   * An existing destination must be a regular file. A symlink,
  //     directory or other destination is refused up front
  //     (E_FS_DESTINATION_UNSAFE) — never replaced through, and the
  //     pre-rename check cannot be raced into an escape because
  //     renameat() itself never follows a destination symlink; it
  //     replaces the directory entry inside the pinned parent.
  //   * Staging must report dataSynced AND directorySynced from the
  //     helper; the rename must report both parents synced. Any false
  //     or missing flag fails closed with E_FS_SYNC_UNPROVEN and NO
  //     success receipt — a rename that already landed is reported as
  //     unproven, never as durable.
  //   * After the rename, the destination is re-stated through the
  //     pinned chain and must be the SAME object (dev, ino) as the
  //     staged file, with the exact payload size and requested mode.
  //     Anything else fails with E_FS_REPLACE_UNVERIFIED.
  async replaceFileAtomic(root, rel, bytes, { mode = null, anchor = null } = {}) {
    const name = checkRel(rel);
    const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? '');
    const effectiveMode = mode ?? 0o600;
    const dir = path.posix.dirname(name);
    const base = path.posix.basename(name);
    // Phase N+1: anchor the transaction to the authorized identities
    // BEFORE any mutation; every spawn below carries the anchor as
    // expectations the helper enforces against its pinned descriptors.
    const txnAnchor = anchor ?? await this.anchorIdentities(root, dir);
    if (txnAnchor.parentRel !== dir)
      fail('E_FS_IDENTITY_CHANGED', 'anchor parent does not match destination');
    const expectBase = { root: txnAnchor.root, parent: txnAnchor.parent };
    let existing = null;
    try {
      existing = await this.statIdentity(root, name, expectBase);
    } catch (e) {
      if (!(e && e.code === 'E_FS_OS_ERROR' && e.errno === 'ENOENT')) throw e;
    }
    if (existing && existing.type !== 'file')
      fail('E_FS_DESTINATION_UNSAFE', 'destination type: ' + existing.type);
    const tmp = (dir === '.' ? '' : dir + '/') +
      '.' + base + '.vcp-' + randomSuffix() + '.tmp';
    const staged = await this.writeTempSynced(
      root, tmp, payload, effectiveMode, expectBase);
    try {
      if (staged.dataSynced !== true || staged.directorySynced !== true)
        fail('E_FS_SYNC_UNPROVEN', 'staging write not acknowledged as synced');
      const moved = this._run({
        root, op: 'rename-replace', args: [tmp, name],
        expect: { ...expectBase,
                  file: { dev: staged.dev, ino: staged.ino } },
      });
      if (moved.dstParentSynced !== true || moved.srcParentSynced !== true)
        fail('E_FS_SYNC_UNPROVEN', 'rename parents not acknowledged as synced');
      const after = await this.statIdentity(root, name, expectBase);
      if (after.type !== 'file' ||
          Number(after.dev) !== Number(staged.dev) ||
          Number(after.ino) !== Number(staged.ino) ||
          Number(after.size) !== payload.length ||
          after.mode !== effectiveMode)
        fail('E_FS_REPLACE_UNVERIFIED',
          'destination identity does not match the staged object');
      // Phase N+1: the destination's PARENT must still be the anchored
      // object — the Phase N identity check alone cannot see a
      // namespace substitution, because relocation preserves the
      // payload inode (validator finding X-02).
      const parentAfter = await this.statIdentity(
        root, dir, { root: txnAnchor.root });
      if (parentAfter.devExact !== txnAnchor.parent.dev ||
          parentAfter.inoExact !== txnAnchor.parent.ino)
        fail('E_FS_IDENTITY_CHANGED',
          'destination parent identity changed during transaction');
      // Phase N+1: independent outcome verification (finding X-05).
      // The destination's bytes are re-read through a channel that
      // does not trust helper JSON and must hash to the payload. A
      // no-op or lying helper can no longer mint a success receipt.
      let onDisk;
      try { onDisk = await readFile(path.join(checkRoot(root), name)); }
      catch { onDisk = null; }
      if (!onDisk ||
          createHash('sha256').update(onDisk).digest('hex') !==
            createHash('sha256').update(payload).digest('hex'))
        fail('E_FS_REPLACE_UNVERIFIED',
          'destination content does not match the payload (independent read)');
      return {
        operation: 'replaceFileAtomic', path: name,
        completed: true,
        dataSynced: true,
        directorySynced: true,
        identityVerified: true,
        bytes: staged.bytes,
        dev: staged.dev, ino: staged.ino,
        anchor: txnAnchor,
        helper: this._helperReceiptIdentity(),
      };
    } catch (e) {
      // Best-effort staging cleanup; the temp name is unique and the
      // reapStaging() sweep is the durable cleanup path. unlink through
      // the pinned chain removes only the directory entry — if the
      // staging name was swapped for a symlink, the link is removed,
      // never its target. Phase N+1: the cleanup is identity-bound —
      // if the staging name now denotes a DIFFERENT object, the helper
      // refuses and that object is left untouched.
      try {
        this._run({ root, op: 'unlink-sync', args: [tmp],
          expect: { ...expectBase,
                    file: { dev: staged.dev, ino: staged.ino } } });
      } catch {}
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

  async deleteFile(root, rel, expect = null) {
    return this._run({ root, op: 'unlink-sync', args: [checkRel(rel)], expect });
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

  async statIdentity(root, rel, expect = null) {
    const doc = this._run({
      root, op: 'stat-id',
      args: [checkRel(rel, { allowDot: true })], expect,
    });
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
  //
  // Phase N+2 (SECURITY FINDING 003): deletion provenance is
  // mandatory. Phase N+1 swallowed an anchorIdentities() failure and
  // proceeded to delete with NULL expectations — an attacker-induced
  // anchor failure (or any other) silently downgraded the sweep to
  // unanchored deletion in whatever namespace the path then resolved
  // to. Now: no anchor, no deletions — the sweep reports the refusal
  // and leaves every candidate in place. With an anchor, each unlink
  // carries root + parent + file expectations (the file identity is
  // measured immediately before the unlink, binding the deletion to
  // the object actually inspected); an identity refusal or a vanished
  // object is reported in `skipped`, never retried unanchored, and
  // never claimed in `removed`.
  async reapStaging(root, relDir = '.') {
    const dir = checkRel(relDir, { allowDot: true });
    const listed = this._run({ root, op: 'list-names', args: [dir] });
    const staged = (listed.names ?? []).filter(n =>
      /^\.[A-Za-z0-9._-]+\.vcp-[a-f0-9]+\.tmp$/.test(n));
    const removed = [];
    const skipped = [];
    let anchor = null;
    try { anchor = await this.anchorIdentities(root, dir); } catch {}
    if (!anchor) {
      return { operation: 'reapStaging', directory: dir, removed,
               skipped: staged, refused: 'E_FS_ANCHOR_UNAVAILABLE' };
    }
    for (const n of staged) {
      const rel = dir === '.' ? n : dir + '/' + n;
      try {
        const id = await this.statIdentity(
          root, rel, { root: anchor.root });
        await this.deleteFile(root, rel,
          { root: anchor.root, parent: anchor.parent,
            file: { dev: id.devExact, ino: id.inoExact } });
        removed.push(n);
      } catch { skipped.push(n); }
    }
    await this.syncDirectory(root, dir);
    return { operation: 'reapStaging', directory: dir, removed, skipped };
  }

  // Phase N+2 (R-3): append-only evidence write through the pinned
  // walk (native append-file-sync). The append carries the caller's
  // root + parent expectations; a substituted .vcp namespace refuses
  // with E_FS_IDENTITY_CHANGED instead of recording evidence into the
  // attacker's tree. Creates the file (mode 0600) when absent.
  async appendFileSynced(root, rel, bytes, expect = null) {
    const relChecked = checkRel(rel);
    return this._run({ root, op: 'append-file-sync',
      args: [relChecked, '0600'],
      stdin: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes),
      expect });
  }
}

import { randomBytes } from 'node:crypto';
function randomSuffix() {
  return randomBytes(8).toString('hex');
}
