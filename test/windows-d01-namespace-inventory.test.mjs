// Stage12 D01 Windows native namespace inventory portable contracts.
// No Windows root, account, ProgramData folder, CLI or native EXE touched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {MANAGED_SCHEMA_MIGRATION_GATE}
  from '../lib/managed-migration.mjs';
import {compareWindowsD01NamespaceInventoryEnvelopes}
  from '../lib/windows-d01-namespace-inventory-comparison.mjs';
import {
  validateWindowsD01NativeNamespaceInventory,
  compareWindowsD01NamespaceInventories
} from '../lib/windows-d01-namespace-inventory-evidence.mjs';

const pathId=(n)=>n.toString(16).padStart(24,'0');
const dir=(p,n)=>({path:p,type:'directory',identity:pathId(n),
  sha256:null,size:0,attributes:0x10,securitySha256:'c'.repeat(64)});
const file=(p,n,h,size)=>({path:p,type:'file',
  identity:pathId(n),sha256:h.repeat(64),size,
  attributes:0x20,securitySha256:'d'.repeat(64)});
function inventory(variant='with-manifest',entries){
  const fixtureEntries=entries??(variant==='with-manifest'?[
    dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
    file('AGENTS.md',3,'a',41)
  ]:[dir('.vcp',1),file('AGENTS.md',3,'a',41)]);
  return {kind:'D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V2',
    status:'NO_GO',variant,
    rootIdentity:pathId(91),projectIdentity:pathId(92),
    rootAttributes:0x10,projectAttributes:0x10,
    rootSecuritySha256:'e'.repeat(64),
    projectSecuritySha256:'f'.repeat(64),
    entries:fixtureEntries,entryCount:fixtureEntries.length,
    fileBytesHashed:fixtureEntries.reduce((n,x)=>n+x.size,0),
    maxEntries:512,maxDepth:10,
    maxSingleFileBytes:131072,maxTotalFileBytes:2097152,
    readOnly:true,sharesDelete:true,
    reparseEntriesRejected:true,hardlinkedFilesRejected:true,
    alternateDataStreamsRejected:true,
    ownerGroupDaclFingerprintMeasured:true,
    namespaceSnapshotAtomic:false,
    publishedOldCliExecutionProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false
  };
}

test('exact initial native tree is reviewable but never proves D01 approval',()=>{
  const report=validateWindowsD01NativeNamespaceInventory(inventory(),{
    variant:'with-manifest',
    rootIdentity:pathId(91),projectIdentity:pathId(92)
  });
  assert.equal(report.status,'NO_GO');
  assert.equal(report.entryCount,3);
  assert.equal(report.fileBytesHashed,63);
  assert.equal(report.atomicNamespaceViewProven,false);
  assert.equal(report.privilegedOldCliDeniedProven,false);
  assert.equal(report.safeToDelete,false);
  assert.equal(report.managedMutationAuthorized,false);
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
  const compared=compareWindowsD01NamespaceInventories({
    before:inventory(),after:inventory()
  });
  assert.equal(compared.namespaceUnchangedObserved,true);
  assert.deepEqual(compared.createdPaths,[]);
  assert.equal(compared.transientMutationsBetweenCapturesRuledOut,false);
  assert.equal(compared.WindowsNamespaceDurabilityProven,false);
});

test('deleted AGENTS and manifest are reported instead of rejecting the AFTER snapshot',()=>{
  const before=inventory();
  const after=inventory('with-manifest',[dir('.vcp',1)]);
  const reviewed=compareWindowsD01NamespaceInventories({before,after});
  assert.equal(reviewed.namespaceUnchangedObserved,false);
  assert.deepEqual(reviewed.removedPaths,['.vcp/manifest.json','AGENTS.md']);
  assert.equal(reviewed.publishedOldCliWritePathDeniedProven,false);
});

test('new manifest in previously missing-manifest fixture is reported as creation',()=>{
  const before=inventory('without-manifest');
  const after=inventory('without-manifest',[
    dir('.vcp',1),file('.vcp/manifest.json',7,'d',24),
    file('AGENTS.md',3,'a',41)]);
  const reviewed=compareWindowsD01NamespaceInventories({before,after});
  assert.deepEqual(reviewed.createdPaths,['.vcp/manifest.json']);
  assert.equal(reviewed.namespaceUnchangedObserved,false);
});

test('byte-identical replacement file and changed bytes are both tracked',()=>{
  const before=inventory();
  const after=inventory('with-manifest',[
    dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
    file('AGENTS.md',4,'a',41)]);
  const comparison=compareWindowsD01NamespaceInventories({before,after});
  assert.deepEqual(comparison.alteredPaths,['AGENTS.md']);
  assert.equal(comparison.namespaceUnchangedObserved,false);
  const changed=inventory('with-manifest',[
    dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
    file('AGENTS.md',3,'f',41)]);
  assert.deepEqual(compareWindowsD01NamespaceInventories({
    before,after:changed
  }).alteredPaths,['AGENTS.md']);
});

test('malicious, missing-parent, duplicate-name, hardlink and oversized receipt fields refuse',()=>{
  const seed=inventory();
  const invalid=[
    {status:'GO'},{d01Approved:true},
    {kind:'D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V1'},
    {managedMutationAuthorized:true},
    {publishedOldCliExecutionProven:true},
    {namespaceSnapshotAtomic:true},
    {WindowsNamespaceDurabilityProven:true},
    {readOnly:false},{sharesDelete:false},
    {reparseEntriesRejected:false},
    {hardlinkedFilesRejected:false},
    {alternateDataStreamsRejected:false},
    {ownerGroupDaclFingerprintMeasured:false},
    {rootSecuritySha256:'INVALID'},
    {rootAttributes:0x400},
    {projectAttributes:0},
    {maxEntries:999},{entryCount:999},
    {fileBytesHashed:999},
    {entries:[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      file('../AGENTS.md',3,'a',41)]},
    {entries:[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      file('A\\x',3,'a',41)]},
    {entries:[file('.vcp/manifest.json',2,'b',22),
      dir('.vcp',1),file('AGENTS.md',3,'a',41)]},
    {entries:[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      file('AGENTS.md',2,'a',41)]},
    {entries:[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      file('AGENTS.md',3,'a',131073)]},
    {entries:[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      {...file('AGENTS.md',3,'a',41),securitySha256:'INVALID'}]},
    {entries:[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      {...file('AGENTS.md',3,'a',41),attributes:0x410}]},
    {unexpectedField:true}
  ];
  for(const change of invalid){
    assert.throws(()=>validateWindowsD01NativeNamespaceInventory({
      ...seed,...change
    }),e=>/^E_D01_WINDOWS_INVENTORY_/.test(e.code));
  }
  const duplicateCase=inventory('without-manifest',[
    dir('.vcp',1),file('AGENTS.md',3,'a',41),
    file('agents.md',4,'a',41)]);
  assert.throws(()=>validateWindowsD01NativeNamespaceInventory(
    duplicateCase),{code:'E_D01_WINDOWS_INVENTORY_DUPLICATE'});
});

test('bad initial protected baseline and another NTFS project identity refuse a diff',()=>{
  assert.throws(()=>compareWindowsD01NamespaceInventories({
    before:inventory('with-manifest',[dir('.vcp',1)]),
    after:inventory()
  }),{code:'E_D01_WINDOWS_INVENTORY_BAD_BASELINE'});
  assert.throws(()=>compareWindowsD01NamespaceInventories({
    before:inventory(),after:{...inventory(),projectIdentity:pathId(44)}
  }),{code:'E_D01_WINDOWS_INVENTORY_CROSS_FIXTURE'});
  assert.throws(()=>validateWindowsD01NativeNamespaceInventory(inventory(),{
    rootIdentity:pathId(8)
  }),{code:'E_D01_WINDOWS_INVENTORY_FIXTURE_MISMATCH'});
});

test('native source has hard data limits and never introduces filesystem mutation APIs',async()=>{
  const source=await readFile(
    'scripts/native/vcp-windows-d01-namespace-inventory.cpp','utf8');
  const build=await readFile(
    'scripts/build-windows-d01-namespace-inventory.mjs','utf8');
  const wrapper=await readFile(
    'scripts/inspect-windows-d01-namespace-inventory.mjs','utf8');
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  for(const required of [
    /FOLDERID_ProgramData/,/VCP-D01-READONLY-DISPOSABLE\.marker/,
    /FILE_SHARE_READ\|FILE_SHARE_WRITE\|FILE_SHARE_DELETE/,
    /FILE_LIMIT=131072/,/TOTAL_LIMIT=2097152/,
    /ENTRY_LIMIT=512/,/DEPTH_LIMIT=10/,
    /FILE_ATTRIBUTE_REPARSE_POINT/,/nNumberOfLinks!=1/,
    /BCryptHashData/,/FILE_READ_DATA/,/FindFirstFileW/,
    /GetFileInformationByHandleEx/,/FileStreamInfo/,
    /NextEntryOffset==0/,/StreamNameLength==bytes/,
    /GetSecurityInfo/,/ConvertSecurityDescriptorToStringSecurityDescriptorW/,
    /OWNER_SECURITY_INFORMATION/,/GROUP_SECURITY_INFORMATION/,
    /DACL_SECURITY_INFORMATION/,/READ_CONTROL/,/LocalFree\(canonical\)/,
    /D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V2/,
    /FindNextFileW/,/status.*NO_GO|NO_GO/
  ])assert.match(source,required);
  for(const forbidden of [
    /\bWriteFile\s*\(/,/\bCreateDirectoryW\s*\(/,
    /\bMoveFileExW\s*\(/,/\bDeleteFileW\s*\(/,
    /\bSetFileInformationByHandle\s*\(/,/\bSetNamedSecurityInfoW\s*\(/,
    /\bCREATE_NEW\b/,/\bTRUNCATE_EXISTING\b/,
    /\bMOVEFILE_REPLACE_EXISTING\b/
  ])assert.doesNotMatch(source,forbidden);
  assert.match(build,/\/WX/);
  assert.match(build,/\/Brepro/);
  assert.match(build,/Bcrypt\.lib/);
  assert.match(build,/verifiedRepeatBuild/);
  assert.match(wrapper,/validateWindowsD01NativeNamespaceInventory\(native/);
  assert.match(wrapper,/E_D01_WINDOWS_INVENTORY_SHA_MISMATCH/);
  assert.match(wrapper,/process\.exitCode=3/);
  assert.equal(pkg.files.includes('build/'),false);
  assert.equal(pkg.scripts[
    'inspect:d01-windows-namespace-inventory'
  ],'node scripts/inspect-windows-d01-namespace-inventory.mjs');
  if(process.platform!=='win32'){
    const run=spawnSync(process.execPath,[
      'scripts/inspect-windows-d01-namespace-inventory.mjs'
    ],{shell:false,encoding:'utf8'});
    assert.equal(run.status,2);
    assert.match(run.stderr,/E_D01_WINDOWS_INVENTORY_USAGE/);
  }
});


const fixtureReceipt={
  kind:'D01_WINDOWS_DISPOSABLE_FIXTURE_V2',status:'NO_GO',
  root:'C:\\ProgramData\\vcp-win-d01-isolation-'+'a'.repeat(32),
  rootIdentity:pathId(91),withManifestIdentity:pathId(92),
  withoutManifestIdentity:pathId(93),
  oldSid:'S-1-5-21-100-200-300-1001',
  writerSid:'S-1-5-21-100-200-300-1002',
  location:'ProgramData',ntfs:true,
  manifestVariants:['with-manifest','without-manifest'],
  filesCreatedOnly:true,selectedProjectTouched:false,
  actualOldTokenTested:false,parentRenameDenialProven:false,
  writerPositiveControlProven:false,
  namespacePowerLossDurabilityProven:false,d01Approved:false,
  managedMutationAuthorized:false,cleanupAuthorized:false
};
function envelope(native=inventory()){
  return {
    kind:'D01_WINDOWS_NAMESPACE_INVENTORY_ENVELOPE_V1',
    status:'NO_GO',fixtureRoot:fixtureReceipt.root,
    sourceSha256:'a'.repeat(64),executableSha256:'b'.repeat(64),
    nativeReceipt:native,
    review:validateWindowsD01NativeNamespaceInventory(native),
    executablePinningIndependentlyAttested:false,
    namespaceSnapshotAtomic:false,oldCliExecutionProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false
  };
}
test('fourth-layer native inventory envelopes correlate but stay NO_GO',()=>{
  const compared=compareWindowsD01NamespaceInventoryEnvelopes({
    fixtureReceipt,variant:'with-manifest',
    beforeEnvelope:envelope(),afterEnvelope:envelope(
      inventory('with-manifest',[dir('.vcp',1)]))
  });
  assert.deepEqual(compared.removedPaths,
    ['.vcp/manifest.json','AGENTS.md']);
  assert.equal(compared.status,'NO_GO');
  assert.equal(compared.sameNativeSourceAndBinaryHashReported,true);
  assert.equal(compared.oldPublishedCliWriterDeniedProven,false);
  assert.equal(compared.nativeBinaryActuallyPinnedDuringScanProven,false);
  assert.equal(compared.managedMutationAuthorized,false);
});
test('wrong native EXE, mismatched folder or forged approval cannot enter comparison',()=>{
  const original={
    fixtureReceipt,variant:'with-manifest',
    beforeEnvelope:envelope(),afterEnvelope:envelope()
  };
  const edits=[
    {afterEnvelope:{...envelope(),executableSha256:'c'.repeat(64)}},
    {beforeEnvelope:{...envelope(),fixtureRoot:'C:\\real\\project'}},
    {beforeEnvelope:{...envelope(),d01Approved:true}},
    {afterEnvelope:envelope({...inventory(),
      rootIdentity:pathId(7)})},
    {beforeEnvelope:{...envelope(),nativeReceipt:{...inventory(),
      publishedOldCliExecutionProven:true}}},
    {afterEnvelope:{...envelope(),review:{...envelope().review,
      managedMutationAuthorized:true}}},
    {afterEnvelope:{...envelope(),review:{...envelope().review,
      entryCount:0}}},
    {afterEnvelope:{...envelope(),review:{...envelope().review,
      projectSecuritySha256:'9'.repeat(64)}}}
  ];
  for(const changed of edits){
    assert.throws(()=>compareWindowsD01NamespaceInventoryEnvelopes({
      ...original,...changed
    }),e=>/^E_D01_WINDOWS_/.test(e.code));
  }
});
test('read-only inventory offline compare refuses incomplete CLI arguments',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const source=await readFile(
    'scripts/compare-windows-d01-namespace-inventory.mjs','utf8');
  assert.equal(pkg.scripts[
    'compare:d01-windows-namespace-inventory'
  ],'node scripts/compare-windows-d01-namespace-inventory.mjs');
  assert.equal(pkg.scripts[
    'build:native-windows-d01-inventory:verify-repro'
  ],'node scripts/build-windows-d01-namespace-inventory.mjs --verify-repro');
  assert.match(source,/compareWindowsD01NamespaceInventoryEnvelopes/);
  assert.doesNotMatch(source,/spawnSync|execSync|writeFile|unlink/);
  const result=spawnSync(process.execPath,[
    'scripts/compare-windows-d01-namespace-inventory.mjs'
  ],{shell:false,encoding:'utf8'});
  assert.equal(result.status,2);
  assert.match(result.stderr,/E_D01_WINDOWS_INVENTORY_DIFF_USAGE/);
});


test('unchanged file bytes with ACL, owner/group fingerprint, attributes or root metadata change is not an unchanged namespace',()=>{
  const start=inventory();
  const alteredAcl=inventory('with-manifest',[
    dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
    {...file('AGENTS.md',3,'a',41),securitySha256:'8'.repeat(64)}
  ]);
  assert.deepEqual(compareWindowsD01NamespaceInventories({
    before:start,after:alteredAcl
  }).alteredPaths,['AGENTS.md']);
  const changedDir=inventory('with-manifest',[
    {...dir('.vcp',1),attributes:0x12},
    file('.vcp/manifest.json',2,'b',22),
    file('AGENTS.md',3,'a',41)
  ]);
  assert.deepEqual(compareWindowsD01NamespaceInventories({
    before:start,after:changedDir
  }).alteredPaths,['.vcp']);
  const alteredRoot={...inventory(),rootSecuritySha256:'9'.repeat(64)};
  const report=compareWindowsD01NamespaceInventories({
    before:start,after:alteredRoot
  });
  assert.equal(report.rootMetadataChanged,true);
  assert.equal(report.namespaceUnchangedObserved,false);
  const changedProject={...inventory(),projectAttributes:0x12};
  assert.equal(compareWindowsD01NamespaceInventories({
    before:start,after:changedProject
  }).projectMetadataChanged,true);
});

test('native security digest uses canonical SDDL instead of raw descriptor bytes',async()=>{
  const source=await readFile(
    'scripts/native/vcp-windows-d01-namespace-inventory.cpp','utf8');
  assert.match(source,/#include <sddl\.h>/);
  assert.match(source,/ConvertSecurityDescriptorToStringSecurityDescriptorW\(/);
  assert.match(source,/OWNER_SECURITY_INFORMATION\|GROUP_SECURITY_INFORMATION\|/);
  assert.match(source,/DACL_SECURITY_INFORMATION/);
  assert.match(source,/LocalFree\(canonical\)/);
  assert.doesNotMatch(source,/reinterpret_cast<PUCHAR>\(descriptor\)/);
  assert.match(source,/reinterpret_cast<PUCHAR>\(canonical\)/);
});

test('native ADS enumeration accepts only empty directories or one unnamed data stream',async()=>{
  const source=await readFile(
    'scripts/native/vcp-windows-d01-namespace-inventory.cpp','utf8');
  const start=source.indexOf('bool unnamedStreamOnly(HANDLE h,bool directory)');
  const end=source.indexOf('std::string securityDigest(HANDLE h)',start);
  assert.ok(start>=0&&end>start);
  const implementation=source.slice(start,end);
  assert.match(implementation,/GetFileInformationByHandleEx\(h,FileStreamInfo/);
  assert.match(implementation,/directory&&GetLastError\(\)==ERROR_HANDLE_EOF/);
  assert.match(implementation,/NextEntryOffset==0/);
  assert.match(implementation,/StreamNameLength==bytes/);
  assert.match(implementation,/std::memcmp/);
  assert.doesNotMatch(implementation,/return GetLastError\(\)==ERROR_HANDLE_EOF/);
  assert.match(source,/unnamedStreamOnly\(h\.h,directory\)/);
});


test('native root and project handles are identity-pinned across inventory walk',async()=>{
  const source=await readFile(
    'scripts/native/vcp-windows-d01-namespace-inventory.cpp','utf8');
  const opened=source.indexOf('Handle rootHandle=openPath(root,true)');
  const walked=source.indexOf('if(!walk(project,',opened);
  const published=source.indexOf('std::cout<<',walked);
  assert.ok(opened>=0&&walked>opened&&published>walked);
  for(const match of [
    /id\(rootHandle\.h\)!=ascii\(rootId\)/,
    /id\(projectHandle\.h\)!=ascii\(projectId\)/
  ]){
    assert.match(source.slice(opened,walked),match);
    assert.match(source.slice(walked,published),match);
  }
});

test('inventory rejects aliases between root, project and child NTFS identities',()=>{
  const baseline=inventory();
  const variants=[
    {...baseline,projectIdentity:baseline.rootIdentity},
    {...baseline,entries:[
      {...dir('.vcp',1),identity:baseline.rootIdentity},
      file('.vcp/manifest.json',2,'b',22),file('AGENTS.md',3,'a',41)
    ]},
    {...baseline,entries:[
      dir('.vcp',1),
      {...file('.vcp/manifest.json',2,'b',22),
        identity:baseline.projectIdentity},
      file('AGENTS.md',3,'a',41)
    ]}
  ];
  for(const payload of variants){
    assert.throws(()=>validateWindowsD01NativeNamespaceInventory(payload),
      e=>/^E_D01_WINDOWS_INVENTORY_/.test(e.code));
  }
});
