// B-4/B-5 controlled test lane — disposable fixture lifecycle.
// TEST-ONLY. Creates fixtures ONLY under os.tmpdir()/vcp-controlled-*/.
// Refuses real repositories, home, filesystem root, and pre-existing dirs.
import { randomBytes } from 'node:crypto';
import { lstat, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  mintCapabilityForFixture, revokeCapabilitiesForFixture, assertNotInsideRealRepo,
} from './controlled-writer-capability.mjs';

const FIXTURE_PREFIX = 'vcp-controlled-';
const IDENTITY_FILE = '.vcp-controlled-fixture.json';

function fail(code, message) {
  const e = new Error(code + (message ? ': ' + message : ''));
  e.code = code;
  throw e;
}

export async function createControlledFixture({ allowedOperations } = {}) {
  if (!Array.isArray(allowedOperations) || !allowedOperations.length)
    fail('E_FIXTURE', 'allowedOperations required');
  // L-1: tighten the check/use window — mkdir (atomic), then IMMEDIATELY
  // lstat to pin identity before any other filesystem operation.
  const dir = path.join(os.tmpdir(), FIXTURE_PREFIX + randomBytes(8).toString('hex'));
  await mkdir(dir, { recursive: false, mode: 0o700 });
  const st0 = await lstat(dir);
  if (st0.isSymbolicLink()) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    fail('E_FIXTURE', 'Fixture root is a symlink.');
  }
  await assertNotInsideRealRepo(dir);
  const fixtureId = 'fx-' + randomBytes(16).toString('hex');
  const identity = { fixtureId, createdAt: new Date().toISOString(), pid: process.pid };
  await writeFile(path.join(dir, IDENTITY_FILE), JSON.stringify(identity) + '\n', { mode: 0o600 });
  // Re-pin after identity write (detects replacement during setup).
  const st = await lstat(dir);
  if (st.isSymbolicLink() || st.dev !== st0.dev || st.ino !== st0.ino) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    fail('E_FIXTURE', 'Fixture root identity changed during setup.');
  }
  const deviceInoPin = { dev: st.dev, ino: st.ino };
  // C-1: mint through the enforced entrypoint, which independently
  // re-verifies the fixture root (location, lstat, identity file).
  const capability = await mintCapabilityForFixture({
    fixtureRoot: dir, allowedOperations,
  });
  return { root: dir, fixtureId, capability, deviceInoPin };
}

export async function verifyFixtureIdentity(fixture) {
  const { root, fixtureId, deviceInoPin } = fixture;
  const r = path.resolve(root);
  let st;
  try { st = await lstat(r); }
  catch { fail('E_FIXTURE_IDENTITY', 'Fixture root vanished.'); }
  if (st.isSymbolicLink() || st.dev !== deviceInoPin.dev || st.ino !== deviceInoPin.ino)
    fail('E_FIXTURE_IDENTITY', 'Fixture root identity changed.');
  let identity;
  try {
    identity = JSON.parse(await readFile(path.join(r, IDENTITY_FILE), 'utf8'));
  } catch { fail('E_FIXTURE_IDENTITY', 'Fixture identity file unreadable.'); }
  if (identity.fixtureId !== fixtureId)
    fail('E_FIXTURE_IDENTITY', 'Fixture identity mismatch (tampered).');
  return true;
}

export async function teardownControlledFixture(fixture) {
  const { root } = fixture;
  // Revoke FIRST (scoped to this fixture's root; L-2), then verify,
  // then delete. A verification failure still leaves capabilities revoked.
  revokeCapabilitiesForFixture(root);
  await verifyFixtureIdentity(fixture);
  const r = path.resolve(root);
  // Safety: only delete under the approved prefix, and only what we created.
  const tmp = path.resolve(os.tmpdir());
  if (!r.startsWith(tmp + path.sep) || !path.basename(r).startsWith(FIXTURE_PREFIX))
    fail('E_FIXTURE_TEARDOWN', 'Refusing to delete outside controlled fixture location.');
  await rm(r, { recursive: true, force: false });
  return { tornDown: true };
}
