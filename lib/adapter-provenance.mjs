// Read-only adapter provenance for Doctor and future lifecycle planning.
// Observing a vendor file is NEVER evidence that VCP owns it.
import { resolveProjectPath } from './safe-path.mjs';
import { validateAdaptiveManifest } from './manifest-v2.mjs';
import { getCliVersion } from './version.mjs';

const VENDORS=Object.freeze(['CLAUDE.md','.github/copilot-instructions.md']);
export async function inspectAdapterProvenance(root,manifest) {
  const readerVersion=await getCliVersion();
  const schemaV2=manifest?.schemaVersion===2;
  if(schemaV2)validateAdaptiveManifest(manifest,{readerVersion});
  const managed=schemaV2?manifest.install.managedAdapterSurface:[];
  const observed=[];
  for(const relative of VENDORS) {
    try{
      await resolveProjectPath(root,relative,{purpose:'read-existing',mustExist:true});
      observed.push({path:relative,present:true,
        owner:managed.some(x=>x.path===relative)?'vcp-managed':'project-or-unclaimed',
        compatible:null}); // Presence cannot prove routing correctness.
    }catch(error){
      if(error?.code==='E_VCP_PATH'&&error.message.includes('MISSING_INPUT')){
        observed.push({path:relative,present:false,owner:'none',compatible:null});
      }else{
        observed.push({path:relative,present:null,owner:'undetermined',
          compatible:null,blocked:true,reason:error.code??'E_ADAPTER_INSPECTION'});
      }
    }
  }
  return {
    schemaVersion:manifest?.schemaVersion??null,
    requestedAdapterIntent:schemaV2?manifest.install.requestedAdapterIntent:null,
    managedAdapterSurface:managed.map(({path,ownership,reason})=>({path,ownership,reason})),
    observedAdapterFiles:observed,
    observedCompatibilityNotOwnership:true,
    readOnly:true
  };
}
