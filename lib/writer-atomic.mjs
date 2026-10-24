// B-1 Production Writer — unified atomic write engine.
// NEVER direct overwrite. Every mutation follows:
//   temp write -> file fsync -> directory fsync -> atomic rename ->
//   directory fsync -> post-rename identity verify.
//
// Phase N (SEC-FINDING-002 remediation): the mutation itself is no
// longer path-based. The baseline sequence — an lstat() walk in
// verifyNamespaceContained, then path-based open()/rename() — was
// check-then-use: O_NOFOLLOW guards only the FINAL component, so an
// intermediate directory swapped for a symlink between the walk and
// the rename redirected the write outside the root (see
// docs/SECURITY-FINDING-002-INTERMEDIATE-SYMLINK-TOCTOU-20261023.md).
//
// Now the whole mutation runs through the secure provider boundary
// (lib/secure-fs-provider.mjs): a native helper pins the root
// descriptor and resolves every component with
// openat(O_RDONLY|O_DIRECTORY|O_NOFOLLOW), creates the staging file
// with openat(O_CREAT|O_EXCL|O_NOFOLLOW) inside the pinned parent,
// commits with renameat() between pinned parents, fsyncs the pinned
// parents, and the provider verifies the destination is the staged
// object (dev, ino, size, mode) before any receipt is returned.
// There is no path-based fallback: a missing, unsupported, unverified
// or failing provider refuses the operation, on every platform.
//
// The lstat() namespace pre-check is KEPT as defense in depth and for
// error-classification continuity (pre-existing symlink components
// still refuse with E_WRITER_NAMESPACE_UNSAFE before any provider
// call), but it is no longer the mechanism containment relies on.
//
// Receipt honesty: a returned receipt means the kernel acknowledged
// the file fsync and both parent-directory fsyncs and the destination
// identity was verified through the pinned chain. It is NOT a
// power-loss durability proof (see
// docs/STAGE12-LINUX-DURABILITY-BOUNDARIES.md); kernel acknowledgment
// and power-loss durability are distinct claims.
//
// Primitives VERIFY (namespace, durability); the facade AUTHORIZES
// (gate, operation policy). Primitives never call the gate themselves.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { verifyNamespaceContained } from './writer-identity.mjs';
import { selectSecureWriterProvider } from './secure-fs-provider.mjs';

function deny(code, message) {
  const e = new Error(code + (message ? ': ' + message : ''));
  e.code = code;
  throw e;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Atomic file write. The target may or may not exist; either way the
// visible state transitions atomically from old to new (never torn).
// An existing target must be a regular file: a symlink destination is
// refused (E_FS_DESTINATION_UNSAFE) rather than replaced through.
export async function atomicWriteFile(root, relative, bytes, {
  mode = 0o644, managedState = false
} = {}) {
  if (!Buffer.isBuffer(bytes)) deny('E_ATOMIC_BYTES', 'Content must be a Buffer.');
  if (bytes.length > 8 * 1024 * 1024) deny('E_ATOMIC_BYTES', 'Content exceeds 8 MiB.');
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) deny('E_ATOMIC_MODE', 'Bad mode.');
  const rootDir = path.resolve(root);
  // Namespace validation: no `..` escape (resolveProjectPath rejects `..`
  // components outright, so validate components manually for update targets
  // that may already exist).
  const parts = relative.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || path.isAbsolute(p)))
    deny('E_ATOMIC_PATH', `Unsafe relative path: ${relative}.`);
  const target = path.join(rootDir, ...parts);
  // Defense-in-depth pre-check (see header): refuses pre-existing
  // symlink components with the historical error classification. The
  // pinned provider chain below is what actually closes the race.
  await verifyNamespaceContained(rootDir, target);
  // Provider selection is not caller-controlled and never falls back
  // to path-based mutation (lib/secure-fs-provider.mjs). On Windows
  // and every unreviewed platform this throws
  // E_SECURE_PROVIDER_UNAVAILABLE before anything is touched.
  const provider = selectSecureWriterProvider();
  let receipt;
  try {
    receipt = await provider.replaceFileAtomic(
      rootDir, parts.join('/'), bytes, { mode });
  } catch (e) {
    // Keep the writer's historical path classification: a name the
    // provider's component contract refuses is an unsafe atomic path,
    // not a helper failure.
    if (e && e.code === 'E_FS_PROVIDER_PATH')
      deny('E_ATOMIC_PATH', `Path refused by secure provider: ${relative}.`);
    throw e;
  }
  if (receipt?.completed !== true || receipt?.dataSynced !== true ||
      receipt?.directorySynced !== true || receipt?.identityVerified !== true)
    deny('E_ATOMIC_VERIFY', 'Secure provider did not return a verified durable receipt.');
  return {
    path: target, sha256: sha256(bytes),
    dataSynced: true, directorySynced: true, identityVerified: true,
    provider: 'linux-native',
  };
}

// Manifest update is always the LAST mutation of a transaction.
export async function atomicWriteManifest(root, manifestBytes, { expectedHash = null } = {}) {
  if (expectedHash && sha256(manifestBytes) !== expectedHash)
    deny('E_ATOMIC_MANIFEST_HASH', 'Manifest bytes do not match expected hash.');
  return atomicWriteFile(root, '.vcp/manifest.json', manifestBytes, {
    mode: 0o600, managedState: true
  });
}
