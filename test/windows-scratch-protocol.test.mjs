// Pure Node contract tests: these do not execute native Windows filesystem
// operations, authorize writes, or imply NTFS durability acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interpretWindowsScratchResult,windowsNativeCandidateStatus}
  from '../lib/windows-fs-provider-candidate.mjs';

function receipt(operation,overrides={}){
  return {kind:'VCP_WINDOWS_SCRATCH_NAMESPACE_CANDIDATE',
    protocolVersion:2,operation,completed:true,
    fileFlushReturned:operation==='write-exclusive',
    mayHaveMutated:!['capabilities','sync-root'].includes(operation),
    directoryFlushReturned:true,lastWin32Error:0,
    managedMutationAuthorized:false,directoryDurabilityProven:false,
    powerLossAttested:false,...overrides};
}
const response=(payload,status=0)=>({
  stdout:JSON.stringify(payload)+'\n',status,error:null
});

test('Windows native candidate receipts remain nonauthoritative even when successful',()=>{
  const done=interpretWindowsScratchResult('write-exclusive',
    response(receipt('write-exclusive')));
  assert.equal(done.nativeExitCode,0);
  assert.equal(done.completed,true);
  assert.equal(done.managedMutationAuthorized,false);
  assert.equal(done.directoryDurabilityProven,false);
  assert.equal(windowsNativeCandidateStatus().mutationAuthorized,false);
});

test('completed native rename with unsupported parent sync requires forensic inspection',()=>{
  const result=response(receipt('rename-no-replace',{
    directoryFlushReturned:false,lastWin32Error:5
  }),7);
  assert.throws(()=>interpretWindowsScratchResult('rename-no-replace',result),e=>{
    assert.equal(e.code,'E_DIRECTORY_SYNC_UNPROVEN');
    assert.equal(e.nativeReceipt?.completed,true);
    assert.equal(e.mayHaveMutated,true);
    assert.equal(e.requiresForensicInspection,true);
    assert.equal(e.nativeOutcomeUnknown,false);
    return true;
  });
});

test('file creation can mutate before failing data write and must not report no-op',()=>{
  const result=response(receipt('write-exclusive',{
    completed:false,fileFlushReturned:false,directoryFlushReturned:false,
    mayHaveMutated:true,lastWin32Error:29
  }),6);
  assert.throws(()=>interpretWindowsScratchResult('write-exclusive',result),e=>{
    assert.equal(e.code,'E_WINDOWS_SCRATCH_OPERATION_FAILED');
    assert.equal(e.nativeReceipt?.mayHaveMutated,true);
    assert.equal(e.requiresForensicInspection,true);
    return true;
  });
});

test('no-replace collision and invalid protocol have different mutation certainty',()=>{
  const collision=response(receipt('write-exclusive',{
    completed:false,mayHaveMutated:false,fileFlushReturned:false,
    lastWin32Error:80
  }),6);
  assert.throws(()=>interpretWindowsScratchResult('write-exclusive',collision),e=>{
    assert.equal(e.code,'E_WINDOWS_SCRATCH_OPERATION_FAILED');
    assert.equal(e.mayHaveMutated,false);
    assert.equal(e.requiresForensicInspection,false);
    return true;
  });
  for(const invalid of [
    {stdout:'not-json',status:6},
    {stdout:'',status:5},
    response(receipt('unlink'),0), // wrong requested operation
    response(receipt('rename-no-replace',{completed:false}),0),
    response(receipt('rename-no-replace',{mayHaveMutated:false}),0),
    response(receipt('rename-no-replace',{directoryFlushReturned:false}),0),
    response(receipt('rename-no-replace',{protocolVersion:1}),0),
    response(receipt('rename-no-replace',{powerLossAttested:true}),0)
  ]) {
    assert.throws(()=>interpretWindowsScratchResult('rename-no-replace',invalid),e=>{
      assert.equal(e.code,'E_WINDOWS_SCRATCH_HELPER_PROTOCOL');
      assert.equal(e.nativeOutcomeUnknown,true);
      assert.equal(e.mayHaveMutated,true);
      assert.equal(e.requiresForensicInspection,true);
      return true;
    });
  }
});

test('missing binary, process failure or timeout never proves a successful no-op',()=>{
  for(const result of [
    {error:{code:'ENOENT'},stdout:'',status:null},
    {error:{code:'ETIMEDOUT'},stdout:'',status:null},
    {error:{code:'EACCES'},stdout:'',status:null}
  ]){
    assert.throws(()=>interpretWindowsScratchResult('unlink',result),e=>{
      assert.equal(e.code,'E_WINDOWS_SCRATCH_HELPER_UNAVAILABLE');
      assert.equal(e.nativeOutcomeUnknown,true);
      assert.equal(e.requiresForensicInspection,true);
      return true;
    });
  }
});
