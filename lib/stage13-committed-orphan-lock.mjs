// Stage13 postcommit, postjournal orphan lock reconciliation.
// The v3 journal is intentionally cleared LAST within finalization, but
// process death between journal unlink and owned lock release is possible.
// This read-only inspector proves the committed v2 manifest against the
// transaction backup and exact claimed file/directory native identities.
// The writer path can only archive an explicitly approved dead lock; no
// deletion, schema migration or unapproved managed mutation occurs.
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {lstat} from 'node:fs/promises';
import {readProjectBytes} from './safe-read.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';
import {exactNativeIdentity} from './stage13-identity.mjs';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {validateAdaptiveManifest} from './manifest-v2.mjs';
import {validateStage13Transaction} from './stage13-transaction.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const SAFE_ID=/^adopt-[a-f0-9]{32}$/;
const SHA=/^[a-f0-9]{64}$/;
function fail(code){const e=new Error(code);e.code=code;throw e;}
const blocked=(root,reason)=>Object.freeze({stage:13,root,readOnly:true,
  writeAuthorized:false,classification:'BLOCKED',reason});
const state=(root,relative,maxBytes=8*1024*1024,optional=false)=>
  readProjectBytes(root,relative,{
    managedState:true,maxBytes,optional
  });
function isAlive(pid){
  try{process.kill(pid,0);return true;}
  catch(e){return e.code!=='ESRCH';}
}
export async function inspectStage13CommittedOrphanLock(rootPath,{
  provider=new LinuxFsProvider()
}={}) {
  const root=path.resolve(rootPath??'.');
  try {
    const journal=await state(root,'.vcp/transaction.json',512*1024,true);
    if(journal!==null)return blocked(root,'JOURNAL_PRESENT_USE_TRANSACTION_RECOVERY');
    const [lockBytes,manifestBytes]=await Promise.all([
      state(root,'.vcp/update.lock',4096,true),
      state(root,'.vcp/manifest.json',256*1024,true)
    ]);
    if(!lockBytes||!manifestBytes)return blocked(root,'NO_FINALIZED_ADOPTION_LOCK');
    let lock,manifest;
    try {
      lock=JSON.parse(lockBytes.toString('utf8'));
      manifest=JSON.parse(manifestBytes.toString('utf8'));
    }catch{return blocked(root,'FINALIZED_ADOPTION_JSON_INVALID');}
    if(lock?.version!==2||lock.mode!=='adopt'||
       !SAFE_ID.test(lock.operationId??'')||
       !SHA.test(lock.consentFingerprint??'')||
       !/^[a-f0-9]{48}$/.test(lock.token??'')||
       !Number.isInteger(lock.pid)||lock.pid<=0||
       typeof lock.host!=='string'||!lock.host||
       lock.bootstrapPriorVcpAbsent!==true)
      return blocked(root,'FINALIZED_ADOPTION_LOCK_NOT_OWNED');
    if(manifest?.schemaVersion!==2||
       manifest.install?.assetSet!=='brownfield-minimal-v1'||
       !manifest.ownership||!manifest.managedFiles)
      return blocked(root,'FINALIZED_ADOPTION_MANIFEST_NOT_SUPPORTED');
    const operationId=lock.operationId;
    const backupBytes=await state(root,
      '.vcp/backups/'+operationId+'/backup.json',512*1024);
    let backup;
    try{backup=JSON.parse(backupBytes.toString('utf8'));}
    catch{return blocked(root,'FINALIZED_ADOPTION_BACKUP_JSON_INVALID');}
    const rootInfo=await lstat(root);
    if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||
       sha(Buffer.from(root+'|'+rootInfo.dev+'|'+rootInfo.ino))!==
         backup?.rootIdentity)
      return blocked(root,'FINALIZED_ADOPTION_ROOT_IDENTITY_CHANGED');
    if(backup?.kind!=='stage13-complete-recovery-point'||
       backup.formatVersion!==3||backup.id!==operationId||
       backup.previousVcpAbsent!==true||
       backup.consentFingerprint!==lock.consentFingerprint||
       backup.manifestSha256!==sha(manifestBytes)||
       !Array.isArray(backup.items)||backup.items.length>64||
       !Array.isArray(backup.createdDirectories)||
       backup.createdDirectories.length>128)
      return blocked(root,'FINALIZED_ADOPTION_BACKUP_NOT_MATCHED');
    try {
      validateAdaptiveManifest(manifest,{
        readerVersion:backup.minimumReaderVersion
      });
      validateStage13Transaction({
        formatVersion:3,operation:'adopt',id:backup.id,
        rootIdentity:backup.rootIdentity,
        consentFingerprint:backup.consentFingerprint,
        manifestSha256:backup.manifestSha256,
        minimumReaderVersion:backup.minimumReaderVersion,
        createdAt:'2026-10-11T00:00:00.000Z',phase:'committed',
        previousVcpAbsent:true,items:backup.items,
        createdDirectories:backup.createdDirectories
      });
    }catch(error){return blocked(root,error.code??
      'FINALIZED_ADOPTION_SCHEMA_INVALID');}
    const seen=new Set();
    for(const entry of backup.items) {
      if(typeof entry.path!=='string'||seen.has(entry.path)||
         !SHA.test(entry.newSha256??'')||
         !SHA.test(entry.baselineSha256??''))
        return blocked(root,'FINALIZED_ADOPTION_LEDGER_INVALID');
      seen.add(entry.path);
      if(manifest.managedFiles[entry.path]?.baselineHash!==
         entry.baselineSha256||
         manifest.ownership[entry.path]?.kind!==
           (entry.kind==='whole-file'?'whole-file':'managed-section'))
        return blocked(root,'FINALIZED_ADOPTION_OWNERSHIP_CHANGED');
      const bytes=await readProjectBytes(root,entry.path,{
        maxBytes:8*1024*1024
      });
      if(sha(bytes)!==entry.newSha256)
        return blocked(root,'FINALIZED_ADOPTION_USER_FILE_CHANGED');
      const native=exactNativeIdentity(await provider.statIdentity(root,
        entry.path),{type:'file'});
      if(native.dev!==entry.stagedDev||native.ino!==entry.stagedIno)
        return blocked(root,'FINALIZED_ADOPTION_FILE_INODE_CHANGED');
      const baseline=await state(root,'.vcp/baselines/'+entry.path,
        8*1024*1024);
      if(sha(baseline)!==entry.baselineSha256)
        return blocked(root,'FINALIZED_ADOPTION_BASELINE_CHANGED');
      if(entry.kind==='managed-section') {
        if(manifest.ownership[entry.path]?.sectionId!==entry.sectionId||
           manifest.ownership[entry.path]?.baselineHash!==
             entry.baselineSha256)
          return blocked(root,'FINALIZED_ADOPTION_SECTION_OWNER_CHANGED');
        const displacedPath='.vcp/backups/'+operationId+
          '/displaced/'+entry.path;
        const displaced=await state(root,displacedPath,8*1024*1024);
        if(sha(displaced)!==entry.oldSha256)
          return blocked(root,'FINALIZED_ADOPTION_USER_PREIMAGE_CHANGED');
        const proof=exactNativeIdentity(await provider.statIdentity(
          root,displacedPath),{type:'file'});
        if(proof.dev!==entry.originalDev||proof.ino!==entry.originalIno)
          return blocked(root,'FINALIZED_ADOPTION_ORIGINAL_INODE_CHANGED');
      }
    }
    for(const directory of backup.createdDirectories) {
      const at=exactNativeIdentity(await provider.statIdentity(root,
        directory.path),{type:'dir'});
      if(at.dev!==directory.dev||at.ino!==directory.ino)
        return blocked(root,'FINALIZED_ADOPTION_DIRECTORY_CHANGED');
    }
    if(Object.keys(manifest.managedFiles).length!==seen.size)
      return blocked(root,'FINALIZED_ADOPTION_UNKNOWN_MANAGED_FILES');
    const lockOwnerAlive=lock.host!==os.hostname()?null:isAlive(lock.pid);
    return Object.freeze({stage:13,root,
      classification:lockOwnerAlive===null?'OTHER_HOST_OWNER_UNPROVEN':
        lockOwnerAlive?'LOCK_OWNER_MAY_BE_ALIVE':
          'COMMITTED_ORPHAN_LOCK_CANDIDATE',
      readOnly:true,writeAuthorized:false,mayDeleteLock:false,
      requiresOwnerApproval:true,requiresNativeIsolation:true,
      transactionId:operationId,
      consentFingerprint:lock.consentFingerprint,
      manifestSha256:sha(manifestBytes),lockSha256:sha(lockBytes),
      verifiedManagedFiles:seen.size,
      verifiedCreatedDirectories:backup.createdDirectories.length
    });
  }catch(error) {
    return blocked(root,error?.code??'COMMITTED_ORPHAN_INSPECTION_FAILED');
  }
}
export async function retireStage13CommittedOrphanLock({
  targetDir,approval,provider=new LinuxFsProvider()
}={}) {
  assertManagedMigrationGate();
  const root=path.resolve(targetDir??'.');
  const first=await inspectStage13CommittedOrphanLock(root,{provider});
  if(first.classification!=='COMMITTED_ORPHAN_LOCK_CANDIDATE')
    fail('E_STAGE13_FINAL_LOCK_UNPROVEN');
  if(approval?.kind!=='RETIRE_COMMITTED_STAGE13_ORPHAN_LOCK'||
     approval.root!==root||approval.explicitConsent!==true||
     approval.transactionId!==first.transactionId||
     approval.manifestSha256!==first.manifestSha256||
     approval.lockSha256!==first.lockSha256)
    fail('E_STAGE13_FINAL_LOCK_OWNER_CONSENT_REQUIRED');
  const now=await inspectStage13CommittedOrphanLock(root,{provider});
  if(now.classification!==first.classification||
     now.manifestSha256!==first.manifestSha256||
     now.lockSha256!==first.lockSha256)
    fail('E_STAGE13_FINAL_LOCK_CHANGED');
  const dest='.vcp/backups/'+first.transactionId+
    '/retired-committed-lock-'+first.lockSha256+'.json';
  const moved=await provider.moveNoReplace(root,'.vcp/update.lock',dest);
  if(moved?.srcParentSynced!==true||moved?.dstParentSynced!==true)
    fail('E_STAGE13_FINAL_LOCK_MOVE_UNDURABLE');
  const evidence=await state(root,dest,4096);
  if(sha(evidence)!==first.lockSha256)
    fail('E_STAGE13_FINAL_LOCK_ARCHIVE_CHANGED');
  return Object.freeze({stage:13,root,
    classification:'COMMITTED_ORPHAN_LOCK_RETIRED',
    managedFilesPreserved:first.verifiedManagedFiles,
    priorLockArchived:true,noDataDeleted:true
  });
}
