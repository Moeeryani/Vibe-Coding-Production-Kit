// Shared no-write manager preview, including existing v1 projects.
// Never treats --dry-run as an alias for either legacy or v2 mutation.
import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { planAdaptiveManage } from './adaptive-manage-plan.mjs';
import { validManagedRelative } from './manifest-v2.mjs';
import { readManifest } from './state.mjs';
import { buildDesiredFiles } from './template.mjs';
import { readProjectBytes } from './safe-read.mjs';

export async function planManageOperation({targetDir,relativePath,action}={}) {
  const root=path.resolve(targetDir??'.');
  const blocked=reason=>({
    root,path:relativePath??null,operation:action,blocked:true,reason,
    readOnly:true,actions:[],executionAuthorized:false
  });
  if(!['track','ignore'].includes(action)||!validManagedRelative(relativePath)) {
    return blocked('INVALID_MANAGE_REQUEST');
  }
  const inspected=await inspectProject(root);
  if(inspected.classification!=='MANAGED') {
    return blocked(inspected.reason??'MANAGED_STATE_REQUIRED');
  }
  if(inspected.schemaVersion===2) {
    return planAdaptiveManage({targetDir:root,relativePath,action});
  }
  if(inspected.schemaVersion!==1)return blocked('UNSUPPORTED_MANAGED_SCHEMA');
  let manifest;
  try {manifest=await readManifest(root);}
  catch(e){return blocked(e.code??'V1_MANIFEST_UNREADABLE');}
  const existing=manifest.managedFiles[relativePath]??null;
  const ignored=(manifest.ignoredFiles??[]).includes(relativePath);
  const proposal=(verb,reason)=>({
    root,path:relativePath,operation:action,schemaVersion:1,
    assetSet:'legacy-full-v1',blocked:false,readOnly:true,
    actions:[{action:verb,path:relativePath,reason,executionAuthorized:false}],
    executionAuthorized:false
  });
  if(action==='ignore') {
    if(existing)return proposal('DETACH_CANDIDATE','REMOVE_MANAGED_TRACKING_ONLY');
    return ignored?proposal('NOOP','ALREADY_IGNORED'):blocked('NOT_MANAGED');
  }
  if(existing&&!ignored)return proposal('NOOP','ALREADY_MANAGED');
  let desired;
  try {
    desired=await buildDesiredFiles({
      targetDir:root,agent:manifest.install.agent,
      stack:manifest.install.requestedStack??manifest.install.stack,
      includeGitHub:manifest.install.includeGitHub,assetSet:'legacy-full-v1'
    });
  }catch(e){return blocked(e.code??'V1_ASSET_UNAVAILABLE');}
  if(!desired.files.has(relativePath))return blocked('NOT_IN_LEGACY_ASSET_SURFACE');
  try {
    const current=await readProjectBytes(root,relativePath,{optional:true});
    return proposal(current===null?'ADD_CANDIDATE':'TRACK_EXISTING_CANDIDATE',
      current===null?'NEW_MANAGED_FILE':'PRESERVE_EXISTING_USER_FILE');
  }catch(e){return blocked(e.code??'UNSAFE_MANAGED_DESTINATION');}
}
