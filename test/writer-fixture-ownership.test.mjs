// Phase G: teardown safety. The important assertions are the REFUSALS -
// a cleanup helper that deletes anything is more dangerous than a leak.
// OWN-08..OWN-11 were added after the 2026-10-17 independent review proved the
// original marker check was self-certifying: a planted directory with an owned
// prefix and a marker naming itself was deleted, user data and all.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createOwnedFixture, removeOwnedFixture, withOwnedFixture, fixtureExists,
} from './helpers/owned-fixture.mjs';
import { forceKill, waitExit } from './helpers/child-kill.mjs';

const tmpRoot = path.resolve(os.tmpdir());
const KNOWN = { mutationOutcome: 'known' };
// Spawned children must import this helper by file URL: a Windows path pasted
// into an import specifier is not a valid specifier, and the earlier version of
// these tests escaped it by hand.
const HELPER_URL = pathToFileURL(
  path.join(import.meta.dirname, 'helpers', 'owned-fixture.mjs')).href;

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
  // Deliberately passes no mutationOutcome: 'unknown' is the wrapper default.
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
  // Clean up through the guard, not a bare rm: this process DID create the
  // fixture, so it is authorized — and a test of ownership must not itself
  // demonstrate that the guard can be stepped around.
  const r = await removeOwnedFixture(captured, KNOWN);
  assert.equal(r.removed, true, `owner cleanup after preservation: ${r.reason}`);
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
    }, { mutationOutcome: 'known' });
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

test('OWN-14 — cleanup is refused while a holder process may still be alive', async () => {
  // A fixture can be owned and still be actively written by a child. "Could not
  // check" must never be read as "the process finished", so both ALIVE and UNKNOWN
  // hold the delete; only a proven DEAD releases it.
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    const alive = await removeOwnedFixture(dir, { ...KNOWN, holderPid: process.pid });
    assert.equal(alive.removed, false);
    assert.match(alive.reason, /^POSSIBLY_LIVE_HOLDER:ALIVE/,
      `a live holder must block cleanup, got ${alive.reason}`);
    assert.ok(await fixtureExists(dir), 'the fixture must survive a live holder');

    const unknown = await removeOwnedFixture(dir, { ...KNOWN, holderPid: 'not-a-pid' });
    assert.equal(unknown.removed, false);
    assert.match(unknown.reason, /^POSSIBLY_LIVE_HOLDER:UNKNOWN/,
      `an unrunnable probe must not authorize a delete, got ${unknown.reason}`);
    assert.ok(await fixtureExists(dir), 'UNKNOWN liveness is not evidence of exit');

    // A child that has genuinely finished releases the hold.
    const { spawnSync } = await import('node:child_process');
    const done = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { windowsHide: true });
    let dead = null;
    for (let i = 0; i < 20 && dead?.removed !== true; i++) {
      dead = await removeOwnedFixture(dir, { ...KNOWN, holderPid: done.pid });
      if (dead.removed) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(dead.removed, true, `a reaped holder must allow cleanup: ${dead.reason}`);
    assert.equal(await fixtureExists(dir), false);
  } finally {
    if (await fixtureExists(dir)) {
      const r = await removeOwnedFixture(dir, KNOWN);
      if (!r.removed) console.error(`OWN-14 fixture retained: ${r.reason}`);
    }
  }
});

test('OWN-15 — a nested .git directory is refused, not just a top-level one', async () => {
  // The reviewed check looked only at the fixture's first level, so payload/.git
  // was deletable. The scan is bounded-recursive and refuses on overflow.
  const { dir } = await createOwnedFixture('vcp-neg-');
  try {
    await mkdir(path.join(dir, 'payload', '.git'), { recursive: true });
    await writeFile(path.join(dir, 'payload', '.git', 'HEAD'), 'ref: refs/heads/main\n');
    const r = await removeOwnedFixture(dir, KNOWN);
    assert.equal(r.removed, false);
    assert.equal(r.reason, 'CONTAINS_GIT_DIR');
    assert.ok(await fixtureExists(dir), 'a nested repository must survive');
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

// A fixture created by ANOTHER process carries a completely legitimate marker:
// correct prefix, inside temp, its own real token. Reading that marker off disk
// hands over every fact the old implementation required, and must still fail.
test('OWN-12 — process interruption: a dead creator’s fixture is not deletable here', async () => {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createOwnedFixture } from ${JSON.stringify(HELPER_URL)};
    import { writeFile } from 'node:fs/promises';
    const { dir } = await createOwnedFixture('vcp-neg-');
    await writeFile(dir + '/forensic-evidence.txt', 'left by an interrupted process');
    console.log(JSON.stringify({ dir }));
    // Exits without teardown: the in-process registry dies with it.
  `], { encoding: 'utf8', timeout: 60_000, windowsHide: true });
  assert.equal(child.status, 0, `child failed: ${child.stderr}`);
  const { dir } = JSON.parse(child.stdout.trim().split(/\r?\n/).pop());

  // Prove the foreign fixture looks perfectly owned by every disk-visible test:
  // correct prefix, inside temp, a marker naming itself, and a REAL random token
  // the child minted. Reading it off disk transfers no authority.
  const marker = JSON.parse(await readFile(path.join(dir, '.vcp-owned-fixture.json'), 'utf8'));
  assert.ok(marker.token && marker.token.length >= 16, 'child wrote a real token');
  assert.equal(marker.path, path.resolve(dir));
  assert.equal(marker.prefix, 'vcp-neg-');

  // No finally-cleanup, deliberately: the creator process is gone, so this run has
  // NO proof of ownership, and a test of the ownership guard must not step around
  // it to tidy up. The directory is retained as evidence and reported instead.
  // (Known cost: this leaks one directory per run. That is the intended trade.)
  const r = await removeOwnedFixture(dir, KNOWN);
  assert.equal(r.removed, false,
    'knowledge of a valid marker must not transfer delete authority');
  assert.equal(r.reason, 'NOT_CREATED_BY_THIS_PROCESS');
  assert.equal(await readFile(path.join(dir, 'forensic-evidence.txt'), 'utf8'),
    'left by an interrupted process', 'evidence must survive the attempted cleanup');
  assert.ok(await fixtureExists(dir), 'an unprovable directory must still be on disk');
  console.error(`OWN-12 RETAINED (unowned by this process): ${dir}`);
});

test('OWN-13 — concurrent processes: each cleans only what it created', async () => {
  // Two fixtures, deliberately: A is what the foreign process tries to delete,
  // B is what this process deletes at the same time. Sharing one path between an
  // "owner may delete" and a "still exists" assertion is a race in the test, not
  // a property of the guard — the first version of this test had exactly that.
  const { dir: held } = await createOwnedFixture('vcp-neg-');
  try {
    // Bounded like every other child in this campaign: a hung probe must fail the
    // test, never stall the suite. waitExit resolves with exited:false on timeout,
    // then forceKill guarantees the process is gone before we report.
    const foreignAttempt = (async () => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', `
        import { removeOwnedFixture } from ${JSON.stringify(HELPER_URL)};
        const r = await removeOwnedFixture(${JSON.stringify(path.resolve(held))},
          { mutationOutcome: 'known' });
        console.log(JSON.stringify(r));
      `], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      child.stdout.on('data', (b) => { out += b; });
      child.stderr.on('data', (b) => { err += b; });
      child.on('error', (e) => { out = ''; err += String(e); });
      const done = await waitExit(child, 30_000);
      if (!done.exited) {
        const k = await forceKill(child, { timeoutMs: 5_000 });
        throw new Error(`foreign-attempt child hung; killed=${k.terminated}`);
      }
      if (child.exitCode !== 0)
        throw new Error(`child exit ${child.exitCode}: ${out}${err}`);
      return JSON.parse(out.trim().split(/\r?\n/).pop());
    })();

    // Real concurrent activity in this process while the child is attempting.
    const ownCycle = (async () => {
      const { dir: mine } = await createOwnedFixture('vcp-neg-');
      const r = await removeOwnedFixture(mine, KNOWN);
      return { r, mine };
    })();

    const [crossProcess, own] = await Promise.all([foreignAttempt, ownCycle]);

    assert.equal(crossProcess.removed, false,
      'another process must not be able to delete a live fixture this process created');
    assert.equal(crossProcess.reason, 'NOT_CREATED_BY_THIS_PROCESS');
    assert.ok(await fixtureExists(held), 'the held fixture must survive the foreign attempt');
    assert.equal(own.r.removed, true, `owner cleanup failed: ${own.r.reason}`);
    assert.equal(await fixtureExists(own.mine), false,
      'the fixture this process created must be removable by this process');
  } finally {
    // `held` was created by THIS process, so the guard authorizes its removal —
    // no bare rm here either (that would demonstrate the bypass being tested).
    const cleanup = await removeOwnedFixture(held, KNOWN);
    if (!cleanup.removed)
      console.error(`OWN-13 cleanup refused for its own fixture: ${cleanup.reason}`);
  }
});
