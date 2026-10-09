import { inspectProject } from './adoption-inspect.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { selectAssetPaths, assetSurfaceSnapshot } from './asset-catalog.mjs';
import { expandAssetRoots, CORE_ASSET_ROOTS, GITHUB_ASSET_ROOTS } from './template.mjs';
import { AGENT_CHOICES, adapterFiles } from './adapters.mjs';
import { STACK_CHOICES } from './stacks.mjs';

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
    const includeGitHub = githubPreference ?? (inspected.classification === 'NEW');
    const observedAdapters = [];
    for(const relative of ADAPTER_MARKERS) {
      if(await existsRegular(inspected.root, relative))observedAdapters.push(relative);
    }
    const proposals = await proposeCatalogPaths(assetSet,{includeGitHub,agentPreference});
    const skippedPaths=[],actions=[];
    for (const relative of proposals) {
      if (await existsRegular(inspected.root, relative)) {
        skippedPaths.push({ path: relative, reason: 'EXISTING_USER_CONTENT' });
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
      observedAdapters,managedAdapterSurface:[],
      humanDecisionRequired:needsStackDecision || inspected.classification === 'EXISTING',
      actions, skippedPaths, blocked: false, githubIncludedInPlan: includeGitHub,
      warnings:needsStackDecision?['POLYGLOT_STACK_DECISION_REQUIRED']:[],
      planSummary:{claim:actions.length,preserve:skippedPaths.length}
    };
  } catch {
    // A symlink, unreadable marker or unsafe catalog path must never become "absent".
    return { ...base, blocked: true, reason: 'UNSAFE_PROJECT_PATH', stack: 'generic',
      assetSet: null, stackEvidence: [] };
  }
}
