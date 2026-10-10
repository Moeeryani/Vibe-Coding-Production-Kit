import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {runCli} from '../lib/cli.mjs';
import {planSmartInit} from '../lib/adoption-plan.mjs';
import {assessStage13Preview} from '../lib/stage13-brownfield-preflight.mjs';

async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-cli-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'package.json'),'{"name":"unchanged"}\n');
  return root;
}
test('Stage13 --adopt requires exact confirmation, never --yes alone',async t=>{
  const root=await fixture(t);
  const original=await readFile(path.join(root,'package.json'));
  t.mock.method(console,'log',()=>{});
  await assert.rejects(()=>runCli(['init',root,'--adopt','--yes']),
    /--confirm-adoption/);
  await assert.rejects(()=>runCli(['init',root,'--adopt','--yes',
    '--confirm-adoption','0'.repeat(64)]),/fingerprint changed/);
  assert.deepEqual(await readdir(root),['package.json']);
  assert.deepEqual(await readFile(path.join(root,'package.json')),original);
});
test('Stage13 exact fingerprint still cannot bypass G-FENCE',async t=>{
  const root=await fixture(t);
  const plan=await planSmartInit(root);
  const consent=assessStage13Preview(plan);
  assert.match(consent.intentFingerprint,/^[a-f0-9]{64}$/);
  t.mock.method(console,'log',()=>{});
  await assert.rejects(()=>runCli(['init',root,'--adopt','--yes',
    '--confirm-adoption',consent.intentFingerprint]),
    {code:'E_G_FENCE_NO_GO'});
  assert.deepEqual(await readdir(root),['package.json']);
});
test('Stage13 dry-run exposes consent without creating managed state',async t=>{
  const root=await fixture(t);
  const outputs=[];
  t.mock.method(console,'log',x=>outputs.push(String(x)));
  await runCli(['init',root,'--dry-run','--json']);
  const preview=JSON.parse(outputs.at(-1));
  assert.equal(preview.classification,'EXISTING');
  assert.equal(preview.stage13Consent.executionAuthorized,false);
  assert.match(preview.stage13Consent.intentFingerprint,/^[a-f0-9]{64}$/);
  assert.deepEqual(await readdir(root),['package.json']);
});
