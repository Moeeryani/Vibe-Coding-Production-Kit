import test from 'node:test';import assert from 'node:assert/strict';
import {planCapabilityApplication} from '../lib/capability-application-plan.mjs';
const digest='sha256:'+'a'.repeat(64);
const discovery=(id='language.rust')=>({status:'INSPECTED',capabilities:[{id,evidence:['Cargo.toml']}],issues:[]});
const selected=(id='language.rust')=>({status:'INSPECTED',profiles:[{
 id:'profile.rust',status:'MATCHED_UNTRUSTED',digest,selected:true,
 digestVerified:true,grantVerified:true,candidateCapabilities:[id]}]});
test('merges first party and selected v2 evidence while never applying it',()=>{
 const p=planCapabilityApplication({discovery:discovery(),selectedProfiles:selected()});
 assert.equal(p.capabilities.length,1);assert.deepEqual(p.capabilities[0].firstPartyEvidence,['Cargo.toml']);
 assert.deepEqual(p.capabilities[0].communityProfiles,[{id:'profile.rust',digest}]);
 assert.equal(p.applicationDecision,'NOT_RECORDED');assert.deepEqual(p.appliedCapabilities,[]);
 assert.equal(p.commandsAuthorized,false);assert.equal(p.executionAuthorized,false);
});
test('stable proposal digest independent of duplicate marker order',()=>{
 const a=planCapabilityApplication({discovery:{status:'INSPECTED',capabilities:[{id:'language.rust',evidence:['Cargo.toml','Cargo.toml']}],issues:[]}});
 const b=planCapabilityApplication({discovery:discovery()});
 assert.equal(a.evidenceDigest,b.evidenceDigest);
});
test('partial first-party inspection blocks confident proposal readiness',()=>{
 const p=planCapabilityApplication({discovery:{status:'PARTIAL',capabilities:[],issues:[{path:'go.mod',reason:'LINK'}]}});
 assert.equal(p.status,'BLOCKED_PARTIAL_EVIDENCE');assert.deepEqual(p.appliedCapabilities,[]);
});
test('partial selected profile evidence blocks confident proposal readiness',()=>{
 const s={status:'PARTIAL',profiles:[{...selected().profiles[0],status:'PARTIAL',candidateCapabilities:[]}]};
 const p=planCapabilityApplication({discovery:discovery(),selectedProfiles:s});
 assert.equal(p.status,'BLOCKED_PARTIAL_EVIDENCE');
});
test('forged grant or digest-proof metadata cannot enter composition',()=>{
 for(const item of [{...selected().profiles[0],grantVerified:false},
  {...selected().profiles[0],digest:'sha256:fake'},
  {...selected().profiles[0],selected:false}]){
  assert.throws(()=>planCapabilityApplication({discovery:discovery(),selectedProfiles:{profiles:[item]}}),
   /E_CAPABILITY_PROFILE_INTEGRITY/);
 }
});
test('a nonmatched profile cannot claim positive candidate capabilities',()=>{
 const s={profiles:[{...selected().profiles[0],status:'NOT_MATCHED'}]};
 assert.throws(()=>planCapabilityApplication({discovery:discovery(),selectedProfiles:s}),/E_CAPABILITY_PROFILE_INTEGRITY/);
});
test('old exclusive stack cannot authorize applied capability',()=>{
 const p=planCapabilityApplication({discovery:discovery(),installedStack:'go',requestedStack:'auto'});
 assert.deepEqual(p.appliedCapabilities,[]);
 assert.equal(p.recordedApplicationProvenance,'NOT_AVAILABLE');
});
test('proposal fingerprint never grants authority or a migration flag',()=>{
 const p=planCapabilityApplication({discovery:discovery(),selectedProfiles:selected('platform.desktop')});
 assert.match(p.evidenceDigest,/^sha256:[a-f0-9]{64}$/);
 assert.equal(p.capabilities.length,2);
 assert.equal(p.executionAuthorized,false);
});
