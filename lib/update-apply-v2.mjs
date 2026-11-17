// P6-02 — v2 update path (population point for postApplyFiles).
//
// Updates a schema-v1 managed project to the current CLI version and
// migrates its manifest to schema 2 in the same operation, recording
// the result as a committed versioned journal carrying postApplyFiles
// so rollbackV2 can judge a later restore.
//
// Runs inside runWriterTransaction (v2 lifecycle lock, production
// gate, evidence hook). In production the gate refuses
// E_G_FENCE_NO_GO; under a verified test capability the path executes
// fully. The committed journal is RETAINED (never cleared): it is the
// only post-apply evidence for rollbackV2.
//
// Scope limits (by design, see design.md §10):
// - DELETE and RENAME actions are refused (the evidence model has no
//   way to record "this path is absent after the apply"); use v1
//   `vcp update` for those.
// - The project ends at schema 2. A further update needs the adaptive
//   managed update path, which is not built; v1 refuses schema-2
//   projects. The v2 update is a one-shot migration + update.
import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { planUpdate } from './update-plan.mjs';
import { baselineForAction, verifyAppliedActions } from './update-apply-helpers.mjs';
import { readManagedFile, readBaseline } from './state.mjs';
import { getCliVersion } from './version.mjs';
import { previewV1ToV2, validateAdaptiveManifest } from './manifest-v2.mjs';
import { describeVersionedBackup, describeVersionedTransaction } from './managed-recovery-v2.mjs';
import { runWriterTransaction } from './production-writer.mjs';
import { writeVersionedJournal } from './versioned-journal.mjs';
import { atomicWriteFile, atomicWriteManifest } from './writer-atomic.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { syncContainingDirectory } from './file-durability.mjs';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function clone(value){return JSON.parse(JSON.stringify(value));}

async function ensureParentDir(root,relative,purpose){
  const dir=path.posix.dirname(relative);
  if(dir==='.'||dir==='')return;
  // Resolve a dummy child, not the directory itself:
  // resolveProjectPath's final-component check is file-oriented, so
  // resolving an already-existing directory throws NOT_REGULAR_FILE.
  // The probe child keeps every ancestor check (no symlinks, real
  // directories) while the probe file itself is never created.
  const probe=await resolveProjectPath(root,dir+'/.vcp_parent_probe__',
    {purpose});
  await mkdir(path.dirname(probe),{recursive:true});
}

// Safe delete (resolve + regular-file check + unlink + dir sync).
// An already-absent file is a no-op. Returns true when a file was removed.
// The purpose must match the file's state: 'read-existing' for a file
// that must exist to be deleted ('write-new' refuses existing files,
// which is exactly the case a delete handles).
async function safeDelete(root,relative,purpose){
  let target;
  try{
    target=await resolveProjectPath(root,relative,{purpose});
  }catch(e){
    if(e?.code==='E_VCP_PATH'&&/MISSING_INPUT/.test(e.message))return false;
    throw e;
  }
  let st;
  try{st=await lstat(target);}
  catch(e){if(e?.code==='ENOENT')return false;throw e;}
  if(!st.isFile()||st.isSymbolicLink())
    throw new Error(`Refusing to delete non-regular file: ${relative}.`);
  await rm(target,{force:false});
  await syncContainingDirectory(target);
  return true;
}

// v2 backup writer (P6). Mirrors createManagedSchemaBackup's shape
// (exclusive directory, manifest.json + v2 backup.json) but records
// the pre-update bytes of every file the update touches, so
// rollbackV2 can restore them (F-P6-1: entries carry {path, exists,
// mode, sha256}).
async function createUpdateBackupV2(root,{plan,oldManifestBytes,
  oldManifest,cliVersion,baselinesExisted,atomic}){
  const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'
    +randomBytes(8).toString('hex');
  const backupRel=`.vcp/backups/${id}`;
  const backupsDir=await resolveProjectPath(root,'.vcp/backups',
    {purpose:'managed-state'});
  await mkdir(backupsDir,{recursive:true,mode:0o700});
  const probe=await resolveProjectPath(root,
    backupRel+'/.vcp_dir_probe__',{purpose:'managed-state'});
  await mkdir(path.dirname(probe),{mode:0o700});
  await syncContainingDirectory(path.dirname(probe));
  const entries=[];
  for(const item of plan.actions){
    if(['IGNORED','CONFLICT'].includes(item.type))continue;
    const rel=item.path;
    const current=await readManagedFile(root,rel);
    if(!current.exists){
      entries.push({path:rel,exists:false});
      continue;
    }
    const bytes=Buffer.from(current.content,'utf8');
    await ensureParentDir(root,`${backupRel}/files/${rel}`,'managed-state');
    await atomic.writeFile(root,`${backupRel}/files/${rel}`,bytes,
      {managedState:true,mode:current.mode??0o644});
    entries.push({path:rel,exists:true,mode:current.mode??0o644,
      sha256:sha256(bytes)});
  }
  await atomic.writeFile(root,`${backupRel}/manifest.json`,
    oldManifestBytes,{managedState:true,mode:0o600});
  const record=describeVersionedBackup({id,operationId:id,
    operation:'update',minimumReaderVersion:cliVersion,
    restoredManifestHash:sha256(oldManifestBytes),
    preLockSnapshot:{vcpDirectoryExisted:true,manifestExisted:true,
      baselinesExisted,installedVersion:oldManifest.installedVersion,
      lockBootstrapCreatedVcpDirectory:false},
    entries});
  await atomic.writeFile(root,`${backupRel}/backup.json`,
    Buffer.from(JSON.stringify(record,null,2)+'\n'),
    {managedState:true,mode:0o600});
  return {id,record};
}

// Best-effort restore of the update's own writes after a failure.
// A file is restored only when its current bytes are the update's own
// planned bytes (or it is absent when the plan created it); anything
// else is a concurrent edit and is left untouched. Returns the list
// of paths NOT restored (empty means the restore is complete).
async function restoreUpdateBackupV2(root,backupId,
  {plannedPostApply,plannedManifestHash,atomic}){
  const unrestored=[];
  let record;
  try{
    const bytes=await readProjectBytes(root,
      `.vcp/backups/${backupId}/backup.json`,
      {managedState:true,maxBytes:65536});
    record=JSON.parse(bytes.toString('utf8'));
  }catch{return ['backup-record-unreadable'];}
  for(const entry of record.entries??[]){
    const rel=entry.path;
    if(typeof rel!=='string'){unrestored.push('(malformed-entry)');continue;}
    try{
      const current=await readManagedFile(root,rel);
      const planned=plannedPostApply.get(rel);
      if(entry.exists===false){
        if(!current.exists)continue;
        if(planned!==undefined&&
           sha256(Buffer.from(current.content,'utf8'))===planned)
          await safeDelete(root,rel,'read-existing');
        else unrestored.push(rel);
        continue;
      }
      const curHash=current.exists?
        sha256(Buffer.from(current.content,'utf8')):null;
      if(curHash===entry.sha256)continue;
      if(planned!==undefined&&curHash===planned){
        const fileBytes=await readProjectBytes(root,
          `.vcp/backups/${backupId}/files/${rel}`,
          {managedState:true,maxBytes:8*1024*1024});
        await atomic.writeFile(root,rel,fileBytes,
          {mode:entry.mode??0o644});
      }else unrestored.push(rel);
    }catch{unrestored.push(rel);}
  }
  try{
    const curManifest=await readProjectBytes(root,'.vcp/manifest.json',
      {managedState:true,maxBytes:256*1024});
    const backupManifest=await readProjectBytes(root,
      `.vcp/backups/${backupId}/manifest.json`,
      {managedState:true,maxBytes:256*1024});
    if(sha256(curManifest)===plannedManifestHash)
      await atomicWriteManifest(root,backupManifest);
    else if(sha256(curManifest)!==sha256(backupManifest))
      unrestored.push('.vcp/manifest.json');
  }catch{unrestored.push('.vcp/manifest.json');}
  return unrestored;
}

// buildNextManifest (lib/update-apply.mjs, module-local there),
// replicated: the v1 manifest for the planned update.
function buildNextManifestV1(plan,finalEntries){
  return {
    ...clone(plan.migratedManifest),
    schemaVersion:plan.migratedManifest.schemaVersion,
    installedVersion:plan.toVersion,
    updatedAt:new Date().toISOString(),
    install:{...clone(plan.migratedManifest.install),stack:plan.stack},
    managedFiles:finalEntries
  };
}

export async function applyUpdateV2({targetDir,targetVersion=null,
  migrations, testCapability=null}={}){
  const root=path.resolve(targetDir??'.');
  const inspection=await inspectProject(root);
  if(inspection.classification!=='MANAGED'||inspection.schemaVersion!==1)
    throw new Error('V2 update requires a safe, unlocked schema-v1 managed repository.');
  const oldManifestBytes=await readProjectBytes(root,'.vcp/manifest.json',
    {managedState:true,maxBytes:256*1024});
  let oldManifest;
  try{oldManifest=JSON.parse(oldManifestBytes.toString('utf8'));}
  catch{throw new Error('Current manifest is not valid JSON; refusing v2 update.');}
  let baselinesExisted=false;
  try{
    const st=await lstat(path.join(root,'.vcp','baselines'));
    baselinesExisted=st.isDirectory()&&!st.isSymbolicLink();
  }catch(e){if(e?.code!=='ENOENT')throw e;}
  const cliVersion=await getCliVersion();

  const plan=await planUpdate({targetDir:root,targetVersion,
    ...(migrations!==undefined?{migrations}:{}),
    preflightHeldLock:true});
  if(plan.conflicts>0)
    return {...plan,blocked:true,applied:false,backupId:null};
  if(!plan.needsApply)
    return {...plan,blocked:false,applied:false,backupId:null};
  if(plan.actions.some((a)=>a.type==='DELETE'||a.type==='RENAME'))
    throw new Error('V2 update does not support DELETE or RENAME actions yet; use `vcp update` (v1) for this project.');

  // Planned outputs (computed before any mutation: the journal's
  // postApplyFiles and plannedManifestHash are frozen at creation).
  const finalEntries=clone(plan.migratedManifest.managedFiles??{});
  const baselineContents=new Map();
  for(const item of plan.actions)
    baselineForAction(plan,item,finalEntries,baselineContents);
  const v1manifest=buildNextManifestV1(plan,finalEntries);
  const v2manifest=previewV1ToV2(v1manifest,{readerVersion:cliVersion});
  validateAdaptiveManifest(v2manifest,{readerVersion:cliVersion});
  const manifestBytes=Buffer.from(JSON.stringify(v2manifest,null,2)+'\n');
  const plannedManifestHash=sha256(manifestBytes);
  const postApplyFiles=[];
  const plannedPostApply=new Map();
  for(const item of plan.actions){
    if(!['ADD','UPDATE','MERGE'].includes(item.type))continue;
    const hash=sha256(Buffer.from(item.content,'utf8'));
    postApplyFiles.push({path:item.path,sha256:hash});
    plannedPostApply.set(item.path,hash);
  }

  const mutate=async({root:r,lock,principal,atomic})=>{
    const lockedManifest=await readProjectBytes(r,'.vcp/manifest.json',
      {managedState:true,maxBytes:256*1024});
    if(sha256(lockedManifest)!==sha256(oldManifestBytes))
      throw new Error('Managed manifest changed between plan and locked update; refusing.');
    let backup=null;
    try{
      backup=await createUpdateBackupV2(r,{plan,oldManifestBytes,
        oldManifest,cliVersion,baselinesExisted,atomic});
      const startedAt=new Date().toISOString();
      const tx=(phase,extra={})=>describeVersionedTransaction({
        operationId:backup.id,backupId:backup.id,operation:'update',
        minimumReaderVersion:cliVersion,phase,plannedManifestHash,
        startedAt,postApplyFiles,...extra});
      let journalHash=(await writeVersionedJournal(r,tx('prepared'),
        {previousHash:null,readerVersion:cliVersion,lock},
        testCapability)).sha256;
      journalHash=(await writeVersionedJournal(r,tx('applying'),
        {previousHash:journalHash,readerVersion:cliVersion,lock},
        testCapability)).sha256;
      // Apply the files (from the plan's in-memory content; the
      // receipt hash must equal the planned post-apply hash).
      for(const item of plan.actions){
        if(!['ADD','UPDATE','MERGE'].includes(item.type))continue;
        const bytes=Buffer.from(item.content,'utf8');
        const receipt=await atomic.writeFile(r,item.path,bytes,
          {mode:item.desired.mode??0o644});
        if(receipt.sha256!==sha256(bytes))
          throw new Error(`Post-apply verification failed for ${item.path}: written bytes differ from planned bytes.`);
      }
      // Baselines (resolved map, mirroring writeFinalBaselines).
      const resolved=new Map(baselineContents);
      for(const [relative] of Object.entries(finalEntries)){
        if(resolved.has(relative))continue;
        const oldEntry=plan.manifest.managedFiles[relative];
        if(!oldEntry)
          throw new Error(`Missing baseline content for ${relative}.`);
        resolved.set(relative,await readBaseline(r,oldEntry));
      }
      for(const [relative,content] of resolved){
        await ensureParentDir(r,`.vcp/baselines/${relative}`,'managed-state');
        await atomic.writeFile(r,`.vcp/baselines/${relative}`,
          Buffer.from(content,'utf8'),{managedState:true,mode:0o644});
      }
      for(const relative of Object.keys(plan.manifest.managedFiles)){
        if(!finalEntries[relative])
          await safeDelete(r,`.vcp/baselines/${relative}`,'managed-state');
      }
      // Manifest (last mutation), then verification. expectedHash is
      // the hash of the bytes being written (atomicWriteManifest's
      // contract), i.e. the planned hash — NOT the old manifest's.
      await atomicWriteManifest(r,manifestBytes,
        {expectedHash:plannedManifestHash});
      await verifyAppliedActions(plan);
      const actualManifest=await readProjectBytes(r,'.vcp/manifest.json',
        {managedState:true,maxBytes:256*1024});
      if(sha256(actualManifest)!==plannedManifestHash)
        throw new Error('Update did not reproduce the planned manifest bytes.');
      journalHash=(await writeVersionedJournal(r,tx('verified'),
        {previousHash:journalHash,readerVersion:cliVersion,lock},
        testCapability)).sha256;
      journalHash=(await writeVersionedJournal(r,tx('committed',{
        committedAt:new Date().toISOString(),
        committedManifestHash:plannedManifestHash}),
        {previousHash:journalHash,readerVersion:cliVersion,lock},
        testCapability)).sha256;
      return {...plan,manifest:v2manifest,blocked:false,applied:true,
        backupId:backup.id,v2:true,manifestHash:plannedManifestHash,
        postApplyFiles};
    }catch(error){
      if(backup){
        const unrestored=await restoreUpdateBackupV2(r,backup.id,
          {plannedPostApply,plannedManifestHash,atomic})
          .catch(()=>['restore-failed']);
        if(unrestored.length)
          throw new Error(`VCP v2 update failed: ${error.message}. Automatic restore incomplete; unrestored: ${unrestored.join(', ')}. Journal and backup preserved for manual recovery; see the P5 manual recovery runbook.`);
      }
      throw error;
    }
  };
  return runWriterTransaction({root,operation:'update-v2',schema:2,
    mode:'update',mutate,testCapability});
}
