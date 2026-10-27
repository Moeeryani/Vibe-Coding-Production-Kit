import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGateEvidence} from '../lib/gate-evidence.mjs';
import {classifyChangeSet,previewGateDecision,parseTaskLifecycle} from '../lib/gate-contract.mjs';
const hex='a'.repeat(64),s1='1'.repeat(40),s2='2'.repeat(40);
function report(path='src/server.js') {const changes=classifyChangeSet([{status:'M',path,from:null}]);return {baseSha:s1,headSha:s2,task:'sample-task',taskSha256:hex,
 policyVersion:changes.policyVersion,sourceWorkingTreeClean:true,changes,
 decision:previewGateDecision({changes,task:parseTaskLifecycle('Status: Review\n')})};}
const verification={mode:'run',success:true,summary:{pass:1,fail:0,skipped:0},commands:[{status:'pass',key:'CHECK_COMMAND'}]};
test('correct evidence remains unapproved without human review',()=>{let r=report(),o=evaluateGateEvidence({before:r,after:r,verification,taskBefore:hex,taskAfter:hex});assert.equal(o.status,'VERIFICATION_EVIDENCED_NOT_APPROVED');assert.equal(o.mergeAuthorized,false);});
test('mismatched Git head is an explicit blocker',()=>{let a=report(),b={...a,headSha:s1};assert.ok(evaluateGateEvidence({before:a,after:b,verification,taskBefore:hex,taskAfter:hex}).blockingReasons.includes('GIT_HEAD_OR_BASE_CHANGED'));});
test('successful task changed during verification is blocked',()=>{let a=report();assert.ok(evaluateGateEvidence({before:a,after:a,verification,taskBefore:hex,taskAfter:'b'.repeat(64)}).blockingReasons.includes('TASK_CHANGED'));});
test('skipped and failed verification never become a successful gate',()=>{let a=report();for(const v of [{...verification,summary:{pass:1,fail:0,skipped:1}},{...verification,mode:'preview'},{...verification,commands:[{status:'planned'}]}])assert.ok(evaluateGateEvidence({before:a,after:a,verification:v,taskBefore:hex,taskAfter:hex}).blockingReasons.includes('VERIFICATION_NOT_PROVEN'));});
test('high-risk change cannot be considered independently reviewed',()=>{let a=report('.github/workflows/ci.yml');assert.ok(evaluateGateEvidence({before:a,after:a,verification,taskBefore:hex,taskAfter:hex}).blockingReasons.includes('INDEPENDENT_HIGH_RISK_REVIEW_NOT_EVIDENCED'));});
test('dirty worktree after verification blocks',()=>{let a=report(),b={...a,sourceWorkingTreeClean:false};assert.ok(evaluateGateEvidence({before:a,after:b,verification,taskBefore:hex,taskAfter:hex}).blockingReasons.includes('DIRTY_WORKTREE'));});
