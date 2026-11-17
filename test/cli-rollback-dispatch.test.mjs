// P6-01 — CLI rollback dispatch tests.
//
// The dispatch routes `vcp rollback` to the handler that matches the
// project's state: the frozen v1 rollbackProject for v1 state,
// rollbackV2 for v2 state. The journal — not the manifest schema — is
// the routing authority (F-P6-3): a Stage 13 adoption leaves a
// schema-2 manifest behind, and routing on schema alone would send
// adoption state to rollbackV2, which cannot restore it.
//
// The v2 backups in these tests are built in the PRODUCTION shape
// ({path, exists, mode, sha256} entries via describeVersionedBackup),
// not the P5 test shape ({relative, sha256}) — the dispatch +
// rollbackV2 must restore production-shaped backups end to end (F-P6-1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, stat, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { rollbackDispatch } from '../lib/rollback-dispatch.mjs';
import { describeVersionedBackup, describeVersionedTransaction }
  from '../lib/managed-recovery-v2.mjs';
import { describeStage13Transaction }
  from '../lib/stage13-transaction.mjs';
import { createBackup } from '../lib/state.mjs';
import { createControlledFixture, teardownControlledFixture }
  from './helpers/controlled-writer-fixture.mjs';

const LANE_APPROVED_FOR_EXECUTION = true;
const gate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['rollback-v2', 'journal-write', 'journal-clear'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const ORIGINAL = Buffer.from('PROTECTED ORIGINAL USER BYTES\n');
const APPLIED = Buffer.from('APPLIED BYTES AFTER UPDATE\n');
const NEWBYTES = Buffer.from('NEW FILE ADDED BY THE UPDATE\n');

const OLD_MANIFEST = Buffer.from('{"schemaVersion":1,"installedVersion":"0.9.0"}\n');
const NEW_MANIFEST = Buffer.from('{"schemaVersion":2,"v":1}\n');

// A v2 backup in the PRODUCTION shape: entries are
// {path, exists, mode, sha256} (describeVersionedBackup), with the
// pre-update bytes under files/ and the pre-update manifest bytes as
// manifest.json. `files` maps path -> bytes for exists:true entries.
async function makeProductionBackup(root, backupId, files) {
  const base = path.join(root, '.vcp', 'backups', backupId);
  await mkdir(path.join(base, 'files'), { recursive: true, mode: 0o700 });
  await writeFile(path.join(base, 'manifest.json'), OLD_MANIFEST);
  const entries = [];
  for (const { rel, bytes, mode = 0o644 } of files) {
    if (bytes === null) {
      entries.push({ path: rel, exists: false });
      continue;
    }
    await mkdir(path.join(base, 'files', path.dirname(rel)),
      { recursive: true, mode: 0o700 });
    await writeFile(path.join(base, 'files', rel), bytes);
    entries.push({ path: rel, exists: true, mode, sha256: sha256(bytes) });
  }
  const record = describeVersionedBackup({
    id: backupId, operationId: backupId, operation: 'update',
    preLockSnapshot: { vcpDirectoryExisted: true, manifestExisted: true,
      baselinesExisted: false, lockBootstrapCreatedVcpDirectory: false,
      installedVersion: '0.9.0' },
    entries, minimumReaderVersion: '0.9.4',
    restoredManifestHash: sha256(OLD_MANIFEST) });
  await writeFile(path.join(base, 'backup.json'),
    JSON.stringify(record, null, 2) + '\n');
  return record;
}

async function writeCommittedJournal(root, { backupId, postApplyFiles = [] }) {
  const manifestHash = sha256(NEW_MANIFEST);
  const journal = describeVersionedTransaction({
    operationId: backupId, backupId, operation: 'update', phase: 'committed',
    minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
    plannedManifestHash: manifestHash,
    committedAt: new Date().toISOString(), committedManifestHash: manifestHash,
    postApplyFiles,
  });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify(journal, null, 2) + '\n');
  return journal;
}

async function writeCommittedStage13Tx(root) {
  const st = await lstat(root, { bigint: true });
  const identity = sha256(Buffer.from(root + '|' + st.dev + '|' + st.ino));
  const tx = describeStage13Transaction({
    id: 'adopt-20261031-01', rootIdentity: identity,
    consentFingerprint: 'b'.repeat(64),
    manifestSha256: sha256(NEW_MANIFEST), minimumReaderVersion: '0.9.4',
    createdAt: '2026-10-31T00:00:00.000Z', phase: 'committed',
    items: [{ path: 'AGENTS.md', kind: 'managed-section',
      sectionId: 'agent-routing', stagedDev: '7', stagedIno: '9',
      oldSha256: sha256(ORIGINAL), oldMode: 0o644,
      originalDev: '7', originalIno: '11',
      newSha256: sha256(APPLIED), baselineSha256: sha256(ORIGINAL) }],
    createdDirectories: [] });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify(tx, null, 2) + '\n');
  return tx;
}

// --- v1 state ---

test('P6-01-D1 — v1 state routes to v1 and restores (result shape unchanged)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-01-d1-'));
  const backup = await createBackup(root, [], { installedVersion: '0.8.0' });
  const result = await rollbackDispatch({ targetDir: root });
  assert.equal(result.backupId, backup.id);
  assert.equal(result.restoredVersion, '0.8.0');
});

test('P6-01-D6 — missing .vcp routes to v1 and keeps its error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-01-d6-'));
  await assert.rejects(() => rollbackDispatch({ targetDir: root }),
    /Rollback requires existing VCP lifecycle state/);
});

test('P6-01-D7 — a non-newest --backup keeps v1\'s newest-only error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-01-d7-'));
  await createBackup(root, [], { installedVersion: '0.8.0' });
  await assert.rejects(() => rollbackDispatch(
    { targetDir: root, backupId: 'not-the-newest' }),
    /VCP v0.9 supports rollback only to the newest backup/);
});

// --- corrupt / Stage 13 state ---

test('P6-01-D5 — corrupt journal refuses (readTransaction error propagates)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-01-d5-'));
  await mkdir(path.join(root, '.vcp'), { recursive: true });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    '{"broken": json');
  await assert.rejects(() => rollbackDispatch({ targetDir: root }),
    /Cannot read update transaction/);
});

test('P6-01-D4 — Stage 13 state refuses E_ROLLBACK_STAGE13_RECOVERY (schema-2 manifest does not reroute it)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-01-d4-'));
  await mkdir(path.join(root, '.vcp'), { recursive: true });
  await writeFile(path.join(root, '.vcp', 'manifest.json'), NEW_MANIFEST);
  await writeCommittedStage13Tx(root);
  await assert.rejects(() => rollbackDispatch({ targetDir: root }),
    (e) => e.code === 'E_ROLLBACK_STAGE13_RECOVERY'
      && /versioned recovery plan/.test(e.message));
});

// --- v2 state (controlled lane) ---

gate('P6-01-D2 — v2 journal state routes to v2 (journal evidence, production-shaped backup)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p6-01-d2';
    await makeProductionBackup(f.root, backupId,
      [{ rel: 'AGENTS.md', bytes: ORIGINAL }]);
    await writeFile(path.join(f.root, '.vcp', 'manifest.json'), NEW_MANIFEST);
    await writeFile(path.join(f.root, 'AGENTS.md'), APPLIED);
    await writeCommittedJournal(f.root, { backupId,
      postApplyFiles: [{ path: 'AGENTS.md', sha256: sha256(APPLIED) }] });
    const result = await rollbackDispatch(
      { targetDir: f.root, testCapability: f.capability });
    assert.equal(result.rolledBack, true);
    assert.equal(result.postApplyEvidence, 'journal');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
    assert.deepEqual(
      await readFile(path.join(f.root, '.vcp', 'manifest.json')), OLD_MANIFEST);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-01-D3 — v2 backup without journal routes to v2 (backup-hash evidence)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p6-01-d3';
    await makeProductionBackup(f.root, backupId,
      [{ rel: 'AGENTS.md', bytes: ORIGINAL }]);
    await writeFile(path.join(f.root, '.vcp', 'manifest.json'), OLD_MANIFEST);
    await writeFile(path.join(f.root, 'AGENTS.md'), ORIGINAL);
    const result = await rollbackDispatch(
      { targetDir: f.root, testCapability: f.capability });
    assert.equal(result.rolledBack, true);
    assert.equal(result.postApplyEvidence, 'backup-hash');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-01-D9 — v2 state with an added file: rollback deletes it (F-P6-2)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p6-01-d9';
    await makeProductionBackup(f.root, backupId, [
      { rel: 'AGENTS.md', bytes: ORIGINAL },
      { rel: 'NEW.md', bytes: null }]);
    await writeFile(path.join(f.root, '.vcp', 'manifest.json'), NEW_MANIFEST);
    await writeFile(path.join(f.root, 'AGENTS.md'), APPLIED);
    await writeFile(path.join(f.root, 'NEW.md'), NEWBYTES);
    await writeCommittedJournal(f.root, { backupId,
      postApplyFiles: [
        { path: 'AGENTS.md', sha256: sha256(APPLIED) },
        { path: 'NEW.md', sha256: sha256(NEWBYTES) }] });
    const result = await rollbackDispatch(
      { targetDir: f.root, testCapability: f.capability });
    assert.equal(result.rolledBack, true);
    assert.ok(result.restoredFiles.includes('NEW.md'));
    await assert.rejects(() => stat(path.join(f.root, 'NEW.md')),
      (e) => e.code === 'ENOENT');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-01-D8 — restored file keeps the backup entry\'s mode', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p6-01-d8';
    await makeProductionBackup(f.root, backupId,
      [{ rel: 'AGENTS.md', bytes: ORIGINAL, mode: 0o600 }]);
    await writeFile(path.join(f.root, '.vcp', 'manifest.json'), NEW_MANIFEST);
    await writeFile(path.join(f.root, 'AGENTS.md'), APPLIED);
    await writeCommittedJournal(f.root, { backupId,
      postApplyFiles: [{ path: 'AGENTS.md', sha256: sha256(APPLIED) }] });
    const result = await rollbackDispatch(
      { targetDir: f.root, testCapability: f.capability });
    assert.equal(result.rolledBack, true);
    const mode = (await stat(path.join(f.root, 'AGENTS.md'))).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally { await teardownControlledFixture(f); }
});

// --- wiring is not activation ---

test('P6-01-D10 — v2 state in production mode refuses E_G_FENCE_NO_GO', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-01-d10-'));
  const backupId = 'p6-01-d10';
  await makeProductionBackup(root, backupId,
    [{ rel: 'AGENTS.md', bytes: ORIGINAL }]);
  await writeFile(path.join(root, '.vcp', 'manifest.json'), NEW_MANIFEST);
  await writeFile(path.join(root, 'AGENTS.md'), APPLIED);
  await writeCommittedJournal(root, { backupId,
    postApplyFiles: [{ path: 'AGENTS.md', sha256: sha256(APPLIED) }] });
  await assert.rejects(() => rollbackDispatch({ targetDir: root }),
    (e) => e.code === 'E_G_FENCE_NO_GO');
});
