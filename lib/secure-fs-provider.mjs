// Phase N — secure filesystem provider boundary for the production writer.
//
// SEC-FINDING-002 remediation architecture. The writer's mutation path no
// longer resolves paths itself: every staging write, rename and directory
// sync happens relative to directory descriptors pinned by a native
// helper (openat / renameat chains with O_NOFOLLOW at EVERY component),
// so no check-then-use window exists between namespace verification and
// the mutation itself.
//
// Selection contract (security-critical):
//   * The provider is chosen from process.platform by THIS module only.
//     There is deliberately no caller-supplied provider, helper path,
//     platform override, or fallback parameter — the same reasoning that
//     removed the `authorize` injection from runWriterTransaction and
//     keeps WINDOWS_PRINCIPAL_PROVIDER a module constant. Wiring a new
//     platform provider must be a visible edit to this production file.
//   * Linux: LinuxFsProvider backed by the in-repo native helper
//     (scripts/native/vcp-linux-fsops, built from in-repo source via
//     `npm run build:native-linux`). The helper must exist as a regular,
//     non-symlink, executable file; anything else refuses.
//   * Windows: NO provider. The production writer stays fail-closed
//     (WINDOWS_PRINCIPAL_PROVIDER = null, writers DISABLED) until an
//     independently reviewed native implementation provides equivalent
//     namespace and object-identity guarantees. There is NO silent
//     fallback to path-based mutation.
//   * macOS and every other platform: NO provider, same refusal. A
//     `/proc/self/fd` emulation was considered and REJECTED: it is an
//     unreviewed security-sensitive path mechanism (see the Phase N
//     architecture document).
//   * A missing, unverified or failing provider refuses the operation.
//     Provider failures are never caught and retried through a weaker
//     path anywhere in the writer.
import { lstatSync } from 'node:fs';
import { LinuxFsProvider, DEFAULT_HELPER_PATH } from './linux-fs-provider.mjs';

function deny(code, message) {
  const e = new Error(code + (message ? ': ' + message : ''));
  e.code = code;
  throw e;
}

// Descriptive status only — authorizes nothing, mirrors the
// principalProofStatus() pattern in writer-identity.mjs. Tests and
// diagnostics use it to distinguish "no provider for this platform"
// from "provider present but its helper failed verification".
export function secureWriterProviderStatus(platform = process.platform) {
  if (platform === 'linux') {
    let helper = null;
    try {
      const st = lstatSync(DEFAULT_HELPER_PATH);
      helper = Object.freeze({
        present: true,
        regularFile: st.isFile() && !st.isSymbolicLink(),
        executable: (st.mode & 0o111) !== 0,
        dev: st.dev, ino: st.ino, size: st.size,
      });
    } catch {
      helper = Object.freeze({ present: false, regularFile: false,
        executable: false, dev: null, ino: null, size: null });
    }
    return Object.freeze({
      platform, provider: 'linux-native', helper,
      available: helper.present && helper.regularFile && helper.executable,
      reason: helper.present ? 'LINUX_NATIVE_HELPER_PINNED_BY_PATH_AND_TYPE'
                             : 'NATIVE_HELPER_MISSING_BUILD_REQUIRED',
    });
  }
  if (platform === 'win32') {
    return Object.freeze({
      platform, provider: null, helper: null, available: false,
      reason: 'WINDOWS_NATIVE_PROVIDER_UNREVIEWED_FAIL_CLOSED',
    });
  }
  return Object.freeze({
    platform, provider: null, helper: null, available: false,
    reason: 'PLATFORM_PROVIDER_UNREVIEWED_FAIL_CLOSED',
  });
}

// The one selection entry point the writer uses. Synchronous and cheap:
// it verifies the helper's file identity (regular file, not a symlink,
// executable) but does not spawn it — per-operation helper receipts are
// verified by LinuxFsProvider itself. Throws E_SECURE_PROVIDER_* on any
// refusal; callers must let it propagate (fail closed).
export function selectSecureWriterProvider() {
  const status = secureWriterProviderStatus();
  if (status.provider !== 'linux-native')
    deny('E_SECURE_PROVIDER_UNAVAILABLE', status.reason);
  if (!status.helper.present)
    deny('E_SECURE_PROVIDER_UNAVAILABLE',
      'native helper missing; build it: npm run build:native-linux');
  if (!status.helper.regularFile || !status.helper.executable)
    deny('E_SECURE_PROVIDER_UNVERIFIED',
      'native helper is not a regular executable file (symlink or type change refused)');
  return new LinuxFsProvider();
}
