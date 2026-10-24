// Phase N+1 — native helper trust model (finding X-05 remediation).
//
// The Phase N provider trusted helper receipts after only type checks
// (regular file, non-symlink, executable). A JSON-speaking impostor
// could therefore mint success receipts for operations that never
// happened. This module establishes the defensible trust chain:
//
//   1. The build (scripts/native/build-linux-fsops.mjs) writes a
//      manifest binding the compiled binary's SHA-256 to the SHA-256
//      of the exact in-tree source it was compiled from.
//   2. Before first use, the provider MEASURES the helper on disk:
//      type (regular, non-symlink, executable), permission hygiene
//      (a world-writable helper, or one owned by neither root nor
//      the process euid, is refused), binary SHA-256, and the
//      in-tree source's SHA-256. All must agree with the manifest.
//   3. The measured identity {path, dev, ino, sha256} is returned to
//      the provider and recorded in every transaction receipt, so an
//      external verifier can compare it against a fresh trusted
//      build — the method the Phase N independent validator used.
//
// Residual (stated, not hidden): an actor who can consistently
// replace the binary AND the manifest (or the provider sources) holds
// full install-tree write access — the same privilege that replaces
// the .mjs code itself — and remains outside the threat model. What
// this model removes is the single-artifact impostor and the silent
// success receipt; what it adds is detection surface (receipts carry
// the measured hash) and multi-artifact forgery cost.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

function deny(code, message) {
  const e = new Error(code + (message ? ': ' + message : ''));
  e.code = code;
  throw e;
}

const sha256File = p => createHash('sha256').update(readFileSync(p)).digest('hex');

// Measure and verify the helper at `helperPath`. Returns a frozen
// identity record. Throws E_NATIVE_HELPER_UNTRUSTED /
// E_NATIVE_HELPER_MISSING on any refusal — callers must fail closed.
export function verifyNativeHelper(helperPath) {
  const manifestPath = helperPath + '.manifest.json';
  const sourcePath = helperPath + '.cpp';
  let st;
  try { st = lstatSync(helperPath); }
  catch { deny('E_NATIVE_HELPER_MISSING', 'build it: npm run build:native-linux'); }
  if (!st.isFile() || st.isSymbolicLink())
    deny('E_NATIVE_HELPER_UNTRUSTED', 'helper is not a regular non-symlink file');
  if ((st.mode & 0o111) === 0)
    deny('E_NATIVE_HELPER_UNTRUSTED', 'helper is not executable');
  if ((st.mode & 0o002) !== 0)
    deny('E_NATIVE_HELPER_UNTRUSTED',
      'helper is world-writable; a mutable trusted binary is not trusted');
  const euid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (st.uid !== 0 && euid !== null && st.uid !== euid)
    deny('E_NATIVE_HELPER_UNTRUSTED',
      'helper owned by neither root nor the process user');
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch {
    deny('E_NATIVE_HELPER_UNTRUSTED',
      'helper trust manifest missing or unreadable; rebuild: npm run build:native-linux');
  }
  if (!manifest || typeof manifest.binarySha256 !== 'string' ||
      typeof manifest.sourceSha256 !== 'string')
    deny('E_NATIVE_HELPER_UNTRUSTED', 'helper trust manifest is malformed');
  const binarySha256 = sha256File(helperPath);
  if (binarySha256 !== manifest.binarySha256)
    deny('E_NATIVE_HELPER_UNTRUSTED',
      'helper binary does not match its build manifest (replaced or rebuilt without manifest)');
  let sourceSha256;
  try { sourceSha256 = sha256File(sourcePath); }
  catch { deny('E_NATIVE_HELPER_UNTRUSTED', 'helper source missing from install tree'); }
  if (sourceSha256 !== manifest.sourceSha256)
    deny('E_NATIVE_HELPER_UNTRUSTED',
      'helper source does not match its build manifest (binary provenance unproven)');
  return Object.freeze({
    path: helperPath,
    dev: st.dev, ino: st.ino, size: st.size,
    mode: st.mode & 0o7777,
    mtimeMs: st.mtimeMs,
    sha256: binarySha256,
    sourceSha256,
  });
}

// Cheap change check: has the measured helper file been replaced
// since measurement? Full re-verification is the caller's response.
export function helperMeasurementStale(helperPath, measured) {
  try {
    const st = lstatSync(helperPath);
    return st.dev !== measured.dev || st.ino !== measured.ino ||
           st.size !== measured.size || st.mtimeMs !== measured.mtimeMs;
  } catch { return true; }
}
