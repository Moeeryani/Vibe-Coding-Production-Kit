#!/usr/bin/env node
// OFFLINE, NON-EXECUTING D-01 Windows 0.9.3 old-writer plan.
// No npm fetch/install, no spawn, no staging or file mutation.
// The input artifact SHA512 is caller-supplied; verify npm provenance
// separately before any independent Windows isolated-VM execution.
// Exit 3/NO_GO always, including on a correctly derived matrix.
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {planWindowsD01PublishedLegacyAdversary}
  from '../lib/d01-windows-published-cli-plan.mjs';

function usage(){
  console.error('E_D01_PUBLISHED_PLAN_USAGE: explicit --fixture, --legacy-tgz and --expected-sha512 required');
  process.exit(2);
}
const options={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i],value=process.argv[i+1];
  if(!['--fixture','--legacy-tgz','--expected-sha512'].includes(key)||
     typeof value!=='string'||!value||Object.hasOwn(options,key))
    usage();
  options[key]=value;
}
if(!options['--fixture']||!options['--legacy-tgz']||
   !/^[a-f0-9]{128}$/.test(options['--expected-sha512']??'')||
   !path.isAbsolute(options['--fixture'])||
   !path.isAbsolute(options['--legacy-tgz']))
  usage();
function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function stableFile(filename,limit){
  const original=await lstat(filename);
  if(!original.isFile()||original.isSymbolicLink()||
     original.nlink!==1||original.size<=0||original.size>limit)
    refuse('E_D01_PUBLISHED_PLAN_UNSAFE_FILE');
  const bytes=await readFile(filename);
  const after=await lstat(filename);
  if(original.dev!==after.dev||original.ino!==after.ino||
     original.size!==after.size||original.mtimeMs!==after.mtimeMs)
    refuse('E_D01_PUBLISHED_PLAN_CHANGED_DURING_READ');
  return bytes;
}
try{
  const fixture=JSON.parse((await stableFile(
    options['--fixture'],32*1024)).toString('utf8'));
  const tarball=await stableFile(options['--legacy-tgz'],16*1024*1024);
  const plan=planWindowsD01PublishedLegacyAdversary({
    fixtureReceipt:fixture,archiveBytes:tarball,
    expectedSha512:options['--expected-sha512']
  });
  console.log(JSON.stringify(plan,null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',code:error.code??'E_D01_PUBLISHED_PLAN_INVALID',
    explanation:String(error.message),
    archiveExecuted:false,selectedProjectTouched:false,
    managedMutationAuthorized:false,d01Approved:false
  }));
}
process.exitCode=3;
