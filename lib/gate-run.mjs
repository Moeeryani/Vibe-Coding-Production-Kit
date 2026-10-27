// Phase 7 controlled mechanical-gate execution. This is evidence collection,
// NOT a merge, release, production-writer, D-01, or G-FENCE authorization.
// It delegates commands exclusively to VCP's existing command-authority-bound verifier.
import path from 'node:path';
import { runGatePreview } from './gate-preview.mjs';
import { evaluateGateEvidence } from './gate-evidence.mjs';
import { runVerification, DEFAULT_VERIFY_TIMEOUT_MS } from './verify.mjs';
import { runTaskReadiness } from './readiness.mjs';
import { readinessStageForLevel } from './gate-contract.mjs';
import {
  L3_AUTHORIZATION_DISABLED_REASON, readCommitAuthorIdentity, validateL3ReviewEvidence,
} from './l3-review-evidence.mjs';

const LEVELS = new Set(['L0', 'L1', 'L2', 'L3']);
const TASK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function refuse(code) {const error = new Error(code);error.code=code;throw error;}
function object(x) {return x!==null && typeof x==='object' && !Array.isArray(x);}
function response({before, after=null, verification=null, evidence=null, blockers=[],
  mode='run', readiness=null, readinessStage=null, reviewEvidenceValidation=null}) {
  const blocked=blockers.length>0 || evidence?.status==='BLOCKED';
  const all=[...new Set([...blockers,...(evidence?.blockingReasons??[])])];
  return Object.freeze({kind:'vcp-mechanical-gate',policyVersion:'phase7-execution-1',
    status:mode==='preview'
      ? (before?.decision?.status==='PREVIEW_READY'?'PREVIEW_ONLY':'BLOCKED')
      :blocked?'BLOCKED':'EVIDENCE_ONLY_NOT_APPROVED',
    mode,preflight:before,postflight:after,
    verificationSummary:verification?.summary??null,
    verificationSucceeded:verification?.success===true,
    readinessStage:readinessStage??before?.changes?.readinessStage??null,
    readinessSummary:readiness?.summary??null,
    reviewEvidenceValidation:reviewEvidenceValidation??null,
    evidence:evidence??null,blockingReasons:Object.freeze(all),
    executionAuthorized:false,verificationExecuted:verification?.mode==='run',
    independentReviewAccepted:false,mergeAuthorized:false,releaseAuthorized:false,
    productionWriterAuthorized:false,ciEnforced:false,
    note:'A gate execution may collect verified evidence. It NEVER independently grants merging, release, CI PASS, production writer authority, or D-01/G-FENCE changes.'});
}

export async function runMechanicalGate({targetDir='.', task=null, baseRef,
  headRef='HEAD',minimumLevel=null,run=false,only=[],
  timeoutMs=DEFAULT_VERIFY_TIMEOUT_MS,reviewEvidence=null}={}) {
  if(typeof run!=='boolean')refuse('E_GATE_RUN_FLAG');
  if(task!==null&&(typeof task!=='string'||!TASK.test(task)))refuse('E_GATE_TASK');
  if(minimumLevel!==null&&!LEVELS.has(minimumLevel))refuse('E_GATE_MINIMUM_LEVEL');
  if(!Array.isArray(only)||only.some(x=>typeof x!=='string'||!x.trim()))refuse('E_GATE_ONLY');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>3600000)refuse('E_GATE_TIMEOUT');
  if(reviewEvidence!==null&&!object(reviewEvidence))refuse('E_GATE_REVIEW_EVIDENCE');
  const target=path.resolve(targetDir);
  const preArgs={targetDir:target,task,baseRef,headRef,minimumLevel};
  const before=await runGatePreview(preArgs);

  // D-PC-02: L3 review evidence is validated here so a reviewer can see
  // exactly which bindings check out — but validation NEVER authorizes an
  // L3 change. Live L3 authorization stays disabled (no trustworthy
  // reviewer-identity/signature mechanism exists); the L3 blockers below
  // apply regardless of the validation outcome.
  let reviewEvidenceValidation=null;
  if(reviewEvidence!==null) {
    const changeAuthorIdentity=await readCommitAuthorIdentity({targetDir:target,sha:before.headSha});
    reviewEvidenceValidation=validateL3ReviewEvidence(reviewEvidence,{
      taskSlug:task,taskSha256:before.taskSha256,baseSha:before.baseSha,headSha:before.headSha,
      changedFiles:before.changes.entries.map((e)=>e.path),changeAuthorIdentity,
    });
  }
  if(!run)return response({before,mode:'preview',reviewEvidenceValidation});

  const blockers=[];
  if(before.decision?.status!=='PREVIEW_READY')blockers.push('PREFLIGHT_BLOCKED');
  if(before.sourceWorkingTreeClean!==true)blockers.push('DIRTY_WORKTREE');
  if(before.changes?.requiredLevel==='L3') {
    blockers.push('INDEPENDENT_L3_REVIEW_REQUIRED');
    blockers.push(L3_AUTHORIZATION_DISABLED_REASON);
    if(reviewEvidenceValidation!==null&&!reviewEvidenceValidation.valid)blockers.push('L3_REVIEW_EVIDENCE_INVALID');
  }
  if(before.changes?.requiredLevel!=='L0'&&!task)blockers.push('MATERIAL_TASK_REQUIRED');

  // Never accept a historical --head ref as the current worktree revision.
  // A Git branch/head can move between these two observations; after-run
  // verification checks freshness again and refuses any mismatch.
  const actualHead=await runGatePreview({...preArgs,headRef:'HEAD'});
  if(before.headSha!==actualHead.headSha||before.baseSha!==actualHead.baseSha)
    blockers.push('NONCURRENT_HEAD_REF');
  if(actualHead.sourceWorkingTreeClean!==true)blockers.push('DIRTY_WORKTREE');
  if(task!==null&&before.taskSha256!==actualHead.taskSha256)
    blockers.push('TASK_CHANGED_BEFORE_RUN');
  if(blockers.length)return response({before,after:actualHead,blockers,reviewEvidenceValidation});

  // D-PC-01: the readiness bar follows the final required level. L0 has no
  // readiness bar (lightweight changed-surface contract); L1 uses plan-stage
  // readiness because L1 never executes verification commands; L2/L3 keep
  // implement-stage readiness. A user-requested minimum level promotes the
  // bar because requiredLevel is already post-promotion here.
  const readinessStage=readinessStageForLevel(before.changes.requiredLevel);
  let readiness=null;
  if(task!==null&&readinessStage!=='none') {
    try {readiness=await runTaskReadiness({targetDir:target,task,stage:readinessStage});}
    catch {blockers.push('READINESS_INSPECTION_FAILED');}
    if(!object(readiness?.summary)||!Number.isInteger(readiness.summary.fail)||
      readiness.summary.fail>0)blockers.push('READINESS_UNSATISFIED');
  }
  if(blockers.length)return response({before,after:actualHead,readiness,readinessStage,blockers,reviewEvidenceValidation});

  let verification=null;
  if(before.changes.verificationRequired) {
    if(!task)return response({before,after:actualHead,readiness,
      blockers:['VERIFICATION_TASK_REQUIRED'],reviewEvidenceValidation});
    try {
      // This remains the ONLY command execution entry point. It rechecks the
      // Task Pack and approved command digests before every subprocess.
      verification=await runVerification({targetDir:target,task,only,run:true,
        timeoutMs,quiet:true,output:null,force:false});
    }catch {blockers.push('VERIFICATION_EXECUTION_ERROR');}
  }
  // Regardless of verifier success or exceptions, independently reconstruct
  // the Git comparison and Task Pack identity at the live post-run worktree.
  let after=null;
  try {after=await runGatePreview({...preArgs,headRef:'HEAD'});}
  catch {blockers.push('POSTFLIGHT_INSPECTION_FAILED');}
  if(!after)return response({before,verification,readiness,blockers,reviewEvidenceValidation});
  if(after.headSha!==before.headSha||after.baseSha!==before.baseSha)
    blockers.push('GIT_HEAD_CHANGED');
  if(after.sourceWorkingTreeClean!==true)blockers.push('DIRTY_AFTER_VERIFICATION');
  if(before.taskSha256!==after.taskSha256)blockers.push('TASK_CHANGED');
  if(verification) {
    if(verification.revision?.system!=='git'||
      verification.revision.headSha!==before.headSha||
      verification.revision.dirty===true)
      blockers.push('VERIFIER_REVISION_MISMATCH');
    if(verification.mode!=='run'||verification.success!==true)
      blockers.push('VERIFICATION_FAILED');
  }
  let evidence=null;
  try {evidence=evaluateGateEvidence({before,after,verification,
    taskBefore:before.taskSha256,taskAfter:after.taskSha256});}
  catch {blockers.push('EVIDENCE_EVALUATION_FAILED');}
  // An L0/L1 task may have no verification command. It is reviewable but never
  // passes CI, and no downstream process may interpret this response as GO.
  return response({before,after,verification,evidence,readiness,blockers,reviewEvidenceValidation});
}

export function mechanicalGateExitCode(report) {
  if(report?.status==='BLOCKED')return 1;
  // EVIDENCE_ONLY is NEVER a platform CI PASS or authorization to merge.
  return 2;
}
