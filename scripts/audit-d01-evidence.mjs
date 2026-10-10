#!/usr/bin/env node
// Verify the *internal consistency* of published-old-CLI witness receipts.
// Never treat a coherent receipt as an independent npm authenticity attestation
// or an approval to enable the D-01 migration gate.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT='docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json';
const COMMON=[
  'rollback-v1-backup','rollback-v2-erases-user-edit','rollback-stale-transaction',
  'dead-pid-file-lock','separate-lifecycle-lock','directory-sentinel-rollback',
  'directory-sentinel-update','directory-sentinel-manage','fresh-malformed-lock',
  'aged-malformed-lock','intact-v2-old-init','deleted-manifest-old-init'
];
const WINDOWS_EXTRA='deleted-manifest-directory-sentinel-old-init';
const SHA256=/^[a-f0-9]{64}$/;
const FILENAME=/^file:([0-9]+):([a-f0-9]{64})$/;
function invalid(message){
  const e=new Error('INCONSISTENT D-01 RECEIPT: '+message);
  e.exitCode=3;
  throw e;
}
function descriptor(value){
  if(value===null)return {type:'missing',hash:null};
  if(typeof value!=='string')invalid('invalid snapshot descriptor type');
  const file=FILENAME.exec(value);
  if(file)return {type:'file',hash:file[2]};
  if(value==='dir')return {type:'dir',hash:null};
  if(value.startsWith('link:'))return {type:'link',hash:null};
  if(value.startsWith('special:'))return {type:'special',hash:null};
  invalid('unknown snapshot descriptor');
}
const isRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function auditHistoricalD01Evidence(receipt){
  if(!isRecord(receipt)||receipt.type!=='published-old-cli-fence-observation'||
    receipt.status!=='NOT_A_MIGRATION_APPROVAL'||
    !['linux','win32'].includes(receipt.platform)||
    receipt.release?.name!=='vibe-coding-production'||
    receipt.release.version!=='0.9.3'||!SHA256.test(receipt.tarballSha256)||
    !Array.isArray(receipt.results))invalid('receipt provenance');
  const windows=receipt.platform==='win32';
  const expected=windows?[...COMMON,WINDOWS_EXTRA]:COMMON;
  if(receipt.results.length!==expected.length)invalid('scenario count');
  const names=new Set(),unsafe=[],nonMutating=[],lostUserEdits=[];
  let expectedObservationsMatched=0;
  for(const item of receipt.results){
    if(!isRecord(item)||!expected.includes(item.scenario)||
      names.has(item.scenario))invalid('duplicated or unrecognized scenario');
    names.add(item.scenario);
    if(!Array.isArray(item.changes)||!isRecord(item.command)||
      !Number.isInteger(item.command.exitCode)||
      typeof item.observedMutation!=='boolean'||
      typeof item.expectedMutation!=='boolean'||
      typeof item.expectedObservationMatched!=='boolean'||
      typeof item.postBackupEditSurvived!=='boolean'||
      !['absent','directory','regular-file','symlink','other'].includes(item.legacyLockBefore)||
      !['absent','directory','regular-file','symlink','other'].includes(item.legacyLockAfter))
      invalid('malformed command, lock or observation');
    const altered=item.changes.length>0;
    if(altered!==item.observedMutation)invalid('delta and mutation status disagree');
    const shouldMatch=(altered===item.expectedMutation)&&
      (!item.scenario.startsWith('directory-sentinel-')&&
       item.scenario!==WINDOWS_EXTRA||item.legacyLockAfter==='directory');
    if(shouldMatch!==item.expectedObservationMatched)
      invalid('expected observation status inconsistent');
    if(shouldMatch)expectedObservationsMatched++;
    const seenPaths=new Set();
    for(const change of item.changes){
      if(!isRecord(change)||typeof change.path!=='string'||
        seenPaths.has(change.path)||change.before===change.after)
        invalid('invalid or duplicate changed path');
      seenPaths.add(change.path);
      descriptor(change.before);descriptor(change.after);
    }
    const changedUserFile=item.changes.some(change=>{
      if(change.path!=='AGENTS.md')return false;
      const before=descriptor(change.before),after=descriptor(change.after);
      return before.type==='file'&&after.type==='file'&&before.hash!==after.hash;
    });
    if(altered)unsafe.push(item.scenario);
    else nonMutating.push(item.scenario);
    if(changedUserFile&&item.postBackupEditSurvived===false)
      lostUserEdits.push(item.scenario);
    if(!altered&&item.postBackupEditSurvived!==true)
      invalid('nonmutating fixture falsely declares loss');
  }
  if(expected.some(x=>!names.has(x))||
    receipt.unsafeMutationCount!==unsafe.length||
    receipt.expectedObservationsMatched!==expectedObservationsMatched||
    receipt.unexpected!==expected.length-expectedObservationsMatched)
    invalid('scenario summary mismatch');
  // Historical witnesses must remain byte-changing losses. Tampering with
  // their hashes or results must never turn the receipt into a green gate.
  if(unsafe.length!==lostUserEdits.length||unsafe.length!== (windows?8:7)||
    nonMutating.length!==5||
    receipt.gate!=='NO_GO__LEGACY_MUTATION_DEMONSTRATED')
    invalid('protected user-edit loss witnesses missing');
  for(const name of ['directory-sentinel-rollback','directory-sentinel-update',
    'directory-sentinel-manage']){
    const item=receipt.results.find(x=>x.scenario===name);
    if(item.observedMutation||item.legacyLockBefore!=='directory'||
      item.legacyLockAfter!=='directory')
      invalid('original directory-sentinel refusal mutated');
  }
  if(windows){
    const extra=receipt.results.find(x=>x.scenario===WINDOWS_EXTRA);
    if(!extra.observedMutation||extra.expectedMutation||
      extra.expectedObservationMatched||
      extra.legacyLockBefore!=='directory'||extra.legacyLockAfter!=='directory'||
      extra.resultingSchema!==1||extra.postBackupEditSurvived!==false||
      !extra.changes.some(x=>x.path==='AGENTS.md'))
      invalid('Windows missing-manifest sentinel bypass witness missing');
  }
  return Object.freeze({
    evidenceType:'HISTORICAL_JSON_CONSISTENCY_ONLY',
    artifactAttested:false,newPublishedBinaryExecution:false,
    historicalPlatform:receipt.platform,release:receipt.release.version,
    recordedUtc:receipt.recordedUtc,scenarios:receipt.results.length,
    postBackupUserEditLossWitnesses:lostUserEdits,
    nonMutatingOneFixtureObservations:nonMutating,
    unexpectedObservations:receipt.unexpected,
    conclusion:'NO_GO__LEGACY_USER_EDIT_LOSS_WITNESSES',
    requiresNativeWindows:!windows,requiresLiveOldVsNewConcurrency:true,
    requiresAtomicTransitionAndCrashProof:true,
    requiredMaintainerAcceptance:true,gFenceGoAuthorized:false
  });
}
async function main(){
  const file=resolve(process.argv[2]??DEFAULT);
  const result=auditHistoricalD01Evidence(JSON.parse(await readFile(file,'utf8')));
  console.log(JSON.stringify(result,null,2));
  // A consistent negative witness deliberately returns exit 2 (NO-GO).
  process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error(e.message);process.exitCode=e.exitCode??3;});
}
