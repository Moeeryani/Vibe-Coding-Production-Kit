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
// The residual gap is only closable with FILE_FLAG_OPEN_REPARSE_POINT (or an
// equivalent handle-bound native primitive), which node:fs cannot express.
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
      preCheckOnly: true,
      preCheckEffective: true,
      residualRisk:
        'TOCTOU: a path may be swapped for a reparse point between the ' +
        'lstat() pre-check and open(); nothing at open time refuses it',
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
    preCheckOnly: !flagAvailable,
    preCheckEffective: true,
    residualRisk: flagAvailable ? null
      : 'no O_NOFOLLOW on this platform; open-time traversal refusal is unavailable',
    nativeRequirement: flagAvailable ? null : 'platform-specific',
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
