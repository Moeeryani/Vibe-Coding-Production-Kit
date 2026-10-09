// Quarantine only an explicitly acknowledged staging file; never the active
// transaction. G-FENCE and human ownership proof are separate prerequisites.
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import { acquireLifecycleLock } from './lifecycle-lock-v2.mjs';
import { planStaleJournalQuarantine } from './stale-journal-plan.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { syncContainingDirectory } from './file-durability.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
function block(code){const e=new Error(code);e.code=code;throw e;}
export async function quarantineAcknowledgedStaging({
  targetDir,relative,acknowledgedSha256
}={}) {
  assertManagedMigrationGate(); // Hard NO-GO, before mutation.
  if(typeof acknowledgedSha256!=='string'||
    !/^[0-9a-f]{64}$/.test(acknowledgedSha256))block('E_STAGING_ACK_REQUIRED');
  const root=path.resolve(targetDir??'.');
  const read=async()=> {
    const plan=await planStaleJournalQuarantine(root);
    if(plan.classification!=='QUARANTINE_CANDIDATE')block('E_STAGING_PLAN_BLOCKED');
    const item=plan.actions.find(x=>x.path===relative);
    if(!item||item.sha256!==acknowledgedSha256)block('E_STAGING_ACK_STALE');
    return item;
  };
  await read();
  const lock=await acquireLifecycleLock(root,{mode:'recovery'});
  try {
    const item=await read();
    const original=await readProjectBytes(root,item.path,{
      managedState:true,maxBytes:512*1024
    });
    if(sha(original)!==item.sha256)block('E_STAGING_CHANGED');
    const quarantine='.vcp/quarantine';
    const probe=await resolveProjectPath(root,quarantine+'/.__vcp_probe__',{
      purpose:'managed-state'
    });
    const dir=path.dirname(probe);
    let before;
    try{before=await lstat(dir);}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(before) {
      if(!before.isDirectory()||before.isSymbolicLink())block('E_QUARANTINE_DIR_COLLISION');
    }else {
      await mkdir(dir,{mode:0o700});
      await syncContainingDirectory(dir);
    }
    const destinationRel=quarantine+'/'+path.posix.basename(item.path)+
      '-'+randomBytes(12).toString('hex');
    const destination=await resolveProjectPath(root,destinationRel,{purpose:'managed-state'});
    const source=await resolveProjectPath(root,item.path,{
      purpose:'managed-state',mustExist:true
    });
    const final=await readProjectBytes(root,item.path,{
      managedState:true,maxBytes:512*1024
    });
    if(sha(final)!==acknowledgedSha256)block('E_STAGING_CHANGED');
    await rename(source,destination);
    await syncContainingDirectory(source);
    await syncContainingDirectory(destination);
    return {quarantined:true,source:item.path,
      destination:destinationRel,sha256:item.sha256,
      backupPreserved:true,activeTransactionPreserved:true};
  }finally{await lock.release();}
}
