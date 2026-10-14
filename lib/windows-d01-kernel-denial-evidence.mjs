// Read-only classification of the bounded native old-token NTFS witness.
// Even an actual SCRATCH kernel denial is not published 0.9.3 exclusion.
// Never replay, rollback, delete or open production schema v2 writes.
const ID=/^[a-f0-9]{24}$/;
const fields=['kind','status','variant','rootIdentity','projectIdentity',
  'oldTokenSidMatched','dangerousOpenRightsAllDenied',
  'actualCreateAttempted','actualCreateSucceeded','actualCreateWin32Error',
  'actualRenameAttempted','actualRenameSucceeded','actualRenameWin32Error',
  'protectedBytesUnchanged','noUnexpectedNewEntries',
  'ntfsIdentitiesPreserved','kernelFixtureDenialObserved',
  'publishedLegacyCliTested','productionMutationAuthorized',
  'WindowsNamespaceDurabilityProven','d01Approved'];
const bools=fields.filter(x=>[
  'oldTokenSidMatched','dangerousOpenRightsAllDenied',
  'actualCreateAttempted','actualCreateSucceeded','actualRenameAttempted',
  'actualRenameSucceeded','protectedBytesUnchanged',
  'noUnexpectedNewEntries','ntfsIdentitiesPreserved',
  'kernelFixtureDenialObserved','publishedLegacyCliTested',
  'productionMutationAuthorized','WindowsNamespaceDurabilityProven',
  'd01Approved'].includes(x));
function refuse(code){const e=new Error(code);e.code=code;throw e;}
export function reviewWindowsD01KernelDenialReceipt(value,{
  variant,rootIdentity,projectIdentity
}={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).some(k=>!fields.includes(k))||
     fields.some(k=>!Object.hasOwn(value,k))||
     value.kind!=='D01_WINDOWS_OLD_TOKEN_KERNEL_DENIAL_V1'||
     value.status!=='NO_GO'||
     !['with-manifest','without-manifest'].includes(value.variant)||
     !ID.test(value.rootIdentity??'')||
     !ID.test(value.projectIdentity??'')||
     bools.some(k=>typeof value[k]!=='boolean')||
     ![value.actualCreateWin32Error,value.actualRenameWin32Error]
       .every(n=>Number.isSafeInteger(n)&&n>=0&&n<=0xffffffff)||
     value.oldTokenSidMatched!==true||
     value.publishedLegacyCliTested!==false||
     value.productionMutationAuthorized!==false||
     value.WindowsNamespaceDurabilityProven!==false||
     value.d01Approved!==false)
    refuse('E_D01_WINDOWS_KERNEL_RECEIPT_INVALID');
  if(variant!==undefined&&value.variant!==variant||
     rootIdentity!==undefined&&value.rootIdentity!==rootIdentity||
     projectIdentity!==undefined&&value.projectIdentity!==projectIdentity)
    refuse('E_D01_WINDOWS_KERNEL_FIXTURE_IDENTITY_MISMATCH');
  const denial=value.dangerousOpenRightsAllDenied&&
    value.actualCreateAttempted&&!value.actualCreateSucceeded&&
    value.actualCreateWin32Error===5&&
    value.actualRenameAttempted&&!value.actualRenameSucceeded&&
    value.actualRenameWin32Error===5&&
    value.protectedBytesUnchanged&&value.noUnexpectedNewEntries&&
    value.ntfsIdentitiesPreserved;
  if(value.kernelFixtureDenialObserved!==Boolean(denial)||
     (value.actualCreateSucceeded&&value.actualCreateWin32Error!==0)||
     (value.actualRenameSucceeded&&value.actualRenameWin32Error!==0)||
     (!value.actualCreateAttempted&&
       (value.actualCreateSucceeded||value.actualCreateWin32Error!==0))||
     (!value.actualRenameAttempted&&
       (value.actualRenameSucceeded||value.actualRenameWin32Error!==0))||
     (value.actualRenameAttempted&&!value.actualCreateAttempted)||
     (value.actualRenameAttempted&&
       (value.actualCreateSucceeded||value.actualCreateWin32Error!==5)))
    refuse('E_D01_WINDOWS_KERNEL_RECEIPT_INCONSISTENT');
  return Object.freeze({
    kind:'D01_WINDOWS_KERNEL_WITNESS_REVIEW_V1',
    status:'NO_GO',variant:value.variant,
    rootIdentity:value.rootIdentity,projectIdentity:value.projectIdentity,
    kernelScratchAccessDenialObserved:denial,
    actualOldTokenAttempted: true,
    sourceAndBinaryIdentityIndependentlyVerified:false,
    publishedV093LifecycleWritePathReached:false,
    publishedV093MutationDeniedProven:false,
    parentNamespaceAtomicConfinementProven:false,
    WindowsNamespaceDurabilityProven:false,
    safeToRetry:false,safeToDelete:false,safeToRollback:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
