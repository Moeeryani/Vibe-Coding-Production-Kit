// B-1 Phase 7: atomic write engine tests.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mutationTest } from './helpers/layer-assertion.mjs';
import { atomicWriteFile, atomicWriteManifest } from '../lib/writer-atomic.mjs';

const fresh=async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vcp-wa-'));
  await mkdir(path.join(dir,'.vcp'),{recursive:true});
  return dir;
};

mutationTest('atomic write creates new file with exact bytes',async()=>{
  const root=await fresh();
  const {sha256}=await atomicWriteFile(root,'hello.txt',Buffer.from('hello'));
  assert.equal(await readFile(path.join(root,'hello.txt'),'utf8'),'hello');
  assert.match(sha256,/^[a-f0-9]{64}$/);
});

mutationTest('atomic write replaces existing file without tearing',async()=>{
  const root=await fresh();
  await atomicWriteFile(root,'data.txt',Buffer.from('v1-content-here'));
  await atomicWriteFile(root,'data.txt',Buffer.from('v2-content-here!!'));
  assert.equal(await readFile(path.join(root,'data.txt'),'utf8'),'v2-content-here!!');
});

mutationTest('no temp files left behind',async()=>{
  const root=await fresh();
  await atomicWriteFile(root,'a.txt',Buffer.from('x'));
  const { readdir }=await import('node:fs/promises');
  const entries=await readdir(root);
  assert.ok(!entries.some(e=>e.startsWith('.vcp-tmp-')),`temp left: ${entries}`);
});

test('atomic write rejects oversized content',async()=>{
  const root=await fresh();
  await assert.rejects(
    atomicWriteFile(root,'big.bin',Buffer.alloc(9*1024*1024)),
    /E_ATOMIC_BYTES/);
});

test('atomic write rejects bad mode',async()=>{
  const root=await fresh();
  await assert.rejects(
    atomicWriteFile(root,'x.txt',Buffer.from('x'),{mode:0o1000}),
    /E_ATOMIC_MODE/);
});

mutationTest('manifest write uses 0600 and verifies hash',async()=>{
  const root=await fresh();
  const bytes=Buffer.from('{"v":2}\n');
  const { stat }=await import('node:fs/promises');
  await atomicWriteManifest(root,bytes);
  const st=await stat(path.join(root,'.vcp','manifest.json'));
  assert.equal(st.mode&0o777,0o600);
});

test('manifest write rejects hash mismatch',async()=>{
  const root=await fresh();
  await assert.rejects(
    atomicWriteManifest(root,Buffer.from('x'),{expectedHash:'0'.repeat(64)}),
    /E_ATOMIC_MANIFEST_HASH/);
});
