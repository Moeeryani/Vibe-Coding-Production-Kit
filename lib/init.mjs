import path from 'node:path';
import { inspectProject } from './adoption-inspect.mjs';
import { planSmartInit } from './adoption-plan.mjs';
import { applyAdaptiveGreenfield } from './greenfield-apply-v2.mjs';

// Stage12 entrypoint: unmanaged EXISTING apply is Stage13-only; NEW lifecycle
// goes through the isolated versioned writer (itself hard gated by D-01).
export async function initProject({
  targetDir,agent='generic',stack='auto',includeGitHub=true,
  force=false,dryRun=false,requestedAdapterIntent=null,githubIntent='unspecified'
}={}) {
  if(force)throw new Error('Destructive vcp init --force is disabled; existing files are never overwritten.');
  const target=path.resolve(targetDir??'.');
  const inspected=await inspectProject(target);
  if(dryRun) {
    return planSmartInit(target,{
      agentPreference:requestedAdapterIntent,
      stackPreference:stack,
      githubPreference:githubIntent==='explicit-off'?false:
        githubIntent==='explicit-on'?true:null
    });
  }
  if(inspected.classification==='BLOCKED') {
    throw new Error('VCP state requires inspection/recovery before init: '+inspected.reason);
  }
  if(inspected.classification==='MANAGED') {
    throw new Error('Already managed by VCP; use lifecycle update/status instead of init.');
  }
  if(inspected.classification==='EXISTING') {
    throw new Error('Stage12 Existing-repository Smart Init is zero-write preview only; Stage13 owns first adoption apply.');
  }
  return applyAdaptiveGreenfield({
    targetDir:target,agent,stack,includeGitHub,
    requestedAdapterIntent,githubIntent
  });
}
