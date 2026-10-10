// Stage13 brownfield target-state assembler, read-only, no hidden apply.
// Pure ownership derivation is exposed so negative tests can inspect every
// byte boundary without executing the gated lifecycle writer.
import { createHash } from 'node:crypto';
import { buildDesiredFiles } from './template.mjs';
import { buildManifest } from './state.mjs';
import { constructAdaptiveManifest, validateAdaptiveManifest,
  installMetadata, validManagedRelative } from './manifest-v2.mjs';
import { composeInitialManagedSection } from './managed-markdown.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { assessStage13Preview } from './stage13-brownfield-preflight.mjs';
import { compareSemver } from './semver.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_TOTAL=32*1024*1024;
const MAX_ITEMS=64;
function reject(code){const e=new Error(code);e.code=code;throw e;}
function bytes(value) {
  if(Buffer.isBuffer(value))return Buffer.from(value);
  if(typeof value==='string')return Buffer.from(value,'utf8');
  reject('E_STAGE13_NONBYTES');
}
function textForVendor(relative) {
  if(relative==='CLAUDE.md')return '@AGENTS.md\n';
  if(relative==='.github/copilot-instructions.md')
    return 'Follow AGENTS.md for repository guidance.\n';
  reject('E_STAGE13_UNKNOWN_SECTION');
}
export function assembleStage13Target(plan,{approval,desiredFiles,existingFiles,
  readerVersion}={}) {
  const allowed=assessStage13Preview(plan,{approval});
  if(allowed.classification!=='READY_TO_REPLAN_UNDER_OWNED_LOCK')
    reject('E_STAGE13_INTENT_UNAPPROVED');
  if(typeof readerVersion!=='string'||compareSemver(readerVersion,'0.9.3')<=0)
    reject('E_STAGE13_READER_VERSION');
  if(!(desiredFiles instanceof Map)||!(existingFiles instanceof Map))
    reject('E_STAGE13_INPUT');
  if(plan.actions.length>MAX_ITEMS)reject('E_STAGE13_ITEM_LIMIT');
  const assembled=new Map(),baselines=new Map(),ownership={};
  const managedEntries=new Map(),retained=new Map();
  let total=0;
  for(const action of plan.actions) {
    if(!validManagedRelative(action.path)||assembled.has(action.path))
      reject('E_STAGE13_ALIAS');
    let raw=desiredFiles.get(action.path);
    if(!raw&&action.action==='PROPOSE_SECTION') {
      raw={content:textForVendor(action.path),mode:0o644,
        policy:'generated',origin:'adapter'};
    }
    if(!raw||typeof raw.content!=='string')reject('E_STAGE13_TEMPLATE_ABSENT');
    const templateBytes=bytes(raw.content);
    if(templateBytes.length>4*1024*1024)reject('E_STAGE13_TEMPLATE_TOO_LARGE');
    if(action.action==='CLAIM') {
      if(existingFiles.has(action.path))
        reject('E_STAGE13_EXISTING_CLAIM');
      assembled.set(action.path,{kind:'whole-file',content:templateBytes,
        mode:raw.mode??0o644,priorPresent:false,
        postHash:sha(templateBytes)});
      baselines.set(action.path,templateBytes);
      ownership[action.path]={kind:'whole-file'};
      managedEntries.set(action.path,{content:templateBytes.toString('utf8'),
        mode:raw.mode??0o644,policy:raw.policy??'managed',
        origin:raw.origin??'template'});
      total+=templateBytes.length;
    }else if(action.action==='PROPOSE_SECTION'){
      const old=existingFiles.get(action.path);
      if(!Buffer.isBuffer(old))reject('E_STAGE13_SECTION_PREIMAGE_MISSING');
      // Section primitive conserves each original byte (including BOM
      // and line endings) in its preimage. It will reject unknown markers.
      const composed=composeInitialManagedSection(old,action.sectionId,templateBytes);
      const body=Buffer.from(composed.body);
      assembled.set(action.path,{kind:'managed-section',sectionId:action.sectionId,
        content:composed.document,priorPresent:true,priorHash:sha(old),
        priorBytes:Buffer.from(old),postHash:sha(composed.document)});
      baselines.set(action.path,body);
      ownership[action.path]={kind:'managed-section',sectionId:action.sectionId,
        baselineHash:sha(body)};
      managedEntries.set(action.path,{content:body.toString('utf8'),
        mode:raw.mode??0o644,policy:raw.policy??'managed',
        origin:raw.origin??'adapter'});
      retained.set(action.path,sha(old));
      total+=old.length+composed.document.length;
    }else reject('E_STAGE13_UNKNOWN_ACTION');
    if(total>MAX_TOTAL)reject('E_STAGE13_TOTAL_BYTES');
  }
  const includeGitHub=plan.githubIncludedInPlan===true;
  const agentIntent=plan.requestedIntent?.agent?.kind==='explicit'
    ?plan.requestedIntent.agent.value:null;
  const agent=agentIntent??'generic';
  const githubIntent=plan.requestedIntent?.github?.kind==='explicit-on'?
    'explicit-on':plan.requestedIntent?.github?.kind==='explicit-off'?
    'explicit-off':'unspecified';
  const legacy=buildManifest({version:readerVersion,agent,stack:plan.stack,
    includeGitHub,files:managedEntries});
  legacy.install.requestedStack=plan.requestedIntent?.stack?.kind==='explicit'
    ?plan.requestedIntent.stack.value:'auto';
  const manifest=constructAdaptiveManifest({legacyShape:legacy,
    assetSet:'brownfield-minimal-v1',readerVersion,
    agentIntent,githubIntent});
  manifest.ownership=ownership;
  manifest.install=installMetadata({...manifest.install,
    managedAdapterSurface:plan.actions.filter(a=>
      a.path==='CLAUDE.md'||a.path==='.github/copilot-instructions.md'
    ).map(a=>({path:a.path,ownership:a.action==='CLAIM'?
      'whole-file':'managed-section',
      reason:a.managedAdapterReason??(agentIntent?'explicit-request':'observed-existing')
    }))});
  // The managed-file baseline for an existing document is its section
  // content, NOT the whole pre-existing document.
  validateAdaptiveManifest(manifest,{readerVersion});
  if([...baselines].some(([p,content])=>sha(content)!==
    manifest.managedFiles[p].baselineHash))reject('E_STAGE13_BASELINE_MISMATCH');
  return Object.freeze({
    root:plan.root,classification:'PREPARED_MEMORY_ONLY',
    zeroWrite:true,executionAuthorized:false,
    readerVersion,assetSet:'brownfield-minimal-v1',
    actionCount:assembled.size,postimages:assembled,baselines,
    retainedPreimages:retained,manifest,
    manifestBytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n'),
    totalInspectedBytes:total,planFingerprint:allowed.intentFingerprint,
    requiresOwnedLock:true,requiresCompleteRecoveryPoint:true
  });
}
export async function prepareStage13Adoption(plan,{approval,readerVersion}={}) {
  const inspected=assessStage13Preview(plan,{approval});
  if(inspected.classification!=='READY_TO_REPLAN_UNDER_OWNED_LOCK')
    reject('E_STAGE13_INTENT_UNAPPROVED');
  const agent=plan.requestedIntent?.agent?.kind==='explicit'
    ?plan.requestedIntent.agent.value:'generic';
  const desired=await buildDesiredFiles({
    targetDir:plan.root,agent,stack:plan.stack,assetSet:'brownfield-minimal-v1',
    includeGitHub:plan.githubIncludedInPlan===true
  });
  const existing=new Map();
  for(const action of plan.actions) {
    const content=await readProjectBytes(plan.root,action.path,{
      optional:action.action==='CLAIM',maxBytes:4*1024*1024
    });
    if(action.action==='CLAIM'&&content!==null)reject('E_STAGE13_CLAIM_CHANGED');
    if(action.action==='PROPOSE_SECTION'&&content===null)
      reject('E_STAGE13_SECTION_DISAPPEARED');
    if(content!==null)existing.set(action.path,content);
  }
  return assembleStage13Target(plan,{approval,desiredFiles:desired.files,
    existingFiles:existing,readerVersion});
}
