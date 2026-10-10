// Stage12 read-only manage track/ignore for managed schema v2. A plan never
// grants authority to rewrite or detach user-owned whole documents.
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { readAdaptiveManifest, validManagedRelative } from './manifest-v2.mjs';
import { buildDesiredFiles } from './template.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { inspectAgentSectionAdoption } from './section-adoption.mjs';

const AGENTS=new Set(['AGENTS.md','CLAUDE.md','.github/copilot-instructions.md']);
export async function planAdaptiveManage({targetDir,relativePath,action}={}) {
  const root=path.resolve(targetDir??'.');
  const blocked=reason=>({
    root,path:relativePath??null,operation:action,blocked:true,reason,
    readOnly:true,actions:[],executionAuthorized:false
  });
  if(!['track','ignore'].includes(action))return blocked('UNKNOWN_MANAGE_ACTION');
  if(!validManagedRelative(relativePath))return blocked('UNSAFE_MANAGED_PATH');
  const state=await inspectProject(root);
  if(state.classification!=='MANAGED'||state.schemaVersion!==2) {
    return blocked(state.reason??'SCHEMA_V2_REQUIRED');
  }
  let manifest;
  try{manifest=await readAdaptiveManifest(root);}
  catch(e){return blocked(e.code??'UNREADABLE_MANIFEST');}
  const previous=manifest.managedFiles[relativePath]??null;
  const ownership=manifest.ownership[relativePath]??null;
  const proposed=(verb,reason,extra={})=>({
    root,path:relativePath,operation:action,blocked:false,
    readOnly:true,executionAuthorized:false,writeAuthorized:false,
    assetSet:manifest.install.assetSet,
    actions:[{action:verb,path:relativePath,reason,
      executionAuthorized:false,...extra}],
    mutationGate:'D-01/G-FENCE_NO_GO'
  });
  if(action==='ignore') {
    if(!previous){
      if(manifest.ignoredFiles.includes(relativePath)) {
        return proposed('NOOP','ALREADY_IGNORED');
      }
      return blocked('NOT_A_MANAGED_PATH');
    }
    return proposed('DETACH_OWNERSHIP_CANDIDATE',
      'RETAIN_USER_DOCUMENT_BYTES_AND_REMOVE_TRACKING_ONLY',{
        kind:ownership.kind,sectionId:ownership.sectionId??null,
        baselineHash:previous.baselineHash,
        humanDecisionRequired:ownership.kind==='managed-section'
      });
  }
  if(previous)return proposed('NOOP','ALREADY_VCP_MANAGED',{
    kind:ownership.kind,sectionId:ownership.sectionId??null
  });
  let desired;
  try {
    desired=await buildDesiredFiles({
      targetDir:root,
      assetSet:manifest.install.assetSet,
      agent:manifest.install.requestedAdapterIntent??
        manifest.install.agent,
      stack:manifest.install.requestedStack??manifest.install.stack,
      includeGitHub:manifest.install.includeGitHub
    });
  }catch(e){return blocked(e.code??'DESIRED_ASSET_UNAVAILABLE');}
  if(!desired.files.has(relativePath))return blocked('OUTSIDE_ADOPTED_ASSET_SURFACE');
  let present;
  try{present=await readProjectBytes(root,relativePath,{optional:true});}
  catch(e){return blocked(e.code??'UNSAFE_PROJECT_FILE');}
  if(present!==null) {
    if(AGENTS.has(relativePath)) {
      const sections=await inspectAgentSectionAdoption(root,relativePath);
      if(sections.classification==='SECTION_CANDIDATE') {
        return proposed('PROPOSE_SECTION','PRESERVE_EXISTING_HOST_DOCUMENT',{
          sectionId:sections.sectionId,
          ownershipProposal:'managed-section',humanDecisionRequired:true
        });
      }
      if(sections.classification==='NOOP_COMPATIBLE') {
        return proposed('PRESERVE_UNOWNED','COMPATIBLE_PROJECT_INSTRUCTIONS_ALREADY_EXIST',{
          humanDecisionRequired:true
        });
      }
      return blocked(sections.reason??'UNCLAIMED_SECTION_MARKERS');
    }
    return proposed('PRESERVE_UNOWNED','EXISTING_USER_FILE_REQUIRES_HUMAN_DECISION',{
      humanDecisionRequired:true
    });
  }
  return proposed('ADD_CANDIDATE','MISSING_DESIRED_ASSET',{
    ownershipProposal:'whole-file',humanDecisionRequired:true
  });
}
