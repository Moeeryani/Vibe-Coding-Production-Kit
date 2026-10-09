import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { resolveProjectPath } from '../lib/safe-path.mjs';

async function fixture(t) {
 const root=await mkdtemp(path.join(os.tmpdir(),'vcp-path-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 return root;
}
function refuse(f,reason) { return assert.rejects(f,e=>e.code==='E_VCP_PATH' && e.message.includes(reason)); }
test('purposes enforce read/write/state separation and reserved paths',async t=>{
 const root=await fixture(t);
 await writeFile(path.join(root,'a.md'),'old');
 assert.equal(await resolveProjectPath(root,'a.md'),path.join(root,'a.md'));
 await refuse(()=>resolveProjectPath(root,'a.md',{purpose:'write-new'}),'DESTINATION_EXISTS');
 assert.equal(await resolveProjectPath(root,'new/sub.md',{purpose:'write-new'}),path.join(root,'new/sub.md'));
 await refuse(()=>resolveProjectPath(root,'new/sub.md'),'MISSING_INPUT');
 await refuse(()=>resolveProjectPath(root,'.vcp/manifest.json'),'RESERVED_STATE');
 assert.equal(await resolveProjectPath(root,'.vcp/manifest.json',{purpose:'managed-state'}),path.join(root,'.vcp/manifest.json'));
 await refuse(()=>resolveProjectPath(root,'a.md',{purpose:'managed-state'}),'STATE_SCOPE');
});
test('reject traversal, alternate separators, absolute and reserved components',async t=>{
 const root=await fixture(t);
 for(const rel of ['../outside','foo/../outside','./a','a//b','/etc/passwd','C:/Windows/win.ini','a\\b','','.git/config','foo/.git/config','x:stream','aux.txt','LPT1','trailing.','space ']){
  await assert.rejects(()=>resolveProjectPath(root,rel,{purpose:'write-new'}));
 }
});
test('reject external and internal symlinks, linked parent and linked selected root',async t=>{
 if(process.platform==='win32') t.skip('native junction conformance pending');
 const root=await fixture(t);
 await mkdir(path.join(root,'real')); await writeFile(path.join(root,'real','f'),'value');
 await symlink('real',path.join(root,'alias'));
 await refuse(()=>resolveProjectPath(root,'alias/f'),'LINK_REFUSED');
 await symlink('real/f',path.join(root,'link'));
 await refuse(()=>resolveProjectPath(root,'link'),'LINK_REFUSED');
 await symlink('/etc/hosts',path.join(root,'ext'));
 await refuse(()=>resolveProjectPath(root,'ext'),'LINK_REFUSED');
 await refuse(()=>resolveProjectPath(path.join(root,'alias'),'f'),'ROOT_LINK');
});
test('reject nonregular paths and keep project bytes and paths unchanged',async t=>{
 const root=await fixture(t);
 await mkdir(path.join(root,'dir')); await writeFile(path.join(root,'file'),'data');
 const before=await readdir(root);
 await refuse(()=>resolveProjectPath(root,'dir'),'NOT_REGULAR_FILE');
 await refuse(()=>resolveProjectPath(root,'file/more',{purpose:'write-new'}),'PARENT_NOT_DIRECTORY');
 assert.deepEqual(await readdir(root),before);
});
