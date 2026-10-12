#!/usr/bin/env node
// Offline D01 native snapshot / old-CLI operator-observation correlation.
// This script ONLY reads four externally preserved JSON files.
// No native helper launched, no old npm invocation, no project file touch.
// Complete matching input cannot authenticate unsigned external evidence.
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {correlateWindowsD01PublishedSnapshotEnvelopes}
  from '../lib/d01-windows-published-snapshot-correlation.mjs';

function usage(){
  console.error('E_D01_WINDOWS_CORRELATION_USAGE');
  process.exit(2);
}
const keys=['--plan','--observation','--before','--after','--scenario-id'];
const opts={};
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!keys.includes(k)||typeof v!=='string'||!v||
     Object.hasOwn(opts,k))usage();
  opts[k]=v;
}
if(keys.some(k=>!opts[k])||
   keys.slice(0,4).some(k=>!path.isAbsolute(opts[k]))||
   !/^(with-manifest|without-manifest)\/(init-force|update|manage-ignore|manage-track|rollback-post-backup-user-edit)$/.test(opts['--scenario-id']))
  usage();
function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function stableJson(filename){
  const st=await lstat(filename);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
     st.size<=0||st.size>196608)
    refuse('E_D01_WINDOWS_CORRELATION_UNSAFE_INPUT');
  const data=await readFile(filename);
  const next=await lstat(filename);
  if(next.ino!==st.ino||next.dev!==st.dev||
     next.size!==st.size||next.mtimeMs!==st.mtimeMs)
    refuse('E_D01_WINDOWS_CORRELATION_CHANGED_INPUT');
  return JSON.parse(data.toString('utf8'));
}
try{
  const [plan,oldCliObservation,beforeEnvelope,afterEnvelope]=
    await Promise.all(keys.slice(0,4).map(key=>stableJson(opts[key])));
  const report=correlateWindowsD01PublishedSnapshotEnvelopes({
    plan,oldCliObservation,beforeEnvelope,afterEnvelope,
    scenarioId:opts['--scenario-id']
  });
  console.log(JSON.stringify(report,null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',
    code:error.code??'E_D01_WINDOWS_CORRELATION_UNVERIFIED',
    explanation:String(error.message),selectedProjectTouched:false,
    safeToRetry:false,safeToDelete:false,
    managedMutationAuthorized:false,d01Approved:false
  }));
}
process.exitCode=3;
