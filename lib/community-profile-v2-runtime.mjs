// Phase 5: schema-v2 community detection through the existing, verified v1
// bundle loader. No executable hooks, command grants, or persisted application.
import {compareVersions} from './migrations.mjs';
import {validateDeclarativeProfileV2,previewDeclarativeProfileV2} from './declarative-profile-v2.mjs';

function refuse(code){const e=new Error(code);e.code=code;throw e;}
function isRecord(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}

// Only call after the existing loader has performed exact-path, root, bundle,
// case, size, symlink, UTF-8, and file-set checks. We redundantly bind digest,
// identity and grants so that bypassing the dispatch cannot provide authority.
export async function loadVerifiedCommunityProfileV2({
  root,selection,bundle,rawManifest,cliVersion
}={}){
  if(!isRecord(selection)||!isRecord(bundle)||
    typeof bundle.digest!=='string'||bundle.digest!==selection.sha256||
    !Array.isArray(bundle.files)||
    !bundle.files.some(x=>x.relative==='plugin.json')||
    !isRecord(rawManifest)||rawManifest.schemaVersion!==2)
    refuse('E_PROFILE_V2_TRUST_BOUNDARY');
  // The declarative object must be decoded from the exact digest-pinned
  // manifest bytes, not supplied independently by an API caller.
  const pinned=bundle.files.find(f=>f.relative==='plugin.json');
  let parsed;
  try{parsed=JSON.parse(pinned.content);}catch{refuse('E_PROFILE_V2_TRUST_BOUNDARY');}
  if(JSON.stringify(parsed)!==JSON.stringify(rawManifest))
    refuse('E_PROFILE_V2_TRUST_BOUNDARY');
  if(!Array.isArray(selection.grants)||selection.grants.length!==1||
    selection.grants[0]!=='capability-detection')
    refuse('E_PROFILE_V2_GRANT_REQUIRED');
  const profile=validateDeclarativeProfileV2(rawManifest);
  if(profile.id!==selection.id||profile.version!==selection.version)
    refuse('E_PROFILE_V2_IDENTITY');
  if(!profile.compatibility)refuse('E_PROFILE_V2_COMPATIBILITY_REQUIRED');
  if(compareVersions(profile.compatibility.minVersion,profile.compatibility.maxExclusiveVersion)>=0||
    compareVersions(cliVersion,profile.compatibility.minVersion)<0||
    compareVersions(cliVersion,profile.compatibility.maxExclusiveVersion)>=0)
    refuse('E_PROFILE_V2_INCOMPATIBLE');
  const scan=await previewDeclarativeProfileV2(root,rawManifest);
  const matched=scan.status==='MATCHED_UNTRUSTED';
  return Object.freeze({
    schemaVersion:2,id:profile.id,version:profile.version,
    name:profile.id,description:'Community detection proposal (not applied)',
    path:selection.path,digest:bundle.digest,
    grants:Object.freeze([...selection.grants]),
    capabilities:Object.freeze(['capability-detection']),
    compatibility:profile.compatibility,
    manifestRelative:`${selection.path}/plugin.json`,
    manifestContent:bundle.files.find(f=>f.relative==='plugin.json').content,
    guidance:Object.freeze([]),verificationProposals:Object.freeze([]),
    detectionStatus:scan.status,
    capabilityEvidence:scan.evidence,
    candidateCapabilities:Object.freeze(matched?[...scan.candidateCapabilities]:[]),
    detectionIssues:scan.issues,
    appliedCapabilities:Object.freeze([]),
    applicationStatus:'PROPOSED_NOT_APPLIED',
    commandsAuthorized:false,executionAuthorized:false,
    trust:{selected:true,digestVerified:true,grantVerified:true},
    note:'Bounded marker detection only; presence is not accepted Source of Truth or application authorization.'
  });
}
