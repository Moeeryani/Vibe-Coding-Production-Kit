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

test('proposed D02: absent source-only brownfield docs and v1 manifest are not install failure',async t=>{
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
  assert.equal(report.governance.informational,true);
});

test('proposed D02: actual missing managed file remains an applicable install FAIL',async t=>{
  const target=await root(t);
  await seedLegacyV1Fixture({targetDir:target,includeGitHub:false});
  const report=await runDoctor(target);
  assert.equal(report.assetSet,'legacy-full-v1');
  assert.equal(report.installHealth.checks.some(c=>c.id==='update-state'&&c.applicable),true);
  assert.equal(report.governance.checks.some(c=>c.id==='commands'),true);
  // Legacy strict exit remains active until the maintainer accepts D02.
  assert.equal(doctorExitCode(report,true),report.summary.fail>0||report.summary.warn>0?1:0);
});
