// D-01 Windows native fixture creation receipt validation, PURE READ ONLY.
// Receipt identifies newly minted NTFS test files; it does NOT prove the
// old/writer Windows principals were independently invoked under actual
// tokens, or that old rename rights on ProgramData ancestors are blocked.
// Provisioner accepts real user accounts only, not well-known service/
// admin-group trustees. SID validity and account type remain OS-verified.
const SID=/^S-1-5-21-(?:0|[1-9][0-9]*)-(?:0|[1-9][0-9]*)-(?:0|[1-9][0-9]*)-(?:0|[1-9][0-9]*)$/;
const NTFS_ID=/^[a-f0-9]{24}$/;
const ROOT=/^[A-Za-z]:\\(?:[A-Za-z0-9 _().+-]+\\)*vcp-win-d01-isolation-[a-f0-9]{32}$/;
const keys=new Set([
  'kind','status','root','rootIdentity',
  'withManifestIdentity','withoutManifestIdentity',
  'oldSid','writerSid','location','ntfs',
  'manifestVariants','filesCreatedOnly','selectedProjectTouched',
  'actualOldTokenTested','parentRenameDenialProven',
  'writerPositiveControlProven','namespacePowerLossDurabilityProven',
  'd01Approved','managedMutationAuthorized','cleanupAuthorized'
]);
function refuse(code){const e=new Error(code);e.code=code;throw e;}
function record(value){return value!==null&&typeof value==='object'&&
  !Array.isArray(value);}
export function validateD01WindowsDisposableFixtureReceipt(value){
  if(!record(value)||Object.keys(value).some(k=>!keys.has(k))||
     value.kind!=='D01_WINDOWS_DISPOSABLE_FIXTURE_V2'||
     value.status!=='NO_GO'||typeof value.root!=='string'||
     !ROOT.test(value.root)||
     !NTFS_ID.test(value.rootIdentity??'')||
     !NTFS_ID.test(value.withManifestIdentity??'')||
     !NTFS_ID.test(value.withoutManifestIdentity??'')||
     value.withManifestIdentity===value.withoutManifestIdentity||
     value.root.includes('..')||value.root.includes('\\\\')||
     !SID.test(value.oldSid??'')||!SID.test(value.writerSid??'')||
     value.oldSid===value.writerSid||
     value.location!=='ProgramData'||value.ntfs!==true||
     !Array.isArray(value.manifestVariants)||
     JSON.stringify(value.manifestVariants)!==
       JSON.stringify(['with-manifest','without-manifest'])||
     value.filesCreatedOnly!==true||
     value.selectedProjectTouched!==false||
     value.actualOldTokenTested!==false||
     value.parentRenameDenialProven!==false||
     value.writerPositiveControlProven!==false||
     value.namespacePowerLossDurabilityProven!==false||
     value.d01Approved!==false||
     value.managedMutationAuthorized!==false||
     value.cleanupAuthorized!==false)
    refuse('E_D01_WINDOWS_FIXTURE_RECEIPT_INVALID');
  return Object.freeze({
    kind:'D01_WINDOWS_DISPOSABLE_FIXTURE_REVIEW_V2',
    status:'NO_GO',root:value.root,
    rootIdentity:value.rootIdentity,
    withManifestIdentity:value.withManifestIdentity,
    withoutManifestIdentity:value.withoutManifestIdentity,
    oldSid:value.oldSid,
    writerSid:value.writerSid,createdOnlyFixture:true,
    externalNativeCreationUnverified:true,
    WindowsOldProcessTokenProven:false,
    WindowsDaclParentRenameExcluded:false,
    WindowsWriterPositiveControlProven:false,
    WindowsPowerLossDurabilityProven:false,
    publishedV093EntrypointsTested:false,
    safeToCleanup:false,managedMutationAuthorized:false,
    d01Approved:false
  });
}
