import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ASSET_SETS,ASSET_CLASSES,STAGE14_SAFE_CONSUMER_PATHS,
  STAGE14_PACKAGE_RUNTIME,requireAssetSet,validConsumerCatalogPath,
  assertCatalogInventory,selectAssetPaths,describeConsumerAssetCatalog,
  classifyConsumerAsset,assetSurfaceSnapshot,selectPackagedPromptEligibility
} from '../lib/asset-catalog.mjs';
import {buildDesiredFiles} from '../lib/template.mjs';
import {runCli} from '../lib/cli.mjs';
import {resolvePackagedPrompt} from '../lib/prompt-resolver.mjs';
import {planConsumerAssetRetirement} from '../lib/consumer-asset-retirement-plan.mjs';
import {inspectConsumerAssetHealth} from '../lib/consumer-asset-health.mjs';
import {seedLegacyV1Fixture} from './helpers/legacy-v1-fixture.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE} from '../lib/managed-migration.mjs';

async function scratch(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage14-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
test('Stage14 catalog exports stable three-version assetSet and four explicit classes',()=>{
  assert.deepEqual(ASSET_SETS,[
    'legacy-full-v1','greenfield-safe-v1','brownfield-minimal-v1']);
  assert.deepEqual(ASSET_CLASSES,[
    'runtime-required','greenfield-starter','optional-hygiene','package-only']);
  assert.equal(new Set(STAGE14_SAFE_CONSUMER_PATHS).size,
    STAGE14_SAFE_CONSUMER_PATHS.length);
  assert.equal(classifyConsumerAsset('AGENTS.md'),'runtime-required');
  assert.equal(classifyConsumerAsset('docs/product/PRD.md'),'greenfield-starter');
  assert.equal(classifyConsumerAsset('.github/PULL_REQUEST_TEMPLATE.md'),'optional-hygiene');
  assert.equal(classifyConsumerAsset('docs/ROADMAP.md'),'package-only');
  assert.equal(classifyConsumerAsset('prompts/02-plan-task.md'),'package-only');
});
test('Stage14 catalog refuses unknown source identity, aliases and untrusted paths',()=>{
  assert.throws(()=>requireAssetSet('unknown'),{code:'E_ASSETSET_UNKNOWN'});
  for(const bad of ['../escape','foo/../bar','./foo','foo//bar','C:/work',
    '//server/share','docs\\PRD.md','.vcp/manifest.json','.git/config',
    'NUL.md','docs/trailing.','docs/trailing ','']){
    assert.equal(validConsumerCatalogPath(bad),false,bad);
    assert.throws(()=>assertCatalogInventory([bad]),{code:'E_ASSET_CATALOG_PATH'});
  }
  for(const xs of [
    ['Docs/PRD.md','docs/prd.md'],
    ['docs/caf\u00e9.md','docs/cafe\u0301.md'],
    ['docs','docs/PRD.md']
  ]){
    assert.throws(()=>assertCatalogInventory(xs),e=>e.code.startsWith('E_ASSET_CATALOG_'));
  }
});
test('Stage14 explicit manifest categorizes all supplied inventory with no inferred ownership',()=>{
  const entries=describeConsumerAssetCatalog([
    'AGENTS.md','docs/product/PRD.md','docs/CLI.md',
    'prompts/04-code-review.md','.github/PULL_REQUEST_TEMPLATE.md'
  ]);
  assert.equal(entries.length,5);
  const legacy=entries.find(e=>e.path==='docs/CLI.md');
  assert.deepEqual(legacy.eligibleAssetSets,['legacy-full-v1']);
  assert.equal(legacy.classification,'package-only');
  assert.deepEqual(entries.find(e=>e.path==='AGENTS.md').eligibleAssetSets,ASSET_SETS);
});
test('Stage14 safe greenfield exact golden inventory never sweeps package sources',async t=>{
  const root=await scratch(t);
  const desired=await buildDesiredFiles({
    targetDir:root,assetSet:'greenfield-safe-v1',stack:'generic',agent:'generic'
  });
  const expected=STAGE14_SAFE_CONSUMER_PATHS.filter(p=>
    p!=='CLAUDE.md'&&p!=='.github/copilot-instructions.md');
  assert.deepEqual([...desired.files.keys()].sort(),expected);
  for(const forbidden of ['docs/CLI.md','docs/ROADMAP.md','prompts/02-plan-task.md',
    'scripts/validate-framework.mjs','.github/workflows/validate.yml',
    'examples/feature-spec.example.md']){
    assert.equal(desired.files.has(forbidden),false,forbidden);
  }
  assert.match(desired.files.get('AGENTS.md').content,/HUMAN DECISION/);
  assert.equal(desired.files.get('AGENTS.md').origin,'greenfield-routing-v1');
  assert.ok(desired.files.get('AGENTS.md').content.length<3000);
  assert.deepEqual(await readdir(root),[]);
});
test('Stage14 greenfield explicit --no-GitHub cannot introduce scaffolding or CI',async t=>{
  const root=await scratch(t);
  const desired=await buildDesiredFiles({
    targetDir:root,agent:'generic',assetSet:'greenfield-safe-v1',
    includeGitHub:false,stack:'generic'
  });
  assert.equal([...desired.files.keys()].filter(p=>p.startsWith('.github/')).length,0);
  assert.equal(desired.files.has('docs/product/PRD.md'),true);
});
test('Stage14 brownfield stays minimal, even if package gains more docs',async t=>{
  const root=await scratch(t);
  const desired=await buildDesiredFiles({
    targetDir:root,agent:'generic',assetSet:'brownfield-minimal-v1',
    includeGitHub:false,stack:'generic'
  });
  assert.deepEqual([...desired.files.keys()],['AGENTS.md']);
  assert.equal(desired.files.get('AGENTS.md').origin,'brownfield-routing-v1');
});
test('Stage14 historic full surface retains original compatibility assets',async t=>{
  const root=await scratch(t);
  const legacy=await buildDesiredFiles({
    targetDir:root,agent:'generic',assetSet:'legacy-full-v1',
    stack:'generic',includeGitHub:true
  });
  for(const relative of [
    'docs/CLI.md','docs/ROADMAP.md','prompts/02-plan-task.md',
    'scripts/validate-framework.mjs','.github/workflows/validate.yml'
  ])assert.equal(legacy.files.has(relative),true,relative);
  // New provider-only Stage14 docs cannot silently expand the historic
  // legacy-owned file list merely because they live under docs/.
  assert.equal(legacy.files.has('docs/CONSUMER-ASSET-SEPARATION.md'),false);
  assert.equal(legacy.files.has('docs/tasks/stage14-consumer-asset-separation.md'),false);
  assert.equal(legacy.files.has('docs/STAGE14-ACCEPTANCE-MATRIX.md'),false);
});
test('Stage14 catalog retains legacy CI/package-only prompt but never in safe surface',()=>{
  for(const p of STAGE14_PACKAGE_RUNTIME){
    assert.equal(selectAssetPaths('greenfield-safe-v1',[p]).length,0,p);
    assert.equal(selectAssetPaths('brownfield-minimal-v1',[p]).length,0,p);
  }
  assert.equal(assetSurfaceSnapshot('legacy-full-v1').sourceWorkflowIncluded,true);
  assert.equal(assetSurfaceSnapshot('greenfield-safe-v1').sourceWorkflowIncluded,false);
  assert.equal(assetSurfaceSnapshot('brownfield-minimal-v1').consumerStarterCount,0);
});
test('Stage14 only canonical packaged prompts are eligible, not arbitrary package files',()=>{
  assert.equal(selectPackagedPromptEligibility('brownfield-minimal-v1',
    'prompts/04-code-review.md'),true);
  assert.equal(selectPackagedPromptEligibility('brownfield-minimal-v1',
    'prompts/not-allowlisted.md'),false);
  assert.equal(selectPackagedPromptEligibility('greenfield-safe-v1',
    '../prompts/02-plan-task.md'),false);
});
test('Stage14 prompt override retains exact user content, absent override falls back to package',async t=>{
  const root=await scratch(t);
  const fallback=await resolvePackagedPrompt({projectRoot:root,
    relative:'prompts/02-plan-task.md',assetSet:'greenfield-safe-v1'});
  assert.equal(fallback.source,'package-fallback');
  assert.ok(fallback.content.length>0);
  await mkdir(path.join(root,'prompts'));
  const custom='LOCAL USER INSTRUCTIONS\r\n';
  await writeFile(path.join(root,'prompts/02-plan-task.md'),custom);
  const override=await resolvePackagedPrompt({projectRoot:root,
    relative:'prompts/02-plan-task.md',assetSet:'greenfield-safe-v1'});
  assert.equal(override.source,'project-override');
  assert.equal(override.content,custom);
  assert.equal(await readFile(path.join(root,'prompts/02-plan-task.md'),'utf8'),custom);
});
test('Stage14 unmanaged root can never be retired by preview',async t=>{
  const root=await scratch(t);
  await writeFile(path.join(root,'USER.md'),'ORIGINAL\r\n');
  const plan=await planConsumerAssetRetirement(root,{
    targetAssetSet:'greenfield-safe-v1'
  });
  assert.equal(plan.blocked,true);
  assert.equal(plan.executionAuthorized,false);
  assert.equal(await readFile(path.join(root,'USER.md'),'utf8'),'ORIGINAL\r\n');
  assert.deepEqual(await readdir(root),['USER.md']);
});
test('Stage14 legacy retirement preview preserves edited prompts and retains user bytes',async t=>{
  const root=await scratch(t);
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',
    stack:'generic',includeGitHub:false});
  const edited=Buffer.from([0xef,0xbb,0xbf,...Buffer.from('CUSTOMIZED\r\n')]);
  const local=path.join(root,'prompts/02-plan-task.md');
  await writeFile(local,edited);
  const before=await readdir(root);
  const plan=await planConsumerAssetRetirement(root,{
    targetAssetSet:'greenfield-safe-v1'
  });
  assert.equal(plan.readOnly,true);
  assert.equal(plan.executionAuthorized,false);
  assert.equal(plan.mutationGate,'D-01/G-FENCE_NO_GO');
  assert.ok(plan.actions.some(a=>a.path==='docs/CLI.md'&&
    a.classification==='RETIRE_CANDIDATE'));
  assert.ok(plan.actions.some(a=>a.path==='prompts/02-plan-task.md'&&
    a.classification==='PRESERVE_USER_EDIT'));
  assert.ok(plan.actions.some(a=>a.path==='AGENTS.md'&&
    a.classification==='KEEP_CONSUMER'));
  assert.deepEqual(await readFile(local),edited);
  assert.deepEqual(await readdir(root),before);
});
test('Stage14 consumer-retirement preview cannot convert an empty target to authorization',async t=>{
  const root=await scratch(t);
  await assert.rejects(()=>planConsumerAssetRetirement(root,{
    targetAssetSet:'unknown'
  }),{code:'E_ASSETSET_UNKNOWN'});
  const plan=await planConsumerAssetRetirement(root,{
    targetAssetSet:'legacy-full-v1'
  });
  assert.equal(plan.blocked,true);
  assert.equal(plan.executionAuthorized,false);
});
test('Stage14 original D-01 migration gate remains unmodified and blocking',()=>{
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.status,'NO_GO');
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
});
test('Stage14 linked modified retirement path cannot be removed or trusted',async t=>{
  const root=await scratch(t),foreign=await scratch(t);
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',
    stack:'generic',includeGitHub:false});
  const source=path.join(root,'prompts/02-plan-task.md');
  const outside=path.join(foreign,'secret.md');
  await writeFile(outside,'FOREIGN USER CONTENT\r\n');
  await rm(source);
  try{await symlink(outside,source,'file');}
  catch(e){
    if(process.platform==='win32'&&['EPERM','EACCES','ENOTSUP'].includes(e?.code))
      return t.skip('Windows privilege prevents file-symlink creation');
    throw e;
  }
  const plan=await planConsumerAssetRetirement(root,{
    targetAssetSet:'greenfield-safe-v1'
  });
  assert.equal(plan.blocked,true);
  assert.ok(plan.actions.some(a=>a.path==='prompts/02-plan-task.md'&&
    a.classification==='CONFLICT'));
  assert.equal(await readFile(outside,'utf8'),'FOREIGN USER CONTENT\r\n');
});

test('Stage14 CLI asset-plan emits only read-only inspection JSON',async t=>{
  const root=await scratch(t);
  await seedLegacyV1Fixture({targetDir:root,agent:'generic',
    stack:'generic',includeGitHub:false});
  const before=await readFile(path.join(root,'AGENTS.md'));
  const outputs=[];
  t.mock.method(console,'log',x=>outputs.push(String(x)));
  await runCli(['asset-plan',root,'--asset-set','greenfield-safe-v1','--json']);
  const report=JSON.parse(outputs.at(-1));
  assert.equal(report.readOnly,true);
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.mutationGate,'D-01/G-FENCE_NO_GO');
  assert.deepEqual(await readFile(path.join(root,'AGENTS.md')),before);
});
test('Stage14 CLI asset-plan refuses force/run/yes and absent target',async t=>{
  const root=await scratch(t);
  for(const flags of [
    ['--asset-set','greenfield-safe-v1','--yes'],
    ['--asset-set','greenfield-safe-v1','--force'],
    ['--asset-set','greenfield-safe-v1','--run'],
    ['--json']
  ]){
    await assert.rejects(()=>runCli(['asset-plan',root,...flags]),
      /strictly read-only inventory/);
  }
  assert.deepEqual(await readdir(root),[]);
});

test('Stage14 consumer health exposes contradictory managed ownership without authorizing deletion',()=>{
  const manifest={
    schemaVersion:2,
    install:{assetSet:'greenfield-safe-v1'},
    managedFiles:{
      'AGENTS.md':{},
      'docs/product/PRD.md':{},
      'prompts/02-plan-task.md':{}
    }
  };
  const report=inspectConsumerAssetHealth(manifest);
  assert.equal(report.status,'fail');
  assert.equal(report.readOnly,true);
  assert.ok(report.issues.some(x=>x.path==='prompts/02-plan-task.md'&&
    x.reason==='SAFE_SURFACE_CLAIMS_PACKAGE_ONLY'));
  assert.equal(report.counts['runtime-required'],1);
  const historical=inspectConsumerAssetHealth({
    schemaVersion:1,managedFiles:manifest.managedFiles});
  assert.equal(historical.status,'pass');
  assert.equal(historical.assetSet,'legacy-full-v1');
});
test('Stage14 health never mistakes untracked project docs for manifest-owned assets',()=>{
  const report=inspectConsumerAssetHealth({
    schemaVersion:2,install:{assetSet:'brownfield-minimal-v1'},
    managedFiles:{'AGENTS.md':{}}
  });
  assert.equal(report.status,'pass');
  assert.equal(report.doesNotInspectUnownedFiles,true);
  assert.equal(report.counts['greenfield-starter'],0);
});
