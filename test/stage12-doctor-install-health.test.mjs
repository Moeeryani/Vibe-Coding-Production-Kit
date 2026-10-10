import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {runDoctor,doctorExitCode,proposedD02DoctorExitCode} from '../lib/doctor.mjs';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';

async function root(t){
  const p=await mkdtemp(path.join(os.tmpdir(),'vcp-doctor-d02-'));
  t.after(()=>rm(p,{recursive:true,force:true}));
  return p;
}

test('accepted D02: absent source-only brownfield docs and v1 manifest are not install failure',async t=>{
  const target=await root(t);
  await writeFile(path.join(target,'AGENTS.md'),'# Existing user instructions\n');
  const report=await runDoctor(target);
  assert.equal(report.assetSet,'brownfield-minimal-v1');
  const absent=report.installHealth.checks.filter(c=>!c.applicable);
  assert.ok(absent.some(c=>c.id==='prd'));
  assert.ok(absent.some(c=>c.id==='ci'));
  assert.ok(absent.some(c=>c.id==='validator'));
  assert.ok(absent.some(c=>c.id==='update-state'));
  assert.equal(report.installHealth.summary.fail,0);
  assert.equal(report.installHealth.summary.warn,0);
  assert.equal(proposedD02DoctorExitCode(report,true),0);
  assert.equal(doctorExitCode(report,true),0);
  assert.equal(report.governance.informational,true);
});

test('accepted D02: actual missing managed file remains an applicable install FAIL',async t=>{
  const target=await root(t);
  await seedLegacyV1Fixture({targetDir:target,includeGitHub:false});
  const report=await runDoctor(target);
  assert.equal(report.assetSet,'legacy-full-v1');
  assert.equal(report.installHealth.checks.some(c=>c.id==='update-state'&&c.applicable),true);
  assert.equal(report.governance.checks.some(c=>c.id==='commands'),true);
  assert.equal(doctorExitCode(report,true),proposedD02DoctorExitCode(report,true));
  assert.equal(doctorExitCode(report,false),report.installHealth.summary.fail>0?1:0);
});

test('D-02 public exit excludes governance-only WARN/FAIL but not installation hazards',()=>{
  const report={
    checks:[{id:'commands',status:'fail'},{id:'ci',status:'pass'}],
    summary:{pass:1,warn:0,fail:1},
    installHealth:{summary:{pass:1,warn:0,fail:0}},
    governance:{checks:[{id:'commands',status:'fail'}],informational:true}
  };
  assert.equal(doctorExitCode(report),0);
  assert.equal(doctorExitCode(report,true),0);
  const installWarn={...report,installHealth:{summary:{pass:0,warn:1,fail:0}}};
  assert.equal(doctorExitCode(installWarn),0);
  assert.equal(doctorExitCode(installWarn,true),1);
  const installFail={...report,installHealth:{summary:{pass:0,warn:0,fail:1}}};
  assert.equal(doctorExitCode(installFail),1);
  assert.equal(doctorExitCode(installFail,true),1);
  assert.equal(doctorExitCode({summary:{pass:0,warn:0,fail:1}},true),1);
});
