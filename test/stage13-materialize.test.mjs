import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assembleStage13Target} from '../lib/stage13-materialize.mjs';
import {assessStage13Preview} from '../lib/stage13-brownfield-preflight.mjs';
import {parseManagedSections} from '../lib/managed-markdown.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function selection(action='PROPOSE_SECTION') {
  const path='AGENTS.md',root='/tmp/stage13-brownfield-test';
  const plan={root,planKind:'init',planVersion:1,zeroWrite:true,
    previewOnly:true,executionAuthorized:false,classification:'EXISTING',
    blocked:false,assetSet:'brownfield-minimal-v1',stack:'generic',
    githubIncludedInPlan:false,polyglot:false,
    requestedIntent:{agent:{kind:'unspecified'},stack:{kind:'unspecified'},
      github:{kind:'unspecified'}},
    skippedPaths:[],actions:[action==='CLAIM'?
      {path,action:'CLAIM',ownershipProposal:'whole-file',
        executionAuthorized:false}:
      {path,action:'PROPOSE_SECTION',ownershipProposal:'managed-section',
        sectionId:'agent-routing',executionAuthorized:false}]};
  const expected=assessStage13Preview(plan);
  const approval={intent:'ADOPT_EXISTING_REPOSITORY',root,
    explicitConsent:true,intentFingerprint:expected.intentFingerprint,
    acceptedActions:expected.expectedActions};
  return {plan,approval};
}
test('stage13 never converts stale preview into writer authority',()=>{
  const {plan,approval}=selection();
  const ok=assessStage13Preview(plan,{approval});
  assert.equal(ok.classification,'READY_TO_REPLAN_UNDER_OWNED_LOCK');
  assert.equal(ok.executionAuthorized,false);
  const mutated={...plan,stack:'javascript'};
  assert.equal(assessStage13Preview(mutated,{approval}).classification,'BLOCKED');
  assert.equal(assessStage13Preview({...plan,classification:'MANAGED'},
    {approval}).classification,'BLOCKED');
});
test('stage13 materializes section while retaining exact user preimage bytes',()=>{
  const {plan,approval}=selection();
  const before=Buffer.from('\ufeffUser-owned instructions\r\nDo not overwrite.\r\n');
  const files=new Map([['AGENTS.md',{content:'Follow safe routing.\n',
    mode:0o644,origin:'brownfield-routing-v1',policy:'managed'}]]);
  const value=assembleStage13Target(plan,{
    approval,desiredFiles:files,existingFiles:new Map([['AGENTS.md',before]]),
    readerVersion:'0.9.4'
  });
  assert.equal(value.zeroWrite,true);
  assert.equal(value.executionAuthorized,false);
  const after=value.postimages.get('AGENTS.md');
  assert.equal(after.kind,'managed-section');
  assert.deepEqual(after.priorBytes,before);
  assert.equal(after.priorHash,sha(before));
  assert.ok(after.content.subarray(0,before.length).equals(before));
  assert.equal(parseManagedSections(after.content).length,1);
  assert.equal(value.manifest.ownership['AGENTS.md'].kind,'managed-section');
  assert.equal(value.manifest.install.assetSet,'brownfield-minimal-v1');
  assert.equal(value.manifest.managedFiles['AGENTS.md'].baselineHash,
    sha(value.baselines.get('AGENTS.md')));
  assert.notEqual(sha(value.baselines.get('AGENTS.md')),sha(after.content));
});
test('stage13 CLAIM never overwrites a pre-existing path',()=>{
  const {plan,approval}=selection('CLAIM');
  const desiredFiles=new Map([['AGENTS.md',{content:'New managed file',
    origin:'template',policy:'managed',mode:0o644}]]);
  assert.throws(()=>assembleStage13Target(plan,{
    approval,desiredFiles,existingFiles:new Map([[
      'AGENTS.md',Buffer.from('existing user bytes')
    ]]),readerVersion:'0.9.4'
  }),{code:'E_STAGE13_EXISTING_CLAIM'});
});
test('stage13 materialization rejects old reader or unapproved action changes',()=>{
  const {plan,approval}=selection('CLAIM');
  const desiredFiles=new Map([['AGENTS.md',{content:'content',
    origin:'template',policy:'managed',mode:0o644}]]);
  assert.throws(()=>assembleStage13Target(plan,{
    approval,desiredFiles,existingFiles:new Map(),readerVersion:'0.9.3'
  }),{code:'E_STAGE13_READER_VERSION'});
  const altered={...plan,actions:[...plan.actions,{
    action:'CLAIM',path:'CLAUDE.md',ownershipProposal:'whole-file',
    executionAuthorized:false}]};
  assert.throws(()=>assembleStage13Target(altered,{
    approval,desiredFiles,existingFiles:new Map(),readerVersion:'0.9.4'
  }),{code:'E_STAGE13_INTENT_UNAPPROVED'});
});
