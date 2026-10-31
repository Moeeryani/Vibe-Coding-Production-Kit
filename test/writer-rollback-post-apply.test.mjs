// P4-02c — rollbackV2 post-apply fail-closed check, as strengthened by P5-02.
//
// A rollback restores the backup bytes over the current bytes of
// every backup entry, so a user edit made AFTER the backup is
// destroyed by a successful restore (proven by the gap probe:
// ~/workspace/vcp-p4-full/evidence/probe-rollback-gap.mjs).
//
// P4-02c fixed the case where a committed Stage 13 adoption
// transaction exists: each restored entry it covers is compared
// against its recorded post-apply hash (tx item newSha256), and a
// difference refuses with E_ROLLBACK_POST_APPLY_EDITS before any
// mutation. P5-02 closes the remaining gap: WITHOUT such a record
// the P4 check was inapplicable and the restore proceeded, destroying
// post-backup edits. The P5 rule judges EVERY restored file against
// the best available evidence (Stage 13 tx, committed versioned
// journal with postApplyFiles, or the backup record itself) and
// refuses with E_ROLLBACK_EVIDENCE_MISSING or
// E_ROLLBACK_STALE_TRANSACTION when a change has no accounting
// record. Tests P4-02c-03/-05/-06/-07/-08 were UPDATED for this
// deliberate, directive-authorized behavior change to the dormant
// rollbackV2 path (it has no CLI caller; live `vcp rollback` still
// uses frozen v1 rollbackProject). See design.md §6.2.
//
// Controlled lane only: disposable fixtures, gate-bypassed
// mutations through the controlled lane. See
// B4-B5-CONTROLLED-LANE-SECURITY-REVIEW.md.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
const gateNestedMut = (name, fn) => mutationTest(name, fn);
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';
import { atomicWriteFile } from '../lib/writer-atomic.mjs';
import { acquireLifecycleLock } from '../lib/lifecycle-lock-v2.mjs';
import { describeStage13Transaction } from '../lib/stage13-transaction.mjs';

// SECURITY GATE: set true ONLY after explicit owner approval.
// OWNER AUTHORIZATION GRANTED 2026-10-14: B-4/B-5 controlled validation execution.
// P4-02c runs under the same owner-authorized P4 campaign (Issue #113).
const LANE_APPROVED_FOR_EXECUTION = true;
const gate = (name, fn) => test(name, { skip: !LANE_APPROVED_FOR_EXECUTION }, fn);

const OPS = ['rollback-v2', 'journal-write', 'journal-clear'];
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const ORIGINAL = Buffer.from('PROTECTED ORIGINAL USER BYTES\n');
const APPLIED = Buffer.from('APPLIED BYTES AFTER ADOPTION\n');
const USER_EDIT = Buffer.from('USER EDIT AFTER BACKUP - must survive\n');

// Backup capturing AGENTS.md with the ORIGINAL (pre-apply) bytes,
// plus a manifest. Mirrors makeTestBackup in
// writer-controlled-rollback.test.mjs, extended with file entries.
async function makeTestBackup(root, backupId, manifestObj, entries) {
  const base = path.join(root, '.vcp', 'backups', backupId);
  await mkdir(path.join(base, 'files'), { recursive: true, mode: 0o700 });
  const manifestBytes = Buffer.from(JSON.stringify(manifestObj, null, 2) + '\n');
  await writeFile(path.join(base, 'manifest.json'), manifestBytes);
  const recordEntries = [];
  for (const { relative, bytes } of entries) {
    await writeFile(path.join(base, 'files', relative), bytes);
    recordEntries.push({ relative, sha256: sha256(bytes) });
  }
  const record = {
    id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4',
    restoredManifestHash: sha256(manifestBytes),
    entries: recordEntries,
  };
  await writeFile(path.join(base, 'backup.json'), JSON.stringify(record, null, 2) + '\n');
  return { manifestBytes, record };
}

// A committed Stage13 adoption transaction for this root, covering
// AGENTS.md with the APPLIED post-apply bytes and the current
// manifest hash. Built with the product's own descriptor so the
// transaction validates.
async function writeCommittedStage13Tx(root, { phase = 'committed', items, manifestSha256 }) {
  const st = await lstat(root, { bigint: true });
  const rootIdentity = sha256(Buffer.from(root + '|' + st.dev + '|' + st.ino));
  const tx = describeStage13Transaction({
    id: 'adopt-20261031-01', rootIdentity,
    consentFingerprint: 'b'.repeat(64),
    manifestSha256, minimumReaderVersion: '0.9.4',
    createdAt: '2026-10-31T00:00:00.000Z', phase,
    items, createdDirectories: []
  });
  await writeFile(path.join(root, '.vcp', 'transaction.json'),
    JSON.stringify(tx, null, 2) + '\n');
  return tx;
}

// The adoption item for AGENTS.md: kind 'managed-section' (the apply
// composes a section into the existing file, preserving the user's
// preimage). A 'whole-file' item requires oldSha256 null (created by
// the apply), so it cannot model an adopted existing file.
// newSha256 is the post-apply whole-document hash — the value the
// rollback check compares against.
function agentsSectionItem() {
  return { path: 'AGENTS.md', kind: 'managed-section', sectionId: 'agent-routing',
    stagedDev: '7', stagedIno: '9',
    oldSha256: sha256(ORIGINAL), oldMode: 0o644,
    originalDev: '7', originalIno: '11',
    newSha256: sha256(APPLIED), baselineSha256: sha256(ORIGINAL) };
}

async function setupBackupFixture(f, backupId) {
  // Current state: AGENTS.md holds the APPLIED bytes; a v2 manifest exists.
  await atomicWriteFile(f.root, 'AGENTS.md', APPLIED, { mode: 0o644 });
  // makeTestBackup first: its mkdir creates .vcp, which the manifest
  // write below needs (as in B5-01).
  await makeTestBackup(f.root, backupId, { schemaVersion: 2, v: 1 },
    [{ relative: 'AGENTS.md', bytes: ORIGINAL }]);
  const manifestBytes = Buffer.from('{"schemaVersion":2,"v":1}\n');
  await atomicWriteFile(f.root, '.vcp/manifest.json', manifestBytes,
    { mode: 0o600, managedState: true });
  return { manifestBytes, manifestSha256: sha256(manifestBytes) };
}

gateNestedMut('P4-02c-01 — post-apply edit refuses rollback, no mutation', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-01';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256,
      items: [agentsSectionItem()]
    });
    // The user edits AGENTS.md AFTER the backup (and after the apply).
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_POST_APPLY_EDITS' && /AGENTS\.md/.test(e.message));
    // Nothing was mutated: the edit and the manifest both survive.
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
    assert.equal(sha256(await readFile(path.join(f.root, '.vcp', 'manifest.json'))), manifestSha256);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P4-02c-02 — post-apply deletion refuses rollback', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-02';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256,
      items: [agentsSectionItem()]
    });
    // The user deletes AGENTS.md after the apply; restoring would resurrect it.
    await rm(path.join(f.root, 'AGENTS.md'));
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_POST_APPLY_EDITS' && /deleted since apply/.test(e.message));
    await assert.rejects(() => readFile(path.join(f.root, 'AGENTS.md')), { code: 'ENOENT' });
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R1 — no post-apply record: unaccounted edit refuses, edit survives', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-03';
    await setupBackupFixture(f, backupId);
    // No .vcp/transaction.json at all. P4-02c let the restore proceed
    // here (not-applicable) and the user edit was lost — the recorded
    // residual gap. P5-02 closes it: a change with no accounting
    // record refuses E_ROLLBACK_EVIDENCE_MISSING before any mutation.
    // (P4-02c-03, updated for the P5-02 behavior change.)
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING' && /no-post-apply-record/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P4-02c-04 — post-apply record present, no edits: restore proceeds, receipt says passed', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-04';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    await writeCommittedStage13Tx(f.root, {
      manifestSha256,
      items: [agentsSectionItem()]
    });
    // No user edit: current bytes still match the post-apply record.
    const receipt = await rollbackV2({
      root: f.root, backupId, confirmed: true, testCapability: f.capability,
    });
    assert.equal(receipt.rolledBack, true);
    assert.equal(receipt.postApplyCheck, 'passed');
    assert.ok(receipt.postApplyCovered.includes('AGENTS.md'));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), ORIGINAL);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R6a — malformed versioned journal: unaccounted edit refuses', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-05';
    await setupBackupFixture(f, backupId);
    // A versioned update journal shares the .vcp/transaction.json
    // path but is a different schema; it must not be mistaken for
    // a Stage13 post-apply record. This fixture journal is also
    // malformed as a v2 journal (no backupId/startedAt), so no
    // post-apply evidence exists at all. P4-02c let the restore
    // proceed (not-applicable); P5-02 refuses E_ROLLBACK_EVIDENCE_MISSING.
    // (P4-02c-05, updated for the P5-02 behavior change.)
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify({ formatVersion: 2, transactionSchemaVersion: 2, operation: 'update',
        phase: 'cleanup', id: backupId }) + '\n');
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING' && /post-apply-record-malformed/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R2 — uncommitted transaction: stale record refuses, edit survives', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-06';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    // An 'applying' transaction has no completed post-apply state
    // to compare against. P4-02c let the restore proceed
    // (not-applicable); P5-02 refuses E_ROLLBACK_STALE_TRANSACTION:
    // the record exists but cannot vouch for the current state.
    // (P4-02c-06, updated for the P5-02 behavior change.)
    await writeCommittedStage13Tx(f.root, {
      phase: 'applying', manifestSha256,
      items: [agentsSectionItem()]
    });
    await atomicWriteFile(f.root, 'AGENTS.md', USER_EDIT, { mode: 0o644 });
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_STALE_TRANSACTION' && /transaction-not-committed/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), USER_EDIT);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P5-02-R5 — transaction covers no restored file: unaccounted change refuses', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-07';
    const { manifestSha256 } = await setupBackupFixture(f, backupId);
    // The record speaks about OTHER.md, not about AGENTS.md, so it
    // cannot judge the AGENTS.md restore. AGENTS.md currently holds
    // the APPLIED bytes while the backup holds ORIGINAL — a change
    // with no accounting record. P4-02c let the restore proceed
    // (not-applicable); P5-02 refuses E_ROLLBACK_EVIDENCE_MISSING.
    // (P4-02c-07, updated for the P5-02 behavior change.)
    await writeCommittedStage13Tx(f.root, {
      manifestSha256,
      items: [{ path: 'OTHER.md', kind: 'whole-file', oldSha256: null,
        stagedDev: '7', stagedIno: '9', newSha256: sha256(APPLIED),
        baselineSha256: sha256(APPLIED) }]
    });
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING' && /record-covers-other-files/.test(e.message));
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED);
  } finally { await teardownControlledFixture(f); }
});

gateNestedMut('P4-02c-08 — rollback refuses while the lifecycle lock is held (concurrency boundary)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    const backupId = 'p4-02c-08';
    await setupBackupFixture(f, backupId);
    // PH-06 boundary, pinned at the rollback layer: the lifecycle
    // lock serializes lock-holders (PN3-04 proves the primitive:
    // concurrent acquisition refuses, foreign lock never stolen).
    // A rollback attempted while another holder owns the lock must
    // refuse before any mutation, and the state must be untouched.
    // This does NOT prove PH-06 resolved: a writer that bypasses
    // the lock, or a check-then-act race outside the lock, is still
    // possible, and PH-06 remains UNRESOLVED. The containment gate
    // records it as a residual risk on every allow.
    const holder = await acquireLifecycleLock(f.root, { mode: 'recovery' });
    try {
      await assert.rejects(
        () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
        (e) => e.code === 'E_LOCK_ALREADY_HELD');
      assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED);
    } finally {
      await holder.release();
    }
    // After the holder releases, the same rollback is attempted
    // again. P4-02c expected it to succeed (no post-apply record
    // meant not-applicable); P5-02 refuses E_ROLLBACK_EVIDENCE_MISSING
    // instead — this fixture has no post-apply record and AGENTS.md
    // holds the APPLIED bytes while the backup holds ORIGINAL, an
    // unaccounted change. The lock-serialization property is what
    // this test pins; the refusal is the P5-02 behavior change.
    // (P4-02c-08 tail, updated for the P5-02 behavior change.)
    await assert.rejects(
      () => rollbackV2({ root: f.root, backupId, confirmed: true, testCapability: f.capability }),
      (e) => e.code === 'E_ROLLBACK_EVIDENCE_MISSING');
    assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), APPLIED);
  } finally { await teardownControlledFixture(f); }
});
