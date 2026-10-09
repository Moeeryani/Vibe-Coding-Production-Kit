import { parseSemver, readerSupports } from './semver.mjs';
import { requireAssetSet } from './asset-catalog.mjs';

// Stage12 schema-v2 semantic model. This is a reader/preview boundary, not
// permission to write v2. G-FENCE remains NO-GO until published-old-CLI proof.
export const ADAPTIVE_MANIFEST_SCHEMA=2;
const OWNERSHIP=['whole-file','managed-section'];
const has=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function blocked(code) { const e=new Error(code);e.code=code;throw e; }
function version(x) { try { parseSemver(x);return true; }catch{return false;} }

export function installMetadata({agent='generic',stack='generic',requestedStack=null,
  includeGitHub=true,assetSet,requestedAdapterIntent=null,githubIntent='unspecified'}={}) {
  requireAssetSet(assetSet);
  if(!['unspecified','explicit-on','explicit-off'].includes(githubIntent))blocked('E_GITHUB_INTENT');
  if(requestedAdapterIntent!==null && !['generic','codex','cursor','claude','copilot','all'].includes(requestedAdapterIntent)) {
    blocked('E_ADAPTER_INTENT');
  }
  return {agent,stack,requestedStack,includeGitHub:Boolean(includeGitHub),assetSet,
    requestedAdapterIntent,githubIntent};
}
const FORBIDDEN_COMPONENT=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
export function validManagedRelative(file) {
  if(typeof file!=='string'||!file||file.includes('\\\\')||file.includes('\\0')||
      file.startsWith('/')||/^[a-z]:/i.test(file))return false;
  const parts=file.split('/');
  return parts.every(part=>part&&part!=='.'&&part!=='..'&&
    part.toLowerCase()!=='.vcp'&&part.toLowerCase()!=='.git'&&
    !part.includes(':')&&!/[. ]$/.test(part)&&!FORBIDDEN_COMPONENT.test(part));
}

export function validateAdaptiveManifest(value,{readerVersion}={}) {
  if(!record(value)||value.schemaVersion!==ADAPTIVE_MANIFEST_SCHEMA)blocked('E_MANIFEST_SCHEMA');
  if(!version(value.installedVersion)||!version(value.minimumReaderVersion))blocked('E_MANIFEST_VERSION');
  if(!readerVersion || !version(readerVersion))blocked('E_READER_VERSION');
  if(!readerSupports(value.minimumReaderVersion,readerVersion))blocked('E_MINIMUM_READER');
  if(!record(value.install))blocked('E_INSTALL_METADATA');
  requireAssetSet(value.install.assetSet);
  if(!['generic','codex','cursor','claude','copilot','all'].includes(value.install.agent)||
    typeof value.install.stack!=='string'||!value.install.stack||
    typeof value.install.includeGitHub!=='boolean'||
    !['unspecified','explicit-on','explicit-off'].includes(value.install.githubIntent)||
    (value.install.requestedAdapterIntent!==null &&
      !['generic','codex','cursor','claude','copilot','all'].includes(value.install.requestedAdapterIntent))) {
    blocked('E_INSTALL_METADATA');
  }
  if(!record(value.managedFiles)||!Array.isArray(value.ignoredFiles))blocked('E_MANAGED_METADATA');
  if(!record(value.ownership))blocked('E_OWNERSHIP_MISSING');
  const paths=Object.keys(value.managedFiles).sort();
  if(paths.length>10000||value.ignoredFiles.length>10000)blocked('E_MANAGED_METADATA');
  const ignored=new Set();
  for(const file of value.ignoredFiles) {
    if(!validManagedRelative(file)||ignored.has(file)||has(value.managedFiles,file))blocked('E_IGNORED_PATH');
    ignored.add(file);
  }
  for(const [file,entry] of Object.entries(value.managedFiles)) {
    if(!validManagedRelative(file)||!record(entry)||
      !(/^[a-f0-9]{64}$/).test(entry.baselineHash)||
      !validManagedRelative(entry.baselinePath.replace(/^\.vcp\/baselines\//,''))||
      !entry.baselinePath.startsWith('.vcp/baselines/'))blocked('E_MANAGED_ENTRY');
  }
  for(const [file,entry] of Object.entries(value.ownership)) {
    if(!validManagedRelative(file))blocked('E_OWNERSHIP_PATH');
    if(!record(entry)||!OWNERSHIP.includes(entry.kind))blocked('E_OWNERSHIP_KIND');
    if(entry.kind==='managed-section') {
      if(typeof entry.sectionId!=='string'||!(/^[a-z0-9-]{1,64}$/).test(entry.sectionId)||
        typeof entry.baselineHash!=='string'||!(/^[0-9a-f]{64}$/).test(entry.baselineHash))blocked('E_OWNERSHIP_SECTION');
    }else if(has(entry,'sectionId')) blocked('E_OWNERSHIP_WHOLE');
    if(!has(value.managedFiles,file)) blocked('E_OWNERSHIP_UNTRACKED');
  }
  for(const file of paths) if(!has(value.ownership,file)) blocked('E_OWNERSHIP_MISSING_FILE');
  if(value.approvalReceipts!==undefined) {
    if(!Array.isArray(value.approvalReceipts)||value.approvalReceipts.length>64)blocked('E_APPROVAL_RECEIPTS');
    for(const receipt of value.approvalReceipts) {
      if(!record(receipt)||typeof receipt.key!=='string'||receipt.key.length>64||
        !(/^[0-9a-f]{64}$/).test(receipt.digest)||typeof receipt.source!=='string'||
        receipt.source.length>128||typeof receipt.policyVersion!=='string'||
        receipt.policyVersion.length>32||typeof receipt.decision!=='string'||
        receipt.decision.length>32)blocked('E_APPROVAL_RECEIPTS');
    }
  }
  return Object.freeze({schemaVersion:2,assetSet:value.install.assetSet,
    minimumReaderVersion:value.minimumReaderVersion,managedFileCount:paths.length,
    sections:Object.values(value.ownership).filter(x=>x.kind==='managed-section').length});
}

export function previewV1ToV2(manifest,{readerVersion}={}) {
  if(!record(manifest)||manifest.schemaVersion!==1)blocked('E_V1_PREVIEW_INPUT');
  if(!version(readerVersion)||!version(manifest.installedVersion))blocked('E_MANIFEST_VERSION');
  if(!record(manifest.install)||!record(manifest.managedFiles))blocked('E_V1_PREVIEW_INPUT');
  // Do not invent section ownership for historical whole-file baselines.
  const ownership=Object.fromEntries(Object.keys(manifest.managedFiles).sort()
    .map(file=>[file,{kind:'whole-file'}]));
  return {
    ...manifest,
    schemaVersion:2,
    minimumReaderVersion:readerVersion,
    install:installMetadata({...manifest.install,assetSet:'legacy-full-v1'}),
    ownership,approvalReceipts:[],
    migrationProvenance:{fromSchema:1,toSchema:2,source:'legacy-full-v1'}
  };
}
