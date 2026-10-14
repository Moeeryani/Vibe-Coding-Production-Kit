#!/usr/bin/env node
// Execute the native OLD Windows token kernel-denial witness ONLY in a
// preexisting, identity-bound disposable NTFS fixture. No published npm
// package execution, no production project target, NO_GO always.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateD01WindowsDisposableFixtureReceipt}
  from '../lib/windows-d01-fixture-evidence.mjs';
import {reviewWindowsD01KernelDenialReceipt}
  from '../lib/windows-d01-kernel-denial-evidence.mjs';

function usage(){console.error('E_D01_WINDOWS_KERNEL_USAGE');process.exit(2);}
function refuse(code){const e=new Error(code);e.code=code;throw e;}
if(process.platform!=='win32')usage();
const arg={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i],value=process.argv[i+1];
  if(!['--fixture-receipt','--variant'].includes(key)||
     !value||Object.hasOwn(arg,key))usage();
  arg[key]=value;
}
if(!arg['--fixture-receipt']||
   !path.isAbsolute(arg['--fixture-receipt'])||
   !['with-manifest','without-manifest'].includes(arg['--variant']))usage();
if(process.env.VCP_D01_WINDOWS_OLD_DENIAL!=='I_ACCEPT_DISPOSABLE_ONLY')
  usage();
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const folder=path.join(repo,'build','native-windows','d01-kernel-denial');
const exe=path.join(folder,'vcp-windows-d01-kernel-denial.exe');
const buildPath=path.join(folder,'build-receipt.json');
const source=path.join(repo,'scripts','native',
  'vcp-windows-d01-kernel-denial.cpp');
const sha=data=>createHash('sha256').update(data).digest('hex');
async function bytes(file,max){
  const before=await lstat(file);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
     before.size<=0||before.size>max)
    refuse('E_D01_WINDOWS_KERNEL_UNSAFE_INPUT');
  const result=await readFile(file),after=await lstat(file);
  if(before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeMs!==after.mtimeMs)
    refuse('E_D01_WINDOWS_KERNEL_INPUT_CHANGED');
  return result;
}
let nativeMayHaveMutated=false;
try{
  const fixture=validateD01WindowsDisposableFixtureReceipt(
    JSON.parse((await bytes(arg['--fixture-receipt'],32*1024)).toString('utf8')));
  const build=JSON.parse((await bytes(buildPath,32*1024)).toString('utf8'));
  if(build.kind!=='D01_WINDOWS_KERNEL_DENIAL_BUILD_V1'||
     build.status!=='NO_GO'||
     build.managedMutationAuthorized!==false||
     build.d01Approved!==false||
     build.productionBackend!==false||
     !/^[a-f0-9]{64}$/.test(build.sourceSha256??'')||
     !/^[a-f0-9]{64}$/.test(build.executableSha256??''))
    refuse('E_D01_WINDOWS_KERNEL_BUILD_RECEIPT_INVALID');
  if(build.sourceSha256!==sha(await bytes(source,1024*1024))||
     build.executableSha256!==sha(await bytes(exe,8*1024*1024)))
    refuse('E_D01_WINDOWS_KERNEL_SHA_MISMATCH');
  const variant=arg['--variant'];
  const projectIdentity=variant==='with-manifest'?
    fixture.withManifestIdentity:fixture.withoutManifestIdentity;
  // Once invoked, a crash or malformed receipt may conceal a successful
  // CREATE_NEW or rename. Never treat that as safe to retry or clean up.
  nativeMayHaveMutated=true;
  const result=spawnSync(exe,[
    '--scratch-root',fixture.root,'--variant',variant,
    '--old-sid',fixture.oldSid,'--root-id',fixture.rootIdentity,
    '--project-id',projectIdentity
  ],{shell:false,windowsHide:true,encoding:'utf8',
    timeout:15000,maxBuffer:64*1024});
  // "3" is the ONLY recognized native receipt exit; do not treat a failed
  // process or a 0 exit as evidence of successful old-principal denial.
  if(result.error||result.signal||result.status!==3)
    refuse('E_D01_WINDOWS_KERNEL_NATIVE_FAILED');
  let raw;
  try{raw=JSON.parse(result.stdout.trim());}
  catch{refuse('E_D01_WINDOWS_KERNEL_PROTOCOL');}
  const reviewed=reviewWindowsD01KernelDenialReceipt(raw,{
    variant,rootIdentity:fixture.rootIdentity,projectIdentity
  });
  console.log(JSON.stringify({
    kind:'D01_WINDOWS_OLD_TOKEN_KERNEL_WITNESS_ENVELOPE_V1',
    status:'NO_GO',fixtureRoot:fixture.root,oldSid:fixture.oldSid,
    variant,sourceSha256:build.sourceSha256,
    executableSha256:build.executableSha256,
    nativeReceipt:raw,review:reviewed,
    publishedLegacyCliTested:false,
    nativeMayHaveMutated:true,requiresForensicInspection:true,
    safeToRetry:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  },null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',code:error.code??'E_D01_WINDOWS_KERNEL_UNKNOWN',
    message:String(error.message),
    nativeMayHaveMutated,requiresForensicInspection:nativeMayHaveMutated,
    safeToRetry:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  }));
}
process.exitCode=3;
