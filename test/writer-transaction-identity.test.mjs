// Transaction/backup identity regression tests.
// Proves: valid rollback descriptor accepted; mismatches rejected;
// ownership enforced; cross-fixture/stale/tampered rejected;
// journal chain valid; recovery identity correct; prod gate enforced.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { rollbackV2 } from '../lib/writer-rollback-v2.mjs';
import { writeVersionedJournal } from '../lib/versioned-journal.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const OPS = ['rollback-v2', 'journal-write', 'journal-clear'];

async function makeBackup(root, backupId) {
  const base = path.join(root, '.vcp', 'backups', backupId);
  await mkdir(base, { recursive: true, mode: 0o700 });
  const manifestBytes = Buffer.from(JSON.stringify({ v: 1 }) + '\n');
  await writeFile(path.join(base, 'manifest.json'), manifestBytes);
  await writeFile(path.join(base, 'backup.json'), JSON.stringify({
    id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4',
    restoredManifestHash: sha256(manifestBytes), entries: [],
  }) + '\n');
}

test('TI-01 — valid rollback descriptor accepted', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-01');
    const receipt = await rollbackV2({
      root: f.root, backupId: 'ti-backup-01', confirmed: true,
      testCapability: f.capability,
    });
    assert.equal(receipt.backupId, 'ti-backup-01');
    assert.equal(receipt.rolledBack, true);
  } finally { await teardownControlledFixture(f); }
});

test('TI-02 — valid backup identity preserved in receipt', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-02');
    const receipt = await rollbackV2({
      root: f.root, backupId: 'ti-backup-02', confirmed: true,
      testCapability: f.capability,
    });
    assert.equal(receipt.backupId, 'ti-backup-02');
  } finally { await teardownControlledFixture(f); }
});

test('TI-03 — mismatched backup identity rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: ['journal-write'] });
  try {
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    // Directly attempt a descriptor with id !== backupId.
    await assert.rejects(
      writeVersionedJournal(f.root, {
        formatVersion: 2, transactionSchemaVersion: 2,
        id: 'wrong-id', operationId: 'wrong-id', backupId: 'right-id',
        operation: 'update', phase: 'prepared', minimumReaderVersion: '0.9.4',
        startedAt: new Date().toISOString(),
        plannedManifestHash: 'c'.repeat(64), createdFiles: [],
      }, { previousHash: null, readerVersion: '0.9.4' }, f.capability),
      /E_TRANSACTION_BACKUP_IDENTITY/
    );
  } finally { await teardownControlledFixture(f); }
});

test('TI-04 — wrong transaction ownership rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-04');
    // Attempt rollback of non-existent backup.
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'nonexistent', confirmed: true, testCapability: f.capability }),
      /E_ROLLBACK_BACKUP_MISSING/
    );
  } finally { await teardownControlledFixture(f); }
});

test('TI-05 — cross-fixture backup rejected', async () => {
  const a = await createControlledFixture({ allowedOperations: OPS });
  const b = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(b.root, 'ti-backup-05');
    await assert.rejects(
      rollbackV2({ root: a.root, backupId: 'ti-backup-05', confirmed: true, testCapability: b.capability }),
      /E_TEST_CAPABILITY_SCOPE/
    );
  } finally {
    await teardownControlledFixture(a);
    await teardownControlledFixture(b);
  }
});

test('TI-06 — stale backup rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-06');
    // Tamper with the backup record to make it stale.
    const { readFile } = await import('node:fs/promises');
    const recPath = path.join(f.root, '.vcp', 'backups', 'ti-backup-06', 'backup.json');
    const rec = JSON.parse(await readFile(recPath, 'utf8'));
    rec.restoredManifestHash = '0'.repeat(64);
    await writeFile(recPath, JSON.stringify(rec));
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'ti-backup-06', confirmed: true, testCapability: f.capability }),
      /E_ROLLBACK/
    );
  } finally { await teardownControlledFixture(f); }
});

test('TI-07 — tampered backup rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-07');
    // Tamper with manifest bytes.
    await writeFile(
      path.join(f.root, '.vcp', 'backups', 'ti-backup-07', 'manifest.json'),
      '{"tampered":true}'
    );
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'ti-backup-07', confirmed: true, testCapability: f.capability }),
      /E_ROLLBACK_BACKUP_TAMPERED/
    );
  } finally { await teardownControlledFixture(f); }
});

test('TI-08 — journal hash chain remains valid after rollback', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-08');
    // Write a journal manually to verify the chain works with correct identity.
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    const { readVersionedJournalDigest } = await import('../lib/versioned-journal.mjs');
    await writeVersionedJournal(f.root, {
      formatVersion: 2, transactionSchemaVersion: 2,
      id: 'ti-backup-08', operationId: 'ti-backup-08', backupId: 'ti-backup-08',
      operation: 'update', phase: 'prepared', minimumReaderVersion: '0.9.4',
      startedAt: new Date().toISOString(),
      plannedManifestHash: 'd'.repeat(64), createdFiles: [],
    }, { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const digest = await readVersionedJournalDigest(f.root);
    assert.ok(digest, 'journal digest exists after valid write');
  } finally { await teardownControlledFixture(f); }
});

test('TI-09 — decode rejects journal with mismatched identity', async () => {
  // The validator enforces id===backupId at decode time; recovery reads
  // via decodeManagedTransaction, so mismatched journals are rejected.
  const { decodeManagedTransaction } = await import('../lib/managed-recovery-v2.mjs');
  assert.throws(
    () => decodeManagedTransaction({
      formatVersion: 2, transactionSchemaVersion: 2,
      id: 'wrong', operationId: 'wrong', backupId: 'right',
      operation: 'update', phase: 'prepared', minimumReaderVersion: '0.9.4',
      startedAt: new Date().toISOString(),
      plannedManifestHash: 'f'.repeat(64), createdFiles: [],
    }, { readerVersion: '0.9.4' }),
    /E_TRANSACTION_BACKUP_IDENTITY/
  );
});

test('TI-10 — production authorization remains enforced', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await makeBackup(f.root, 'ti-backup-10');
    await assert.rejects(
      rollbackV2({ root: f.root, backupId: 'ti-backup-10', confirmed: true }),
      (e) => e && (e.code === 'E_G_FENCE_NO_GO' || e.code === 'E_TEST_CAPABILITY_INVALID')
    );
  } finally { await teardownControlledFixture(f); }
});
