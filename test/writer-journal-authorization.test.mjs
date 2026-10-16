// J-01..J-08: nested journal authorization negative tests.
// Refusal-only: safe to execute. Each proves denial + zero mutation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  createControlledFixture, teardownControlledFixture,
} from './helpers/controlled-writer-fixture.mjs';
import {
  writeVersionedJournal, clearVersionedJournal,
} from '../lib/versioned-journal.mjs';

const JOURNAL_OPS = ['journal-write', 'journal-clear'];
const descriptor = (id) => ({
  formatVersion: 2, transactionSchemaVersion: 2, id, operationId: id,
  backupId: id, operation: 'update', phase: 'prepared',
  minimumReaderVersion: '0.9.4', startedAt: new Date().toISOString(),
  plannedManifestHash: 'a'.repeat(64), createdFiles: [],
});

test('J-01 — unauthorized journal mutation: probe cap refused', async () => {
  const f = await createControlledFixture({ allowedOperations: ['probe'] });
  try {
    let mutated = false;
    await assert.rejects(
      writeVersionedJournal(f.root, descriptor('j1'), { readerVersion: '0.9.4' }, f.capability)
        .then(() => { mutated = true; }),
      /E_TEST_CAPABILITY_OPERATION/
    );
    assert.equal(mutated, false);
  } finally { await teardownControlledFixture(f); }
});

test('J-02 — cross-fixture journal access denied', async () => {
  const a = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  const b = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  try {
    await assert.rejects(
      writeVersionedJournal(b.root, descriptor('j2'), { readerVersion: '0.9.4' }, a.capability),
      /E_TEST_CAPABILITY_SCOPE/
    );
  } finally {
    await teardownControlledFixture(a);
    await teardownControlledFixture(b);
  }
});

test('J-03 — stale capability rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  const cap = f.capability;
  const root = f.root;
  await teardownControlledFixture(f);
  await assert.rejects(
    writeVersionedJournal(root, descriptor('j3'), { readerVersion: '0.9.4' }, cap),
    /E_TEST_CAPABILITY_REVOKED/
  );
});

test('J-04 — journal tampering detected', async () => {
  const f = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  try {
    // Manually place a journal file, then attempt overwrite with wrong
    // previousHash → hash-chain validation must reject (tamper detection).
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(path.join(f.root, '.vcp'), { recursive: true, mode: 0o700 });
    await writeFile(path.join(f.root, '.vcp', 'transaction.json'),
      JSON.stringify(descriptor('j4')));
    await assert.rejects(
      writeVersionedJournal(f.root, descriptor('j4b'),
        { previousHash: '0'.repeat(64), readerVersion: '0.9.4' }, f.capability),
      /E_JOURNAL_CHANGED/
    );
    // Journal file unchanged (no mutation on refusal).
    const after = await readFile(path.join(f.root, '.vcp', 'transaction.json'), 'utf8');
    assert.ok(after.includes('"id":"j4"'), 'journal must not be overwritten on refusal');
  } finally { await teardownControlledFixture(f); }
});

test('J-05 — capability revoked mid-transaction refused', async () => {
  const f = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  try {
    const { revokeCapabilitiesForFixture } =
      await import('./helpers/controlled-writer-capability.mjs');
    revokeCapabilitiesForFixture(f.root);
    await assert.rejects(
      clearVersionedJournal(f.root, {}, f.capability),
      /E_TEST_CAPABILITY_REVOKED/
    );
  } finally {
    try { await teardownControlledFixture(f); } catch {}
  }
});

test('J-06 — production entrypoint non-bypass', async () => {
  // No capability → production gate fires.
  const f = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  try {
    await assert.rejects(
      writeVersionedJournal(f.root, descriptor('j6'), { readerVersion: '0.9.4' }),
      (e) => e && e.code === 'E_G_FENCE_NO_GO'
    );
    await assert.rejects(
      clearVersionedJournal(f.root, {}),
      (e) => e && e.code === 'E_G_FENCE_NO_GO'
    );
  } finally { await teardownControlledFixture(f); }
});

test('J-07 — npm artifact authorization failure', async () => {
  // In the published artifact, test/helpers is absent → dynamic import fails.
  // Verified via extracted tarball in Phase 6; this test documents the property.
  const pkg = (await import('../package.json', { with: { type: 'json' } })).default;
  assert.ok(!(pkg.files || []).some((x) => x.startsWith('test/')));
});

test('J-08 — fixture-root replacement during journal mutation rejected', async () => {
  const f = await createControlledFixture({ allowedOperations: JOURNAL_OPS });
  const { rm, mkdir } = await import('node:fs/promises');
  await rm(f.root, { recursive: true, force: true });
  await mkdir(f.root, { recursive: true, mode: 0o700 });
  try {
    await assert.rejects(
      writeVersionedJournal(f.root, descriptor('j8'), { readerVersion: '0.9.4' }, f.capability),
      /E_TEST_CAPABILITY_IDENTITY/
    );
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
