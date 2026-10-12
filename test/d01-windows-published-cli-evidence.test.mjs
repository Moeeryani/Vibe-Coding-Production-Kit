import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewWindowsD01PublishedLegacyObservations}
  from '../lib/d01-windows-published-cli-evidence.mjs';

const rootId='1'.repeat(24),withId='2'.repeat(24);
const oldSid='S-1-5-21-100-200-300-1001';
const sha512='a'.repeat(128);
const plan={
  kind:'D01_WINDOWS_PUBLISHED_OLD_CLI_PLAN_V1',
  status:'NO_GO',mayExecuteFromPlan:false,
  managedMutationAuthorized:false,d01Approved:false,
  fixtureRootIdentity:rootId,
  withManifestIdentity:withId,
  withoutManifestIdentity:'3'.repeat(24),
  archiveSha512:sha512,oldSid,
  scenarios:[
    ...['with-manifest','without-manifest'].flatMap(variant=>
      ['init-force','update','manage-ignore','manage-track',
        'rollback-post-backup-user-edit'].map(id=>({
          id:variant+'/'+id,variant
        })))
  ]
};
const before={
  agentsSha256:'c'.repeat(64),agentsFileIdentity:'4'.repeat(24),
  manifestSha256:'d'.repeat(64),manifestFileIdentity:'5'.repeat(24),
  rootIdentity:rootId,projectIdentity:withId
};
const observation={
  kind:'D01_WINDOWS_PUBLISHED_OLD_CLI_OBSERVATION_V1',
  status:'NO_GO',scenarioId:'with-manifest/init-force',
  reportedOldSid:oldSid,
  fixtureRootIdentity:rootId,projectIdentity:withId,
  archiveSha512:sha512,
  stagedEntrypointSha256:'f'.repeat(64),
  exitCode:1,started:true,networkBlockedReported:true,
  lifecycleWritePathReachedReported:true,osDenialWin32Error:5,
  stdoutSha256:'a'.repeat(64),stderrSha256:'b'.repeat(64),
  before,after:{...before},
  managedMutationAuthorized:false,d01Approved:false
};

test('one operator-reported old CLI denied write leaves NO_GO and nine missing cases',()=>{
  const result=reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[observation]
  });
  assert.equal(result.status,'NO_GO');
  assert.equal(result.totalScenarios,10);
  assert.equal(result.observedScenarios,1);
  assert.equal(result.missingScenarioIds.length,9);
  assert.equal(result.observations[0].operatorReportedByteAndIdentityPreservation,true);
  assert.equal(result.observations[0].operatorReportedWin32AccessDenied,true);
  assert.equal(result.independentlyVerifiedActualWritePathDenial,false);
  assert.equal(result.independentlyVerifiedNativeNetworkIsolation,false);
  assert.equal(result.independentlyVerifiedOldTokenExecution,false);
  assert.equal(result.independentlyVerifiedUserBytePreservation,false);
  assert.equal(result.managedMutationAuthorized,false);
  assert.equal(result.safeToRollback,false);
});

test('sharing violation and altered user bytes cannot masquerade as preservation',()=>{
  const result=reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[{
      ...observation,osDenialWin32Error:32,
      after:{...before,agentsSha256:'e'.repeat(64)}
    }]
  });
  assert.equal(result.observations[0].operatorReportedSharingViolation,true);
  assert.equal(result.observations[0].operatorReportedWin32AccessDenied,false);
  assert.equal(result.observations[0].operatorReportedByteAndIdentityPreservation,false);
  assert.equal(result.status,'NO_GO');
});

test('original object replacement with identical bytes is not accepted as preserved identity',()=>{
  const result=reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[{
      ...observation,after:{...before,agentsFileIdentity:'6'.repeat(24)}
    }]
  });
  assert.equal(result.observations[0].operatorReportedByteAndIdentityPreservation,false);
});

test('forged approval, wrong root, missing fields, impossible process state and duplicates refuse',()=>{
  for(const change of [
    {status:'GO'}, {d01Approved:true},
    {managedMutationAuthorized:true},
    {fixtureRootIdentity:'9'.repeat(24)},
    {projectIdentity:'9'.repeat(24)},
    {reportedOldSid:'S-1-5-21-100-200-300-2002'},
    {archiveSha512:'b'.repeat(128)},
    {started:false,exitCode:0},
    {actualWriteVerified:true},
    {after:{...before,manifestFileIdentity:'INVALID'}}
  ]){
    assert.throws(()=>reviewWindowsD01PublishedLegacyObservations({
      plan,observations:[{...observation,...change}]
    }),e=>/^E_D01_PUBLISHED_/.test(e.code));
  }
  assert.throws(()=>reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[observation,observation]
  }),{code:'E_D01_PUBLISHED_OBSERVATION_SCENARIO_INVALID'});
  assert.throws(()=>reviewWindowsD01PublishedLegacyObservations({
    plan:{...plan,status:'GO'},observations:[observation]
  }),{code:'E_D01_PUBLISHED_REVIEW_PLAN_INVALID'});
});

test('no observations never create apparent full lifecycle coverage',()=>{
  const result=reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[]
  });
  assert.equal(result.observedScenarios,0);
  assert.equal(result.missingScenarioIds.length,10);
  assert.equal(result.independentlyVerifiedOldTokenExecution,false);
  assert.equal(result.status,'NO_GO');
});
