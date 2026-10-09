import path from 'node:path';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { getCliVersion } from './version.mjs';
import { readerSupports, parseSemver } from './semver.mjs';

export const RECOVERY_FORMAT_VERSION=2;
const MAX_ARTIFACT_BYTES=512*1024;
const DIGEST=/^[a-f0-9]{64}$/;
const safeCreated=entry=>{
  if(!isRecord(entry)||typeof entry.path!=='string'||entry.path.length>512||
    !DIGEST.test(entry.hash))return false;
  const parts=entry.path.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'||part.toLowerCase()==='.git'||
    part.includes(':')||/[. ]$/.test(part)||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(part)||
    part.includes(String.fromCharCode(0))||
    part.includes(String.fromCharCode(92))))return false;
  if(parts[0].toLowerCase()==='.vcp') {
    return entry.path==='.vcp/manifest.json'||entry.path==='.vcp/.gitignore'||
      (parts.length>2&&parts[1]==='baselines');
  }
  return true;
};
const PHASES=Object.freeze(['prepared','applying','verified','committed','recovering']);
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function err(code) {const e=new Error(code);e.code=code;return e;}
function string(v){return typeof v==='string'&&v.length>0&&v.length<=256;}
function bool(v){return typeof v==='boolean';}
function same(a,b){return a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&
  a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs;}
async function boundedJson(root,relative) {
  let filename;
  try {filename=await resolveProjectPath(root,relative,{purpose:'managed-state',mustExist:true});}
  catch(e) {
    if(e.code==='E_VCP_PATH'&&e.message.includes('MISSING_INPUT'))return null;
    // Missing managed-state leaf is normal; its parent might not exist.
    if(e.code==='E_VCP_PATH'&&e.message.includes('ROOT_MISSING'))return null;
    throw e;
  }
  let info;try {info=await lstat(filename);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_ARTIFACT_BYTES)throw err('E_RECOVERY_FILE');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const opened=await fd.stat();
    if(!same(info,opened))throw err('E_RECOVERY_RACE');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  if(bytes.length>MAX_ARTIFACT_BYTES||!same(info,await lstat(filename)))throw err('E_RECOVERY_RACE');
  try {return JSON.parse(bytes.toString('utf8'));}catch{throw err('E_RECOVERY_JSON');}
}
function compatibleReader(required,reader) {
  try { parseSemver(required); parseSemver(reader); return readerSupports(required,reader); }
  catch { return false; }
}
export function decodeBackupMetadata(value,{readerVersion=null}={}) {
  if(!isRecord(value)||!string(value.id)||!Array.isArray(value.entries))throw err('E_BACKUP_METADATA');
  if(value.formatVersion===undefined) {
    // Legacy 0.9.3 backup: read-only visibility, never silently upgrade it.
    return Object.freeze({formatVersion:1,id:value.id,operation:'update',
      entries:value.entries.length,legacy:true,priorManifestExisted:true,recoveryCapability:'legacy'});
  }
  if(value.formatVersion!==RECOVERY_FORMAT_VERSION||value.backupSchemaVersion!==2||
    !compatibleReader(value.minimumReaderVersion,readerVersion)||
    !['init','update'].includes(value.operation)||!bool(value.priorVcpDirectoryExisted)||
    !bool(value.priorManifestExisted)||!bool(value.priorBaselinesExisted)||
    !bool(value.lockBootstrapCreatedVcpDirectory)||!string(value.operationId)||
    (value.priorManifestExisted&&!(/^[a-f0-9]{64}$/).test(value.restoredManifestHash))||
    (value.priorInstalledVersion!==null&&!string(value.priorInstalledVersion))) {
    throw err('E_BACKUP_FORMAT');
  }
  if(value.operationId!==value.id)throw err('E_BACKUP_OPERATION_IDENTITY');
  if(value.operation==='init'&&(
    value.priorVcpDirectoryExisted||value.priorManifestExisted||
    value.priorBaselinesExisted||value.priorInstalledVersion!==null||
    value.restoredManifestHash!==null||
    !value.lockBootstrapCreatedVcpDirectory||value.entries.length>0)) {
    throw err('E_INITIAL_BACKUP_PRESTATE');
  }
  if(value.operation==='update'&&(
    !value.priorVcpDirectoryExisted||!value.priorManifestExisted||
    value.lockBootstrapCreatedVcpDirectory||
    !string(value.priorInstalledVersion)||!DIGEST.test(value.restoredManifestHash))) {
    throw err('E_MANAGED_BACKUP_PRESTATE');
  }
  for(const entry of value.entries) {
    if(!isRecord(entry)||!safeCreated({path:entry.path,hash:'0'.repeat(64)})||
      !bool(entry.exists))throw err('E_BACKUP_ENTRY');
  }
  return Object.freeze({formatVersion:2,id:value.id,operation:value.operation,
    operationId:value.operationId,entries:value.entries.length,legacy:false,
    minimumReaderVersion:value.minimumReaderVersion,restoredManifestHash:value.restoredManifestHash??null,
    priorManifestExisted:value.priorManifestExisted,
    priorBaselinesExisted:value.priorBaselinesExisted,
    priorVcpDirectoryExisted:value.priorVcpDirectoryExisted,
    recoveryCapability:'versioned'});
}
export function decodeManagedTransaction(value,{readerVersion=null}={}) {
  if(value==null)return null;
  if(!isRecord(value)||!string(value.id)||!string(value.backupId))throw err('E_TRANSACTION_FORMAT');
  if(value.formatVersion===undefined) {
    return Object.freeze({formatVersion:1,id:value.id,phase:value.phase,
      backupId:value.backupId,committed:false,legacy:true,
      recommendation:'require-manual-legacy-recovery'});
  }
  if(value.formatVersion!==RECOVERY_FORMAT_VERSION||value.transactionSchemaVersion!==2||
    !compatibleReader(value.minimumReaderVersion,readerVersion)||
    !['init','update'].includes(value.operation)||
    !PHASES.includes(value.phase)||!string(value.operationId)||value.operationId!==value.id||
    typeof value.startedAt!=='string'||!Number.isFinite(Date.parse(value.startedAt)))throw err('E_TRANSACTION_FORMAT');
  if(value.phase==='committed'&&(!string(value.committedAt)||!string(value.committedManifestHash))) {
    throw err('E_COMMITTED_EVIDENCE');
  }
  if(value.plannedManifestHash!==undefined&&!DIGEST.test(value.plannedManifestHash)) {
    throw err('E_PLANNED_MANIFEST_IDENTITY');
  }
  if(value.phase==='committed'&&value.plannedManifestHash!==undefined&&
    value.plannedManifestHash!==value.committedManifestHash) {
    throw err('E_COMMITTED_HASH_MISMATCH');
  }
  if(value.createdFiles!==undefined) {
    if(!Array.isArray(value.createdFiles)||value.createdFiles.length>10000)throw err('E_TRANSACTION_CREATED');
    const seen=new Set();
    for(const item of value.createdFiles) {
      if(!safeCreated(item)||seen.has(item.path))throw err('E_TRANSACTION_CREATED');
      seen.add(item.path);
    }
  }
  if(value.operation==='init'&&!Array.isArray(value.createdFiles))throw err('E_TRANSACTION_CREATED');
  return Object.freeze({formatVersion:2,id:value.id,phase:value.phase,
    startedAt:value.startedAt,
    backupId:value.backupId,committed:value.phase==='committed',legacy:false,
    committedManifestHash:value.committedManifestHash??null,
    plannedManifestHash:value.plannedManifestHash??null,
    operation:value.operation,createdFiles:value.createdFiles??[],
    minimumReaderVersion:value.minimumReaderVersion,
    recommendation:value.phase==='committed'?'verify-committed-state-before-cleanup':'restore-owned-backup'});
}
export async function inspectManagedRecovery(root,{backupId=null}={}) {
  const selected=path.resolve(root);
  try {
    const readerVersion=await getCliVersion();
    const tx=decodeManagedTransaction(await boundedJson(selected,'.vcp/transaction.json'),{readerVersion});
    const targetBackup=backupId??tx?.backupId??null;
    if(targetBackup && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(targetBackup))throw err('E_BACKUP_ID');
    const backup=targetBackup?
      decodeBackupMetadata(await boundedJson(selected,`.vcp/backups/${targetBackup}/backup.json`),{readerVersion}):null;
    if(targetBackup&&!backup)throw err('E_BACKUP_MISSING');
    if(backup&&backup.id!==targetBackup)throw err('E_BACKUP_ID_MISMATCH');
    if(tx&&backup&&tx.backupId!==backup.id)throw err('E_BACKUP_ID_MISMATCH');
    if(tx?.committed) {
      const filename=await resolveProjectPath(selected,'.vcp/manifest.json',{
        purpose:'managed-state',mustExist:true
      });
      const info=await lstat(filename);
      if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_ARTIFACT_BYTES)throw err('E_COMMITTED_STATE_UNPROVEN');
      const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
      let bytes;
      try {
        const opened=await fd.stat();
        if(!same(info,opened))throw err('E_COMMITTED_STATE_UNPROVEN');
        bytes=await fd.readFile();
      }finally{await fd.close();}
      if(!same(info,await lstat(filename))||
        createHash('sha256').update(bytes).digest('hex')!==tx.committedManifestHash) {
        throw err('E_COMMITTED_STATE_UNPROVEN');
      }
    }
    return {readOnly:true,root:selected,transaction:tx,backup,
      needsRecovery:Boolean(tx&&!tx.committed),cleanupAuthorized:false,writeAuthorized:false};
  }catch(e) {
    return {readOnly:true,root:selected,blocked:true,reason:e.code??'E_RECOVERY_INSPECTION',
      needsRecovery:false,cleanupAuthorized:false,writeAuthorized:false};
  }
}


export function describeVersionedBackup({
  id,operationId,operation='update',preLockSnapshot,entries=[],
  minimumReaderVersion,restoredManifestHash=null
}) {
  if(!string(id)||!string(operationId)||!['init','update'].includes(operation)||
     !isRecord(preLockSnapshot)||!Array.isArray(entries))throw err('E_BACKUP_INPUT');
  const prior=preLockSnapshot;
  if(!bool(prior.vcpDirectoryExisted)||!bool(prior.manifestExisted)||
     !bool(prior.baselinesExisted)||!bool(prior.lockBootstrapCreatedVcpDirectory)||
     (prior.installedVersion!==null&&!string(prior.installedVersion)))throw err('E_BACKUP_PRELOCK');
  const descriptor={
    formatVersion:RECOVERY_FORMAT_VERSION,backupSchemaVersion:2,
    minimumReaderVersion,restoredManifestHash,id,operationId,operation,
    priorVcpDirectoryExisted:prior.vcpDirectoryExisted,
    priorManifestExisted:prior.manifestExisted,
    priorBaselinesExisted:prior.baselinesExisted,
    priorInstalledVersion:prior.installedVersion,
    lockBootstrapCreatedVcpDirectory:prior.lockBootstrapCreatedVcpDirectory,
    entries:entries.map(({path:relative,exists,mode})=>({path:relative,exists,mode}))
  };
  decodeBackupMetadata(descriptor,{readerVersion:minimumReaderVersion});
  if(operation==='update'&&!descriptor.priorManifestExisted)throw err('E_MANAGED_PRIOR_STATE');
  if(operation==='init'&&descriptor.priorManifestExisted)throw err('E_ADOPTION_PRIOR_STATE');
  return descriptor;
}

export function describeVersionedTransaction({operationId,backupId,phase='prepared',operation='update',
  minimumReaderVersion,committedAt=null,committedManifestHash=null,startedAt=null,
  plannedManifestHash=null,createdFiles=[]}) {
  if(!string(operationId)||!string(backupId)||!PHASES.includes(phase))throw err('E_TRANSACTION_INPUT');
  if(phase==='committed'&&(!string(committedAt)||
      !(/^[0-9a-f]{64}$/).test(committedManifestHash)))throw err('E_COMMITTED_EVIDENCE');
  const result={formatVersion:RECOVERY_FORMAT_VERSION,transactionSchemaVersion:2,
    minimumReaderVersion,operation,
    id:operationId,operationId,backupId,phase,startedAt,
    ...(operation==='init'?{createdFiles}:{}),
    ...(plannedManifestHash?{plannedManifestHash}:{}),
    ...(phase==='committed'?{committedAt,committedManifestHash}:{})};
  decodeManagedTransaction(result,{readerVersion:minimumReaderVersion});
  return result;
}

export function decideManagedRecovery({transaction,backup,manifestHash=null}) {
  if(!transaction)return {kind:'none',writeAuthorized:false};
  if(!backup||backup.id!==transaction.backupId)return {
    kind:'blocked',reason:'E_BACKUP_ID_MISMATCH',writeAuthorized:false
  };
  if(transaction.committed) {
    // Cleanup cannot use phase alone; it must prove the committed manifest matches.
    if(typeof manifestHash!=='string'||manifestHash!==transaction.committedManifestHash) {
      return {kind:'blocked',reason:'E_COMMITTED_STATE_UNPROVEN',writeAuthorized:false};
    }
    return {kind:'committed-state-recognized',writeAuthorized:false,
      note:'Cleanup requires exclusive owned lock and no user edits'};
  }
  return {kind:'restore-required',writeAuthorized:false,backupId:backup.id,
    note:'Do not overwrite concurrent user edits; require exact owned transaction and safe restoration'};
}
