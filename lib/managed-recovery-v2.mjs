import path from 'node:path';
import { createHash } from 'node:crypto';
import { readProjectBytes } from './safe-read.mjs';
import { getCliVersion } from './version.mjs';
import { validateAdaptiveManifest } from './manifest-v2.mjs';
import { readerSupports, parseSemver, compareSemver } from './semver.mjs';

export const RECOVERY_FORMAT_VERSION=2;
const MAX_ARTIFACT_BYTES=512*1024;
const DIGEST=/^[a-f0-9]{64}$/;
const V2_BACKUP_FIELDS=new Set([
  'formatVersion','backupSchemaVersion','minimumReaderVersion',
  'restoredManifestHash','id','operationId','operation',
  'priorVcpDirectoryExisted','priorManifestExisted','priorBaselinesExisted',
  'priorInstalledVersion','lockBootstrapCreatedVcpDirectory','entries'
]);
const V2_JOURNAL_FIELDS=new Set([
  'formatVersion','transactionSchemaVersion','minimumReaderVersion',
  'operation','id','operationId','backupId','phase','startedAt',
  'createdFiles','plannedManifestHash','committedAt','committedManifestHash',
  'cleanupBackupHash'
]);
const V2_ENTRY_FIELDS=new Set(['path','exists','mode']);
const V2_CREATED_FILE_FIELDS=new Set(['path','hash']);
const SAFE_BACKUP_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function onlyKnown(value,allowed,code) {
  if(!isRecord(value))throw err(code);
  for(const key of Object.keys(value))if(!allowed.has(key))throw err(code);
}
// Names must be unambiguous on case-insensitive / Unicode-normalizing hosts.
const portablePath=relative=>relative.normalize('NFC').toLowerCase();
function rejectFileAncestors(names,code) {
  for(const name of names) {
    let parent=name;
    while(parent.includes('/')) {
      parent=parent.slice(0,parent.lastIndexOf('/'));
      if(names.has(parent))throw err(code);
    }
  }
}

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
const PHASES=Object.freeze(['prepared','applying','verified','committed','recovering','cleanup']);
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function err(code) {const e=new Error(code);e.code=code;return e;}
function string(v){return typeof v==='string'&&v.length>0&&v.length<=256;}
function bool(v){return typeof v==='boolean';}
async function boundedJson(root,relative) {
  // Share the bounded no-follow descriptor reader used for Manifest and
  // backup bytes. A concurrent file-growth attack cannot cause readFile()
  // to allocate its entire untrusted content before the limit is checked.
  let bytes;
  try {
    bytes=await readProjectBytes(root,relative,{
      managedState:true,optional:true,maxBytes:MAX_ARTIFACT_BYTES
    });
  }catch(error) {
    if(error?.code==='E_PROJECT_FILE_UNSAFE')throw err('E_RECOVERY_FILE');
    if(error?.code==='E_PROJECT_READ_RACE')throw err('E_RECOVERY_RACE');
    throw error;
  }
  if(bytes===null)return null;
  try {return JSON.parse(bytes.toString('utf8'));}
  catch{throw err('E_RECOVERY_JSON');}
}
function compatibleReader(required,reader) {
  try { parseSemver(required); parseSemver(reader); return readerSupports(required,reader); }
  catch { return false; }
}
export function assertCommittedAdaptiveState(tx,manifest,{readerVersion=null}={}) {
  if(!tx||tx.formatVersion!==2||!tx.committed||
    !['init','update'].includes(tx.operation))throw err('E_COMMITTED_STATE_UNPROVEN');
  try {validateAdaptiveManifest(manifest,{readerVersion});}
  catch{throw err('E_COMMITTED_STATE_UNPROVEN');}
  if((tx.operation==='init'&&
      (manifest.install.assetSet!=='greenfield-safe-v1'||
       manifest.migrationProvenance!==undefined))||
     (tx.operation==='update'&&
      (manifest.install.assetSet!=='legacy-full-v1'||
       manifest.migrationProvenance?.fromSchema!==1||
       manifest.migrationProvenance?.toSchema!==2))) {
    throw err('E_COMMITTED_STATE_UNPROVEN');
  }
  return Object.freeze({schemaVersion:2,operation:tx.operation,valid:true});
}

export function decodeBackupMetadata(value,{readerVersion=null}={}) {
  if(!isRecord(value)||!string(value.id)||!Array.isArray(value.entries))throw err('E_BACKUP_METADATA');
  if(value.formatVersion===undefined) {
    // Legacy 0.9.3 backup: read-only visibility, never silently upgrade it.
    return Object.freeze({formatVersion:1,id:value.id,operation:'update',
      entries:value.entries.length,legacy:true,priorManifestExisted:true,recoveryCapability:'legacy'});
  }
  onlyKnown(value,V2_BACKUP_FIELDS,'E_BACKUP_UNKNOWN_FIELDS');
  if(!SAFE_BACKUP_ID.test(value.id)||!SAFE_BACKUP_ID.test(value.operationId)) {
    throw err('E_BACKUP_UNSAFE_ID');
  }
  if(value.formatVersion!==RECOVERY_FORMAT_VERSION||value.backupSchemaVersion!==2||
    !compatibleReader(value.minimumReaderVersion,readerVersion)||
    compareSemver(value.minimumReaderVersion,'0.9.3')<=0||
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
  // Windows can resolve case-variant names to the same destination.
  // Reject ambiguous ownership ledgers on every host, including Linux.
  const seenEntryPaths=new Set();
  for(const entry of value.entries) {
    onlyKnown(entry,V2_ENTRY_FIELDS,'E_BACKUP_ENTRY_FIELDS');
    if(!isRecord(entry)||!safeCreated({path:entry.path,hash:'0'.repeat(64)})||
      !bool(entry.exists)||
      (entry.mode!==undefined&&
        (!Number.isInteger(entry.mode)||entry.mode<0||entry.mode>0o777))) {
      throw err('E_BACKUP_ENTRY');
    }
    const portable=portablePath(entry.path);
    if(seenEntryPaths.has(portable))throw err('E_BACKUP_ENTRY');
    seenEntryPaths.add(portable);
  }
  rejectFileAncestors(seenEntryPaths,'E_BACKUP_ENTRY');
  return Object.freeze({formatVersion:2,id:value.id,operation:value.operation,
    operationId:value.operationId,entries:value.entries.length,legacy:false,
    minimumReaderVersion:value.minimumReaderVersion,restoredManifestHash:value.restoredManifestHash??null,
    priorManifestExisted:value.priorManifestExisted,
    priorInstalledVersion:value.priorInstalledVersion,
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
  onlyKnown(value,V2_JOURNAL_FIELDS,'E_TRANSACTION_UNKNOWN_FIELDS');
  if(!SAFE_BACKUP_ID.test(value.id)||!SAFE_BACKUP_ID.test(value.backupId)) {
    throw err('E_TRANSACTION_UNSAFE_ID');
  }
  if(value.formatVersion!==RECOVERY_FORMAT_VERSION||value.transactionSchemaVersion!==2||
    !compatibleReader(value.minimumReaderVersion,readerVersion)||
    compareSemver(value.minimumReaderVersion,'0.9.3')<=0||
    !['init','update'].includes(value.operation)||
    !PHASES.includes(value.phase)||!string(value.operationId)||value.operationId!==value.id||
    typeof value.startedAt!=='string'||!Number.isFinite(Date.parse(value.startedAt)))throw err('E_TRANSACTION_FORMAT');
  if(value.id!==value.backupId)throw err('E_TRANSACTION_BACKUP_IDENTITY');
  if(value.phase==='cleanup'&&
    (value.operation!=='init'||!DIGEST.test(value.cleanupBackupHash))) {
    throw err('E_TERMINAL_CLEANUP_EVIDENCE');
  }
  if(value.phase!=='cleanup'&&value.cleanupBackupHash!==undefined) {
    throw err('E_TERMINAL_CLEANUP_EVIDENCE');
  }
  if(value.phase==='committed'&&(!string(value.committedAt)||
    !DIGEST.test(value.committedManifestHash))) {
    throw err('E_COMMITTED_EVIDENCE');
  }
  if(value.operation==='update'&&!DIGEST.test(value.plannedManifestHash)) {
    throw err('E_MANAGED_TARGET_HASH_REQUIRED');
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
      onlyKnown(item,V2_CREATED_FILE_FIELDS,'E_CREATED_FILE_UNRECOGNIZED');
      if(!safeCreated(item))throw err('E_TRANSACTION_CREATED');
      const portable=portablePath(item.path);
      if(seen.has(portable))throw err('E_TRANSACTION_CREATED');
      seen.add(portable);
    }
    rejectFileAncestors(seen,'E_TRANSACTION_CREATED');
  }
  if(value.operation==='init') {
    if(!Array.isArray(value.createdFiles))throw err('E_TRANSACTION_CREATED');
    // The production greenfield writer always journals these two exact
    // control files before attempting any user-file write. An incomplete or
    // forged ownership ledger must not authorize recovery of arbitrary files.
    const names=new Set(value.createdFiles.map(item=>item.path));
    if(!names.has('.vcp/manifest.json')||!names.has('.vcp/.gitignore')) {
      throw err('E_TRANSACTION_INIT_LEDGER');
    }
  }
  return Object.freeze({formatVersion:2,id:value.id,phase:value.phase,
    startedAt:value.startedAt,
    backupId:value.backupId,committed:value.phase==='committed',legacy:false,
    committedManifestHash:value.committedManifestHash??null,
    plannedManifestHash:value.plannedManifestHash??null,
    operation:value.operation,createdFiles:value.createdFiles??[],
    minimumReaderVersion:value.minimumReaderVersion,
    cleanupBackupHash:value.cleanupBackupHash??null,
    recommendation:value.phase==='committed'?'verify-committed-state-before-cleanup':'restore-owned-backup'});
}
// A terminal init cleanup checkpoint can outlive its backup.json. Select the
// descriptor by the journal's exact identity; no arbitrary caller override is
// allowed and no missing ordinary backup can be assumed safe.
export function selectRecoveryBackupMetadata({
  transaction=null,backupId=null,backupMetadata=null,readerVersion=null
}={}) {
  const selected=backupId??transaction?.backupId??null;
  if(selected&&!SAFE_BACKUP_ID.test(selected))throw err('E_BACKUP_ID');
  if(transaction&&selected!==transaction.backupId)
    throw err('E_BACKUP_ID_MISMATCH');
  if(backupMetadata==null) {
    if(selected&&!(transaction?.phase==='cleanup'&&
      transaction.operation==='init'&&transaction.formatVersion===2)) {
      throw err('E_BACKUP_MISSING');
    }
    return null;
  }
  if(!selected)throw err('E_BACKUP_UNREQUESTED');
  const backup=decodeBackupMetadata(backupMetadata,{readerVersion});
  if(backup.id!==selected)throw err('E_BACKUP_ID_MISMATCH');
  if(transaction&&backup.id!==transaction.backupId)
    throw err('E_BACKUP_ID_MISMATCH');
  if(transaction&&backup.operation!==transaction.operation)
    throw err('E_BACKUP_OPERATION_MISMATCH');
  if(transaction&&backup.minimumReaderVersion!==transaction.minimumReaderVersion)
    throw err('E_BACKUP_READER_IDENTITY_MISMATCH');
  return backup;
}

export async function inspectManagedRecovery(root,{backupId=null}={}) {
  const selected=path.resolve(root);
  try {
    const readerVersion=await getCliVersion();
    const tx=decodeManagedTransaction(await boundedJson(selected,'.vcp/transaction.json'),{readerVersion});
    const targetBackup=backupId??tx?.backupId??null;
    // Decode only after testing for absence: null is legitimate solely for
    // the self-contained terminal init checkpoint. Previously decoding null
    // threw E_BACKUP_METADATA before this terminal exception was evaluated.
    const metadata=targetBackup?
      await boundedJson(selected,`.vcp/backups/${targetBackup}/backup.json`):null;
    const backup=selectRecoveryBackupMetadata({
      transaction:tx,backupId,backupMetadata:metadata,readerVersion
    });
    if(tx?.committed) {
      let bytes;
      try {
        bytes=await readProjectBytes(selected,'.vcp/manifest.json',{
          managedState:true,maxBytes:MAX_ARTIFACT_BYTES
        });
      }catch{throw err('E_COMMITTED_STATE_UNPROVEN');}
      if(createHash('sha256').update(bytes).digest('hex')!==tx.committedManifestHash) {
        throw err('E_COMMITTED_STATE_UNPROVEN');
      }
      // A digest-matching but malformed or incompatible document is not a
      // usable committed managed state. Never discard the final journal
      // solely because an attacker-controlled hash happens to match.
      let manifest;
      try {manifest=JSON.parse(bytes.toString('utf8'));}
      catch{throw err('E_COMMITTED_STATE_UNPROVEN');}
      assertCommittedAdaptiveState(tx,manifest,{readerVersion});
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
  plannedManifestHash=null,createdFiles=[],cleanupBackupHash=null}) {
  if(!string(operationId)||!string(backupId)||!PHASES.includes(phase))throw err('E_TRANSACTION_INPUT');
  if(phase==='committed'&&(!string(committedAt)||
      !(/^[0-9a-f]{64}$/).test(committedManifestHash)))throw err('E_COMMITTED_EVIDENCE');
  const result={formatVersion:RECOVERY_FORMAT_VERSION,transactionSchemaVersion:2,
    minimumReaderVersion,operation,
    id:operationId,operationId,backupId,phase,startedAt,
    ...(operation==='init'?{createdFiles}:{}),
    ...(plannedManifestHash?{plannedManifestHash}:{}),
    ...(phase==='cleanup'?{cleanupBackupHash}:{}),
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
