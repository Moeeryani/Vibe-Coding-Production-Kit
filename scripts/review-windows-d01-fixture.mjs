#!/usr/bin/env node
// Independent read-only comparison of four Windows D-01 observations:
// old and writer tokens for WITH and WITHOUT .vcp/manifest.json.
// All inputs are untrusted local evidence files; even perfect matching
// identities and DAC bits are NOT proof of old v0.9.3 mutation denial.
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {validateD01WindowsDisposableFixtureReceipt}
  from '../lib/windows-d01-fixture-evidence.mjs';
import {assessWindowsD01FixturePrincipalMatrix}
  from '../lib/windows-d01-fixture-matrix.mjs';

function fail(code){const e=new Error(code);e.code=code;throw e;}
const names=['--fixture','--with-old','--with-writer',
  '--without-old','--without-writer'];
const args={};
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!names.includes(k)||typeof v!=='string'||!path.isAbsolute(v)||
     Object.hasOwn(args,k)){
    console.error('E_D01_WINDOWS_MATRIX_USAGE');
    process.exit(2);
  }
  args[k]=v;
}
if(names.some(k=>!args[k])){
  console.error('E_D01_WINDOWS_MATRIX_USAGE: all five evidence paths required');
  process.exit(2);
}
async function jsonFile(file){
  const before=await lstat(file);
  if(!before.isFile()||before.isSymbolicLink()||
     before.nlink!==1||before.size<=0||before.size>128*1024)
    fail('E_D01_WINDOWS_MATRIX_EVIDENCE_UNSAFE');
  let result;
  try{result=JSON.parse((await readFile(file)).toString('utf8'));}
  catch{fail('E_D01_WINDOWS_MATRIX_EVIDENCE_JSON');}
  const after=await lstat(file);
  if(before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeMs!==after.mtimeMs)
    fail('E_D01_WINDOWS_MATRIX_EVIDENCE_RACE');
  return result;
}
function nativeEnvelope(value,role,fixture,variant){
  const sid=role==='old'?fixture.oldSid:fixture.writerSid;
  const expected=variant==='with-manifest'?
    fixture.withManifestIdentity:fixture.withoutManifestIdentity;
  if(!value||typeof value!=='object'||Array.isArray(value)||
     value.kind!=='D01_WINDOWS_TOKEN_OBSERVATION_V1'||
     value.status!=='NO_GO'||value.role!==role||
     value.fixtureRoot!==fixture.root||
     value.realTokenSidMatchedFixture!==true||
     value.fileIdsMatchedFixture!==true||
     value.managedMutationAuthorized!==false||
     value.d01Approved!==false||
     value.publishedLegacyCliTested!==false||
     !/^[a-f0-9]{64}$/.test(value.nativeSourceSha256??'')||
     !/^[a-f0-9]{64}$/.test(value.nativeExecutableSha256??'')||
     value.nativeReceipt?.principalSid!==sid||
     value.nativeReceipt?.rootIdentity!==fixture.rootIdentity||
     value.nativeReceipt?.projectIdentity!==expected||
     value.nativeReceipt?.projectVariant!==variant)
    fail('E_D01_WINDOWS_MATRIX_TOKEN_ENVELOPE_INVALID');
  return value.nativeReceipt;
}
try{
  const fixtureRaw=await jsonFile(args['--fixture']);
  const fixture=validateD01WindowsDisposableFixtureReceipt(fixtureRaw);
  const roles={
    withOld:await jsonFile(args['--with-old']),
    withWriter:await jsonFile(args['--with-writer']),
    withoutOld:await jsonFile(args['--without-old']),
    withoutWriter:await jsonFile(args['--without-writer'])
  };
  const hashes=Object.values(roles).map(v=>
    [v.nativeSourceSha256,v.nativeExecutableSha256].join(':'));
  if(new Set(hashes).size!==1)
    fail('E_D01_WINDOWS_MATRIX_BUILD_HASH_MISMATCH');
  const review=assessWindowsD01FixturePrincipalMatrix({
    fixtureReceipt:fixtureRaw,
    withManifest:{
      oldPrincipalReceipt:nativeEnvelope(roles.withOld,'old',fixture,
        'with-manifest'),
      writerPrincipalReceipt:nativeEnvelope(roles.withWriter,'writer',fixture,
        'with-manifest')
    },
    withoutManifest:{
      oldPrincipalReceipt:nativeEnvelope(roles.withoutOld,'old',fixture,
        'without-manifest'),
      writerPrincipalReceipt:nativeEnvelope(roles.withoutWriter,'writer',
        fixture,'without-manifest')
    }
  });
  console.log(JSON.stringify({
    ...review,
    allFourNativeBuildHashesMatched:true,
    noPublishedLegacyCliMutationTestExecuted:true,
    d01Approved:false,status:'NO_GO'
  },null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',error:error.code??'E_D01_WINDOWS_MATRIX_ERROR',
    message:String(error.message),managedMutationAuthorized:false
  }));
}
process.exitCode=3;
