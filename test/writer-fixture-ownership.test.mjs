// Phase G: teardown safety. The important assertions are the REFUSALS -
// a cleanup helper that deletes anything is more dangerous than a leak.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, rm, readdir, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createOwnedFixture, removeOwnedFixture, withOwnedFixture, fixtureExists,
} from './helpers/owned-fixture.mjs';

const tmpRoot = path.resolve(os.tmpdir());

test('OWN-01 — an owned fixture is created, recorded and removed', async () => {
  const { dir, record } = await createOwnedFixture('vcp-neg-');
  try {
    assert.ok(await fixtureExists(dir));
    assert.equal(record.prefix, 'vcp-neg-');
    assert.equal(record.pid, process.pid);
    const m = JSON.parse(await (await import('node:fs/promises')).readFile(
      path.join(dir, '.vcp-owned-fixture.json'), 'utf8'));
    assert.equal(m.path, path.resolve(dir));
  } finally {
    const r = await removeOwnedFixture(dir);
    assert.equal(r.removed, true, `expected removal, got ${r.reason}`);
  }
  assert.equal(await fixtureExists(dir), false);
});

test('OWN-02 — refuses to delete a directory with an unrecognised prefix', async () => {
  const dir = await mkdtemp(path.join(tmpRoot, 'not-mine-'));
  try {
    const r = await removeOwnedFixture(dir);
    assert.equal(r.removed, false);
    assert.match(r.reason, /UNOWNED_PREFIX/);
    assert.ok(await fixtureExists(dir), 'unowned directory must survive');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-03 — refuses when the ownership marker is absent', async () => {
  const dir = await mkdtemp(path.join(tmpRoot, 'vcp-neg-'));
  try {
    const r = await removeOwnedFixture(dir);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'NO_OWNERSHIP_MARKER');
    assert.ok(await fixtureExists(dir));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-04 — refuses when the marker path does not match the target', async () => {
  const dir = await mkdtemp(path.join(tmpRoot, 'vcp-neg-'));
  try {
    await writeFile(path.join(dir, '.vcp-owned-fixture.json'),
      JSON.stringify({ path: 'C:\\Users\\target\\Documents' }));
    const r = await removeOwnedFixture(dir);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'MARKER_PATH_MISMATCH');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-05 — refuses to delete anything outside the temp dir', async () => {
  // A directory that LOOKS owned but sits outside tmp must never be deleted.
  const fake = path.join(tmpRoot, '..', 'vcp-neg-outside');
  await mkdir(fake, { recursive: true });
  await writeFile(path.join(fake, '.vcp-owned-fixture.json'),
    JSON.stringify({ path: path.resolve(fake) }));
  try {
    const r = await removeOwnedFixture(fake);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'OUTSIDE_TEMP_DIR');
  } finally { await rm(fake, { recursive: true, force: true }); }
});

test('OWN-06 — refuses to delete a fixture that contains a .git directory', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    await mkdir(path.join(dir, '.git'));
    const r = await removeOwnedFixture(dir);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'CONTAINS_GIT_DIR');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-07 — unknown mutation outcome blocks cleanup entirely', async () => {
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    const r = await removeOwnedFixture(dir, { allowUnknownOutcome: false });
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'UNKNOWN_MUTATION_OUTCOME');
    assert.ok(await fixtureExists(dir), 'evidence must be preserved');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('OWN-08 — withOwnedFixture cleans up even when the body throws', async () => {
  let captured = null;
  await assert.rejects(async () => {
    await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async (dir) => {
      captured = dir;
      throw new Error('in-test failure');
    });
  }, /in-test failure/);
  assert.ok(captured);
  assert.equal(await fixtureExists(captured), false,
    'a failing assertion must not leave a fixture behind');
});

test('OWN-09 — repeated runs leave no accumulation under the owned prefixes', async () => {
  const before = (await readdir(tmpRoot))
    .filter((n) => /^vcp-(neg|wid|wa|controlled|nrc|m2)-/.test(n) || /^la10-/.test(n));
  for (let i = 0; i < 4; i++) {
    await withOwnedFixture(() => createOwnedFixture('vcp-neg-'), async () => {
      throw new Error('force teardown path');
    }).catch(() => {});
  }
  const after = (await readdir(tmpRoot))
    .filter((n) => /^vcp-(neg|wid|wa|controlled|nrc|m2)-/.test(n) || /^la10-/.test(n));
  assert.deepEqual(after.sort(), before.sort(),
    `fixture leak detected: ${after.filter((x) => !before.includes(x))}`);
});
