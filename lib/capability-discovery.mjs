// Adaptive Phase 4 — deterministic first-party capability evidence preview.
// Evidence is NOT approval or application authority. No network, subprocess,
// executable plugins, filesystem mutation or guessed verification commands.
import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { readProjectBytes } from './safe-read.mjs';
import { resolveProjectPath } from './safe-path.mjs';

const LIMIT=128*1024;
const EXPECTED=Object.freeze([
  ['language.go','go.mod'],
  ['language.python','pyproject.toml'],
  ['language.python','requirements.txt'],
  ['language.rust','Cargo.toml'],
  ['language.typescript','tsconfig.json'],
  ['language.python','uv.lock'],
]);
const RN_MARKERS=Object.freeze(['app.json','app.config.js','app.config.cjs','app.config.mjs','app.config.ts']);
const isMissing=e=>e?.code==='ENOENT'||
  (e?.code==='E_VCP_PATH'&&/(?:MISSING_INPUT|ROOT_MISSING)/.test(e.message));
function freezeResult(map,issues,stack){
  const capabilities=Object.freeze([...map].sort(([a],[b])=>a.localeCompare(b)).map(([id,paths])=>
    Object.freeze({id,discovery:'DETECTED',evidence:Object.freeze([...paths].sort()),
      application:'NOT_APPLIED',authority:'FIRST_PARTY_DETERMINISTIC_READ_ONLY'})));
  return Object.freeze({readOnly:true,status:issues.length?'PARTIAL':'INSPECTED',
    capabilities,issues:Object.freeze(issues),
    legacyStackSummary:stack??'unassessed',
    appliedCapabilities:[],
    appliedProvenance:'NOT_ESTABLISHED',
    commandAuthority:'UNCHANGED',executionAuthorized:false,
    note:'Detection is evidence, not project approval, install identity, an applied capability, or permission to run commands.'});
}
export async function discoverProjectCapabilities(targetDir,{legacyInstalledStack=null}={}){
  const root=path.resolve(targetDir??'.'),found=new Map(),issues=[];
  const add=(id,p)=>{if(!found.has(id))found.set(id,new Set());found.get(id).add(p);};
  async function read(relative){
    try{return await readProjectBytes(root,relative,{optional:true,maxBytes:LIMIT});}
    catch(e){if(isMissing(e))return null;
      issues.push(Object.freeze({path:relative,reason:e?.code??'UNSAFE_MARKER'}));return null;}
  }
  for(const [id,marker] of EXPECTED){
    const bytes=await read(marker);
    if(bytes===null)continue;
    // A marker's presence is the declared evidence; empty files are insufficient.
    if(bytes.length>0)add(id,marker);
  }
  // Application evidence is distinct from a library depending on React Native.
  // A dependency alone must never claim a React Native *application* profile.
  const rnAppMarkers=[];
  for(const marker of RN_MARKERS){
    const bytes=await read(marker);
    if(bytes!==null&&bytes.length>0)rnAppMarkers.push(marker);
  }
  for(const dirname of ['android','ios']){
    try{
      // Confinement-only path check, never a write. Refuse links in ancestry.
      await resolveProjectPath(root,dirname+'/.__vcp_capability_probe__',{purpose:'write-new'});
      const stat=await lstat(path.join(root,dirname));
      if(stat.isDirectory()&&!stat.isSymbolicLink())rnAppMarkers.push(dirname);
    }catch(e){
      if(isMissing(e))continue;
      // A missing directory after a safe path check is normal.
      if(e?.code==='ENOENT')continue;
      issues.push(Object.freeze({path:dirname,reason:e?.code??'UNSAFE_APP_MARKER'}));
    }
  }
  const packageBytes=await read('package.json');
  if(packageBytes!==null){
    try{
      const pkg=JSON.parse(packageBytes.toString('utf8'));
      if(!pkg||Array.isArray(pkg)||typeof pkg!=='object')throw Error('NOT_OBJECT');
      const deps={};
      for(const key of ['dependencies','devDependencies','peerDependencies']){
        const obj=pkg[key];
        if(obj===undefined)continue;
        if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('INVALID_DEPENDENCIES');
        for(const [n,v] of Object.entries(obj)){if(typeof v==='string')deps[n]=v;}
      }
      add('ecosystem.node','package.json');
      if(Object.hasOwn(deps,'react-native')&&rnAppMarkers.length){
        add('framework.react-native','package.json');
        for(const marker of rnAppMarkers)add('framework.react-native',marker);
      }
      if(Object.hasOwn(deps,'typescript'))add('language.typescript','package.json');
    }catch{issues.push(Object.freeze({path:'package.json',reason:'INVALID_PACKAGE_JSON'}));}
  }
  return freezeResult(found,issues,legacyInstalledStack);
}
