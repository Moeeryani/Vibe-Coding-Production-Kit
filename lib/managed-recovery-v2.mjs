import path from 'node:path';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';

export const RECOVERY_FORMAT_VERSION=2;
const MAX_ARTIFACT_BYTES=512*1024;
const PHASES=Object.freeze(['prepared','applying','verified','committed','recovering']);
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function err(code) {const e=new Error(code);e.code=code;return e;}
function string(v){return typeof v==='string'&&v.length>0&&v.length<=256;}
function bool(v){return typeof v==='boolean';}
function same(a,b){return a&&b&&a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&
  a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs;}
async function boundedJson(root,relative) {
  let filename;
  try {filename=await resolveProjectPath(root,relative,{purpose:'managed-state'});}
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
export function decodeBackupMetadata(value) {
  if(!isRecord(value)||!string(value.id)||!Array.isArray(value.entries))throw err('E_BACKUP_METADATA');
  if(value.formatVersion===undefined) {
    // Legacy 0.9.3 backup: read-only visibility, never silently upgrade it.
    return Object.freeze({formatVersion:1,id:value.id,operation:'update',
      entries:value.entries.length,legacy:true,priorManifestExisted:true,recoveryCapability:'legacy'});
  }
  if(value.formatVersion!==RECOVERY_FORMAT_VERSION||
    !['init','update'].includes(value.operation)||!bool(value.priorVcpDirectoryExisted)||
    !bool(value.priorManifestExisted)||!bool(value.priorBaselinesExisted)||
    !bool(value.lockBootstrapCreatedVcpDirectory)||!string(value.operationId)||
    (value.priorInstalledVersion!==null&&!string(value.priorInstalledVersion))) {
    throw err('E_BACKUP_FORMAT');
  }
  for(const entry of value.entries) {
    if(!isRecord(entry)||!string(entry.path)||entry.path.startsWith('/')||
      entry.path.includes('..')||entry.path.includes('\\')||!bool(entry.exists))throw err('E_BACKUP_ENTRY');
  }
  return Object.freeze({formatVersion:2,id:value.id,operation:value.operation,
    operationId:value.operationId,entries:value.entries.length,legacy:false,
    priorManifestExisted:value.priorManifestExisted,
    priorBaselinesExisted:value.priorBaselinesExisted,
    priorVcpDirectoryExisted:value.priorVcpDirectoryExisted,
    recoveryCapability:'versioned'});
}
export function decodeManagedTransaction(value) {
  if(value==null)return null;
  if(!isRecord(value)||!string(value.id)||!string(value.backupId))throw err('E_TRANSACTION_FORMAT');
  if(value.formatVersion===undefined) {
    return Object.freeze({formatVersion:1,id:value.id,phase:value.phase,
      backupId:value.backupId,committed:false,legacy:true,
      recommendation:'require-manual-legacy-recovery'});
  }
  if(value.formatVersion!==RECOVERY_FORMAT_VERSION||value.operation!=='update'||
    !PHASES.includes(value.phase)||!string(value.operationId)||value.operationId!==value.id)throw err('E_TRANSACTION_FORMAT');
  if(value.phase==='committed'&&(!string(value.committedAt)||!string(value.committedManifestHash))) {
    throw err('E_COMMITTED_EVIDENCE');
  }
  return Object.freeze({formatVersion:2,id:value.id,phase:value.phase,
    backupId:value.backupId,committed:value.phase==='committed',legacy:false,
    recommendation:value.phase==='committed'?'verify-committed-state-before-cleanup':'restore-owned-backup'});
}
export async function inspectManagedRecovery(root,{backupId=null}={}) {
  const selected=path.resolve(root);
  try {
    const tx=decodeManagedTransaction(await boundedJson(selected,'.vcp/transaction.json'));
    const targetBackup=backupId??tx?.backupId??null;
    const backup=targetBackup?
      decodeBackupMetadata(await boundedJson(selected,`.vcp/backups/${targetBackup}/backup.json`)):null;
    if(targetBackup&&!backup)throw err('E_BACKUP_MISSING');
    if(tx&&backup&&tx.backupId!==backup.id)throw err('E_BACKUP_ID_MISMATCH');
    return {readOnly:true,root:selected,transaction:tx,backup,
      needsRecovery:Boolean(tx&&!tx.committed),cleanupAuthorized:false,writeAuthorized:false};
  }catch(e) {
    return {readOnly:true,root:selected,blocked:true,reason:e.code??'E_RECOVERY_INSPECTION',
      needsRecovery:false,cleanupAuthorized:false,writeAuthorized:false};
  }
}
