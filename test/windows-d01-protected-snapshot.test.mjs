// Stage12 D01 Windows protected snapshot contracts, all portable.
// No native execution, no writing to a selected project, no GO path.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  verifyWindowsD01NativeProtectedSnapshot,
  assessWindowsD01ProtectedBeforeAfter
} from '../lib/windows-d01-protected-snapshot-evidence.mjs';

const snapshot={
  kind:'D01_WINDOWS_NATIVE_PROTECTED_SNAPSHOT_V1',
  status:'NO_GO',variant:'with-manifest',
  rootIdentity:'1'.repeat(24),projectIdentity:'2'.repeat(24),
  agentsSha256:'a'.repeat(64),agentsFileIdentity:'3'.repeat(24),
  manifestSha256:'b'.repeat(64),manifestFileIdentity:'4'.repeat(24),
  readOnly:true,sharesDelete:true,nativeNtfs:true,markerVerified:true,
  snapshotAtomicityProven:false,oldCliExecutionProven:false,
  powerLossDurabilityProven:false,
  managedMutationAuthorized:false,d01Approved:false
};

test('native forensic snapshot is always NO_GO, even with identical before and after bytes',()=>{
  const verified=verifyWindowsD01NativeProtectedSnapshot(snapshot,{
    variant:'with-manifest',rootIdentity:'1'.repeat(24),
    projectIdentity:'2'.repeat(24)
  });
  assert.equal(verified.status,'NO_GO');
  assert.equal(verified.state.agentsFileIdentity,'3'.repeat(24));
  assert.equal(verified.snapshotAtomicityProven,false);
  assert.equal(verified.oldCliDeniedProven,false);
  const comparison=assessWindowsD01ProtectedBeforeAfter({
    before:snapshot,after:snapshot,variant:'with-manifest',
    rootIdentity:'1'.repeat(24),projectIdentity:'2'.repeat(24)
  });
  assert.equal(comparison.originalUserDataPreservedObserved,true);
  assert.equal(comparison.publishedOldCliMutationDeniedProven,false);
  assert.equal(comparison.independentExecutionTraceVerified,false);
  assert.equal(comparison.safeToCleanup,false);
  assert.equal(comparison.managedMutationAuthorized,false);
});
test('equal bytes with replaced NTFS identity does not count as preservation',()=>{
  const after={...snapshot,agentsFileIdentity:'5'.repeat(24)};
  const result=assessWindowsD01ProtectedBeforeAfter({
    before:snapshot,after,variant:'with-manifest'
  });
  assert.equal(result.originalUserBytesHashStable,true);
  assert.equal(result.originalFileIdentityStable,false);
  assert.equal(result.originalUserDataPreservedObserved,false);
});
test('old and new manifest states cannot be intermixed',()=>{
  const noManifest={...snapshot,variant:'without-manifest',
    manifestSha256:null,manifestFileIdentity:null};
  const result=verifyWindowsD01NativeProtectedSnapshot(noManifest);
  assert.equal(result.state.manifestSha256,null);
  assert.throws(()=>assessWindowsD01ProtectedBeforeAfter({
    before:snapshot,after:noManifest
  }),{code:'E_D01_WINDOWS_SNAPSHOT_VARIANT_MISMATCH'});
});
test('forged native GO, changed root, sharing pin denial and invalid file hashes fail',()=>{
  for(const changed of [
    {status:'GO'},{d01Approved:true},
    {managedMutationAuthorized:true},
    {readOnly:false},{sharesDelete:false},{markerVerified:false},
    {snapshotAtomicityProven:true},{oldCliExecutionProven:true},
    {powerLossDurabilityProven:true},
    {agentsSha256:'INVALID'},{agentsFileIdentity:'INVALID'},
    {manifestSha256:null},{manifestFileIdentity:null},
    {rootIdentity:'INVALID'},{projectIdentity:'INVALID'},
    {unexpectedGo:true}
  ]){
    assert.throws(()=>verifyWindowsD01NativeProtectedSnapshot({
      ...snapshot,...changed
    }),{code:'E_D01_WINDOWS_SNAPSHOT_INVALID'});
  }
  assert.throws(()=>verifyWindowsD01NativeProtectedSnapshot(snapshot,{
    rootIdentity:'6'.repeat(24)
  }),{code:'E_D01_WINDOWS_SNAPSHOT_FIXTURE_MISMATCH'});
});
test('native snapshot builds read-only and refuses any non-Windows execution',async()=>{
  const source=await readFile(
    'scripts/native/vcp-windows-d01-protected-snapshot.cpp','utf8');
  const builder=await readFile(
    'scripts/build-windows-d01-protected-snapshot.mjs','utf8');
  const runner=await readFile(
    'scripts/inspect-windows-d01-protected-snapshot.mjs','utf8');
  const packageFile=JSON.parse(await readFile('package.json','utf8'));
  assert.match(source,/FOLDERID_ProgramData/);
  assert.match(source,/BCryptHashData/);
  assert.match(source,/BCryptFinishHash/);
  // Every protected file, not only the fixed marker literal, must obey
  // a cumulative byte bound, and it must be hashed in full.
  assert.match(source,/DWORD totalBytes=0/);
  assert.match(source,/if\(n>131072-totalBytes\)return/);
  assert.match(source,/totalBytes\+=n/);
  assert.match(source,/totalBytes!=after\.nFileSizeLow/);
  assert.match(source,/before\.ftLastWriteTime\.dwLowDateTime/);
  assert.doesNotMatch(source,/if\(bytes\.size\(\)\+n>131072\)/);
  assert.match(source,/FILE_SHARE_READ\|FILE_SHARE_WRITE\|FILE_SHARE_DELETE/);
  assert.match(source,/VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY/);
  assert.match(source,/snapshotAtomicityProven.*false/);
  for(const forbidden of [
    /\bWriteFile\s*\(/,/\bCreateDirectoryW\s*\(/,
    /\bMoveFileExW\s*\(/,/\bDeleteFileW\s*\(/,
    /\bSetFileInformationByHandle\s*\(/,/\bSetNamedSecurityInfoW\s*\(/,
    /\bCREATE_NEW\b/,/\bFILE_FLAG_DELETE_ON_CLOSE\b/
  ])assert.doesNotMatch(source,forbidden);
  assert.match(builder,/\/W4/);
  assert.match(builder,/\/WX/);
  assert.match(builder,/Bcrypt\.lib/);
  assert.match(builder,/verifiedRepeatBuild/);
  assert.match(runner,/E_D01_WINDOWS_SNAPSHOT_SHA_MISMATCH/);
  assert.match(runner,/process\.exitCode=3/);
  assert.equal(packageFile.scripts[
    'inspect:d01-windows-protected-snapshot'
  ],'node scripts/inspect-windows-d01-protected-snapshot.mjs');
  assert.equal(packageFile.files.includes('build/'),false);
  if(process.platform!=='win32'){
    const result=spawnSync(process.execPath,[
      'scripts/inspect-windows-d01-protected-snapshot.mjs'
    ],{shell:false,encoding:'utf8'});
    assert.equal(result.status,2);
    assert.match(result.stderr,/E_D01_WINDOWS_SNAPSHOT_USAGE/);
  }
});
