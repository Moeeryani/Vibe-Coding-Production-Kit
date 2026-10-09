// Stage12 schema-v1 field-enumeration guard. Unknown behavior-bearing
// metadata cannot be declared inert merely because an old CLI ignores it.
const ROOT=new Set(['schemaVersion','installedVersion','installedAt','updatedAt',
  'install','ignoredFiles','managedFiles']);
const INSTALL=new Set(['agent','stack','requestedStack','includeGitHub']);
const OWNED_FILE=new Set(['policy','origin','mode','baselineHash',
  'baselinePath','templateVersion']);
function record(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function reject(code){const e=new Error(code);e.code=code;throw e;}
function only(recordValue,allowed,code) {
  if(!record(recordValue))reject(code);
  for(const field of Object.keys(recordValue))if(!allowed.has(field))reject(code);
}
export function validateLegacyManifestFields(manifest) {
  if(!record(manifest)||manifest.schemaVersion!==1)reject('E_V1_EXPECTED');
  only(manifest,ROOT,'E_V1_UNENUMERATED_ROOT_FIELD');
  only(manifest.install,INSTALL,'E_V1_UNENUMERATED_INSTALL_FIELD');
  if(typeof manifest.install.agent!=='string'||!manifest.install.agent||
    typeof manifest.install.stack!=='string'||!manifest.install.stack||
    typeof manifest.install.includeGitHub!=='boolean')reject('E_V1_INSTALL_SHAPE');
  if(!record(manifest.managedFiles))reject('E_V1_MANAGED_SHAPE');
  if(Object.keys(manifest.managedFiles).length>10000)reject('E_V1_MANAGED_LIMIT');
  for(const entry of Object.values(manifest.managedFiles)) {
    only(entry,OWNED_FILE,'E_V1_UNENUMERATED_OWNERSHIP_FIELD');
    if(typeof entry.baselineHash!=='string'||!(/^[0-9a-f]{64}$/).test(entry.baselineHash)||
      typeof entry.baselinePath!=='string'||!entry.baselinePath.startsWith('.vcp/baselines/')) {
      reject('E_V1_OWNERSHIP_SHAPE');
    }
  }
  if(manifest.ignoredFiles!==undefined&&
    (!Array.isArray(manifest.ignoredFiles)||manifest.ignoredFiles.some(v=>typeof v!=='string'))) {
    reject('E_V1_IGNORED_SHAPE');
  }
  return {schemaVersion:1,inertUnknownFields:0,managedFiles:Object.keys(manifest.managedFiles).length};
}
