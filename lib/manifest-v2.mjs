import { parseSemver, readerSupports } from './semver.mjs';
import { requireAssetSet } from './asset-catalog.mjs';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { getCliVersion } from './version.mjs';

// Stage12 schema-v2 semantic model. This is a reader/preview boundary, not
// permission to write v2. G-FENCE remains NO-GO until published-old-CLI proof.
export const ADAPTIVE_MANIFEST_SCHEMA=2;
const OWNERSHIP=['whole-file','managed-section'];
const has=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function blocked(code) { const e=new Error(code);e.code=code;throw e; }
function version(x) { try { parseSemver(x);return true; }catch{return false;} }
const V2_ROOT_FIELDS=new Set([
  'schemaVersion','installedVersion','installedAt','updatedAt',
  'install','ignoredFiles','managedFiles','minimumReaderVersion',
  'ownership','approvalReceipts','migrationProvenance'
]);
const V2_INSTALL_FIELDS=new Set([
  'agent','stack','requestedStack','includeGitHub',
  'assetSet','requestedAdapterIntent','githubIntent','managedAdapterSurface'
]);
const V2_MANAGED_ENTRY_FIELDS=new Set([
  'policy','origin','mode','baselineHash','baselinePath','templateVersion'
]);
const V2_OWNERSHIP_FIELDS=new Set(['kind','sectionId','baselineHash']);
const V2_RECEIPT_FIELDS=new Set([
  'key','digest','source','policyVersion','decision','approvalId','grandfathered'
]);
function requireKnownFields(value,allowed,code) {
  if(!record(value))blocked(code);
  for(const field of Object.keys(value)) {
    if(!allowed.has(field))blocked(code);
  }
}


const ADAPTER_PATHS=new Set(['CLAUDE.md','.github/copilot-instructions.md']);
const ADAPTER_ORIGINS=new Set(['explicit-request','observed-existing','legacy-managed']);
const adapterIntentFromLegacy=agent=>
  ['claude','copilot','all'].includes(agent)?agent:null;
function normalizeManagedAdapterSurface(surface) {
  if(!Array.isArray(surface)||surface.length>16)blocked('E_ADAPTER_SURFACE');
  const seen=new Set();
  return surface.map(entry=>{
    if(!record(entry)||!ADAPTER_PATHS.has(entry.path)||
       !['whole-file','managed-section'].includes(entry.ownership)||
       !ADAPTER_ORIGINS.has(entry.reason)||seen.has(entry.path))blocked('E_ADAPTER_SURFACE');
    seen.add(entry.path);
    return {path:entry.path,ownership:entry.ownership,reason:entry.reason};
  }).sort((a,b)=>a.path.localeCompare(b.path));
}
export function installMetadata({agent='generic',stack='generic',requestedStack=null,
  includeGitHub=true,assetSet,requestedAdapterIntent=null,githubIntent='unspecified',
  managedAdapterSurface=[]}={}) {
  requireAssetSet(assetSet);
  if(!['unspecified','explicit-on','explicit-off'].includes(githubIntent))blocked('E_GITHUB_INTENT');
  if(requestedAdapterIntent!==null &&
     !['generic','codex','cursor','claude','copilot','all'].includes(requestedAdapterIntent)) {
    blocked('E_ADAPTER_INTENT');
  }
  if(githubIntent==='explicit-off'&&includeGitHub)blocked('E_GITHUB_INTENT_CONFLICT');
  if(githubIntent==='explicit-on'&&!includeGitHub)blocked('E_GITHUB_INTENT_CONFLICT');
  if(githubIntent==='explicit-off'&&['copilot','all'].includes(requestedAdapterIntent)) {
    blocked('E_ADAPTER_GITHUB_INTENT_CONFLICT');
  }
  return {agent,stack,requestedStack,includeGitHub:Boolean(includeGitHub),assetSet,
    requestedAdapterIntent,githubIntent,
    managedAdapterSurface:normalizeManagedAdapterSurface(managedAdapterSurface)};
}

const FORBIDDEN_COMPONENT=/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
export function validManagedRelative(file) {
  if(typeof file!=='string'||!file||file.length>512||
    file.includes(String.fromCharCode(0))||file.includes(String.fromCharCode(92))||
    file.startsWith('/')||/^[a-z]:/i.test(file))return false;
  const parts=file.split('/');
  return parts.every(part=>part&&part!=='.'&&part!=='..'&&
    part.toLowerCase()!=='.vcp'&&part.toLowerCase()!=='.git'&&
    !part.includes(':')&&!/[. ]$/.test(part)&&!FORBIDDEN_COMPONENT.test(part));
}

export function validateAdaptiveManifest(value,{readerVersion}={}) {
  if(!record(value)||value.schemaVersion!==ADAPTIVE_MANIFEST_SCHEMA)blocked('E_MANIFEST_SCHEMA');
  requireKnownFields(value,V2_ROOT_FIELDS,'E_MANIFEST_UNRECOGNIZED_FIELD');
  if(!version(value.installedVersion)||!version(value.minimumReaderVersion))blocked('E_MANIFEST_VERSION');
  if(!readerVersion || !version(readerVersion))blocked('E_READER_VERSION');
  if(!readerSupports(value.minimumReaderVersion,readerVersion))blocked('E_MINIMUM_READER');
  requireKnownFields(value.install,V2_INSTALL_FIELDS,'E_INSTALL_UNRECOGNIZED_FIELD');
  requireAssetSet(value.install.assetSet);
  if(!['generic','codex','cursor','claude','copilot','all'].includes(value.install.agent)||
    typeof value.install.stack!=='string'||!value.install.stack||
    typeof value.install.includeGitHub!=='boolean'||
    !['unspecified','explicit-on','explicit-off'].includes(value.install.githubIntent)||
    (value.install.requestedAdapterIntent!==null &&
      !['generic','codex','cursor','claude','copilot','all'].includes(value.install.requestedAdapterIntent))) {
    blocked('E_INSTALL_METADATA');
  }
  if(!record(value.managedFiles)||!record(value.ownership)||
    !Array.isArray(value.ignoredFiles))blocked('E_MANAGED_METADATA');
  if((value.install.githubIntent==='explicit-off'&&value.install.includeGitHub)||
     (value.install.githubIntent==='explicit-on'&&!value.install.includeGitHub)) {
    blocked('E_GITHUB_INTENT_CONFLICT');
  }
  if(value.install.githubIntent==='explicit-off'&&
     ['copilot','all'].includes(value.install.requestedAdapterIntent)) {
    blocked('E_ADAPTER_GITHUB_INTENT_CONFLICT');
  }
  const adapterSurface=normalizeManagedAdapterSurface(value.install.managedAdapterSurface);
  for(const item of adapterSurface) {
    if(!has(value.managedFiles,item.path)||!has(value.ownership,item.path)||
      value.ownership[item.path].kind!==item.ownership)blocked('E_ADAPTER_UNCLAIMED');
    if(item.reason==='observed-existing'&&item.ownership!=='managed-section') {
      blocked('E_ADAPTER_OBSERVED_WHOLE_FILE');
    }
  }
  const paths=Object.keys(value.managedFiles).sort();
  if(paths.length>10000||value.ignoredFiles.length>10000)blocked('E_MANAGED_METADATA');
  // Git and Windows commonly treat case variants as the same path. Reject
  // collisions *before* planning any byte writes, even on case-sensitive OS.
  const canonical=new Set();
  for(const file of [...paths,...value.ignoredFiles]) {
    const folded=typeof file==='string'?file.toLowerCase():null;
    if(folded===null||canonical.has(folded))blocked('E_MANAGED_CASE_COLLISION');
    canonical.add(folded);
  }
  const ignored=new Set();
  for(const file of value.ignoredFiles) {
    if(!validManagedRelative(file)||ignored.has(file)||has(value.managedFiles,file))blocked('E_IGNORED_PATH');
    ignored.add(file);
  }
  for(const [file,entry] of Object.entries(value.managedFiles)) {
    requireKnownFields(entry,V2_MANAGED_ENTRY_FIELDS,'E_MANAGED_UNRECOGNIZED_FIELD');
    if(!validManagedRelative(file)||!record(entry)||
      !['managed','merge','generated','preserve'].includes(entry.policy)||
      typeof entry.origin!=='string'||entry.origin.length===0||
      entry.origin.length>64||!(/^[a-z0-9-]+$/).test(entry.origin)||
      !Number.isInteger(entry.mode)||entry.mode<0||entry.mode>0o777||
      !version(entry.templateVersion)||
      !(/^[a-f0-9]{64}$/).test(entry.baselineHash)||
      typeof entry.baselinePath!=='string'||
      !validManagedRelative(entry.baselinePath.replace(/^\.vcp\/baselines\//,''))||
      entry.baselinePath!=='.vcp/baselines/'+file)blocked('E_MANAGED_ENTRY');
  }
  for(const [file,entry] of Object.entries(value.ownership)) {
    requireKnownFields(entry,V2_OWNERSHIP_FIELDS,'E_OWNERSHIP_UNRECOGNIZED_FIELD');
    if(!validManagedRelative(file))blocked('E_OWNERSHIP_PATH');
    if(!record(entry)||!OWNERSHIP.includes(entry.kind))blocked('E_OWNERSHIP_KIND');
    if(entry.kind==='managed-section') {
      if(typeof entry.sectionId!=='string'||!(/^[a-z0-9-]{1,64}$/).test(entry.sectionId)||
        typeof entry.baselineHash!=='string'||!(/^[0-9a-f]{64}$/).test(entry.baselineHash))blocked('E_OWNERSHIP_SECTION');
    }else if(has(entry,'sectionId')) blocked('E_OWNERSHIP_WHOLE');
    if(!has(value.managedFiles,file)) blocked('E_OWNERSHIP_UNTRACKED');
    if(entry.kind==='managed-section'&&
      entry.baselineHash!==value.managedFiles[file].baselineHash) {
      blocked('E_OWNERSHIP_BASELINE_MISMATCH');
    }
  }
  for(const file of paths) if(!has(value.ownership,file)) blocked('E_OWNERSHIP_MISSING_FILE');
  if(value.approvalReceipts!==undefined) {
    if(!Array.isArray(value.approvalReceipts)||value.approvalReceipts.length>64)blocked('E_APPROVAL_RECEIPTS');
    for(const receipt of value.approvalReceipts) {
      requireKnownFields(receipt,V2_RECEIPT_FIELDS,'E_APPROVAL_UNRECOGNIZED_FIELD');
      if(!record(receipt)||typeof receipt.key!=='string'||receipt.key.length>64||
        !(/^[0-9a-f]{64}$/).test(receipt.digest)||typeof receipt.source!=='string'||
        receipt.source.length>128||typeof receipt.policyVersion!=='string'||
        receipt.policyVersion.length>32||typeof receipt.decision!=='string'||
        receipt.decision.length>32)blocked('E_APPROVAL_RECEIPTS');
    }
  }
  if(value.migrationProvenance!==undefined) {
    const migration=value.migrationProvenance;
    requireKnownFields(migration,new Set(['fromSchema','toSchema','source']),
      'E_MIGRATION_PROVENANCE');
    if(migration.fromSchema!==1||migration.toSchema!==2||
      migration.source!=='legacy-full-v1')blocked('E_MIGRATION_PROVENANCE');
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
    install:installMetadata({...manifest.install,assetSet:'legacy-full-v1',
      requestedAdapterIntent:adapterIntentFromLegacy(manifest.install.agent),
      managedAdapterSurface:Object.keys(manifest.managedFiles)
        .filter(file=>ADAPTER_PATHS.has(file))
        .map(file=>({path:file,ownership:'whole-file',reason:'legacy-managed'}))
    }),
    ownership,approvalReceipts:[],
    migrationProvenance:{fromSchema:1,toSchema:2,source:'legacy-full-v1'}
  };
}


const MAX_V2_MANIFEST_BYTES=256*1024;
export async function readAdaptiveManifest(root,{readerVersion=null}={}) {
  const filename=await resolveProjectPath(root,'.vcp/manifest.json',{
    purpose:'managed-state',mustExist:true
  });
  const first=await lstat(filename);
  if(!first.isFile()||first.isSymbolicLink()||first.size>MAX_V2_MANIFEST_BYTES)blocked('E_MANIFEST_FILE');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const st=await fd.stat();
    if(!st.isFile()||st.dev!==first.dev||st.ino!==first.ino||
      st.size!==first.size||st.mtimeMs!==first.mtimeMs)blocked('E_MANIFEST_CHANGED');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const last=await lstat(filename);
  if(last.isSymbolicLink()||!last.isFile()||last.dev!==first.dev||
     last.ino!==first.ino||last.size!==first.size||
     last.mtimeMs!==first.mtimeMs||bytes.length>MAX_V2_MANIFEST_BYTES)blocked('E_MANIFEST_CHANGED');
  let data;
  try{data=JSON.parse(bytes.toString('utf8'));}
  catch{blocked('E_MANIFEST_INVALID_JSON');}
  validateAdaptiveManifest(data,{readerVersion:readerVersion??await getCliVersion()});
  return data;
}


export function constructAdaptiveManifest({legacyShape,assetSet,readerVersion,
  agentIntent=null,githubIntent='unspecified'}={}) {
  if(!record(legacyShape)||!record(legacyShape.install)||
    !record(legacyShape.managedFiles)||!version(readerVersion))blocked('E_MANIFEST_CONSTRUCTION');
  requireAssetSet(assetSet);
  const ownership=Object.fromEntries(
    Object.keys(legacyShape.managedFiles).sort().map(file=>[file,{kind:'whole-file'}]));
  const result={
    ...legacyShape,schemaVersion:2,minimumReaderVersion:readerVersion,
    install:installMetadata({...legacyShape.install,assetSet,
      requestedAdapterIntent:agentIntent,githubIntent,
      managedAdapterSurface:Object.keys(legacyShape.managedFiles)
        .filter(file=>ADAPTER_PATHS.has(file))
        .map(file=>({path:file,ownership:'whole-file',
          reason:agentIntent?'explicit-request':'legacy-managed'}))
    }),
    ignoredFiles:Array.isArray(legacyShape.ignoredFiles)?[...legacyShape.ignoredFiles]:[],
    ownership,approvalReceipts:[]
  };
  validateAdaptiveManifest(result,{readerVersion});
  return result;
}
