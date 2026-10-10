// Stage12 D-01 security boundary assessment. Pure, read-only, no writes.
// The unchanged registry-published 0.9.3 CLI does NOT call this module.
// A result of CANDIDATE is never permission to enable v2 mutations.
const OPERATIONS=Object.freeze([
  'init-present-manifest','init-missing-manifest','init-corrupt-manifest',
  'update','manage','rollback','rollback-stale-backup',
  'old-new-race','post-backup-user-edits'
]);
const SYSTEMS=Object.freeze(['linux','win32']);
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
  if(proof?.oldCliArchiveAuthenticated!==true)
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
    for(const operation of OPERATIONS) {
      if(scope?.observedDenied?.[operation]!==true)
        defects.push('NO_NATIVE_DENIAL_'+platform.toUpperCase()+'_'+operation);
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
