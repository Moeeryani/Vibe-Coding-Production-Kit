// B-4/B-5 controlled test lane — test capability model.
// TEST-ONLY. Not exported from any production module. Not in the npm
// artifact (test/ excluded from package.json files).
//
// SECURITY (C-1 fix): minting is technically restricted. The raw minter is
// PRIVATE (not exported). The only public minting entrypoint,
// mintCapabilityForFixture(), independently verifies the fixture root
// (canonical tmpdir-prefix location, fresh lstat identity, identity file,
// real-repo exclusion) before minting. Caller-supplied device/inode values
// are NEVER trusted; the minter pins identity from its own lstat.
import { randomBytes } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Unforgeable within the process: only the private minter creates entries.
const validCapabilities = new WeakSet();
// Fixture-root -> Set of live capabilities (for scoped revocation, L-2).
const capabilitiesByRoot = new Map();

const FIXTURE_PREFIX = 'vcp-controlled-';
const IDENTITY_FILE = '.vcp-controlled-fixture.json';

function fail(code, message) {
  const e = new Error(code + (message ? ': ' + message : ''));
  e.code = code;
  throw e;
}

async function exists(p) {
  try { await lstat(p); return true; } catch { return false; }
}

// Shared real-repo exclusion check (also used by the fixture module).
export async function assertNotInsideRealRepo(dir) {
  let current = path.resolve(dir);
  const home = os.homedir();
  const tmp = path.resolve(os.tmpdir());
  for (;;) {
    if (await exists(path.join(current, '.git')))
      fail('E_FIXTURE_REAL_REPO', `Ancestor has .git: ${current}`);
    if (await exists(path.join(current, '.vcp')))
      fail('E_FIXTURE_REAL_REPO', `Ancestor has .vcp: ${current}`);
    const pkg = path.join(current, 'package.json');
    if (await exists(pkg)) {
      try {
        const text = await readFile(pkg, 'utf8');
        if (text.includes('vibe-coding-production'))
          fail('E_FIXTURE_REAL_REPO', `Ancestor package.json references vibe-coding-production: ${current}`);
      } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    if (path.resolve(current) === tmp) break;
    current = parent;
  }
  const r = path.resolve(dir);
  if (r === path.parse(r).root)
    fail('E_FIXTURE_ROOT', 'Fixture cannot be the filesystem root.');
  if (!r.startsWith(tmp + path.sep) && r !== tmp) {
    if (r === path.resolve(home) || r.startsWith(path.resolve(home) + path.sep))
      fail('E_FIXTURE_HOME', 'Fixture cannot be inside the home directory.');
  }
}

// PRIVATE minter. Not exported. Only mintCapabilityForFixture() calls it,
// after independent verification. Device/inode are pinned from the minter's
// own lstat, never from caller input.
function mintTestCapability({ fixtureRoot, fixtureId, deviceInoPin, allowedOperations }) {
  const cap = {
    id: 'tcap-' + randomBytes(16).toString('hex'),
    fixtureRoot: path.resolve(fixtureRoot),
    fixtureId,
    deviceInoPin: Object.freeze({ dev: deviceInoPin.dev, ino: deviceInoPin.ino }),
    mintedAt: new Date().toISOString(),
    mintedPid: process.pid,
    allowedOperations: Object.freeze([...allowedOperations]),
    revoked: false,
  };
  validCapabilities.add(cap);
  const key = cap.fixtureRoot;
  if (!capabilitiesByRoot.has(key)) capabilitiesByRoot.set(key, new Set());
  capabilitiesByRoot.get(key).add(cap);
  return cap;
}

// The ONLY public minting entrypoint. Independently verifies the fixture
// root before minting; refuses anything that is not a verified disposable
// fixture under the controlled tmpdir location.
export async function mintCapabilityForFixture({ fixtureRoot, allowedOperations } = {}) {
  if (!Array.isArray(allowedOperations) || !allowedOperations.length)
    fail('E_TEST_CAPABILITY', 'allowedOperations required');
  if (typeof fixtureRoot !== 'string' || !fixtureRoot)
    fail('E_TEST_CAPABILITY', 'fixtureRoot required');
  const r = path.resolve(fixtureRoot);
  const tmp = path.resolve(os.tmpdir());
  // 1. Canonical location: under tmpdir with the controlled prefix.
  //    Path prefix ALONE is insufficient; combined with lstat + identity
  //    verification below (defense in depth).
  if (!r.startsWith(tmp + path.sep) || !path.basename(r).startsWith(FIXTURE_PREFIX))
    fail('E_CAPABILITY_ROOT', 'Not a controlled fixture location.');
  // 2. Fresh lstat by the minter: not a symlink; pin dev/ino OURSELVES.
  let st;
  try { st = await lstat(r); }
  catch { fail('E_CAPABILITY_ROOT', 'Fixture root unreadable.'); }
  if (st.isSymbolicLink())
    fail('E_CAPABILITY_ROOT', 'Fixture root is a symlink.');
  if (!st.isDirectory())
    fail('E_CAPABILITY_ROOT', 'Fixture root is not a directory.');
  // 3. Identity file must exist and be well-formed (proves the fixture
  //    helper (or equivalent) initialized this root).
  let identity;
  try {
    identity = JSON.parse(await readFile(path.join(r, IDENTITY_FILE), 'utf8'));
  } catch { fail('E_CAPABILITY_ROOT', 'Fixture identity missing or invalid.'); }
  if (!identity || typeof identity.fixtureId !== 'string' || !identity.fixtureId)
    fail('E_CAPABILITY_ROOT', 'Fixture identity malformed.');
  // 4. Real-repo exclusion (defense in depth; the location check is primary).
  await assertNotInsideRealRepo(r);
  // 5. Mint with OUR pinned identity, never caller-supplied values.
  return mintTestCapability({
    fixtureRoot: r,
    fixtureId: identity.fixtureId,
    deviceInoPin: { dev: st.dev, ino: st.ino },
    allowedOperations,
  });
}

// Revoke ALL capabilities for one fixture root (L-2: scoped revocation).
// Called by fixture teardown for its own root. There is no exported
// single-capability revoke, preventing cross-fixture revocation DoS.
export function revokeCapabilitiesForFixture(fixtureRoot) {
  const key = path.resolve(fixtureRoot);
  const set = capabilitiesByRoot.get(key);
  if (set) for (const cap of set) cap.revoked = true;
  capabilitiesByRoot.delete(key);
}

// Verify a capability immediately before use. Every check re-runs;
// nothing is cached from mint time except the WeakSet membership.
export async function verifyTestCapability(cap, { root, operation } = {}) {
  if (!cap || typeof cap !== 'object' || !validCapabilities.has(cap))
    fail('E_TEST_CAPABILITY_INVALID', 'Unknown or forged test capability.');
  if (cap.revoked)
    fail('E_TEST_CAPABILITY_REVOKED', 'Test capability revoked (fixture torn down).');
  if (cap.mintedPid !== process.pid)
    fail('E_TEST_CAPABILITY_PROCESS', 'Capability is process-bound.');
  if (!cap.allowedOperations.includes(operation))
    fail('E_TEST_CAPABILITY_OPERATION', `Operation not allowed: ${operation}.`);
  const r = path.resolve(root);
  if (r !== cap.fixtureRoot)
    fail('E_TEST_CAPABILITY_SCOPE', 'Capability is scoped to a different fixture root.');
  // Re-verify filesystem identity: detects replacement between mint and use.
  let st;
  try { st = await lstat(r); }
  catch { fail('E_TEST_CAPABILITY_IDENTITY', 'Fixture root vanished.'); }
  if (st.isSymbolicLink() || st.dev !== cap.deviceInoPin.dev || st.ino !== cap.deviceInoPin.ino)
    fail('E_TEST_CAPABILITY_IDENTITY', 'Fixture root identity changed (replaced/renamed).');
  return true;
}
