import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {reviewWindowsD01KernelDenialReceipt}
  from '../lib/windows-d01-kernel-denial-evidence.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE}
  from '../lib/managed-migration.mjs';

const good={
  kind:'D01_WINDOWS_OLD_TOKEN_KERNEL_DENIAL_V1',status:'NO_GO',
  variant:'with-manifest',rootIdentity:'1'.repeat(24),
  projectIdentity:'2'.repeat(24),oldTokenSidMatched:true,
  dangerousOpenRightsAllDenied:true,
  actualCreateAttempted:true,actualCreateSucceeded:false,
  actualCreateWin32Error:5,
  actualRenameAttempted:true,actualRenameSucceeded:false,
  actualRenameWin32Error:5,
  protectedBytesUnchanged:true,noUnexpectedNewEntries:true,
  ntfsIdentitiesPreserved:true,kernelFixtureDenialObserved:true,
  publishedLegacyCliTested:false,productionMutationAuthorized:false,
  WindowsNamespaceDurabilityProven:false,d01Approved:false
};

test('observed kernel deny in scratch cannot authorize v2 or published CLI',()=>{
  const result=reviewWindowsD01KernelDenialReceipt(good,{
    variant:'with-manifest',rootIdentity:'1'.repeat(24),
    projectIdentity:'2'.repeat(24)
  });
  assert.equal(result.status,'NO_GO');
  assert.equal(result.kernelScratchAccessDenialObserved,true);
  assert.equal(result.publishedV093MutationDeniedProven,false);
  assert.equal(result.safeToRetry,false);
  assert.equal(result.safeToRollback,false);
  assert.equal(result.safeToDelete,false);
  assert.equal(result.managedMutationAuthorized,false);
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
});
test('uncertain native rename or create is NEVER classified as denied',()=>{
  for(const changed of [
    {dangerousOpenRightsAllDenied:false,kernelFixtureDenialObserved:false,
     actualCreateAttempted:false,actualCreateWin32Error:0,
     actualRenameAttempted:false,actualRenameWin32Error:0},
    {actualRenameWin32Error:32,kernelFixtureDenialObserved:false},
    {actualCreateSucceeded:true,actualCreateWin32Error:0,
     actualRenameAttempted:false,actualRenameWin32Error:0,
     kernelFixtureDenialObserved:false,noUnexpectedNewEntries:false},
    {protectedBytesUnchanged:false,kernelFixtureDenialObserved:false},
    {noUnexpectedNewEntries:false,kernelFixtureDenialObserved:false}
  ]){
    const result=reviewWindowsD01KernelDenialReceipt({...good,...changed});
    assert.equal(result.status,'NO_GO');
    assert.equal(result.kernelScratchAccessDenialObserved,false);
    assert.equal(result.publishedV093MutationDeniedProven,false);
  }
});
test('forged GO, stale file IDs, claimed old CLI proof and inconsistent flags fail closed',()=>{
  for(const changed of [
    {status:'GO'},{d01Approved:true},
    {productionMutationAuthorized:true},
    {WindowsNamespaceDurabilityProven:true},
    {publishedLegacyCliTested:true},
    {rootIdentity:'garbage'},{projectIdentity:'garbage'},
    {variant:'wrong'},
    {oldTokenSidMatched:false},
    {actualCreateSucceeded:true,actualCreateWin32Error:5},
    {actualCreateAttempted:false,actualCreateWin32Error:5},
    {actualRenameSucceeded:true,actualRenameWin32Error:5},
    {actualRenameAttempted:true,actualCreateAttempted:false,
      actualCreateWin32Error:0},
    {kernelFixtureDenialObserved:true,actualRenameWin32Error:32},
    {surreptitiousApproval:true}
  ]){
    assert.throws(()=>reviewWindowsD01KernelDenialReceipt({...good,...changed}),
      e=>/^E_D01_WINDOWS_KERNEL_/.test(e.code));
  }
  assert.throws(()=>reviewWindowsD01KernelDenialReceipt(good,{
    rootIdentity:'9'.repeat(24)
  }),{code:'E_D01_WINDOWS_KERNEL_FIXTURE_IDENTITY_MISMATCH'});
});
test('native probe source has bounded SCRATCH mutations and no deletion or overwrite',async()=>{
  const src=await readFile('scripts/native/vcp-windows-d01-kernel-denial.cpp','utf8');
  assert.match(src,/SHGetKnownFolderPath\(FOLDERID_ProgramData/);
  assert.match(src,/VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY/);
  assert.match(src,/I_ACCEPT_DISPOSABLE_ONLY/);
  assert.match(src,/CheckTokenMembership\(nullptr/);
  assert.match(src,/FILE_DELETE_CHILD/);
  assert.match(src,/FILE_WRITE_DATA/);
  assert.match(src,/CREATE_NEW/);
  assert.match(src,/MoveFileExW\(agent\.c_str\(\),moved\.c_str\(\),0\)/);
  assert.match(src,/content\(agent,agentText\)/);
  assert.match(src,/status.*NO_GO|NO_GO/);
  for(const forbidden of [
    /\bDeleteFileW\s*\(/,/\bRemoveDirectoryW\s*\(/,
    /\bSetNamedSecurityInfoW\s*\(/,/\bSetFileInformationByHandle\s*\(/,
    /\bTRUNCATE_EXISTING\b/,/\bCREATE_ALWAYS\b/,
    /\bMOVEFILE_REPLACE_EXISTING\b/
  ])assert.doesNotMatch(src,forbidden);
});
test('manual wrapper fails closed on non-Windows without privileged tool use',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const source=await readFile('scripts/probe-windows-d01-kernel-denial.mjs','utf8');
  assert.equal(pkg.scripts['probe:d01-windows-kernel-denial'],
    'node scripts/probe-windows-d01-kernel-denial.mjs');
  assert.equal(pkg.scripts.test,'node --test');
  assert.equal(pkg.files.includes('build/'),false);
  assert.match(source,/executed|spawnSync\(exe/);
  assert.match(source,/E_D01_WINDOWS_KERNEL_SHA_MISMATCH/);
  assert.match(source,/process\.exitCode=3/);
  if(process.platform!=='win32'){
    const run=spawnSync(process.execPath,
      ['scripts/probe-windows-d01-kernel-denial.mjs'],{
        shell:false,encoding:'utf8'
      });
    assert.equal(run.status,2);
    assert.match(run.stderr,/E_D01_WINDOWS_KERNEL_USAGE/);
  }
});
