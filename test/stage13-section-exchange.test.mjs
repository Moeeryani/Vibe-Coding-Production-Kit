import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {describeStage13Transaction} from '../lib/stage13-transaction.mjs';
import {previewStage13SectionExchange,
  exchangeStage13Section} from '../lib/stage13-section-exchange.mjs';
import {composeInitialManagedSection} from '../lib/managed-markdown.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const old=Buffer.from('MY ORIGINAL USER RULES\r\nNever overwrite.\r\n');
const next=composeInitialManagedSection(old,'agent-routing',
  Buffer.from('Read project context first.\n')).document;
const tx=describeStage13Transaction({
  id:'adopt-'+'a'.repeat(32),rootIdentity:'b'.repeat(64),
  consentFingerprint:'c'.repeat(64),manifestSha256:'d'.repeat(64),
  minimumReaderVersion:'0.9.4',createdAt:'2026-10-11T00:00:00.000Z',
  phase:'applying',
  items:[{path:'AGENTS.md',kind:'managed-section',
    sectionId:'agent-routing',oldMode:0o644,
    oldSha256:sha(old),newSha256:sha(next),
    baselineSha256:sha(Buffer.from('Read project context first.\n')),
    originalDev:'4',originalIno:'9007199254740993',
    stagedDev:'4',stagedIno:'9007199254740994'}]
});
test('Stage13 section exchange preview preserves both original/staged inode IDs',()=>{
  const report=previewStage13SectionExchange(tx,'AGENTS.md',{
    originalBytes:old,stagedBytes:next
  });
  assert.equal(report.executionAuthorized,false);
  assert.equal(report.originalInode,'9007199254740993');
  assert.equal(report.stagedInode,'9007199254740994');
  assert.equal(report.displacedOriginalRetainedAt,
    '.vcp/stage/'+tx.id+'/files/AGENTS.md');
});
test('Stage13 section exchange never accepts a changed user preimage',()=>{
  assert.throws(()=>previewStage13SectionExchange(tx,'AGENTS.md',{
    originalBytes:Buffer.from('foreign edited rules'),stagedBytes:next
  }),{code:'E_STAGE13_SECTION_BYTES_UNPROVEN'});
});
test('Stage13 section writer rejects direct-import use before ANY filesystem operation',async()=>{
  await assert.rejects(()=>exchangeStage13Section({
    targetDir:'/not-real-project',transaction:tx,relative:'AGENTS.md',
    kernelIsolationToken:{pretendMacEnforced:true}
  }),{code:'E_G_FENCE_NO_GO'});
});
