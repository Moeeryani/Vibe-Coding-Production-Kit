#!/usr/bin/env node
// Compile the unapproved NTFS *scratch-only* helper on a genuine Windows
// machine. This script never installs or enables a production lifecycle writer.
// Outputs are deliberately outside package.json's npm "files" directories.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,mkdir,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function fail(message,exit=2) {
  console.error('E_WINDOWS_NATIVE_BUILD: '+message);
  process.exit(exit);
}
if(process.platform!=='win32')
  fail('Requires real Windows with MSVC and the Windows SDK (not WSL).');

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'scripts','native','vcp-windows-fsops.cpp');
const buildRoot=path.join(repo,'build');
const outputDir=path.join(buildRoot,'native-windows');
const exe=path.join(outputDir,'vcp-windows-fsops.exe');
const obj=path.join(outputDir,'vcp-windows-fsops.obj');

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
  '/nologo','/std:c++17','/EHsc','/W4',
  '/Fo:'+obj,'/Fe:'+exe,source
];
const run=spawnSync(command,args,{
  cwd:repo,shell:false,encoding:'utf8',maxBuffer:2*1024*1024,
  timeout:120000,windowsHide:true
});
if(run.stdout)process.stdout.write(run.stdout);
if(run.stderr)process.stderr.write(run.stderr);
if(run.error)fail('MSVC could not execute: '+String(run.error.code??run.error.message));
if(run.status!==0)fail('MSVC exited '+String(run.status),run.status||2);

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
  packageIncluded:false, // path is outside the package.json "files" entries
  nativeRuntimeAccepted:false,
  directoryDurabilityProven:false,
  d01Approved:false,
  managedMutationAuthorized:false
};
console.log(JSON.stringify(receipt,null,2));
