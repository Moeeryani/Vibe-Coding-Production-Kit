#!/usr/bin/env node
// Explicit READ-ONLY D-01 OS boundary preflight; not a proof of old CLI
// denial and not a production writer. Exit code 3 means NO-GO, always.
// Examples:
// Linux: node scripts/inspect-d01-boundary.mjs --root /isolated/project
//   --legacy-uid 1000 --legacy-gids 1000,27 --writer-uid 2000
//   --protected .vcp --protected AGENTS.md
// Windows: node scripts/inspect-d01-boundary.mjs --root C:\\isolated\\project
//   --legacy-sid S-1-5-21-... --writer-sid S-1-5-21-...
//   --protected .vcp --protected AGENTS.md
import {inspectLegacyPrincipalBoundary}
  from '../lib/d01-principal-boundary.mjs';

function die(message){
  console.error('E_D01_INSPECT_USAGE: '+message);
  process.exit(2);
}
const keys=new Set(['--root','--legacy-uid','--legacy-gids',
  '--writer-uid','--legacy-sid','--writer-sid','--protected']);
const argumentsMap={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i],value=process.argv[i+1];
  if(!keys.has(key)||typeof value!=='string'||value.length===0)
    die('expected option + value pair; got '+String(key));
  if(key==='--protected'){
    argumentsMap.protectedPaths??=[];
    argumentsMap.protectedPaths.push(value);
  }else if(Object.hasOwn(argumentsMap,key)){
    die('duplicate option '+key);
  }else argumentsMap[key]=value;
}
if(!argumentsMap['--root'])
  die('explicit --root is mandatory; never infer current directory');
const int=s=>{
  if(!/^(?:0|[1-9][0-9]*)$/.test(s??''))die('UID/GID must be decimal');
  const n=Number(s);
  if(!Number.isSafeInteger(n))die('UID/GID exceeds safe integer');
  return n;
};
const options={protectedPaths:argumentsMap.protectedPaths??['.vcp']};
if(process.platform==='win32'){
  options.legacySid=argumentsMap['--legacy-sid'];
  options.writerSid=argumentsMap['--writer-sid'];
}else{
  options.legacyUid=int(argumentsMap['--legacy-uid']);
  options.writerUid=int(argumentsMap['--writer-uid']);
  options.legacyGids=(argumentsMap['--legacy-gids']??'').split(',')
    .filter(Boolean).map(int);
}
try{
  const report=await inspectLegacyPrincipalBoundary(
    argumentsMap['--root'],options);
  console.log(JSON.stringify({
    ...report,
    warning:'READ-ONLY FINDINGS; NOT AN OS FENCE OR D-01 APPROVAL',
    testedPublishedLegacyCli:false,
    acceptanceDecision:'NO_GO'
  },null,2));
  process.exitCode=3; // Never emit shell-green from an unproved D-01 fence.
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',readOnly:true,code:error.code??'E_D01_INSPECT_FAILED',
    message:String(error.message),writerAuthorized:false
  }));
  process.exitCode=3;
}
