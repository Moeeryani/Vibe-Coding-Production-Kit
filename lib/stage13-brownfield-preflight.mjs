// Stage 13 Smart Init: first-adoption decision boundary.
// This module is intentionally read-only. A preview is NEVER executable
// authority. The eventual writer must acquire its owned lifecycle lock,
// re-inspect the repository, recompute a fresh plan and create a complete
// recovery point before touching any user file.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validManagedRelative} from './manifest-v2.mjs';
import { planSmartInit } from './adoption-plan.mjs';

const ALLOWED_ACTIONS=new Set(['CLAIM','PROPOSE_SECTION']);
function uniqueSorted(values){return [...new Set(values)].sort();}
const fingerprint=items=>createHash('sha256').update(JSON.stringify(items)).digest('hex');
function refusal(root,reason,details={}) {
  return Object.freeze({
    stage:13,operation:'smart-init-existing',root,
    readOnly:true,executionAuthorized:false,
    classification:'BLOCKED',reason,...details
  });
}
export function assessStage13Preview(plan,{approval=null}={}) {
  const root=typeof plan?.root==='string'?path.resolve(plan.root):null;
  if(!root||plan?.planKind!=='init'||plan?.zeroWrite!==true||
     plan?.previewOnly!==true||plan?.executionAuthorized!==false)
    return refusal(root,'UNTRUSTED_ADOPTION_PREVIEW');
  if(plan.classification!=='EXISTING')
    return refusal(root,'NOT_AN_EXISTING_REPOSITORY',{
      sourceClassification:plan.classification
    });
  if(plan.blocked===true)
    return refusal(root,plan.reason??'PLANNER_BLOCKED');
  if(plan.assetSet!=='brownfield-minimal-v1')
    return refusal(root,'UNSAFE_ASSET_SURFACE');
  if(!Array.isArray(plan.actions)||!Array.isArray(plan.skippedPaths))
    return refusal(root,'INCOMPLETE_ADOPTION_PLAN');
  if(plan.polyglot===true&&plan.requestedIntent?.stack?.kind!=='explicit')
    return refusal(root,'POLYGLOT_STACK_CHOICE_REQUIRED');
  if(plan.actions.length===0)
    return refusal(root,'NO_MUTATING_ACTIONS_TO_ADOPT');
  if(plan.actions.length>64||plan.skippedPaths.length>10000)
    return refusal(root,'ADOPTION_PLAN_TOO_LARGE');
  const allPaths=[],adopting=[];
  for(const item of plan.actions) {
    if(!item||!ALLOWED_ACTIONS.has(item.action)||
       item.executionAuthorized!==false||
       !validManagedRelative(item.path)||
       (item.action==='PROPOSE_SECTION'&&
        (!/^[a-z0-9-]{1,64}$/.test(item.sectionId??'')||
         item.ownershipProposal!=='managed-section'))||
       (item.action==='CLAIM'&&item.ownershipProposal!=='whole-file')) {
      return refusal(root,'UNSAFE_PLAN_ACTION');
    }
    allPaths.push(item.path);
    adopting.push(item.action+':'+item.path);
  }
  const folded=allPaths.map(x=>x.normalize('NFC').toLowerCase());
  if(uniqueSorted(folded).length!==folded.length||
     folded.some(x=>folded.some(y=>x!==y&&y.startsWith(x+'/'))))
    return refusal(root,'DUPLICATE_OWNERSHIP_TARGET');
  const intentFingerprint=fingerprint({
    root,assetSet:plan.assetSet,actions:uniqueSorted(adopting),
    request:plan.requestedIntent,stack:plan.stack,
    stackEvidence:plan.stackEvidence,skippedPaths:plan.skippedPaths,
    observedAdapters:plan.observedAdapters,
    compatibleAdapters:plan.observedCompatibleAdapters,
    proposedManagedAdapterSurface:plan.proposedManagedAdapterSurface,
    githubIncluded:plan.githubIncludedInPlan
  });
  // Approval binds human intent only, not a filesystem snapshot or
  // permission to apply the old preview.
  const agreed=approval?.intent==='ADOPT_EXISTING_REPOSITORY'&&
    approval?.root===root&&approval?.explicitConsent===true&&
    approval?.intentFingerprint===intentFingerprint&&
    Array.isArray(approval?.acceptedActions)&&
    JSON.stringify(uniqueSorted(approval.acceptedActions))===
      JSON.stringify(uniqueSorted(adopting));
  if(!agreed) {
    return refusal(root,'EXPLICIT_ADOPTION_DECISION_REQUIRED',{
      expectedActions:uniqueSorted(adopting),intentFingerprint,
      proposedActionCount:plan.actions.length
    });
  }
  return Object.freeze({
    stage:13,operation:'smart-init-existing',root,
    classification:'READY_TO_REPLAN_UNDER_OWNED_LOCK',
    readOnly:true,executionAuthorized:false,
    approvedIntentOnly:true,previewExecutable:false,
    mustReinspectAfterLock:true,mustCreateCompleteRecoveryPoint:true,
    approvedActionKinds:uniqueSorted(adopting),intentFingerprint,
    next:'ACQUIRE_FIRST_ADOPTION_LOCK_THEN_REPLAN'
  });
}
export async function inspectStage13ApplyCandidate(targetDir,{
  agentPreference=null,stackPreference='auto',githubPreference=null,
  approval=null
}={}) {
  const plan=await planSmartInit(targetDir,{
    agentPreference,stackPreference,githubPreference
  });
  return Object.freeze({
    ...assessStage13Preview(plan,{approval}),
    planSummary:plan.planSummary??null,
    warnings:plan.warnings??[],
    // No raw file contents or secret-bearing proposed commands are emitted.
    inspectionOnly:true
  });
}
