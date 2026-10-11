import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertStage13PostLockIdentity} from '../lib/stage13-replan-contract.mjs';

const bytes=x=>Buffer.from(x,'utf8');
function candidate({mode=0o644,oldMode=undefined,body='routing',
  installedAt='2026-10-11T01:00:00.000Z',
  updatedAt=installedAt,agent='generic'}={}) {
  const path='AGENTS.md';
  return {
    planFingerprint:'a'.repeat(64),actionCount:1,
    postimages:new Map([[path,{
      kind:'whole-file',priorHash:undefined,
      postHash:'b'.repeat(64),mode,oldMode
    }]]),
    baselines:new Map([[path,bytes(body)]]),
    manifest:{schemaVersion:2,installedAt,updatedAt,
      install:{agent,stack:'javascript',assetSet:'brownfield-minimal-v1'},
      managedFiles:{[path]:{mode,baselineHash:'c'.repeat(64)}}
    }
  };
}
test('Stage13 time-of-plan vs time-of-lock timestamp drift is not data drift',()=>{
  const pre=candidate();
  const locked=candidate({
    installedAt:'2026-10-11T01:00:05.000Z',
    updatedAt:'2026-10-11T01:00:05.000Z'
  });
  const report=assertStage13PostLockIdentity(pre,locked);
  assert.equal(report.classification,'LOCKED_REPLAN_SEMANTICALLY_IDENTICAL');
  assert.equal(report.writeAuthorized,false);
});
test('Stage13 rejects post-lock mode, adapter, baseline and action drift',()=>{
  const pre=candidate();
  for(const changed of [
    candidate({mode:0o600}),
    candidate({agent:'cursor'}),
    candidate({body:'user modified baseline'}),
    {...candidate(),planFingerprint:'d'.repeat(64)},
    {...candidate(),actionCount:2}
  ]) {
    assert.throws(()=>assertStage13PostLockIdentity(pre,changed),
      {code:/^E_STAGE13_/});
  }
});
test('Stage13 never grants authorization based on matching preview objects',()=>{
  const pre=candidate();
  const result=assertStage13PostLockIdentity(pre,candidate());
  assert.equal(result.writeAuthorized,false);
  assert.equal(result.sourceBytesAndModesMatch,true);
});
