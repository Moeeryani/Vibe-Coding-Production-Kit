import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,writeFile,readdir,readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {describeStage13Transaction} from '../lib/stage13-transaction.mjs';
import {planStage13RecoveryLock,
  acquireStage13RecoveryLock} from '../lib/stage13-recovery-lock.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const id='adopt-'+'7'.repeat(32),consent='a'.repeat(64);
async function fixture(t,{pid=process.pid,lockId=id}={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-recovery-lock-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'.vcp/backups',id),{recursive:true});
  await writeFile(path.join(root,'USER.txt'),'USER ORIGINAL BYTES');
  const staged=path.join(root,'.vcp/stage',id,'files','AGENTS.md');
  await mkdir(path.dirname(staged),{recursive:true});
  const stageBytes=Buffer.from('STAGE13 NEW OWNED FILE\n');
  await writeFile(staged,stageBytes);
  const stageInfo=await lstat(staged,{bigint:true});
  const rootInfo=await lstat(root,{bigint:true});
  const rootIdentity=sha(Buffer.from(root+'|'+rootInfo.dev+'|'+rootInfo.ino));
  const journal=describeStage13Transaction({
    id,rootIdentity,consentFingerprint:consent,
    manifestSha256:'c'.repeat(64),minimumReaderVersion:'0.9.4',
    phase:'snapshotted',createdAt:'2026-10-11T00:00:00.000Z',
    items:[{path:'AGENTS.md',kind:'whole-file',oldSha256:null,
      newSha256:sha(stageBytes),baselineSha256:sha(stageBytes),
      stagedDev:stageInfo.dev.toString(),
      stagedIno:stageInfo.ino.toString()}]
  });
  await writeFile(path.join(root,'.vcp/transaction.json'),
    JSON.stringify(journal,null,2)+'\n');
  await writeFile(path.join(root,'.vcp/backups',id,'backup.json'),
    JSON.stringify({kind:'stage13-complete-recovery-point',
      formatVersion:3,id,rootIdentity:journal.rootIdentity,
      consentFingerprint:consent,manifestSha256:journal.manifestSha256,
      minimumReaderVersion:journal.minimumReaderVersion,
      previousVcpAbsent:true,items:journal.items,createdDirectories:[]
    },null,2)+'\n');
  if(pid!==null)await writeFile(path.join(root,'.vcp/update.lock'),
    JSON.stringify({version:2,mode:'adopt',pid,host:os.hostname(),
      token:'f'.repeat(48),startedAt:new Date().toISOString(),
      operationId:lockId,consentFingerprint:consent,
      bootstrapPriorVcpAbsent:true})+'\n');
  return root;
}
test('Stage13 recovery refuses takeover while original lock owner is alive',async t=>{
  const root=await fixture(t);
  const plan=await planStage13RecoveryLock(root);
  if(process.platform==='win32') {
    assert.equal(plan.classification,'BLOCKED');
    assert.equal(plan.reason,'E_STAGE13_NATIVE_PROVIDER_UNAVAILABLE');
    assert.equal(plan.writeAuthorized,false);
    assert.equal((await readdir(path.join(root,'.vcp'))).includes('update.lock'),true);
    return;
  }
  assert.equal(plan.classification,'LOCK_OWNER_MAY_BE_ALIVE');
  assert.equal(plan.writeAuthorized,false);
  assert.equal(plan.mayDeleteLock,false);
  assert.equal((await readdir(path.join(root,'.vcp'))).includes('update.lock'),
    true);
});
test('Stage13 recovery reports fresh lock candidate without stealing any path',async t=>{
  const root=await fixture(t,{pid:null});
  const plan=await planStage13RecoveryLock(root);
  if(process.platform==='win32') {
    assert.equal(plan.classification,'BLOCKED');
    assert.equal(plan.reason,'E_STAGE13_NATIVE_PROVIDER_UNAVAILABLE');
    assert.equal(plan.writeAuthorized,false);
    assert.equal(await readFile(path.join(root,'USER.txt'),'utf8'),
      'USER ORIGINAL BYTES');
    return;
  }
  assert.equal(plan.classification,'FRESH_RECOVERY_LOCK_CANDIDATE');
  assert.equal(plan.lockSha256,null);
  assert.equal(plan.requiresOwnerApproval,true);
  assert.equal(await readFile(path.join(root,'USER.txt'),'utf8'),
    'USER ORIGINAL BYTES');
});
test('Stage13 recovery refuses foreign-operation adoption lock',async t=>{
  const root=await fixture(t,{lockId:'adopt-'+'8'.repeat(32)});
  const plan=await planStage13RecoveryLock(root);
  if(process.platform==='win32') {
    assert.equal(plan.classification,'BLOCKED');
    assert.equal(plan.reason,'E_STAGE13_NATIVE_PROVIDER_UNAVAILABLE');
    assert.equal(plan.writeAuthorized,false);
    return;
  }
  assert.equal(plan.classification,'BLOCKED');
  assert.equal(plan.reason,'E_STAGE13_RECOVERY_LOCK_FOREIGN');
});
test('Stage13 recovery direct writer does not read or mutate before hard gate',async t=>{
  const root=await fixture(t,{pid:null});
  await assert.rejects(()=>acquireStage13RecoveryLock({
    targetDir:root,approval:{intent:'RECOVER_STAGE13_EXACT_TRANSACTION',
      root,explicitConsent:true}}),{code:'E_G_FENCE_NO_GO'});
  assert.equal(await readFile(path.join(root,'USER.txt'),'utf8'),
    'USER ORIGINAL BYTES');
});
