// Stage12/13 Windows scratch forensic classification, PURE READ ONLY.
//
// A FILE ID + length observation is neither a content hash nor an NTFS
// power-loss proof. The helper may have exited after mutation or after only
// part of a write. No classification from this file may trigger a retry,
// rollback, cleanup, or production lifecycle operation.
const ID=/^[0-9a-f]{24}$/;
const DIGITS=/^(?:0|[1-9][0-9]{0,19})$/;
const OPS=new Set([
  'write-exclusive','rename-no-replace','unlink',
  'mkdir-exclusive','rmdir-empty'
]);
function refuse(code){
  const e=new Error(code);e.code=code;throw e;
}
function observation(value){
  // Accept either the nested entry from a validated inspect-entry receipt
  // or the receipt itself. The caller must supply observations associated
  // with the SAME scratch fixture; this cannot independently prove them.
  if(value?.kind==='VCP_WINDOWS_SCRATCH_NAMESPACE_CANDIDATE'){
    if(value.protocolVersion!==3||value.operation!=='inspect-entry'||
       value.completed!==true||value.fileFlushReturned!==false||
       value.directoryFlushReturned!==false||
       value.mayHaveMutated!==false||
       value.lastWin32Error!==0||
       value.managedMutationAuthorized!==false||
       value.directoryDurabilityProven!==false||
       value.powerLossAttested!==false)
      refuse('E_WINDOWS_RECOVERY_OBSERVATION_INVALID');
    value=value.entry;
  }
  if(!value||typeof value!=='object'||Array.isArray(value)||
     typeof value.exists!=='boolean'||typeof value.kind!=='string'||
     typeof value.identity!=='string'||typeof value.sizeBytes!=='string')
    refuse('E_WINDOWS_RECOVERY_OBSERVATION_INVALID');
  if(!value.exists){
    if(value.kind!=='ABSENT'||value.identity!==''||value.sizeBytes!=='0')
      refuse('E_WINDOWS_RECOVERY_OBSERVATION_INVALID');
  }else if(!['REGULAR','DIRECTORY'].includes(value.kind)||
           !ID.test(value.identity)||!DIGITS.test(value.sizeBytes)||
           BigInt(value.sizeBytes)>18446744073709551615n)
    refuse('E_WINDOWS_RECOVERY_OBSERVATION_INVALID');
  return Object.freeze({
    exists:value.exists,kind:value.kind,identity:value.identity,
    sizeBytes:value.sizeBytes
  });
}
function identical(a,b){
  return a.exists===b.exists && a.kind===b.kind &&
    a.identity===b.identity&&a.sizeBytes===b.sizeBytes;
}
function apparentTransition(op,before,after){
  const src=before.source,next=after.source;
  const dst=before.destination,destination=after.destination;
  if(op==='rename-no-replace'){
    if(!dst||!destination)refuse('E_WINDOWS_RECOVERY_PAIR_REQUIRED');
    if(src.exists&&src.kind==='REGULAR'&&!dst.exists&&
       !next.exists&&destination.exists&&
       destination.kind==='REGULAR'&&
       destination.identity===src.identity&&
       destination.sizeBytes===src.sizeBytes)
      return 'OBSERVED_RENAMED_SAME_FILE_ID';
    if(identical(src,next)&&identical(dst,destination))
      return 'OBSERVED_NO_VISIBLE_CHANGE';
    return 'INDETERMINATE_RENAME';
  }
  if(op==='write-exclusive'||op==='mkdir-exclusive'){
    if(!src.exists&&next.exists&&
       next.kind===(op==='write-exclusive'?'REGULAR':'DIRECTORY'))
      return 'OBSERVED_NEW_ENTRY_CONTENT_UNVERIFIED';
    return identical(src,next)?'OBSERVED_NO_VISIBLE_CHANGE':
      'INDETERMINATE_CREATION';
  }
  if(op==='unlink'||op==='rmdir-empty'){
    if(src.exists&&
       src.kind===(op==='unlink'?'REGULAR':'DIRECTORY')&&
       !next.exists)
      return 'OBSERVED_NAME_ABSENT';
    return identical(src,next)?'OBSERVED_NO_VISIBLE_CHANGE':
      'INDETERMINATE_DELETION';
  }
  refuse('E_WINDOWS_RECOVERY_OPERATION_UNSUPPORTED');
}
export function assessWindowsScratchRecovery({
  operation,before,after,nativeOutcomeUnknown=false
}={}){
  if(!OPS.has(operation))refuse('E_WINDOWS_RECOVERY_OPERATION_UNSUPPORTED');
  if(typeof nativeOutcomeUnknown!=='boolean')
    refuse('E_WINDOWS_RECOVERY_OUTCOME_INVALID');
  const sourceBefore=observation(before?.source);
  const sourceAfter=observation(after?.source);
  let destinationBefore=null,destinationAfter=null;
  if(operation==='rename-no-replace'){
    destinationBefore=observation(before?.destination);
    destinationAfter=observation(after?.destination);
  }else if(before?.destination!==undefined||after?.destination!==undefined){
    refuse('E_WINDOWS_RECOVERY_UNEXPECTED_DESTINATION');
  }
  const assessment=apparentTransition(operation,{
    source:sourceBefore,destination:destinationBefore
  },{
    source:sourceAfter,destination:destinationAfter
  });
  // Immutable, explicit refusal objects prevent callers from treating a
  // readable observation as a "resume" approval.
  return Object.freeze({
    status:'NO_GO',
    operation,assessment,nativeOutcomeUnknown,
    readOnly:true,managedMutationAuthorized:false,
    directoryDurabilityProven:false,powerLossSurvivalProven:false,
    safeToRetry:false,safeToRollback:false,safeToDelete:false,
    independentRecoveryAcceptanceRequired:true,
    before:Object.freeze({source:sourceBefore,destination:destinationBefore}),
    after:Object.freeze({source:sourceAfter,destination:destinationAfter})
  });
}
