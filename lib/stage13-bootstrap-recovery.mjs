// Stage13 orphan first-adoption bootstrap: STRICTLY READ-ONLY.
// The first durable namespace write may be .vcp itself, before any lock
// payload or journal can exist. That zero-provenance crash gap is classified
// BLOCKED; never infer permission to delete a user's .vcp directory.
// Once a valid adoption lock exists, its operationId binds all prejournal
// staging prefixes. The operator can inspect exact provenance, but no
// automatic deletion, stale-lock stealing, or resume authority is issued.
import {createHash} from 'node:crypto';
import {lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {readProjectBytes} from './safe-read.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const ID=/^adopt-[a-f0-9]{32}$/;
const DIGEST=/^[a-f0-9]{64}$/;
const MAX_NODES=512;
const KNOWN=new Set(['update.lock','stage','backups','baselines']);
const blocked=(root,reason,issues=[])=>Object.freeze({
  root,stage:13,operation:'adopt-bootstrap',
  classification:'BLOCKED',reason,issues,readOnly:true,
  writeAuthorized:false,mayRemoveState:false,mayStealLock:false
});
async function statOptional(file) {
  try{return await lstat(file,{bigint:true});}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
function shape(record) {
  if(!record||typeof record!=='object'||Array.isArray(record)||
     Object.keys(record).some(k=>![
       'version','mode','pid','host','token','startedAt',
       'operationId','consentFingerprint','bootstrapPriorVcpAbsent'
     ].includes(k))||
     record.version!==2||record.mode!=='adopt'||
     !Number.isInteger(record.pid)||record.pid<=0||
     typeof record.host!=='string'||!record.host||
     !/^[a-f0-9]{48}$/.test(record.token??'')||
     !ID.test(record.operationId??'')||
     !DIGEST.test(record.consentFingerprint??'')||
     record.bootstrapPriorVcpAbsent!==true||
     !/^\d{4}-\d{2}-\d{2}T/.test(record.startedAt??''))
    return false;
  return true;
}
async function inspectTree(root,stateRel,seen,issues) {
  const at=path.join(root,...stateRel.split('/'));
  const stat=await statOptional(at);
  if(!stat)return;
  if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory())){
    issues.push({path:stateRel,reason:'FOREIGN_OBJECT'});return;
  }
  if(++seen.nodes>MAX_NODES){
    issues.push({path:stateRel,reason:'INVENTORY_LIMIT'});return;
  }
  if(stat.isFile()) {
    seen.files++;
    // No private bytes are included in the public recovery preview.
    return;
  }
  seen.directories++;
  const items=await readdir(at);
  if(items.length>128){
    issues.push({path:stateRel,reason:'DIRECTORY_LIMIT'});return;
  }
  for(const item of items.sort()) {
    if(item==='.'||item==='..'||item.includes('/')||
       item.includes('\\')||item.includes('\0')) {
      issues.push({path:stateRel,reason:'UNSAFE_NAME'});continue;
    }
    await inspectTree(root,stateRel+'/'+item,seen,issues);
  }
}
export async function inspectStage13BootstrapResidue(rootPath) {
  const root=path.resolve(rootPath??'.');
  try {
    const control=await statOptional(path.join(root,'.vcp'));
    if(!control)return blocked(root,'NO_BOOTSTRAP_CONTROL_DIRECTORY');
    if(!control.isDirectory()||control.isSymbolicLink())
      return blocked(root,'CONTROL_DIRECTORY_NOT_TRUSTED');
    const names=(await readdir(path.join(root,'.vcp'))).sort();
    if(names.length===0)return blocked(root,
      'EMPTY_BOOTSTRAP_NO_PROVENANCE__MANUAL_REVIEW_ONLY');
    if(names.includes('transaction.json')||names.includes('manifest.json'))
      return blocked(root,'NOT_A_PREJOURNAL_ADOPTION_BOOTSTRAP');
    if(!names.includes('update.lock'))
      return blocked(root,'NO_BOOTSTRAP_LOCK_PROVENANCE');
    if(names.some(x=>!KNOWN.has(x)))
      return blocked(root,'FOREIGN_CONTROL_ENTRIES',
        names.filter(x=>!KNOWN.has(x)).map(x=>({path:x,reason:'FOREIGN'})));
    const lockBytes=await readProjectBytes(root,'.vcp/update.lock',{
      managedState:true,maxBytes:4096
    });
    let record;
    try{record=JSON.parse(lockBytes.toString('utf8'));}
    catch{return blocked(root,'BOOTSTRAP_LOCK_JSON_INVALID');}
    if(!shape(record))return blocked(root,'BOOTSTRAP_LOCK_NOT_STAGE13');
    const id=record.operationId;
    const issues=[],inventory={nodes:0,files:0,directories:0};
    if(names.includes('stage')) {
      const stage=(await readdir(path.join(root,'.vcp/stage'))).sort();
      if(stage.some(x=>x!==id))
        issues.push({path:'.vcp/stage',reason:'FOREIGN_OPERATION_ID'});
      await inspectTree(root,'.vcp/stage/'+id,inventory,issues);
    }
    if(names.includes('backups')) {
      const backups=(await readdir(path.join(root,'.vcp/backups'))).sort();
      if(backups.some(x=>x!==id))
        issues.push({path:'.vcp/backups',reason:'FOREIGN_OPERATION_ID'});
      await inspectTree(root,'.vcp/backups/'+id,inventory,issues);
    }
    if(names.includes('baselines'))
      await inspectTree(root,'.vcp/baselines',inventory,issues);
    const after=await statOptional(path.join(root,'.vcp'));
    const lockAfter=await readProjectBytes(root,'.vcp/update.lock',{
      managedState:true,maxBytes:4096
    });
    if(!after||after.dev!==control.dev||after.ino!==control.ino||
       !lockAfter.equals(lockBytes))
      issues.push({path:'.vcp',reason:'BOOTSTRAP_CHANGED_DURING_SCAN'});
    if(issues.length)return blocked(root,'BOOTSTRAP_RESIDUE_UNTRUSTED',issues);
    return Object.freeze({
      root,stage:13,operation:'adopt-bootstrap',
      classification:names.length===1?
        'ORPHAN_ADOPTION_LOCK_ONLY':'PREJOURNAL_STAGING_PRESENT',
      readOnly:true,writeAuthorized:false,mayRemoveState:false,
      mayStealLock:false,
      evidence:{operationId:id,lockHash:sha(lockBytes),
        controlDevice:control.dev.toString(),controlInode:control.ino.toString(),
        stagedNodes:inventory.nodes,stagedFiles:inventory.files,
        stagedDirectories:inventory.directories,
        stateEntries:names},
      requiresOwnerReview:true,requiresNativeExclusiveIsolation:true,
      note:'No Stage13 user path mutation is scheduled before the durable WAL; this source invariant needs independent crash proof before any automated quarantine.'
    });
  }catch(error) {
    return blocked(root,error.code??'BOOTSTRAP_INSPECTION_FAILED');
  }
}
