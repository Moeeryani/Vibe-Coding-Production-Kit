// Stage12 native Windows durability evidence contract, READ-ONLY.
// No JavaScript fsync workaround can prove NTFS namespace persistence.
// Even a diagnostic returning all true does not approve managed writes.
const STEPS=Object.freeze([
  'create','file-flush','rename-write-through','directory-sync',
  'owned-unlink','owned-rmdir','no-replace-collision',
  'journal-replay','lock-release'
]);
export function assessWindowsDurabilityEvidence(evidence={}) {
  const defects=[];
  if(evidence.platform!=='win32'||evidence.filesystem!=='NTFS'||
     evidence.nativeWindows!==true)defects.push('E_NATIVE_NTFS_REQUIRED');
  if(evidence.disposableFixture!==true)defects.push('E_DISPOSABLE_FIXTURE_REQUIRED');
  if(evidence.publishedImplementationHashVerified!==true)
    defects.push('E_NATIVE_PROVIDER_IDENTITY_UNPROVEN');
  if(evidence.fileFlushReturned!==true)defects.push('E_FILE_FLUSH_UNPROVEN');
  if(evidence.moveWriteThroughReturned!==true)
    defects.push('E_NAMESPACE_MOVE_UNPROVEN');
  if(evidence.parentMetadataPersisted!==true)
    defects.push('E_PARENT_METADATA_PERSISTENCE_UNPROVEN');
  if(evidence.realPowerInterruptionReplayed!==true)
    defects.push('E_REAL_POWER_LOSS_UNVERIFIED');
  if(evidence.userBytesUntouched!==true||evidence.foreignBytesUntouched!==true)
    defects.push('E_USER_BYTES_UNPROVEN');
  for(const phase of STEPS) {
    if(evidence.scenarios?.[phase]!==true)
      defects.push('E_NATIVE_PHASE_UNPROVEN_'+phase);
  }
  return Object.freeze({
    status:defects.length?'NO_GO':'NATIVE_PROVIDER_REVIEW_CANDIDATE',
    platform:'win32',requiredFilesystem:'NTFS',
    mutationAuthorized:false,directoryDurabilityProven:false,
    nativeIndependentAcceptanceRequired:true,
    defects:Object.freeze(defects)
  });
}
