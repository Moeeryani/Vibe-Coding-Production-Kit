// D-01 isolated-principal construction contract. Test mode NEVER provisions
// fixtures or runs as root; the kernel experiment requires its own opt-in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {
  provisionD01LinuxFixture,probeD01LinuxFixture,
  stageD01VerifiedOldCliArchive
} from '../lib/d01-linux-isolation-fixture.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE} from '../lib/managed-migration.mjs';

test('forged D-01 fixture cannot invoke a mutating native UID probe',async()=>{
  for(const fake of [
    {},
    {kind:'D01_DISPOSABLE_LINUX_FIXTURE_V1',
      root:'/tmp/vcp-d01-os-isolation-fake',
      projects:[]},
    {kind:'D01_DISPOSABLE_LINUX_FIXTURE_V1',
      root:'/tmp/vcp-d01-os-isolation-fake',
      projects:[
        {root:'/home/real-user/important',manifestPresent:true},
        {root:'/home/real-user/important2',manifestPresent:false}
      ]}
  ]){
    await assert.rejects(()=>probeD01LinuxFixture(fake),
      {code:'E_D01_FIXTURE_RECEIPT_INVALID'});
    await assert.rejects(()=>stageD01VerifiedOldCliArchive(fake,{
      archiveBytes:Buffer.from('not-an-archive'),
      expectedSha512:'0'.repeat(128)
    }),{code:'E_D01_FIXTURE_RECEIPT_INVALID'});
  }
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
});

test('fixture provisioning refuses missing explicit opt-in on every platform',async()=>{
  const old=process.env.VCP_D01_DISPOSABLE_ISOLATION;
  delete process.env.VCP_D01_DISPOSABLE_ISOLATION;
  try{
    await assert.rejects(()=>provisionD01LinuxFixture({
      oldUid:10101,oldGid:10101,writerUid:10102,writerGid:10102
    }),e=>[
      'E_D01_FIXTURE_ROOT_LINUX_REQUIRED',
      'E_D01_FIXTURE_EXPLICIT_OPT_IN'
    ].includes(e.code));
  }finally{
    if(old===undefined)delete process.env.VCP_D01_DISPOSABLE_ISOLATION;
    else process.env.VCP_D01_DISPOSABLE_ISOLATION=old;
  }
});

test('kernel fixture CLI never defaults to destructive behavior',()=>{
  const env={...process.env};
  delete env.VCP_D01_DISPOSABLE_ISOLATION;
  const run=spawnSync(process.execPath,
    ['scripts/run-d01-linux-isolation-fixture.mjs'],{
      shell:false,encoding:'utf8',env,timeout:4000
    });
  assert.equal(run.status,2,run.stderr);
  assert.match(run.stderr,/E_D01_FIXTURE_INPUT/);
});
