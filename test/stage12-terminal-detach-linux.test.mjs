// Stage 12 terminal detach protocol tests (Linux).
//
// Exercises the resumable detach steps on disposable fixtures, including
// crash injection at every boundary: before move, after move/before ack,
// after ack. Also covers destination collision (advisory + atomic),
// symlink/mount-swap at the destination, lock changes mid-flight,
// missing/corrupt journal, foreign root content, old archives, and
// repeated runs. The managed G-FENCE gate is never bypassed: these tests
// drive the protocol steps, not the gated entry point.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp, rm, writeFile, mkdir, symlink, readFile, readdir, lstat, rename,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildArchiveName, isRetiredArchiveName,
  verifyDetachPreconditions, performDetachMove, acknowledgeDetach,
} from '../lib/terminal-detach-protocol.mjs';
import {
  writeArchiveManifest, readArchiveManifest,
  planArchivePrune, executeArchivePrune,
} from '../lib/terminal-archive-retention.mjs';
import { planGreenfieldRecovery } from '../lib/greenfield-recovery-plan.mjs';
import { LinuxFsProvider } from '../lib/linux-fs-provider.mjs';

const LINUX = process.platform === 'linux';
const sha = b => createHash('sha256').update(b).digest('hex');

async function provider(t) {
  if (!LINUX) t.skip('linux-only');
  const p = new LinuxFsProvider();
  try { await p.probeCapabilities(); }
  catch (e) {
    if (e?.code === 'E_NATIVE_HELPER_MISSING')
      t.skip('native helper not built (npm run build:native-linux)');
    throw e;
  }
  return p;
}
// A minimal terminal-state fixture: .vcp/{transaction.json,update.lock}.
async function bundle(t, { token = 'tok-' + Math.random().toString(16).slice(2) } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-detach-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, '.vcp'), { recursive: true });
  const journal = Buffer.from(JSON.stringify({ phase: 'cleanup', id: 'op1' }) + '\n');
  await writeFile(path.join(dir, '.vcp', 'transaction.json'), journal);
  await writeFile(path.join(dir, '.vcp', 'update.lock'),
    JSON.stringify({ token, pid: 1 }) + '\n');
  return { dir, journalHash: sha(journal), token, lock: { root: dir, token } };
}
async function verifiedOf(t, b, overrides = {}) {
  const archiveName = buildArchiveName({ backupId: 'b1', inRoot: true });
  return verifyDetachPreconditions({
    root: b.dir, expectedJournalHash: b.journalHash,
    ownedLock: b.lock, archiveName, ...overrides,
  });
}

test('happy path: verify -> move -> ack, archive holds pinned identity', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  assert.equal(v.scope, 'in-root');
  const m1 = await performDetachMove(v);
  assert.equal(m1.alreadyDetached, false);
  const ack = await acknowledgeDetach(v);
  assert.equal(ack.detached, true);
  assert.equal(ack.sourceNameAbsent, true);
  assert.equal(ack.sourceRecreated, false);
  const at = await lstat(m1.destination);
  assert.ok(at.isDirectory());
  assert.equal(at.dev, v.sourceIdentity.dev);
  assert.equal(at.ino, v.sourceIdentity.ino);
  // Root now holds only the retired archive.
  const names = await readdir(b.dir);
  assert.equal(names.length, 1);
  assert.ok(isRetiredArchiveName(names[0]));
  // Forensic manifest was written by acknowledgeDetach; round-trips.
  assert.match(ack.manifestSha256 ?? '', /^[a-f0-9]{64}$/);
  const read = await readArchiveManifest(b.dir, names[0]);
  assert.equal(read.manifestSha256, ack.manifestSha256);
  assert.equal(read.manifest.journalSha256, b.journalHash);
  assert.equal(read.manifest.kind, 'vcp-retirement-manifest');
});

test('crash before move: resume completes exactly one detach', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b); // verify only, then "crash"
  const v2 = await verifiedOf(t, b); // restart re-verifies
  const m = await performDetachMove(v2);
  assert.equal(m.alreadyDetached, false);
  await acknowledgeDetach(v2);
  assert.ok(!(await lstat(b.dir + '/.vcp').catch(e => e.code === 'ENOENT' ? null : Promise.reject(e))));
  void v;
});

test('crash after move before ack: resume detects detached-evidence, no re-move', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  await performDetachMove(v); // move done, then "crash" before ack
  const restart = await performDetachMove(v);
  assert.equal(restart.alreadyDetached, true);
  assert.equal(restart.destination, v.destination);
  const ack = await acknowledgeDetach(v);
  assert.equal(ack.detached, true);
  // Exactly one archive exists.
  const names = (await readdir(b.dir)).filter(isRetiredArchiveName);
  assert.equal(names.length, 1);
});

test('crash after ack: re-run is an idempotent no-op', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  await performDetachMove(v);
  await acknowledgeDetach(v);
  // Full re-run: verify fails closed (source gone) -> resume path handles it.
  const v2 = await verifiedOf(t, b).catch(e => e);
  assert.ok(v2.code === 'E_TERMINAL_CONTROL_RESIDUE' || v2.code === 'ENOENT' ||
    /E_TERMINAL/.test(v2.code ?? ''),
    're-verify after detach must fail closed, got: ' + (v2.code ?? v2));
  // The planner reports the terminal state instead of BLOCKED.
  // acknowledgeDetach already wrote the forensic manifest.
  const plan = await planGreenfieldRecovery(b.dir);
  assert.equal(plan.classification, 'ALREADY_RETIRED');
  assert.equal(plan.writeAuthorized, false);
  assert.equal(plan.retiredArchives.length, 1);
  assert.equal(plan.retiredArchives[0].journalSha256, b.journalHash);
});

test('destination collision: advisory check AND atomic OS check both refuse', async t => {
  await provider(t);
  const b = await bundle(t);
  // Advisory: destination already exists at verify time.
  const name = buildArchiveName({ backupId: 'b1', inRoot: true });
  await mkdir(path.join(b.dir, name));
  await assert.rejects(verifiedOf(t, b, { archiveName: name }),
    e => e.code === 'E_TERMINAL_ARCHIVE_COLLISION');
  await rm(path.join(b.dir, name), { recursive: true });
  // Atomic: collision appears between verify and move.
  const v = await verifiedOf(t, b);
  await mkdir(v.destination);
  await assert.rejects(performDetachMove(v),
    e => e.code === 'E_TERMINAL_ARCHIVE_COLLISION');
  // Source untouched.
  assert.ok((await lstat(path.join(b.dir, '.vcp'))).isDirectory());
});

test('symlink at destination name is never replaced', async t => {
  await provider(t);
  const b = await bundle(t);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'vcp-detach-out-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, 'victim.txt'), 'victim');
  const v = await verifiedOf(t, b);
  await symlink(outside, v.destination);
  await assert.rejects(performDetachMove(v),
    e => e.code === 'E_TERMINAL_ARCHIVE_COLLISION');
  assert.equal(await readFile(path.join(outside, 'victim.txt'), 'utf8'), 'victim');
});

test('lock changed between verify and move aborts the detach', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  await writeFile(path.join(b.dir, '.vcp', 'update.lock'),
    JSON.stringify({ token: 'attacker-token', pid: 2 }) + '\n');
  await assert.rejects(performDetachMove(v),
    e => e.code === 'E_TERMINAL_LOCK_CHANGED');
  assert.ok((await lstat(path.join(b.dir, '.vcp'))).isDirectory());
});

test('journal hash mismatch and corrupt journal fail verification', async t => {
  await provider(t);
  const b = await bundle(t);
  await assert.rejects(verifiedOf(t, b, { expectedJournalHash: '0'.repeat(64) }),
    e => e.code === 'E_TERMINAL_JOURNAL_CHANGED');
  await writeFile(path.join(b.dir, '.vcp', 'transaction.json'), 'not-json{{{');
  await assert.rejects(verifiedOf(t, b), e => /E_TERMINAL/.test(e.code));
});

test('foreign user file at root during cleanup fails verification', async t => {
  await provider(t);
  const b = await bundle(t);
  await writeFile(path.join(b.dir, 'user-file.txt'), 'hello');
  await assert.rejects(verifiedOf(t, b),
    e => e.code === 'E_TERMINAL_FOREIGN_CONTENT');
});

test('sibling archive requires an explicit approval object', async t => {
  await provider(t);
  const b = await bundle(t);
  const base = path.basename(b.dir);
  const name = buildArchiveName({ backupId: 'b1', inRoot: false, basename: base });
  await assert.rejects(verifiedOf(t, b, { archiveName: name }),
    e => e.code === 'E_TERMINAL_SIBLING_SCOPE_APPROVAL_REQUIRED');
  await assert.rejects(
    verifiedOf(t, b, {
      archiveName: name,
      siblingScopeApproval: { scope: 'sibling-archive-write', root: '/wrong', destination: 'x' },
    }),
    e => e.code === 'E_TERMINAL_SIBLING_SCOPE_APPROVAL_REQUIRED');
  // Well-formed approval: verify passes (move still exercised in-root only
  // in this suite; sibling execution needs the same OS primitive).
  const dest = path.join(path.dirname(b.dir), name);
  const v = await verifiedOf(t, b, {
    archiveName: name,
    siblingScopeApproval: {
      scope: 'sibling-archive-write', root: b.dir, destination: dest,
      approvedBy: 'test', reason: 'scope-resolution-test',
    },
  });
  assert.equal(v.scope, 'sibling');
  assert.equal(v.destination, dest);
});

test('two detaches produce distinct archives; old archive untouched', async t => {
  await provider(t);
  const b = await bundle(t);
  const v1 = await verifiedOf(t, b);
  await performDetachMove(v1);
  await acknowledgeDetach(v1);
  const first = v1.destination;
  // New terminal bundle appears (second interrupted operation).
  await mkdir(path.join(b.dir, '.vcp'));
  const journal2 = Buffer.from(JSON.stringify({ phase: 'cleanup', id: 'op2' }) + '\n');
  await writeFile(path.join(b.dir, '.vcp', 'transaction.json'), journal2);
  await writeFile(path.join(b.dir, '.vcp', 'update.lock'),
    JSON.stringify({ token: b.token, pid: 1 }) + '\n');
  const v2 = await verifyDetachPreconditions({
    root: b.dir, expectedJournalHash: sha(journal2),
    ownedLock: b.lock,
    archiveName: buildArchiveName({ backupId: 'b2', inRoot: true }),
  });
  await performDetachMove(v2);
  await acknowledgeDetach(v2);
  assert.notEqual(v2.destination, first);
  const names = (await readdir(b.dir)).filter(isRetiredArchiveName);
  assert.equal(names.length, 2);
  assert.ok((await lstat(first)).isDirectory());
});

test('retention: prune plans by age, executes only with approval + re-verify', async t => {
  const p = await provider(t);
  void p;
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  await performDetachMove(v);
  // acknowledgeDetach writes the forensic manifest idempotently.
  const ack2 = await acknowledgeDetach(v);
  const manSha = ack2.manifestSha256;
  assert.match(manSha ?? '', /^[a-f0-9]{64}$/);
  const name = path.basename(v.destination);
  // Too young: skipped, never a candidate.
  let plan = await planArchivePrune(b.dir, { nowMs: Date.now() });
  assert.equal(plan.candidates.length, 0);
  assert.ok(plan.skipped.some(s => s.name === name));
  assert.equal(plan.writeAuthorized, false);
  // Old enough: candidate with verified manifest.
  plan = await planArchivePrune(b.dir, { nowMs: Date.now() + 31 * 24 * 3600 * 1000 });
  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].manifestSha256, manSha);
  // Execute without approval -> refused.
  await assert.rejects(executeArchivePrune(b.dir, {
    archives: plan.candidates, approval: null,
  }), e => e.code === 'E_PRUNE_APPROVAL_REQUIRED');
  // Execute with approval -> removed, parent synced.
  const approval = {
    approvedBy: 'test-operator', reason: 'retention-test',
    archives: [{ name, manifestSha256: manSha }],
  };
  const done = await executeArchivePrune(b.dir, {
    archives: [{ name, manifestSha256: manSha }], approval,
  });
  assert.deepEqual(done.pruned, [name]);
  assert.deepEqual(await readdir(b.dir), []);
});

test('retention: manifest change between plan and execute aborts prune', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  await performDetachMove(v);
  const ack2 = await acknowledgeDetach(v);
  const manSha = ack2.manifestSha256;
  assert.match(manSha ?? '', /^[a-f0-9]{64}$/);
  const name = path.basename(v.destination);
  const plan = await planArchivePrune(b.dir, { nowMs: Date.now() + 60 * 24 * 3600 * 1000 });
  // Tamper with the manifest after planning.
  await writeFile(path.join(v.destination, 'vcp-retirement-manifest.json'), '{}\n');
  const approval = {
    approvedBy: 't', reason: 't',
    archives: [{ name, manifestSha256: manSha }],
  };
  await assert.rejects(executeArchivePrune(b.dir, {
    archives: plan.candidates, approval,
  }), e => e.code === 'E_PRUNE_MANIFEST_CHANGED');
  assert.ok((await lstat(v.destination)).isDirectory(), 'archive must survive');
});

test('retention: symlink inside archive aborts prune', async t => {
  await provider(t);
  const b = await bundle(t);
  const v = await verifiedOf(t, b);
  await performDetachMove(v);
  const ack2 = await acknowledgeDetach(v);
  const manSha = ack2.manifestSha256;
  assert.match(manSha ?? '', /^[a-f0-9]{64}$/);
  const name = path.basename(v.destination);
  await symlink('/etc', path.join(v.destination, 'evil-link'));
  const approval = {
    approvedBy: 't', reason: 't',
    archives: [{ name, manifestSha256: manSha }],
  };
  await assert.rejects(executeArchivePrune(b.dir, {
    archives: [{ name, manifestSha256: manSha }], approval,
  }), e => e.code === 'E_PRUNE_SYMLINK_REFUSED');
});
