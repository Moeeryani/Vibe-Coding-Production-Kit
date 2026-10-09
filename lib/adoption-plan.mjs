import { inspectProject } from './adoption-inspect.mjs';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { selectAssetPaths, assetSurfaceSnapshot } from './asset-catalog.mjs';
import { expandAssetRoots, CORE_ASSET_ROOTS, GITHUB_ASSET_ROOTS } from './template.mjs';
import { AGENT_CHOICES, adapterFiles } from './adapters.mjs';
import { STACK_CHOICES } from './stacks.mjs';
import { inspectAgentSectionAdoption } from './section-adoption.mjs';

const STACK_MARKERS = Object.freeze([
  ['javascript', 'package.json'],
  ['typescript', 'tsconfig.json'],
  ['python', 'pyproject.toml'],
  ['python', 'requirements.txt'],
  ['go', 'go.mod']
]);
const ADAPTER_MARKERS = Object.freeze([
  'AGENTS.md','CLAUDE.md','.github/copilot-instructions.md','.cursor/rules'
]);

async function existsRegular(root, relative) {
  try {
    await resolveProjectPath(root, relative, { purpose: 'read-existing' });
    return true;
  } catch (error) {
    if (error.code === 'E_VCP_PATH' && error.message.includes('MISSING_INPUT')) return false;
    throw error;
  }
}

async function observesAdapterMarker(root,relative) {
  try{return await existsRegular(root,relative);}
  catch(error) {
    // Cursor commonly uses a real .cursor/rules DIRECTORY. Its presence is
    // evidence, not an unsafe file or permission to read that directory.
    if(relative!=='.cursor/rules' || error?.code!=='E_VCP_PATH' ||
      !error.message.includes('NOT_REGULAR_FILE'))throw error;
    const probe=await resolveProjectPath(root,relative+'/.__vcp_readonly_probe__',{
      purpose:'write-new'
    });
    const stat=await lstat(path.dirname(probe));
    if(!stat.isDirectory()||stat.isSymbolicLink())throw error;
    return true;
  }
}

export async function detectAdoptionStack(root) {
  const evidence = [];
  for (const [stack, relative] of STACK_MARKERS) {
    if (await existsRegular(root, relative)) evidence.push({ stack, path: relative });
  }
  const families = new Set(evidence.map(item => (
    item.stack === 'javascript' || item.stack === 'typescript' ? 'javascript' : item.stack
  )));
  if (families.size > 1) {
    return { stack: 'generic', evidence, polyglot: true, decisionRequired: true };
  }
  const stack = families.size === 0 ? 'generic'
    : families.has('javascript') ? (evidence.some(item => item.stack === 'typescript') ? 'typescript' : 'javascript')
    : [...families][0];
  return { stack, evidence, polyglot: false, decisionRequired: false };
}

async function proposeCatalogPaths(assetSet, {includeGitHub, agentPreference}) {
  const roots=[...CORE_ASSET_ROOTS,...(includeGitHub?GITHUB_ASSET_ROOTS:[])];
  const packaged=await expandAssetRoots(roots);
  const adapters=agentPreference? [...adapterFiles(agentPreference).keys()] : [];
  return selectAssetPaths(assetSet, [...new Set([...packaged,...adapters])], {includeGitHub});
}

export async function planSmartInit(targetDir, {
  agentPreference = null, stackPreference = 'auto', githubPreference = null
} = {}) {
  if (agentPreference!==null && !AGENT_CHOICES.includes(agentPreference))throw new Error('Invalid explicit agent intent.');
  if (!STACK_CHOICES.includes(stackPreference))throw new Error('Invalid stack preference.');
  if (githubPreference!==null && typeof githubPreference!=='boolean')throw new Error('Invalid GitHub preference.');
  const inspected = await inspectProject(targetDir);
  const request = {
    agent: agentPreference===null?{kind:'unspecified'}:{kind:'explicit',value:agentPreference},
    stack: stackPreference==='auto'?{kind:'unspecified'}:{kind:'explicit',value:stackPreference},
    github: githubPreference===null?{kind:'unspecified'}:{kind:githubPreference?'explicit-on':'explicit-off'}
  };
  const base = {
    planVersion: 1, planKind: 'init', root: inspected.root,
    classification: inspected.classification, zeroWrite: true, previewOnly: true,
    actions: [], skippedPaths: [], humanDecisionRequired: false,
    requestedIntent: request, executionAuthorized: false
  };
  if (inspected.classification === 'BLOCKED') {
    return { ...base, blocked: true, reason: inspected.reason, stack: 'generic',
      assetSet: null, stackEvidence: [] };
  }
  if (inspected.classification === 'MANAGED') {
    return { ...base, blocked: true, reason: 'ALREADY_MANAGED_USE_UPDATE',
      stack: 'generic', assetSet: inspected.assetSet, stackEvidence: [] };
  }
  try {
    const identified = await detectAdoptionStack(inspected.root);
    const assetSet = inspected.classification === 'NEW' ? 'greenfield-safe-v1' : 'brownfield-minimal-v1';
    const requestedCopilot=agentPreference==='copilot'||agentPreference==='all';
    const includeGitHub=githubPreference??(
      inspected.classification==='NEW'||requestedCopilot
    );
    const incompatibleGitHubIntent=githubPreference===false&&requestedCopilot;
    const observedAdapters = [];
    for(const relative of ADAPTER_MARKERS) {
      if(await observesAdapterMarker(inspected.root, relative))observedAdapters.push(relative);
    }
    const proposals = await proposeCatalogPaths(assetSet,{includeGitHub,agentPreference});
    const skippedPaths=[],actions=[],sectionConflicts=[],observedCompatibleAdapters=[];
    const agentSurfaces=new Set(['AGENTS.md','CLAUDE.md','.github/copilot-instructions.md']);
    // Existing vendor instructions matter as read-only evidence even when the
    // user never requested creation of an absent vendor adapter.
    if(inspected.classification==='EXISTING') {
      for(const relative of ['CLAUDE.md','.github/copilot-instructions.md']) {
        if(await existsRegular(inspected.root,relative)&&!proposals.includes(relative)) {
          proposals.push(relative);
        }
      }
      proposals.sort();
    }
    if(incompatibleGitHubIntent) {
      sectionConflicts.push({action:'CONFLICT',path:'.github/copilot-instructions.md',
        reason:'COPILOT_INTENT_CONFLICTS_WITH_EXPLICIT_GITHUB_OFF',
        humanDecisionRequired:true,executionAuthorized:false});
    }
    for (const relative of proposals) {
      if (await existsRegular(inspected.root, relative)) {
        if(inspected.classification==='EXISTING'&&agentSurfaces.has(relative)) {
          const section=await inspectAgentSectionAdoption(inspected.root,relative);
          if(section.classification==='NOOP_COMPATIBLE'){
            observedCompatibleAdapters.push(relative);
            skippedPaths.push({path:relative,reason:'COMPATIBLE_PROJECT_OWNED_NOOP'});
          } else if(section.classification==='SECTION_CANDIDATE') {
            if(relative==='.github/copilot-instructions.md'&&githubPreference===false) {
              skippedPaths.push({path:relative,reason:'EXPLICIT_GITHUB_OFF_PRESERVED'});
            } else {
              actions.push({action:'PROPOSE_SECTION',proposedVerb:'COMPOSE',
                path:relative,sectionId:section.sectionId,
                ownershipProposal:'managed-section',
                managedAdapterReason:relative==='AGENTS.md'?null:
                  agentPreference?'explicit-request':'observed-existing',
                reason:section.reason,executionAuthorized:false,
                preservesWholeUserDocument:true});
              skippedPaths.push({path:relative,reason:'USER_BYTES_NOT_OWNED'});
            }
          } else {
            const conflict={action:'CONFLICT',path:relative,
              reason:section.reason,existingSectionIds:section.existingSectionIds,
              humanDecisionRequired:true,executionAuthorized:false};
            actions.push(conflict);
            sectionConflicts.push(conflict);
            skippedPaths.push({path:relative,reason:'USER_BYTES_NOT_OWNED'});
          }
        } else {
          skippedPaths.push({ path: relative, reason: 'EXISTING_USER_CONTENT' });
        }
      } else {
        actions.push({ action: 'CLAIM', path: relative, executionAuthorized: false,
          ownershipProposal:'whole-file' });
      }
    }
    const stack = stackPreference==='auto'?identified.stack:stackPreference;
    const needsStackDecision=identified.polyglot&&stackPreference==='auto';
    return {
      ...base, stack, assetSet, assetSurface:assetSurfaceSnapshot(assetSet,{includeGitHub}),
      stackEvidence: identified.evidence, polyglot: identified.polyglot,
      observedAdapters,observedCompatibleAdapters,
      managedAdapterSurface:[],
      proposedManagedAdapterSurface:actions.filter(x=>
        x.action==='PROPOSE_SECTION'&&x.managedAdapterReason
      ).map(x=>({path:x.path,ownership:'managed-section',
        reason:x.managedAdapterReason})),
      humanDecisionRequired:needsStackDecision || inspected.classification === 'EXISTING' ||
        sectionConflicts.length>0,
      actions, skippedPaths, blocked:sectionConflicts.length>0,
      reason:sectionConflicts.length?'SECTION_MARKER_CONFLICT':null,
      githubIncludedInPlan: includeGitHub,
      warnings:[...(needsStackDecision?['POLYGLOT_STACK_DECISION_REQUIRED']:[]),
        ...(sectionConflicts.length?['ADAPTER_OR_SECTION_INTENT_CONFLICT']:[])],
      planSummary:{
        claim:actions.filter(x=>x.action==='CLAIM').length,
        section:actions.filter(x=>x.action==='PROPOSE_SECTION').length,
        conflicts:sectionConflicts.length,preserve:skippedPaths.length
      }
    };
  } catch {
    // A symlink, unreadable marker or unsafe catalog path must never become "absent".
    return { ...base, blocked: true, reason: 'UNSAFE_PROJECT_PATH', stack: 'generic',
      assetSet: null, stackEvidence: [] };
  }
}
