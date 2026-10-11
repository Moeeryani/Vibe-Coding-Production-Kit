import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
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
