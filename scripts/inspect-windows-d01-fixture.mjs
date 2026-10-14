#!/usr/bin/env node
// STRICT Windows read-only D-01 fixture observation runner.
// Must be invoked separately as the old principal and the new writer.
// Verifies independently built native EXE SOURCE + BINARY SHA256 and
// compares its real TokenUser SID and NTFS file IDs to the minted fixture
// receipt. Does not execute the published legacy CLI or mutate anything.
// Always returns nonzero 3/NO_GO on a complete observation.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateD01WindowsDisposableFixtureReceipt}
  from '../lib/windows-d01-fixture-evidence.mjs';
import {validateWindowsD01ReadOnlyReceipt}
  from '../lib/windows-d01-token-evidence.mjs';

function usage(msg){console.error('E_D01_WINDOWS_INSPECT_USAGE: '+msg);process.exit(2);}
function refusal(code){
  const e=new Error(code);e.code=code;throw e;
}
if(process.platform!=='win32')
  usage('Native Windows only, no POSIX or WSL fallbacks');
const args={};
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!['--fixture-receipt','--role','--variant'].includes(k)||
     !v||Object.hasOwn(args,k))
    usage('Only --fixture-receipt, --role and --variant are accepted');
  args[k]=v;
}
if(!args['--fixture-receipt']||
   !path.isAbsolute(args['--fixture-receipt'])||
   !['old','writer'].includes(args['--role'])||
   !['with-manifest','without-manifest'].includes(args['--variant']))
  usage('Explicit fixture receipt, role and manifest variant required');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const exe=path.join(repo,'build','native-windows','d01-readonly',
  'vcp-windows-d01-token-inspect.exe');
const receiptPath=path.join(repo,'build','native-windows','d01-readonly',
  'build-receipt.json');
const sourcePath=path.join(repo,'scripts','native',
  'vcp-windows-d01-token-inspect.cpp');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function safeBytes(filename,max){
  const before=await lstat(filename);
  if(!before.isFile()||before.isSymbolicLink()||
     before.nlink!==1||before.size<=0||before.size>max)
    refusal('E_D01_WINDOWS_INSPECT_UNSAFE_FILE');
  const data=await readFile(filename);
  const after=await lstat(filename);
  if(before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeMs!==after.mtimeMs)
    refusal('E_D01_WINDOWS_INSPECT_CHANGED_DURING_READ');
  return data;
}
try{
  const fixtureRaw=JSON.parse((await safeBytes(
    args['--fixture-receipt'],32*1024)).toString('utf8'));
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureRaw);
  const build=JSON.parse((await safeBytes(
    receiptPath,32*1024)).toString('utf8'));
  if(build.kind!=='D01_WINDOWS_ACL_READONLY_BUILD_V1'||
     build.nativePlatform!=='win32'||
     !/^[a-f0-9]{64}$/.test(build.sourceSha256??'')||
     !/^[a-f0-9]{64}$/.test(build.executableSha256??'')||
     build.d01Gate!=='NO_GO'||build.d01Approved!==false||
     build.managedMutationAuthorized!==false||
     build.actualWindowsPrincipalDenialAttested!==false||
     build.authenticatedPublishedCliTested!==false)
    refusal('E_D01_WINDOWS_INSPECT_BUILD_RECEIPT_INVALID');
  if(sha(await safeBytes(sourcePath,1024*1024))!==build.sourceSha256||
     sha(await safeBytes(exe,8*1024*1024))!==build.executableSha256)
    refusal('E_D01_WINDOWS_INSPECT_BUILD_SHA_MISMATCH');
  const executed=spawnSync(exe,[
    '--scratch-root',fixture.root,'--variant',args['--variant']
  ],{shell:false,encoding:'utf8',windowsHide:true,timeout:15000,
    maxBuffer:64*1024});
  if(executed.error||executed.signal||executed.status!==3)
    refusal('E_D01_WINDOWS_INSPECT_NATIVE_FAILED');
  let raw;
  try{raw=JSON.parse(executed.stdout.trim());}
  catch{refusal('E_D01_WINDOWS_INSPECT_PROTOCOL');}
  const observed=validateWindowsD01ReadOnlyReceipt(raw);
  const expectedSid=args['--role']==='old'?
    fixture.oldSid:fixture.writerSid;
  const expectedFileId=args['--variant']==='with-manifest'?
    fixture.withManifestIdentity:fixture.withoutManifestIdentity;
  if(observed.principalSid!==expectedSid||
     observed.rootIdentity!==fixture.rootIdentity||
     observed.projectIdentity!==expectedFileId||
     observed.projectVariant!==args['--variant'])
    refusal('E_D01_WINDOWS_INSPECT_PRINCIPAL_OR_FILE_ID_MISMATCH');
  console.log(JSON.stringify({
    kind:'D01_WINDOWS_TOKEN_OBSERVATION_V1',status:'NO_GO',
    role:args['--role'],fixtureRoot:fixture.root,
    realTokenSidMatchedFixture:true,
    fileIdsMatchedFixture:true,
    nativeSourceSha256:build.sourceSha256,
    nativeExecutableSha256:build.executableSha256,
    nativeReceipt:raw,
    managedMutationAuthorized:false,d01Approved:false,
    publishedLegacyCliTested:false
  },null,2));
}catch(e){
  console.error(JSON.stringify({
    status:'NO_GO',code:e.code??'E_D01_WINDOWS_INSPECT_ERROR',
    reason:String(e.message),managedMutationAuthorized:false
  }));
}
process.exitCode=3; // No shell-green access evidence.
