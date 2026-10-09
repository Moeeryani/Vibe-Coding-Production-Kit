// Stage12 consumer asset catalog (v1). A surface is product identity, not ignoredFiles.
// The shipped package retains legacy assets as upgrade inputs; safe profiles omit source CI.
export const ASSET_SETS = Object.freeze([
  'legacy-full-v1',
  'greenfield-safe-v1',
  'brownfield-minimal-v1'
]);
const sourceWorkflow='.github/workflows/validate.yml';
const rootAgents='AGENTS.md';
// The brownfield core is intentionally not a bundle of new Source-of-Truth
// starter documents. Existing product/architecture/testing docs remain user
// authority; VCP supplies only routing and explicitly requested adapters.
const brownfieldCore=new Set([
  'AGENTS.md','CLAUDE.md','.github/copilot-instructions.md'
]);
const brownfieldHygiene=new Set([
  '.github/ISSUE_TEMPLATE/bug_report.md',
  '.github/ISSUE_TEMPLATE/feature_request.md',
  '.github/PULL_REQUEST_TEMPLATE.md'
]);

export function requireAssetSet(assetSet) {
  if (!ASSET_SETS.includes(assetSet)) {
    const err=new Error('Unknown or missing managed install.assetSet; explicit restore/repair required.');
    err.code='E_ASSETSET_UNKNOWN';
    throw err;
  }
  return assetSet;
}

export function selectAssetPaths(assetSet, candidates, {
  includeGitHub = true, includeRequestedCopilot = false
} = {}) {
  requireAssetSet(assetSet);
  const selected=[];
  const seen=new Set();
  for(const path of candidates) {
    if(typeof path!=='string' || !path || path.includes('\\') || path.includes('..') ||
      path.startsWith('/') || path.startsWith('.vcp/')) {
      throw new Error('Unsafe packaged catalog path.');
    }
    if(seen.has(path))throw new Error('Duplicate catalog path.');
    seen.add(path);
    if(!includeGitHub&&path.startsWith('.github/')&&
      !(includeRequestedCopilot&&path==='.github/copilot-instructions.md'))continue;
    if(assetSet!=='legacy-full-v1' && path===sourceWorkflow)continue;
    if(assetSet==='brownfield-minimal-v1' &&
       !brownfieldCore.has(path)&&
       !(includeGitHub&&brownfieldHygiene.has(path)))continue;
    selected.push(path);
  }
  return selected.sort();
}

export function selectPackagedPromptEligibility(assetSet, requestedPath) {
  requireAssetSet(assetSet);
  if(typeof requestedPath!=='string' || requestedPath.startsWith('/') || requestedPath.includes('..') ||
    requestedPath.includes('\\') || requestedPath.startsWith('.vcp/')) return false;
  // Prompts are executable context resources, not claims that a skipped
  // starter document exists in the project. A minimal install may use packaged
  // canonical prompts but may not inject fictional docs/source-truth references.
  return requestedPath.startsWith('prompts/') && requestedPath.endsWith('.md');
}

export function assetSurfaceSnapshot(assetSet,{includeGitHub=true}={}) {
  requireAssetSet(assetSet);
  return Object.freeze({catalogVersion:1,assetSet,
    sourceWorkflowIncluded:assetSet==='legacy-full-v1' && includeGitHub,
    githubScaffoldingIncluded:Boolean(includeGitHub),
    coreAgentFile:rootAgents,
    brownfieldNonMutating:assetSet==='brownfield-minimal-v1'});
}
