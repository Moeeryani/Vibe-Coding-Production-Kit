// Stage12 D-01 security boundary assessment. Pure, read-only, no writes.
// The unchanged registry-published 0.9.3 CLI does NOT call this module.
// A result of CANDIDATE is never permission to enable v2 mutations.
const OPERATIONS=Object.freeze([
  'init-present-manifest','init-missing-manifest','init-corrupt-manifest',
  'update','manage','rollback','rollback-stale-backup',
  'old-new-race','post-backup-user-edits'
]);
const SYSTEMS=Object.freeze(['linux','win32']);
const SHA256=/^[a-f0-9]{64}$/;
const APPROVED_POLICY_TYPES=Object.freeze({
  linux:['SELINUX_MANDATORY_CONFINEMENT','APPARMOR_MANDATORY_CONFINEMENT'],
  win32:['WDAC_SIGNER_ENFORCEMENT','APPLOCKER_ENFORCED_POLICY']
});
// These records are *claims* that must be checked against independent raw
// evidence by a different security principal. This parser is never a
// replacement for the native test harness or maintainer authorization.
function validDenialReceipt(receipt,oldCliSha) {
  return receipt!==null&&typeof receipt==='object'&&
    !Array.isArray(receipt)&&receipt.exitCode!==0&&
    Number.isSafeInteger(receipt.exitCode)&&
    receipt.denialOrigin==='OS_MANDATORY_POLICY'&&
    SHA256.test(receipt.beforeTreeSha256??'')&&
    receipt.afterTreeSha256===receipt.beforeTreeSha256&&
    SHA256.test(receipt.rawLogSha256??'')&&
    receipt.oldCliArchiveSha256===oldCliSha&&
    nonempty(receipt.independentReviewerId);
}
function nonempty(value) {
  return typeof value==='string'&&value.length>0&&value.length<=256;
}
export function assessD01EnforcedIsolation(proof={}) {
  const defects=[];
  if(proof?.securityBoundary!=='OS_ENFORCED_SEPARATE_PRINCIPALS')
    defects.push('NO_ENFORCED_OS_PRINCIPAL_BOUNDARY');
  if(!nonempty(proof?.legacyPrincipal)||!nonempty(proof?.newWriterPrincipal)||
    proof.legacyPrincipal===proof.newWriterPrincipal)
    defects.push('SHARED_OR_UNKNOWN_WRITER_IDENTITY');
  if(proof?.oldCliArchiveAuthenticated!==true||
    !SHA256.test(proof?.oldCliArchiveSha256??''))
    defects.push('UNAUTHENTICATED_PUBLISHED_0_9_3');
  if(!nonempty(proof?.selectedRootIdentity)||proof?.sameRootAfterTransition!==true)
    defects.push('UNPROVEN_SELECTED_ROOT_IDENTITY');
  // Observations are scenario names, not source-level assertions. One missing
  // case is a NO-GO; the evaluator never trusts a CLI-generated opt-in flag.
  for(const platform of SYSTEMS) {
    const scope=proof?.platformProof?.[platform];
    if(scope?.nativePlatform!==true||
      !nonempty(scope?.filesystem)||scope?.sameSecurityScope!==true) {
      defects.push('UNPROVEN_PLATFORM_SCOPE_'+platform.toUpperCase());
      continue;
    }
    if(!APPROVED_POLICY_TYPES[platform].includes(scope.mandatoryPolicyType)||
       !SHA256.test(scope.policyArtifactSha256??'')||
       scope.policyEffectiveForPrivilegedOldBinary!==true) {
      defects.push('MANDATORY_POLICY_UNPROVEN_'+platform.toUpperCase());
    }
    for(const operation of OPERATIONS) {
      if(scope?.observedDenied?.[operation]!==true||
        !validDenialReceipt(scope?.denialReceipts?.[operation],
          proof.oldCliArchiveSha256)) {
        defects.push('NO_NATIVE_DENIAL_'+platform.toUpperCase()+'_'+operation);
      }
    }
    if(scope?.allUserBytesUnchanged!==true)
      defects.push('USER_BYTES_NOT_PROVEN_'+platform.toUpperCase());
    if(scope?.outsiderBytesUnchanged!==true)
      defects.push('OUTSIDER_BYTES_NOT_PROVEN_'+platform.toUpperCase());
  }
  // A privileged old process can still be invoked as the new principal;
  // absence of a mandatory OS-enforced executable restriction is not proof.
  if(proof?.denyLegacyExecutableUnderWriterPrincipal!==true)
    defects.push('PRIVILEGED_LEGACY_BINARY_NOT_BLOCKED');
  if(proof?.independentRawReceiptsAvailable!==true)
    defects.push('INDEPENDENT_RAW_RECEIPTS_MISSING');
  return Object.freeze({
    status:defects.length?'NO_GO':'CANDIDATE_REQUIRES_INDEPENDENT_D01_APPROVAL',
    gate:'NO_GO',mutationAuthorized:false,approved:false,
    platformScope:[...SYSTEMS],operationScope:[...OPERATIONS],
    defects:Object.freeze(defects)
  });
}
