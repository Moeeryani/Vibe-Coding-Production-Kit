// Phase G: teardown safety. The important assertions are the REFUSALS -
// a cleanup helper that deletes anything is more dangerous than a leak.
// OWN-08..OWN-11 were added after the 2026-10-17 independent review proved the
// original marker check was self-certifying: a planted directory with an owned
// prefix and a marker naming itself was deleted, user data and all.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createOwnedFixture, removeOwnedFixture, withOwnedFixture, fixtureExists,
} from './helpers/owned-fixture.mjs';

const tmpRoot = path.resolve(os.tmpdir());
const KNOWN = { mutationOutcome: 'known' };

test('OWN-01 — an owned fixture is created, recorded and removed', async () => {
  const { dir, record } = await createOwnedFixture('vcp-neg-');
  try {
    assert.ok(await fixtureExists(dir));
    assert.equal(record.prefix, 'vcp-neg-');
    assert.equal(record.pid, process.pid);
    const m = JSON.parse(await readFile(path.join(dir, '.vcp-owned-fixture.json'), 'utf8'));
    assert.equal(m.path, path.resolve(dir));
    assert.ok(m.token, 'marker must carry the unguessable ownership token');
  } finally {
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, true, `expected removal, got ${r.reason}`);
  }
  assert.equal(await fixtureExists(dir), false);
});

test('OWN-02 — refuses to delete a directory with an unrecognised prefix', async () => {
  const dir = await mkdtemp(path.join(tmpRoot, 'not-mine-'));
  try {
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.match(r.reason, /UNOWNED_PREFIX/);
    assert.ok(await fixtureExists(dir), 'unowned directory must survive');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-03 — refuses when the ownership marker is absent', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    await rm(path.join(dir, '.vcp-owned-fixture.json'));
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'NO_OWNERSHIP_MARKER');
    assert.ok(await fixtureExists(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-04 — refuses when the marker path does not match the target', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    await writeFile(path.join(dir, '.vcp-owned-fixture.json'),
      JSON.stringify({ path: 'C:\\Users\\target\\Documents' }));
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'MARKER_PATH_MISMATCH');
    assert.ok(await fixtureExists(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-05 — refuses to delete anything outside the temp dir', async () => {
  // A directory that LOOKS owned but sits outside tmp must never be deleted.
  const fake = path.join(tmpRoot, '..', 'vcp-neg-outside');
  await mkdir(fake, { recursive: true });
  await writeFile(path.join(fake, '.vcp-owned-fixture.json'),
    JSON.stringify({ path: path.resolve(fake) }));
  try {
    const r = await removeOwnedFixture(fake, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'OUTSIDE_TEMP_DIR');
    assert.ok(await fixtureExists(fake));
  } finally { await rm(fake, { recursive: true, force: true }); }
});

test('OWN-06 — refuses to delete a fixture that contains a .git directory', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    await mkdir(path.join(dir, '.git'));
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'CONTAINS_GIT_DIR');
    assert.ok(await fixtureExists(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-07 — unknown mutation outcome blocks cleanup, and is the DEFAULT', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    const explicit = await removeOwnedFixture(dir, { mutationOutcome: 'unknown' });
    assert.equal(explicit.removed, false);
    assert.match(explicit.reason, /^UNKNOWN_MUTATION_OUTCOME/);
    const defaulted = await removeOwnedFixture(dir);
    assert.equal(defaulted.removed, false,
      'cleanup must not be reachable without affirming the outcome is known');
    assert.match(defaulted.reason, /^UNKNOWN_MUTATION_OUTCOME/);
    assert.ok(await fixtureExists(dir), 'evidence must be preserved');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-08 — a body that throws PRESERVES the fixture instead of cleaning it', async () => {
  // STOP + PRESERVE EVIDENCE outranks a tidy temp dir: an assertion failure
  // means a write may have landed somewhere unexpected, so nothing is deleted.
  let captured = null;
  await assert.rejects(async () => {
    await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async (dir) => {
      captured = dir;
      throw new Error('in-test failure');
    });
  }, /in-test failure/);
  assert.ok(captured);
  assert.equal(await fixtureExists(captured), true,
    'a failed test must not destroy the evidence it left behind');
  await rm(captured, { recursive: true, force: true });
});

test('OWN-09 — successful runs leave no accumulation of the fixtures they made', async () => {
  // Scope is THIS test's own fixtures, tracked by exact path. The first version
  // snapshotted the whole temp namespace for owned prefixes, so under `npm test`
  // concurrency it saw another suite's live vcp-neg-/vcp-controlled- directory
  // and reported a leak that did not exist — a flaky test that also masked real
  // leaks by crying wolf.
  const made = [];
  for (let i = 0; i < 4; i++) {
    await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async (dir) => {
      made.push(path.resolve(dir));
    });
  }
  assert.equal(made.length, 4, 'precondition: four fixtures were created');
  const leaked = [];
  for (const dir of made) if (await fixtureExists(dir)) leaked.push(dir);
  assert.deepEqual(leaked, [], `fixture leak detected: ${leaked.join(', ')}`);
});

test('OWN-10 — refuses a foreign directory that only self-certifies ownership', async () => {
  // Regression for the reviewed CRITICAL: prefix + a marker restating its own
  // path is not proof. Only this process minting the fixture is.
  const dir = await mkdtemp(path.join(tmpRoot, 'vcp-neg-not-mine-'));
  await writeFile(path.join(dir, 'important-user-data.txt'), 'DO NOT DELETE\n');
  await writeFile(path.join(dir, '.vcp-owned-fixture.json'), JSON.stringify({
    path: path.resolve(dir), prefix: 'vcp-neg-', pid: process.pid,
    platform: process.platform, token: 'deadbeefdeadbeefdeadbeefdeadbeef',
  }));
  try {
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'NOT_CREATED_BY_THIS_PROCESS');
    assert.equal(await readFile(path.join(dir, 'important-user-data.txt'), 'utf8'),
      'DO NOT DELETE\n', 'unowned data must survive');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-11 — refuses when the marker token was swapped after creation', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    await writeFile(path.join(dir, '.vcp-owned-fixture.json'), JSON.stringify({
      path: path.resolve(dir), token: 'a'.repeat(32),
    }));
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'OWNERSHIP_TOKEN_MISMATCH');
    assert.ok(await fixtureExists(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
