import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { selectAssetPaths } from '../lib/asset-catalog.mjs';
import { planSmartInit } from '../lib/adoption-plan.mjs';
import { inspectAgentSectionAdoption } from '../lib/section-adoption.mjs';
import { readProjectBytes } from '../lib/safe-read.mjs';
import { composeInitialManagedSection,parseManagedSections } from '../lib/managed-markdown.mjs';

async function isolated(t) {
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage12-preview-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}

test('brownfield minimal excludes fictional starter truth and consumer CI',()=>{
  const candidates=[
    'AGENTS.md','CLAUDE.md','.github/copilot-instructions.md',
    '.github/workflows/validate.yml',
    'docs/product/PRD.md','docs/security/THREAT-MODEL.md',
    '.github/PULL_REQUEST_TEMPLATE.md'
  ];
  const minimal=selectAssetPaths('brownfield-minimal-v1',candidates,{
    includeGitHub:false
  });
  assert.deepEqual(minimal,['AGENTS.md','CLAUDE.md']);
  const requested=selectAssetPaths('brownfield-minimal-v1',candidates,{
    includeGitHub:false,includeRequestedCopilot:true
  });
  assert.deepEqual(requested,['.github/copilot-instructions.md','AGENTS.md','CLAUDE.md']);
  const safe=selectAssetPaths('greenfield-safe-v1',candidates,{
    includeGitHub:true
  });
  assert.ok(!safe.includes('.github/workflows/validate.yml'));
  const old=selectAssetPaths('legacy-full-v1',candidates,{
    includeGitHub:true
  });
  assert.ok(old.includes('.github/workflows/validate.yml'));
});

test('brownfield plan leaves original nested project documents byte-identical',async t=>{
  const root=await isolated(t);
  await mkdir(path.join(root,'docs'),{recursive:true});
  await writeFile(path.join(root,'docs','PRD.md'),Buffer.from([0xef,0xbb,0xbf,
    ...Buffer.from('User authority \r\n')]));
  await writeFile(path.join(root,'package.json'),'{"name":"existing-project"}\n');
  const before=await readFile(path.join(root,'docs','PRD.md'));
  const plan1=await planSmartInit(root);
  const plan2=await planSmartInit(root);
  assert.equal(plan1.classification,'EXISTING');
  assert.equal(plan1.assetSet,'brownfield-minimal-v1');
  assert.equal(plan1.zeroWrite,true);
  assert.deepEqual(plan1,plan2);
  assert.ok(plan1.actions.every(x=>x.executionAuthorized===false));
  assert.ok(!plan1.actions.some(x=>x.path==='docs/PRD.md'));
  assert.ok(!plan1.actions.some(x=>x.path==='.github/workflows/validate.yml'));
  assert.deepEqual(await readFile(path.join(root,'docs','PRD.md')),before);
  assert.deepEqual((await readdir(root)).sort(),['docs','package.json']);
});

test('unclaimed compatible Claude file remains project-owned NOOP',async t=>{
  const root=await isolated(t);
  await writeFile(path.join(root,'CLAUDE.md'),'# Claude\n\n@AGENTS.md\n');
  const result=await inspectAgentSectionAdoption(root,'CLAUDE.md');
  assert.equal(result.classification,'NOOP_COMPATIBLE');
  const preview=await planSmartInit(root);
  assert.ok(preview.observedCompatibleAdapters.includes('CLAUDE.md'));
  assert.ok(!preview.proposedManagedAdapterSurface.some(x=>x.path==='CLAUDE.md'));
  assert.equal(await readFile(path.join(root,'CLAUDE.md'),'utf8'),'# Claude\n\n@AGENTS.md\n');
});

test('code-fenced routing example is not enough to prove compatible Claude authority',async t=>{
  const root=await isolated(t);
  const fence=String.fromCharCode(96).repeat(3);
  await writeFile(path.join(root,'CLAUDE.md'),
    '# Project instructions\n\n'+fence+'\n@AGENTS.md\n'+fence+'\n');
  const inspected=await inspectAgentSectionAdoption(root,'CLAUDE.md');
  assert.equal(inspected.classification,'SECTION_CANDIDATE');
});

test('unclaimed VCP markers are a conflict, not permission to replace sections',async t=>{
  const root=await isolated(t);
  await writeFile(path.join(root,'CLAUDE.md'),
    '<!-- VCP:BEGIN:claude-adapter -->\nForeign body\n<!-- VCP:END:claude-adapter -->\n');
  const result=await inspectAgentSectionAdoption(root,'CLAUDE.md');
  assert.equal(result.classification,'CONFLICT');
  assert.equal(result.reason,'UNCLAIMED_VCP_MARKERS');
  const plan=await planSmartInit(root);
  assert.equal(plan.blocked,true);
  assert.ok(plan.actions.some(x=>x.action==='CONFLICT'&&x.path==='CLAUDE.md'));
});

test('initial section insertion preserves BOM and all user bytes outside new region',()=>{
  const original=Buffer.concat([
    Buffer.from([0xef,0xbb,0xbf]),Buffer.from('User-controlled\r\nUnknown policy \r\n')
  ]);
  const proposed=composeInitialManagedSection(original,'agent-routing',
    'VCP routing only.\r\n');
  assert.deepEqual(proposed.document.subarray(0,original.length),original);
  const regions=parseManagedSections(proposed.document);
  assert.equal(regions.length,1);
  assert.equal(regions[0].id,'agent-routing');
  assert.equal(proposed.body.toString(),'VCP routing only.\r\n');
});

test('optional missing parents are absent while linked ancestors remain forbidden',async t=>{
  const root=await isolated(t);
  assert.equal(await readProjectBytes(root,'missing/nested/item.md',{optional:true}),null);
  if(process.platform==='win32')return; // Native junction proof is separate.
  await symlink(os.tmpdir(),path.join(root,'linked'),'dir');
  await assert.rejects(()=>readProjectBytes(root,'linked/user.md',{optional:true}),{
    code:'E_VCP_PATH'
  });
});
