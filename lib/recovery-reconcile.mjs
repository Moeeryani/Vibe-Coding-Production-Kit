import { createHash } from 'node:crypto';

const DIGEST=/^[a-f0-9]{64}$/;
const OBJECT=v=>v&&typeof v==='object'&&!Array.isArray(v);
const fingerprint=bytes=>createHash('sha256').update(bytes).digest('hex');
function reject(code){const e=new Error(code);e.code=code;throw e;}

// Pure recovery reconciliation. Caller must inspect actual selected-root
// paths with no-follow constraints while holding its own versioned lock.
// No old or new user bytes may be overwritten when they changed after backup.
export function planSafeRecovery({operation,preLockSnapshot,entries,
  currentFiles,appliedFiles,latestBackupId,selectedBackupId}={}) {
  if(!['init','update'].includes(operation)||!OBJECT(preLockSnapshot)||
    !Array.isArray(entries)||!OBJECT(currentFiles)||!OBJECT(appliedFiles))reject('E_RECOVERY_PLAN_INPUT');
  if(!selectedBackupId||selectedBackupId!==latestBackupId)reject('E_RECOVERY_NOT_LATEST');
  if(operation==='init'&&preLockSnapshot.manifestExisted)reject('E_RECOVERY_EXPECTED_UNMANAGED');
  if(operation==='update'&&!preLockSnapshot.manifestExisted)reject('E_RECOVERY_EXPECTED_MANAGED');
  const seen=new Set(),actions=[],conflicts=[];
  for(const item of entries){
    if(!OBJECT(item)||typeof item.path!=='string'||item.path.startsWith('/')||
      item.path.includes('..')||item.path.includes('\\')||seen.has(item.path)||
      typeof item.existedBefore!=='boolean'||typeof item.existsAfter!=='boolean'||
      (item.existedBefore&&!DIGEST.test(item.priorHash))||
      (item.existsAfter&&!DIGEST.test(item.appliedHash)))reject('E_RECOVERY_ENTRY');
    seen.add(item.path);
    const current=currentFiles[item.path];
    const applied=appliedFiles[item.path];
    if(item.existsAfter){
      if(current===undefined||!Buffer.isBuffer(current)||fingerprint(current)!==item.appliedHash){
        conflicts.push({path:item.path,reason:'POST_BACKUP_USER_OR_CONCURRENT_EDIT'});
        continue;
      }
      if(applied!==undefined&&(!Buffer.isBuffer(applied)||fingerprint(applied)!==item.appliedHash)){
        conflicts.push({path:item.path,reason:'APPLIED_SNAPSHOT_INVALID'});
        continue;
      }
    }else if(current!==null&&current!==undefined){
      conflicts.push({path:item.path,reason:'UNEXPECTED_NEW_CONTENT'});
      continue;
    }
    actions.push({path:item.path,action:item.existedBefore?'RESTORE_EXACT':'REMOVE_OWN_CREATED',
      expectedCurrentHash:item.existsAfter?item.appliedHash:null,priorHash:item.priorHash??null,
      writeAuthorized:false});
  }
  return {
    blocked:conflicts.length>0,operation,restoredState:operation==='init'?'unmanaged':'managed',
    restoredVersion:operation==='init'?null:preLockSnapshot.installedVersion??null,
    selectedBackupId,actions:conflicts.length?[]:actions,
    conflicts,writeAuthorized:false,requiresVersionedLock:true,
    requiresPostRestoreByteValidation:true,
    requiresNonrecursiveStateCleanup:operation==='init'
  };
}
