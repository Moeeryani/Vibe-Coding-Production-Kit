import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,symlink} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadVerifiedCommunityProfileV2} from '../lib/community-profile-v2-runtime.mjs';
import {loadCommunityPlugins} from '../lib/community-plugins.mjs';
import {inspectSelectedProfilesV2} from '../lib/selected-profile-v2.mjs';
import {computeCommunityPluginDigest} from '../lib/community-plugins.mjs';
const legacyProfile=(id='profile.legacy')=>({
 schemaVersion:1,kind:'vcp-community-profile',id,version:'1.0.0',
 name:'Legacy Guidance',description:'Legacy text-only guidance',
 vcpCompatibility:{minVersion:'0.9.4',maxExclusiveVersion:'2.0.0'},
 capabilities:['guidance'],
 contributions:{guidance:[{path:'guide.md',modes:['plan'],title:'Guide'}],verificationProposals:[]}
});
const profile=()=>({schemaVersion:2,kind:'vcp-community-profile',id:'profile.rust',version:'1.0.0',
 capabilities:['capability-detection'],detect:{all:[{predicate:'fileExists',path:'Cargo.toml'}]},
 contributions:{capabilities:['language.rust']},
 vcpCompatibility:{minVersion:'0.9.4',maxExclusiveVersion:'2.0.0'}});
async function fixture(callback){
 const root=await mkdtemp(path.join(os.tmpdir(),'vcp-runtime-v2-'));
 try{
  await mkdir(path.join(root,'docs/plugins'),{recursive:true});
  await mkdir(path.join(root,'community-plugins/rust'),{recursive:true});
  const dir=path.join(root,'community-plugins/rust');
  async function writeBundle(manifest=profile(),id='profile.rust',grants=['capability-detection']){
   await writeFile(path.join(dir,'plugin.json'),JSON.stringify(manifest));
   if(manifest.schemaVersion===1)await writeFile(path.join(dir,'guide.md'),'# Legacy guidance\n');
   const b=await computeCommunityPluginDigest(root,'community-plugins/rust');
   const selection={id,version:'1.0.0',path:'community-plugins/rust',sha256:b.digest,grants};
   await writeFile(path.join(root,'docs/plugins/PLUGINS.json'),JSON.stringify({schemaVersion:1,plugins:[selection]}));
   return {bundle:b,selection,manifest};
  }
  await callback({root,dir,writeBundle});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('schema-v2 trusted selected marker yields proposal and no applied capability',()=>fixture(async({root,writeBundle})=>{
 await writeBundle();await writeFile(path.join(root,'Cargo.toml'),'[package]\nname="demo"');
 const raw=await loadCommunityPlugins(root);assert.equal(raw.plugins[0].schemaVersion,2);
 assert.deepEqual(raw.plugins[0].candidateCapabilities,['language.rust']);
 assert.deepEqual(raw.plugins[0].guidance,[]);
 assert.deepEqual(raw.plugins[0].verificationProposals,[]);
 assert.equal(raw.plugins[0].executionAuthorized,false);
 const preview=await inspectSelectedProfilesV2(root);
 assert.deepEqual(preview.proposedCapabilities,['language.rust']);
 assert.deepEqual(preview.appliedCapabilities,[]);
}));
test('no marker reports no v2 capabilities',()=>fixture(async({root,writeBundle})=>{
 await writeBundle();let x=await inspectSelectedProfilesV2(root);
 assert.deepEqual(x.proposedCapabilities,[]);assert.equal(x.profiles[0].status,'NOT_MATCHED');
}));
test('missing grant refuses v2 profile',()=>fixture(async({root,writeBundle})=>{
 await writeBundle(profile(),'profile.rust',[]);
 await assert.rejects(loadCommunityPlugins(root),/E_PROFILE_V2_GRANT_REQUIRED/);
}));
test('multiple grants refuse capability escalation',()=>fixture(async({root,writeBundle})=>{
 await writeBundle(profile(),'profile.rust',['capability-detection','guidance']);
 await assert.rejects(loadCommunityPlugins(root),/E_PROFILE_V2_GRANT_REQUIRED/);
}));
test('v1 bundle with v2 grant refuses, even when selected',()=>fixture(async({root,writeBundle})=>{
 await writeBundle(legacyProfile('profile.rust'));
 const file=path.join(root,'docs/plugins/PLUGINS.json');
 const dec=JSON.parse(await readFile(file,'utf8'));dec.plugins[0].grants=['capability-detection'];
 await writeFile(file,JSON.stringify(dec));
 await assert.rejects(loadCommunityPlugins(root),/E_PROFILE_V1_GRANT_UNSUPPORTED/);
}));
test('valid v1 remains untouched and has no capability proposal',()=>fixture(async({root,writeBundle})=>{
 await writeBundle(legacyProfile('profile.rust'),'profile.rust',['guidance']);
 const preview=await inspectSelectedProfilesV2(root);
 assert.deepEqual(preview.proposedCapabilities,[]);assert.deepEqual(preview.legacyV1Selections,['profile.rust']);
}));
test('tampered bundle refuses before marker evaluation',()=>fixture(async({root,dir,writeBundle})=>{
 await writeBundle();await writeFile(path.join(dir,'extra.md'),'malicious edit');
 await assert.rejects(loadCommunityPlugins(root),/digest mismatch/i);
}));
test('wrong profile identity refuses after genuine digest pin',()=>fixture(async({root,writeBundle})=>{
 await writeBundle({...profile(),id:'profile.another'});
 await assert.rejects(loadCommunityPlugins(root),/E_PROFILE_V2_IDENTITY/);
}));
test('incompatible VCP version refuses',()=>fixture(async({root,writeBundle})=>{
 await writeBundle();await assert.rejects(loadCommunityPlugins(root,{cliVersion:'0.9.3'}),/E_PROFILE_V2_INCOMPATIBLE/);
}));
test('missing compatibility refuses',()=>fixture(async({root,writeBundle})=>{
 const p=profile();delete p.vcpCompatibility;await writeBundle(p);
 await assert.rejects(loadCommunityPlugins(root),/E_PROFILE_V2_COMPATIBILITY_REQUIRED/);
}));
test('unsupported exec/network fields refuse after successful digest pin',()=>fixture(async({root,writeBundle})=>{
 await writeBundle({...profile(),postinstall:'node evil.js'});
 await assert.rejects(loadCommunityPlugins(root),/E_PROFILE_V2_SCHEMA/);
}));
test('unsafe symlink marker yields partial evidence, not applied capability',()=>fixture(async({root,writeBundle})=>{
 await writeBundle();await symlink('/tmp',path.join(root,'Cargo.toml'));
 const result=await inspectSelectedProfilesV2(root);
 assert.equal(result.status,'PARTIAL');assert.deepEqual(result.proposedCapabilities,[]);
}));
test('even a valid digest cannot bind a different supplied manifest',()=>fixture(async({root,writeBundle})=>{
 const {bundle,selection}=await writeBundle();
 await assert.rejects(loadVerifiedCommunityProfileV2({root,selection,bundle,
  rawManifest:{...profile(),id:'profile.another'},cliVersion:'0.9.4'}),/E_PROFILE_V2_TRUST_BOUNDARY/);
}));
test('empty marker does not count as application evidence',()=>fixture(async({root,writeBundle})=>{
 await writeBundle();await writeFile(path.join(root,'Cargo.toml'),'');
 const r=await inspectSelectedProfilesV2(root);assert.deepEqual(r.proposedCapabilities,[]);
}));
test('absent plugin declaration preserves explicit no-selection',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vcp-no-plugin-'));
 try{const x=await inspectSelectedProfilesV2(root);assert.equal(x.selection,'ABSENT');}
 finally{await rm(root,{recursive:true,force:true});}
});
test('mixed schema-v1 and schema-v2 selections keep guidance separate from detector proposals',()=>fixture(async({root,writeBundle})=>{
 const {selection}=await writeBundle();
 await writeFile(path.join(root,'Cargo.toml'),'[package]\nname="demo"');
 const legacy=legacyProfile();
 const legacyRoot=path.join(root,'community-plugins/legacy');await mkdir(legacyRoot,{recursive:true});
 await writeFile(path.join(legacyRoot,'plugin.json'),JSON.stringify(legacy));
 await writeFile(path.join(legacyRoot,'guide.md'),'# Legacy guidance\n');
 const digest=await computeCommunityPluginDigest(root,'community-plugins/legacy');
 const other={id:'profile.legacy',version:'1.0.0',path:'community-plugins/legacy',sha256:digest.digest,grants:['guidance']};
 await writeFile(path.join(root,'docs/plugins/PLUGINS.json'),
  JSON.stringify({schemaVersion:1,plugins:[selection,other]}));
 const r=await inspectSelectedProfilesV2(root);
 assert.deepEqual(r.legacyV1Selections,['profile.legacy']);
 assert.deepEqual(r.proposedCapabilities,['language.rust']);
 assert.equal(r.profiles.length,1);assert.deepEqual(r.appliedCapabilities,[]);
}));
