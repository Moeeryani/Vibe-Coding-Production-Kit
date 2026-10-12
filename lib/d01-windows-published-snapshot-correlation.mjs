// Correlate three INDEPENDENTLY CAPTURED but still UNTRUSTED data sources:
// (1) fixed authenticated-tarball Windows D01 command plan,
// (2) native before/after NTFS SHA256 and object-ID observations,
// (3) operator's published old-CLI lifecycle trace report.
//
// No execution, filesystem mutation, attestation authority or D01 approval.
// Cross-checking matching untrusted documents is not independent evidence.
import {createHash} from 'node:crypto';
import {reviewWindowsD01PublishedLegacyObservations}
  from './d01-windows-published-cli-evidence.mjs';
import {
  assessWindowsD01ProtectedBeforeAfter
} from './windows-d01-protected-snapshot-evidence.mjs';
function fail(code){const e=new Error(code);e.code=code;throw e;}
const KEYS=['agentsSha256','agentsFileIdentity','manifestSha256',
  'manifestFileIdentity','rootIdentity','projectIdentity'];
const ORIGINAL_AGENTS_HASH=createHash('sha256').update(
  'VCP_D01_PROTECTED_USER_BYTES_DO_NOT_MODIFY\n').digest('hex');
function equalState(left,right){
  return KEYS.every(k=>left[k]===right[k]);
}
export function correlateWindowsD01PublishedOldCliSnapshotEvidence({
  plan,scenarioId,oldCliObservation,beforeNative,afterNative
}={}){
  // Reuse the full fixed-command matrix contract rather than trusting
  // arbitrary scenario IDs or a substituted noop argv.
  const review=reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[oldCliObservation]
  });
  const scenario=plan.scenarios.find(s=>s.id===scenarioId);
  if(!scenario||review.observations[0].scenarioId!==scenarioId)
    fail('E_D01_WINDOWS_CORRELATION_SCENARIO_MISMATCH');
  const projectIdentity=scenario.variant==='with-manifest'?
    plan.withManifestIdentity:plan.withoutManifestIdentity;
  const comparison=assessWindowsD01ProtectedBeforeAfter({
    before:beforeNative,after:afterNative,variant:scenario.variant,
    rootIdentity:plan.fixtureRootIdentity,projectIdentity
  });
  if(!equalState(comparison.beforeState,oldCliObservation.before)||
     !equalState(comparison.afterState,oldCliObservation.after))
    fail('E_D01_WINDOWS_CORRELATION_NATIVE_STATE_MISMATCH');
  if(scenario.expectedManifestSha256!==
       comparison.beforeState.manifestSha256)
    fail('E_D01_WINDOWS_CORRELATION_MANIFEST_BASELINE_MISMATCH');
  if(scenario.requiresWriterAuthorizedPostBackupEdit){
    // A post-backup writer edit is essential; original fixture content
    // unchanged cannot possibly satisfy it. Time ordering and writer
    // authorization still require independent receipts beyond this check.
    if(comparison.beforeState.agentsSha256===ORIGINAL_AGENTS_HASH)
      fail('E_D01_WINDOWS_CORRELATION_WRITER_EDIT_NOT_OBSERVED');
  }else if(comparison.beforeState.agentsSha256!==
           scenario.expectedAgentSha256){
    fail('E_D01_WINDOWS_CORRELATION_AGENTS_BASELINE_MISMATCH');
  }
  return Object.freeze({
    kind:'D01_WINDOWS_OLD_CLI_NATIVE_SNAPSHOT_CORRELATION_V1',
    status:'NO_GO',scenarioId,
    allReportedBeforeAfterFieldsMatchNativeSnapshots:true,
    expectedFixtureManifestBaselineMatches:true,
    originalUserBytesHashStable:comparison.originalUserBytesHashStable,
    originalNtfsFileIdsStable:comparison.originalFileIdentityStable,
    oldCliOperatorReportedWin32Error:
      oldCliObservation.osDenialWin32Error,
    sharingViolationReported:
      oldCliObservation.osDenialWin32Error===32,
    accessDeniedReported:oldCliObservation.osDenialWin32Error===5,
    operatorSaysWritePathReached:
      oldCliObservation.lifecycleWritePathReachedReported,
    writerPostBackupEditChronologyProven:false,
    stagedArchivePinnedAcrossExecutionProven:false,
    independentNativeSnapshotProvenanceVerified:false,
    actualOldTokenSidIndependentlyVerified:false,
    oldCliLifecycleWritePathIndependentlyVerified:false,
    nativeNetworkIsolationVerified:false,
    WindowsNamespaceDurabilityProven:false,
    selectedProjectTouched:false,
    safeToRetry:false,safeToRollback:false,safeToDelete:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}

const HASH64=/^[a-f0-9]{64}$/;
function envelope(value,plan){
  if(value===null||typeof value!=='object'||Array.isArray(value)||
     value.kind!=='D01_WINDOWS_PROTECTED_SNAPSHOT_ENVELOPE_V1'||
     value.status!=='NO_GO'||
     value.fixtureRoot!==plan.fixtureRoot||
     !HASH64.test(value.sourceSha256??'')||
     !HASH64.test(value.executableSha256??'')||
     value.managedMutationAuthorized!==false||
     value.d01Approved!==false||
     value.oldCliExecutionProven!==false||
     value.WindowsNamespaceDurabilityProven!==false||
     value.snapshotAtomicityProven!==false||
     value.review?.status!=='NO_GO'||
     value.review?.managedMutationAuthorized!==false||
     value.review?.d01Approved!==false||
     value.nativeReceipt?.status!=='NO_GO')
    fail('E_D01_WINDOWS_CORRELATION_ENVELOPE_INVALID');
  return value;
}
// Designed for the JSON output of:
//   inspect:d01-windows-protected-snapshot (before and after)
//   review:d01-windows-published-cli (external operator observation)
// No names are resolved and no child process or OS write is performed.
export function correlateWindowsD01PublishedSnapshotEnvelopes({
  plan,scenarioId,oldCliObservation,beforeEnvelope,afterEnvelope
}={}){
  // Validate the fixed ten-scenario plan BEFORE consulting claimed
  // snapshot root paths, to avoid treating an arbitrary folder as a
  // valid VCP disposable fixture.
  reviewWindowsD01PublishedLegacyObservations({
    plan,observations:[oldCliObservation]
  });
  const before=envelope(beforeEnvelope,plan);
  const after=envelope(afterEnvelope,plan);
  if(before.sourceSha256!==after.sourceSha256||
     before.executableSha256!==after.executableSha256)
    fail('E_D01_WINDOWS_CORRELATION_NATIVE_BUILD_CHANGED');
  const report=correlateWindowsD01PublishedOldCliSnapshotEvidence({
    plan,scenarioId,oldCliObservation,
    beforeNative:before.nativeReceipt,
    afterNative:after.nativeReceipt
  });
  return Object.freeze({
    ...report,
    sameNativeBinaryHashReportedBeforeAndAfter:true,
    nativeSourceSha256:before.sourceSha256,
    nativeExecutableSha256:before.executableSha256,
    // The underlying reports are untrusted JSON even if hashes match.
    independentNativeExecutionProven:false,
    status:'NO_GO',managedMutationAuthorized:false,d01Approved:false
  });
}
