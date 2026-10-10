import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { parseManagedSections } from './managed-markdown.mjs';

const MAX_DOCUMENT_BYTES=4*1024*1024;
function status(reason,path=null){return {status:'fail',reason,path};}
async function readBounded(root,relative) {
  const filename=await resolveProjectPath(root,relative,{purpose:'read-existing',mustExist:true});
  const before=await lstat(filename);
  if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_DOCUMENT_BYTES)throw new Error('UNSAFE_MANAGED_DOCUMENT');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const atOpen=await fd.stat();
    if(!atOpen.isFile()||atOpen.dev!==before.dev||atOpen.ino!==before.ino||
      atOpen.size!==before.size)throw new Error('MANAGED_DOCUMENT_RACE');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const after=await lstat(filename);
  if(after.isSymbolicLink()||after.dev!==before.dev||after.ino!==before.ino||
    after.size!==before.size||after.mtimeMs!==before.mtimeMs||
    bytes.length>MAX_DOCUMENT_BYTES)throw new Error('MANAGED_DOCUMENT_RACE');
  return bytes;
}

export async function inspectManagedOwnership(root,manifest,{maxOwnedSections=1000}={}) {
  if(manifest?.schemaVersion!==2) {
    // A historical whole-file manifest cannot assert section ownership.
    // Do not mutate a legacy file containing orphan VCP section markers.
    try {
      const bytes=await readBounded(root,'AGENTS.md');
      const matches=parseManagedSections(bytes);
      return matches.length ? status('UNCLAIMED_SECTION_MARKERS','AGENTS.md')
        : {status:'not-applicable',reason:'LEGACY_WHOLE_FILE'};
    }catch(error){
      if(error?.code==='E_VCP_PATH'&&error.message.includes('MISSING_INPUT')) {
        return {status:'not-applicable',reason:'LEGACY_AGENTS_ABSENT'};
      }
      return status(error.code??'SECTION_PARSE_UNSAFE','AGENTS.md');
    }
  }
  const entries=Object.entries(manifest.ownership??{})
    .filter(([,ownership])=>ownership?.kind==='managed-section');
  if(entries.length>maxOwnedSections)return status('OWNERSHIP_RESOURCE_LIMIT');
  const malformed=[];
  for(const [relative,ownership] of entries) {
    try {
      const bytes=await readBounded(root,relative);
      const regions=parseManagedSections(bytes);
      if(regions.filter(x=>x.id===ownership.sectionId).length!==1) {
        malformed.push({path:relative,reason:'MISSING_MANAGED_SECTION'});
      }
    }catch(error){
      malformed.push({path:relative,reason:error.code??'INVALID_MANAGED_SECTION'});
    }
  }
  if(malformed.length) {
    return {status:'fail',reason:'OWNERSHIP_INTEGRITY',issues:malformed.slice(0,20),
      totalIssues:malformed.length};
  }
  return {status:'pass',sections:entries.length,reason:'SECTION_OWNERSHIP_READABLE'};
}
