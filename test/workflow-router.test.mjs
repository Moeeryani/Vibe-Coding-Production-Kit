import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectWorkflowMode,previewWorkflowRoute} from '../lib/workflow-router.mjs';
function code(fn,code){assert.throws(fn,e=>e.code===code);}
test('manual preview routes to existing commands only',()=>{
 const r=previewWorkflowRoute({task:'implement-auth'});
 assert.equal(r.status,'PREVIEW_ONLY');assert.equal(r.suggestedNext,'vcp ready implement-auth --stage plan');
 assert.equal(r.steps.length,2);assert.equal(r.actionsExecuted,0);assert.equal(r.commandsAuthorized,false);
});
test('auto suggests but cannot execute/persist/gate',()=>{
 const r=previewWorkflowRoute({task:'fix-schema',mode:'auto',phase:'implement',readiness:'ready'});
 assert.equal(r.workflowMode.persistedMode,null);assert.equal(r.automaticProgression,false);
 assert.equal(r.steps.length,3);assert.ok(r.steps.every(x=>x.requiresExplicitAction));
 assert.equal(r.mechanicalGate,'NOT_IMPLEMENTED_IN_PHASE6_FOUNDATION');
});
test('blocked implementation cannot recommend action',()=>{
 const r=previewWorkflowRoute({task:'fix-schema',phase:'implement',readiness:'blocked'});
 assert.equal(r.status,'BLOCKED');assert.equal(r.suggestedNext,null);
});
test('review requires explicit safe Git base',()=>{
 let r=previewWorkflowRoute({task:'safe-change',phase:'review'});
 assert.equal(r.blockingReason,'REVIEW_BASE_REQUIRED');
 r=previewWorkflowRoute({task:'safe-change',phase:'review',reviewBase:'integration/base'});
 assert.equal(r.suggestedNext,'vcp context safe-change --mode review --base integration/base');
});
test('review rejects shell-like or ambiguous refs',()=>{
 for(const reviewBase of ['; echo evil','--force','../../etc/passwd','HEAD..main',''])
  code(()=>previewWorkflowRoute({task:'safe-change',phase:'review',reviewBase}),'E_WORKFLOW_REVIEW_BASE');
});
test('review and release flags are phase-scoped',()=>{
 code(()=>previewWorkflowRoute({task:'task',phase:'plan',reviewBase:'main'}),'E_WORKFLOW_REVIEW_BASE_SCOPE');
 code(()=>previewWorkflowRoute({task:'task',phase:'review',releaseVersion:'0.9.4'}),'E_WORKFLOW_RELEASE_VERSION_SCOPE');
});
test('release requires concrete version and never publishes',()=>{
 const blocked=previewWorkflowRoute({task:'release-plan',phase:'release'});
 assert.equal(blocked.blockingReason,'RELEASE_VERSION_REQUIRED');
 const r=previewWorkflowRoute({task:'release-plan',phase:'release',releaseVersion:'0.9.4'});
 assert.equal(r.suggestedNext,'vcp release-check 0.9.4');
 assert.ok(!r.steps.some(s=>/publish|tag|merge/.test(s.command)));
});
test('unsafe input rejects without shell execution',()=>{
 for(const taskName of ['-a','a b','a;rm -rf x','$(whoami)','foo/../bar','foo.bar'])
  code(()=>previewWorkflowRoute({task:taskName}),'E_WORKFLOW_TASK');
 for(const mode of ['agent','silent','automatic',null])
  code(()=>previewWorkflowRoute({task:'task',mode}),'E_WORKFLOW_MODE');
 code(()=>previewWorkflowRoute({task:'task',phase:'gate'}),'E_WORKFLOW_PHASE');
 code(()=>previewWorkflowRoute({task:'task',readiness:'passed'}),'E_WORKFLOW_READINESS');
});
test('existing schema-v2 refuses unrecognized persisted workflowMode',()=>{
 const good={schemaVersion:2,install:{stack:'javascript'}};
 assert.equal(inspectWorkflowMode({manifest:good}).persistence,'NOT_SUPPORTED_BY_CURRENT_MANIFEST');
 code(()=>inspectWorkflowMode({manifest:{...good,install:{stack:'javascript',workflowMode:'auto'}}}),
 'E_WORKFLOW_MODE_UNRECOGNIZED_MANIFEST_FIELD');
 code(()=>inspectWorkflowMode({manifest:{...good,workflowMode:'manual'}}),
 'E_WORKFLOW_MODE_UNRECOGNIZED_MANIFEST_FIELD');
});
