// D-01 Windows published-old-CLI evidence ingestion, PURE READ ONLY.
//
// All JSON observations are independently UNTRUSTED until the external
// Windows agent attests real token, recorded command, staged binary identity,
// network isolation, actual write-path reachability and OS error in an
// independently preserved execution trace. A failed CLI or error 32 from
// handles opened by our own probe is NOT evidence of denied rights.
//
// This review never grants D-01 or allows selected-project mutation.
const HEX24=/^[a-f0-9]{24}$/;
const HEX64=/^[a-f0-9]{64}$/;
const HEX128=/^[a-f0-9]{128}$/;
const SID=/^S-1-5-21-(?:[0-9]+-){3}[0-9]+$/;
const IDS=Object.freeze(['init-force','update','manage-ignore',
  'manage-track','rollback-post-backup-user-edit']);
function argsFor(id,project){
  if(id==='init-force')return ['init',project,'--yes','--agent','all',
    '--force','--no-github'];
  if(id==='update')return ['update',project];
  if(id==='manage-ignore')return ['manage','ignore','AGENTS.md','--dir',project];
  if(id==='manage-track')return ['manage','track','AGENTS.md','--dir',project];
  return ['rollback',project];
}

function refuse(code){const e=new Error(code);e.code=code;throw e;}
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
const OBS_FIELDS=new Set([
  'kind','status','scenarioId','reportedOldSid',
  'fixtureRootIdentity','projectIdentity','archiveSha512',
  'stagedEntrypointSha256','exitCode','started','networkBlockedReported',
  'lifecycleWritePathReachedReported','osDenialWin32Error',
  'stdoutSha256','stderrSha256','before','after',
  'managedMutationAuthorized','d01Approved'
]);
const STATE_FIELDS=new Set([
  'agentsSha256','agentsFileIdentity','manifestSha256',
  'manifestFileIdentity','rootIdentity','projectIdentity'
]);
function validateState(state,variant){
  if(!object(state)||Object.keys(state).some(k=>!STATE_FIELDS.has(k))||
     [...STATE_FIELDS].some(k=>!Object.hasOwn(state,k))||
     !HEX64.test(state.agentsSha256??'')||
     !HEX24.test(state.agentsFileIdentity??'')||
     !HEX24.test(state.rootIdentity??'')||
     !HEX24.test(state.projectIdentity??'')||
     (variant==='with-manifest'
       ? !HEX64.test(state.manifestSha256??'')||
         !HEX24.test(state.manifestFileIdentity??'')
       : state.manifestSha256!==null||
         state.manifestFileIdentity!==null))
    refuse('E_D01_PUBLISHED_OBSERVATION_STATE_INVALID');
  return Object.freeze({...state});
}
function validate(receipt,plan,scenario){
  if(!object(receipt)||Object.keys(receipt).some(k=>!OBS_FIELDS.has(k))||
     [...OBS_FIELDS].some(k=>!Object.hasOwn(receipt,k))||
     receipt.kind!=='D01_WINDOWS_PUBLISHED_OLD_CLI_OBSERVATION_V1'||
     receipt.status!=='NO_GO'||
     receipt.scenarioId!==scenario.id||
     receipt.reportedOldSid!==plan.oldSid||
     receipt.fixtureRootIdentity!==plan.fixtureRootIdentity||
     receipt.projectIdentity!==
       (scenario.variant==='with-manifest'?
        plan.withManifestIdentity:plan.withoutManifestIdentity)||
     receipt.archiveSha512!==plan.archiveSha512||
     !HEX64.test(receipt.stagedEntrypointSha256??'')||
     !HEX64.test(receipt.stdoutSha256??'')||
     !HEX64.test(receipt.stderrSha256??'')||
     typeof receipt.started!=='boolean'||
     typeof receipt.networkBlockedReported!=='boolean'||
     typeof receipt.lifecycleWritePathReachedReported!=='boolean'||
     !(receipt.exitCode===null||Number.isInteger(receipt.exitCode)&&
       receipt.exitCode>=0&&receipt.exitCode<=255)||
     !(receipt.osDenialWin32Error===null||
       Number.isSafeInteger(receipt.osDenialWin32Error)&&
       receipt.osDenialWin32Error>=0&&
       receipt.osDenialWin32Error<=0xffffffff)||
     receipt.managedMutationAuthorized!==false||
     receipt.d01Approved!==false)
    refuse('E_D01_PUBLISHED_OBSERVATION_INVALID');
  if(!receipt.started&&(
    receipt.exitCode!==null||receipt.lifecycleWritePathReachedReported||
    receipt.osDenialWin32Error!==null))
    refuse('E_D01_PUBLISHED_OBSERVATION_CONTRADICTORY');
  const before=validateState(receipt.before,scenario.variant);
  const after=validateState(receipt.after,scenario.variant);
  const expectedProject=receipt.projectIdentity;
  const sameObjects=before.rootIdentity===plan.fixtureRootIdentity&&
    after.rootIdentity===plan.fixtureRootIdentity&&
    before.projectIdentity===expectedProject&&
    after.projectIdentity===expectedProject&&
    before.agentsFileIdentity===after.agentsFileIdentity&&
    before.manifestFileIdentity===after.manifestFileIdentity;
  const reportedBytesPreserved=sameObjects&&
    before.agentsSha256===after.agentsSha256&&
    before.manifestSha256===after.manifestSha256;
  return Object.freeze({
    scenarioId:scenario.id,variant:scenario.variant,
    operatorReportedProcessStarted:receipt.started,
    operatorReportedLifecycleWritePathReached:
      receipt.lifecycleWritePathReachedReported,
    operatorReportedNetworkBlocked:receipt.networkBlockedReported,
    operatorReportedByteAndIdentityPreservation:reportedBytesPreserved,
    operatorReportedWin32AccessDenied:receipt.osDenialWin32Error===5,
    operatorReportedSharingViolation:receipt.osDenialWin32Error===32,
    exitCode:receipt.exitCode,
    externalTraceValidated:false,
    stagedPackagePinnedDuringExecutionProven:false,
    actualTokenIndependentlyAttested:false,
    actualOsDenialIndependentlyAttested:false,
    selectedProjectTouched:false,managedMutationAuthorized:false
  });
}
export function reviewWindowsD01PublishedLegacyObservations({
  plan,observations=[]
}={}){
  if(!object(plan)||
     plan.kind!=='D01_WINDOWS_PUBLISHED_OLD_CLI_PLAN_V1'||
     plan.status!=='NO_GO'||plan.mayExecuteFromPlan!==false||
     plan.managedMutationAuthorized!==false||
     plan.d01Approved!==false||
     !HEX24.test(plan.fixtureRootIdentity??'')||
     !HEX24.test(plan.withManifestIdentity??'')||
     !HEX24.test(plan.withoutManifestIdentity??'')||
     !HEX128.test(plan.archiveSha512??'')||
     !SID.test(plan.oldSid??'')||
     !SID.test(plan.writerSid??'')||
     plan.oldSid===plan.writerSid||
     typeof plan.fixtureRoot!=='string'||
     !/^[A-Za-z]:\\/.test(plan.fixtureRoot)||
     plan.packageName!=='vibe-coding-production'||
     plan.packageVersion!=='0.9.3'||
     plan.independentNpmProvenanceVerified!==false||
     plan.actualOldTokenExecutionProven!==false||
     plan.withManifestIdentity===plan.withoutManifestIdentity||
     !Array.isArray(plan.scenarios)||plan.scenarios.length!==10||
     !Array.isArray(observations)||observations.length>10)
    refuse('E_D01_PUBLISHED_REVIEW_PLAN_INVALID');
  const indexed=new Map();
  const variants=['with-manifest','without-manifest'];
  for(const variant of variants){
    const project=plan.fixtureRoot+'\\'+variant;
    for(const id of IDS){
      const scenario=plan.scenarios[indexed.size];
      const expected=variant+'/'+id;
      if(!object(scenario)||scenario.id!==expected||
         scenario.variant!==variant||scenario.targetProject!==project||
         scenario.cliFile!=='package/bin/vibe-coding-production.mjs'||
         scenario.mayRunFromThisPlan!==false||
         scenario.mustAttestOldSidAndActualLifecycleWritePath!==true||
         scenario.mustAttestKernelDenialErrorNotSharingViolation!==true||
         scenario.mustAttestNetworkIsolatedExecution!==true||
         !Array.isArray(scenario.arguments)||
         JSON.stringify(scenario.arguments)!==
           JSON.stringify(argsFor(id,project))||
         scenario.requiresIndependentlyVerifiedBackup!==
           (id==='rollback-post-backup-user-edit')||
         scenario.requiresWriterAuthorizedPostBackupEdit!==
           (id==='rollback-post-backup-user-edit'))
        refuse('E_D01_PUBLISHED_REVIEW_PLAN_INVALID');
      indexed.set(expected,scenario);
    }
  }
  const found=new Set(),details=[];
  for(const r of observations){
    if(!object(r)||!indexed.has(r.scenarioId)||found.has(r.scenarioId))
      refuse('E_D01_PUBLISHED_OBSERVATION_SCENARIO_INVALID');
    found.add(r.scenarioId);
    details.push(validate(r,plan,indexed.get(r.scenarioId)));
  }
  return Object.freeze({
    kind:'D01_WINDOWS_PUBLISHED_OLD_CLI_OBSERVATIONS_REVIEW_V1',
    status:'NO_GO',totalScenarios:10,observedScenarios:details.length,
    missingScenarioIds:Object.freeze(
      [...indexed.keys()].filter(id=>!found.has(id))),
    observations:Object.freeze(details),
    // Even complete matching operator JSON is NOT independent OS proof.
    independentlyVerifiedPublishedArchive:false,
    independentlyVerifiedNativeNetworkIsolation:false,
    independentlyVerifiedOldTokenExecution:false,
    independentlyVerifiedActualWritePathDenial:false,
    independentlyVerifiedUserBytePreservation:false,
    windowsProductionDurabilityProven:false,
    safeToRetry:false,safeToDelete:false,safeToRollback:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
