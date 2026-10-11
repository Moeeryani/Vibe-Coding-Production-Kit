import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LinuxFsProvider,DEFAULT_HELPER_PATH} from '../lib/linux-fs-provider.mjs';

const linux=process.platform==='linux';
async function nativeReady(t){
  if(!linux){t.skip('Native Linux-only preservation proof');return false;}
  try{await access(DEFAULT_HELPER_PATH);}
  catch {assert.fail('Build Linux helper before Stage13 acceptance tests: npm run build:native-linux');}
  return true;
}
async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-native-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  return root;
}
test('Linux native RENAME_EXCHANGE retains both file inodes and contents',async t=>{
  if(!await nativeReady(t))return;
  const root=await fixture(t);
  const fsops=new LinuxFsProvider();
  await writeFile(path.join(root,'original.md'),'user original');
  await writeFile(path.join(root,'staged.md'),'candidate replacement');
  const beforeUser=await fsops.statIdentity(root,'original.md');
  const beforeStaged=await fsops.statIdentity(root,'staged.md');
  const moved=await fsops.exchangeNames(root,'staged.md','original.md');
  assert.equal(moved.srcParentSynced,true);
  assert.equal(moved.dstParentSynced,true);
  assert.equal(await readFile(path.join(root,'original.md'),'utf8'),
    'candidate replacement');
  assert.equal(await readFile(path.join(root,'staged.md'),'utf8'),
    'user original');
  const afterUser=await fsops.statIdentity(root,'original.md');
  const afterStaged=await fsops.statIdentity(root,'staged.md');
  assert.equal(afterUser.inoExact,beforeStaged.inoExact);
  assert.equal(afterStaged.inoExact,beforeUser.inoExact);
  await fsops.exchangeNames(root,'staged.md','original.md');
  assert.equal(await readFile(path.join(root,'original.md'),'utf8'),
    'user original');
  assert.equal(await readFile(path.join(root,'staged.md'),'utf8'),
    'candidate replacement');
});
test('Linux native staged file and directory modes are exact under umask',async t=>{
  if(!await nativeReady(t))return;
  const root=await fixture(t);
  const fsops=new LinuxFsProvider();
  const old=process.umask(0o077);
  try {
    const made=await fsops.createDirectory(root,'created-directory',0o755);
    assert.equal(made.directorySynced,true);
    const dir=await fsops.statIdentity(root,'created-directory');
    assert.equal(dir.mode,0o755);
    const receipt=await fsops.writeFileSynced(root,'fresh.md',
      Buffer.from('safe owned bytes'),0o644);
    assert.equal(receipt.dataSynced,true);
    assert.equal(receipt.directorySynced,true);
    const file=await fsops.statIdentity(root,'fresh.md');
    assert.equal(file.mode,0o644);
  }finally{process.umask(old);}
});
test('Linux native exchange never fabricates missing file or overwrites source',async t=>{
  if(!await nativeReady(t))return;
  const root=await fixture(t);
  const fsops=new LinuxFsProvider();
  await writeFile(path.join(root,'source.md'),'must remain');
  await assert.rejects(()=>fsops.exchangeNames(root,'source.md','missing.md'));
  assert.equal(await readFile(path.join(root,'source.md'),'utf8'),
    'must remain');
  await assert.rejects(()=>fsops.exchangeNames(root,'source.md','source.md'),
    {code:'E_FS_PROVIDER_PATH'});
});
