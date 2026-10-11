// Stage13 read-only on-disk rollback classifier. No cleanup mutation.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {lstat,readdir} from 'node:fs/promises';
import {readProjectBytes} from './safe-read.mjs';
import {validateStage13Transaction} from './stage13-transaction.mjs';
import {classifyStage13RecoverySnapshot} from './stage13-recovery-contract.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';
import {exactNativeIdentity} from './stage13-identity.mjs';
import {inspectStage13AbsentClaims,
  inspectStage13AbsentDirectories} from './stage13-recovery-provenance.mjs';
import {inspectStage13BootstrapResidue} from './stage13-bootstrap-recovery.mjs';

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
    if(!bytes) {
      const bootstrap=await inspectStage13BootstrapResidue(root);
      return bootstrap.classification==='BLOCKED'?
        blocked(root,bootstrap.reason,bootstrap.issues):bootstrap;
    }
    let tx;
    try {tx=JSON.parse(bytes.toString('utf8'));validateStage13Transaction(tx);}
    catch(e){return blocked(root,e?.code??'STAGE13_JOURNAL_MALFORMED');}
    const rootStat=await lstat(root);
    if(!rootStat.isDirectory()||rootStat.isSymbolicLink()||
       sha(Buffer.from(root+'|'+rootStat.dev+'|'+rootStat.ino))!==
       tx.rootIdentity)
      return blocked(root,'STAGE13_SELECTED_ROOT_IDENTITY_CHANGED');
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
       record.minimumReaderVersion!==tx.minimumReaderVersion||
       record.manifestSha256!==tx.manifestSha256||
       JSON.stringify(record.items)!==JSON.stringify(tx.items)||
       JSON.stringify(record.createdDirectories)!==
         JSON.stringify(tx.createdDirectories)) {
      return blocked(root,'STAGE13_BACKUP_IDENTITY_MISMATCH');
    }
    const originals=new Map(),current=new Map(),
      currentIdentities=new Map(),currentDirectories=new Map();
    const provider=new LinuxFsProvider();
    for(const directory of tx.createdDirectories) {
      let state;
      try{state=await lstat(path.join(root,...directory.path.split('/')));}
      catch(e){if(e?.code!=='ENOENT')throw e;}
      if(!state)continue;
      if(!state.isDirectory()||state.isSymbolicLink())
        return blocked(root,'STAGE13_CREATED_DIRECTORY_UNSAFE');
      const exact=exactNativeIdentity(
        await provider.statIdentity(root,directory.path),{type:'dir'});
      currentDirectories.set(directory.path,exact);
    }
    for(const item of tx.items) {
      const now=await scopedRead(root,item.path,8*1024*1024,true);
      current.set(item.path,now);
      if(now!==null){
        const identity=await lstat(path.join(root,...item.path.split('/')));
        if(!identity.isFile()||identity.isSymbolicLink())
          return blocked(root,'STAGE13_TARGET_CHANGED');
        const exact=exactNativeIdentity(
          await provider.statIdentity(root,item.path),{type:'file'});
        currentIdentities.set(item.path,exact);
      }
      if(item.kind==='managed-section') {
        const original=await scopedRead(root,
          backupBase+'/preimages/'+item.path,8*1024*1024);
        originals.set(item.path,original);
      }
    }
    const manifest=await scopedRead(root,'.vcp/manifest.json',256*1024,true);
    const result=classifyStage13RecoverySnapshot(tx,{
      currentFiles:current,currentIdentities,currentDirectories,
      backups:originals,manifestBytes:manifest,
      originalVcpAbsent:true
    });
    if(result.classification==='BLOCKED')
      return Object.freeze({...result,root,transaction:tx,
        journalSha256:sha(bytes),backupMetadataSha256:sha(metadata)});
    const missingPaths=new Set(tx.items.filter(entry=>
      entry.kind==='whole-file'&&current.get(entry.path)===null
    ).map(entry=>entry.path));
    const provenance=await inspectStage13AbsentClaims(root,tx,{
      missingPaths,provider
    });
    if(provenance.classification==='BLOCKED')
      return blocked(root,'STAGE13_ABSENT_CLAIM_UNACCOUNTED',provenance.issues);
    const missingDirectories=new Set(tx.createdDirectories.filter(entry=>
      !currentDirectories.has(entry.path)
    ).map(entry=>entry.path));
    const directoryProvenance=await inspectStage13AbsentDirectories(root,tx,{
      missingDirectories,provider
    });
    if(directoryProvenance.classification==='BLOCKED')
      return blocked(root,'STAGE13_ABSENT_DIRECTORY_UNACCOUNTED',
        directoryProvenance.issues);
    return Object.freeze({...result,
      absentClaimEvidence:provenance.evidence,
      absentDirectoryEvidence:directoryProvenance.evidence,
      root,transaction:tx,
      journalSha256:sha(bytes),backupMetadataSha256:sha(metadata),
      readOnly:true,writeAuthorized:false});
  }catch(e) {
    return blocked(root,e?.code??'STAGE13_RECOVERY_INSPECTION_FAILED');
  }
}
