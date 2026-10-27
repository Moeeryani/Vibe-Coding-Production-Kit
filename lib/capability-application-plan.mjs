// Phase 4 capability composition and explicit adoption *proposal*.
// This does not persist a manifest, grant commands, or infer owner approval.
//
// Capability lifecycle states (single vocabulary for the whole flow):
//   DETECTED                 — present in discovery evidence only.
//   PROPOSED                 — listed in this plan as PROPOSED_NOT_APPLIED.
//   REVIEW_REQUIRED          — this plan's status when evidence is complete.
//   BLOCKED_PARTIAL_EVIDENCE — this plan's status when evidence is partial.
//   APPLIED                  — NOT representable here. It requires a future
//     versioned lifecycle-provenance contract, explicit project-owner
//     approval, and D-01/G-FENCE acceptance before any mutation. A selected
//     profile, a verified digest, and a verified grant never produce APPLIED.
// The plan carries a provenance *preview* (applicationProvenance) produced by
// previewCapabilityProvenance: legitimate preview evidence that nothing is
// recorded, nothing is applied, and no authority is granted. The historical
// manifest is never extended with capability fields (schema v1/v2 compat).
import { createHash } from 'node:crypto';
import { normalizeCapabilityEvidence } from './capability-state.mjs';
import { previewCapabilityProvenance } from './capability-application-provenance.mjs';

export const CAPABILITY_LIFECYCLE_STATES = Object.freeze({
  DETECTED: 'Present in discovery evidence only; not proposed.',
  PROPOSED: 'Plan capability status PROPOSED_NOT_APPLIED; commandAuthority NOT_GRANTED.',
  REVIEW_REQUIRED: 'Plan status when evidence is complete; awaits owner review.',
  BLOCKED_PARTIAL_EVIDENCE: 'Plan status when evidence is partial; not reviewable as complete.',
  APPLIED: 'NOT REPRESENTABLE in this flow. Requires a future versioned provenance contract, explicit owner approval, and D-01/G-FENCE acceptance.',
});
const ID=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const DIGEST=/^sha256:[a-f0-9]{64}$/;
const MAX=128;
function fail(code){const e=new Error(code);e.code=code;throw e;}
const rec=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function planCapabilityApplication({discovery,selectedProfiles=null,installedStack=null,requestedStack=null,manifest=null}={}){
  const state=normalizeCapabilityEvidence(discovery,{installedStack,requestedStack});
  if(selectedProfiles!==null&&(!rec(selectedProfiles)||!Array.isArray(selectedProfiles.profiles)||
    selectedProfiles.profiles.length>64))fail('E_CAPABILITY_PROFILE_SELECTION');
  const map=new Map();
  function ensure(id){
    if(typeof id!=='string'||!ID.test(id))fail('E_CAPABILITY_ID');
    if(!map.has(id))map.set(id,{id,firstPartyEvidence:[],communityProfiles:[]});
    return map.get(id);
  }
  for(const c of state.detected)ensure(c.id).firstPartyEvidence.push(...c.evidence);
  for(const p of selectedProfiles?.profiles??[]){
    if(!rec(p)||p.selected!==true||p.digestVerified!==true||p.grantVerified!==true||
      typeof p.id!=='string'||!ID.test(p.id)||!DIGEST.test(p.digest)||
      !['MATCHED_UNTRUSTED','NOT_MATCHED','PARTIAL'].includes(p.status)||
      !Array.isArray(p.candidateCapabilities))fail('E_CAPABILITY_PROFILE_INTEGRITY');
    if(p.status!=='MATCHED_UNTRUSTED'&&p.candidateCapabilities.length)
      fail('E_CAPABILITY_PROFILE_INTEGRITY');
    for(const id of p.candidateCapabilities){
      ensure(id).communityProfiles.push({id:p.id,digest:p.digest});
    }
  }
  if(map.size>MAX)fail('E_CAPABILITY_LIMIT');
  const partial=state.status==='PARTIAL'||selectedProfiles?.status==='PARTIAL';
  const capabilities=[...map.values()].map(x=>({
    id:x.id,
    firstPartyEvidence:[...new Set(x.firstPartyEvidence)].sort(),
    communityProfiles:x.communityProfiles.sort((a,b)=>a.id.localeCompare(b.id)),
    status:'PROPOSED_NOT_APPLIED',
    commandAuthority:'NOT_GRANTED'
  })).sort((a,b)=>a.id.localeCompare(b.id));
  const snapshot=JSON.stringify({version:1,capabilities,partial:Boolean(partial)});
  const evidenceDigest='sha256:'+createHash('sha256').update(snapshot).digest('hex');
  // Build the core plan first so the provenance preview can validate it.
  // The preview is evidence ABOUT the proposal, not a record of an application:
  // persistedApplication is always false and ownerApproval NOT_ESTABLISHED.
  // A manifest that fails provenance validation (unknown schema, or a
  // historical manifest carrying capability fields) fails closed here; the
  // CLI retries with manifest=null so a corrupt manifest never fabricates
  // provenance context, and doctor remains the tool that reports it.
  const core={schemaVersion:1,readOnly:true,
    status:partial?'BLOCKED_PARTIAL_EVIDENCE':'REVIEW_REQUIRED',
    capabilities:Object.freeze(capabilities),evidenceDigest,
    evidenceFreshness:'CURRENT_READ_ONLY_INSPECTION',
    appliedCapabilities:Object.freeze([]),
    commandsAuthorized:false,executionAuthorized:false};
  const applicationProvenance=previewCapabilityProvenance({applicationPlan:core,manifest});
  return Object.freeze({...core,
    applicationProvenance,
    recordedApplicationProvenance:'NOT_RECORDED',
    applicationDecision:'NOT_RECORDED',
    requiredNextAuthority:Object.freeze([
      'EXPLICIT_PROJECT_OWNER_APPROVAL',
      'VERSIONED_LIFECYCLE_PROVENANCE_CONTRACT',
      'D01_G_FENCE_ACCEPTANCE_BEFORE_MUTATION'
    ]),
    note:'This digest identifies this read-only proposal only. It is not a signed approval, a persisted manifest record, or a grant.'});
}
