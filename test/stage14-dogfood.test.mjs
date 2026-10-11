// Stage14 dry-run dogfood: demonstrates *planned* surface sizes and
// preservation without falsely claiming that gated adoption apply ran.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {buildDesiredFiles} from '../lib/template.mjs';
import {initProject} from '../lib/init.mjs';
import {planConsumerAssetRetirement} from '../lib/consumer-asset-retirement-plan.mjs';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';

async function fixture(t,prefix='vcp-stage14-dogfood-'){
  const root=await mkdtemp(path.join(os.tmpdir(),prefix));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
function reportSurface(name,bundle){
  const files=[...bundle.files];
  return Object.freeze({
    name,assetSet:bundle.assetSet,
    selectedFiles:files.length,
    selectedBytes:files.reduce((n,[,v])=>
      n+Buffer.byteLength(v.content??'','utf8'),0),
    paths:files.map(([p])=>p).sort(),
    applied:false
  });
}
test('Stage14 first-use dry-run measures legacy/full vs safe/minimal noise without writing',async t=>{
  const root=await fixture(t);
  const before=await readdir(root);
  const variants=[];
  for(const assetSet of [
    'legacy-full-v1','greenfield-safe-v1','brownfield-minimal-v1'
  ]){
    variants.push(reportSurface(assetSet,await buildDesiredFiles({
      targetDir:root,agent:'generic',stack:'generic',assetSet,
      includeGitHub:true
    })));
  }
  const [legacy,safe,minimal]=variants;
  assert.equal(legacy.applied,false);
  assert.ok(legacy.selectedFiles>safe.selectedFiles);
  assert.ok(safe.selectedFiles>minimal.selectedFiles);
  assert.ok(legacy.selectedBytes>safe.selectedBytes);
  assert.ok(safe.selectedBytes>minimal.selectedBytes);
  assert.equal(safe.paths.some(p=>p.startsWith('prompts/')),false);
  assert.equal(minimal.paths.some(p=>p.startsWith('docs/')),false);
  assert.deepEqual(await readdir(root),before);
});
test('Stage14 real init writer stays gated even with a new short catalog',async t=>{
  const root=await fixture(t);
  await assert.rejects(()=>initProject({
    targetDir:root,agent:'generic',stack:'generic',includeGitHub:false
  }),{code:'E_G_FENCE_NO_GO'});
  assert.deepEqual(await readdir(root),[]);
});
test('Stage14 legacy managed dogfood measures candidate noise yet never erases user edits',async t=>{
  const root=await fixture(t);
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',
    stack:'generic',includeGitHub:false});
  const chosen=path.join(root,'docs/CLI.md');
  const before=await readFile(chosen);
  const owner=path.join(root,'USER.md'),owned=Buffer.from('USER DECISION\r\n');
  await writeFile(owner,owned);
  const plan=await planConsumerAssetRetirement(root,{
    targetAssetSet:'greenfield-safe-v1'
  });
  assert.equal(plan.readOnly,true);
  assert.equal(plan.executionAuthorized,false);
  assert.ok(plan.summary.candidates>0);
  assert.deepEqual(await readFile(chosen),before);
  assert.deepEqual(await readFile(owner),owned);
  assert.ok((await readdir(root)).includes('USER.md'));
});
