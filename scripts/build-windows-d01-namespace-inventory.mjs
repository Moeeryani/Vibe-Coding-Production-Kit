#!/usr/bin/env node
// D-01 Windows read-only complete bounded NTFS inventory build, manual.
// The resulting native helper only READS exact marked ProgramData fixtures.
// It does not create accounts, provision ACLs, test old CLI denial, mutate
// filesystem data or attest Windows durability. The build writes its own
// unshipped EXE and receipt under build/native-windows only.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,lstat,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

function refuse(message){
  console.error('E_D01_WINDOWS_INVENTORY_BUILD: '+message);
  process.exit(2);
}
if(process.platform!=='win32')refuse('Native Windows/MSVC required');
if(process.argv.length>3||
   (process.argv.length===3&&process.argv[2]!=='--verify-repro'))
  refuse('Only optional --verify-repro is supported');
const verifyRepro=process.argv[2]==='--verify-repro';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(repo,'scripts','native','vcp-windows-d01-namespace-inventory.cpp');
const folder=path.join(repo,'build','native-windows','d01-namespace-inventory');
const exe=path.join(folder,'vcp-windows-d01-namespace-inventory.exe');
const obj=path.join(folder,'vcp-windows-d01-namespace-inventory.obj');
const receiptPath=path.join(folder,'build-receipt.json');
for(const item of [path.join(repo,'build'),
  path.join(repo,'build','native-windows'),folder]){
  await mkdir(item,{recursive:true});
  const st=await lstat(item);
  if(!st.isDirectory()||st.isSymbolicLink())
    refuse('Output folder must be a real directory');
}
const sha=data=>createHash('sha256').update(data).digest('hex');
const sourceHash=sha(await readFile(source));
const args=['/nologo','/std:c++17','/EHsc','/W4','/WX',
  '/Fo:'+obj,'/Fe:'+exe,source,
  '/link','Advapi32.lib','Shell32.lib','Ole32.lib',
  'Uuid.lib','Bcrypt.lib','/Brepro','/INCREMENTAL:NO'];
await rm(receiptPath,{force:true});
function build(){
  const run=spawnSync('cl.exe',args,{
    cwd:repo,shell:false,encoding:'utf8',maxBuffer:2*1024*1024,
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
    refuse('Two MSVC links produced different PE hashes');
}
const st=await lstat(exe);
if(!st.isFile()||st.isSymbolicLink()||st.size===0)
  refuse('Not a regular native executable');
const result={
  kind:'D01_WINDOWS_NAMESPACE_INVENTORY_BUILD_V1',status:'NO_GO',
  sourceSha256:sourceHash,executableSha256:sha(await readFile(exe)),
  executableBytes:st.size,verifiedRepeatBuild:verifyRepro,
  executableRelativePath:'build/native-windows/d01-namespace-inventory/vcp-windows-d01-namespace-inventory.exe',
  manuallyRunOnly:true,selectedProjectTouched:false,
  nativeScratchMutationPerformed:false,publishedLegacyCliTested:false,
  namespaceAtomicityProven:false,
  productionBackend:false,tokenIsolationProven:false,
  WindowsNamespaceDurabilityProven:false,
  managedMutationAuthorized:false,d01Approved:false,
  packageIncluded:false
};
await writeFile(receiptPath,JSON.stringify(result,null,2)+'\n',
  {flag:'wx',mode:0o600});
console.log(JSON.stringify(result,null,2));
