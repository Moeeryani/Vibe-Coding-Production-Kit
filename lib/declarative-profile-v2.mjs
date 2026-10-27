// Adaptive Phase 5 — source-only strict schema-v2 detector preview.
// This module DOES NOT replace/extend the accepted schema-v1 community
// loader. Project selection, digest pinning and explicit grants must be
// integrated there before any v2 profile can contribute trusted capabilities.
import path from 'node:path';
import {readProjectBytes} from './safe-read.mjs';

const MARKERS=new Set(['package.json','tsconfig.json','app.json','go.mod',
  'Cargo.toml','pyproject.toml','requirements.txt','uv.lock']);
const JSON_MARKERS=new Set(['package.json','tsconfig.json','app.json']);
const JSON_FIELDS=new Set(['name','type','private','expo.name','compilerOptions.jsx']);
const ID=/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SEMVER=/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i;
const DEP=/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i;
const MAX_BYTES=64*1024;
const MAX_RULES=8;
function fail(code){const e=new Error(code);e.code=code;throw e;}
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function keys(x,required,allowed=required){
  if(!record(x)||Object.keys(x).some(k=>!allowed.includes(k))||
    required.some(k=>!Object.hasOwn(x,k)))fail('E_PROFILE_V2_SCHEMA');
}
function marker(p,{json=false}={}){
  if(typeof p!=='string'||!(json?JSON_MARKERS:MARKERS).has(p))
    fail('E_PROFILE_V2_MARKER_SCOPE');
}
function validateRule(rule){
  keys(rule,['predicate','path'],['predicate','path','name','field','equals']);
  marker(rule.path,{json:rule.predicate==='jsonFieldEquals'||rule.predicate==='packageDependency'});
  if(rule.predicate==='fileExists'){
    keys(rule,['predicate','path']);
  } else if(rule.predicate==='packageDependency'){
    keys(rule,['predicate','path','name']);
    if(rule.path!=='package.json'||typeof rule.name!=='string'||
      rule.name.length>128||!DEP.test(rule.name))fail('E_PROFILE_V2_PREDICATE');
  } else if(rule.predicate==='jsonFieldEquals'){
    keys(rule,['predicate','path','field','equals']);
    if(!JSON_FIELDS.has(rule.field)||
      !['string','boolean'].includes(typeof rule.equals)||
      typeof rule.equals==='string'&&rule.equals.length>128)
      fail('E_PROFILE_V2_PREDICATE');
  } else fail('E_PROFILE_V2_PREDICATE');
  return Object.freeze({...rule});
}
export function validateDeclarativeProfileV2(raw){
  keys(raw,['schemaVersion','kind','id','version','capabilities','detect','contributions'],['schemaVersion','kind','id','version','capabilities','detect','contributions','vcpCompatibility']);
  if(raw.schemaVersion!==2||raw.kind!=='vcp-community-profile'||
     typeof raw.id!=='string'||!ID.test(raw.id)||
     typeof raw.version!=='string'||!SEMVER.test(raw.version)||
     !Array.isArray(raw.capabilities)||raw.capabilities.length!==1||
     raw.capabilities[0]!=='capability-detection')fail('E_PROFILE_V2_SCHEMA');
  keys(raw.detect,['all']);
  if(!Array.isArray(raw.detect.all)||raw.detect.all.length<1||raw.detect.all.length>MAX_RULES)
    fail('E_PROFILE_V2_RULE_LIMIT');
  keys(raw.contributions,['capabilities']);
  const ids=raw.contributions.capabilities;
  if(!Array.isArray(ids)||ids.length<1||ids.length>8||
    ids.some(x=>typeof x!=='string'||!ID.test(x))||new Set(ids).size!==ids.length)
    fail('E_PROFILE_V2_CAPABILITIES');
  let compatibility=null;
  if(raw.vcpCompatibility!==undefined){
    keys(raw.vcpCompatibility,['minVersion','maxExclusiveVersion']);
    if(typeof raw.vcpCompatibility.minVersion!=='string'||
       !SEMVER.test(raw.vcpCompatibility.minVersion)||
       typeof raw.vcpCompatibility.maxExclusiveVersion!=='string'||
       !SEMVER.test(raw.vcpCompatibility.maxExclusiveVersion))fail('E_PROFILE_V2_COMPATIBILITY');
    compatibility=Object.freeze({...raw.vcpCompatibility});
  }
  const rules=raw.detect.all.map(validateRule);
  return Object.freeze({id:raw.id,version:raw.version,compatibility,
    rules:Object.freeze(rules),contributes:Object.freeze([...ids].sort())});
}
const missing=e=>e?.code==='ENOENT'||
  (e?.code==='E_VCP_PATH'&&/(?:MISSING_INPUT|ROOT_MISSING)/.test(e.message));
export async function previewDeclarativeProfileV2(projectRoot,raw){
  const profile=validateDeclarativeProfileV2(raw);
  const root=path.resolve(projectRoot),issues=[],evidence=[],readCache=new Map();
  async function read(p){
    if(readCache.has(p))return readCache.get(p);
    let result=null;
    try{result=await readProjectBytes(root,p,{optional:true,maxBytes:MAX_BYTES});}
    catch(e){if(!missing(e))issues.push({marker:p,reason:e?.code??'UNSAFE_MARKER'});}
    readCache.set(p,result);return result;
  }
  let matched=true;
  for(const rule of profile.rules){
    const bytes=await read(rule.path);
    if(!bytes?.length){matched=false;continue;}
    let yes=false;
    if(rule.predicate==='fileExists')yes=true;
    else{
      try{
        const obj=JSON.parse(bytes.toString('utf8'));
        if(!record(obj))throw Error('not-object');
        if(rule.predicate==='packageDependency'){
          yes=['dependencies','devDependencies','peerDependencies'].some(field=>
            record(obj[field])&&typeof obj[field][rule.name]==='string'&&
            obj[field][rule.name].length>0);
        }else{
          const val=rule.field.split('.').reduce((node,key)=>record(node)?node[key]:undefined,obj);
          yes=val===rule.equals;
        }
      }catch{issues.push({marker:rule.path,reason:'INVALID_JSON_EVIDENCE'});}
    }
    if(yes)evidence.push(rule.path);
    else matched=false;
  }
  const status=issues.length?'PARTIAL':matched?'MATCHED_UNTRUSTED':'NOT_MATCHED';
  return Object.freeze({id:profile.id,status,readOnly:true,
    evidence:Object.freeze([...new Set(evidence)].sort()),
    candidateCapabilities:Object.freeze(matched&&!issues.length?[...profile.contributes]:[]),
    appliedCapabilities:Object.freeze([]),
    selected:false,digestVerified:false,grantVerified:false,
    executionAuthorized:false,issues:Object.freeze(issues),
    note:'Raw schema-v2 profile preview is untrusted. The existing v1 plugin loader is unchanged; v2 project selection, digest-pinned bundle trust and explicit capability-detection grant are NOT yet integrated.'});
}
