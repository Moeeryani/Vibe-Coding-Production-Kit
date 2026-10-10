// Read-only Stage12 terminal orphan diagnosis. Without a journal the lock's
// owner cannot be proved: this module NEVER authorizes unlink or retirement.
import { opendir } from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectPath } from './safe-path.mjs';
import { readVersionedJournalDigest } from './versioned-journal.mjs';

const MAX_ENTRIES=128;
async function entries(dir) {
  const result=[];
  const stream=await opendir(dir);
  for await (const item of stream) {
    if(result.length>=MAX_ENTRIES) {
      const err=new Error('E_ORPHAN_LIST_LIMIT');
      err.code='E_ORPHAN_LIST_LIMIT';throw err;
    }
    result.push({name:item.name,file:item.isFile(),link:item.isSymbolicLink()});
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name));
}
export function classifyTerminalOrphan({
  projectNames,stateNames,journalPresent,regularLock
}={}) {
  if(!Array.isArray(projectNames)||!Array.isArray(stateNames)||
    typeof journalPresent!=='boolean')return 'UNPROVEN_SNAPSHOT';
  if(journalPresent)return 'JOURNAL_PRESENT_USE_RECOVERY_PLAN';
  if(projectNames.length!==1||projectNames[0]!=='.vcp')
    return 'FOREIGN_OR_UNMANAGED_CONTENT';
  if(stateNames.length===0)return 'EMPTY_STATE_UNPROVEN_OWNER';
  if(stateNames.length===1&&stateNames[0]==='update.lock'&&regularLock===true)
    return 'ORPHAN_LOCK_MANUAL_REVIEW_ONLY';
  return 'UNRECOGNIZED_CONTROL_RESIDUE';
}
export async function inspectTerminalOrphan(rootPath) {
  const root=path.resolve(rootPath??'.');
  const base={root,readOnly:true,writeAuthorized:false,
    retirementAuthorized:false};
  try {
    await resolveProjectPath(root,'.vcp/.__orphan_probe__',{
      purpose:'managed-state'
    });
    const [project,state]=await Promise.all([
      entries(root),entries(path.join(root,'.vcp'))
    ]);
    const journalPresent=(await readVersionedJournalDigest(root))!==null;
    const lock=state.find(item=>item.name==='update.lock');
    return Object.freeze({...base,journalPresent,
      classification:classifyTerminalOrphan({
        projectNames:project.map(x=>x.name),
        stateNames:state.map(x=>x.name),
        journalPresent,regularLock:Boolean(lock?.file&&!lock?.link)
      }),
      observedControlCount:state.length});
  }catch(error) {
    return Object.freeze({...base,classification:'BLOCKED',
      reason:error?.code??'E_ORPHAN_UNVERIFIED'});
  }
}
