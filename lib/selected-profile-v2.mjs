// Phase 5 inspection through the SINGLE canonical plugin loader.
// Its schema-v1 and schema-v2 selection, digest, manifest, and grant rules
// are shared with VCP Doctor/Context/plugin inspection; no parallel parser.
import {loadCommunityPlugins} from './community-plugins.mjs';

export async function inspectSelectedProfilesV2(targetDir,{cliVersion=null}={}) {
  const loaded=await loadCommunityPlugins(targetDir,
    cliVersion===null?{}:{cliVersion});
  if(!loaded.config)return Object.freeze({readOnly:true,selection:'ABSENT',
    profiles:Object.freeze([]),proposedCapabilities:Object.freeze([]),
    appliedCapabilities:Object.freeze([]),executionAuthorized:false,
    legacyV1RuntimeUnchanged:true});
  const profiles=loaded.plugins.filter(p=>p.schemaVersion===2).map(p=>Object.freeze({
    id:p.id,version:p.version,digest:p.digest,path:p.path,
    selected:true,digestVerified:true,grantVerified:true,
    status:p.detectionStatus,
    evidence:p.capabilityEvidence,
    candidateCapabilities:p.candidateCapabilities,
    issues:p.detectionIssues,
    application:'NOT_APPLIED',executionAuthorized:false
  }));
  const legacy=loaded.plugins.filter(p=>p.schemaVersion!==2).map(p=>p.id);
  const partial=profiles.some(p=>p.status==='PARTIAL');
  return Object.freeze({readOnly:true,selection:'EXPLICIT_DIGEST_PINNED',
    status:partial?'PARTIAL':'INSPECTED',profiles:Object.freeze(profiles),
    legacyV1Selections:Object.freeze(legacy),
    proposedCapabilities:Object.freeze([...new Set(
      profiles.flatMap(p=>p.candidateCapabilities))].sort()),
    appliedCapabilities:Object.freeze([]),
    executionAuthorized:false,legacyV1RuntimeUnchanged:true,
    note:'The canonical community plugin loader validated both schema versions; v2 contributes only read-only detection proposals.'});
}
