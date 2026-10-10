import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,lstat,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {initProject} from '../lib/init.mjs';
import {applyStage13SmartInit} from '../lib/stage13-apply.mjs';
import {recoverInterruptedStage13} from '../lib/stage13-recovery-apply.mjs';
import {planStage13Recovery} from '../lib/stage13-recovery-plan.mjs';
import {inspectStage13ApplyCandidate} from '../lib/stage13-brownfield-preflight.mjs';

async function fixture(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
async function absent(root,relative) {
  try{await lstat(path.join(root,relative));return false;}
  catch(e){if(e?.code==='ENOENT')return true;throw e;}
}
test('Stage13 init rejects mutation before bootstrap and preserves existing bytes',async t=>{
  const root=await fixture(t);
  const original=Buffer.from([0xef,0xbb,0xbf,
    ...Buffer.from('Original routing\r\nCUSTOM=YES\r\n')]);
  await writeFile(path.join(root,'AGENTS.md'),original);
  await assert.rejects(()=>initProject({targetDir:root,adoptionApproval:{
    intent:'ADOPT_EXISTING_REPOSITORY',explicitConsent:true,root
  }}),{code:'E_G_FENCE_NO_GO'});
  assert.equal(await absent(root,'.vcp'),true);
  assert.deepEqual(await readFile(path.join(root,'AGENTS.md')),original);
  assert.deepEqual(await readdir(root),['AGENTS.md']);
});
test('Stage13 direct writer and recovery entrypoints both preserve G-FENCE',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'package.json'),'{}');
  await assert.rejects(()=>applyStage13SmartInit({targetDir:root}),
    {code:'E_G_FENCE_NO_GO'});
  await assert.rejects(()=>recoverInterruptedStage13({targetDir:root}),
    {code:'E_G_FENCE_NO_GO'});
  assert.equal(await absent(root,'.vcp'),true);
});
test('Stage13 adoption preflight is inspection-only without explicit consent',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'package.json'),'{}');
  const before=await readdir(root);
  const report=await inspectStage13ApplyCandidate(root);
  assert.equal(report.stage,13);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.inspectionOnly,true);
  assert.deepEqual(await readdir(root),before);
});
test('Stage13 recovery never infers ownership without its own journal',async t=>{
  const root=await fixture(t);
  await writeFile(path.join(root,'user.txt'),'user owned');
  const report=await planStage13Recovery(root);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'NO_STAGE13_CONTROL_STATE');
  assert.equal(report.writeAuthorized,false);
  assert.equal(await readFile(path.join(root,'user.txt'),'utf8'),'user owned');
});
