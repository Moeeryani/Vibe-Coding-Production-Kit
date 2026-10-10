import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {planSmartInit} from '../lib/adoption-plan.mjs';
import {resolveProjectPath} from '../lib/safe-path.mjs';

async function temporary(t,prefix='vcp-preview-sec-'){
  const root=await mkdtemp(path.join(os.tmpdir(),prefix));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}

test('brownfield init preview is stable, content-free and leaves all user bytes alone',async t=>{
  const root=await temporary(t);
  const secret='PRIVATE_MARKER_DO_NOT_EXPORT_c7c7c7c7';
  const document=Buffer.from([0xef,0xbb,0xbf,...Buffer.from('RULE '+secret+'\r\n')]);
  await writeFile(path.join(root,'AGENTS.md'),document);
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'project',note:secret}));
  const before=(await readdir(root)).sort();
  const a=await planSmartInit(root);
  const b=await planSmartInit(root);
  assert.deepEqual(a,b);
  assert.equal(a.classification,'EXISTING');
  assert.equal(a.zeroWrite,true);
  assert.equal(a.previewOnly,true);
  assert.ok(a.actions.every(x=>x.executionAuthorized===false));
  assert.equal(JSON.stringify(a).includes(secret),false);
  assert.equal(JSON.stringify(a).includes('RULE '),false);
  assert.deepEqual(await readFile(path.join(root,'AGENTS.md')),document);
  assert.deepEqual((await readdir(root)).sort(),before);
  assert.equal(before.includes('.vcp'),false);
});

test('linked vendor instructions are never read as adoptable user authority',async t=>{
  const root=await temporary(t);
  const external=await temporary(t,'vcp-external-');
  const original='Do not replace this user instruction.\n';
  await writeFile(path.join(external,'CLAUDE.md'),original);
  try{
    await symlink(path.join(external,'CLAUDE.md'),path.join(root,'CLAUDE.md'),'file');
  }catch(e){
    if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(e.code))
      return t.skip('Windows symlink creation not permitted on this host');
    throw e;
  }
  const preview=await planSmartInit(root);
  assert.equal(preview.blocked,true);
  assert.equal(preview.reason,'UNSAFE_PROJECT_PATH');
  assert.equal(preview.executionAuthorized,false);
  assert.equal(await readFile(path.join(external,'CLAUDE.md'),'utf8'),original);
  assert.equal((await readdir(root)).includes('.vcp'),false);
});

test('linked project parent rejects path resolution including in-root links',async t=>{
  const root=await temporary(t),internal=path.join(root,'actual');
  await mkdir(internal);
  await writeFile(path.join(internal,'document.md'),'INTERNAL');
  const link=path.join(root,'alias');
  try{await symlink(internal,link,process.platform==='win32'?'junction':'dir');}
  catch(e){
    if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(e.code))
      return t.skip('Windows junction creation unavailable');
    throw e;
  }
  await assert.rejects(()=>resolveProjectPath(root,'alias/document.md',{purpose:'read-existing'}),
    {code:'E_VCP_PATH'});
  assert.equal(await readFile(path.join(internal,'document.md'),'utf8'),'INTERNAL');
});
