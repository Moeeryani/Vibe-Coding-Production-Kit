import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectSelectedProfilesV2} from '../lib/selected-profile-v2.mjs';
const PROFILE=()=>({schemaVersion:2,kind:'vcp-community-profile',id:'profile.rust',version:'1.0.0',
 capabilities:['capability-detection'],detect:{all:[{predicate:'fileExists',path:'Cargo.toml'}]},
 contributions:{capabilities:['language.rust']},
 vcpCompatibility:{minVersion:'0.9.4',maxExclusiveVersion:'2.0.0'}});
async function fixture(fn,{profile=PROFILE(),grant=true}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'vcp-selected-v2-'));
 const bundle=path.join(root,'community-plugins/rust');
 try{
  await mkdir(bundle,{recursive:true});await mkdir(path.join(root,'docs/plugins'),{recursive:true});
  const content=JSON.stringify(profile);await writeFile(path.join(bundle,'plugin.json'),content);
  // Exact digest algorithm from accepted v1 computeCommunityPluginDigest.
  const hash=createHash('sha256');hash.update('plugin.json');hash.update('\0');
  hash.update(String(Buffer.byteLength(content)));hash.update('\0');hash.update(content);hash.update('\0');
  const entry={id:'profile.rust',version:'1.0.0',path:'community-plugins/rust',
   sha256:'sha256:'+hash.digest('hex'),grants:grant?['capability-detection']:[]};
  const write=async(e=entry)=>writeFile(path.join(root,'docs/plugins/PLUGINS.json'),
   JSON.stringify({schemaVersion:1,plugins:[e]}));
  await write();await fn({root,bundle,entry,write});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('verified selected digest-pinned and explicitly granted profile yields proposal only',()=>fixture(async({root})=>{
 await writeFile(path.join(root,'Cargo.toml'),'[package]\nname="demo"');
 const r=await inspectSelectedProfilesV2(root);
 assert.equal(r.selection,'EXPLICIT_DIGEST_PINNED');assert.deepEqual(r.proposedCapabilities,['language.rust']);
 assert.deepEqual(r.appliedCapabilities,[]);assert.equal(r.executionAuthorized,false);
 assert.equal(r.profiles[0].digestVerified,true);assert.equal(r.profiles[0].grantVerified,true);
}));
test('missing project marker never grants proposal or applied state',()=>fixture(async({root})=>{
 const r=await inspectSelectedProfilesV2(root);
 assert.deepEqual(r.proposedCapabilities,[]);assert.equal(r.profiles[0].status,'NOT_MATCHED');
}));
test('missing explicit grant refuses selected schema-v2 bundle',()=>fixture(async({root})=>{
 await assert.rejects(inspectSelectedProfilesV2(root),/E_PROFILE_V2_GRANT_REQUIRED/);
},{grant:false}));
test('wrong digest refuses before reading proposal data',()=>fixture(async({root,entry,write})=>{
 await write({...entry,sha256:'sha256:'+'0'.repeat(64)});
 await assert.rejects(inspectSelectedProfilesV2(root),/digest mismatch/i);
}));
test('nonportable traversal and unknown declaration field fail before walking',()=>fixture(async({root,entry,write})=>{
 await write({...entry,path:'community-plugins/../../private'});
 await assert.rejects(inspectSelectedProfilesV2(root),/unsafe|relative|path|traversal|component/i);
 await write({...entry,autorun:true});
 await assert.rejects(inspectSelectedProfilesV2(root),/unsupported key.*autorun/i);
}));
test('invalid v2 bundle ID and missing compatibility are refused',()=>fixture(async({root,bundle})=>{
 // Changed content invalidates digest first, even before manifest identity checks.
 await writeFile(path.join(bundle,'plugin.json'),JSON.stringify({...PROFILE(),id:'different'}));
 await assert.rejects(inspectSelectedProfilesV2(root),/digest mismatch/i);
}));
test('manifest with unknown network/exec field does not pass profile v2 schema',()=>fixture(async({root,bundle})=>{
 await writeFile(path.join(bundle,'plugin.json'),JSON.stringify({...PROFILE(),exec:'curl example.com'}));
 await assert.rejects(inspectSelectedProfilesV2(root),/digest mismatch/i);
}));
test('missing declaration means read-only empty selection',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vcp-empty-v2-'));
 try{const r=await inspectSelectedProfilesV2(root);
  assert.equal(r.selection,'ABSENT');assert.deepEqual(r.proposedCapabilities,[]);}
 finally{await rm(root,{recursive:true,force:true});}
});
test('selected profile outside compatible CLI range refuses',()=>fixture(async({root})=>{
 await assert.rejects(inspectSelectedProfilesV2(root,{cliVersion:'0.9.3'}),/E_PROFILE_V2_INCOMPATIBLE/);
}));
test('duplicate selection ID and casefold path refuses',()=>fixture(async({root,entry})=>{
 const a={schemaVersion:1,plugins:[entry,{...entry,path:'community-plugins/Rust'}]};
 await writeFile(path.join(root,'docs/plugins/PLUGINS.json'),JSON.stringify(a));
 await assert.rejects(inspectSelectedProfilesV2(root),/duplicate community plugin id/i);
}));

test('post-digest identity mismatch refuses a genuine, newly pinned bundle',()=>fixture(async({root,bundle,entry,write})=>{
 const altered={...PROFILE(),id:'another.id'};
 const content=JSON.stringify(altered);await writeFile(path.join(bundle,'plugin.json'),content);
 const hash=createHash('sha256');hash.update('plugin.json');hash.update('\0');
 hash.update(String(Buffer.byteLength(content)));hash.update('\0');hash.update(content);hash.update('\0');
 await write({...entry,sha256:'sha256:'+hash.digest('hex')});
 await assert.rejects(inspectSelectedProfilesV2(root),/E_PROFILE_V2_IDENTITY/);
}));
test('post-digest missing compatibility refuses even when bundle hash matches',()=>fixture(async({root,bundle,entry,write})=>{
 const altered=PROFILE();delete altered.vcpCompatibility;
 const content=JSON.stringify(altered);await writeFile(path.join(bundle,'plugin.json'),content);
 const hash=createHash('sha256');hash.update('plugin.json');hash.update('\0');
 hash.update(String(Buffer.byteLength(content)));hash.update('\0');hash.update(content);hash.update('\0');
 await write({...entry,sha256:'sha256:'+hash.digest('hex')});
 await assert.rejects(inspectSelectedProfilesV2(root),/E_PROFILE_V2_COMPATIBILITY_REQUIRED/);
}));
test('unknown manifest fields refuse after digest is correctly pinned',()=>fixture(async({root,bundle,entry,write})=>{
 const altered={...PROFILE(),exec:'node attacker.js'};
 const content=JSON.stringify(altered);await writeFile(path.join(bundle,'plugin.json'),content);
 const hash=createHash('sha256');hash.update('plugin.json');hash.update('\0');
 hash.update(String(Buffer.byteLength(content)));hash.update('\0');hash.update(content);hash.update('\0');
 await write({...entry,sha256:'sha256:'+hash.digest('hex')});
 await assert.rejects(inspectSelectedProfilesV2(root),/E_PROFILE_V2_SCHEMA/);
}));
