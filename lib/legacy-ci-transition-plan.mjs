// Adaptive Phase 3: explicit legacy VCP workflow migration proposal.
// Never mutates, detaches, approves, deletes, or runs a CI workflow.
// Stage14 retirement planner is the one ownership/baseline authority.
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { planConsumerAssetRetirement } from './consumer-asset-retirement-plan.mjs';
import { readProjectBytes } from './safe-read.mjs';

export const LEGACY_VCP_WORKFLOW='.github/workflows/validate.yml';
const REQUIRED=Object.freeze([
  'EXPLICIT_OWNER_DECISION','D-01_APPROVAL','G-FENCE_GO',
  'OLD_PUBLISHED_CLI_ISOLATION','DURABLE_LIFECYCLE_BACKUP',
  'OWNED_TRANSACTION_LOCK','RECOVERABLE_JOURNAL','CURRENT_BYTE_IDENTITY'
]);

function result(root,action,reason,{blocked=false,sourceAssetSet=null,baselineHash=null,
  observedHash=null,otherConflicts=0}={}){
  return Object.freeze({root,readOnly:true,blocked,
    workflow:LEGACY_VCP_WORKFLOW,sourceAssetSet,action,reason,
    observedHash,baselineHash,otherConflicts,
    requires:action.endsWith('_CANDIDATE')?REQUIRED:[],
    executionAuthorized:false,writeAuthorized:false,
    mutationGate:'D-01/G-FENCE_NO_GO',
    note:'Read-only observation only. This result is not authority to delete, detach, claim, install, or replace any CI file.'});
}

export async function planLegacyCIWorkflowTransition(targetDir){
  const root=path.resolve(targetDir??'.');
  let inspected;
  try {inspected=await inspectProject(root);}
  catch(e){return result(root,'BLOCKED',e?.code??'PROJECT_INSPECTION_FAILED',{blocked:true});}
  if(inspected.classification==='BLOCKED')
    return result(root,'BLOCKED',inspected.reason??'PROJECT_STATE_BLOCKED',{blocked:true});
  if(inspected.classification!=='MANAGED')
    return result(root,'PRESERVE_PROJECT_CI','UNMANAGED_PROJECT_CI_NOT_VCP_OWNED');
  const sourceAssetSet=inspected.schemaVersion===1?'legacy-full-v1':inspected.assetSet;
  if(sourceAssetSet!=='legacy-full-v1')
    return result(root,'PRESERVE_PROJECT_CI','SAFE_ASSET_SET_DOES_NOT_CLAIM_LEGACY_WORKFLOW',
      {sourceAssetSet});
  let plan;
  try {plan=await planConsumerAssetRetirement(root,{targetAssetSet:'greenfield-safe-v1'});}
  catch(e){return result(root,'BLOCKED',e?.code??'RETIREMENT_PLAN_FAILED',
    {blocked:true,sourceAssetSet});}
  if(plan.blocked)return result(root,'BLOCKED',plan.reason??'LEGACY_RETIREMENT_CONFLICT',
    {blocked:true,sourceAssetSet,otherConflicts:plan.summary?.conflicts??0});
  const row=plan.actions.find(x=>x.path===LEGACY_VCP_WORKFLOW);
  if(!row){
    // A real file not claimed in the manifest is always project-owned.
    let bytes;
    try{bytes=await readProjectBytes(root,LEGACY_VCP_WORKFLOW,{optional:true,maxBytes:256*1024});}
    catch(e){return result(root,'BLOCKED',e?.code??'UNSAFE_UNOWNED_WORKFLOW',
      {blocked:true,sourceAssetSet});}
    return result(root,'PRESERVE_PROJECT_CI',
      bytes===null?'NO_LEGACY_WORKFLOW_CLAIM':'UNOWNED_WORKFLOW_PRESERVED',
      {sourceAssetSet});
  }
  return classifyLegacyWorkflowRow(root,row,{sourceAssetSet});
}

// Pure contract adapter — acceptance tests can challenge action policy directly.
export function classifyLegacyWorkflowRow(root,row,{sourceAssetSet='legacy-full-v1'}={}){
  const common={sourceAssetSet,baselineHash:row?.baselineHash??null,
    observedHash:row?.observedHash??null};
  switch(row?.classification){
    case 'RETIRE_CANDIDATE':
      return result(root,'DELETE_CANDIDATE','UNMODIFIED_PROVEN_MANAGED_WORKFLOW',common);
    case 'PRESERVE_USER_EDIT':
      // The next phase can propose DETACH with explicit review, never delete.
      return result(root,'DETACH_CANDIDATE','EDITED_MANAGED_WORKFLOW_MUST_BE_PRESERVED',common);
    case 'RETAIN_ABSENT':
      return result(root,'PRESERVE_ABSENT','ALREADY_REMOVED_BY_USER',common);
    case 'KEEP_CONSUMER':
      return result(root,'PRESERVE_PROJECT_CI','SELECTED_CONSUMER_ASSET',common);
    default:
      return result(root,'BLOCKED',row.reason??'WORKFLOW_PROVENANCE_UNPROVEN',
        {...common,blocked:true});
  }
}
