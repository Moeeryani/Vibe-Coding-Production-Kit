// Reparse-point / no-follow capability report for the writer's filesystem
// primitives. READ-ONLY: inspects the platform and the source, never a subject
// tree, and never authorizes or blocks an operation.
//
// Why this exists: `constants.O_NOFOLLOW ?? 0` appears throughout lib/ and is
// a SILENT NO-OP on Windows, where node:fs does not define O_NOFOLLOW. The
// source reads like a guard while doing nothing. Measured on native NTFS:
//   - lstat() on a junction/symlink DOES report isSymbolicLink() === true, so
//     verifyNamespaceContained's pre-check is real;
//   - open() THROUGH a reparse point nevertheless SUCCEEDS, so the protection
//     is application-level and racy, not atomic-at-open as on POSIX.
//
// FINDING-002 (2026-10-23, Linux review of candidate 67ce9bc): "atomic at open
// time" on POSIX is TRUE ONLY FOR THE FINAL COMPONENT. Linux applies
// O_NOFOLLOW to the last component of the path; open("link/secret.txt",
// O_NOFOLLOW) follows `link` when it is an intermediate symlink, and
// open("filelink", O_NOFOLLOW) fails with ELOOP only when the symlink IS the
// last component. `atomicScope` and `intermediateComponentsAtomic` state that
// distinction so no caller can read `atomicAtOpenTime: true` as a guarantee
// that covers every component. The intermediate-component gap is only closable
// with a dirfd-relative openat/renameat chain (O_NOFOLLOW|O_DIRECTORY at each
// component), which node:fs does not express; on Windows the equivalent needs
// FILE_FLAG_OPEN_REPARSE_POINT via a pinned native helper.
import { constants } from 'node:fs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not `new URL().pathname`: on Windows the pathname form keeps
// the leading slash ("/D:/x") and percent-encodes spaces, which made readdir
// fail and the inventory below report a silent, empty "clean" result.
const LIB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)));

export function noFollowCapability(platform = process.platform) {
  const flagAvailable = constants.O_NOFOLLOW !== undefined;
  const directoryFlagAvailable = constants.O_DIRECTORY !== undefined;
  if (platform === 'win32') {
    return Object.freeze({
      platform,
      flagAvailable,
      directoryFlagAvailable,
      // open() follows reparse points on Windows even though lstat() sees them.
      atomicAtOpenTime: false,
      // The POSIX flag is absent here, so no component — final or
      // intermediate — is protected at open time.
      atomicScope: 'none',
      intermediateComponentsAtomic: false,
      preCheckOnly: true,
      preCheckEffective: true,
      residualRisk:
        'TOCTOU: a path may be swapped for a reparse point between the ' +
        'lstat() pre-check and open(); nothing at open time refuses it, for ' +
        'the final component or for intermediate components',
      nativeRequirement:
        'FILE_FLAG_OPEN_REPARSE_POINT via a pinned native helper, or a ' +
        'handle-bound directory-relative open with no reparse traversal',
      directoryDurabilityProven: false,
    });
  }
  return Object.freeze({
    platform,
    flagAvailable,
    directoryFlagAvailable,
    atomicAtOpenTime: flagAvailable,
    // O_NOFOLLOW is applied by the kernel to the FINAL component only.
    // Declaring the scope prevents this boolean from being read as
    // "every component is pinned at open time".
    atomicScope: flagAvailable ? 'final-component' : 'none',
    // Linux/BSD do not refuse a symlink in an intermediate component at open
    // time; the lstat() pre-check is the only cover there, and it is racy.
    intermediateComponentsAtomic: false,
    preCheckOnly: !flagAvailable,
    preCheckEffective: true,
    residualRisk: flagAvailable
      ? 'FINAL COMPONENT ONLY: O_NOFOLLOW refuses a symlink that is the last ' +
        'path component (ELOOP). Intermediate symlink components are still ' +
        'traversed. verifyNamespaceContained covers them with an lstat() ' +
        'pre-check, which is check-then-use: a component swapped after the ' +
        'check redirects a path-based open/rename outside the root. Closing ' +
        'that window needs a dirfd-relative openat/renameat chain with ' +
        'O_NOFOLLOW|O_DIRECTORY at every component.'
      : 'no O_NOFOLLOW on this platform; open-time traversal refusal is ' +
        'unavailable for the final component and for intermediate components',
    nativeRequirement: flagAvailable
      ? 'dirfd-relative openat/renameat chain with O_NOFOLLOW|O_DIRECTORY at ' +
        'every component to make intermediate-component containment atomic'
      : 'platform-specific',
    directoryDurabilityProven: platform === 'linux',
  });
}

export function isNoFollowAtomic() {
  return noFollowCapability().atomicAtOpenTime;
}

// Inventories every `constants.O_NOFOLLOW ?? 0` open site under lib/, so a
// reviewer can see how much code assumes a protection the platform may not
// provide. Returns [] ONLY where the flag is genuinely in effect. A failed
// scan throws: an unreadable directory must never be reported as "clean".
export function unsafeNoFollowOpenSites(dir = LIB_DIR) {
  if (constants.O_NOFOLLOW !== undefined) return [];
  const sites = [];
  const names = readdirSync(dir);            // let read errors surface loudly
  let scanned = 0;
  for (const name of names.filter((n) => n.endsWith('.mjs'))) {
    const text = readFileSync(path.join(dir, name), 'utf8');
    scanned++;
    text.split('\n').forEach((line, i) => {
      if (line.includes('O_NOFOLLOW') && /\?\?\s*0/.test(line))
        sites.push(`${name}:${i + 1}`);
    });
  }
  if (scanned === 0) {
    throw new Error('E_CAPABILITY_INVENTORY_EMPTY: no .mjs files found in ' + dir);
  }
  return sites;
}
