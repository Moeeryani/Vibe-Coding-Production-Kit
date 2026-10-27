// Phase 4/5 lifecycle integration boundary: capability decisions are not
// represented in the existing schema-v2 manifest. Never write them into an
// unrecognized field or treat a digest, grant, or signed-looking receipt as approval.
const SHA=/^sha256:[0-9a-f]{64}$/;
const ID=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const rec=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function refuse(code){const e=new Error(code);e.code=code;throw e;}
export function previewCapabilityProvenance({applicationPlan,manifest=null,
  claimedApproval=null}={}){
  if(!rec(applicationPlan)||applicationPlan.schemaVersion!==1||
     applicationPlan.readOnly!==true||!SHA.test(applicationPlan.evidenceDigest??'')||
     !['REVIEW_REQUIRED','BLOCKED_PARTIAL_EVIDENCE'].includes(applicationPlan.status)||
     !Array.isArray(applicationPlan.capabilities)||applicationPlan.capabilities.length>128||
     applicationPlan.executionAuthorized!==false||applicationPlan.commandsAuthorized!==false||
     !Array.isArray(applicationPlan.appliedCapabilities)||applicationPlan.appliedCapabilities.length!==0)
    refuse('E_APPLICATION_PROPOSAL_INVALID');
  const seen=new Set();
  for(const item of applicationPlan.capabilities){
    if(!rec(item)||!ID.test(item.id??'')||seen.has(item.id)||
       item.status!=='PROPOSED_NOT_APPLIED'||item.commandAuthority!=='NOT_GRANTED')
      refuse('E_APPLICATION_PROPOSAL_INVALID');
    seen.add(item.id);
  }
  if(manifest!==null){
    if(!rec(manifest)||![1,2].includes(manifest.schemaVersion)||!rec(manifest.install))
      refuse('E_APPLICATION_MANIFEST_INVALID');
    if(Object.hasOwn(manifest,'appliedCapabilities')||
       Object.hasOwn(manifest,'capabilityProvenance')||
       Object.hasOwn(manifest.install,'appliedCapabilities'))
      refuse('E_APPLICATION_UNAUTHORIZED_MANIFEST_FIELD');
  }
  if(claimedApproval!==null)refuse('E_APPLICATION_APPROVAL_CONTRACT_UNDEFINED');
  return Object.freeze({schemaVersion:1,readOnly:true,proposalDigest:applicationPlan.evidenceDigest,
    proposalStatus:applicationPlan.status,
    proposedCapabilityIds:Object.freeze([...seen].sort()),
    legacyInstalledStack:manifest?.install?.stack??null,
    manifestSchema:manifest?.schemaVersion??null,
    persistedApplication:false,appliedCapabilities:Object.freeze([]),
    lifecycleContract:'REQUIRES_NEW_ACCEPTED_VERSIONED_MIGRATION',
    ownerApproval:'NOT_ESTABLISHED',
    commandsAuthorized:false,executionAuthorized:false,
    D01:'DEFERRED',GFENCE:'NO_GO',
    nextStep:'DESIGN_AND_RATIFY_CAPABILITY_PROVENANCE_SCHEMA_WITH_SEPARATE_OWNER_APPROVAL',
    note:'A proposal digest is not an accepted decision. Schema v1/v2 historical stack metadata is not authorization to apply composable capabilities.'});
}
