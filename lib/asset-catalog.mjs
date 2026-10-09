// Stage12 consumer asset catalog (v1). A surface is product identity, not ignoredFiles.
// The shipped package retains legacy assets as upgrade inputs; safe profiles omit source CI.
export const ASSET_SETS = Object.freeze([
  'legacy-full-v1',
  'greenfield-safe-v1',
  'brownfield-minimal-v1'
]);
const sourceWorkflow='.github/workflows/validate.yml';
const rootAgents='AGENTS.md';
const minimal=new Set([
  'AGENTS.md',
  'docs/product/PRODUCT-BRIEF.md',
  'docs/product/PRD.md',
  'docs/architecture/ARCHITECTURE.md',
  'docs/security/THREAT-MODEL.md',
  'docs/testing/TEST-STRATEGY.md',
  'docs/delivery/DEFINITION-OF-READY.md',
  'docs/delivery/DEFINITION-OF-DONE.md',
  '.github/ISSUE_TEMPLATE/bug_report.md',
  '.github/ISSUE_TEMPLATE/feature_request.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md'
]);

export function requireAssetSet(assetSet) {
  if (!ASSET_SETS.includes(assetSet)) {
    const err=new Error('Unknown or missing managed install.assetSet; explicit restore/repair required.');
    err.code='E_ASSETSET_UNKNOWN';
    throw err;
  }
  return assetSet;
}

export function selectAssetPaths(assetSet, candidates, { includeGitHub = true } = {}) {
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
    if(!includeGitHub && path.startsWith('.github/'))continue;
    if(assetSet!=='legacy-full-v1' && path===sourceWorkflow)continue;
    if(assetSet==='brownfield-minimal-v1' && !minimal.has(path))continue;
    selected.push(path);
  }
  return selected.sort();
}

export function selectPackagedPromptEligibility(assetSet, requestedPath) {
  requireAssetSet(assetSet);
  if(typeof requestedPath!=='string' || requestedPath.startsWith('/') || requestedPath.includes('..') ||
    requestedPath.includes('\\') || requestedPath.startsWith('.vcp/')) return false;
  if(assetSet==='brownfield-minimal-v1') {
    // A skipped starter prompt is not present: never use packaged fallback for it.
    return false;
  }
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
