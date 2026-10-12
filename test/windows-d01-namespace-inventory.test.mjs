// Stage12 D01 Windows native namespace inventory portable contracts.
// No Windows root, account, ProgramData folder, CLI or native EXE touched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {MANAGED_SCHEMA_MIGRATION_GATE}
  from '../lib/managed-migration.mjs';
import {
  validateWindowsD01NativeNamespaceInventory,
  compareWindowsD01NamespaceInventories
} from '../lib/windows-d01-namespace-inventory-evidence.mjs';

const pathId=(n)=>n.toString(16).padStart(24,'0');
const dir=(p,n)=>({path:p,type:'directory',identity:pathId(n),
  sha256:null,size:0});
const file=(p,n,h,size)=>({path:p,type:'file',
  identity:pathId(n),sha256:h.repeat(64),size});
function inventory(variant='with-manifest',entries){
  const fixtureEntries=entries??(variant==='with-manifest'?[
    dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
    file('AGENTS.md',3,'a',41)
  ]:[dir('.vcp',1),file('AGENTS.md',3,'a',41)]);
  return {kind:'D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V1',
    status:'NO_GO',variant,
    rootIdentity:pathId(91),projectIdentity:pathId(92),
    entries:fixtureEntries,entryCount:fixtureEntries.length,
    fileBytesHashed:fixtureEntries.reduce((n,x)=>n+x.size,0),
    maxEntries:512,maxDepth:10,
    maxSingleFileBytes:131072,maxTotalFileBytes:2097152,
    readOnly:true,sharesDelete:true,
    reparseEntriesRejected:true,hardlinkedFilesRejected:true,
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
    {managedMutationAuthorized:true},
    {publishedOldCliExecutionProven:true},
    {namespaceSnapshotAtomic:true},
    {WindowsNamespaceDurabilityProven:true},
    {readOnly:false},{sharesDelete:false},
    {reparseEntriesRejected:false},
    {hardlinkedFilesRejected:false},
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
