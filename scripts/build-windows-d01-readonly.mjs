#!/usr/bin/env node
// Separate MSVC READ-ONLY D-01 AccessCheck helper build; NEVER a writer.
// Does not replace or reconfigure the R3 scratch helper or its evidence.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,lstat,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function refuse(message){console.error('E_D01_WINDOWS_BUILD: '+message);process.exit(2);}
if(process.platform!=='win32')refuse('Native Windows MSVC only');
if(process.argv.length>3||
   (process.argv.length===3&&process.argv[2]!=='--verify-repro'))
  refuse('Only optional --verify-repro is supported');
const verifyRepro=process.argv[2]==='--verify-repro';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'scripts','native','vcp-windows-d01-token-inspect.cpp');
const folder=path.join(repo,'build','native-windows','d01-readonly');
const exe=path.join(folder,'vcp-windows-d01-token-inspect.exe');
const obj=path.join(folder,'vcp-windows-d01-token-inspect.obj');
const receiptPath=path.join(folder,'build-receipt.json');
for(const item of [path.join(repo,'build'),
  path.join(repo,'build','native-windows'),folder]){
  await mkdir(item,{recursive:true});
  const stat=await lstat(item);
  if(!stat.isDirectory()||stat.isSymbolicLink())
    refuse('Unsafe symlinked build output folder');
}
const sha=data=>createHash('sha256').update(data).digest('hex');
const sourceHash=sha(await readFile(source));
const args=['/nologo','/std:c++17','/EHsc','/W4','/WX',
  '/Fo:'+obj,'/Fe:'+exe,source,
  '/link','Advapi32.lib','/Brepro','/INCREMENTAL:NO'];
await rm(receiptPath,{force:true});
function build(){
  const run=spawnSync('cl.exe',args,{
    cwd:repo,shell:false,encoding:'utf8',maxBuffer:1024*1024,
    timeout:120000,windowsHide:true
  });
  if(run.stdout)process.stdout.write(run.stdout);
  if(run.stderr)process.stderr.write(run.stderr);
  if(run.error||run.signal||run.status!==0)
    refuse('MSVC failed: '+String(run.error?.code??run.signal??run.status));
}
build();
const first=sha(await readFile(exe));
if(verifyRepro){
  build();
  if(first!==sha(await readFile(exe)))
    refuse('Native read-only helper binary is not reproducible');
}
const binary=await lstat(exe);
if(!binary.isFile()||binary.isSymbolicLink()||binary.size===0)
  refuse('Not a regular compiled executable');
const receipt={
  kind:'D01_WINDOWS_ACL_READONLY_BUILD_V1',
  nativePlatform:'win32',compiler:'MSVC cl.exe',
  sourceSha256:sourceHash,executableSha256:sha(await readFile(exe)),
  executableBytes:binary.size,verifiedRepeatBuild:verifyRepro,
  executableRelativePath:'build/native-windows/d01-readonly/vcp-windows-d01-token-inspect.exe',
  selectedProjectTested:false,actualWindowsPrincipalDenialAttested:false,
  authenticatedPublishedCliTested:false,managedMutationAuthorized:false,
  d01Approved:false,d01Gate:'NO_GO',
  fileWrittenOutsidePackage:true
};
await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',
  {flag:'wx',mode:0o600});
console.log(JSON.stringify(receipt,null,2));
