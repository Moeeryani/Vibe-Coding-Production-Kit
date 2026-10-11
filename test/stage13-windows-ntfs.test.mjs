// Native Windows-only security conformance. These tests exercise real
// reparse points in disposable OS-temp roots, not Linux or WSL substitutes.
// An absent Windows host is SKIPPED, never counted as Windows acceptance.
// Independent acceptance must still confirm the tested volume is NTFS.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,symlink,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {resolveProjectPath} from '../lib/safe-path.mjs';
import {inspectStage13DirectoryTopology} from '../lib/stage13-directory-ownership.mjs';
import {inspectStage13BootstrapResidue} from '../lib/stage13-bootstrap-recovery.mjs';
import {inspectRecoveryOwnedTree} from '../lib/owned-tree-inventory.mjs';
import {inspectProject} from '../lib/adoption-inspect.mjs';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';
import {planSmartInit} from '../lib/adoption-plan.mjs';

async function pair(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-winntfs-'));
  const outside=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-winforeign-'));
  t.after(async()=>{
    await rm(root,{recursive:true,force:true});
    await rm(outside,{recursive:true,force:true});
  });
  const original=Buffer.from('FOREIGN USER BYTES\r\n');
  await writeFile(path.join(outside,'secret.txt'),original);
  return {root,outside,original};
}
function windowsOnly(t){
  if(process.platform==='win32')return true;
  t.skip('Native Windows host required; no Windows acceptance evidence on this platform');
  return false;
}
async function foreignUnchanged(outside,original){
  assert.deepEqual(await readFile(path.join(outside,'secret.txt')),original);
}
test('native Windows junction cannot be followed by project read or write',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await mkdir(path.join(root,'docs'));
  const junction=path.join(root,'docs','jlink');
  await symlink(outside,junction,'junction');
  assert.equal((await lstat(junction)).isSymbolicLink(),true);
  for(const [relative,purpose] of [
    ['docs/jlink/secret.txt','read-existing'],
    ['docs/jlink/new.txt','write-new']
  ]) {
    await assert.rejects(()=>resolveProjectPath(root,relative,{purpose}),
      {code:'E_VCP_PATH'});
  }
  await foreignUnchanged(outside,original);
});
test('native Windows file symlink cannot become a legacy fixture claim',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  const linked=path.join(root,'AGENTS.md');
  // This fails visibly rather than claiming file-symlink coverage if
  // Windows account privileges cannot create the requested reparse point.
  await symlink(path.join(outside,'secret.txt'),linked,'file');
  assert.equal((await lstat(linked)).isSymbolicLink(),true);
  await assert.rejects(()=>seedLegacyV1Fixture({
    targetDir:root,includeGitHub:false
  }),{code:'E_TEST_FIXTURE_UNSAFE'});
  await foreignUnchanged(outside,original);
});
test('native Windows junction as missing adoption ancestor is refused',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await symlink(outside,path.join(root,'.github'),'junction');
  await assert.rejects(()=>inspectStage13DirectoryTopology(root,[
    '.github/ISSUE_TEMPLATE/bug_report.md'
  ]),{code:'E_VCP_PATH'});
  await foreignUnchanged(outside,original);
});
test('native Windows linked pre-WAL staging remains blocked and untouched',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await mkdir(path.join(root,'.vcp'));
  const payload={version:2,mode:'adopt',pid:process.pid,host:os.hostname(),
    token:'b'.repeat(48),startedAt:new Date().toISOString(),
    operationId:'adopt-'+'d'.repeat(32),
    consentFingerprint:'c'.repeat(64),bootstrapPriorVcpAbsent:true};
  const lock=JSON.stringify(payload)+'\n';
  await writeFile(path.join(root,'.vcp/update.lock'),lock);
  await symlink(outside,path.join(root,'.vcp/stage'),'junction');
  const result=await inspectStage13BootstrapResidue(root);
  assert.equal(result.classification,'BLOCKED');
  assert.equal(result.reason,'STAGING_DIRECTORY_NOT_TRUSTED');
  assert.equal(result.writeAuthorized,false);
  assert.equal(await readFile(path.join(root,'.vcp/update.lock'),'utf8'),lock);
  await foreignUnchanged(outside,original);
});
test('native Windows junction in recovery inventory cannot be adopted',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await mkdir(path.join(root,'.vcp/backups/owned-1/files'),{recursive:true});
  await mkdir(path.join(root,'docs/nested'),{recursive:true});
  await writeFile(path.join(root,'docs/nested/owned.md'),'expected\n');
  await symlink(outside,path.join(root,'docs/nested/foreign-link'),'junction');
  const inventory=await inspectRecoveryOwnedTree(root,'owned-1',[
    'docs/nested/owned.md'
  ]);
  assert.equal(inventory.complete,false);
  assert.ok(inventory.issues.some(x=>
    x.path==='docs/nested/foreign-link'&&x.reason==='SYMLINK_PRESENT'));
  await foreignUnchanged(outside,original);
});
test('native Windows linked VCP state never becomes a trusted manifest',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await writeFile(path.join(root,'README.md'),'project source\n');
  await symlink(outside,path.join(root,'.vcp'),'junction');
  const inspected=await inspectProject(root);
  assert.equal(inspected.classification,'BLOCKED');
  assert.equal(inspected.reason,'STATE_NOT_DIRECTORY');
  await foreignUnchanged(outside,original);
});
test('native Windows path aliases, reserved names and escapes fail closed',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  for(const name of [
    'CON','con.txt','NUL.md','docs/trailing.','docs/trailing ',
    '../outside','C:/untrusted','//server/share/untrusted',
    'docs\\outside','docs/../escape'
  ]) {
    await assert.rejects(()=>resolveProjectPath(root,name,{
      purpose:'write-new'
    }),{code:'E_VCP_PATH'});
  }
  await foreignUnchanged(outside,original);
});

test('native Windows linked selected root and in-root alias are rejected',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await mkdir(path.join(root,'real'));
  await writeFile(path.join(root,'real','f'),'keep');
  await symlink(path.join(root,'real'),path.join(root,'alias'),'junction');
  const inspected=await inspectProject(path.join(root,'alias'));
  assert.equal(inspected.classification,'BLOCKED');
  assert.equal(inspected.reason,'ROOT_LINK_REFUSED');
  await assert.rejects(()=>resolveProjectPath(path.join(root,'alias'),'f'),
    {code:'E_VCP_PATH'});
  await foreignUnchanged(outside,original);
});
test('native Windows provider inspection rejects a junction-selected root',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await symlink(root,path.join(outside,'linked-root'),'junction');
  const inspected=await inspectProject(path.join(outside,'linked-root'));
  assert.equal(inspected.classification,'BLOCKED');
  assert.equal(inspected.reason,'ROOT_LINK_REFUSED');
  await foreignUnchanged(outside,original);
});
test('native Windows inspection refuses symlinked manifest without reading its target',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await mkdir(path.join(root,'.vcp'));
  await symlink(path.join(outside,'secret.txt'),
    path.join(root,'.vcp','manifest.json'),'file');
  const inspected=await inspectProject(root);
  assert.equal(inspected.classification,'BLOCKED');
  assert.equal(inspected.reason,'MANIFEST_NOT_REGULAR');
  await foreignUnchanged(outside,original);
});
test('native Windows path guard rejects internal and external file symlinks',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await mkdir(path.join(root,'real'));
  await writeFile(path.join(root,'real','f'),'safe');
  await symlink(path.join(root,'real','f'),path.join(root,'int'),'file');
  await symlink(path.join(outside,'secret.txt'),path.join(root,'ext'),'file');
  for(const relative of ['int','ext']){
    await assert.rejects(()=>resolveProjectPath(root,relative),
      {code:'E_VCP_PATH'});
  }
  await foreignUnchanged(outside,original);
});
test('native Windows adoption plan refuses symlinked external source evidence',async t=>{
  if(!windowsOnly(t))return;
  const {root,outside,original}=await pair(t);
  await symlink(path.join(outside,'secret.txt'),path.join(root,'pyproject.toml'),'file');
  const plan=await planSmartInit(root);
  assert.equal(plan.blocked,true);
  assert.equal(plan.reason,'UNSAFE_PROJECT_PATH');
  assert.equal(plan.zeroWrite,true);
  assert.ok(plan.actions.every(action=>action.executionAuthorized===false));
  await foreignUnchanged(outside,original);
});
