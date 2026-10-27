import assert from 'node:assert/strict';
import test from 'node:test';
import {classifyLegacyWorkflowRow,LEGACY_VCP_WORKFLOW} from '../lib/legacy-ci-transition-plan.mjs';
const row=(classification,extra={})=>({path:LEGACY_VCP_WORKFLOW,classification,...extra});
test('migration: exact owned baseline permits candidate only, never writes',()=>{
 const p=classifyLegacyWorkflowRow('/fixture',row('RETIRE_CANDIDATE',{
  baselineHash:'a'.repeat(64),observedHash:'a'.repeat(64)}));
 assert.equal(p.action,'DELETE_CANDIDATE');assert.equal(p.executionAuthorized,false);
 assert.equal(p.writeAuthorized,false);assert.equal(p.readOnly,true);
 assert.ok(p.requires.includes('OLD_PUBLISHED_CLI_ISOLATION'));
});
test('migration: changed project workflow is preserved and detach requires approval',()=>{
 const p=classifyLegacyWorkflowRow('/fixture',row('PRESERVE_USER_EDIT',{
 baselineHash:'a'.repeat(64),observedHash:'b'.repeat(64)}));
 assert.equal(p.action,'DETACH_CANDIDATE');assert.notEqual(p.action,'DELETE_CANDIDATE');
 assert.ok(p.requires.includes('EXPLICIT_OWNER_DECISION'));
});
test('migration: absent workflow remains absent',()=>{
 const p=classifyLegacyWorkflowRow('/fixture',row('RETAIN_ABSENT'));
 assert.equal(p.action,'PRESERVE_ABSENT');assert.equal(p.requires.length,0);
});
test('migration: untrusted provenance is blocked',()=>{
 const p=classifyLegacyWorkflowRow('/fixture',row('CONFLICT',{reason:'BASELINE_INTEGRITY'}));
 assert.equal(p.action,'BLOCKED');assert.equal(p.blocked,true);
});
