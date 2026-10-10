// Test-only recreation of an installed, whole-file-owned schema-v1 project.
// This is NOT an alternate public initializer or a schema-v2 writer.
import { lstat, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildDesiredFiles } from '../../lib/template.mjs';
import { buildManifest, writeBaseline, writeManifest, ensureVcpGitignore } from '../../lib/state.mjs';
import { getCliVersion } from '../../lib/version.mjs';
import { validateLegacyManifestFields } from '../../lib/manifest-v1-guard.mjs';
import { resolveProjectPath } from '../../lib/safe-path.mjs';

function refused(reason){
  const e=new Error('Legacy test fixture refused: '+reason);
  e.code='E_TEST_FIXTURE_UNSAFE';
  throw e;
}
async function assertFixtureRoot(root){
  if(typeof root!=='string'||!root)refused('root required');
  const base=path.resolve(os.tmpdir()),selected=path.resolve(root);
  const within=path.relative(base,selected);
  if(!within||within==='..'||within.startsWith('..'+path.sep)||
    path.isAbsolute(within)||!path.basename(selected).startsWith('vcp-'))
    refused('must use a fresh vcp-* project inside OS temp');
  // Trust no existing linked ancestor (including Windows junctions).
  let at=selected;
  while(true){
    const meta=await lstat(at);
    if(meta.isSymbolicLink()||!meta.isDirectory())refused('linked or non-directory ancestor');
    const parent=path.dirname(at);
    if(parent===at)break;
    at=parent;
  }
  return selected;
}

export async function seedLegacyV1Fixture({
  targetDir,agent='generic',stack='auto',includeGitHub=true,
  dryRun=false,force=false
}={}){
  if(force||dryRun)refused('does not emulate public init force/dry-run');
  const root=await assertFixtureRoot(targetDir);
  const stateDir=path.join(root,'.vcp');
  try{await lstat(stateDir);refused('VCP state already exists');}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const desired=await buildDesiredFiles({
    targetDir:root,agent,stack,includeGitHub,assetSet:'legacy-full-v1'
  });
  const version=await getCliVersion();
  const created=new Map();
  // Preflight *every* destination before first write. We never adopt or
  // overwrite pre-existing project-authored bytes or symlinked parents.
  for(const [relative,file] of desired.files){
    const dest=path.join(root,...relative.split('/'));
    let exists=false;
    try{
      const prior=await lstat(dest);
      if(!prior.isFile()||prior.isSymbolicLink())refused('existing unsafe path: '+relative);
      exists=true;
    }catch(error){if(error.code!=='ENOENT')throw error;}
    await resolveProjectPath(root,relative,{
      purpose:exists?'read-existing':'write-new'
    });
    if(!exists)created.set(relative,file);
  }
  // Validate the complete claim and metadata before changing a byte.
  const manifest=buildManifest({
    version,agent,stack:desired.stack,includeGitHub,files:created
  });
  manifest.install.requestedStack=stack;
  validateLegacyManifestFields(manifest);
  for(const [relative,file] of created){
    const dest=path.join(root,...relative.split('/'));
    // 'wx' refuses an unexpected concurrent replacement rather than
    // touching a path that was not absent at the preflight.
    await resolveProjectPath(root,relative,{purpose:'write-new'});
    await mkdir(path.dirname(dest),{recursive:true});
    await writeFile(dest,file.content,{flag:'wx',mode:file.mode??0o644});
  }
  for(const [relative,file] of created){
    await writeBaseline(root,relative,file.content);
  }
  await ensureVcpGitignore(root);
  await writeManifest(root,manifest);
  return {targetDir:root,root,agent,stack:desired.stack,includeGitHub,
    dryRun:false,files:created.size,version,installed:true,fixtureOnly:true};
}
