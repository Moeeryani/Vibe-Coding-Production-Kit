// B-3 regression: init --force must never silently destroy user data.
//
// Safe behavior (stronger than Option A, per commit 475b24b): --force is
// rejected unconditionally before any filesystem mutation, and every init
// write path is hard-gated. These tests lock that behavior in.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

async function snapshot(root){
  const out={};
  async function walk(dir,rel){
    for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
      const r=path.join(rel,entry.name);
      if(entry.isDirectory())await walk(path.join(dir,entry.name),r);
      else if(entry.isFile())out[r]=await readFile(path.join(root,r),'utf8');
    }
  }
  await walk('.','');
  return out;
}
const fresh=()=>mkdtemp(path.join(os.tmpdir(),'vcp-b3-init-'));

test('Case 1 — user-modified AGENTS.md + init --force: rejected, zero silent loss',async()=>{
  const root=await fresh();
  const userEdit='# Project\n\nUSER_EDIT_B3_CASE1: post-backup user content.\n';
  await writeFile(path.join(root,'AGENTS.md'),userEdit);
  await assert.rejects(initProject({targetDir:root,force:true}),
    /Destructive vcp init --force is disabled/);
  assert.equal(await readFile(path.join(root,'AGENTS.md'),'utf8'),userEdit);
});

test('Case 2 — untouched generated template: init never silently replaces it',async()=>{
  const root=await fresh();
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',stack:'generic',includeGitHub:false});
  const before=await snapshot(root);
  await assert.rejects(initProject({targetDir:root}));
  assert.deepEqual(await snapshot(root),before);
});

test('Case 3 — multiple managed files incl. manifest: refused --force leaves every file byte-identical',async()=>{
  const root=await fresh();
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',stack:'generic',includeGitHub:false});
  await writeFile(path.join(root,'AGENTS.md'),
    '# Project\n\nUSER_EDIT_B3_CASE3: modified after generation.\n');
  const before=await snapshot(root);
  assert.ok(Object.keys(before).length>=2);
  await assert.rejects(initProject({targetDir:root,force:true}),
    /Destructive vcp init --force is disabled/);
  assert.deepEqual(await snapshot(root),before);
});

test('Case 4 — refusal precedes any write: clear failure, no partial corruption',async()=>{
  const root=await fresh();
  await writeFile(path.join(root,'AGENTS.md'),'user content\n');
  const beforeList=await readdir(root);
  const beforeStat=await stat(path.join(root,'AGENTS.md'));
  const error=await initProject({targetDir:root,force:true}).catch(e=>e);
  assert.match(String(error&&error.message),/Destructive vcp init --force is disabled/);
  assert.deepEqual(await readdir(root),beforeList);
  const afterStat=await stat(path.join(root,'AGENTS.md'));
  assert.equal(afterStat.mtimeMs,beforeStat.mtimeMs);
  assert.equal(await readFile(path.join(root,'AGENTS.md'),'utf8'),'user content\n');
});
