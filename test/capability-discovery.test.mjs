import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {discoverProjectCapabilities} from '../lib/capability-discovery.mjs';
async function fixture(cb){const root=await mkdtemp(path.join(os.tmpdir(),'vcp-capabilities-'));
 const put=async(p,data)=>{await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),data);};
 try{await cb({root,put});}finally{await rm(root,{recursive:true,force:true});}}
const ids=r=>r.capabilities.map(x=>x.id);
test('capabilities: empty project grants none',()=>fixture(async({root})=>{
 const r=await discoverProjectCapabilities(root);assert.deepEqual(ids(r),[]);assert.deepEqual(r.appliedCapabilities,[]);assert.equal(r.status,'INSPECTED');}));
test('capabilities: polyglot deterministic evidence remains proposed',()=>fixture(async({root,put})=>{
 await put('go.mod','module example');await put('pyproject.toml','[project]\nname="example"');await put('Cargo.toml','[package]\nname="demo"');
 const r=await discoverProjectCapabilities(root);assert.deepEqual(ids(r),['language.go','language.python','language.rust']);
 assert.ok(r.capabilities.every(c=>c.application==='NOT_APPLIED'));}));
test('capabilities: React Native application with dependency and app marker is evidence, not applied profile',()=>fixture(async({root,put})=>{
 await put('package.json',JSON.stringify({dependencies:{'react-native':'0.75.0'},devDependencies:{typescript:'5.0'}}));
 await put('app.json',JSON.stringify({name:'Demo'}));
 const r=await discoverProjectCapabilities(root,{legacyInstalledStack:'javascript'});
 assert.deepEqual(ids(r),['ecosystem.node','framework.react-native','language.typescript']);
 assert.equal(r.legacyStackSummary,'javascript');assert.deepEqual(r.appliedCapabilities,[]);}));
test('capabilities: malformed JSON cannot grant node/react-native',()=>fixture(async({root,put})=>{
 await put('package.json','{not valid');const r=await discoverProjectCapabilities(root);
 assert.ok(!ids(r).includes('framework.react-native'));assert.equal(r.status,'PARTIAL');
 assert.ok(r.issues.some(i=>i.reason==='INVALID_PACKAGE_JSON'));}));
test('capabilities: symlink marker cannot grant evidence',async(t)=>fixture(async({root,put})=>{
 const outside=await mkdtemp(path.join(os.tmpdir(),'vcp-cap-out-'));
 try{await put('README.md','safe');await writeFile(path.join(outside,'go.mod'),'module evil');
 try{await symlink(path.join(outside,'go.mod'),path.join(root,'go.mod'));}catch(e){if(['EPERM','ENOTSUP'].includes(e.code))return t.skip('symlinks unavailable');throw e;}
 const r=await discoverProjectCapabilities(root);assert.ok(!ids(r).includes('language.go'));assert.equal(r.status,'PARTIAL');}
 finally{await rm(outside,{recursive:true,force:true});}}));
test('capabilities: oversized marker never grants capability',()=>fixture(async({root,put})=>{
 await put('requirements.txt','a'.repeat(200000));const r=await discoverProjectCapabilities(root);
 assert.ok(!ids(r).includes('language.python'));assert.equal(r.status,'PARTIAL');}));

test('capabilities: React Native dependency-only library does not impersonate an app',()=>fixture(async({root,put})=>{
 await put('package.json',JSON.stringify({dependencies:{'react-native':'0.75.0'}}));
 const r=await discoverProjectCapabilities(root);
 assert.deepEqual(ids(r),['ecosystem.node']);
}));
