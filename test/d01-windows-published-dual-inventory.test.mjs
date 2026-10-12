// A real legacy CLI may mutate the *other* disposable project.
// These tests are portable contract checks; no Windows kernel or npm
// published CLI is executed. All plausible inputs still return NO_GO.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {compareWindowsD01PublishedDualProjectInventories}
  from '../lib/d01-windows-published-dual-inventory.mjs';
import {validateWindowsD01NativeNamespaceInventory}
  from '../lib/windows-d01-namespace-inventory-evidence.mjs';
const identity=n=>n.toString(16).padStart(24,'0');
const sidOld='S-1-5-21-100-200-300-1001';
const sidWriter='S-1-5-21-100-200-300-1002';
const root='C:\\ProgramData\\vcp-win-d01-isolation-'+'a'.repeat(32);
const fixture={
  kind:'D01_WINDOWS_DISPOSABLE_FIXTURE_V2',status:'NO_GO',
  root,rootIdentity:identity(91),
  withManifestIdentity:identity(92),withoutManifestIdentity:identity(93),
  oldSid:sidOld,writerSid:sidWriter,location:'ProgramData',ntfs:true,
  manifestVariants:['with-manifest','without-manifest'],
  filesCreatedOnly:true,selectedProjectTouched:false,
  actualOldTokenTested:false,parentRenameDenialProven:false,
  writerPositiveControlProven:false,namespacePowerLossDurabilityProven:false,
  d01Approved:false,managedMutationAuthorized:false,cleanupAuthorized:false
};
const argv=(id,project)=>id==='init-force'?
  ['init',project,'--yes','--agent','all','--force','--no-github']:
  id==='update'?['update',project]:
  id==='manage-ignore'?['manage','ignore','AGENTS.md','--dir',project]:
  id==='manage-track'?['manage','track','AGENTS.md','--dir',project]:
  ['rollback',project];
const plan={
  kind:'D01_WINDOWS_PUBLISHED_OLD_CLI_PLAN_V1',
  status:'NO_GO',mayExecuteFromPlan:false,
  managedMutationAuthorized:false,d01Approved:false,
  fixtureRoot:root,fixtureRootIdentity:fixture.rootIdentity,
  withManifestIdentity:fixture.withManifestIdentity,
  withoutManifestIdentity:fixture.withoutManifestIdentity,
  archiveSha512:'a'.repeat(128),
  oldSid:sidOld,writerSid:sidWriter,
  packageName:'vibe-coding-production',packageVersion:'0.9.3',
  independentNpmProvenanceVerified:false,
  actualOldTokenExecutionProven:false,
  scenarios:['with-manifest','without-manifest'].flatMap(variant=>
    ['init-force','update','manage-ignore','manage-track',
     'rollback-post-backup-user-edit'].map(id=>{
      const project=root+'\\'+variant;
      const rollback=id==='rollback-post-backup-user-edit';
      return {
        id:variant+'/'+id,variant,targetProject:project,
        cliFile:'package/bin/vibe-coding-production.mjs',
        arguments:argv(id,project),mayRunFromThisPlan:false,
        mustAttestOldSidAndActualLifecycleWritePath:true,
        mustAttestKernelDenialErrorNotSharingViolation:true,
        mustAttestNetworkIsolatedExecution:true,
        requiresIndependentlyVerifiedBackup:rollback,
        requiresWriterAuthorizedPostBackupEdit:rollback
      };
    }))
};
const dir=(path,n)=>({path,type:'directory',identity:identity(n),
  sha256:null,size:0,attributes:0x10,
  securitySha256:'c'.repeat(64)});
const file=(path,n,hash,size)=>({path,type:'file',
  identity:identity(n),sha256:hash.repeat(64),size,
  attributes:0x20,securitySha256:'d'.repeat(64)});
function native(variant,entries){
  const withManifest=variant==='with-manifest';
  const baseline=withManifest?
    [dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
      file('AGENTS.md',3,'a',41)]:
    [dir('.vcp',4),file('AGENTS.md',5,'a',41)];
  const list=entries??baseline;
  return {
    kind:'D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V2',
    status:'NO_GO',variant,
    rootIdentity:fixture.rootIdentity,
    rootAttributes:0x10,projectAttributes:0x10,
    rootSecuritySha256:'e'.repeat(64),
    projectSecuritySha256:'f'.repeat(64),
    projectIdentity:withManifest?
      fixture.withManifestIdentity:fixture.withoutManifestIdentity,
    entries:list,entryCount:list.length,
    fileBytesHashed:list.reduce((n,e)=>n+e.size,0),
    maxEntries:512,maxDepth:10,
    maxSingleFileBytes:131072,maxTotalFileBytes:2097152,
    readOnly:true,sharesDelete:true,
    reparseEntriesRejected:true,hardlinkedFilesRejected:true,
    alternateDataStreamsRejected:true,
    ownerGroupDaclFingerprintMeasured:true,
    namespaceSnapshotAtomic:false,publishedOldCliExecutionProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false
  };
}
function envelope(variant,entries){
  const report=native(variant,entries);
  return {
    kind:'D01_WINDOWS_NAMESPACE_INVENTORY_ENVELOPE_V1',
    status:'NO_GO',fixtureRoot:root,
    sourceSha256:'1'.repeat(64),executableSha256:'2'.repeat(64),
    nativeReceipt:report,
    review:validateWindowsD01NativeNamespaceInventory(report),
    executablePinningIndependentlyAttested:false,
    namespaceSnapshotAtomic:false,oldCliExecutionProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false
  };
}
function good(){
  return {fixtureReceipt:fixture,plan,
    scenarioId:'with-manifest/init-force',
    withBefore:envelope('with-manifest'),
    withAfter:envelope('with-manifest'),
    withoutBefore:envelope('without-manifest'),
    withoutAfter:envelope('without-manifest')
  };
}
test('both unchanged fixture projects remain only point-in-time NO_GO',()=>{
  const result=compareWindowsD01PublishedDualProjectInventories(good());
  assert.equal(result.status,'NO_GO');
  assert.equal(result.capturedBothProjects,true);
  assert.equal(result.bothProjectsUnchangedObserved,true);
  assert.equal(result.targetProjectUnchangedObserved,true);
  assert.equal(result.siblingProjectUnchangedObserved,true);
  assert.deepEqual(result.observedChanges,[]);
  assert.equal(result.actualPublishedOldCliWriteDeniedProven,false);
  assert.equal(result.independentOldCliExecutionAttested,false);
  assert.equal(result.WindowsNamespaceDurabilityProven,false);
  assert.equal(result.managedMutationAuthorized,false);
});
test('actual old CLI targeting one project cannot hide sibling modification',()=>{
  const after=[dir('.vcp',4),file('AGENTS.md',5,'f',41)];
  const result=compareWindowsD01PublishedDualProjectInventories({
    ...good(),withoutAfter:envelope('without-manifest',after)
  });
  assert.equal(result.targetProjectUnchangedObserved,true);
  assert.equal(result.siblingProjectUnchangedObserved,false);
  assert.equal(result.bothProjectsUnchangedObserved,false);
  assert.deepEqual(result.observedChanges,[{
    variant:'without-manifest',change:'altered',path:'AGENTS.md'
  }]);
  assert.equal(result.status,'NO_GO');
});
test('cross-project new entry, deletion and NTFS identity replacement show separately',()=>{
  const altered=[dir('.vcp',1),file('.vcp/manifest.json',2,'b',22),
    file('AGENTS.md',7,'a',41),file('created.txt',8,'c',6)];
  const sibling=[dir('.vcp',4)];
  const result=compareWindowsD01PublishedDualProjectInventories({
    ...good(),withAfter:envelope('with-manifest',altered),
    withoutAfter:envelope('without-manifest',sibling)
  });
  assert.equal(result.bothProjectsUnchangedObserved,false);
  assert.deepEqual(result.observedChanges,[
    {variant:'with-manifest',change:'created',path:'created.txt'},
    {variant:'with-manifest',change:'altered',path:'AGENTS.md'},
    {variant:'without-manifest',change:'removed',path:'AGENTS.md'}
  ]);
});
test('old CLI noop substitution, cross-fixture roots and incomplete sibling proof fail closed',()=>{
  const invalid=[
    {plan:{...plan,scenarios:plan.scenarios.map((x,i)=>
      i===0?{...x,arguments:['noop']}:x)}},
    {fixtureReceipt:{...fixture,writerSid:sidOld}},
    {plan:{...plan,oldSid:sidWriter}},
    {withoutBefore:undefined},
    {withoutAfter:{...envelope('without-manifest'),
      executableSha256:'f'.repeat(64)}},
    {withoutAfter:envelope('with-manifest')},
    {withBefore:{...envelope('with-manifest'),
      nativeReceipt:{...native('with-manifest'),
        rootIdentity:identity(120)}}},
    {scenarioId:'made-up/rename'}
  ];
  for(const changes of invalid){
    assert.throws(()=>compareWindowsD01PublishedDualProjectInventories({
      ...good(),...changes
    }),e=>/^E_D01_/.test(e.code));
  }
});


test('offline dual-project review has no spawn/write path and refuses absent evidence',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  const script=await readFile(
    'scripts/compare-windows-d01-published-dual-inventory.mjs','utf8');
  assert.equal(pkg.scripts['compare:d01-windows-published-dual-inventory'],
    'node scripts/compare-windows-d01-published-dual-inventory.mjs');
  assert.equal(pkg.scripts.test,'node --test');
  assert.doesNotMatch(script,/\b(?:spawn|execSync|writeFile|unlink|rename)\s*\(/);
  assert.match(script,/process\.exitCode=3/);
  assert.match(script,/new Set\(files\.map/);
  const result=spawnSync(process.execPath,[
    'scripts/compare-windows-d01-published-dual-inventory.mjs'
  ],{encoding:'utf8',shell:false});
  assert.equal(result.status,2);
  assert.match(result.stderr,/E_D01_WINDOWS_DUAL_INVENTORY_USAGE/);
});

test('legacy CLI that changes only sibling ACL or project root DACL cannot appear unchanged',()=>{
  const modifiedSibling= native('without-manifest');
  const siblingEntries=modifiedSibling.entries.map(x=>x.path==='AGENTS.md'?
    {...x,securitySha256:'9'.repeat(64)}:x);
  const siblingResult=compareWindowsD01PublishedDualProjectInventories({
    ...good(),withoutAfter:envelope('without-manifest',siblingEntries)
  });
  assert.equal(siblingResult.targetProjectUnchangedObserved,true);
  assert.equal(siblingResult.siblingProjectUnchangedObserved,false);
  assert.deepEqual(siblingResult.observedChanges,[{
    variant:'without-manifest',change:'altered',path:'AGENTS.md'
  }]);
  const projectRoot= {...envelope('without-manifest'),
    nativeReceipt:{...native('without-manifest'),
      projectSecuritySha256:'9'.repeat(64)}};
  const rootResult=compareWindowsD01PublishedDualProjectInventories({
    ...good(),withoutAfter:projectRoot
  });
  assert.equal(rootResult.siblingProjectUnchangedObserved,false);
  assert.equal(rootResult.perProject[1].projectMetadataChanged,true);
  assert.deepEqual(rootResult.observedChanges,[{
    variant:'without-manifest',change:'metadata',path:'@project-root'
  }]);
  assert.equal(rootResult.bothProjectsUnchangedObserved,false);
  assert.equal(rootResult.status,'NO_GO');
});
