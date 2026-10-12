#!/usr/bin/env node
// Read-only D-01 Windows NTFS protected-file SHA256 inventory.
// Intended as a separate before/after forensic observation; NOT the old
// CLI executor and NEVER a release, migration or D-01 approval command.
// Trusted old/new tokens and network isolation need independent evidence.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateD01WindowsDisposableFixtureReceipt}
  from '../lib/windows-d01-fixture-evidence.mjs';
import {validateWindowsD01NativeNamespaceInventory}
  from '../lib/windows-d01-namespace-inventory-evidence.mjs';

function usage(){console.error('E_D01_WINDOWS_INVENTORY_USAGE');process.exit(2);}
function refuse(code){const e=new Error(code);e.code=code;throw e;}
if(process.platform!=='win32')usage();
const options={};
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!['--fixture-receipt','--variant'].includes(k)||
     !v||Object.hasOwn(options,k))usage();
  options[k]=v;
}
if(!options['--fixture-receipt']||
   !path.isAbsolute(options['--fixture-receipt'])||
   !['with-manifest','without-manifest'].includes(options['--variant']))
  usage();
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(repo,'build','native-windows','d01-namespace-inventory');
const executable=path.join(dir,'vcp-windows-d01-namespace-inventory.exe');
const builderReceipt=path.join(dir,'build-receipt.json');
const source=path.join(repo,'scripts','native',
  'vcp-windows-d01-namespace-inventory.cpp');
const sha256=b=>createHash('sha256').update(b).digest('hex');
async function stableFile(file,max){
  const st=await lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
     st.size<=0||st.size>max)
    refuse('E_D01_WINDOWS_INVENTORY_UNSAFE_FILE');
  const bytes=await readFile(file),later=await lstat(file);
  if(st.dev!==later.dev||st.ino!==later.ino||
     st.size!==later.size||st.mtimeMs!==later.mtimeMs)
    refuse('E_D01_WINDOWS_INVENTORY_CHANGED_FILE');
  return bytes;
}
try{
  const fixtureRaw=JSON.parse((await stableFile(
    options['--fixture-receipt'],32768)).toString('utf8'));
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureRaw);
  const built=JSON.parse((await stableFile(
    builderReceipt,32768)).toString('utf8'));
  if(built.kind!=='D01_WINDOWS_NAMESPACE_INVENTORY_BUILD_V1'||
     built.status!=='NO_GO'||built.managedMutationAuthorized!==false||
     built.d01Approved!==false||built.productionBackend!==false||
     built.nativeScratchMutationPerformed!==false||
     built.namespaceAtomicityProven!==false||
     !/^[a-f0-9]{64}$/.test(built.sourceSha256??'')||
     !/^[a-f0-9]{64}$/.test(built.executableSha256??''))
    refuse('E_D01_WINDOWS_INVENTORY_BUILD_RECEIPT_INVALID');
  if(sha256(await stableFile(source,1024*1024))!==built.sourceSha256||
     sha256(await stableFile(executable,8*1024*1024))!==
       built.executableSha256)
    refuse('E_D01_WINDOWS_INVENTORY_SHA_MISMATCH');
  const variant=options['--variant'];
  const projectIdentity=variant==='with-manifest'?
    fixture.withManifestIdentity:fixture.withoutManifestIdentity;
  const run=spawnSync(executable,[
    '--scratch-root',fixture.root,'--variant',variant,
    '--root-id',fixture.rootIdentity,
    '--project-id',projectIdentity
  ],{shell:false,encoding:'utf8',windowsHide:true,timeout:15000,
    maxBuffer:524288});
  if(run.error||run.signal||run.status!==3)
    refuse('E_D01_WINDOWS_INVENTORY_NATIVE_FAILED');
  let native;
  try{native=JSON.parse(run.stdout.trim());}
  catch{refuse('E_D01_WINDOWS_INVENTORY_PROTOCOL');}
  const reviewed=validateWindowsD01NativeNamespaceInventory(native,{
    variant,rootIdentity:fixture.rootIdentity,projectIdentity
  });
  console.log(JSON.stringify({
    kind:'D01_WINDOWS_NAMESPACE_INVENTORY_ENVELOPE_V1',
    status:'NO_GO',fixtureRoot:fixture.root,
    sourceSha256:built.sourceSha256,
    executableSha256:built.executableSha256,
    nativeReceipt:native,
    review:reviewed,
    executablePinningIndependentlyAttested:false,
    namespaceSnapshotAtomic:false,
    oldCliExecutionProven:false,
    WindowsNamespaceDurabilityProven:false,
    managedMutationAuthorized:false,d01Approved:false
  },null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',code:error.code??'E_D01_WINDOWS_INVENTORY_UNKNOWN',
    message:String(error.message),readOnly:true,
    safeToRetryNotEstablished:true,
    managedMutationAuthorized:false,d01Approved:false
  }));
}
process.exitCode=3;
