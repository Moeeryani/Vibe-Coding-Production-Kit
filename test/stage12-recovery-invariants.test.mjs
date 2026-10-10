import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,rm,writeFile,readdir,symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  inspectRecoveryOwnedTree,describeRecoveryOwnedTree
} from '../lib/owned-tree-inventory.mjs';
import { planStaleJournalQuarantine } from '../lib/stale-journal-plan.mjs';
import { planCommittedJournalCleanup } from '../lib/committed-cleanup-plan.mjs';
import { inspectLifecycleLock } from '../lib/lock-inspect-v2.mjs';
import { finalizeCommittedVersionedJournal } from '../lib/committed-cleanup-apply.mjs';
import { quarantineAcknowledgedStaging } from '../lib/stale-journal-apply.mjs';

const SHA=bytes=>createHash('sha256').update(bytes).digest('hex');
async function sandbox(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage12-recovery-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
async function setupTree(root){
  await mkdir(path.join(root,'.vcp/backups/owned-1/files'),{recursive:true});
  await mkdir(path.join(root,'docs/nested'),{recursive:true});
  await writeFile(path.join(root,'.vcp/transaction.json'),'{"untrusted":true}\n');
  await writeFile(path.join(root,'.vcp/update.lock'),'{"untrusted":true}\n');
  await writeFile(path.join(root,'.vcp/backups/owned-1/backup.json'),'{}\n');
  await writeFile(path.join(root,'docs/nested/owned.md'),'expected\n');
}

test('rollback inventory recognizes strictly enumerated nested files only',async t=>{
  const root=await sandbox(t);
  await setupTree(root);
  const ledger=['docs/nested/owned.md'];
  const known=describeRecoveryOwnedTree('owned-1',ledger);
  assert.ok(known.files.has('docs/nested/owned.md'));
  assert.ok(known.dirs.has('docs/nested'));
  assert.equal((await inspectRecoveryOwnedTree(root,'owned-1',ledger)).complete,true);
  assert.deepEqual((await readdir(root)).sort(),['.vcp','docs']);
});

test('unexpected project-owned nested file prevents rollback proposal',async t=>{
  const root=await sandbox(t);
  await setupTree(root);
  await writeFile(path.join(root,'docs/nested/unexpected.md'),'customer content');
  const report=await inspectRecoveryOwnedTree(root,'owned-1',['docs/nested/owned.md']);
  assert.equal(report.complete,false);
  assert.ok(report.issues.some(issue=>issue.path==='docs/nested/unexpected.md'&&
    issue.reason==='UNEXPECTED_FILE'));
});

test('unexpected empty folder is still foreign state',async t=>{
  const root=await sandbox(t);
  await setupTree(root);
  await mkdir(path.join(root,'docs/nested/empty-user-folder'));
  const report=await inspectRecoveryOwnedTree(root,'owned-1',['docs/nested/owned.md']);
  assert.equal(report.complete,false);
  assert.ok(report.issues.some(issue=>issue.reason==='UNEXPECTED_DIRECTORY'));
});

test('symlinks anywhere in initial rollback tree refuse ownership',async t=>{
  if(process.platform==='win32')return t.skip('native junction/reparse fixture belongs to Windows suite');
  const root=await sandbox(t);
  await setupTree(root);
  await symlink('owned.md',path.join(root,'docs/nested/foreign-link'));
  const report=await inspectRecoveryOwnedTree(root,'owned-1',['docs/nested/owned.md']);
  assert.equal(report.complete,false);
  assert.ok(report.issues.some(issue=>issue.reason==='SYMLINK_PRESENT'));
});

test('staging quarantine proposal preserves bytes and has no destructive actions',async t=>{
  const root=await sandbox(t);
  await mkdir(path.join(root,'.vcp'));
  const staged='.vcp/transaction-'+('f'.repeat(24))+'.tmp';
  const bytes=Buffer.from('partial journal staged bytes\n');
  await writeFile(path.join(root,staged),bytes);
  const plan=await planStaleJournalQuarantine(root);
  assert.equal(plan.classification,'QUARANTINE_CANDIDATE');
  assert.equal(plan.actions.length,1);
  assert.equal(plan.actions[0].sha256,SHA(bytes));
  assert.equal(plan.actions[0].action,'PROPOSE_QUARANTINE_STAGING');
  assert.equal(plan.writeAuthorized,false);
  assert.deepEqual(await readdir(path.join(root,'.vcp')),[
    'transaction-'+('f'.repeat(24))+'.tmp'
  ]);
});

test('unknown transaction staging names cannot be implicitly quarantined',async t=>{
  const root=await sandbox(t);
  await mkdir(path.join(root,'.vcp'));
  await writeFile(path.join(root,'.vcp/transaction-user.tmp'),'data');
  const report=await planStaleJournalQuarantine(root);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'UNRECOGNIZED_JOURNAL_STAGING');
});

test('unproved committed journal is not a cleanup candidate',async t=>{
  const root=await sandbox(t);
  await mkdir(path.join(root,'.vcp'));
  const plan=await planCommittedJournalCleanup(root);
  assert.equal(plan.classification,'BLOCKED');
  assert.equal(plan.writeAuthorized,false);
  const lock=await inspectLifecycleLock(root);
  assert.equal(lock.retirementAuthorized,false);
});

test('staging and committed cleanup writers are hard gated before any writes',async t=>{
  const root=await sandbox(t);
  await assert.rejects(()=>finalizeCommittedVersionedJournal({targetDir:root}),{
    code:'E_G_FENCE_NO_GO'
  });
  await assert.rejects(()=>quarantineAcknowledgedStaging({
    targetDir:root,relative:'.vcp/transaction-'+('a'.repeat(24))+'.tmp',
    acknowledgedSha256:'0'.repeat(64)
  }),{code:'E_G_FENCE_NO_GO'});
  assert.deepEqual(await readdir(root),[]);
});
