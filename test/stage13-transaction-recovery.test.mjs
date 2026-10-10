import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {composeInitialManagedSection} from '../lib/managed-markdown.mjs';
import {describeStage13Transaction,validateStage13Transaction,
  assertStage13TransactionTransition} from '../lib/stage13-transaction.mjs';
import {classifyStage13RecoverySnapshot,
  assertStage13RecoveryActionsStillMatch} from '../lib/stage13-recovery-contract.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const old=Buffer.from('Original instructions\r\nNever overwrite this.\r\n');
const section=composeInitialManagedSection(old,'agent-routing',
  Buffer.from('Use VCP project routing.\n'));
const content=Buffer.from('new file bytes');
const manifest=Buffer.from('{"stage":13}\n');
const rootIdentity='a'.repeat(64);
function journal(phase='applying') {
  return describeStage13Transaction({
    id:'adopt-20261011-01',rootIdentity,consentFingerprint:'b'.repeat(64),
    manifestSha256:sha(manifest),minimumReaderVersion:'0.9.4',
    createdAt:'2026-10-11T00:00:00.000Z',phase,
    items:[
      {path:'NEW.md',kind:'whole-file',oldSha256:null,
        stagedDev:'7',stagedIno:'9',
        newSha256:sha(content),baselineSha256:sha(content)},
      {path:'AGENTS.md',kind:'managed-section',sectionId:'agent-routing',
        stagedDev:'7',stagedIno:'10',
        oldSha256:sha(old),oldMode:0o644,
        originalDev:'7',originalIno:'11',
        newSha256:sha(section.document),
        baselineSha256:sha(section.body)}
    ]
  });
}
const live=()=>new Map([['NEW.md',content],['AGENTS.md',section.document]]);
const backups=()=>new Map([['AGENTS.md',old]]);
const ids=()=>new Map([['NEW.md',{dev:'7',ino:'9'}],
  ['AGENTS.md',{dev:'7',ino:'10'}]]);
test('Stage13 journal only accepts authenticated adoption ledger and phases',()=>{
  const first=journal('snapshotted');
  const ready=journal('staged');
  const applying=journal('applying');
  const checked=journal('verified');
  const committed=journal('committed');
  assert.equal(validateStage13Transaction(first).operation,'adopt');
  assert.equal(assertStage13TransactionTransition(null,first).to,'snapshotted');
  assertStage13TransactionTransition(first,ready);
  assertStage13TransactionTransition(ready,applying);
  assertStage13TransactionTransition(applying,checked);
  assertStage13TransactionTransition(checked,committed);
  assert.throws(()=>assertStage13TransactionTransition(first,committed),
    {code:'E_STAGE13_BAD_TRANSITION'});
  assert.throws(()=>assertStage13TransactionTransition(committed,first),
    {code:'E_STAGE13_BAD_TRANSITION'});
  assert.throws(()=>assertStage13TransactionTransition(first,
    {...ready,id:'adopt-attacker'}),{code:'E_STAGE13_CHANGED_IDENTITY'});
  assert.throws(()=>validateStage13Transaction({...first,debugUnsafe:true}),
    {code:'E_STAGE13_TRANSACTION_FORMAT'});
});
test('Stage13 recovery restores exact user preimage and removes only owned claims',()=>{
  const report=classifyStage13RecoverySnapshot(journal(),{
    currentFiles:live(),currentIdentities:ids(),backups:backups()
  });
  assert.equal(report.classification,'RECOVERABLE_CANDIDATE');
  assert.equal(report.writeAuthorized,false);
  assert.equal(report.actions.length,2);
  assert.ok(report.actions.some(x=>x.action==='RESTORE_EXACT_PREIMAGE_IF_UNMODIFIED'));
  assert.ok(report.actions.some(x=>x.action==='REMOVE_CREATED_IF_UNMODIFIED'));
  assert.equal(assertStage13RecoveryActionsStillMatch(report,live()).authorized,false);
});
test('Stage13 user post-apply edits and foreign backup always block rollback',()=>{
  for(const altered of [
    {currentFiles:new Map([['NEW.md',Buffer.from('user changed')],
      ['AGENTS.md',section.document]]),backups:backups()},
    {currentFiles:live(),backups:new Map([[
      'AGENTS.md',Buffer.from('corrupted recovery bytes')
    ]])},
    {currentFiles:new Map([['NEW.md',content],
      ['AGENTS.md',Buffer.from('user rewrote the document')]]),
      backups:backups()}
  ]) {
    const report=classifyStage13RecoverySnapshot(journal(),{
      ...altered,currentIdentities:ids()
    });
    assert.equal(report.classification,'BLOCKED');
    assert.deepEqual(report.actions,[]);
  }
});
test('byte-identical replacement from a different inode is not owned',()=>{
  const stolen=ids();
  stolen.set('NEW.md',{dev:'7',ino:'999'});
  const report=classifyStage13RecoverySnapshot(journal(),{
    currentFiles:live(),currentIdentities:stolen,backups:backups()
  });
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.issues[0].reason,'CREATED_INODE_NOT_OWNED');
});
test('Stage13 committed status proves all file bytes, not only manifest hash',()=>{
  const good=classifyStage13RecoverySnapshot(journal('committed'),{
    currentFiles:live(),currentIdentities:ids(),backups:backups(),manifestBytes:manifest
  });
  assert.equal(good.classification,'COMMITTED_VERIFY_ONLY');
  const missing=new Map(live());missing.delete('NEW.md');
  const bad=classifyStage13RecoverySnapshot(journal('committed'),{
    currentFiles:missing,currentIdentities:ids(),backups:backups(),
    manifestBytes:manifest
  });
  assert.equal(bad.classification,'BLOCKED');
  assert.equal(bad.reason,'COMMITTED_FILE_CHANGED');
});
test('Stage13 old pre-state after restore is not a new managed state',()=>{
  const restored=classifyStage13RecoverySnapshot(journal('restored'),{
    currentFiles:new Map([['AGENTS.md',old]]),
    currentIdentities:new Map([['AGENTS.md',{dev:'7',ino:'11'}]]),
    backups:backups()
  });
  assert.equal(restored.classification,'RESTORED_REVIEW');
  assert.equal(restored.writeAuthorized,false);
});
