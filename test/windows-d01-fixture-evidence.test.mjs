// Source and receipt contracts only: provisioning stays manual and
// Windows-native, never attempts to change an existing project/ACL.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {validateD01WindowsDisposableFixtureReceipt}
  from '../lib/windows-d01-fixture-evidence.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE}
  from '../lib/managed-migration.mjs';

const example={
  kind:'D01_WINDOWS_DISPOSABLE_FIXTURE_V1',status:'NO_GO',
  root:'C:\\ProgramData\\vcp-win-d01-isolation-'+'a'.repeat(32),
  oldSid:'S-1-5-21-100-200-300-1001',
  writerSid:'S-1-5-21-100-200-300-1002',
  location:'ProgramData',ntfs:true,
  manifestVariants:['with-manifest','without-manifest'],
  filesCreatedOnly:true,selectedProjectTouched:false,
  actualOldTokenTested:false,parentRenameDenialProven:false,
  writerPositiveControlProven:false,
  namespacePowerLossDurabilityProven:false,
  d01Approved:false,managedMutationAuthorized:false,
  cleanupAuthorized:false
};

test('two real-SID scratch fixtures remain NO-GO after receipt validation',()=>{
  const accepted=validateD01WindowsDisposableFixtureReceipt(example);
  assert.equal(accepted.status,'NO_GO');
  assert.equal(accepted.createdOnlyFixture,true);
  assert.equal(accepted.WindowsOldProcessTokenProven,false);
  assert.equal(accepted.WindowsDaclParentRenameExcluded,false);
  assert.equal(accepted.WindowsWriterPositiveControlProven,false);
  assert.equal(accepted.WindowsPowerLossDurabilityProven,false);
  assert.equal(accepted.safeToCleanup,false);
  assert.equal(accepted.managedMutationAuthorized,false);
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
});

test('spoofed fixture, same SID, URL and changed safety flags are rejected',()=>{
  const unsafe=[
    {oldSid:example.writerSid},
    {oldSid:'S-1-5-32-544'},
    {status:'GO'},{d01Approved:true},
    {managedMutationAuthorized:true},
    {cleanupAuthorized:true},
    {actualOldTokenTested:true},
    {parentRenameDenialProven:true},
    {writerPositiveControlProven:true},
    {namespacePowerLossDurabilityProven:true},
    {manifestVariants:['with-manifest']},
    {root:'\\\\server\\share\\vcp-win-d01-isolation-'+'a'.repeat(32)},
    {root:'C:\\ProgramData\\..\\vcp-win-d01-isolation-'+'a'.repeat(32)},
    {root:'C:\\important\\AGENTS.md'},
    {unexpected:true}
  ];
  for(const fields of unsafe){
    assert.throws(()=>validateD01WindowsDisposableFixtureReceipt({
      ...example,...fields
    }),{code:'E_D01_WINDOWS_FIXTURE_RECEIPT_INVALID'});
  }
});

test('native fixture uses only exclusive Create APIs and OS-known ProgramData',async()=>{
  const source=await readFile('scripts/native/vcp-windows-d01-fixture.cpp','utf8');
  assert.match(source,/SHGetKnownFolderPath\(FOLDERID_ProgramData/);
  assert.match(source,/BCryptGenRandom\(/);
  assert.match(source,/CreateDirectoryW\(/);
  assert.match(source,/CREATE_NEW/);
  assert.match(source,/ConvertStringSecurityDescriptorToSecurityDescriptorW/);
  assert.match(source,/D:P\(A;OICI;FA;;;SY\)/);
  assert.match(source,/VCP_D01_WINDOWS_READONLY_TEST_ROOT_ONLY/);
  assert.match(source,/I_ACCEPT_NEW_PROGRAMDATA_FIXTURE_ONLY/);
  assert.match(source,/return 3; \/\/ Always NO_GO/);
  assert.doesNotMatch(source,/--scratch-root/);
  for(const fn of [
    'DeleteFileW','RemoveDirectoryW','MoveFileExW',
    'ReplaceFileW','SetNamedSecurityInfoW','SetSecurityInfo',
    'SetFileInformationByHandle','RegSetValueExW'
  ])assert.doesNotMatch(source,new RegExp('\\b'+fn+'\\s*\\('));
});

test('MSVC provisioner build is never part of npm validation, shipping or default execution',async()=>{
  const builder=await readFile('scripts/build-windows-d01-fixture.mjs','utf8');
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.match(builder,/process\.platform!=='win32'/);
  assert.match(builder,/d01-fixture/);
  assert.match(builder,/\/WX/);
  assert.match(builder,/\/Brepro/);
  assert.match(builder,/sourceSha256/);
  assert.match(builder,/verifiedRepeatBuild/);
  assert.match(builder,/d01Approved:false/);
  assert.equal(typeof pkg.scripts['build:native-windows-d01-fixture'],'string');
  assert.equal(pkg.scripts.test,'node --test');
  assert.equal(pkg.files.includes('build/'),false);
  assert.equal(pkg.scripts.validate.includes('build:native-windows-d01-fixture'),false);
  if(process.platform!=='win32'){
    const proc=spawnSync(process.execPath,
      ['scripts/build-windows-d01-fixture.mjs'],{
        shell:false,encoding:'utf8'
      });
    assert.equal(proc.status,2);
    assert.match(proc.stderr,/E_D01_WINDOWS_FIXTURE_BUILD/);
  }
});
