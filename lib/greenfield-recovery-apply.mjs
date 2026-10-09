// Stage12 initial-install recovery application candidate. Disabled by G-FENCE.
// Deletes only exact owned files and empty directories, never recursive trees.
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { readVersionedJournalDigest,clearVersionedJournal } from './versioned-journal.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { planGreenfieldRecovery } from './greenfield-recovery-plan.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { resolveProjectPath } from './safe-path.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fail(code){const e=new Error(code);e.code=code;throw e;}
async function unlinkOnlyMatching(root,relative,expected) {
  const purpose=relative.startsWith('.vcp/')?'managed-state':'read-existing';
  const file=await resolveProjectPath(root,relative,{purpose,mustExist:true});
  const info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||info.size>8*1024*1024)fail('E_RECOVERY_UNOWNED');
  if(sha(await readFile(file))!==expected)fail('E_RECOVERY_CONCURRENT_EDIT');
  const final=await lstat(file);
  if(!final.isFile()||final.isSymbolicLink()||final.dev!==info.dev||
    final.ino!==info.ino||final.size!==info.size||final.mtimeMs!==info.mtimeMs) {
    fail('E_RECOVERY_RACE');
  }
  await unlink(file);
}
async function removeEmpty(root,relative) {
  const child=await resolveProjectPath(root,relative+'/.__vcp_dir_probe__',{
    purpose:'managed-state'
  });
  await rmdir(path.dirname(child));
}
export async function recoverInterruptedGreenfield({targetDir,backupId=null}={}) {
  assertManagedMigrationGate(); // No lock acquisition or writes when NO-GO.
  const root=path.resolve(targetDir??'.');
  const prior=await planGreenfieldRecovery(root,{backupId});
  if(prior.classification!=='RECOVERABLE_CANDIDATE')fail('E_GREENFIELD_RECOVERY_PREVIEW_BLOCKED');
  const lock=await acquireLifecycleLock(root,{mode:'recovery'});
  try {
    const current=await planGreenfieldRecovery(root,{backupId:prior.backupId});
    if(current.classification!=='RECOVERABLE_CANDIDATE'||current.backupId!==prior.backupId) {
      fail('E_GREENFIELD_RECOVERY_CHANGED');
    }
    const state=await inspectManagedRecovery(root,{backupId:prior.backupId});
    if(state.blocked||state.transaction?.committed||state.backup?.id!==prior.backupId) {
      fail('E_GREENFIELD_RECOVERY_STATE');
    }
    // Check the full action list before any unlink; an edit anywhere blocks all
    // removals instead of producing a half-restored new project.
    for(const action of current.actions) {
      const relative=action.path,purpose=relative.startsWith('.vcp/')?'managed-state':'read-existing';
      const file=await resolveProjectPath(root,relative,{purpose,mustExist:true});
      if(sha(await readFile(file))!==action.expectedHash)fail('E_GREENFIELD_RECOVERY_CHANGED_BYTES');
    }
    const deepest=[...current.actions].sort((a,b)=>
      b.path.split('/').length-a.path.split('/').length||b.path.localeCompare(a.path));
    for(const action of deepest)await unlinkOnlyMatching(root,action.path,action.expectedHash);

    const parents=new Set();
    for(const action of current.actions) {
      let at=path.posix.dirname(action.path);
      while(at!=='.'&&at!=='.vcp') {
        parents.add(at);
        at=path.posix.dirname(at);
      }
    }
    // The transaction is needed until all user-facing files have been restored.
    const txn=await resolveProjectPath(root,'.vcp/transaction.json',{
      purpose:'managed-state',mustExist:true
    });
    const backupMetadata=await resolveProjectPath(root,
      '.vcp/backups/'+prior.backupId+'/backup.json',{
        purpose:'managed-state',mustExist:true
      });
    const backupFilesProbe=await resolveProjectPath(root,
      '.vcp/backups/'+prior.backupId+'/files/.__vcp_dir_probe__',{
        purpose:'managed-state'
      });
    const backupFiles=path.dirname(backupFilesProbe);
    if((await readdir(backupFiles)).length!==0)fail('E_GREENFIELD_BACKUP_EXTRA');
    for(const relative of [...parents].sort((a,b)=>b.length-a.length)) {
      const folder=path.join(root,...relative.split('/'));
      try{await rmdir(folder);}
      catch(e){if(e.code==='ENOENT')continue;throw e;}
    }
    await rmdir(backupFiles);
    await unlink(backupMetadata);
    await removeEmpty(root,'.vcp/backups/'+prior.backupId);
    await removeEmpty(root,'.vcp/backups');
    // Preserve unknown .vcp contents and journal rather than claim success.
    const vcpEntries=await readdir(path.join(root,'.vcp'));
    if(vcpEntries.some(name=>name!=='transaction.json'&&name!=='update.lock')) {
      fail('E_GREENFIELD_RECOVERY_RESIDUAL_STATE');
    }
    const journalHash=await readVersionedJournalDigest(root);
    if(!journalHash)fail('E_GREENFIELD_RECOVERY_JOURNAL_MISSING');
    await clearVersionedJournal(root,{expectedHash:journalHash});
  }finally{await lock.release();}
  // No remaining VCP state may be silently retained after successful first
  // adoption rollback; an unexpected file is a recovery failure.
  await rmdir(path.join(root,'.vcp'));
  const remaining=await readdir(root);
  if(remaining.length!==0)fail('E_GREENFIELD_RECOVERY_RESIDUAL_ROOT');
  return {restoredState:'unmanaged',restoredVersion:null,
    recoveredInterruptedOperation:true,restoredFromBackupId:prior.backupId};
}
