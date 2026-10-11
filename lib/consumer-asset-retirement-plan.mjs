// Stage14 read-only legacy consumer-asset retirement planner.
// There is deliberately NO apply, rm, unlink, writeFile or rename entrypoint.
// A plan is not consent, backup, writer identity or D-01 authority.
import path from 'node:path';
import {inspectProject} from './adoption-inspect.mjs';
import {readManifest,hashContent} from './state.mjs';
import {readAdaptiveManifest} from './manifest-v2.mjs';
import {readProjectBytes} from './safe-read.mjs';
import {classifyConsumerAsset,requireAssetSet} from './asset-catalog.mjs';
import {getCliVersion} from './version.mjs';

const SOURCE='legacy-full-v1';
const TARGETS=new Set(['greenfield-safe-v1','brownfield-minimal-v1']);
function row(relative,classification,reason,extra={}){
  return Object.freeze({path:relative,classification,reason,
    executionAuthorized:false,...extra});
}
function blocked(root,reason){
  return Object.freeze({root,readOnly:true,blocked:true,reason,
    actions:[],executionAuthorized:false,mutationGate:'D-01/G-FENCE_NO_GO'});
}
export async function planConsumerAssetRetirement(targetDir,{
  targetAssetSet
}={}){
  const root=path.resolve(targetDir??'.');
  requireAssetSet(targetAssetSet);
  if(!TARGETS.has(targetAssetSet))
    return blocked(root,'E_STAGE14_TARGET_ASSETSET_REQUIRED');
  const inspected=await inspectProject(root);
  if(inspected.classification!=='MANAGED')
    return blocked(root,inspected.reason??'E_STAGE14_MANAGED_REQUIRED');
  // Only a proven legacy-full source is eligible for an inspection-only
  // transition. No implicit cross-surface relabel, especially brownfield.
  const sourceAssetSet=inspected.schemaVersion===1
    ? SOURCE : inspected.assetSet;
  if(sourceAssetSet!==SOURCE)return blocked(root,'E_STAGE14_LEGACY_SOURCE_REQUIRED');
  let manifest;
  try {
    manifest=inspected.schemaVersion===1
      ? await readManifest(root)
      : await readAdaptiveManifest(root,{readerVersion:await getCliVersion()});
  }catch(e){return blocked(root,e?.code??'E_STAGE14_MANIFEST_UNREADABLE');}
  if(!manifest?.managedFiles||typeof manifest.managedFiles!=='object')
    return blocked(root,'E_STAGE14_MANIFEST_UNREADABLE');
  const actions=[];
  const entries=Object.entries(manifest.managedFiles)
    .sort(([a],[b])=>a.localeCompare(b));
  for(const [relative,entry] of entries){
    const type=classifyConsumerAsset(relative);
    // Legacy v2 managed-section regions cannot be retired with whole-file
    // delete semantics; reject rather than erasing unowned surrounding bytes.
    if(manifest.schemaVersion===2&&
       manifest.ownership?.[relative]?.kind==='managed-section'){
      actions.push(row(relative,'CONFLICT','SECTION_OWNERSHIP_REQUIRES_SEPARATE_PLAN'));
      continue;
    }
    const baselinePath=entry?.baselinePath;
    if(typeof baselinePath!=='string'||
       baselinePath!=='.vcp/baselines/'+relative||
       !/^[a-f0-9]{64}$/.test(entry.baselineHash??'')){
      actions.push(row(relative,'CONFLICT','BASELINE_PROVENANCE_INVALID'));
      continue;
    }
    let baseline,observed;
    try {
      baseline=await readProjectBytes(root,baselinePath,{managedState:true});
      observed=await readProjectBytes(root,relative,{optional:true});
    }catch(e){
      actions.push(row(relative,'CONFLICT',e?.code??'UNTRUSTED_PROJECT_PATH'));
      continue;
    }
    if(!baseline||hashContent(baseline)!==entry.baselineHash){
      actions.push(row(relative,'CONFLICT','BASELINE_INTEGRITY'));
      continue;
    }
    if(observed===null){
      actions.push(row(relative,'RETAIN_ABSENT','USER_REMOVED_FILE'));
      continue;
    }
    const observedHash=hashContent(observed);
    if(type!=='package-only'){
      actions.push(row(relative,'KEEP_CONSUMER','SELECTED_PROJECT_SURFACE',{
        observedHash,baselineHash:entry.baselineHash}));
      continue;
    }
    // Prompt overrides, user-edited framework documents and source-only
    // workflows are never silently detached/deleted; retain original bytes.
    if(observedHash!==entry.baselineHash){
      actions.push(row(relative,'PRESERVE_USER_EDIT','PROJECT_BYTES_DIVERGED',{
        observedHash,baselineHash:entry.baselineHash}));
      continue;
    }
    actions.push(row(relative,'RETIRE_CANDIDATE','LEGACY_PACKAGE_ONLY_UNMODIFIED',{
      observedHash,baselineHash:entry.baselineHash,
      requires:['D-01_APPROVAL','OLD_CLI_OS_FENCE','NATIVE_DURABLE_WRITER',
        'OWNED_LOCK','VERIFIED_VERSIONED_BACKUP','JOURNAL_RECOVERY',
        'EXPLICIT_DETACH_DECISION']
    }));
  }
  const conflicts=actions.filter(a=>a.classification==='CONFLICT').length;
  return Object.freeze({
    root,readOnly:true,blocked:conflicts>0,
    reason:conflicts?'E_STAGE14_RETIREMENT_CONFLICT':null,
    sourceAssetSet:SOURCE,targetAssetSet,
    actions:Object.freeze(actions),executionAuthorized:false,
    mutationGate:'D-01/G-FENCE_NO_GO',
    summary:Object.freeze({
      conflicts,
      candidates:actions.filter(a=>a.classification==='RETIRE_CANDIDATE').length,
      preserved:actions.filter(a=>a.classification==='PRESERVE_USER_EDIT').length,
      retained:actions.filter(a=>a.classification.startsWith('KEEP')||
        a.classification==='RETAIN_ABSENT').length
    }),
    caveat:'Read-only snapshot; not an executable saved plan or proof of future identity'
  });
}
