import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnedLifecycleLock} from '../lib/lifecycle-lock-v2.mjs';
import {assessStage13Preview} from '../lib/stage13-brownfield-preflight.mjs';
import {assertStage13SectionIsolationAvailable} from '../lib/stage13-section-exchange.mjs';

test('Stage13 never accepts caller-fabricated lock objects as finality authority',async()=>{
  for(const mode of ['adopt','recovery']) {
    await assert.rejects(()=>assertOwnedLifecycleLock('/nonexistent',{
      root:'/nonexistent',mode,token:'e'.repeat(48),operationId:
      'adopt-'+'f'.repeat(32),released:false
    },{transactionId:'adopt-'+'f'.repeat(32)}),
    {code:'E_LIFECYCLE_LOCK_NOT_OWNED'});
  }
});
test('Stage13 explicit user consent cannot create an empty managed adoption',()=>{
  const plan={
    root:'/disposable-preview-only',planKind:'init',zeroWrite:true,
    previewOnly:true,executionAuthorized:false,
    classification:'EXISTING',blocked:false,
    assetSet:'brownfield-minimal-v1',actions:[],skippedPaths:[],
    requestedIntent:{stack:{kind:'explicit',value:'javascript'}}
  };
  const report=assessStage13Preview(plan);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'NO_MUTATING_ACTIONS_TO_ADOPT');
  assert.equal(report.executionAuthorized,false);
});
test('Stage13 cannot forge kernel isolation with a matching boolean receipt',()=>{
  for(const impostor of [
    {kernelIsolationProven:true},
    {macEnforced:true,reviewer:'independent'},
    {proofSha256:'a'.repeat(64),writerIsolated:true}
  ]) assert.throws(()=>assertStage13SectionIsolationAvailable(impostor),
    {code:'E_STAGE13_SECTION_OS_ISOLATION_UNPROVEN'});
});
