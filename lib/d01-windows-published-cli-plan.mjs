// D-01 published v0.9.3 adversary matrix planner for native Windows.
// PURE READ ONLY. It validates independently *supplied* SHA-512 + the
// published package payload, but does NOT verify digest provenance,
// stage/extract files, execute any command, or authorize project mutation.
//
// A probe returning sharing violation 32 because the observer itself
// holds a FILE_SHARE_DELETE-denying handle is NOT an ACL denial. Neither
// is an early CLI argument error or a nonzero CLI exit code.
import {createHash} from 'node:crypto';
import {validateD01WindowsDisposableFixtureReceipt}
  from './windows-d01-fixture-evidence.mjs';
import {inspectPublishedLegacyArchiveBytes}
  from './d01-published-legacy-artifact.mjs';

const COMMANDS=Object.freeze([
  Object.freeze({
    id:'init-force',phase:'initial',
    makeArgs:project=>[
      'init',project,'--yes','--agent','all','--force','--no-github'
    ],requiresBackup:false,requiresWriterPostBackupEdit:false
  }),
  Object.freeze({
    id:'update',phase:'after-init',
    makeArgs:project=>['update',project],
    requiresBackup:false,requiresWriterPostBackupEdit:false
  }),
  Object.freeze({
    id:'manage-ignore',phase:'after-init',
    makeArgs:project=>['manage','ignore','AGENTS.md','--dir',project],
    requiresBackup:false,requiresWriterPostBackupEdit:false
  }),
  Object.freeze({
    id:'manage-track',phase:'after-init',
    makeArgs:project=>['manage','track','AGENTS.md','--dir',project],
    requiresBackup:false,requiresWriterPostBackupEdit:false
  }),
  Object.freeze({
    id:'rollback-post-backup-user-edit',phase:'after-verified-backup',
    makeArgs:project=>['rollback',project],
    requiresBackup:true,requiresWriterPostBackupEdit:true
  })
]);

const USER_BYTES=Buffer.from(
  'VCP_D01_PROTECTED_USER_BYTES_DO_NOT_MODIFY\n','utf8');
const MANIFEST_BYTES=Buffer.from('{"D01_disposable_only":true}\n','utf8');
const sha256=value=>createHash('sha256').update(value).digest('hex');

function plannedScenario(entry,root,variant){
  // Windows paths are derived exclusively from a validated native
  // fixture receipt. No caller-supplied directory or arbitrary CLI args.
  const project=root+'\\'+variant;
  return Object.freeze({
    id:variant+'/'+entry.id,
    variant,phase:entry.phase,
    targetProject:project,
    arguments:Object.freeze(entry.makeArgs(project)),
    cliFile:'package/bin/vibe-coding-production.mjs',
    // Rollback must first see the independent writer's post-backup edit,
    // NOT the original fixture bytes. Its live expected hash is separately
    // captured immediately before replay, and must survive rollback.
    expectedAgentSha256:entry.requiresWriterPostBackupEdit?
      null:sha256(USER_BYTES),
    expectedManifestSha256:variant==='with-manifest'?
      sha256(MANIFEST_BYTES):null,
    manifestMustBeAbsent:variant==='without-manifest',
    requiresIndependentlyVerifiedBackup:entry.requiresBackup,
    requiresWriterAuthorizedPostBackupEdit:entry.requiresWriterPostBackupEdit,
    mustReattestOriginalBytesBefore:true,
    mustReattestByteAndFileIdPreservationAfter:true,
    mustAttestOldSidAndActualLifecycleWritePath:true,
    mustAttestKernelDenialErrorNotSharingViolation:true,
    mustAttestNetworkIsolatedExecution:true,
    mayRunFromThisPlan:false,
    selectedProjectTouched:false
  });
}

export function planWindowsD01PublishedLegacyAdversary({
  fixtureReceipt,archiveBytes,expectedSha512
}={}){
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureReceipt);
  // The digest MUST be supplied by an independent source. Computing it
  // from the same local tarball and accepting it as registry proof is
  // expressly disallowed by the acceptance contract.
  const artifact=inspectPublishedLegacyArchiveBytes(archiveBytes,{
    expectedSha512
  });
  const scenarios=[];
  for(const variant of ['with-manifest','without-manifest']){
    for(const entry of COMMANDS)
      scenarios.push(plannedScenario(entry,fixture.root,variant));
  }
  return Object.freeze({
    kind:'D01_WINDOWS_PUBLISHED_OLD_CLI_PLAN_V1',
    status:'NO_GO',
    fixtureRoot:fixture.root,
    fixtureRootIdentity:fixture.rootIdentity,
    withManifestIdentity:fixture.withManifestIdentity,
    withoutManifestIdentity:fixture.withoutManifestIdentity,
    oldSid:fixture.oldSid,writerSid:fixture.writerSid,
    packageName:artifact.packageName,
    packageVersion:artifact.packageVersion,
    archiveSha512:artifact.sha512,
    archiveEntryCount:artifact.entryCount,
    artifactMatchesExpectedDigest:true,
    independentNpmProvenanceVerified:false,
    stagedPackageContentsVerified:false,
    packageReadOnlyAtExecutionProven:false,
    WindowsNativeSandboxNetworkIsolated:false,
    actualOldTokenExecutionProven:false,
    actualLifecycleWritePathReached:false,
    parentNamespaceRenameDenialProven:false,
    protectedBytePreservationProven:false,
    backupAndPostEditLifecycleProven:false,
    twoVariantCoveragePlanned:true,
    scenarios:Object.freeze(scenarios),
    independentExecutionRequired:true,
    mayExecuteFromPlan:false,
    mayReuseR3ScratchWriterForProduction:false,
    safeToRetry:false,safeToRollback:false,safeToCleanup:false,
    selectedProjectTouched:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
