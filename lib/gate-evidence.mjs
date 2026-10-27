// Phase7 post-verification evidence evaluator. PURE: never executes commands.
// It refuses to convert a successful test run into human review or merge approval.
const SHA=/^[a-f0-9]{40}$/;
const HEX=/^[a-f0-9]{64}$/;
const REC=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail(code){const e=new Error(code);e.code=code;throw e;}
export function evaluateGateEvidence({before,after,verification=null,taskBefore=null,taskAfter=null}={}){
 if(!REC(before)||!REC(after)||!SHA.test(before.baseSha??'')||!SHA.test(before.headSha??'')||
   !SHA.test(after.baseSha??'')||!SHA.test(after.headSha??''))fail('E_GATE_EVIDENCE_REFS');
 const blocking=[];
 if(before.baseSha!==after.baseSha||before.headSha!==after.headSha)blocking.push('GIT_HEAD_OR_BASE_CHANGED');
 if(before.sourceWorkingTreeClean!==true||after.sourceWorkingTreeClean!==true)blocking.push('DIRTY_WORKTREE');
 if(before.policyVersion!==after.policyVersion)blocking.push('GATE_POLICY_CHANGED');
 if(before.changes?.requiredLevel!==after.changes?.requiredLevel)blocking.push('CHANGE_LEVEL_CHANGED');
 if(!Array.isArray(before.changes?.entries)||!Array.isArray(after.changes?.entries)||
   JSON.stringify(before.changes.entries)!==JSON.stringify(after.changes.entries))blocking.push('CHANGE_SET_CHANGED');
 if(before.task!==after.task)blocking.push('TASK_SELECTION_CHANGED');
 if(before.task!==null){
  if(!HEX.test(taskBefore??'')||!HEX.test(taskAfter??''))blocking.push('TASK_EVIDENCE_MISSING');
  else if(taskBefore!==taskAfter)blocking.push('TASK_CHANGED');
 }
 if(before.decision?.status!=='PREVIEW_READY'||after.decision?.status!=='PREVIEW_READY')blocking.push('GATE_PREFLIGHT_BLOCKED');
 if(before.changes?.requiredLevel==='L3')blocking.push('INDEPENDENT_HIGH_RISK_REVIEW_NOT_EVIDENCED');
 if(before.changes?.verificationRequired){
  if(!REC(verification)||verification.mode!=='run'||verification.success!==true||
   !REC(verification.summary)||verification.summary.fail!==0||
   verification.summary.skipped!==0||!Array.isArray(verification.commands)||
   verification.commands.length===0||verification.commands.some(x=>x.status!=='pass'))
     blocking.push('VERIFICATION_NOT_PROVEN');
 }else if(verification!==null){
  // An explicitly supplied report must still be truthful; no "run" preview masquerade.
  if(!REC(verification)||verification.mode!=='run'||verification.success!==true)
    blocking.push('UNTRUSTED_VERIFICATION_REPORT');
 }
 return Object.freeze({status:blocking.length?'BLOCKED':'VERIFICATION_EVIDENCED_NOT_APPROVED',
  blockingReasons:Object.freeze(blocking),baseSha:after.baseSha,headSha:after.headSha,
  requiredLevel:after.changes?.requiredLevel??null,
  commandsPassed:verification?.commands?.filter(c=>c.status==='pass').length??0,
  independentReviewAccepted:false,humanApprovalRecorded:false,
  mergeAuthorized:false,releaseAuthorized:false,ciEnforced:false,
  note:'A syntactically plausible verification report is not cryptographic attestation. Revalidate input authenticity and obtain independent review before acceptance.'});
}
