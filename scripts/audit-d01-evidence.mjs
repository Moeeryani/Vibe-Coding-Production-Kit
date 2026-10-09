#!/usr/bin/env node
// D-01 historic receipt consistency auditor, not an npm tarball attestation.
// A passing consistency audit can PROVE A NEGATIVE WITNESS, never G-FENCE GO.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const DEFAULT='docs/evidence/stage12-old-cli-fence/linux-observations-20261009.json';
const EXPECTED=[
  'rollback-v1-backup','rollback-v2-erases-user-edit','rollback-stale-transaction',
  'dead-pid-file-lock','separate-lifecycle-lock','directory-sentinel-rollback',
  'directory-sentinel-update','directory-sentinel-manage','fresh-malformed-lock',
  'aged-malformed-lock','intact-v2-old-init','deleted-manifest-old-init'
];
const DIGEST=/^[a-f0-9]{64}$/;
function invalid(detail) {
  const e=new Error('INCONSISTENT HISTORICAL RECEIPT: '+detail);
  e.exitCode=3;
  throw e;
}
function fileDigest(descriptor){
  if(descriptor===null)return null;
  if(typeof descriptor!=='string')invalid('malformed snapshot descriptor');
  const match=/^file:([0-9]+):([0-9a-f]{64})$/.exec(descriptor);
  if(match)return match[2];
  if(/^dir$|^link:|^special:/.test(descriptor))return null;
  invalid('unknown snapshot descriptor');
}
export function auditHistoricalD01Evidence(receipt){
  if(!receipt||receipt.type!=='published-old-cli-fence-observation'||
    receipt.status!=='NOT_A_MIGRATION_APPROVAL'||receipt.platform!=='linux'||
    receipt.release?.name!=='vibe-coding-production'||
    receipt.release.version!=='0.9.3'||!DIGEST.test(receipt.tarballSha256)||
    !Array.isArray(receipt.results)||receipt.results.length!==EXPECTED.length) {
    invalid('receipt provenance or scenario count');
  }
  const actual=new Set(),witnesses=[],safeObservations=[];
  for(const item of receipt.results) {
    if(!EXPECTED.includes(item.scenario)||actual.has(item.scenario))
      invalid('unknown or duplicated scenario');
    actual.add(item.scenario);
    if(!Array.isArray(item.changes)||!item.command||
      item.command.exitCode===undefined||
      typeof item.observedMutation!=='boolean'||
      item.expectedObservationMatched!==true) {
      invalid('malformed observed command or result');
    }
    const altered=item.changes.length>0;
    if(altered!==item.observedMutation)invalid('mutation boolean disagrees with delta');
    const uniquePaths=new Set();
    for(const change of item.changes) {
      if(typeof change.path!=='string'||uniquePaths.has(change.path))invalid('changed path duplicated');
      uniquePaths.add(change.path);
      if(change.before===change.after)invalid('no-op diff reported as mutation');
      fileDigest(change.before);
      fileDigest(change.after);
    }
    const changedUserFile=item.changes.some(x=>
      x.path==='AGENTS.md'&&x.before!==null&&x.after!==null&&
      fileDigest(x.before)!==fileDigest(x.after));
    if(altered&&changedUserFile&&item.postBackupEditSurvived===false){
      witnesses.push(item.scenario);
    }
    if(!altered)safeObservations.push(item.scenario);
  }
  if(EXPECTED.some(x=>!actual.has(x)))invalid('scenario omitted');
  if(receipt.unsafeMutationCount!==7||receipt.expectedObservationsMatched!==12||
    receipt.unexpected!==0||receipt.gate!=='NO_GO__LEGACY_MUTATION_DEMONSTRATED'||
    witnesses.length!==7||safeObservations.length!==5) {
    invalid('published summary disagrees with witnesses');
  }
  const sentinel=['directory-sentinel-rollback','directory-sentinel-update',
    'directory-sentinel-manage'];
  for(const scenario of sentinel){
    const item=receipt.results.find(x=>x.scenario===scenario);
    if(item.observedMutation||item.legacyLockBefore!=='directory'||
      item.legacyLockAfter!=='directory')invalid('directory sentinel regression');
  }
  return Object.freeze({
    evidenceType:'HISTORICAL_JSON_CONSISTENCY_ONLY',
    artifactAttested:false,newPublishedBinaryExecution:false,
    historicalPlatform:receipt.platform,release:receipt.release.version,
    recordedUtc:receipt.recordedUtc,
    scenarios:receipt.results.length,
    postBackupUserEditLossWitnesses:witnesses,
    nonMutatingOneFixtureObservations:safeObservations,
    conclusion:'NO_GO__LEGACY_USER_EDIT_LOSS_WITNESSES',
    requiresNativeWindows:true,
    requiresLiveOldVsNewConcurrency:true,
    requiresAtomicTransitionAndCrashProof:true,
    requiredMaintainerAcceptance:true,
    gFenceGoAuthorized:false
  });
}
async function main(){
  const file=resolve(process.argv[2]??DEFAULT);
  const observation=JSON.parse(await readFile(file,'utf8'));
  const result=auditHistoricalD01Evidence(observation);
  console.log(JSON.stringify(result,null,2));
  // Exit 2 intentionally signals a demonstrated unsafe compatibility witness.
  process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(e=>{console.error(e.message);process.exitCode=e.exitCode??3;});
}
