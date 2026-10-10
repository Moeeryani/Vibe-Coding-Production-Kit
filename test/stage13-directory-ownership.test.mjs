import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readdir,symlink,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {classifyStage13DirectoryTopology,
  inspectStage13DirectoryTopology,stage13ClaimStagingPath,
  validateOwnedDirectoryProvenance} from '../lib/stage13-directory-ownership.mjs';

async function disposable(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-topology-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
test('Stage13 stages first missing ancestor instead of creating unowned parent',async t=>{
  const root=await disposable(t);
  await writeFile(path.join(root,'package.json'),'{}');
  const plan=await inspectStage13DirectoryTopology(root,[
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'AGENTS.md'
  ]);
  assert.deepEqual(plan.projectRootsToMove,['.github']);
  assert.deepEqual(plan.plannedCreatedDirectories,
    ['.github','.github/ISSUE_TEMPLATE']);
  const id='adopt-owner1';
  assert.equal(stage13ClaimStagingPath(id,
    '.github/ISSUE_TEMPLATE/bug_report.md',plan),
    '.vcp/stage/'+id+'/dirs/.github/ISSUE_TEMPLATE/bug_report.md');
  assert.equal(stage13ClaimStagingPath(id,'AGENTS.md',plan),
    '.vcp/stage/'+id+'/files/AGENTS.md');
  assert.deepEqual((await readdir(root)).sort(),['package.json']);
});
test('Stage13 existing .github parent creates only missing child subtree',async t=>{
  const root=await disposable(t);
  await mkdir(path.join(root,'.github'));
  const plan=await inspectStage13DirectoryTopology(root,[
    '.github/ISSUE_TEMPLATE/bug_report.md'
  ]);
  assert.deepEqual(plan.projectRootsToMove,['.github/ISSUE_TEMPLATE']);
  assert.deepEqual(plan.plannedCreatedDirectories,['.github/ISSUE_TEMPLATE']);
  assert.ok(plan.existingDirectories.has('.github'));
});
test('Stage13 never follows symlinked ancestor or claims foreign parent',async t=>{
  if(process.platform==='win32')t.skip('native Windows junction test pending');
  const root=await disposable(t);
  await symlink(os.tmpdir(),path.join(root,'.github'));
  await assert.rejects(()=>inspectStage13DirectoryTopology(root,[
    '.github/ISSUE_TEMPLATE/bug_report.md'
  ]),{code:'E_VCP_PATH'});
});
test('Stage13 refuses source-file as parent and nonportable relative names',()=>{
  assert.throws(()=>classifyStage13DirectoryTopology({
    files:['AGENTS.md/child.txt'],
    existingDirectories:new Map(),missingDirectories:new Set()
  }),{code:'E_STAGE13_DIRECTORY_UNPROVEN'});
  assert.throws(()=>classifyStage13DirectoryTopology({
    files:['.git/config'],existingDirectories:new Map(),
    missingDirectories:new Set()
  }),{code:'E_STAGE13_DIRECTORY_PATH'});
});
test('Stage13 directory ownership requires matching inode, never hash alone',()=>{
  const entries=[{path:'.github',kind:'stage13-created-directory',
    dev:'7',ino:'12'}];
  assert.equal(validateOwnedDirectoryProvenance(entries,
    new Map([['.github',{dev:7,ino:12}]])).
    validatedDirectories,1);
  assert.throws(()=>validateOwnedDirectoryProvenance(entries,
    new Map([['.github',{dev:7,ino:22}]])),
    {code:'E_STAGE13_CREATED_DIRECTORY_REPLACED'});
});
