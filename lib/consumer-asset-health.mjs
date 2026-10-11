// Stage14 manifest-owned surface consistency. It inspects metadata only;
// it never declares ownership of untracked files in the real project.
import {requireAssetSet,classifyConsumerAsset} from './asset-catalog.mjs';

export function inspectConsumerAssetHealth(manifest){
  if(!manifest||!manifest.managedFiles||
     typeof manifest.managedFiles!=='object'||
     Array.isArray(manifest.managedFiles))
    return Object.freeze({status:'blocked',reason:'E_STAGE14_MANIFEST_REQUIRED',
      readOnly:true,issues:[]});
  const assetSet=manifest.schemaVersion===1
    ? 'legacy-full-v1' : manifest.install?.assetSet;
  try{requireAssetSet(assetSet);}
  catch{return Object.freeze({status:'blocked',reason:'E_ASSETSET_UNKNOWN',
    readOnly:true,issues:[]});}
  const counts=Object.fromEntries(['runtime-required','greenfield-starter',
    'optional-hygiene','package-only'].map(k=>[k,0]));
  const issues=[];
  for(const relative of Object.keys(manifest.managedFiles).sort()){
    let kind;
    try{kind=classifyConsumerAsset(relative);}
    catch{issues.push({path:relative,reason:'E_ASSET_CATALOG_PATH'});continue;}
    counts[kind]++;
    if(assetSet!=='legacy-full-v1'&&kind==='package-only'){
      issues.push({path:relative,reason:'SAFE_SURFACE_CLAIMS_PACKAGE_ONLY'});
    }
    if(assetSet==='brownfield-minimal-v1'&&kind==='greenfield-starter'){
      issues.push({path:relative,reason:'BROWNFIELD_CLAIMS_STARTER'});
    }
  }
  if(!Object.hasOwn(manifest.managedFiles,'AGENTS.md')){
    issues.push({path:'AGENTS.md',reason:'ROUTING_NOT_MANAGED'});
  }
  return Object.freeze({
    readOnly:true,status:issues.length?'fail':'pass',assetSet,
    counts:Object.freeze(counts),issues:Object.freeze(issues),
    doesNotInspectUnownedFiles:true,
    note:'Manifest claims only; project-authored untracked files are never inferred owned'
  });
}
