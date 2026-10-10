import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,symlink,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {detectStack} from '../lib/stacks.mjs';
import {runDoctor,doctorExitCode} from '../lib/doctor.mjs';

async function temp(t,prefix='vcp-stage12-doctor-'){
  const root=await mkdtemp(path.join(os.tmpdir(),prefix));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}

test('Doctor refuses linked selected root rather than reading another project',async t=>{
  const source=await temp(t),parent=await temp(t);
  const link=path.join(parent,'linked-repo');
  await writeFile(path.join(source,'AGENTS.md'),'outside sensitive instructions\n');
  try{await symlink(source,link,process.platform==='win32'?'junction':'dir');}
  catch(e){if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(e.code))
    return t.skip('Native junction creation unavailable');throw e;}
  const report=await runDoctor(link);
  assert.equal(doctorExitCode(report,true),1);
  assert.equal(report.summary.fail,1);
  assert.equal(report.checks[0].id,'target');
  assert.equal(await readdir(parent).then(x=>x.includes('.vcp')),false);
});

test('stack evidence reader refuses linked package metadata, not project-owned commands',async t=>{
  const root=await temp(t),outside=await temp(t);
  await writeFile(path.join(outside,'package.json'),
    JSON.stringify({scripts:{build:'echo sensitive data'}}));
  try{await symlink(path.join(outside,'package.json'),path.join(root,'package.json'),'file');}
  catch(e){if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(e.code))
    return t.skip('Native symlink creation unavailable');throw e;}
  await assert.rejects(()=>detectStack(root),{code:'E_VCP_PATH'});
  const doc=await runDoctor(root);
  assert.ok(doc.checks.some(x=>x.id==='stack'&&x.status==='fail'));
  assert.equal(await readdir(root).then(x=>x.includes('.vcp')),false);
});
