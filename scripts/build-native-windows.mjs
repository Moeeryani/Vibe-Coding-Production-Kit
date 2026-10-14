#!/usr/bin/env node
// Compile the unapproved NTFS *scratch-only* helper on a genuine Windows
// machine. This script never installs or enables a production lifecycle writer.
// Outputs are deliberately outside package.json's npm "files" directories.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdir,readFile,stat,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function fail(message,exit=2) {
  console.error('E_WINDOWS_NATIVE_BUILD: '+message);
  process.exit(exit);
}
if(process.platform!=='win32')
  fail('Requires real Windows with MSVC and the Windows SDK (not WSL).');
// Reproducibility must be OBSERVED on a real toolchain. The normal build
// stays single-pass; the strict diagnostic performs two independent links.
if(process.argv.length>3||
   (process.argv.length===3&&process.argv[2]!=='--verify-repro'))
  fail('Only optional flag --verify-repro is supported.');
const verifyRepro=process.argv[2]==='--verify-repro';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'scripts','native','vcp-windows-fsops.cpp');
const buildRoot=path.join(repo,'build');
const outputDir=path.join(buildRoot,'native-windows');
const exe=path.join(outputDir,'vcp-windows-fsops.exe');
const obj=path.join(outputDir,'vcp-windows-fsops.obj');
const receiptPath=path.join(outputDir,'build-receipt.json');

async function refuseLink(dir){
  const st=await lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink())
    fail('Build output parent is not a real directory: '+dir);
}
await mkdir(buildRoot,{recursive:true});
await refuseLink(buildRoot);
await mkdir(outputDir,{recursive:true});
await refuseLink(outputDir);

const sourceBytes=await readFile(source);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceSha256=sha256(sourceBytes);
if(sourceBytes.byteLength===0)fail('Empty C++ source');

const command='cl.exe';
const args=[
  '/nologo','/std:c++17','/EHsc','/W4','/WX',
  '/Fo:'+obj,'/Fe:'+exe,source,
  // MSVC link.exe normally places a wall-clock timestamp into PE headers.
  // /Brepro replaces that nondeterministic field with a content-derived
  // value; /INCREMENTAL:NO avoids reused incremental linker state.
  // Both must be verified against the installed VS2019 linker, never assumed.
  '/link','/Brepro','/INCREMENTAL:NO'
];
await rm(receiptPath,{force:true}); // A failed compile cannot leave a trusted receipt.
function compile(){
  const run=spawnSync(command,args,{
    cwd:repo,shell:false,encoding:'utf8',maxBuffer:2*1024*1024,
    timeout:120000,windowsHide:true
  });
  if(run.stdout)process.stdout.write(run.stdout);
  if(run.stderr)process.stderr.write(run.stderr);
  if(run.error)fail('MSVC could not execute: '+String(run.error.code??run.error.message));
  if(run.status!==0)fail('MSVC exited '+String(run.status),run.status||2);
}
compile();
const firstExecutableSha256=sha256(await readFile(exe));
if(verifyRepro){
  compile();
  const secondExecutableSha256=sha256(await readFile(exe));
  if(firstExecutableSha256!==secondExecutableSha256)
    fail('NONREPRODUCIBLE native EXE: first='+
      firstExecutableSha256+' second='+secondExecutableSha256+
      '; no build receipt authorized.');
}
const st=await lstat(exe);
if(!st.isFile()||st.isSymbolicLink()||st.size===0)
  fail('Compiler did not produce a regular nonempty executable');
const executableSha256=sha256(await readFile(exe));
const objectStat=await stat(obj);
if(!objectStat.isFile())fail('Compiler did not produce a regular object file');
const receipt={
  kind:'VCP_WINDOWS_NATIVE_SCRATCH_BUILD',
  platform:process.platform,
  compilerCommand:command,
  compilerArgs:args,
  sourceSha256,
  executableSha256,
  executableBytes:st.size,
  executableRelativePath:'build/native-windows/vcp-windows-fsops.exe',
  linkerReproFlag:'/Brepro',
  incrementalLinkingDisabled:true,
  verifiedRepeatBuild:verifyRepro,
  packageIncluded:false, // path is outside the package.json "files" entries
  nativeRuntimeAccepted:false,
  directoryDurabilityProven:false,
  d01Approved:false,
  managedMutationAuthorized:false
};
await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{
  flag:'w',mode:0o600
});
console.log(JSON.stringify(receipt,null,2));
