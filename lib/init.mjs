import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { inspectProject } from './adoption-inspect.mjs';
import { planSmartInit } from './adoption-plan.mjs';
import { applyAdaptiveGreenfield } from './greenfield-apply-v2.mjs';
import { assertManagedMigrationGate } from './managed-migration.mjs';
import {applyStage13SmartInit} from './stage13-apply.mjs';

// Stage13 owns first adoption apply; the Stage12 dry-run remains zero-write.
// Stage12 entrypoint: unmanaged EXISTING apply is Stage13-only; NEW lifecycle
// goes through the isolated versioned writer (itself hard gated by D-01).
export async function initProject({
  targetDir,agent='generic',stack='auto',includeGitHub=true,
  force=false,dryRun=false,requestedAdapterIntent=null,githubIntent='unspecified',
  adoptionApproval=null
}={}) {
  if(force)throw new Error('Destructive vcp init --force is disabled; existing files are never overwritten.');
  const target=path.resolve(targetDir??'.');
  // Stage12 is zero-write until D-01 is proved. Even creating the selected
  // root *before* the gate changes user-visible filesystem state.
  const inspected=await inspectProject(target);
  if(dryRun) {
    const plan = await planSmartInit(target,{
      agentPreference:requestedAdapterIntent,
      stackPreference:stack,
      githubPreference:githubIntent==='explicit-off'?false:
        githubIntent==='explicit-on'?true:null
    });
    return { ...plan, dryRun: true };
  }
  if(inspected.classification==='BLOCKED') {
    if(inspected.reason==='ROOT_MISSING') {
      // Retain future greenfield support without making a directory now.
      assertManagedMigrationGate();
    }
    throw new Error('VCP state requires inspection/recovery before init: '+inspected.reason);
  }
  if(inspected.classification==='MANAGED') {
    throw new Error('Already managed by VCP; use lifecycle update/status instead of init.');
  }
  if(inspected.classification==='EXISTING') {
    // The Stage13 entrypoint performs the hard D-01 check first, then
    // obtains its own adopt lock, re-plans and demands root-bound consent.
    // A Stage12 --dry-run object never grants execution authority.
    return applyStage13SmartInit({targetDir:target,
      agentPreference:requestedAdapterIntent,stackPreference:stack,
      githubPreference:githubIntent==='explicit-on'?true:
        githubIntent==='explicit-off'?false:null,
      adoptionApproval});
  }
  // Defense in depth: reject every NEW write before mkdir, backup or lock.
  // The versioned writer independently applies the same hard gate.
  assertManagedMigrationGate();
  await mkdir(target,{recursive:true});
  return applyAdaptiveGreenfield({
    targetDir:target,agent,stack,includeGitHub,
    requestedAdapterIntent,githubIntent
  });
}
