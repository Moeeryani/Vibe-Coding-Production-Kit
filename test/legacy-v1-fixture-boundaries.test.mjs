import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';
import {readManifest,hashContent} from '../lib/state.mjs';
import {validateLegacyManifestFields} from '../lib/manifest-v1-guard.mjs';

async function scratch(t,prefix='vcp-fixture-'){
  const root=await mkdtemp(path.join(os.tmpdir(),prefix));
  t.after(()=>rm(root,{force:true,recursive:true}));
  return root;
}

test('historical fixture creates only valid v1 claims and matching baseline bytes',async t=>{
  const root=await scratch(t);
  const fixture=await seedLegacyV1Fixture({targetDir:root,agent:'generic',stack:'generic',includeGitHub:false});
  assert.equal(fixture.fixtureOnly,true);
  const manifest=await readManifest(root);
  assert.equal(manifest.schemaVersion,1);
  assert.equal(validateLegacyManifestFields(manifest).inertUnknownFields,0);
  assert.equal(manifest.install.requestedStack,'generic');
  assert.ok(Object.keys(manifest.managedFiles).length>0);
  assert.equal(manifest.install.assetSet,undefined);
  for(const [relative,entry] of Object.entries(manifest.managedFiles)){
    const bytes=await readFile(path.join(root,...relative.split('/')));
    const baseline=await readFile(path.join(root,...entry.baselinePath.split('/')));
    assert.deepEqual(bytes,baseline);
    assert.equal(entry.baselineHash,hashContent(bytes));
  }
});

test('historical fixture preserves preexisting AGENTS bytes and does not claim them',async t=>{
  const root=await scratch(t);
  const bytes=Buffer.from([0xef,0xbb,0xbf,...Buffer.from('USER\r\n')]);
  await writeFile(path.join(root,'AGENTS.md'),bytes);
  await seedLegacyV1Fixture({targetDir:root,includeGitHub:false});
  assert.deepEqual(await readFile(path.join(root,'AGENTS.md')),bytes);
  assert.equal(Object.hasOwn((await readManifest(root)).managedFiles,'AGENTS.md'),false);
});

test('preflight refuses blocked ancestor before writing any template or vcp state',async t=>{
  const root=await scratch(t);
  await writeFile(path.join(root,'docs'),'a file, not a template directory');
  await assert.rejects(()=>seedLegacyV1Fixture({targetDir:root,includeGitHub:false}),
    {code:'E_VCP_PATH'});
  assert.deepEqual(await readdir(root),['docs']);
  assert.equal(await readFile(path.join(root,'docs'),'utf8'),'a file, not a template directory');
});


test('historical fixture accepts a precreated nested project inside its vcp-* sandbox',async t=>{
  const sandbox=await scratch(t);
  const root=path.join(sandbox,'packages','api');
  await mkdir(root,{recursive:true});
  const original=Buffer.from('WORKSPACE USER ORIGINAL\\r\\n');
  await writeFile(path.join(root,'CUSTOM.md'),original);
  await seedLegacyV1Fixture({targetDir:root,includeGitHub:false});
  assert.equal((await readManifest(root)).schemaVersion,1);
  assert.deepEqual(await readFile(path.join(root,'CUSTOM.md')),original);
  assert.equal((await readdir(sandbox)).join(','),'packages');
  assert.equal((await readdir(path.join(sandbox,'packages'))).join(','),'api');
});
test('fixture never creates an unproved nested project directory',async t=>{
  const sandbox=await scratch(t);
  const root=path.join(sandbox,'packages','api');
  await assert.rejects(()=>seedLegacyV1Fixture({targetDir:root}),{
    code:'E_TEST_FIXTURE_UNSAFE'
  });
  assert.deepEqual(await readdir(sandbox),[]);
});
test('a vcp-* final directory under a foreign temp sandbox is still refused',async t=>{
  const outside=await scratch(t,'outside-fixture-');
  const root=path.join(outside,'packages','vcp-spoofed-target');
  await mkdir(root,{recursive:true});
  await assert.rejects(()=>seedLegacyV1Fixture({targetDir:root}),{
    code:'E_TEST_FIXTURE_UNSAFE'
  });
  assert.deepEqual(await readdir(root),[]);
});
test('fixture refuses a linked ancestor inside an otherwise valid vcp-* sandbox',async t=>{
  const sandbox=await scratch(t);
  const outside=await scratch(t,'outside-fixture-');
  await mkdir(path.join(outside,'api'),{recursive:true});
  await mkdir(path.join(sandbox,'packages'));
  await writeFile(path.join(outside,'api','CUSTOM.md'),'FOREIGN FILE\\n');
  await symlink(outside,path.join(sandbox,'packages','linked'),
    process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>seedLegacyV1Fixture({
    targetDir:path.join(sandbox,'packages','linked','api')
  }),{code:'E_TEST_FIXTURE_UNSAFE'});
  assert.equal(await readFile(path.join(outside,'api','CUSTOM.md'),'utf8'),
    'FOREIGN FILE\\n');
  assert.deepEqual(await readdir(path.join(outside,'api')),['CUSTOM.md']);
});

test('fixture refuses non-vcp temporary directory before any writes',async t=>{
  const root=await scratch(t,'outside-fixture-');
  await assert.rejects(()=>seedLegacyV1Fixture({targetDir:root}),
    {code:'E_TEST_FIXTURE_UNSAFE'});
  assert.deepEqual(await readdir(root),[]);
});

test('fixture refuses an in-project linked template file without following it',async t=>{
  if(process.platform==='win32')return t.skip('native Windows file symlink is exercised by test/stage13-windows-ntfs.test.mjs');
  const root=await scratch(t);
  const outside=await scratch(t,'outside-fixture-');
  const victim=path.join(outside,'user.md');
  await writeFile(victim,'protected user bytes\n');
  await symlink(victim,path.join(root,'AGENTS.md'));
  await assert.rejects(()=>seedLegacyV1Fixture({targetDir:root}),
    {code:'E_TEST_FIXTURE_UNSAFE'});
  assert.equal(await readFile(victim,'utf8'),'protected user bytes\n');
  assert.deepEqual((await readdir(root)),['AGENTS.md']);
});
