// Adaptive Phase 6 — deterministic, non-executing workflow routing foundation.
// This layer makes only suggestions from currently implemented VCP commands.
// It does not infer HUMAN DECISION approval, persist workflowMode, run commands,
// or open D-01. Executing workflow behavior (Manual/Assisted/Auto) lives in
// lib/workflow-runner.mjs; the mechanical gate lives in lib/gate-run.mjs.
export const WORKFLOW_MODES=Object.freeze(['manual','assisted','auto']);
export const WORKFLOW_PHASES=Object.freeze(['plan','implement','review','release']);
const TASK=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF=/^[a-zA-Z0-9._/-]{1,128}$/;
const VERSION=/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
const STATES=new Set(['unknown','ready','blocked']);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function exactRecord(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function checkName(name){if(typeof name!=='string'||!TASK.test(name))fail('E_WORKFLOW_TASK');return name;}
function step(command,kind,reason,preconditions=[]){return Object.freeze({
  command,kind,reason,preconditions:Object.freeze(preconditions),
  executionStatus:'NOT_EXECUTED',requiresExplicitAction:true
});}
export function inspectWorkflowMode({requestedMode='manual',manifest=null}={}){
  if(!WORKFLOW_MODES.includes(requestedMode))fail('E_WORKFLOW_MODE');
  if(manifest!==null){
    if(!exactRecord(manifest)||![1,2].includes(manifest.schemaVersion))fail('E_WORKFLOW_MANIFEST');
    if(Object.hasOwn(manifest,'workflowMode')||Object.hasOwn(manifest.install??{},'workflowMode'))
      fail('E_WORKFLOW_MODE_UNRECOGNIZED_MANIFEST_FIELD');
  }
  return Object.freeze({requestedMode,effectivePreviewMode:requestedMode,
    persistedMode:null,persistence:'NOT_SUPPORTED_BY_CURRENT_MANIFEST',
    readOnly:true,automaticExecution:false,gateAvailable:false,
    requiresOwnerDecisionForPersistence:true,
    note:'Mode selection is a session preview. Current lifecycle manifest schema does not record or authorize workflowMode.'});
}
export function previewWorkflowRoute({task,mode='manual',phase='plan',
  readiness='unknown',reviewBase=null,releaseVersion=null,manifest=null}={}){
  const slug=checkName(task);
  if(!WORKFLOW_PHASES.includes(phase))fail('E_WORKFLOW_PHASE');
  if(!STATES.has(readiness))fail('E_WORKFLOW_READINESS');
  const modeState=inspectWorkflowMode({requestedMode:mode,manifest});
  if(reviewBase!==null&&(typeof reviewBase!=='string'||!REF.test(reviewBase)||
    reviewBase.startsWith('-')||reviewBase.includes('..')||reviewBase.endsWith('/')))
    fail('E_WORKFLOW_REVIEW_BASE');
  if(releaseVersion!==null&&(typeof releaseVersion!=='string'||!VERSION.test(releaseVersion)))
    fail('E_WORKFLOW_RELEASE_VERSION');
  if(reviewBase!==null&&phase!=='review')fail('E_WORKFLOW_REVIEW_BASE_SCOPE');
  if(releaseVersion!==null&&phase!=='release')fail('E_WORKFLOW_RELEASE_VERSION_SCOPE');
  const steps=[];
  let blockingReason=null;
  if(phase==='plan'){
    steps.push(step(`vcp ready ${slug} --stage plan`,'READINESS',
      'Inspect Source of Truth and missing plan decisions.'));
    steps.push(step(`vcp context ${slug} --mode plan`,'CONTEXT',
      'Generate bounded planning context after reviewing readiness.',['PLAN_READINESS_REVIEW']));
  }else if(phase==='implement'){
    steps.push(step(`vcp ready ${slug} --stage implement`,'READINESS',
      'Verify the Task Pack is eligible before coding.'));
    steps.push(step(`vcp context ${slug} --mode implement`,'CONTEXT',
      'Obtain bounded implementation context only if readiness permits.',['IMPLEMENT_READINESS_REVIEW']));
    steps.push(step(`vcp verify ${slug}`,'VERIFICATION_PREVIEW',
      'Inspect configured checks; running verification requires a separate deliberate action.',
      ['IMPLEMENTATION_COMPLETE','PROJECT_COMMAND_AUTHORITY']));
  }else if(phase==='review'){
    if(reviewBase===null)blockingReason='REVIEW_BASE_REQUIRED';
    else steps.push(step(`vcp context ${slug} --mode review --base ${reviewBase}`,'REVIEW',
      'Use an explicit Git base. No inferred branch, completed review, or automatic merge.'));
  }else{
    if(releaseVersion===null)blockingReason='RELEASE_VERSION_REQUIRED';
    else steps.push(step(`vcp release-check ${releaseVersion}`,'RELEASE_PREVIEW',
      'Preview candidate release checks only; publication, tags and releases remain manual.'));
  }
  if(readiness==='blocked'&&phase==='implement')blockingReason='TASK_READINESS_BLOCKED';
  return Object.freeze({schemaVersion:1,readOnly:true,task:slug,phase,
    workflowMode:modeState,readiness,blockingReason,
    status:blockingReason?'BLOCKED':'PREVIEW_ONLY',
    suggestedNext:blockingReason?null:steps[0]?.command??null,
    steps:Object.freeze(steps),
    actionsExecuted:0,modePersisted:false,automaticProgression:false,
    mechanicalGate:'NOT_IMPLEMENTED_IN_PHASE6_FOUNDATION',
    commandsAuthorized:false,lifecycleMutationAuthorized:false,
    ownerDecisionRequiredForMaterialWork:true,
    note:mode==='auto'
      ? 'AUTO route preview only. Executing Auto behavior lives in the workflow runner: it advances ordinary transitions without per-step confirmation and stops on failed checks, stale evidence, L3 review, or missing approvals.'
      :mode==='assisted'
      ? 'ASSISTED route preview only. The runner recommends exactly one next step from deterministic state, explains it, and requests confirmation before advancing.'
      : 'MANUAL route lists existing CLI commands for deliberate user/agent action.'});
}
