// Bounded, no-follow read-only inventory for an interrupted first init.
// A recovery operation must not start deleting unless *every* observed path
// is among its owned files/directories or the known recovery control surface.
import { lstat, opendir } from 'node:fs/promises';
import path from 'node:path';

const MAX_ENTRIES=30000;
function fail(code){const e=new Error(code);e.code=code;throw e;}
const components=relative=>typeof relative==='string'&&relative.length<=512&&
  relative.split('/').every(x=>x&&x!=='.'&&x!=='..'&&!x.includes(':')&&
    x.toLowerCase()!=='.git'&&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\\..*)?$/i.test(x)&&
    !x.includes(String.fromCharCode(0))&&!x.includes(String.fromCharCode(92))&&
    !/[. ]$/.test(x));
export function describeRecoveryOwnedTree(backupId,createdPaths=[]) {
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(backupId))fail('E_INVENTORY_BACKUP_ID');
  if(!Array.isArray(createdPaths)||createdPaths.length>10000)fail('E_INVENTORY_LEDGER');
  const files=new Set([
    '.vcp/transaction.json','.vcp/update.lock',
    '.vcp/backups/'+backupId+'/backup.json'
  ]);
  // Recovery ownership must be portable: the same paths cannot change their
  // meaning on Windows/macOS or when used as both files and parent folders.
  const canonical=new Set([...files].map(x=>x.normalize('NFC').toLowerCase()));
  for(const relative of createdPaths) {
    if(!components(relative)||files.has(relative))fail('E_INVENTORY_LEDGER_PATH');
    const folded=relative.normalize('NFC').toLowerCase();
    if(canonical.has(folded))fail('E_INVENTORY_LEDGER_PATH');
    canonical.add(folded);
    files.add(relative);
  }
  for(const name of canonical) {
    let parent=name;
    while(parent.includes('/')) {
      parent=parent.slice(0,parent.lastIndexOf('/'));
      if(canonical.has(parent))fail('E_INVENTORY_FILE_DIRECTORY_COLLISION');
    }
  }
  const dirs=new Set([
    '.vcp','.vcp/backups','.vcp/backups/'+backupId,
    '.vcp/backups/'+backupId+'/files'
  ]);
  for(const relative of files) {
    const parts=relative.split('/');
    for(let i=1;i<parts.length;i++)dirs.add(parts.slice(0,i).join('/'));
  }
  for(const d of dirs)if(files.has(d))fail('E_INVENTORY_FILE_DIRECTORY_COLLISION');
  return {files,dirs};
}
export async function inspectRecoveryOwnedTree(root,backupId,createdPaths=[]) {
  const {files,dirs}=describeRecoveryOwnedTree(backupId,createdPaths);
  const issues=[];
  const pending=[''];
  let visited=0;
  while(pending.length) {
    const current=pending.pop();
    const directory=current?path.join(root,...current.split('/')):path.resolve(root);
    const stat=await lstat(directory);
    if(!stat.isDirectory()||stat.isSymbolicLink()) {
      issues.push({path:current||'.',reason:'UNSAFE_DIRECTORY'});
      continue;
    }
    // Stream directory entries: readdir() materializes an attacker-sized
    // array before the 30,000-entry bound is enforced.
    const handle=await opendir(directory);
    for await (const entry of handle) {
      if(++visited>MAX_ENTRIES)fail('E_INVENTORY_LIMIT');
      const relative=current?current+'/'+entry.name:entry.name;
      if(!components(relative)) {
        issues.push({path:relative,reason:'INVALID_PATH'});
        continue;
      }
      if(entry.isSymbolicLink()) {
        issues.push({path:relative,reason:'SYMLINK_PRESENT'});
        continue;
      }
      if(entry.isDirectory()) {
        if(!dirs.has(relative))issues.push({path:relative,reason:'UNEXPECTED_DIRECTORY'});
        else pending.push(relative);
      } else if(entry.isFile()) {
        if(!files.has(relative))issues.push({path:relative,reason:'UNEXPECTED_FILE'});
      } else {
        issues.push({path:relative,reason:'UNSUPPORTED_FILE_TYPE'});
      }
      if(issues.length>=25)return {complete:false,issues,visited};
    }
  }
  return {complete:issues.length===0,issues,visited};
}
