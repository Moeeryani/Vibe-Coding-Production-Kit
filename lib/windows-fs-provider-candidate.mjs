// Stage12/13 candidate interface for the disposable-only native Windows
// namespace helper. NOT connected to managed lifecycle or Stage13 apply.
//
// This is deliberately *not* a durability provider in the production sense:
// Win32 operation completion / file flush / directory-flush return values
// alone cannot attest power-loss survival or establish the old-v0.9.3 fence.
// The D-01 writer stays blocked independently in managed-migration.mjs.
//
// A native operation can COMPLETE even when directory flush fails and the
// process exits nonzero. Every thrown error carries the native receipt;
// callers MUST preserve/inspect the scratch tree, never roll back blindly.
import {spawnSync} from 'node:child_process';
import {readFile,lstat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const WINDOWS_NATIVE_SCRATCH_MARKER =
  'VCP_STAGE12_DISPOSABLE_TEST_ROOT_ONLY\n';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WINDOWS_SCRATCH_HELPER=path.join(
  HERE,'..','scripts','native','vcp-windows-fsops.exe'
);
const MAX_PAYLOAD=1024*1024;
const NAME=/^vcp-stage12-[a-z0-9._-]{1,80}$/;

function fail(code,detail,receipt=null,{mutating=false,unknown=false}={}) {
  const e=new Error(code+(detail?': '+detail:''));
  e.code=code;
  if(receipt)e.nativeReceipt=Object.freeze(receipt);
  // A failed helper is NOT evidence of a no-op. When its outcome is
  // unavailable, assume any mutating request may have modified scratch.
  e.nativeOutcomeUnknown=unknown;
  e.mayHaveMutated=receipt?.mayHaveMutated===true||
    (mutating&&unknown);
  e.requiresForensicInspection=e.mayHaveMutated;
  throw e;
}
function safeName(value) {
  if(typeof value!=='string'||value.length>95||!NAME.test(value)||
      value.endsWith('.')||value.endsWith(' ')||
      value.includes('..')||value.includes('\\')||value.includes('/')||
      value.includes(':')) fail('E_WINDOWS_SCRATCH_NAME');
  return value;
}
function checkReceipt(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
      value.kind!=='VCP_WINDOWS_SCRATCH_NAMESPACE_CANDIDATE'||
      value.protocolVersion!==1||
      typeof value.operation!=='string'||
      !['capabilities','sync-root','write-exclusive','rename-no-replace',
        'unlink','mkdir-exclusive','rmdir-empty'].includes(value.operation)||
      typeof value.completed!=='boolean'||
      typeof value.fileFlushReturned!=='boolean'||
      typeof value.directoryFlushReturned!=='boolean'||
      typeof value.mayHaveMutated!=='boolean'||
      !Number.isSafeInteger(value.lastWin32Error)||
      value.lastWin32Error<0||value.lastWin32Error>0xffffffff||
      value.managedMutationAuthorized!==false||
      value.directoryDurabilityProven!==false||
      value.powerLossAttested!==false)
    fail('E_WINDOWS_SCRATCH_HELPER_PROTOCOL');
  return value;
}
// Pure protocol and failure analysis, testable without a native Windows
// machine. A missing/malformed result never becomes evidence of a no-op.
export function interpretWindowsScratchResult(op,run) {
  const mutating=!['capabilities','sync-root'].includes(op);
  if(run?.error){
    fail('E_WINDOWS_SCRATCH_HELPER_UNAVAILABLE',
      String(run.error.code??run.error.message),null,
      {mutating,unknown:true});
  }
  let receipt;
  try{
    receipt=checkReceipt(JSON.parse(run?.stdout?.trim()??''));
  }catch{
    fail('E_WINDOWS_SCRATCH_HELPER_PROTOCOL',
      'missing or malformed native receipt; exit='+String(run?.status),
      null,{mutating,unknown:true});
  }
  if(receipt.operation!==op||
     (mutating&&receipt.completed&&!receipt.mayHaveMutated)||
     (!mutating&&receipt.mayHaveMutated)||
     (op==='write-exclusive'&&receipt.completed&&
       !receipt.fileFlushReturned)||
     (op!=='write-exclusive'&&receipt.fileFlushReturned)||
     (run.status===0&&receipt.completed!==true)||
     (run.status===0&&op!=='capabilities'&&
       !receipt.directoryFlushReturned)){
    fail('E_WINDOWS_SCRATCH_HELPER_PROTOCOL',
      'native receipt inconsistent with requested operation/status',
      null,{mutating,unknown:true});
  }
  if(run.status!==0||receipt.completed!==true) {
    if(run.status===7&&receipt.completed===true&&
       receipt.directoryFlushReturned===false)
      fail('E_DIRECTORY_SYNC_UNPROVEN',
        'Win32 operation completed; scratch state must be inspected',receipt);
    fail('E_WINDOWS_SCRATCH_OPERATION_FAILED',
      'native exit='+String(run.status),receipt,
      {mutating,unknown:run.status===null});
  }
  return Object.freeze({...receipt,nativeExitCode:run.status,
    directoryDurabilityProven:false,managedMutationAuthorized:false});
}
export class WindowsNamespaceScratchCandidate {
  constructor({root,helperPath=DEFAULT_WINDOWS_SCRATCH_HELPER}={}) {
    if(process.platform!=='win32')fail('E_WINDOWS_NATIVE_REQUIRED');
    if(typeof root!=='string'||!path.isAbsolute(root))
      fail('E_WINDOWS_SCRATCH_ROOT');
    this.root=path.resolve(root);
    const tmp=path.resolve(os.tmpdir());
    const prefix='vcp-win-native-scratch-';
    const base=path.basename(this.root);
    if(path.dirname(this.root).toLowerCase()!==tmp.toLowerCase()||
       !base.startsWith(prefix)||
       !/^[A-Za-z0-9_-]{6,}$/.test(base.slice(prefix.length)))
      fail('E_WINDOWS_SCRATCH_ROOT',
        'native candidate accepts only mkdtemp children of OS temporary directory');
    this.helperPath=path.resolve(helperPath);
    this.mutationAuthorized=false;
    this.directoryDurabilityProven=false;
    Object.freeze(this);
  }

  // JS checks are only convenience checks; the native binary independently
  // re-checks the marker, volume, no-reparse ancestry and exact own-file set.
  async inspectScratchRoot() {
    const stat=await lstat(this.root);
    if(!stat.isDirectory()||stat.isSymbolicLink())
      fail('E_WINDOWS_SCRATCH_ROOT');
    const marker=await readFile(path.join(this.root,
      'VCP-STAGE12-DISPOSABLE-ONLY.marker'));
    if(!marker.equals(Buffer.from(WINDOWS_NATIVE_SCRATCH_MARKER)))
      fail('E_WINDOWS_SCRATCH_MARKER');
    return Object.freeze({root:this.root,disposableOnly:true,
      mutationAuthorized:false,directoryDurabilityProven:false});
  }

  async _call(op,names=[],stdin=Buffer.alloc(0)) {
    await this.inspectScratchRoot();
    const args=['--scratch-root',this.root,'--op',op,...names];
    const temp=os.tmpdir();
    // Node prioritizes TEMP, whereas Win32 GetTempPathW prioritizes TMP.
    // Pin BOTH child-only environment values to the same temp directory.
    // This is scope consistency, not an OS-enforced security boundary.
    const run=spawnSync(this.helperPath,args,{
      shell:false,cwd:this.root,input:stdin,
      encoding:'utf8',maxBuffer:64*1024,timeout:30000,
      windowsHide:true,env:{...process.env,TMP:temp,TEMP:temp}
    });
    return interpretWindowsScratchResult(op,run);
  }
  async capabilities(){return this._call('capabilities');}
  async syncRoot(){return this._call('sync-root');}
  async writeExclusive(name,payload) {
    safeName(name);
    if(!Buffer.isBuffer(payload)||payload.byteLength>MAX_PAYLOAD)
      fail('E_WINDOWS_SCRATCH_BYTES');
    return this._call('write-exclusive',[name],payload);
  }
  async renameNoReplace(before,after) {
    safeName(before);safeName(after);
    if(before===after)fail('E_WINDOWS_SCRATCH_NAME');
    return this._call('rename-no-replace',[before,after]);
  }
  async unlink(name){return this._call('unlink',[safeName(name)]);}
  async mkdirExclusive(name){return this._call('mkdir-exclusive',[safeName(name)]);}
  async rmdirEmpty(name){return this._call('rmdir-empty',[safeName(name)]);}
}

// Read-only descriptive capability usable in planning, never mutation.
// Production file-durability.mjs intentionally still reports unsupported.
export function windowsNativeCandidateStatus(){
  return Object.freeze({platform:'win32',nativeScratchCandidateSource:true,
    productionBackendConnected:false,
    directoryDurabilityProven:false,mutationAuthorized:false,
    d01ApprovalRequired:true,nativeIndependentTestingRequired:true});
}
