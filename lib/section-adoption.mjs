// Stage12 section adoption inspection. The scanner reads bounded agent files
// under the selected root; it only emits metadata, never their user contents.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { parseManagedSections } from './managed-markdown.mjs';

const MAX_BYTES=4*1024*1024;
const TARGETS=Object.freeze({
  'AGENTS.md':'agent-routing',
  'CLAUDE.md':'claude-adapter',
  '.github/copilot-instructions.md':'copilot-adapter'
});
function reject(reason){const e=new Error(reason);e.code=reason;throw e;}
export async function inspectAgentSectionAdoption(root,relative) {
  const id=TARGETS[relative];
  if(!id)reject('E_SECTION_ADOPTION_SCOPE');
  const file=await resolveProjectPath(root,relative,{purpose:'read-existing',mustExist:true});
  const first=await lstat(file);
  if(!first.isFile()||first.isSymbolicLink()||first.size>MAX_BYTES)reject('E_SECTION_ADOPTION_FILE');
  const fd=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let bytes;
  try {
    const opened=await fd.stat();
    if(!opened.isFile()||opened.dev!==first.dev||opened.ino!==first.ino||
      opened.size!==first.size||opened.mtimeMs!==first.mtimeMs)reject('E_SECTION_ADOPTION_RACE');
    bytes=await fd.readFile();
  }finally{await fd.close();}
  const last=await lstat(file);
  if(!last.isFile()||last.isSymbolicLink()||last.dev!==first.dev||
    last.ino!==first.ino||last.size!==first.size||
    last.mtimeMs!==first.mtimeMs||bytes.length>MAX_BYTES)reject('E_SECTION_ADOPTION_RACE');
  let regions;
  try{regions=parseManagedSections(bytes);}
  catch(error){
    return {path:relative,sectionId:id,classification:'CONFLICT',
      reason:error.code??'E_SECTION_MARKERS_INVALID',existingSectionIds:[],
      humanDecisionRequired:true,readOnly:true};
  }
  if(regions.length) {
    // Unmanaged files with VCP markers are not VCP-owned; an apparent match
    // is not sufficient to grant lifecycle authority.
    return {path:relative,sectionId:id,classification:'CONFLICT',
      reason:'UNCLAIMED_VCP_MARKERS',existingSectionIds:regions.map(r=>r.id),
      humanDecisionRequired:true,readOnly:true};
  }
  // Require recognizable, affirmative routing before claiming that an
  // existing vendor file already supports AGENTS.md. A mere mention of the
  // filename (including "ignore AGENTS.md") is not compatibility evidence.
  const text=bytes.toString('utf8');
  const compatible=relative==='CLAUDE.md'
    ? /^\s*@AGENTS\.md\s*$/m.test(text)
    : relative==='.github/copilot-instructions.md'
      ? /^(?:follow|read|use|refer to)\b[^\r\n]*\bAGENTS\.md\b/im.test(text)
      : false;
  if(compatible) {
    return {path:relative,sectionId:id,classification:'NOOP_COMPATIBLE',
      reason:'EXISTING_PROJECT_OWNED_ADAPTER_COMPATIBLE',
      existingSectionIds:[],humanDecisionRequired:false,readOnly:true};
  }
  return {path:relative,sectionId:id,classification:'SECTION_CANDIDATE',
    reason:'PRESERVE_USER_BYTES_AND_ADD_MANAGED_SECTION',
    existingSectionIds:[],humanDecisionRequired:true,readOnly:true};
}
