// Inspect a completed versioned transaction whose final journal removal was
// interrupted. Committed does NOT grant permission to overwrite project files.
// The only proposed change is removal of the exact owned transaction journal.
import path from 'node:path';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { readVersionedJournalDigest } from './versioned-journal.mjs';
import { inspectLifecycleLock } from './lock-inspect-v2.mjs';

export async function planCommittedJournalCleanup(rootPath,{backupId=null}={}) {
  const root=path.resolve(rootPath);
  const blocked=reason=>({
    root,classification:'BLOCKED',reason,readOnly:true,
    writeAuthorized:false,actions:[]
  });
  const recovery=await inspectManagedRecovery(root,{backupId});
  if(recovery.blocked)return blocked(recovery.reason);
  const tx=recovery.transaction,backup=recovery.backup;
  if(!tx||tx.legacy||tx.formatVersion!==2||!tx.committed) {
    return blocked('NO_VERSIONED_COMMITTED_JOURNAL');
  }
  if(!backup||backup.legacy||backup.formatVersion!==2||
     backup.id!==tx.backupId||backup.operation!==tx.operation) {
    return blocked('COMMITTED_BACKUP_PROVENANCE_UNPROVEN');
  }
  let journalHash;
  try{journalHash=await readVersionedJournalDigest(root);}
  catch(error){return blocked(error.code??'COMMITTED_JOURNAL_UNREADABLE');}
  if(!journalHash)return blocked('COMMITTED_JOURNAL_MISSING');
  const lock=await inspectLifecycleLock(root);
  return {
    root,classification:'COMMITTED_CLEANUP_CANDIDATE',
    readOnly:true,operation:tx.operation,backupId:backup.id,
    committedManifestHash:tx.committedManifestHash,
    journalSha256:journalHash,
    lockInspection:lock,
    actions:[{
      action:'PROPOSE_CLEAR_EXACT_COMMITTED_JOURNAL',
      path:'.vcp/transaction.json',expectedHash:journalHash,
      executionAuthorized:false
    }],
    requiresOwnedExclusiveLock:true,
    requiresReinspectionAfterLock:true,
    writeAuthorized:false,executionAuthorized:false,
    reason:'COMMITTED_MANIFEST_HASH_ALREADY_PROVED_BY_VERSIONED_READER'
  };
}
