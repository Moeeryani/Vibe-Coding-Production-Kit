// TEST-ONLY historical v1 installed-repository fixture.
// Never import this into the production CLI or route its writes through init.
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildDesiredFiles } from '../../lib/template.mjs';
import { buildManifest, writeBaseline, writeManifest, ensureVcpGitignore } from '../../lib/state.mjs';
import { getCliVersion } from '../../lib/version.mjs';
import { validateLegacyManifestFields } from '../../lib/manifest-v1-guard.mjs';

function assertFixtureRoot(root){
  const base=path.resolve(os.tmpdir()),selected=path.resolve(root);
  const within=path.relative(base,selected);
  if(!within||within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within))
    throw new Error('E_TEST_FIXTURE_OUTSIDE_TMP');
  return selected;
}

export async function seedLegacyV1Fixture({
  targetDir,agent='generic',stack='auto',includeGitHub=true,
  dryRun=false,force=false
}={}){
  if(force)throw new Error('E_TEST_FIXTURE_FORCE_REFUSED');
  if(dryRun)throw new Error('E_TEST_FIXTURE_DOES_NOT_IMPLEMENT_INIT_DRY_RUN');
  const root=assertFixtureRoot(targetDir);
  const stat=await lstat(root);
  if(stat.isSymbolicLink()||!stat.isDirectory())
    throw new Error('E_TEST_FIXTURE_ROOT_UNSAFE');
  const stateDir=path.join(root,'.vcp');
  try{
    await lstat(stateDir);
    throw new Error('E_TEST_FIXTURE_STATE_ALREADY_EXISTS');
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const desired=await buildDesiredFiles({targetDir:root,agent,stack,includeGitHub,
    assetSet:'legacy-full-v1'});
  const version=await getCliVersion();
  const created=new Map();
  // For preexisting, project-owned documents, preserve bytes and do not claim
  // ownership. Such files were already present before the synthetic install.
  for(const [relative,file] of desired.files){
    const dest=path.join(root,...relative.split('/'));
    try{
      const prior=await lstat(dest);
      if(prior.isSymbolicLink()||!prior.isFile())
        throw new Error('E_TEST_FIXTURE_PATH_UNSAFE: '+relative);
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      await mkdir(path.dirname(dest),{recursive:true});
      await writeFile(dest,file.content,{flag:'wx',mode:file.mode??0o644});
      created.set(relative,file);
    }
  }
  const manifest=buildManifest({version,agent,stack:desired.stack,includeGitHub,
    files:created});
  manifest.install.requestedStack=stack;
  validateLegacyManifestFields(manifest);
  for(const [relative,file] of created) {
    await writeBaseline(root,relative,file.content);
  }
  await ensureVcpGitignore(root);
  await writeManifest(root,manifest);
  return {
    targetDir:root,root,agent,stack:desired.stack,includeGitHub,
    dryRun:false,files:created.size,version,installed:true,fixtureOnly:true
  };
}
