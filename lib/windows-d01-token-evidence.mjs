// Stage12 D-01 Windows ACL principal comparison, PURE READ ONLY.
// The kernel helper's AccessCheck observations can identify obvious open
// access but CANNOT certify real published-old-CLI exclusion, Windows
// SeRestore/SeBackup/owner privilege bypass, concurrent ACL changes or
// durable namespace guarantees. All reports ALWAYS remain NO_GO.
const SID=/^S-1-(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*)){1,15}$/;
const NTFS_ID=/^[a-f0-9]{24}$/;
const BOOLEAN=['opened','checked','write','delete','deleteChild',
  'writeDacl','writeOwner','looksSafe'];
function fail(code){
  const e=new Error(code);e.code=code;throw e;
}
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function validLabel(label){
  return label==='drive-root'||label==='project'||label==='state'||
    label==='agents'||label==='manifest'||/^ancestor-[1-9][0-9]{0,2}$/.test(label);
}
function validateObservation(o){
  if(!record(o)||Object.keys(o).some(k=>![
    'object',...BOOLEAN,'lastWin32Error'
  ].includes(k))||
  !validLabel(o.object)||
  BOOLEAN.some(k=>typeof o[k]!=='boolean')||
  !Number.isSafeInteger(o.lastWin32Error)||o.lastWin32Error<0||
  o.lastWin32Error>0xffffffff)
    fail('E_D01_WINDOWS_ACL_OBSERVATION_INVALID');
  const anyDanger=o.write||o.delete||o.deleteChild||o.writeDacl||
    o.writeOwner;
  if(o.looksSafe!==(o.opened&&o.checked&&!anyDanger)||
     (!o.opened&&(o.checked||o.looksSafe))||
     (o.checked&&o.lastWin32Error!==0))
    fail('E_D01_WINDOWS_ACL_OBSERVATION_INCONSISTENT');
  return Object.freeze({...o});
}
export function validateWindowsD01ReadOnlyReceipt(value){
  if(!record(value)||Object.keys(value).some(k=>![
    'kind','status','platform','nativeWindows','productionProject',
    'managedMutationAuthorized','publishedLegacyCliTested',
    'nativePowerLossAttested','D01Approved','principalSid','projectVariant',
    'rootIdentity','projectIdentity',
    'observations','accessCheckOnly',
    'oldPrincipalActualMutationDenialUnproven'
  ].includes(k))||
  value.kind!=='D01_WINDOWS_TOKEN_ACL_READONLY_V2'||
  value.status!=='NO_GO'||value.platform!=='win32'||
  value.nativeWindows!==true||value.productionProject!==false||
  value.managedMutationAuthorized!==false||
  value.publishedLegacyCliTested!==false||
  value.nativePowerLossAttested!==false||value.D01Approved!==false||
  !SID.test(value.principalSid??'')||
  !NTFS_ID.test(value.rootIdentity??'')||
  !NTFS_ID.test(value.projectIdentity??'')||
  !['with-manifest','without-manifest'].includes(value.projectVariant)||
  !Array.isArray(value.observations)||
  value.observations.length<5||value.observations.length>36||
  value.accessCheckOnly!==true||
  value.oldPrincipalActualMutationDenialUnproven!==true)
    fail('E_D01_WINDOWS_ACL_RECEIPT_INVALID');
  const seen=new Set(),items=[];
  for(const input of value.observations){
    const obs=validateObservation(input);
    if(seen.has(obs.object))
      fail('E_D01_WINDOWS_ACL_DUPLICATE');
    seen.add(obs.object);
    items.push(obs);
  }
  for(const key of ['drive-root','project','state','agents']){
    if(!seen.has(key))fail('E_D01_WINDOWS_ACL_INCOMPLETE');
  }
  if((value.projectVariant==='with-manifest')!==seen.has('manifest'))
    fail('E_D01_WINDOWS_ACL_MANIFEST_MISMATCH');
  const ancestors=items.filter(o=>o.object.startsWith('ancestor-'));
  if(ancestors.length<1||ancestors.length>30)
    fail('E_D01_WINDOWS_ACL_INCOMPLETE');
  for(let i=1;i<=ancestors.length;i++){
    if(!seen.has('ancestor-'+i))
      fail('E_D01_WINDOWS_ACL_INCOMPLETE');
  }
  const onlyReadOnlyProof=items.every(o=>o.checked&&o.looksSafe);
  return Object.freeze({
    kind:'D01_WINDOWS_ACL_ASSESSMENT_V1',
    status:'NO_GO',projectVariant:value.projectVariant,
    principalSid:value.principalSid,
    rootIdentity:value.rootIdentity,projectIdentity:value.projectIdentity,
    observations:Object.freeze(items),
    completeReadOnlyAclSnapshot:onlyReadOnlyProof,
    publishedV093KernelDenialProven:false,
    oldProcessTokenAttestedIndependently:false,
    tokenPrivilegesFullyProven:false,
    parentRenameAtomicallyExcluded:false,
    daclAndOwnerPinnedAcrossOperations:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
export function assessWindowsD01DualPrincipal({
  oldPrincipalReceipt,writerPrincipalReceipt
}={}){
  const old=validateWindowsD01ReadOnlyReceipt(oldPrincipalReceipt);
  const writer=validateWindowsD01ReadOnlyReceipt(writerPrincipalReceipt);
  if(old.projectVariant!==writer.projectVariant)
    fail('E_D01_WINDOWS_ACL_VARIANT_MISMATCH');
  if(old.principalSid===writer.principalSid)
    fail('E_D01_WINDOWS_ACL_SAME_PRINCIPAL');
  if(old.rootIdentity!==writer.rootIdentity)
    fail('E_D01_WINDOWS_ACL_ROOT_IDENTITY_MISMATCH');
  if(old.projectIdentity!==writer.projectIdentity)
    fail('E_D01_WINDOWS_ACL_PROJECT_IDENTITY_MISMATCH');
  const oldPaths=old.observations.map(x=>x.object).sort();
  const writerPaths=writer.observations.map(x=>x.object).sort();
  if(JSON.stringify(oldPaths)!==JSON.stringify(writerPaths))
    fail('E_D01_WINDOWS_ACL_COVERAGE_MISMATCH');
  const writerHasFileWrite=writer.observations.some(o=>
    o.object==='agents'&&o.checked&&o.write);
  // Do NOT infer that no recorded AccessCheck grant equals an actual
  // denial to a published CLI running concurrently on a different token.
  return Object.freeze({
    kind:'D01_WINDOWS_DUAL_PRINCIPAL_REVIEW_V1',
    status:'NO_GO',
    projectVariant:old.projectVariant,
    rootIdentity:old.rootIdentity,projectIdentity:old.projectIdentity,
    principalsDifferent:true,
    oldReadOnlyAclSnapshot:old.completeReadOnlyAclSnapshot,
    writerWriteCapabilityObserved:writerHasFileWrite,
    actualOldCliKernelDenialProven:false,
    independentlyProvisionedWindowsTokensProven:false,
    nativeAclAtomicityProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false,
    requiredNext:'Independent real-token old 0.9.3 adversarial denial matrix, actual preserved bytes, concurrency, crash, ACL/owner recheck, owner D-01 approval'
  });
}
