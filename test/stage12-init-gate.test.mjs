import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readdir,readFile,lstat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initProject} from '../lib/init.mjs';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';

async function root(){return mkdtemp(path.join(os.tmpdir(),'vcp-stage12-init-gate-'));}
async function absent(p){
  try{await lstat(p);return false;}catch(e){if(e.code==='ENOENT')return true;throw e;}
}
test('NEW init is blocked by D-01 before any .vcp or user file creation',async()=>{
  const target=await root();
  await assert.rejects(()=>initProject({targetDir:target,agent:'generic',includeGitHub:false}),
    {code:'E_G_FENCE_NO_GO'});
  assert.deepEqual(await readdir(target),[]);
});

test('missing-target init cannot create even the first root directory before gate',async()=>{
  const parent=await root(),missing=path.join(parent,'new','nested','project');
  await assert.rejects(()=>initProject({targetDir:missing,agent:'generic',includeGitHub:false}),
    {code:'E_G_FENCE_NO_GO'});
  assert.equal(await absent(path.join(parent,'new')),true);
});

test('missing-target dry-run returns a zero-write blocked plan and never creates root',async()=>{
  const parent=await root(),missing=path.join(parent,'absent');
  const p=await initProject({targetDir:missing,dryRun:true});
  assert.equal(p.dryRun,true);
  assert.equal(p.zeroWrite,true);
  assert.equal(p.blocked,true);
  assert.equal(await absent(missing),true);
});

test('existing unmanaged project cannot be adopted and original bytes remain untouched',async()=>{
  const target=await root(),file=path.join(target,'AGENTS.md');
  const original=Buffer.from([0xef,0xbb,0xbf,...Buffer.from('Project owned \r\n')]);
  await writeFile(file,original);
  await assert.rejects(()=>initProject({targetDir:target}),
    /Stage12 Existing-repository Smart Init is zero-write preview only/);
  assert.deepEqual(await readdir(target),['AGENTS.md']);
  assert.deepEqual(await readFile(file),original);
});

test('existing historical managed state is never overwritten by new init',async()=>{
  const target=await root();
  await seedLegacyV1Fixture({targetDir:target,includeGitHub:false});
  const before=await readFile(path.join(target,'.vcp/manifest.json'));
  await assert.rejects(()=>initProject({targetDir:target}),/Already managed by VCP/);
  assert.deepEqual(await readFile(path.join(target,'.vcp/manifest.json')),before);
});
