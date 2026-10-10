// Stage13 read-only on-disk rollback classifier. No cleanup mutation.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {lstat,readdir} from 'node:fs/promises';
import {readProjectBytes} from './safe-read.mjs';
import {validateStage13Transaction} from './stage13-transaction.mjs';
import {classifyStage13RecoverySnapshot} from './stage13-recovery-contract.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const STATES=new Set(['backups','stage','baselines',
  'manifest.json','transaction.json','update.lock','.gitignore']);
function blocked(root,code,issues=[]) {
  return Object.freeze({root,classification:'BLOCKED',
    reason:code,readOnly:true,writeAuthorized:false,
    actions:[],issues});
}
async function scopedRead(root,relative,limit=8*1024*1024,optional=false) {
  return readProjectBytes(root,relative,{
    managedState:relative.startsWith('.vcp/'),maxBytes:limit,optional
  });
}
export async function planStage13Recovery(rootPath) {
  const root=path.resolve(rootPath??'.');
  try {
    const state=await lstat(path.join(root,'.vcp')).catch(e=>{
      if(e.code==='ENOENT')return null;throw e;
    });
    if(!state)return blocked(root,'NO_STAGE13_CONTROL_STATE');
    if(!state.isDirectory()||state.isSymbolicLink())
      return blocked(root,'UNTRUSTED_CONTROL_STATE');
    const controls=await readdir(path.join(root,'.vcp'));
    if(controls.some(name=>!STATES.has(name)))
      return blocked(root,'FOREIGN_CONTROL_ENTRY');
    const bytes=await scopedRead(root,'.vcp/transaction.json',512*1024,true);
    if(!bytes)return blocked(root,'NO_STAGE13_JOURNAL');
    let tx;
    try {tx=JSON.parse(bytes.toString('utf8'));validateStage13Transaction(tx);}
    catch(e){return blocked(root,e?.code??'STAGE13_JOURNAL_MALFORMED');}
    const backupBase='.vcp/backups/'+tx.id;
    const metadata=await scopedRead(root,backupBase+'/backup.json',512*1024);
    let record;
    try{record=JSON.parse(metadata.toString('utf8'));}
    catch{return blocked(root,'STAGE13_BACKUP_METADATA_INVALID');}
    if(record?.kind!=='stage13-complete-recovery-point'||
       record.formatVersion!==3||record.id!==tx.id||
       record.previousVcpAbsent!==true||
       record.rootIdentity!==tx.rootIdentity||
       record.consentFingerprint!==tx.consentFingerprint||
       JSON.stringify(record.items)!==JSON.stringify(tx.items)) {
      return blocked(root,'STAGE13_BACKUP_IDENTITY_MISMATCH');
    }
    const originals=new Map(),current=new Map();
    for(const item of tx.items) {
      const now=await scopedRead(root,item.path,8*1024*1024,true);
      current.set(item.path,now);
      if(item.kind==='managed-section') {
        const original=await scopedRead(root,
          backupBase+'/preimages/'+item.path,8*1024*1024);
        originals.set(item.path,original);
      }
    }
    const manifest=await scopedRead(root,'.vcp/manifest.json',256*1024,true);
    const result=classifyStage13RecoverySnapshot(tx,{
      currentFiles:current,backups:originals,manifestBytes:manifest,
      originalVcpAbsent:true
    });
    return Object.freeze({...result,root,transaction:tx,
      journalSha256:sha(bytes),backupMetadataSha256:sha(metadata),
      readOnly:true,writeAuthorized:false});
  }catch(e) {
    return blocked(root,e?.code??'STAGE13_RECOVERY_INSPECTION_FAILED');
  }
}
