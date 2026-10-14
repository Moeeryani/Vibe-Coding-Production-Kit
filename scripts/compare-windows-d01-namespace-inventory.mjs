#!/usr/bin/env node
// OFFLINE ONLY: compare two captured native full-namespace inventories
// for the exact disposable D01 Windows V2 NTFS fixture, never production.
// No external process, native binary, published package or write executed.
import {lstat,readFile} from 'node:fs/promises';
import path from 'node:path';
import {compareWindowsD01NamespaceInventoryEnvelopes}
  from '../lib/windows-d01-namespace-inventory-comparison.mjs';

function usage(){
  console.error('E_D01_WINDOWS_INVENTORY_DIFF_USAGE');
  process.exit(2);
}
const keys=['--fixture','--variant','--before','--after'];
const opts={};
for(let i=2;i<process.argv.length;i+=2){
  const name=process.argv[i],value=process.argv[i+1];
  if(!keys.includes(name)||!value||Object.hasOwn(opts,name))usage();
  opts[name]=value;
}
if(keys.some(x=>!opts[x])||
   !['with-manifest','without-manifest'].includes(opts['--variant'])||
   ['--fixture','--before','--after'].some(k=>!path.isAbsolute(opts[k])))
  usage();
function refuse(code){const e=new Error(code);e.code=code;throw e;}
async function json(file){
  const initial=await lstat(file);
  if(!initial.isFile()||initial.isSymbolicLink()||
     initial.nlink!==1||initial.size<=0||initial.size>524288)
    refuse('E_D01_WINDOWS_INVENTORY_DIFF_UNSAFE_FILE');
  const buffer=await readFile(file),again=await lstat(file);
  if(initial.dev!==again.dev||initial.ino!==again.ino||
     initial.size!==again.size||initial.mtimeMs!==again.mtimeMs)
    refuse('E_D01_WINDOWS_INVENTORY_DIFF_CHANGED_FILE');
  return JSON.parse(buffer.toString('utf8'));
}
try{
  const [fixtureReceipt,beforeEnvelope,afterEnvelope]=
    await Promise.all(['--fixture','--before','--after']
      .map(k=>json(opts[k])));
  const report=compareWindowsD01NamespaceInventoryEnvelopes({
    fixtureReceipt,variant:opts['--variant'],
    beforeEnvelope,afterEnvelope
  });
  console.log(JSON.stringify(report,null,2));
}catch(error){
  console.error(JSON.stringify({
    status:'NO_GO',code:error.code??'E_D01_WINDOWS_INVENTORY_DIFF_UNKNOWN',
    message:String(error.message),
    selectedProjectTouched:false,managedMutationAuthorized:false,
    safeToRetry:false,safeToDelete:false,d01Approved:false
  }));
}
process.exitCode=3;
