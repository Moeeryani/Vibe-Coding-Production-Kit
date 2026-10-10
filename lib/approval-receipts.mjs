import { open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolveProjectPath } from './safe-path.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { validateAdaptiveManifest } from './manifest-v2.mjs';
import { getCliVersion } from './version.mjs';
import { COMMAND_KEYS } from './verification-commands.mjs';
import { COMMAND_AUTHORITY_POLICY_VERSION } from './command-authority.mjs';

const MAX_RECEIPT_MANIFEST_BYTES=512*1024;
const DIGEST=/^[a-f0-9]{64}$/;
function deny(code){const e=new Error(code);e.code=code;throw e;}
export async function readApprovedCommandReceipts(root) {
  const state=await inspectProject(root);
  if(state.classification==='BLOCKED')deny('E_APPROVAL_LIFECYCLE_BLOCKED');
  if(state.classification!=='MANAGED'||state.schemaVersion===1)return [];
  if(state.schemaVersion!==2)deny('E_APPROVAL_SCHEMA');
  const filename=await resolveProjectPath(root,'.vcp/manifest.json',{purpose:'managed-state'});
  const before=await lstat(filename);
  if(!before.isFile()||before.isSymbolicLink()||before.size>MAX_RECEIPT_MANIFEST_BYTES)deny('E_APPROVAL_MANIFEST');
  const fd=await open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let data;
  try {
    const opened=await fd.stat();
    if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||opened.size!==before.size)deny('E_APPROVAL_RACE');
    data=await fd.readFile();
  }finally{await fd.close();}
  const after=await lstat(filename);
  if(data.length>MAX_RECEIPT_MANIFEST_BYTES||after.dev!==before.dev||
    after.ino!==before.ino||after.size!==before.size||after.mtimeMs!==before.mtimeMs)deny('E_APPROVAL_RACE');
  let manifest;
  try{manifest=JSON.parse(data.toString('utf8'));}
  catch{deny('E_APPROVAL_MANIFEST_JSON');}
  validateAdaptiveManifest(manifest,{readerVersion:await getCliVersion()});
  if(!Array.isArray(manifest.approvalReceipts))return [];
  if(manifest.approvalReceipts.length>64)deny('E_APPROVAL_RECEIPTS');
  const receipts=[];
  for(const r of manifest.approvalReceipts){
    if(!r||!COMMAND_KEYS.includes(r.key)||!DIGEST.test(r.digest)||
      r.source!=='AGENTS.md'||r.policyVersion!==COMMAND_AUTHORITY_POLICY_VERSION||
      r.decision!=='accepted'||r.grandfathered===true||
      typeof r.approvalId!=='string'||r.approvalId.length<1||r.approvalId.length>128)continue;
    receipts.push({...r});
  }
  return receipts;
}
