import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describeStage13Transaction,
  assertStage13TransactionTransition} from '../lib/stage13-transaction.mjs';
import {classifyStage13RecoverySnapshot} from '../lib/stage13-recovery-contract.mjs';
import {exactNativeIdentity,sameExactNativeIdentity} from '../lib/stage13-identity.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const content=Buffer.from('created from Stage13 native-owned directory');
const dossier=()=>describeStage13Transaction({
  id:'adopt-nested-ledger',rootIdentity:'a'.repeat(64),
  consentFingerprint:'b'.repeat(64),manifestSha256:'c'.repeat(64),
  minimumReaderVersion:'0.9.4',createdAt:'2026-10-11T00:00:00.000Z',
  phase:'applying',
  createdDirectories:[
    {path:'.github',kind:'stage13-created-directory',dev:'12',ino:'99'},
    {path:'.github/ISSUE_TEMPLATE',kind:'stage13-created-directory',
      dev:'12',ino:'100'}
  ],
  items:[{
    path:'.github/ISSUE_TEMPLATE/bug_report.md',kind:'whole-file',
    oldSha256:null,newSha256:hash(content),baselineSha256:hash(content),
    stagedDev:'12',stagedIno:'101'
  }]
});
const observed=()=>new Map([
  ['.github',{dev:'12',ino:'99'}],
  ['.github/ISSUE_TEMPLATE',{dev:'12',ino:'100'}]
]);
const current=()=>new Map([
  ['.github/ISSUE_TEMPLATE/bug_report.md',content]
]);
const fileIds=()=>new Map([
  ['.github/ISSUE_TEMPLATE/bug_report.md',{dev:'12',ino:'101'}]
]);
test('nested claim rollback returns deepest-first owned directory removals',()=>{
  const plan=classifyStage13RecoverySnapshot(dossier(),{
    currentFiles:current(),currentIdentities:fileIds(),
    currentDirectories:observed()
  });
  assert.equal(plan.classification,'RECOVERABLE_CANDIDATE');
  assert.equal(plan.actions.length,1);
  assert.deepEqual(plan.directoriesToRemove,
    ['.github/ISSUE_TEMPLATE','.github']);
  assert.equal(plan.writeAuthorized,false);
});
test('matching file bytes never excuse a replaced directory inode',()=>{
  const replaced=observed();
  replaced.set('.github',{dev:'12',ino:'199'});
  const report=classifyStage13RecoverySnapshot(dossier(),{
    currentFiles:current(),currentIdentities:fileIds(),
    currentDirectories:replaced
  });
  assert.equal(report.classification,'BLOCKED');
  assert.ok(report.issues.some(x=>x.reason==='CREATED_DIRECTORY_REPLACED'));
});
test('committed adoption requires owned directory identity still present',()=>{
  const committed={...dossier(),phase:'committed'};
  const report=classifyStage13RecoverySnapshot(committed,{
    currentFiles:current(),currentIdentities:fileIds(),
    currentDirectories:new Map([['.github',{dev:'12',ino:'99'}]]),
    manifestBytes:Buffer.from('wrong but directory must block first')
  });
  assert.equal(report.classification,'BLOCKED');
  assert.equal(report.reason,'COMMITTED_DIRECTORY_MISSING');
});
test('journal transitions cannot rewrite pre-staged native directory identities',()=>{
  const before=dossier();
  const after={...before,phase:'verified',
    createdDirectories:before.createdDirectories.map(x=>({...x}))};
  assertStage13TransactionTransition(before,after);
  after.createdDirectories[0].ino='999';
  assert.throws(()=>assertStage13TransactionTransition(before,after),
    {code:'E_STAGE13_CHANGED_LEDGER'});
});
test('native 64-bit identities preserve precision beyond JS safe integers',()=>{
  const one={devExact:'4',inoExact:'9007199254740993',type:'file'};
  const two={devExact:'4',inoExact:'9007199254740994',type:'file'};
  assert.equal(exactNativeIdentity(one,{type:'file'}).ino,one.inoExact);
  assert.throws(()=>sameExactNativeIdentity(one,two,{type:'file'}),
    {code:'E_STAGE13_NATIVE_IDENTITY_CHANGED'});
  assert.throws(()=>exactNativeIdentity({
    devExact:'4',inoExact:'18446744073709551616',type:'file'
  }),{code:'E_STAGE13_NATIVE_IDENTITY_UNPROVEN'});
});
