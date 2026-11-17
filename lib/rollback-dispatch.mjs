// P6-01 — CLI rollback dispatch.
//
// Routes `vcp rollback` to the handler that matches the project's state:
// the frozen v1 rollbackProject for v1 state, rollbackV2 for v2 state.
// Pure inspection + routing; the routed function does its own boundary
// check, lock, and evidence verification, exactly as if called directly.
// The dispatch never mutates state and never guesses: ambiguous or
// unknown state refuses with a clear error.
//
// Authorization: rollbackV2 is called with confirmed:true — typing
// `vcp rollback` IS the operator's explicit confirmation (v1 never
// asked for one either). In production rollbackV2 still refuses
// E_G_FENCE_NO_GO at the gate; the wiring is not an activation.
import { lstat, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { decodeManagedTransaction } from './managed-recovery-v2.mjs';
import { validateStage13Transaction } from './stage13-transaction.mjs';
import { readTransaction, listBackups } from './state.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { getCliVersion } from './version.mjs';
import { rollbackProject } from './update-apply.mjs';
import { rollbackV2 } from './writer-rollback-v2.mjs';

function fail(code,message){
  const e=new Error(code+(message?': '+message:''));
  e.code=code;
  throw e;
}

// Mirrors newestBackupId in lib/update-apply.mjs (module-local there):
// createdAt, then mtime, then id. Kept in sync by test.
async function newestBackupId(root,backupIds){
  const records=await Promise.all(backupIds.map(async(id)=>{
    const metadataPath=path.join(root,'.vcp','backups',id,'backup.json');
    try{
      const [raw,metadataStat]=await Promise.all([
        readFile(metadataPath,'utf8'),
        stat(metadataPath,{bigint:true})
      ]);
      const metadata=JSON.parse(raw);
      const createdAtMs=Date.parse(metadata?.createdAt??'');
      return {id,createdAtMs:Number.isFinite(createdAtMs)?createdAtMs:0,
        mtimeNs:metadataStat.mtimeNs};
    }catch{return {id,createdAtMs:0,mtimeNs:0n};}
  }));
  records.sort((left,right)=>{
    if(left.createdAtMs!==right.createdAtMs)
      return right.createdAtMs-left.createdAtMs;
    if(left.mtimeNs!==right.mtimeNs)
      return left.mtimeNs>right.mtimeNs?-1:1;
    return right.id.localeCompare(left.id);
  });
  return records[0]?.id??null;
}

// Backup selection follows v1's rules exactly (rollbackProject):
// an existing transaction's backupId pins; otherwise only the newest
// backup may be restored. Messages are v1's, verbatim.
async function resolveBackupId(root,backupId,transaction){
  if(transaction?.backupId){
    if(backupId&&backupId!==transaction.backupId)
      throw new Error(`An interrupted update requires backup ${transaction.backupId}; refusing to restore unrelated backup ${backupId}.`);
    return transaction.backupId;
  }
  const backups=await listBackups(root);
  const latest=await newestBackupId(root,backups);
  if(backupId&&backupId!==latest)
    throw new Error('VCP v0.9 supports rollback only to the newest backup. Older backups are retained for inspection but cannot be restored directly because later updates may have changed additional managed paths.');
  return backupId??latest;
}

// Read + minimally validate a backup record, mirroring loadBackup
// (writer-rollback-v2.mjs) so the dispatch and the handler agree.
async function readBackupRecord(root,backupId){
  let recordBytes;
  try{
    recordBytes=await readProjectBytes(root,
      `.vcp/backups/${backupId}/backup.json`,
      {managedState:true,maxBytes:65536});
  }catch{
    fail('E_ROLLBACK_BACKUP_MISSING',
      `Backup not found or unreadable: ${backupId}.`);
  }
  let record;
  try{record=JSON.parse(recordBytes.toString('utf8'));}
  catch{fail('E_ROLLBACK_BACKUP_CORRUPT','Backup record is not valid JSON.');}
  if(record.id!==backupId)
    fail('E_ROLLBACK_BACKUP_MISMATCH','Backup record ID mismatch.');
  return record;
}

export async function rollbackDispatch({targetDir,backupId=null,
  testCapability=null}={}){
  const root=path.resolve(targetDir??'.');
  // 1. No .vcp state: v1 owns the error, exactly as today.
  let vcpStat;
  try{vcpStat=await lstat(path.join(root,'.vcp'));}
  catch(e){
    if(e?.code==='ENOENT')
      return rollbackProject({targetDir:root,backupId});
    throw e;
  }
  if(!vcpStat.isDirectory()||vcpStat.isSymbolicLink())
    return rollbackProject({targetDir:root,backupId});

  // 2. Read the journal first: it pins the backup selection, and it
  // classifies the state. readTransaction throws on corrupt JSON;
  // that error propagates (v1 would throw the same).
  const raw=await readTransaction(root);
  let journal=null;
  if(raw){
    // Stage 13 adoption state: neither handler restores it. Refuse with
    // the recovery-plan pointer instead of routing it somewhere wrong.
    try{
      validateStage13Transaction(raw);
      fail('E_ROLLBACK_STAGE13_RECOVERY',
        'Stage 13 adoption state requires the versioned recovery plan; `vcp rollback` cannot restore it.');
    }catch(e){
      if(e?.code==='E_ROLLBACK_STAGE13_RECOVERY')throw e;
    }
    try{
      journal=decodeManagedTransaction(raw,
        {readerVersion:await getCliVersion()});
    }catch{
      // Not a decodable journal: v1 owns the refusal, exactly as today.
      return rollbackProject({targetDir:root,backupId});
    }
  }

  // 3. Schema-v2 managed state, or a versioned (formatVersion 2)
  // journal, is v2. A legacy (v1) journal is v1.
  const inspection=await inspectProject(root);
  if(inspection.schemaVersion===2||journal?.formatVersion===2){
    const selected=await resolveBackupId(root,backupId,journal);
    return rollbackV2({root,backupId:selected,confirmed:true,
      testCapability});
  }
  if(journal)
    return rollbackProject({targetDir:root,backupId});

  // 4. No journal: decide by the selected backup's format.
  const selected=await resolveBackupId(root,backupId,null);
  if(!selected)
    return rollbackProject({targetDir:root,backupId});
  const record=await readBackupRecord(root,selected);
  if(record.formatVersion===2)
    return rollbackV2({root,backupId:selected,confirmed:true,
      testCapability});
  if(record.formatVersion===3)
    fail('E_ROLLBACK_STAGE13_RECOVERY',
      'Stage 13 adoption backup requires the versioned recovery plan; `vcp rollback` cannot restore it.');
  if(record.formatVersion!==undefined)
    fail('E_ROLLBACK_UNKNOWN_BACKUP',
      `Unknown backup format ${record.formatVersion} for backup ${selected}; refusing.`);
  return rollbackProject({targetDir:root,backupId});
}
