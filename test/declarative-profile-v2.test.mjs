import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {validateDeclarativeProfileV2,previewDeclarativeProfileV2} from '../lib/declarative-profile-v2.mjs';
const profile=(all=[{predicate:'fileExists',path:'Cargo.toml'}])=>({schemaVersion:2,
 kind:'vcp-community-profile',id:'profile.rust',version:'1.0.0',
 capabilities:['capability-detection'],detect:{all},contributions:{capabilities:['language.rust']}});
async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'vcp-profile-v2-'));
 try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
test('strict schema-v2 profile validates bounded source-only predicates',()=>{
 const p=validateDeclarativeProfileV2(profile());assert.equal(p.id,'profile.rust');
 assert.deepEqual(p.contributes,['language.rust']);
});
test('v2 does not weaken v1 or accept executable plugin fields',()=>{
 for(const ext of [{exec:'node evil.js'},{hooks:['preinstall']},{schemaVersion:1}]){
 const m={...profile(),...ext};assert.throws(()=>validateDeclarativeProfileV2(m));}
});
test('rejects secrets, root escape, Git internals and unbounded marker paths',()=>{
 for(const p of ['.env','.git/config','.vcp/manifest.json','../secrets','private.json']){
 assert.throws(()=>validateDeclarativeProfileV2(profile([{predicate:'fileExists',path:p}])),/E_PROFILE_V2_MARKER_SCOPE/);}
});
test('rejects arbitrary regex, external code and unbounded DSL',()=>{
 assert.throws(()=>validateDeclarativeProfileV2(profile([{predicate:'regex',path:'Cargo.toml',expr:'.*'}])));
 assert.throws(()=>validateDeclarativeProfileV2(profile(Array(9).fill({predicate:'fileExists',path:'Cargo.toml'}))));
});
test('positive evidence stays untrusted and grants no capabilities',()=>fixture(async root=>{
 await writeFile(path.join(root,'Cargo.toml'),'[package]\nname="demo"');
 const r=await previewDeclarativeProfileV2(root,profile());
 assert.equal(r.status,'MATCHED_UNTRUSTED');assert.deepEqual(r.candidateCapabilities,['language.rust']);
 assert.deepEqual(r.appliedCapabilities,[]);assert.equal(r.digestVerified,false);
}));
test('missing marker never invents matched capability',()=>fixture(async root=>{
 const r=await previewDeclarativeProfileV2(root,profile());
 assert.equal(r.status,'NOT_MATCHED');assert.deepEqual(r.candidateCapabilities,[]);
}));
test('exact package dependency predicate detects only declared dependency',()=>fixture(async root=>{
 await writeFile(path.join(root,'package.json'),JSON.stringify({devDependencies:{typescript:'5.8.0'}}));
 const r=await previewDeclarativeProfileV2(root,profile([{predicate:'packageDependency',path:'package.json',name:'typescript'}]));
 assert.equal(r.status,'MATCHED_UNTRUSTED');
 const miss=await previewDeclarativeProfileV2(root,profile([{predicate:'packageDependency',path:'package.json',name:'react-native'}]));
 assert.equal(miss.status,'NOT_MATCHED');
}));
test('bounded JSON predicate produces Boolean only, without source-content disclosure',()=>fixture(async root=>{
 await writeFile(path.join(root,'app.json'),JSON.stringify({name:'Demo',secret:'sensitive-value'}));
 const r=await previewDeclarativeProfileV2(root,profile([{predicate:'jsonFieldEquals',path:'app.json',field:'name',equals:'Demo'}]));
 assert.equal(r.status,'MATCHED_UNTRUSTED');assert.ok(!JSON.stringify(r).includes('sensitive-value'));
}));
test('linked marker refuses and returns PARTIAL, no contribution',()=>fixture(async root=>{
 const outside=path.join(os.tmpdir(),'vcp-profile-fixture-target-'+process.pid);
 await writeFile(outside,'[package]');
 try{await symlink(outside,path.join(root,'Cargo.toml'));const r=await previewDeclarativeProfileV2(root,profile());
 assert.equal(r.status,'PARTIAL');assert.deepEqual(r.candidateCapabilities,[]);}
 finally{await rm(outside,{force:true});}
}));
