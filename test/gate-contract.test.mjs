import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTaskLifecycle,classifyChangeSet,previewGateDecision} from '../lib/gate-contract.mjs';
function f(path,status='M',from=null){return {path,status,from};}
function classify(files,opts){return classifyChangeSet(files,opts);}
test('task status parses exact canonical header, not arbitrary prose',()=>{
 assert.equal(parseTaskLifecycle('# Task\nStatus: Review\n## Status: Done').status,'Review');
 assert.equal(parseTaskLifecycle('Status: Done\n').status,'Done');
 assert.equal(parseTaskLifecycle('Status: Draft\r\n').status,'Draft');
 for(const bad of ['Status: accepted','Status: Draft\nStatus: Done\n','Body\n','Status: DONE'])assert.throws(()=>parseTaskLifecycle(bad),{code:'E_GATE_TASK_STATUS'});
});
test('empty and dirty changes cannot become passes',()=>{
 assert.equal(classify([]).classification,'BLOCKED');
 assert.equal(classify([f('README.md')],{workingTreeStatus:' M README.md'}).classification,'BLOCKED');
});
test('ordinary documentation change is L0 preview only',()=>{
 const c=classify([f('README.md')]);
 assert.equal(c.requiredLevel,'L0');
 const d=previewGateDecision({changes:c});
 assert.equal(d.status,'PREVIEW_READY');
 assert.equal(d.executionAuthorized,false);
 assert.equal(d.approvalInferred,false);
});
test('code and tests are material L2',()=>{
 for(const p of ['lib/widgets.mjs','test/feature.test.mjs','scripts/build.sh','Cargo.toml']){
  const c=classify([f(p)]);assert.equal(c.requiredLevel,'L2');
 }
});
test('security paths, workflows and package metadata escalate L3',()=>{
 for(const p of ['.github/workflows/release.yml','lib/auth/session.mjs','scripts/native/fsops.cpp','package.json','package-lock.json','docs/security/MODEL.md','docs/decisions/D-01.json','lib/versioned-journal.mjs']){
  const c=classify([f(p)]);assert.equal(c.requiredLevel,'L3',p);
 }
});
test('rename from sensitive path retains sensitivity even if destination docs',()=>{
 const c=classify([f('README.md','R100','lib/auth/session.mjs')]);
 assert.equal(c.requiredLevel,'L3');
});
test('renames of docs cannot be L0',()=>{
 assert.equal(classify([f('CHANGELOG.md','R100','README.md')]).requiredLevel,'L2');
});
test('path traversal and malformed status refuse',()=>{
 for(const entry of [f('../secret'),f('/tmp/secret'),f('a\\b'),f('a//b'),f('X.md','?'),{path:'a',status:'M',from:'../x'}])assert.throws(()=>classify([entry]),{code:'E_GATE_CHANGED_ENTRY'});
});
test('task is mandatory for material work',()=>{
 const changes=classify([f('src/server.js')]);
 const d=previewGateDecision({changes});
 assert.ok(d.reasons.includes('MATERIAL_TASK_REQUIRED'));
});
test('task Draft cannot satisfy preview; Review cannot imply accepted',()=>{
 const changes=classify([f('src/server.js')]);
 assert.equal(previewGateDecision({changes,task:parseTaskLifecycle('Status: Draft\n')}).status,'BLOCKED');
 let d=previewGateDecision({changes,task:parseTaskLifecycle('Status: Review\n')});
 assert.equal(d.status,'PREVIEW_READY');assert.equal(d.verificationExecuted,false);
});
test('explicit weaker requested level cannot downgrade',()=>{
 const changes=classify([f('src/server.js')]);
 assert.ok(previewGateDecision({changes,task:parseTaskLifecycle('Status: Review\n'),requestedLevel:'L0'}).reasons.includes('LEVEL_DOWNGRADE_REFUSED'));
});
test('explicit minimum level can escalate only',()=>{
 assert.equal(classify([f('README.md')],{selection:{minimumLevel:'L3'}}).requiredLevel,'L3');
});
test('L3 always requires independent security review',()=>{
 const changes=classify([f('.github/workflows/ci.yml')]);
 const d=previewGateDecision({changes,task:parseTaskLifecycle('Status: Done\n')});
 assert.equal(d.status,'BLOCKED');
 assert.ok(d.reasons.includes('HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED'));
});
test('readiness with failures blocks even if task otherwise ready',()=>{
 const changes=classify([f('lib/widgets.js')]);
 const d=previewGateDecision({changes,task:parseTaskLifecycle('Status: Review\n'),readiness:{summary:{fail:1}}});
 assert.ok(d.reasons.includes('READINESS_FAILURES'));
});

test('type changes and unmerged files never pass as ordinary documentation',()=>{
 for(const st of ['T','U']) assert.equal(classify([f('README.md',st)]).requiredLevel,'L3');
 assert.equal(classify([f('README.md','D')]).requiredLevel,'L1');
});
test('project requirements need a task even though content is Markdown',()=>{
 const c=classify([f('docs/product/PRD.md')]);
 assert.equal(c.requiredLevel,'L1');
 assert.ok(previewGateDecision({changes:c}).reasons.includes('MATERIAL_TASK_REQUIRED'));
});
