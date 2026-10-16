// B-1 Phase 6: identity layer security tests.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  currentPrincipal,verifyPrincipal,pinPathIdentity,verifyPathIdentity,
  verifyNamespaceContained,verifyWriterBoundary
} from '../lib/writer-identity.mjs';

test('valid writer: current principal verifies against itself',()=>{
  const p=currentPrincipal();
  assert.equal(p.kind,'posix');
  assert.ok(Number.isInteger(p.uid));
  const back=verifyPrincipal(p);
  assert.equal(back.uid,p.uid);
});

test('wrong principal rejected',()=>{
  const p=currentPrincipal();
  const wrong={...p,uid:p.uid+999999};
  assert.throws(()=>verifyPrincipal(wrong,p),/E_WRITER_PRINCIPAL_MISMATCH/);
});

test('stale identity rejected (kind change)',()=>{
  const p=currentPrincipal();
  assert.throws(()=>verifyPrincipal({kind:'windows',sid:'S-1-5-21-x',proven:true},p),
    /E_WRITER_PRINCIPAL_MISMATCH/);
});

test('unproven Windows identity fails closed',()=>{
  const win={kind:'windows',sid:null,proven:false};
  assert.throws(()=>verifyPrincipal(win,win),/E_WRITER_PRINCIPAL_UNPROVEN/);
});

test('object identity pinning detects replacement',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vcp-wid-'));
  const f=path.join(dir,'file.txt');
  await writeFile(f,'v1');
  const pin=await pinPathIdentity(f);
  assert.ok(await verifyPathIdentity(f,pin));
  await writeFile(f,'v2'); // same inode: still valid
  assert.ok(await verifyPathIdentity(f,pin));
});

test('namespace containment rejects escapes',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vcp-wid-'));
  await assert.rejects(
    verifyNamespaceContained(dir,path.join(dir,'..','escape')),
    /E_WRITER_NAMESPACE_ESCAPE/);
  await assert.rejects(
    verifyNamespaceContained(dir,'/etc/passwd'),
    /E_WRITER_NAMESPACE_ESCAPE/);
});

test('namespace rejects symlink components',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vcp-wid-'));
  const outside=await mkdtemp(path.join(os.tmpdir(),'vcp-wid-out-'));
  await symlink(outside,path.join(dir,'link'));
  await assert.rejects(
    verifyNamespaceContained(dir,path.join(dir,'link','x')),
    /E_WRITER_NAMESPACE_UNSAFE/);
});

test('writer boundary requires a named operation',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'vcp-wid-'));
  await assert.rejects(verifyWriterBoundary({root:dir}),/E_WRITER_BOUNDARY/);
  const ok=await verifyWriterBoundary({root:dir,operation:'test-op'});
  assert.equal(ok.operation,'test-op');
  assert.ok(ok.principal.proven);
});
