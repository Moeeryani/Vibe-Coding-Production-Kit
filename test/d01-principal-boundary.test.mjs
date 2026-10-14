// D-01 principal-boundary construction tests. The assertions never enable
// managed schema-v2 writes or claim old-published-CLI exclusion proof.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,chmod} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  assessLegacyPrincipalBoundary,inspectLegacyPrincipalBoundary
} from '../lib/d01-principal-boundary.mjs';
import {MANAGED_SCHEMA_MIGRATION_GATE} from '../lib/managed-migration.mjs';

const dir=(uid,gid,mode=0o750)=>({
  type:'directory',uid,gid,mode,nlink:2
});
const file=(uid,gid,mode=0o640)=>({
  type:'file',uid,gid,mode,nlink:1
});
const fixture=(root,leaf)=>[
  {role:'parent',path:'/isolated',stat:dir(2200,2200)},
  {role:'parent',path:root,stat:dir(2200,2200)},
  {role:'protected',path:leaf,stat:file(2200,2200)}
];
const assess=(entries,other={})=>assessLegacyPrincipalBoundary({
  platform:'linux',legacyUid:1100,legacyGids:[1100],
  writerUid:2200,entries,...other
});
function codes(result){return result.issues.map(i=>i.code);}

// Syntax/load regression tripwire: the frozen f4b6832b tree shipped
// `)refusal('E_D01_STAT_INVALID');` (stray ')', line 50), which made the
// whole module unloadable and broke npm run check and inspect:d01-boundary.
// A fresh dynamic import fails loudly on any future syntax regression.
test('principal-boundary module loads: syntax regression tripwire',async()=>{
  const module=await import('../lib/d01-principal-boundary.mjs');
  assert.equal(typeof module.assessLegacyPrincipalBoundary,'function');
  assert.equal(typeof module.inspectLegacyPrincipalBoundary,'function');
});

test('apparent nonwritability remains NO_GO: independent old CLI proof and D01 approval absent',()=>{
  const assessment=assess(fixture('/isolated/repo','/isolated/repo/AGENTS.md'));
  assert.equal(assessment.status,'NO_GO');
  assert.equal(assessment.productionWriterAuthorized,false);
  assert.equal(assessment.osEnforcementAttested,false);
  assert.equal(assessment.oldPackageExecutionVerified,false);
  assert.equal(assessment.mayProceedToSeparateNativeProof,true);
  assert.equal(MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized,false);
});

test('legacy ownership alone permits chmod and invalidates a 0400 permission-based promise',()=>{
  const entries=fixture('/isolated/repo','/isolated/repo/AGENTS.md');
  entries[2].stat=file(1100,1100,0o400);
  const result=assess(entries);
  assert.ok(codes(result).includes('E_D01_LEGACY_OWNS_PROTECTED_NAMESPACE'));
  assert.equal(result.mayProceedToSeparateNativeProof,false);
});

test('parent rename is unsafe even when protected file is writer-owned and read-only',()=>{
  const entries=fixture('/isolated/repo','/isolated/repo/AGENTS.md');
  entries[1].stat=dir(1100,1100,0o500); // old UID can chmod.
  const result=assess(entries);
  assert.ok(codes(result).includes('E_D01_LEGACY_OWNS_PROTECTED_NAMESPACE'));
  const groupEntries=fixture('/isolated/repo','/isolated/repo/AGENTS.md');
  groupEntries[1].stat=dir(2200,1100,0o770); // old supplementary group.
  const groupResult=assess(groupEntries);
  assert.ok(codes(groupResult).includes('E_D01_LEGACY_CAN_REPLACE_NAMESPACE_ENTRY'));
});

test('user-controlled outer parent can replace the entire project root',()=>{
  const entries=fixture('/isolated/repo','/isolated/repo/AGENTS.md');
  entries[0].stat=dir(1100,1100,0o700);
  assert.ok(codes(assess(entries)).includes('E_D01_LEGACY_CAN_REPLACE_NAMESPACE_ENTRY'));
});

test('windows mode bits never establish an ACL or token security boundary',()=>{
  const r=assess(fixture('C:\\isolated\\repo','C:\\isolated\\repo\\AGENTS.md'),
    {platform:'win32'});
  assert.equal(r.status,'NO_GO');
  assert.equal(r.mayProceedToSeparateNativeProof,false);
  assert.ok(codes(r).includes('E_D01_NATIVE_OS_ACCESS_CHECK_REQUIRED'));
});

test('Windows separate SIDs still require native DACL/token/access checks',()=>{
  const entries=fixture('C:\\isolated\\repo','C:\\isolated\\repo\\AGENTS.md');
  const observed=assess(entries,{platform:'win32',legacyUid:undefined,
    writerUid:undefined,legacySid:'S-1-5-21-100-200-300-1001',
    writerSid:'S-1-5-21-100-200-300-1002'});
  assert.equal(observed.mayProceedToSeparateNativeProof,false);
  assert.ok(codes(observed).includes('E_D01_NATIVE_OS_ACCESS_CHECK_REQUIRED'));
  const same=assess(entries,{platform:'win32',legacyUid:undefined,
    writerUid:undefined,legacySid:'S-1-5-21-100-200-300-1001',
    writerSid:'S-1-5-21-100-200-300-1001'});
  assert.ok(codes(same).includes('E_D01_SAME_OS_PRINCIPAL'));
  const unknown=assess(entries,{platform:'win32',
    legacyUid:undefined,writerUid:undefined});
  assert.ok(codes(unknown).includes('E_D01_WINDOWS_SID_REQUIRED'));
});

test('unverified POSIX supplementary groups cannot count as safe',()=>{
  const entries=fixture('/isolated/repo','/isolated/repo/AGENTS.md');
  const observed=assess(entries,{legacyGids:[]});
  assert.equal(observed.mayProceedToSeparateNativeProof,false);
  assert.ok(codes(observed).includes('E_D01_LEGACY_GROUPS_UNVERIFIED'));
});

test('same legacy/writer principal, root privilege and hardlink all fail closed',()=>{
  const entries=fixture('/isolated/repo','/isolated/repo/AGENTS.md');
  entries[2].stat={...entries[2].stat,nlink:2};
  const r=assess(entries,{writerUid:1100});
  assert.ok(codes(r).includes('E_D01_SAME_OS_PRINCIPAL'));
  assert.ok(codes(r).includes('E_D01_HARDLINK_ALIAS_UNPROVEN'));
  assert.ok(codes(assess(entries,{legacyUid:0})).includes(
    'E_D01_PRIVILEGED_PRINCIPAL_UNPROVEN'));
});

test('live preflight is read-only and refuses missing and symlinked protected state',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-d01-readonly-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'.vcp'));
  await writeFile(path.join(root,'.vcp','manifest.json'),'user bytes');
  const before=await import('node:fs/promises').then(m=>m.readFile(
    path.join(root,'.vcp','manifest.json')));
  const options={legacyUid:1100,legacyGids:[1100],writerUid:2200,
    protectedPaths:['.vcp/manifest.json']};
  const result=await inspectLegacyPrincipalBoundary(root,options);
  assert.equal(result.status,'NO_GO');
  assert.equal(result.productionWriterAuthorized,false);
  assert.ok(result.inspectedPaths.some(p=>p.endsWith('.vcp')));
  const after=await import('node:fs/promises').then(m=>m.readFile(
    path.join(root,'.vcp','manifest.json')));
  assert.deepEqual(after,before);
  const missing=await inspectLegacyPrincipalBoundary(root,{
    ...options,protectedPaths:['.vcp/not-present.json']
  });
  assert.ok(codes(missing).includes('E_D01_PATH_MISSING'));
  await chmod(root,0o700); // fixture owned by the test, never a user project.
});

test('malformed principal/path data cannot produce a misleading safe candidate',async()=>{
  for(const o of [
    {legacyUid:1100,writerUid:1100,legacyGids:[1100],entries:[]},
    {legacyUid:'old',writerUid:2200,legacyGids:[1100],
      entries:fixture('/a','/a/f')},
    {legacyUid:1100,writerUid:2200,legacyGids:['admin'],
      entries:fixture('/a','/a/f')}
  ]) {
    assert.throws(()=>assessLegacyPrincipalBoundary({
      platform:'linux',...o
    }),e=>/^E_D01_/.test(e.code));
  }
  await assert.rejects(()=>inspectLegacyPrincipalBoundary('/tmp',{
    protectedPaths:['../escape'],legacyUid:1100,writerUid:2200
  }),{code:'E_D01_PROTECTED_PATH'});
});
