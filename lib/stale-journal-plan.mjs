// Inspect versioned journal staging files left by a process crash.
// A recognizable filename or hash is not ownership proof for mutation.
import { createHash } from 'node:crypto';
import { lstat, opendir } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { readProjectBytes } from './safe-read.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';

const TEMP=/^transaction-([0-9a-f]{24})\.tmp$/;
const MAX_CANDIDATES=32;
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function planStaleJournalQuarantine(rootPath) {
  const root=path.resolve(rootPath);
  const blocked=(reason)=>({
    root,classification:'BLOCKED',reason,readOnly:true,
    writeAuthorized:false,actions:[],humanDecisionRequired:true
  });
  let vcpDir;
  try {
    const probe=await resolveProjectPath(root,'.vcp/.__vcp_inventory_probe__',{
      purpose:'managed-state'
    });
    vcpDir=path.dirname(probe);
    const stat=await lstat(vcpDir);
    if(!stat.isDirectory()||stat.isSymbolicLink())return blocked('UNSAFE_STATE_DIRECTORY');
  }catch(error){return blocked(error.code??'STATE_UNREADABLE');}
  const recognized=[];
  let scanned=0;
  try {
    const dir=await opendir(vcpDir);
    for await(const entry of dir) {
      if(++scanned>10000)return blocked('STATE_DIRECTORY_TOO_LARGE');
      if(!entry.name.startsWith('transaction-'))continue;
      if(!TEMP.test(entry.name)||!entry.isFile()) {
        return blocked('UNRECOGNIZED_JOURNAL_STAGING');
      }
      if(recognized.length>=MAX_CANDIDATES)return blocked('TOO_MANY_JOURNAL_STAGING_FILES');
      const relative='.vcp/'+entry.name;
      const bytes=await readProjectBytes(root,relative,{
        managedState:true,maxBytes:512*1024
      });
      recognized.push({path:relative,sha256:sha(bytes),size:bytes.length});
    }
  }catch(error){return blocked(error.code??'STAGING_INVENTORY_FAILED');}
  const lifecycle=await inspectManagedRecovery(root);
  if(lifecycle.blocked)return blocked(lifecycle.reason);
  return {
    root,classification:recognized.length?'QUARANTINE_CANDIDATE':'NO_STAGING_FILES',
    readOnly:true,writeAuthorized:false,
    requiresOwnedLifecycleLock:true,requiresHumanDecision:true,
    activeTransactionId:lifecycle.transaction?.id??null,
    actions:recognized.sort((a,b)=>a.path.localeCompare(b.path)).map(x=>({
      action:'PROPOSE_QUARANTINE_STAGING',path:x.path,
      sha256:x.sha256,size:x.size,executionAuthorized:false
    })),
    reason:recognized.length?
      'UNTRUSTED_JOURNAL_STAGING_REQUIRES_INDEPENDENT_OWNERSHIP_REVIEW':
      'NO_VERSIONED_STAGING_FOUND',
    note:'Do not replace the active transaction or delete staged bytes.'
  };
}
