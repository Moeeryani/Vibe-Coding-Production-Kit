// Read-only D01 native NTFS inventory envelope correlation. Even two
// matching reports from the same helper are unsigned and non-atomic.
// Never interpret a stable tree as proof that published old CLI was denied.
import {validateD01WindowsDisposableFixtureReceipt}
  from './windows-d01-fixture-evidence.mjs';
import {
  compareWindowsD01NamespaceInventories,
  validateWindowsD01NativeNamespaceInventory
} from './windows-d01-namespace-inventory-evidence.mjs';

const HASH64=/^[0-9a-f]{64}$/;
function refuse(code){const e=new Error(code);e.code=code;throw e;}
function verifyEnvelope(envelope,fixture,variant,projectIdentity){
  if(!envelope||typeof envelope!=='object'||Array.isArray(envelope)||
     envelope.kind!=='D01_WINDOWS_NAMESPACE_INVENTORY_ENVELOPE_V1'||
     envelope.status!=='NO_GO'||
     envelope.fixtureRoot!==fixture.root||
     !HASH64.test(envelope.sourceSha256??'')||
     !HASH64.test(envelope.executableSha256??'')||
     envelope.executablePinningIndependentlyAttested!==false||
     envelope.namespaceSnapshotAtomic!==false||
     envelope.oldCliExecutionProven!==false||
     envelope.WindowsNamespaceDurabilityProven!==false||
     envelope.managedMutationAuthorized!==false||
     envelope.d01Approved!==false||
     envelope.review?.kind!==
       'D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_REVIEW_V1'||
     envelope.review?.status!=='NO_GO'||
     envelope.review?.managedMutationAuthorized!==false||
     envelope.review?.d01Approved!==false||
     envelope.nativeReceipt?.status!=='NO_GO'||
     envelope.nativeReceipt?.variant!==variant||
     envelope.nativeReceipt?.rootIdentity!==fixture.rootIdentity||
     envelope.nativeReceipt?.projectIdentity!==projectIdentity||
     envelope.review?.rootIdentity!==fixture.rootIdentity||
     envelope.review?.projectIdentity!==projectIdentity||
     envelope.review?.variant!==variant)
    refuse('E_D01_WINDOWS_INVENTORY_ENVELOPE_INVALID');
  // The original native receipt and the separately embedded JS review
  // must describe precisely the same bounded V2 tree, byte hashes,
  // metadata fingerprints, entry count and claimed non-approval flags.
  // A hand-edited review with omitted/forged fields is never evidence.
  const validated=validateWindowsD01NativeNamespaceInventory(
    envelope.nativeReceipt,{
      variant,rootIdentity:fixture.rootIdentity,projectIdentity
    });
  if(JSON.stringify(validated)!==JSON.stringify(envelope.review))
    refuse('E_D01_WINDOWS_INVENTORY_REVIEW_RECEIPT_CONFLICT');
  return envelope;
}
export function compareWindowsD01NamespaceInventoryEnvelopes({
  fixtureReceipt,variant,beforeEnvelope,afterEnvelope
}={}){
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureReceipt);
  if(!['with-manifest','without-manifest'].includes(variant))
    refuse('E_D01_WINDOWS_INVENTORY_VARIANT_INVALID');
  const projectIdentity=variant==='with-manifest'?
    fixture.withManifestIdentity:fixture.withoutManifestIdentity;
  const before=verifyEnvelope(beforeEnvelope,fixture,variant,projectIdentity);
  const after=verifyEnvelope(afterEnvelope,fixture,variant,projectIdentity);
  if(before.sourceSha256!==after.sourceSha256||
     before.executableSha256!==after.executableSha256)
    refuse('E_D01_WINDOWS_INVENTORY_EXECUTABLE_CHANGED');
  const diff=compareWindowsD01NamespaceInventories({
    before:before.nativeReceipt,after:after.nativeReceipt,
    variant,rootIdentity:fixture.rootIdentity,projectIdentity
  });
  return Object.freeze({
    ...diff,
    fixtureRoot:fixture.root,
    sameNativeSourceAndBinaryHashReported:true,
    reportedNativeSourceSha256:before.sourceSha256,
    reportedNativeExecutableSha256:before.executableSha256,
    nativeBinaryActuallyPinnedDuringScanProven:false,
    externalObservationSignaturesVerified:false,
    nativeNetworkIsolationVerified:false,
    oldPublishedCliWriterDeniedProven:false,
    status:'NO_GO',managedMutationAuthorized:false,d01Approved:false
  });
}
