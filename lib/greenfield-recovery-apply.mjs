// Stage12 first-init recovery implementation candidate.
// D-01/G-FENCE is checked before all mutation; all removals require an owned
// lock and a complete, read-only inventory of the selected root.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import {
  readVersionedJournalDigest, writeVersionedJournal, clearVersionedJournal
} from './versioned-journal.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { planGreenfieldRecovery } from './greenfield-recovery-plan.mjs';
import {
  inspectManagedRecovery, describeVersionedTransaction
} from './managed-recovery-v2.mjs';
import { inspectRecoveryOwnedTree } from './owned-tree-inventory.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory } from './file-durability.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(reason){const e=new Error(reason);e.code=reason;throw e;}

async function boundedOwnedFile(root,relative,limit=8*1024*1024) {
  const purpose=relative.startsWith('.vcp/')?'managed-state':'read-existing';
  const file=await resolveProjectPath(root,relative,{purpose,mustExist:true});
  const first=await lstat(file);
  if(!first.isFile()||first.isSymbolicLink()||first.size>limit)fail('E_RECOVERY_UNOWNED');
  const fd=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const opened=await fd.stat();
    if(!opened.isFile()||opened.dev!==first.dev||opened.ino!==first.ino||
      opened.size!==first.size||opened.mtimeMs!==first.mtimeMs)fail('E_RECOVERY_RACE');
    bytes=await fd.readFile();
  } finally {await fd.close();}
  const last=await lstat(file);
  if(!last.isFile()||last.isSymbolicLink()||last.dev!==first.dev||
    last.ino!==first.ino||last.size!==first.size||
    last.mtimeMs!==first.mtimeMs||bytes.length>limit)fail('E_RECOVERY_RACE');
  return {file,digest:sha(bytes),identity:last};
}
async function unlinkMatching(root,relative,expected) {
  const data=await boundedOwnedFile(root,relative);
  if(data.digest!==expected)fail('E_RECOVERY_CONCURRENT_EDIT');
  const same=await lstat(data.file);
  if(!same.isFile()||same.isSymbolicLink()||same.dev!==data.identity.dev||
    same.ino!==data.identity.ino||same.size!==data.identity.size||
    same.mtimeMs!==data.identity.mtimeMs)fail('E_RECOVERY_RACE');
  // TOCTOU hardening for native Windows and hostile directory renames remains
  // an external acceptance gate; this candidate cannot claim atomic unlink.
  await unlink(data.file);
  // Namespace deletion is not durable merely because the old bytes matched.
  await syncContainingDirectory(data.file);
}
function ancestorDirectories(paths) {
  const parents=new Set();
  for(const relative of paths) {
    let parent=path.posix.dirname(relative);
    while(parent!=='.'&&parent!=='.vcp'){
      parents.add(parent);
      parent=path.posix.dirname(parent);
    }
  }
  return [...parents].filter(x=>x!=='.vcp/backups'&&!x.startsWith('.vcp/backups/'))
    .sort((a,b)=>b.split('/').length-a.split('/').length||b.localeCompare(a));
}
async function removeEmptyRelative(root,relative) {
  const probe=await resolveProjectPath(root,relative+'/.__vcp_probe__',{
    purpose:relative.startsWith('.vcp/')?'managed-state':'write-new'
  });
  try {
    const selected=path.dirname(probe);
    await rmdir(selected);
    await syncContainingDirectory(selected);
  } catch(error) {
    // Interrupted init may never have created this planned parent. An absent
    // directory is already in the desired pre-init state; nonempty is NOT.
    if(error?.code!=='ENOENT')throw error;
  } // Never recursively delete.
}
export async function recoverInterruptedGreenfield({targetDir,backupId=null}={}) {
  assertManagedMigrationGate(); // D-01 remains NO-GO before any selected-root write.
  const root=path.resolve(targetDir??'.');
  const prior=await planGreenfieldRecovery(root,{backupId});
  const acceptable=new Set(['RECOVERABLE_CANDIDATE','TERMINAL_CLEANUP_CANDIDATE']);
  if(!acceptable.has(prior.classification))fail('E_GREENFIELD_RECOVERY_PREVIEW_BLOCKED');

  const lock=await acquireLifecycleLock(root,{mode:'recovery'});
  let cleanupReady=false;
  try {
    const plan=await planGreenfieldRecovery(root,{backupId:prior.backupId});
    if(plan.classification!==prior.classification||
      plan.backupId!==prior.backupId||
      plan.expectedCreated!==prior.expectedCreated||
      (prior.classification==='TERMINAL_CLEANUP_CANDIDATE'&&
        (plan.journalSha256!==prior.journalSha256||
         plan.backupMetadataHash!==prior.backupMetadataHash))) {
      fail('E_GREENFIELD_RECOVERY_CHANGED');
    }
    let terminal=plan;
    if(plan.classification==='RECOVERABLE_CANDIDATE') {
      const recovery=await inspectManagedRecovery(root,{backupId:plan.backupId});
      if(recovery.blocked||recovery.transaction?.committed||
        recovery.transaction?.operation!=='init'||
        recovery.backup?.id!==plan.backupId)fail('E_GREENFIELD_RECOVERY_STATE');

      const ledger=recovery.transaction.createdFiles;
      const inventory=await inspectRecoveryOwnedTree(root,plan.backupId,
        ledger.map(item=>item.path));
      if(!inventory.complete)fail('E_GREENFIELD_FOREIGN_CONTENT');
      for(const action of plan.actions) {
        const item=await boundedOwnedFile(root,action.path);
        if(item.digest!==action.expectedHash)fail('E_GREENFIELD_USER_MODIFIED');
      }
      const metadataRel='.vcp/backups/'+plan.backupId+'/backup.json';
      const metadata=await boundedOwnedFile(root,metadataRel,512*1024);
      let journalHash=await readVersionedJournalDigest(root);
      if(!journalHash)fail('E_GREENFIELD_JOURNAL_MISSING');
      const filesFolder='.vcp/backups/'+plan.backupId+'/files';
      const folderProbe=await resolveProjectPath(root,filesFolder+'/.__vcp_probe__',{
        purpose:'managed-state'
      });
      if((await readdir(path.dirname(folderProbe))).length!==0) {
        fail('E_GREENFIELD_BACKUP_CONTENT');
      }
      // A failed write to this journal must never be followed by a removal.
      if(recovery.transaction.phase!=='recovering') {
        const transition=describeVersionedTransaction({
          operationId:recovery.transaction.id,
          backupId:recovery.transaction.backupId,
          operation:'init',phase:'recovering',
          minimumReaderVersion:recovery.transaction.minimumReaderVersion,
          startedAt:recovery.transaction.startedAt,createdFiles:ledger
        });
        journalHash=(await writeVersionedJournal(root,transition,{
          previousHash:journalHash,
          readerVersion:recovery.transaction.minimumReaderVersion
        })).sha256;
      }
      const actions=[...plan.actions].sort((a,b)=>
        b.path.split('/').length-a.path.split('/').length||b.path.localeCompare(a.path));
      for(const action of actions)await unlinkMatching(root,action.path,action.expectedHash);
      for(const relative of ancestorDirectories(ledger.map(item=>item.path))) {
        await removeEmptyRelative(root,relative);
      }
      // Do not discard backup metadata until the entire created-file ledger
      // has been reconciled and its absence is independently re-inspected.
      const emptied=await planGreenfieldRecovery(root,{backupId:plan.backupId});
      if(emptied.classification!=='RECOVERABLE_CANDIDATE'||
        emptied.actions.length!==0||emptied.expectedCreated!==plan.expectedCreated) {
        fail('E_GREENFIELD_CREATED_FILES_REMAIN');
      }
      const checkpoint=describeVersionedTransaction({
        operationId:recovery.transaction.id,backupId:recovery.transaction.backupId,
        operation:'init',phase:'cleanup',
        minimumReaderVersion:recovery.transaction.minimumReaderVersion,
        startedAt:recovery.transaction.startedAt,createdFiles:ledger,
        cleanupBackupHash:metadata.digest
      });
      journalHash=(await writeVersionedJournal(root,checkpoint,{
        previousHash:journalHash,
        readerVersion:recovery.transaction.minimumReaderVersion
      })).sha256;
      terminal=await planGreenfieldRecovery(root,{backupId:plan.backupId});
      if(terminal.classification!=='TERMINAL_CLEANUP_CANDIDATE'||
        terminal.backupMetadataHash!==metadata.digest||
        terminal.journalSha256!==journalHash)fail('E_GREENFIELD_CLEANUP_CHECKPOINT');
    }

    // This branch performs *only* control cleanup. A restart after
    // backup.json disappears re-enters here using the exact journaled backup
    // digest. No user-owned path is deleted from a terminal checkpoint.
    const verified=await planGreenfieldRecovery(root,{backupId:terminal.backupId});
    if(verified.classification!=='TERMINAL_CLEANUP_CANDIDATE'||
      verified.journalSha256!==terminal.journalSha256||
      verified.backupMetadataHash!==terminal.backupMetadataHash) {
      fail('E_GREENFIELD_TERMINAL_CHANGED');
    }
    const filesFolder='.vcp/backups/'+terminal.backupId+'/files';
    await removeEmptyRelative(root,filesFolder);
    const metadataRel='.vcp/backups/'+terminal.backupId+'/backup.json';
    if(verified.backupMetadataPresent) {
      await unlinkMatching(root,metadataRel,verified.backupMetadataHash);
    }
    await removeEmptyRelative(root,'.vcp/backups/'+terminal.backupId);
    await removeEmptyRelative(root,'.vcp/backups');
    const remaining=await readdir(path.join(root,'.vcp'));
    if(remaining.some(name=>name!=='transaction.json'&&name!=='update.lock')) {
      fail('E_GREENFIELD_RECOVERY_RESIDUAL_STATE');
    }
    await clearVersionedJournal(root,{expectedHash:verified.journalSha256});
    cleanupReady=true;
  }finally {
    await lock.release();
  }
  if(!cleanupReady)fail('E_GREENFIELD_RECOVERY_INCOMPLETE');
  // Interrupted final state-directory retirement still requires independent
  // provenance adjudication; do not infer safety of stale foreign lock.
  const ownedState=path.join(root,'.vcp');
  await rmdir(ownedState);
  await syncContainingDirectory(ownedState);
  if((await readdir(root)).length!==0)fail('E_GREENFIELD_RESIDUAL_PROJECT');
  return {restoredState:'unmanaged',restoredVersion:null,
    recoveredInterruptedOperation:true,restoredFromBackupId:prior.backupId,
    verified:true};
}
