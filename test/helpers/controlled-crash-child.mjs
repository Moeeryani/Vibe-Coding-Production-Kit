// B4-04/B5-04 child worker: starts a controlled transaction, then sleeps
// so the parent can SIGKILL mid-mutation. Prints fixture root to stdout.
// TEST-ONLY. Never imported by production code.
import { createControlledFixture } from './controlled-writer-fixture.mjs';
import { runWriterTransaction } from '../../lib/production-writer.mjs';
import { rollbackV2 } from '../../lib/writer-rollback-v2.mjs';

// The runner treats every file under test/ as a test file, so this module is
// also EXECUTED by discovery, not only when a parent spawns it. Without an
// explicit mode it must do nothing: it otherwise created a live fixture, ran a
// real transaction and slept 30s from inside the test run, and reported that
// accidental execution as a failing "test".
const mode = process.argv[2];
if (mode !== 'transaction' && mode !== 'rollback') {
  console.log('SKIPPED: crash child requires an explicit transaction|rollback mode');
  process.exit(0);
}
const f = await createControlledFixture({ allowedOperations: ['b4-concurrency', 'rollback-v2', 'journal-write', 'journal-clear'] });
console.log('FIXTURE_ROOT=' + f.root);
console.log('READY');

if (mode === 'transaction') {
  await runWriterTransaction({
    root: f.root, operation: 'b4-concurrency', mode: 'init',
    testCapability: f.capability,
    mutate: async ({ atomic }) => {
      await atomic.writeFile(f.root, 'crash-target.txt', Buffer.from('partial-write\n'));
      console.log('MUTATED');
      // Sleep to allow parent SIGKILL mid-transaction.
      await new Promise((r) => setTimeout(r, 30000));
    },
  });
} else if (mode === 'rollback') {
  // Setup: create a backup with many file entries (widens the kill window),
  // mutate, then start rollback. Parent SIGKILLs mid-restore.
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const path = (await import('node:path')).default;
  const backupId = 'crash-backup';
  const base = path.join(f.root, '.vcp', 'backups', backupId);
  await mkdir(path.join(base, 'files'), { recursive: true, mode: 0o700 });
  const manifestBytes = Buffer.from(JSON.stringify({ v: 1 }) + '\n');
  await writeFile(path.join(base, 'manifest.json'), manifestBytes);
  const sha256 = (b) => createHash('sha256').update(b).digest('hex');
  const entries = [];
  for (let i = 0; i < 50; i++) {
    const name = `file-${i}.txt`;
    const content = Buffer.from(`backup-content-${i}\n`.repeat(100));
    await writeFile(path.join(base, 'files', name), content);
    entries.push({ relative: name, sha256: sha256(content) });
  }
  await writeFile(path.join(base, 'backup.json'), JSON.stringify({
    id: backupId, operationId: backupId, operation: 'update',
    minimumReaderVersion: '0.9.4', restoredManifestHash: sha256(manifestBytes), entries,
  }));
  console.log('BACKUP_READY');
  await rollbackV2({
    root: f.root, backupId, confirmed: true, testCapability: f.capability,
  });
  console.log('MUTATED');
  await new Promise((r) => setTimeout(r, 30000));
}
// If we reach here without being killed, exit cleanly (should not happen in test).
process.exit(0);
