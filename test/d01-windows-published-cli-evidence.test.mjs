import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reviewWindowsD01PublishedLegacyObservations}
  from '../lib/d01-windows-published-cli-evidence.mjs';
import {correlateWindowsD01PublishedSnapshotEnvelopes}
  from '../lib/d01-windows-published-snapshot-correlation.mjs';

const rootId='1'.repeat(24),withId='2'.repeat(24);
const oldSid='S-1-5-21-100-200-300-1001';
const sha512='a'.repeat(128);
const fixtureRoot='C:\\ProgramData\\vcp-win-d01-isolation-'+'a'.repeat(32);
const writerSid='S-1-5-21-100-200-300-1002';
const argvFor=(id,project)=>id==='init-force'?
  ['init',project,'--yes','--agent','all','--force','--no-github']:
  id==='update'?['update',project]:
  id==='manage-ignore'?['manage','ignore','AGENTS.md','--dir',project]:
  id==='manage-track'?['manage','track','AGENTS.md','--dir',project]:
  ['rollback',project];
const plan={
  kind:'D01_WINDOWS_PUBLISHED_OLD_CLI_PLAN_V1',
  status:'NO_GO',mayExecuteFromPlan:false,
  managedMutationAuthorized:false,d01Approved:false,
  fixtureRootIdentity:rootId,
  withManifestIdentity:withId,
  withoutManifestIdentity:'3'.repeat(24),
  archiveSha512:sha512,oldSid,writerSid,fixtureRoot,
  packageName:'vibe-coding-production',packageVersion:'0.9.3',
  independentNpmProvenanceVerified:false,
  actualOldTokenExecutionProven:false,
  scenarios:[
    ...['with-manifest','without-manifest'].flatMap(variant=>
      ['init-force','update','manage-ignore','manage-track',
        'rollback-post-backup-user-edit'].map(id=>{
          const project=fixtureRoot+'\\'+variant;
          const needsBackup=id==='rollback-post-backup-user-edit';
          return {
            id:variant+'/'+id,variant,targetProject:project,
            cliFile:'package/bin/vibe-coding-production.mjs',
            arguments:argvFor(id,project),mayRunFromThisPlan:false,
            mustAttestOldSidAndActualLifecycleWritePath:true,
            mustAttestKernelDenialErrorNotSharingViolation:true,
            mustAttestNetworkIsolatedExecution:true,
            requiresIndependentlyVerifiedBackup:needsBackup,
            requiresWriterAuthorizedPostBackupEdit:needsBackup
          };
        }))
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


test('forged noop commands, missing rollback guard, arbitrary targets and ordinary project paths refuse coverage',()=>{
  for(const corrupt of [
    {...plan,scenarios:plan.scenarios.map((s,i)=>i===0?
      {...s,arguments:['noop']}:s)},
    {...plan,scenarios:plan.scenarios.map((s,i)=>i===4?
      {...s,requiresWriterAuthorizedPostBackupEdit:false}:s)},
    {...plan,scenarios:plan.scenarios.map((s,i)=>i===7?
      {...s,targetProject:'C:\\real-user-project'}:s)},
    {...plan,fixtureRoot:'C:\\Users\\someone\\vcp-win-d01-isolation-'+
      'a'.repeat(32)}
  ]){
    assert.throws(()=>reviewWindowsD01PublishedLegacyObservations({
      plan:corrupt,observations:[]
    }),{code:'E_D01_PUBLISHED_REVIEW_PLAN_INVALID'});
  }
});



const correlationPlan={
  ...plan,
  scenarios:plan.scenarios.map(item=>({
    ...item,expectedAgentSha256:item.id.endsWith('rollback-post-backup-user-edit')?
      null:'c'.repeat(64),
    expectedManifestSha256:item.variant==='with-manifest'?'d'.repeat(64):null
  }))
};
const nativeSnapshot={
  kind:'D01_WINDOWS_NATIVE_PROTECTED_SNAPSHOT_V1',
  status:'NO_GO',variant:'with-manifest',
  ...before,readOnly:true,sharesDelete:true,nativeNtfs:true,
  markerVerified:true,snapshotAtomicityProven:false,
  oldCliExecutionProven:false,powerLossDurabilityProven:false,
  managedMutationAuthorized:false,d01Approved:false
};
const nativeEnvelope=native=>({
  kind:'D01_WINDOWS_PROTECTED_SNAPSHOT_ENVELOPE_V1',
  status:'NO_GO',fixtureRoot,
  sourceSha256:'1'.repeat(64),executableSha256:'2'.repeat(64),
  nativeReceipt:native,
  review:{status:'NO_GO',managedMutationAuthorized:false,d01Approved:false},
  oldCliExecutionProven:false,snapshotAtomicityProven:false,
  WindowsNamespaceDurabilityProven:false,
  managedMutationAuthorized:false,d01Approved:false
});
test('native before/after hashes match old CLI report but do not establish trusted OS provenance',()=>{
  const report=correlateWindowsD01PublishedSnapshotEnvelopes({
    plan:correlationPlan,scenarioId:'with-manifest/init-force',
    oldCliObservation:observation,
    beforeEnvelope:nativeEnvelope(nativeSnapshot),
    afterEnvelope:nativeEnvelope(nativeSnapshot)
  });
  assert.equal(report.status,'NO_GO');
  assert.equal(report.allReportedBeforeAfterFieldsMatchNativeSnapshots,true);
  assert.equal(report.originalUserBytesHashStable,true);
  assert.equal(report.originalNtfsFileIdsStable,true);
  assert.equal(report.actualOldTokenSidIndependentlyVerified,false);
  assert.equal(report.nativeNetworkIsolationVerified,false);
  assert.equal(report.independentNativeExecutionProven,false);
  assert.equal(report.d01Approved,false);
});
test('tampered native output, substituted EXE or mismatched operator report fail closed',()=>{
  const fixed={
    plan:correlationPlan,scenarioId:'with-manifest/init-force',
    oldCliObservation:observation,
    beforeEnvelope:nativeEnvelope(nativeSnapshot),
    afterEnvelope:nativeEnvelope(nativeSnapshot)
  };
  for(const change of [
    {afterEnvelope:nativeEnvelope({...nativeSnapshot,
      agentsFileIdentity:'9'.repeat(24)})},
    {afterEnvelope:nativeEnvelope({...nativeSnapshot,
      agentsSha256:'9'.repeat(64)})},
    {beforeEnvelope:{...nativeEnvelope(nativeSnapshot),
      executableSha256:'9'.repeat(64)}},
    {beforeEnvelope:{...nativeEnvelope(nativeSnapshot),
      fixtureRoot:'C:\\NotTheFixture'}},
    {scenarioId:'with-manifest/rollback-post-backup-user-edit'}
  ]){
    assert.throws(()=>correlateWindowsD01PublishedSnapshotEnvelopes({
      ...fixed,...change
    }),e=>/^E_D01_/.test(e.code));
  }
});
test('reported original fixture bytes cannot satisfy a post-backup writer-edit rollback scenario',()=>{
  const rollbackObservation={
    ...observation,
    scenarioId:'with-manifest/rollback-post-backup-user-edit'
  };
  const baselinePlan={...correlationPlan,scenarios:correlationPlan.scenarios
    .map(item=>item.id.endsWith('rollback-post-backup-user-edit')?
      {...item,expectedAgentSha256:null}:item)};
  const oldFixtureBytesHash=createHash('sha256').update(
    'VCP_D01_PROTECTED_USER_BYTES_DO_NOT_MODIFY\n').digest('hex');
  const sameOld={...nativeSnapshot,agentsSha256:oldFixtureBytesHash};
  const oldReport={...rollbackObservation,
    before:{...before,agentsSha256:oldFixtureBytesHash},
    after:{...before,agentsSha256:oldFixtureBytesHash}};
  assert.throws(()=>correlateWindowsD01PublishedSnapshotEnvelopes({
    plan:baselinePlan,scenarioId:rollbackObservation.scenarioId,
    oldCliObservation:oldReport,
    beforeEnvelope:nativeEnvelope(sameOld),
    afterEnvelope:nativeEnvelope(sameOld)
  }),{code:'E_D01_WINDOWS_CORRELATION_WRITER_EDIT_NOT_OBSERVED'});
});
