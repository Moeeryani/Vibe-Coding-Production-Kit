import path from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import { packageRoot } from './template.mjs';
import { resolveProjectPath } from './safe-path.mjs';
import { selectPackagedPromptEligibility,requireAssetSet } from './asset-catalog.mjs';

const MAX_PROMPT=256*1024;
const MODE_PROMPTS=new Set([
  'prompts/02-plan-task.md','prompts/03-implement-task.md',
  'prompts/04-code-review.md','prompts/05-security-review.md',
  'prompts/07-release-review.md'
]);
function bad(code){const e=new Error(code);e.code=code;return e;}
async function boundedRead(filename) {
  const stat=await lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_PROMPT)throw bad('E_PROMPT_UNSAFE');
  const bytes=await readFile(filename);
  if(bytes.length>MAX_PROMPT)throw bad('E_PROMPT_TOO_LARGE');
  return bytes.toString('utf8');
}

export async function resolvePackagedPrompt({projectRoot,relative,assetSet}) {
  requireAssetSet(assetSet);
  if(!MODE_PROMPTS.has(relative)||!selectPackagedPromptEligibility(assetSet,relative)) {
    throw bad('E_PROMPT_SCOPE');
  }
  const root=path.resolve(projectRoot);
  let local;
  try{
    local=await resolveProjectPath(root,relative,{purpose:'read-existing'});
  }catch(e){
    if(e.code!=='E_VCP_PATH'||!e.message.includes('MISSING_INPUT'))throw e;
    local=null;
  }
  if(local) {
    // Strict no-follow path resolution for overridden package content.
    const content=await boundedRead(local);
    return {relative,resolved:local,content,source:'project-override',
      provenance:{type:'project',relative,assetSet},installed:true};
  }
  const bundled=path.resolve(packageRoot,relative);
  if(!bundled.startsWith(packageRoot+path.sep))throw bad('E_PROMPT_PACKAGE_ESCAPE');
  const content=await boundedRead(bundled);
  return {relative,resolved:null,content,source:'package-fallback',
    provenance:{type:'package',relative,assetSet,packageRoot:'bundled'},installed:false};
}
