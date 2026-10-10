// Versioned completed-transaction finalization candidate. Deliberately
// unavailable while D-01 remains NO-GO, even though this changes only journal.
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { planCommittedJournalCleanup } from './committed-cleanup-plan.mjs';
import { clearVersionedJournal } from './versioned-journal.mjs';

function reject(code){const e=new Error(code);e.code=code;throw e;}
export async function finalizeCommittedVersionedJournal({targetDir,backupId=null}={}) {
  assertManagedMigrationGate(); // Before any selected-project write.
  const root=path.resolve(targetDir??'.');
  const before=await planCommittedJournalCleanup(root,{backupId});
  if(before.classification!=='COMMITTED_CLEANUP_CANDIDATE') {
    reject('E_COMMITTED_JOURNAL_NOT_PROVEN');
  }
  const owned=await acquireLifecycleLock(root,{mode:'recovery'});
  try {
    const after=await planCommittedJournalCleanup(root,{backupId:before.backupId});
    if(after.classification!=='COMMITTED_CLEANUP_CANDIDATE'||
      after.backupId!==before.backupId||
      after.operation!==before.operation||
      after.committedManifestHash!==before.committedManifestHash||
      after.journalSha256!==before.journalSha256) {
      reject('E_COMMITTED_JOURNAL_CHANGED');
    }
    await clearVersionedJournal(root,{expectedHash:after.journalSha256});
    return {
      operation:after.operation,backupId:after.backupId,
      alreadyCommitted:true,cleanup:'EXACT_JOURNAL_ONLY',
      manifestUnchanged:true,backupPreserved:true
    };
  }finally{await owned.release();}
}
