// D-01 Windows protected-file native snapshot validator (READ ONLY).
// A cryptographically named NTFS fixture and a valid C++ read receipt
// DO NOT prove that the old CLI was denied, that the filesystem state
// was atomic, or that it survived sudden power loss. Always NO_GO.
const H24=/^[a-f0-9]{24}$/,H64=/^[a-f0-9]{64}$/;
const KEYS=new Set([
  'kind','status','variant','rootIdentity','projectIdentity',
  'agentsSha256','agentsFileIdentity','manifestSha256',
  'manifestFileIdentity','readOnly','sharesDelete','nativeNtfs',
  'markerVerified','snapshotAtomicityProven','oldCliExecutionProven',
  'powerLossDurabilityProven','managedMutationAuthorized','d01Approved'
]);
function refuse(code){const e=new Error(code);e.code=code;throw e;}
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function verifyWindowsD01NativeProtectedSnapshot(value,{
  variant,rootIdentity,projectIdentity
}={}){
  if(!obj(value)||Object.keys(value).some(k=>!KEYS.has(k))||
     [...KEYS].some(k=>!Object.hasOwn(value,k))||
     value.kind!=='D01_WINDOWS_NATIVE_PROTECTED_SNAPSHOT_V1'||
     value.status!=='NO_GO'||
     !['with-manifest','without-manifest'].includes(value.variant)||
     !H24.test(value.rootIdentity??'')||
     !H24.test(value.projectIdentity??'')||
     !H24.test(value.agentsFileIdentity??'')||
     !H64.test(value.agentsSha256??'')||
     (value.variant==='with-manifest'
       ? !H64.test(value.manifestSha256??'')||
         !H24.test(value.manifestFileIdentity??'')
       : value.manifestSha256!==null||
         value.manifestFileIdentity!==null)||
     value.readOnly!==true||value.sharesDelete!==true||
     value.nativeNtfs!==true||value.markerVerified!==true||
     value.snapshotAtomicityProven!==false||
     value.oldCliExecutionProven!==false||
     value.powerLossDurabilityProven!==false||
     value.managedMutationAuthorized!==false||
     value.d01Approved!==false)
    refuse('E_D01_WINDOWS_SNAPSHOT_INVALID');
  if(variant!==undefined&&value.variant!==variant||
     rootIdentity!==undefined&&value.rootIdentity!==rootIdentity||
     projectIdentity!==undefined&&value.projectIdentity!==projectIdentity)
    refuse('E_D01_WINDOWS_SNAPSHOT_FIXTURE_MISMATCH');
  const state=Object.freeze({
    agentsSha256:value.agentsSha256,
    agentsFileIdentity:value.agentsFileIdentity,
    manifestSha256:value.manifestSha256,
    manifestFileIdentity:value.manifestFileIdentity,
    rootIdentity:value.rootIdentity,
    projectIdentity:value.projectIdentity
  });
  return Object.freeze({
    kind:'D01_WINDOWS_NATIVE_PROTECTED_SNAPSHOT_REVIEW_V1',
    status:'NO_GO',variant:value.variant,state,
    forensicSnapshotNativeClaim:true,
    receiptProvenanceIndependentlyVerified:false,
    originalBytesKnownOnlyBySHA256:true,
    snapshotAtomicityProven:false,
    concurrentRenameExclusionProven:false,
    oldCliDeniedProven:false,
    directoryNamespaceDurabilityProven:false,
    selectedProjectTouched:false,
    safeToDelete:false,safeToRetry:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
export function assessWindowsD01ProtectedBeforeAfter({
  before,after,variant,rootIdentity,projectIdentity
}={}){
  const b=verifyWindowsD01NativeProtectedSnapshot(before,{
    variant,rootIdentity,projectIdentity
  });
  const a=verifyWindowsD01NativeProtectedSnapshot(after,{
    variant,rootIdentity,projectIdentity
  });
  if(b.variant!==a.variant)
    refuse('E_D01_WINDOWS_SNAPSHOT_VARIANT_MISMATCH');
  const sameBytes=b.state.agentsSha256===a.state.agentsSha256&&
    b.state.manifestSha256===a.state.manifestSha256;
  const sameFiles=b.state.agentsFileIdentity===a.state.agentsFileIdentity&&
    b.state.manifestFileIdentity===a.state.manifestFileIdentity;
  return Object.freeze({
    kind:'D01_WINDOWS_NATIVE_PROTECTED_BEFORE_AFTER_V1',
    status:'NO_GO',variant:b.variant,
    originalUserBytesHashStable:sameBytes,
    originalFileIdentityStable:sameFiles,
    fixtureRootAndProjectIdentityStable:
      b.state.rootIdentity===a.state.rootIdentity&&
      b.state.projectIdentity===a.state.projectIdentity,
    originalUserDataPreservedObserved:sameBytes&&sameFiles,
    beforeState:b.state,afterState:a.state,
    independentExecutionTraceVerified:false,
    callerDidNotAlterSnapshotsUnproven:true,
    WindowsPowerLossDurabilityProven:false,
    publishedOldCliMutationDeniedProven:false,
    safeToRetry:false,safeToRollback:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
