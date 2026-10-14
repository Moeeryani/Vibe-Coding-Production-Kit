// D-01 cross-principal Windows NTFS evidence correlation, PURE READ ONLY.
// This verifies that two purported OS-token ACL readings describe the
// SAME exact existing fixture objects, not only similarly named projects.
// No signed provenance or principal execution is inferred from JSON input.
import {validateD01WindowsDisposableFixtureReceipt}
  from './windows-d01-fixture-evidence.mjs';
import {assessWindowsD01DualPrincipal}
  from './windows-d01-token-evidence.mjs';

function refuse(code){const e=new Error(code);e.code=code;throw e;}
function one(fixture,pair,variant){
  const old=pair?.oldPrincipalReceipt;
  const writer=pair?.writerPrincipalReceipt;
  const matrix=assessWindowsD01DualPrincipal({
    oldPrincipalReceipt:old,writerPrincipalReceipt:writer
  });
  if(matrix.projectVariant!==variant)
    refuse('E_D01_WINDOWS_FIXTURE_VARIANT_MISMATCH');
  if(matrix.rootIdentity!==fixture.rootIdentity)
    refuse('E_D01_WINDOWS_FIXTURE_ROOT_MISMATCH');
  const expected=variant==='with-manifest'?
    fixture.withManifestIdentity:fixture.withoutManifestIdentity;
  if(matrix.projectIdentity!==expected)
    refuse('E_D01_WINDOWS_FIXTURE_PROJECT_MISMATCH');
  if(old.principalSid!==fixture.oldSid||
     writer.principalSid!==fixture.writerSid)
    refuse('E_D01_WINDOWS_FIXTURE_PRINCIPAL_MISMATCH');
  return Object.freeze({
    variant,rootIdentity:matrix.rootIdentity,
    projectIdentity:matrix.projectIdentity,
    matchingSidAndObjectIdsObserved:true,
    oldReadOnlyAclSnapshot:matrix.oldReadOnlyAclSnapshot,
    writerWriteCapabilityObserved:matrix.writerWriteCapabilityObserved,
    kernelOldCliMutationDeniedProven:false,
    parentNamespaceProtectedDuringRace:false,
    managedMutationAuthorized:false
  });
}
export function assessWindowsD01FixturePrincipalMatrix({
  fixtureReceipt,withManifest,withoutManifest
}={}){
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureReceipt);
  const variants=[
    one(fixture,withManifest,'with-manifest'),
    one(fixture,withoutManifest,'without-manifest')
  ];
  return Object.freeze({
    kind:'D01_WINDOWS_FIXTURE_PRINCIPAL_MATRIX_V1',
    status:'NO_GO',fixtureRoot:fixture.root,
    fixtureRootIdentity:fixture.rootIdentity,
    bothManifestStatesCovered:true,
    correlatedReadOnlyReceipts:Object.freeze(variants),
    independentNativeReceiptProvenance:false,
    parentRenameDenialProven:false,
    actualOldCliBinaryDenialProven:false,
    writerPositiveControlProven:false,
    WindowsCrashRecoveryProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
