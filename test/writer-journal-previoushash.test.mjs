// Regression tests for the previousHash null-normalization fix.
// Covers: fresh creation, existing journal, stale hash, tamper,
// missing-journal mismatch, concurrent creation, revoked cap, prod refusal.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import { writeVersionedJournal } from '../lib/versioned-journal.mjs';

const OPS = ['journal-write'];
const desc = (id) => ({
  formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
  backupId: id, operation: 'update', phase: 'prepared',
  minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
  plannedManifestHash: 'b'.repeat(64), createdFiles: [],
});
async function withVcp(f) {
  await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
}

mutationTest('PH-01 — fresh journal creation with previousHash=null', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    await writeVersionedJournal(f.root, desc('ph1'), { previousHash: null, readerVersion: '0.9.4' }, f.capability);
  } finally { await teardownControlledFixture(f); }
});

mutationTest('PH-02 — existing valid journal accepts correct previousHash', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    const { readVersionedJournalDigest } = await import('../lib/versioned-journal.mjs');
    const base = desc('ph2a');
    await writeVersionedJournal(f.root, base, { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const h = await readVersionedJournalDigest(f.root);
    assert.ok(h, 'digest exists');
    await writeVersionedJournal(f.root, { ...base, phase: 'recovering' }, { previousHash: h, readerVersion: '0.9.4' }, f.capability);
  } finally { await teardownControlledFixture(f); }
});

mutationTest('PH-03 — stale previous hash rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    await writeVersionedJournal(f.root, desc('ph3a'), { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    await assert.rejects(
      writeVersionedJournal(f.root, desc('ph3b'), { previousHash: '0'.repeat(64), readerVersion: '0.9.4' }, f.capability),
      /E_JOURNAL_CHANGED/
    );
  } finally { await teardownControlledFixture(f); }
});

test('PH-04 — tampered journal detected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    const { writeFile, readFile } = await import('node:fs/promises');
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'), JSON.stringify(desc('ph4')));
    const before = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    await assert.rejects(
      writeVersionedJournal(f.root, desc('ph4b'), { previousHash: 'f'.repeat(64), readerVersion: '0.9.4' }, f.capability),
      /E_JOURNAL_CHANGED/
    );
    const after = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    assert.equal(after, before, 'tampered journal must not be overwritten');
  } finally { await teardownControlledFixture(f); }
});

test('PH-05 — missing-journal mismatch: wrong hash on empty rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    await assert.rejects(
      writeVersionedJournal(f.root, desc('ph5'), { previousHash: '1'.repeat(64), readerVersion: '0.9.4' }, f.capability),
      /E_JOURNAL_CHANGED/
    );
  } finally { await teardownControlledFixture(f); }
});

mutationTest('PH-06 — concurrent creation: one wins, other sees changed', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    const w = (id) => writeVersionedJournal(f.root, desc(id), { previousHash: null, readerVersion: '0.9.4' }, f.capability);
    const results = await Promise.allSettled([w('ph6a'), w('ph6b')]);
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    assert.equal(ok, 1, 'exactly one concurrent creation must succeed');
  } finally { await teardownControlledFixture(f); }
});

test('PH-07 — revoked capability rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    const { revokeCapabilitiesForFixture } = await import('./helpers/controlled-writer-capability.mjs');
    revokeCapabilitiesForFixture(f.root);
    await assert.rejects(
      writeVersionedJournal(f.root, desc('ph7'), { previousHash: null, readerVersion: '0.9.4' }, f.capability),
      /E_TEST_CAPABILITY_REVOKED/
    );
  } finally { try { await teardownControlledFixture(f); } catch {} }
});

test('PH-08 — production authorization refusal (no capability)', async () => {
  const f = await createControlledFixture({ allowedOperations: OPS });
  try {
    await withVcp(f);
    await assert.rejects(
      writeVersionedJournal(f.root, desc('ph8'), { previousHash: null, readerVersion: '0.9.4' }),
      (e) => e && e.code === 'E_G_FENCE_NO_GO'
    );
  } finally { await teardownControlledFixture(f); }
});
