// P6-02 — v2 update path tests, and the P6-03 end-to-end evidence chain.
//
// A v2 update runs on a schema-v1 project whose files hold STALE
// (0.9.0) template bytes: the live file, its baseline file under
// .vcp/baselines/, and the manifest entry's baselineHash are all set
// to the old bytes, so planUpdate emits real UPDATE actions (a plain
// version downgrade alone yields only NOOPs — the template content did
// not change between 0.9.0 and 0.9.4).
//
// The chain tests prove the point of P6: a v2 update populates
// postApplyFiles, and the CLI dispatch then restores through
// rollbackV2 — or refuses when the user edited a file after the update.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { applyUpdateV2 } from '../lib/update-apply-v2.mjs';
import { rollbackDispatch } from '../lib/rollback-dispatch.mjs';
import { decodeBackupMetadata, decodeManagedTransaction }
  from '../lib/managed-recovery-v2.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { createControlledFixture, teardownControlledFixture }
  from './helpers/controlled-writer-fixture.mjs';

const LANE_APPROVED_FOR_EXECUTION = true;
const gate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['update-v2', 'journal-write', 'journal-clear', 'rollback-v2'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const OLD = Buffer.from('OLD TEMPLATE CONTENT FROM 0.9.0\n');
const USER_EDIT = Buffer.from('USER EDIT AFTER THE V2 UPDATE - must survive\n');

const STALE = ['AGENTS.md', 'docs/00-START-HERE.md'];

// Seed a schema-v1 project, downgrade it to 0.9.0, and stale the given
// files (live + baseline + baselineHash all set to the old bytes).
// `remove` lists files to delete from disk AND the manifest, so the
// plan emits ADD for them. Returns the pre-update manifest bytes and
// the original (0.9.4) bytes of the staled files.
async function seedStaleV1Project(f, { stale = STALE, remove = [] } = {}) {
  await seedLegacyV1Fixture({ targetDir: f.root });
  const mpath = path.join(f.root, '.vcp', 'manifest.json');
  const m = JSON.parse(await readFile(mpath, 'utf8'));
  m.installedVersion = '0.9.0';
  for (const e of Object.values(m.managedFiles ?? {})) e.templateVersion = '0.9.0';
  const originals = {};
  for (const rel of stale) {
    originals[rel] = await readFile(path.join(f.root, rel));
    await writeFile(path.join(f.root, rel), OLD);
    await writeFile(path.join(f.root, '.vcp', 'baselines', rel), OLD);
    m.managedFiles[rel].baselineHash = sha256(OLD);
  }
  for (const rel of remove) {
    await rm(path.join(f.root, rel), { force: true });
    delete m.managedFiles[rel];
  }
  // The pre-update manifest is the DOWNGRADED one (0.9.0): that is what
  // the v2 update backs up and what a rollback restores.
  const oldManifestBytes = Buffer.from(JSON.stringify(m, null, 2) + '\n');
  await writeFile(mpath, oldManifestBytes);
  return { oldManifestBytes, originals };
}

const update = (f, extra = {}) =>
  applyUpdateV2({ targetDir: f.root, testCapability: f.capability, ...extra });
const dispatch = (f) =>
  rollbackDispatch({ targetDir: f.root, testCapability: f.capability });

// --- the v2 update itself ---

gate('P6-02-U1 — full v2 update: backup is v2-shaped, journal committed with postApplyFiles, manifest migrated', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const { oldManifestBytes, originals } = await seedStaleV1Project(f);
    const result = await update(f);
    assert.equal(result.applied, true);
    assert.equal(result.v2, true);
    assert.ok(result.backupId, 'a backup id is returned');

    // Managed files hold the new template bytes.
    for (const rel of STALE)
      assert.deepEqual(await readFile(path.join(f.root, rel)), originals[rel]);

    // Live manifest is schema 2 with the 1->2 migration provenance.
    const liveManifestBytes = await readFile(path.join(f.root, '.vcp', 'manifest.json'));
    const liveManifest = JSON.parse(liveManifestBytes.toString('utf8'));
    assert.equal(liveManifest.schemaVersion, 2);
    assert.equal(liveManifest.install.assetSet, 'legacy-full-v1');
    assert.deepEqual(liveManifest.migrationProvenance,
      { fromSchema: 1, toSchema: 2, source: 'legacy-full-v1' });
    assert.equal(result.manifestHash, sha256(liveManifestBytes));

    // Backup record decodes as a v2 record with production-shaped
    // entries carrying the pre-update hashes.
    const backupRaw = await readFile(
      path.join(f.root, '.vcp', 'backups', result.backupId, 'backup.json'), 'utf8');
    const backupRecord = JSON.parse(backupRaw);
    // The decoded summary proves the record is a well-formed v2 record
    // (it validates every entry); the raw record carries the entries.
    const backup = decodeBackupMetadata(backupRecord,
      { readerVersion: '0.9.4' });
    assert.equal(backup.formatVersion, 2);
    // A full pre-update snapshot: every managed file the plan touched.
    assert.ok(backup.entries >= STALE.length);
    const agentsEntry = backupRecord.entries.find((e) => e.path === 'AGENTS.md');
    assert.ok(agentsEntry, 'backup has an AGENTS.md entry');
    assert.equal(agentsEntry.exists, true);
    assert.equal(agentsEntry.sha256, sha256(OLD));
    assert.deepEqual(
      await readFile(path.join(f.root, '.vcp', 'backups', result.backupId, 'manifest.json')),
      oldManifestBytes);

    // Journal is committed, retained, and carries postApplyFiles whose
    // hashes match the live bytes; planned === committed === live.
    const journalRaw = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    const journal = decodeManagedTransaction(JSON.parse(journalRaw),
      { readerVersion: '0.9.4' });
    assert.equal(journal.phase, 'committed');
    assert.ok(journal.postApplyFiles.length >= STALE.length);
    for (const rel of STALE) {
      const entry = journal.postApplyFiles.find((e) => e.path === rel);
      assert.ok(entry, `postApplyFiles has ${rel}`);
      assert.equal(entry.sha256, sha256(originals[rel]));
    }
    assert.equal(journal.plannedManifestHash, sha256(liveManifestBytes));
    assert.equal(journal.committedManifestHash, sha256(liveManifestBytes));
    assert.equal(result.backupId, journal.backupId);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-02-U2 — up-to-date schema-v1 project: no-op, no backup, no journal', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await seedLegacyV1Fixture({ targetDir: f.root });
    const result = await update(f);
    assert.equal(result.applied, false);
    assert.equal(result.backupId, null);
    await assert.rejects(() => stat(path.join(f.root, '.vcp', 'transaction.json')),
      (e) => e.code === 'ENOENT');
  } finally { await teardownControlledFixture(f); }
});

gate('P6-02-U3 — DELETE in the plan refuses (v2 update does not support DELETE/RENAME yet)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await seedStaleV1Project(f);
    // An extra managed file that is NOT in the desired set, so the
    // migration removal yields a DELETE action.
    const mpath = path.join(f.root, '.vcp', 'manifest.json');
    const m = JSON.parse(await readFile(mpath, 'utf8'));
    await writeFile(path.join(f.root, 'docs', 'extra.md'), Buffer.from('EXTRA\n'));
    await writeFile(path.join(f.root, '.vcp', 'baselines', 'docs', 'extra.md'),
      Buffer.from('EXTRA\n'));
    m.managedFiles['docs/extra.md'] = {
      ...m.managedFiles['docs/00-START-HERE.md'],
      baselineHash: sha256(Buffer.from('EXTRA\n')),
      baselinePath: '.vcp/baselines/docs/extra.md' };
    await writeFile(mpath, JSON.stringify(m, null, 2) + '\n');
    await assert.rejects(() => update(f, { migrations: [{
      id: 'remove-extra', from: '0.9.0', to: '0.9.4',
      renames: [], removals: ['docs/extra.md'] }] }),
      /V2 update does not support DELETE or RENAME/);
    // Nothing was written: the stale files are untouched.
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), OLD);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-02-U4 — failure mid-apply restores pre-update bytes and leaves the journal', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await seedStaleV1Project(f, { stale: ['AGENTS.md'] });
    const mpath = path.join(f.root, '.vcp', 'manifest.json');
    const m = JSON.parse(await readFile(mpath, 'utf8'));
    // One ADD whose parent exists (written before the failure) and a
    // whole ADD directory whose parent does not (the failure: the
    // atomic writer requires the parent directory to exist). ADDs sort
    // before UPDATEs, so the stale AGENTS.md update is never reached.
    await rm(path.join(f.root, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'));
    delete m.managedFiles['.github/ISSUE_TEMPLATE/bug_report.yml'];
    await rm(path.join(f.root, 'docs'), { recursive: true, force: true });
    for (const key of Object.keys(m.managedFiles))
      if (key.startsWith('docs/')) delete m.managedFiles[key];
    await writeFile(mpath, JSON.stringify(m, null, 2) + '\n');
    let thrown = null;
    try { await update(f); } catch (e) { thrown = e; }
    assert.ok(thrown, 'the update throws');
    assert.ok(!/Automatic restore incomplete/.test(thrown.message),
      'the restore succeeded, so the original error is rethrown, not the compound error');
    // The file added before the failure was deleted by the restore
    // (F-P6-4); the stale file was never touched.
    await assert.rejects(
      () => stat(path.join(f.root, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml')),
      (e) => e.code === 'ENOENT');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), OLD);
    // The journal exists and is NOT committed; the backup exists.
    const journal = decodeManagedTransaction(JSON.parse(
      await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8')),
      { readerVersion: '0.9.4' });
    assert.ok(['prepared', 'applying'].includes(journal.phase));
    const backups = await readFile(
      path.join(f.root, '.vcp', 'backups', journal.backupId, 'backup.json'), 'utf8');
    assert.ok(JSON.parse(backups).id === journal.backupId);
  } finally { await teardownControlledFixture(f); }
});

// --- the end-to-end evidence chain ---

gate('P6-03-U5a — v2 update, no edits: dispatch restores pre-update bytes and the schema-1 manifest', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const { oldManifestBytes } = await seedStaleV1Project(f);
    const updated = await update(f);
    assert.equal(updated.applied, true);
    const result = await dispatch(f);
    assert.equal(result.rolledBack, true);
    assert.equal(result.postApplyEvidence, 'journal');
    for (const rel of STALE)
      assert.deepEqual(await readFile(path.join(f.root, rel)), OLD);
    assert.deepEqual(
      await readFile(path.join(f.root, '.vcp', 'manifest.json')), oldManifestBytes);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-03-U5b — v2 update, user edits a file: dispatch refuses and the edit survives', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await seedStaleV1Project(f);
    const updated = await update(f);
    assert.equal(updated.applied, true);
    await writeFile(path.join(f.root, 'AGENTS.md'), USER_EDIT);
    await assert.rejects(() => dispatch(f),
      (e) => e.code === 'E_ROLLBACK_POST_APPLY_EDITS');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gate('P6-03-U5c — v2 update ADDS a file: dispatch deletes it', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const { originals } = await seedStaleV1Project(f,
      { remove: ['docs/00-START-HERE.md'] });
    const updated = await update(f);
    assert.equal(updated.applied, true);
    assert.deepEqual(
      await readFile(path.join(f.root, 'docs', '00-START-HERE.md')),
      originals['docs/00-START-HERE.md']);
    const result = await dispatch(f);
    assert.equal(result.rolledBack, true);
    await assert.rejects(
      () => stat(path.join(f.root, 'docs', '00-START-HERE.md')),
      (e) => e.code === 'ENOENT');
  } finally { await teardownControlledFixture(f); }
});

gate('P6-03-U5d — v2 update ADDS a file, user edits it: dispatch refuses and the edit survives', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await seedStaleV1Project(f, { remove: ['docs/00-START-HERE.md'] });
    const updated = await update(f);
    assert.equal(updated.applied, true);
    await writeFile(path.join(f.root, 'docs', '00-START-HERE.md'), USER_EDIT);
    await assert.rejects(() => dispatch(f),
      (e) => e.code === 'E_ROLLBACK_POST_APPLY_EDITS');
    assert.deepEqual(
      await readFile(path.join(f.root, 'docs', '00-START-HERE.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

// --- wiring is not activation ---

test('P6-02-U6 — v2 update in production mode refuses E_G_FENCE_NO_GO', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-p6-02-u6-'));
  await seedLegacyV1Fixture({ targetDir: root });
  const mpath = path.join(root, '.vcp', 'manifest.json');
  const m = JSON.parse(await readFile(mpath, 'utf8'));
  m.installedVersion = '0.9.0';
  for (const e of Object.values(m.managedFiles ?? {})) e.templateVersion = '0.9.0';
  await writeFile(mpath, JSON.stringify(m, null, 2) + '\n');
  await assert.rejects(() => applyUpdateV2({ targetDir: root }),
    (e) => e.code === 'E_G_FENCE_NO_GO');
});
