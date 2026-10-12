#!/usr/bin/env node
// OFFLINE, READ-ONLY Windows published-old-CLI operator-evidence review.
// JSON observations are not cryptographic or independently signed proof.
// Even complete observed input remains D-01 DEFERRED / NO_GO.
import {readFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {reviewWindowsD01PublishedLegacyObservations}
  from '../lib/d01-windows-published-cli-evidence.mjs';

function usage(){
  console.error('E_D01_PUBLISHED_REVIEW_USAGE: --plan <absolute JSON> --observations <absolute JSON>');
  process.exit(2);
}
const opts={};
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!['--plan','--observations'].includes(k)||
     typeof v!=='string'||!path.isAbsolute(v)||
     Object.hasOwn(opts,k))usage();
  opts[k]=v;
}
if(!opts['--plan']||!opts['--observations'])usage();
function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function bounded(file,max){
  const before=await lstat(file);
  if(!before.isFile()||before.isSymbolicLink()||
     before.nlink!==1||before.size<=0||before.size>max)
    refuse('E_D01_PUBLISHED_REVIEW_UNSAFE_FILE');
  const bytes=await readFile(file),after=await lstat(file);
  if(before.dev!==after.dev||before.ino!==after.ino||
     before.size!==after.size||before.mtimeMs!==after.mtimeMs)
    refuse('E_D01_PUBLISHED_REVIEW_INPUT_CHANGED');
  return bytes;
}
try{
  const plan=JSON.parse((await bounded(
    opts['--plan'],128*1024)).toString('utf8'));
  const observations=JSON.parse((await bounded(
    opts['--observations'],256*1024)).toString('utf8'));
  const review=reviewWindowsD01PublishedLegacyObservations({
    plan,observations
  });
  console.log(JSON.stringify(review,null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',code:error.code??'E_D01_PUBLISHED_REVIEW_INVALID',
    message:String(error.message),selectedProjectTouched:false,
    managedMutationAuthorized:false,d01Approved:false
  }));
}
process.exitCode=3;
