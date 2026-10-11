// Stage14 strict consumer-asset model. No manifest schema/version change.
// Legacy assetSet retains the exact historical broad-root inventory for
// lossless rollback; safe surfaces use an explicit, reviewed allowlist.
export const ASSET_SETS=Object.freeze([
  'legacy-full-v1','greenfield-safe-v1','brownfield-minimal-v1'
]);
export const ASSET_CLASSES=Object.freeze([
  'runtime-required','greenfield-starter','optional-hygiene','package-only'
]);
const CORE='AGENTS.md';
const LEGACY_CI='.github/workflows/validate.yml';
const HYGIENE=Object.freeze([
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/PULL_REQUEST_TEMPLATE.md'
]);
const ADAPTERS=Object.freeze(['CLAUDE.md','.github/copilot-instructions.md']);
const GREENFIELD_STARTERS=Object.freeze([
  'docs/product/PRODUCT-BRIEF.md','docs/product/PRD.md',
  'docs/product/USER-FLOWS.md','docs/architecture/DOMAIN.md',
  'docs/architecture/ARCHITECTURE.md','docs/architecture/DATA-MODEL.md',
  'docs/architecture/adr/ADR-TEMPLATE.md',
  'docs/security/THREAT-MODEL.md','docs/security/SECURITY-PROFILE.md',
  'docs/testing/TEST-STRATEGY.md',
  'docs/delivery/DEFINITION-OF-READY.md',
  'docs/delivery/DEFINITION-OF-DONE.md',
  'docs/delivery/TASK-TEMPLATE.md',
  'docs/delivery/RELEASE-CHECKLIST.md'
]);
export const STAGE14_SAFE_CONSUMER_PATHS=Object.freeze([
  CORE,...GREENFIELD_STARTERS,...HYGIENE,...ADAPTERS
].sort());
// New provider-owned Stage14 specification/evidence documents must never be
// swept into the historical v1 consumer surface via legacy docs/ traversal.
export const STAGE14_PROVIDER_SOURCE_DOCS=Object.freeze([
  'docs/CONSUMER-ASSET-SEPARATION.md',
  'docs/STAGE14-ACCEPTANCE-MATRIX.md',
  'docs/tasks/stage14-consumer-asset-separation.md'
]);
export const STAGE14_PACKAGE_RUNTIME=Object.freeze([
  'prompts/01-discovery.md','prompts/02-plan-task.md',
  'prompts/03-implement-task.md','prompts/04-code-review.md',
  'prompts/05-security-review.md','prompts/06-refactor.md',
  'prompts/07-release-review.md',
  'scripts/validate-framework.mjs','scripts/validate-framework.sh',
  LEGACY_CI
]);
const safe=new Set(STAGE14_SAFE_CONSUMER_PATHS);
const starter=new Set(GREENFIELD_STARTERS);
const hygiene=new Set(HYGIENE);
const adapter=new Set(ADAPTERS);
const packaged=new Set(STAGE14_PACKAGE_RUNTIME);

function failure(code,message){const e=new Error(message??code);e.code=code;throw e;}
export function requireAssetSet(assetSet){
  if(!ASSET_SETS.includes(assetSet))failure('E_ASSETSET_UNKNOWN',
    'Unknown or missing managed install.assetSet; explicit restore/repair required.');
  return assetSet;
}
export function validConsumerCatalogPath(relative){
  if(typeof relative!=='string'||!relative||relative.length>512||
     relative.includes('\\')||relative.includes('\0')||
     relative.startsWith('/')||/^[a-z]:/i.test(relative))return false;
  return relative.split('/').every(x=>x&&x!=='.'&&x!=='..'&&
    x.toLowerCase()!=='.vcp'&&x.toLowerCase()!=='.git'&&
    !x.includes(':')&&!/[. ]$/.test(x)&&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(x));
}
export function assertCatalogInventory(candidates){
  if(!Array.isArray(candidates)||candidates.length>30000)
    failure('E_ASSET_CATALOG_LIMIT');
  const canonical=new Set(),names=new Set();
  for(const relative of candidates){
    if(!validConsumerCatalogPath(relative))failure('E_ASSET_CATALOG_PATH');
    const folded=relative.normalize('NFC').toLowerCase();
    if(canonical.has(folded))failure('E_ASSET_CATALOG_COLLISION');
    canonical.add(folded); names.add(relative);
  }
  for(const relative of canonical){
    let ancestor=relative;
    while(ancestor.includes('/')){
      ancestor=ancestor.slice(0,ancestor.lastIndexOf('/'));
      if(canonical.has(ancestor))failure('E_ASSET_CATALOG_FILE_DIRECTORY_COLLISION');
    }
  }
  return names;
}
export function classifyConsumerAsset(relative){
  if(!validConsumerCatalogPath(relative))failure('E_ASSET_CATALOG_PATH');
  if(relative===CORE||adapter.has(relative))return 'runtime-required';
  if(starter.has(relative))return 'greenfield-starter';
  if(hygiene.has(relative))return 'optional-hygiene';
  // Includes historic source documentation, CLI framework source, prompts,
  // validators and legacy workflow. Package presence != consumer ownership.
  return 'package-only';
}
export function describeConsumerAssetCatalog(candidates){
  assertCatalogInventory(candidates);
  return Object.freeze(candidates.map(path=>Object.freeze({
    path,classification:classifyConsumerAsset(path),
    eligibleAssetSets:Object.freeze(ASSET_SETS.filter(assetSet=>
      assetSet==='legacy-full-v1'||(safe.has(path)&&(
        assetSet==='greenfield-safe-v1'||!starter.has(path)))))
  })).sort((a,b)=>a.path.localeCompare(b.path)));
}
export function selectAssetPaths(assetSet,candidates,{
  includeGitHub=true,includeRequestedCopilot=false
}={}){
  requireAssetSet(assetSet);
  assertCatalogInventory(candidates);
  if(typeof includeGitHub!=='boolean'||typeof includeRequestedCopilot!=='boolean')
    failure('E_ASSET_CATALOG_OPTIONS');
  return candidates.filter(relative=>{
    if(!includeGitHub&&relative.startsWith('.github/')&&
       !(includeRequestedCopilot&&relative==='.github/copilot-instructions.md'))
      return false;
    if(assetSet==='legacy-full-v1')return true;
    if(!safe.has(relative))return false;
    if(relative==='.github/copilot-instructions.md'&&!includeRequestedCopilot)
      return false;
    return assetSet==='greenfield-safe-v1'||!starter.has(relative);
  }).sort();
}
export function selectPackagedPromptEligibility(assetSet,requestedPath){
  requireAssetSet(assetSet);
  return typeof requestedPath==='string'&&validConsumerCatalogPath(requestedPath)&&
    packaged.has(requestedPath)&&requestedPath.startsWith('prompts/');
}
export function assetSurfaceSnapshot(assetSet,{includeGitHub=true}={}){
  requireAssetSet(assetSet);
  return Object.freeze({
    catalogVersion:2,assetSet,sourceWorkflowIncluded:
      assetSet==='legacy-full-v1'&&includeGitHub,
    githubScaffoldingIncluded:Boolean(includeGitHub),
    coreAgentFile:CORE,brownfieldNonMutating:assetSet==='brownfield-minimal-v1',
    explicitSafeInventory:assetSet!=='legacy-full-v1',
    packagedPromptFallback:true,
    consumerStarterCount:assetSet==='greenfield-safe-v1'?starter.size:0
  });
}
