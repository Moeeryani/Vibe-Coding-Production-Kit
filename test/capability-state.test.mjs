import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCapabilityEvidence,renderCapabilityEvidenceSummary} from '../lib/capability-state.mjs';
const discovery=(capabilities=[],issues=[])=>({status:issues.length?'PARTIAL':'INSPECTED',capabilities,issues});
const cap=(id,evidence)=>({id,evidence,application:'NOT_APPLIED'});
test('normalized polyglot output cannot promote detected evidence into applied authority',()=>{
  const s=normalizeCapabilityEvidence(discovery([cap('language.rust',['Cargo.toml']),cap('language.go',['go.mod'])]),
    {installedStack:'go',requestedStack:'auto'});
  assert.deepEqual(s.detected.map(x=>x.id),['language.go','language.rust']);
  assert.deepEqual(s.appliedCapabilities,[]);assert.equal(s.executionAuthorized,false);
  assert.equal(s.legacyCompatibility.installedCapability,'language.go');
  assert.equal(s.legacyCompatibility.observedInstalledStackEvidence,true);
});
test('legacy explicit selection remains historical context, never capability approval',()=>{
  const s=normalizeCapabilityEvidence(discovery([cap('language.typescript',['tsconfig.json'])]),
    {installedStack:'python',requestedStack:'python'});
  assert.equal(s.legacyCompatibility.observedInstalledStackEvidence,false);
  assert.equal(s.appliedCapabilities.length,0);assert.equal(s.commandsAuthorized,false);
});
test('unmanaged missing metadata cannot invent application provenance',()=>{
  const s=normalizeCapabilityEvidence(discovery([cap('ecosystem.node',['package.json'])]));
  assert.equal(s.applicationProvenance,'NOT_RECORDED_IN_SCHEMA_V2');
  assert.equal(s.legacyCompatibility.installedStack,null);
});
test('unsafe external paths and internal VCP state cannot be promoted to evidence',()=>{
  for(const p of ['../go.mod','.vcp/manifest.json','.git/config','/tmp/go.mod','C:/go.mod']){
    assert.throws(()=>normalizeCapabilityEvidence(discovery([cap('language.go',[p])])),/E_CAPABILITY_EVIDENCE_INVALID/);
  }
});
test('duplicate capability ids and forged empty evidence are refused',()=>{
  assert.throws(()=>normalizeCapabilityEvidence(discovery([cap('language.go',['go.mod']),cap('language.go',['go.mod'])])),/E_CAPABILITY_EVIDENCE_INVALID/);
  assert.throws(()=>normalizeCapabilityEvidence(discovery([cap('language.go',[])])),/E_CAPABILITY_EVIDENCE_INVALID/);
});
test('bounded context renderer exposes only marker names and explicit unapproved status',()=>{
  const s=normalizeCapabilityEvidence(discovery([cap('language.go',['go.mod']),cap('language.python',['pyproject.toml'])]));
  const content=renderCapabilityEvidenceSummary(s);
  assert.match(content,/NOT APPROVED/);assert.match(content,/go.mod/);
  assert.doesNotMatch(content,/npm install|go test|pytest/);
  assert.ok(Buffer.byteLength(content)<4096);
});
test('partial inspection must be labelled uncertainty, not no capabilities',()=>{
  const s=normalizeCapabilityEvidence(discovery([], [{path:'go.mod',reason:'E_PROJECT_FILE_UNSAFE'}]));
  const content=renderCapabilityEvidenceSummary(s);
  assert.match(content,/PARTIAL/);assert.equal(s.status,'PARTIAL');
});
test('unbounded maxItems cannot be used to flood context',()=>{
  const s=normalizeCapabilityEvidence(discovery());
  assert.throws(()=>renderCapabilityEvidenceSummary(s,{maxItems:999}),/E_CAPABILITY_SUMMARY_INVALID/);
});
