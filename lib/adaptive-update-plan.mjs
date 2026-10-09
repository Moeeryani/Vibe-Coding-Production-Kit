// Stage12 read-only desired-state planning for a compatible managed v2
// repository. This is NOT a write plan or authority to migrate/upgrade.
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { readAdaptiveManifest } from './manifest-v2.mjs';
import { buildDesiredFiles } from './template.mjs';
import { parseManagedSections } from './managed-markdown.mjs';
import { planAdaptiveSectionMutation } from './section-lifecycle.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { getCliVersion } from './version.mjs';
import { hashContent } from './state.mjs';

function candidate(kind,path,reason,extra={}) {
  return {action:kind,path,reason,executionAuthorized:false,...extra};
}
function desiredOwnedBody(bytes,sectionId) {
  let sections;
  try{sections=parseManagedSections(bytes);}
  catch{return null;}
  if(sections.length===0)return bytes;
  const match=sections.filter(s=>s.id===sectionId);
  if(match.length!==1||sections.length!==1)return null;
  return bytes.subarray(match[0].contentStart,match[0].contentEnd);
}
export async function planAdaptiveManagedUpdate(targetDir) {
  const root=path.resolve(targetDir??'.');
  const state=await inspectProject(root);
  const blocked=(reason)=>({root,readOnly:true,blocked:true,
    reason,schemaVersion:2,actions:[],executionAuthorized:false});
  if(state.classification!=='MANAGED'||state.schemaVersion!==2) {
    return blocked(state.reason??'MANAGED_SCHEMA_V2_REQUIRED');
  }
  let manifest;
  try {manifest=await readAdaptiveManifest(root);}
  catch(e){return blocked(e.code??'MANIFEST_NOT_READABLE');}
  const version=await getCliVersion();
  const desiredAgent=manifest.install.requestedAdapterIntent??'generic';
  let desired;
  try {
    desired=await buildDesiredFiles({
      targetDir:root,agent:desiredAgent,
      stack:manifest.install.requestedStack??manifest.install.stack,
      includeGitHub:manifest.install.includeGitHub,
      assetSet:manifest.install.assetSet
    });
  } catch(error) {return blocked(error.code??'DESIRED_SURFACE_UNAVAILABLE');}

  const actions=[],seen=new Set();
  for(const [relative,file] of desired.files) {
    seen.add(relative);
    const entry=manifest.managedFiles[relative];
    let local;
    try {local=await readProjectBytes(root,relative,{optional:true});}
    catch(error) {
      actions.push(candidate('CONFLICT',relative,error.code??'UNSAFE_LOCAL_PATH'));
      continue;
    }
    if(!entry) {
      actions.push(candidate(local?'PRESERVE_UNOWNED':'ADD_CANDIDATE',relative,
        local?'PROJECT_FILE_NOT_VCP_OWNED':'NEW_DESIRED_ASSET',
        {desiredHash:hashContent(Buffer.from(file.content,'utf8'))}));
      continue;
    }
    const owned=manifest.ownership[relative];
    let baseline;
    try {
      baseline=await readProjectBytes(root,entry.baselinePath,{managedState:true});
    }catch(error) {
      actions.push(candidate('CONFLICT',relative,error.code??'MISSING_BASELINE'));
      continue;
    }
    const originalBaselineHash=hashContent(baseline);
    if(originalBaselineHash!==entry.baselineHash) {
      actions.push(candidate('CONFLICT',relative,'BASELINE_INTEGRITY'));
      continue;
    }
    if(!local) {
      const origin=manifest.install.managedAdapterSurface
        .find(item=>item.path===relative)?.reason;
      actions.push(candidate('CONFLICT',relative,
        origin==='observed-existing'?'OBSERVED_ADAPTER_HOST_DELETED':'OWNED_FILE_MISSING'));
      continue;
    }
    const desiredBytes=Buffer.from(file.content,'utf8');
    if(owned.kind==='managed-section'){
      const proposedBody=desiredOwnedBody(desiredBytes,owned.sectionId);
      if(!proposedBody) {
        actions.push(candidate('CONFLICT',relative,'TEMPLATE_SECTION_ID_MISMATCH'));
        continue;
      }
      try {
        const section=planAdaptiveSectionMutation({
          manifest,readerVersion:version,relativePath:relative,
          currentDocument:local,baselineBody:baseline,
          desiredBody:proposedBody
        });
        actions.push(candidate(section.action,relative,section.reason,{
          kind:'managed-section',sectionId:owned.sectionId,
          beforeHash:section.beforeDocumentHash,
          desiredSectionHash:hashContent(proposedBody)
        }));
      }catch(error) {
        actions.push(candidate('CONFLICT',relative,error.code??'SECTION_OWNERSHIP_CONFLICT'));
      }
      continue;
    }
    const localHash=hashContent(local),desiredHash=hashContent(desiredBytes);
    if(localHash===desiredHash) {
      actions.push(candidate('KEEP',relative,'ALREADY_CURRENT',{observedHash:localHash}));
    }else if(desiredHash===originalBaselineHash) {
      actions.push(candidate('KEEP',relative,
        localHash===originalBaselineHash?'NO_CHANGE':'USER_EDIT_PRESERVED',
        {observedHash:localHash}));
    }else if(localHash===originalBaselineHash) {
      actions.push(candidate('UPDATE_WHOLE_CANDIDATE',relative,'UNMODIFIED_USER_BASELINE',{
        observedHash:localHash,desiredHash
      }));
    }else {
      actions.push(candidate('CONFLICT',relative,'USER_AND_TEMPLATE_CHANGED',{
        observedHash:localHash,desiredHash
      }));
    }
  }
  for(const relative of Object.keys(manifest.managedFiles).sort()){
    if(!seen.has(relative)) {
      actions.push(candidate('RETAIN_EXISTING_MANAGED',relative,
        'NO_UNREVIEWED_DELETE_OR_DETACH'));
    }
  }
  const conflicts=actions.filter(a=>a.action==='CONFLICT').length;
  return {
    root,readOnly:true,blocked:false,schemaVersion:2,
    assetSet:manifest.install.assetSet,
    requestedAdapterIntent:manifest.install.requestedAdapterIntent,
    managedAdapterSurface:manifest.install.managedAdapterSurface,
    actions:actions.sort((a,b)=>a.path.localeCompare(b.path)),
    summary:{
      conflicts,
      add:actions.filter(a=>a.action==='ADD_CANDIDATE').length,
      update:actions.filter(a=>a.action==='UPDATE_WHOLE_CANDIDATE'||
        a.action==='UPDATE_SECTION').length,
      retained:actions.filter(a=>a.action==='KEEP'||a.action==='RETAIN_EXISTING_MANAGED').length
    },
    executionAuthorized:false,mutationGate:'D-01/G-FENCE_NO_GO',
    provenance:'CURRENT_SELECTED_ROOT_READ_ONLY_SNAPSHOT'
  };
}
