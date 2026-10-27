import test from 'node:test';
import assert from 'node:assert/strict';
import {previewCapabilityProvenance} from '../lib/capability-application-provenance.mjs';
const good=()=>({schemaVersion:1,readOnly:true,status:'REVIEW_REQUIRED',
 evidenceDigest:'sha256:'+'a'.repeat(64),capabilities:[{id:'language.go',status:'PROPOSED_NOT_APPLIED',
 commandAuthority:'NOT_GRANTED'}],appliedCapabilities:[],commandsAuthorized:false,executionAuthorized:false});
function code(fn,expect){assert.throws(fn,e=>e.code===expect);}
test('capability digest remains review-only',()=>{
 const p=previewCapabilityProvenance({applicationPlan:good()});
 assert.equal(p.ownerApproval,'NOT_ESTABLISHED');assert.equal(p.persistedApplication,false);
 assert.deepEqual(p.appliedCapabilities,[]);assert.equal(p.executionAuthorized,false);
});
test('old stack metadata does not become capability approval',()=>{
 const p=previewCapabilityProvenance({applicationPlan:good(),manifest:{schemaVersion:2,install:{stack:'go'}}});
 assert.equal(p.legacyInstalledStack,'go');assert.equal(p.appliedCapabilities.length,0);
});
test('fake human receipt fails closed rather than assigning authority',()=>{
 code(()=>previewCapabilityProvenance({applicationPlan:good(),claimedApproval:{approved:true,signature:'x'}}),
 'E_APPLICATION_APPROVAL_CONTRACT_UNDEFINED');
});
test('unknown lifecycle capability field is refused',()=>{
 for(const manifest of [
  {schemaVersion:2,install:{stack:'go',appliedCapabilities:['language.go']}},
  {schemaVersion:2,install:{stack:'go'},capabilityProvenance:{}},
  {schemaVersion:1,install:{stack:'go'},appliedCapabilities:['language.go']}])
  code(()=>previewCapabilityProvenance({applicationPlan:good(),manifest}),
   'E_APPLICATION_UNAUTHORIZED_MANIFEST_FIELD');
});
test('forged applied plan and unauthorized commands fail closed',()=>{
 for(const changed of [
  {appliedCapabilities:['language.go']},
  {commandsAuthorized:true},
  {executionAuthorized:true},
  {readOnly:false},
  {evidenceDigest:'sha256:bad'},
  {status:'APPLIED'}])
  code(()=>previewCapabilityProvenance({applicationPlan:{...good(),...changed}}),
  'E_APPLICATION_PROPOSAL_INVALID');
});
test('capability IDs must be unique and well-formed',()=>{
 const dup={...good(),capabilities:[good().capabilities[0],good().capabilities[0]]};
 code(()=>previewCapabilityProvenance({applicationPlan:dup}),'E_APPLICATION_PROPOSAL_INVALID');
 const bad={...good(),capabilities:[{id:'../../escape',status:'PROPOSED_NOT_APPLIED',commandAuthority:'NOT_GRANTED'}]};
 code(()=>previewCapabilityProvenance({applicationPlan:bad}),'E_APPLICATION_PROPOSAL_INVALID');
});
test('partial discovery remains unapproved',()=>{
 const p=previewCapabilityProvenance({applicationPlan:{...good(),status:'BLOCKED_PARTIAL_EVIDENCE'}});
 assert.equal(p.proposalStatus,'BLOCKED_PARTIAL_EVIDENCE');assert.equal(p.GFENCE,'NO_GO');
});
