#!/usr/bin/env node
// Offline D01 full dual-project namespace comparison for one fixed
// original published-old CLI 0.9.3 scenario. No native process run,
// no package execution, no project changes, and always NO_GO/exit 3.
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {compareWindowsD01PublishedDualProjectInventories}
  from '../lib/d01-windows-published-dual-inventory.mjs';

const files=['--fixture','--plan','--with-before','--with-after',
  '--without-before','--without-after'];
const keys=[...files,'--scenario-id'];
const opts={};
function usage(){
  console.error('E_D01_WINDOWS_DUAL_INVENTORY_USAGE');
  process.exit(2);
}
for(let i=2;i<process.argv.length;i+=2){
  const k=process.argv[i],v=process.argv[i+1];
  if(!keys.includes(k)||!v||Object.hasOwn(opts,k))usage();
  opts[k]=v;
}
if(keys.some(k=>!opts[k])||
   files.some(k=>!path.isAbsolute(opts[k]))||
   new Set(files.map(k=>path.resolve(opts[k]).toLowerCase())).size!==6||
   !/^(?:with-manifest|without-manifest)\/(?:init-force|update|manage-ignore|manage-track|rollback-post-backup-user-edit)$/.test(opts['--scenario-id']))
  usage();

function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function readJson(file){
  const start=await lstat(file);
  if(!start.isFile()||start.isSymbolicLink()||start.nlink!==1||
     start.size<=0||start.size>524288)
    refuse('E_D01_WINDOWS_DUAL_INVENTORY_INPUT_UNSAFE');
  const bytes=await readFile(file);
  const end=await lstat(file);
  if(start.dev!==end.dev||start.ino!==end.ino||
     start.size!==end.size||start.mtimeMs!==end.mtimeMs)
    refuse('E_D01_WINDOWS_DUAL_INVENTORY_INPUT_CHANGED');
  return JSON.parse(bytes.toString('utf8'));
}
try{
  const [fixtureReceipt,plan,withBefore,withAfter,
    withoutBefore,withoutAfter]=await Promise.all(
      files.map(k=>readJson(opts[k]))
    );
  const result=compareWindowsD01PublishedDualProjectInventories({
    fixtureReceipt,plan,scenarioId:opts['--scenario-id'],
    withBefore,withAfter,withoutBefore,withoutAfter
  });
  console.log(JSON.stringify(result,null,2));
}catch(e){
  console.error(JSON.stringify({
    status:'NO_GO',
    code:e.code??'E_D01_WINDOWS_DUAL_INVENTORY_UNVERIFIED',
    reason:String(e.message),actualOldCliExecutionVerified:false,
    safeToRetry:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  }));
}
process.exitCode=3;
