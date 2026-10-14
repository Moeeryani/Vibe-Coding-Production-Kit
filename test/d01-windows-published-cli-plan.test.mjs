// Construction contract: no native Windows writes or published package
// execution. A synthetic tar verifies parser integration; it is not
// independently sourced npm v0.9.3 and does not establish old CLI denial.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {planWindowsD01PublishedLegacyAdversary}
  from '../lib/d01-windows-published-cli-plan.mjs';

const root='C:\\ProgramData\\vcp-win-d01-isolation-'+'a'.repeat(32);
const fixture=Object.freeze({
  kind:'D01_WINDOWS_DISPOSABLE_FIXTURE_V2',status:'NO_GO',
  root,rootIdentity:'1'.repeat(24),
  withManifestIdentity:'2'.repeat(24),
  withoutManifestIdentity:'3'.repeat(24),
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
});
const pkg={
  name:'vibe-coding-production',version:'0.9.3',type:'module',
  bin:{vcp:'bin/vibe-coding-production.mjs',
    'vibe-coding-production':'bin/vibe-coding-production.mjs'}
};
function num(block,offset,width,n){
  block.write(n.toString(8).padStart(width-1,'0')+'\0',
    offset,width,'ascii');
}
function entry(name,data=null){
  const directory=data===null;
  const bytes=Buffer.from(data??'','utf8');
  const block=Buffer.alloc(512);
  block.write(name,0,100,'utf8');
  num(block,100,8,directory?0o755:0o644);
  num(block,108,8,0);num(block,116,8,0);
  num(block,124,12,bytes.length);
  num(block,136,12,0);
  block.fill(32,148,156);
  block[156]=directory?53:48;
  block.write('ustar\0',257,6);
  block.write('00',263,2);
  let sum=0;for(const b of block)sum+=b;
  num(block,148,8,sum);
  return [block,bytes,Buffer.alloc((512-bytes.length%512)%512)];
}
function localTar(){
  const bytes=Buffer.concat([
    ...[
      entry('package/'),
      entry('package/package.json',JSON.stringify(pkg)),
      entry('package/bin/'),
      entry('package/bin/vibe-coding-production.mjs','// test-only inert\n'),
      entry('package/lib/'),
      entry('package/lib/cli.mjs','export const testOnly=true;\n')
    ].flat(),Buffer.alloc(1024)
  ]);
  const archive=gzipSync(bytes);
  const sha512=createHash('sha512').update(archive).digest('hex');
  return {archive,sha512};
}
test('10 immutable published-CLI scenarios are explicit and never runnable on plan alone',()=>{
  const {archive,sha512}=localTar();
  const plan=planWindowsD01PublishedLegacyAdversary({
    fixtureReceipt:fixture,archiveBytes:archive,expectedSha512:sha512
  });
  assert.equal(plan.status,'NO_GO');
  assert.equal(plan.scenarios.length,10);
  assert.equal(plan.twoVariantCoveragePlanned,true);
  assert.equal(plan.artifactMatchesExpectedDigest,true);
  assert.equal(plan.independentNpmProvenanceVerified,false);
  assert.equal(plan.stagedPackageContentsVerified,false);
  assert.equal(plan.WindowsNativeSandboxNetworkIsolated,false);
  assert.equal(plan.mayExecuteFromPlan,false);
  assert.equal(plan.actualOldTokenExecutionProven,false);
  assert.equal(plan.managedMutationAuthorized,false);
  assert.equal(Object.isFrozen(plan.scenarios),true);
  assert.deepEqual(plan.scenarios.map(x=>x.id),[
    'with-manifest/init-force','with-manifest/update',
    'with-manifest/manage-ignore','with-manifest/manage-track',
    'with-manifest/rollback-post-backup-user-edit',
    'without-manifest/init-force','without-manifest/update',
    'without-manifest/manage-ignore','without-manifest/manage-track',
    'without-manifest/rollback-post-backup-user-edit'
  ]);
  for(const scenario of plan.scenarios){
    assert.equal(Object.isFrozen(scenario),true);
    assert.equal(Object.isFrozen(scenario.arguments),true);
    assert.equal(scenario.targetProject.startsWith(root+'\\'),true);
    assert.equal(scenario.mayRunFromThisPlan,false);
    assert.equal(scenario.mustAttestOldSidAndActualLifecycleWritePath,true);
    assert.equal(scenario.mustAttestKernelDenialErrorNotSharingViolation,true);
    assert.equal(scenario.mustAttestNetworkIsolatedExecution,true);
    assert.equal(scenario.selectedProjectTouched,false);
    if(scenario.id.endsWith('rollback-post-backup-user-edit')){
      assert.equal(scenario.requiresIndependentlyVerifiedBackup,true);
      assert.equal(scenario.requiresWriterAuthorizedPostBackupEdit,true);
      assert.equal(scenario.expectedAgentSha256,null);
      assert.equal(scenario.mustReattestCurrentUserBytesBefore,true);
    }
  }
  assert.equal(plan.scenarios[0].arguments.includes('--force'),true);
  assert.equal(plan.scenarios[5].manifestMustBeAbsent,true);
  assert.equal(plan.scenarios[5].expectedManifestSha256,null);
});

test('mismatched digest and forged native fixture identity refuse the plan',()=>{
  const {archive,sha512}=localTar();
  assert.throws(()=>planWindowsD01PublishedLegacyAdversary({
    fixtureReceipt:fixture,archiveBytes:archive,
    expectedSha512:'0'.repeat(128)
  }),{code:'E_D01_ARCHIVE_DIGEST_MISMATCH'});
  for(const forged of [
    {status:'GO'},{d01Approved:true},
    {oldSid:fixture.writerSid},
    {root:'C:\\Users\\Public\\a'},
    {rootIdentity:'INVALID'},
    {withManifestIdentity:fixture.withoutManifestIdentity}
  ]){
    assert.throws(()=>planWindowsD01PublishedLegacyAdversary({
      fixtureReceipt:{...fixture,...forged},archiveBytes:archive,
      expectedSha512:sha512
    }),{code:'E_D01_WINDOWS_FIXTURE_RECEIPT_INVALID'});
  }
});

test('offline planner CLI returns NO_GO with no execution or unexpected writes',async t=>{
  const scratch=await mkdtemp(path.join(os.tmpdir(),'vcp-d01-windows-plan-'));
  t.after(()=>rm(scratch,{recursive:true,force:true}));
  const {archive,sha512}=localTar();
  const archiveFile=path.join(scratch,'candidate.tgz');
  const receiptFile=path.join(scratch,'fixture.json');
  await writeFile(archiveFile,archive);
  const receiptBytes=Buffer.from(JSON.stringify(fixture));
  await writeFile(receiptFile,receiptBytes);
  const run=spawnSync(process.execPath,[
    'scripts/plan-windows-d01-published-cli.mjs',
    '--fixture',receiptFile,
    '--legacy-tgz',archiveFile,
    '--expected-sha512',sha512
  ],{encoding:'utf8',shell:false,timeout:10000});
  assert.equal(run.error,undefined);
  assert.equal(run.status,3,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.status,'NO_GO');
  assert.equal(report.scenarios.length,10);
  assert.equal(report.mayExecuteFromPlan,false);
  assert.deepEqual(await readFile(receiptFile),receiptBytes);
  assert.deepEqual(await readFile(archiveFile),archive);
});

test('missing digest or arbitrary plan arguments always refuse',()=>{
  const run=spawnSync(process.execPath,[
    'scripts/plan-windows-d01-published-cli.mjs',
    '--fixture','C:\\not-a-fixture.json',
    '--legacy-tgz','C:\\untrusted.tgz'
  ],{encoding:'utf8',shell:false});
  assert.equal(run.status,2);
  assert.match(run.stderr,/E_D01_PUBLISHED_PLAN_USAGE/);
});
