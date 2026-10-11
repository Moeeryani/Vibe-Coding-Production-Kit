import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {cp,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';

test('Stage14 validator keeps provider docs mandatory only for provider source',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage14-legacy-validator-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await seedLegacyV1Fixture({targetDir:root,stack:'generic',includeGitHub:false});
  for(const relative of [
    'docs/CONSUMER-ASSET-SEPARATION.md',
    'docs/STAGE14-ACCEPTANCE-MATRIX.md',
    'docs/tasks/stage14-consumer-asset-separation.md'
  ]){
    await assert.rejects(()=>readFile(path.join(root,relative)),{code:'ENOENT'});
  }
  const stdout=execFileSync(process.execPath,[
    path.join(root,'scripts/validate-framework.mjs')
  ],{cwd:root,encoding:'utf8',timeout:30000});
  assert.match(stdout,/Framework validation passed/);
});

test('Stage14 provider validator refuses missing required docs and self-sentinel module',async t=>{
  // Never remove anything from the checked-out source. Use an isolated
  // provider snapshot, with the real package manifest and real validator.
  const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage14-provider-contract-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const relative of [
    'AGENTS.md','package.json','bin','lib','docs','prompts','scripts',
    'evaluations','examples','.github'
  ]){
    await cp(path.join(source,relative),path.join(root,relative),{recursive:true});
  }
  const validator=path.join(root,'scripts/validate-framework.mjs');
  const invoke=()=>spawnSync(process.execPath,[validator],{
    cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024
  });
  const positive=invoke();
  assert.equal(positive.status,0,positive.stderr||positive.error?.message);
  assert.match(positive.stdout,/Framework validation passed/);
  for(const relative of [
    'docs/CONSUMER-ASSET-SEPARATION.md',
    'docs/STAGE14-ACCEPTANCE-MATRIX.md',
    'lib/consumer-asset-retirement-plan.mjs',
    'lib/asset-catalog.mjs'
  ]){
    const selected=path.join(root,...relative.split('/'));
    const original=await readFile(selected);
    await rm(selected);
    const negative=invoke();
    assert.equal(negative.status,1,relative+': '+negative.stderr);
    assert.ok(negative.stderr.includes(
      'ERROR: required file missing or empty: '+relative
    ),relative+': '+negative.stderr);
    await writeFile(selected,original);
    const restored=invoke();
    assert.equal(restored.status,0,relative+': '+restored.stderr);
  }
});
