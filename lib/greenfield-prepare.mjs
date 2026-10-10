import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { buildDesiredFiles } from './template.mjs';
import { buildManifest } from './state.mjs';
import { constructAdaptiveManifest } from './manifest-v2.mjs';
import { getCliVersion } from './version.mjs';
import { compareSemver } from './semver.mjs';
import { assetSurfaceSnapshot } from './asset-catalog.mjs';
import { AGENT_CHOICES } from './adapters.mjs';
import { STACK_CHOICES } from './stacks.mjs';

// Prepare the first managed greenfield lifecycle in memory. Never writes.
export async function prepareAdaptiveGreenfield({
  targetDir,agent='generic',stack='auto',includeGitHub=true,
  requestedAdapterIntent=null,githubIntent='unspecified'
}={}) {
  if(!AGENT_CHOICES.includes(agent)||!STACK_CHOICES.includes(stack)||
    typeof includeGitHub!=='boolean')throw new Error('Invalid greenfield profile selection.');
  if(agent!=='generic'&&requestedAdapterIntent===null) {
    throw new Error('Non-default adapter requires explicit request provenance.');
  }
  if(requestedAdapterIntent!==null&&requestedAdapterIntent!==agent) {
    throw new Error('Requested adapter intent does not match applied agent.');
  }
  if(!includeGitHub&&['copilot','all'].includes(agent)){
    throw new Error('Copilot adapter cannot be installed while GitHub scaffolding is explicitly off.');
  }
  const root=path.resolve(targetDir??'.');
  const inspection=await inspectProject(root);
  if(inspection.classification!=='NEW') {
    return {root,zeroWrite:true,blocked:true,reason:inspection.reason??
      'GREENFIELD_ONLY',classification:inspection.classification,executionAuthorized:false};
  }
  const version=await getCliVersion();
  if(compareSemver(version,'0.9.3')<=0) {
    // 0.9.3 cannot read schema-v2, regardless of what the manifest claims.
    return {root,zeroWrite:true,blocked:true,reason:'ADAPTIVE_READER_NOT_RELEASED',
      requiredReader:'greater than 0.9.3',executionAuthorized:false};
  }
  const assetSet='greenfield-safe-v1';
  const desired=await buildDesiredFiles({
    targetDir:root,agent,stack,includeGitHub,assetSet
  });
  if(desired.files.has('.github/workflows/validate.yml')) {
    throw new Error('Unsafe package workflow entered a greenfield surface.');
  }
  const legacyShape=buildManifest({version,agent,stack:desired.stack,
    includeGitHub,files:desired.files});
  legacyShape.install.requestedStack=stack;
  const manifest=constructAdaptiveManifest({
    legacyShape,assetSet,readerVersion:version,
    agentIntent:requestedAdapterIntent,githubIntent
  });
  const relativePaths=[...desired.files.keys()].sort();
  return {
    root,zeroWrite:true,blocked:false,previewOnly:true,executionAuthorized:false,
    classification:'NEW',assetSet,version,stack:desired.stack,
    assetSurface:assetSurfaceSnapshot(assetSet,{includeGitHub}),
    requestedIntent:{agent:requestedAdapterIntent,stack,github:githubIntent},
    paths:relativePaths,files:desired.files,manifest,
    actionCount:relativePaths.length,
    durableWritesProposed:['.vcp/update.lock','.vcp/backups/<operation-id>',
      '.vcp/transaction.json','.vcp/baselines','.vcp/manifest.json']
  };
}
