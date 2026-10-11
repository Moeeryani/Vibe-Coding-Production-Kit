import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectStage13BootstrapResidue} from '../lib/stage13-bootstrap-recovery.mjs';
import {retireStage13OrphanBootstrap} from '../lib/stage13-bootstrap-retire.mjs';
import {planStage13Recovery} from '../lib/stage13-recovery-plan.mjs';

const ID='adopt-'+'d'.repeat(32);
const CONSENT='c'.repeat(64);
async function fixture(t){
  const root=await mkdtemp(path.join(os.tmpdir(),'vcp-stage13-orphan-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'user.txt'),'ORIGINAL USER BYTES\n');
  return root;
}
function lockPayload(id=ID) {
  return JSON.stringify({version:2,mode:'adopt',pid:process.pid,
    host:os.hostname(),token:'b'.repeat(48),
    startedAt:new Date().toISOString(),operationId:id,
    consentFingerprint:CONSENT,bootstrapPriorVcpAbsent:true})+'\n';
}
async function initControl(root,id=ID) {
  await mkdir(path.join(root,'.vcp'));
  await writeFile(path.join(root,'.vcp/update.lock'),lockPayload(id));
}
test('empty .vcp after crash is unproven: no inferred ownership or deletion',async t=>{
  const root=await fixture(t);
  await mkdir(path.join(root,'.vcp'));
  const report=await inspectStage13BootstrapResidue(root);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'EMPTY_BOOTSTRAP_NO_PROVENANCE__MANUAL_REVIEW_ONLY');
  assert.equal(report.mayRemoveState,false);
  assert.deepEqual((await readdir(root)).sort(),['.vcp','user.txt']);
});
test('orphan adopt lock preserves user file and remains read-only',async t=>{
  const root=await fixture(t);
  await initControl(root);
  const original=await readFile(path.join(root,'user.txt'));
  const report=await inspectStage13BootstrapResidue(root);
  assert.equal(report.classification,'ORPHAN_ADOPTION_LOCK_ONLY');
  assert.equal(report.evidence.operationId,ID);
  assert.match(report.evidence.lockHash,/^[0-9a-f]{64}$/);
  assert.equal(report.writeAuthorized,false);
  assert.equal(report.mayStealLock,false);
  assert.equal((await planStage13Recovery(root)).classification,
    'ORPHAN_ADOPTION_LOCK_ONLY');
  await assert.rejects(()=>retireStage13OrphanBootstrap({targetDir:root,
    approval:{kind:'RETIRE_STAGE13_ORPHAN_TO_IN_ROOT_ARCHIVE',
      root,explicitConsent:true,evidence:report.evidence}}),
  {code:'E_G_FENCE_NO_GO'});
  assert.deepEqual(await readFile(path.join(root,'user.txt')),original);
});
test('prejournal staging belongs only to the lock operation id',async t=>{
  const root=await fixture(t);
  await initControl(root);
  await mkdir(path.join(root,'.vcp/stage',ID,'files'),{recursive:true});
  await writeFile(path.join(root,'.vcp/stage',ID,'files','AGENTS.md'),
    'candidate template only');
  const good=await inspectStage13BootstrapResidue(root);
  assert.equal(good.classification,'PREJOURNAL_STAGING_PRESENT');
  assert.ok(good.evidence.stagedFiles>=1);
  await mkdir(path.join(root,'.vcp/stage','adopt-'+'e'.repeat(32)));
  const foreign=await inspectStage13BootstrapResidue(root);
  assert.equal(foreign.classification,'BLOCKED');
  assert.equal(foreign.reason,'BOOTSTRAP_RESIDUE_UNTRUSTED');
});
test('foreign control files cannot be quarantined from guessed provenance',async t=>{
  const root=await fixture(t);
  await initControl(root);
  await writeFile(path.join(root,'.vcp','unexpected-bytes'),'do not delete');
  const report=await inspectStage13BootstrapResidue(root);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'FOREIGN_CONTROL_ENTRIES');
  assert.equal(report.mayRemoveState,false);
  assert.equal(await readFile(path.join(root,'.vcp/unexpected-bytes'),'utf8'),
    'do not delete');
});
test('linked prejournal staging is never traversed',async t=>{
  if(process.platform==='win32')t.skip('native Windows pre-WAL staging junction is exercised by test/stage13-windows-ntfs.test.mjs');
  const root=await fixture(t);
  await initControl(root);
  await symlink(os.tmpdir(),path.join(root,'.vcp/stage'));
  const report=await inspectStage13BootstrapResidue(root);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'STAGING_DIRECTORY_NOT_TRUSTED');
});
test('prejournal classifier refuses to reinterpret a durable WAL as orphan',async t=>{
  const root=await fixture(t);
  await initControl(root);
  await writeFile(path.join(root,'.vcp/transaction.json'),'{}');
  const report=await inspectStage13BootstrapResidue(root);
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'NOT_A_PREJOURNAL_ADOPTION_BOOTSTRAP');
});
