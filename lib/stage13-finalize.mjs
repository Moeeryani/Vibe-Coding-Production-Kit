// Stage13 committed-adoption finalization: exact ownership, no recursive rm.
// The committed journal is the last file removed, so a crash can resume
// from complete v3 metadata instead of leaving an uninterpretable partial.
import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import {validateStage13Transaction} from './stage13-transaction.mjs';
import {readProjectBytes} from './safe-read.mjs';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';
import {exactNativeIdentity} from './stage13-identity.mjs';

const hash=buf=>createHash('sha256').update(buf).digest('hex');
function deny(code){const e=new Error(code);e.code=code;throw e;}
function stagePath(id,relative){return '.vcp/stage/'+id+'/files/'+relative;}
async function checkOwnedBytes(root,relative,expected,{optional=false}={}) {
  const data=await readProjectBytes(root,relative,{
    managedState:relative.startsWith('.vcp/'),maxBytes:8*1024*1024,optional
  });
  if(data===null) {
    if(optional)return null;
    deny('E_STAGE13_EXPECTED_FILE_MISSING');
  }
  if(hash(data)!==expected)deny('E_STAGE13_FILE_MODIFIED');
  return data;
}
async function sectionDisplacedEvidence(root,tx,entry,provider) {
  const staged=stagePath(tx.id,entry.path);
  const archived='.vcp/backups/'+tx.id+'/displaced/'+entry.path;
  const found=[];
  for(const candidate of [staged,archived]) {
    const data=await readProjectBytes(root,candidate,{
      managedState:true,optional:true,maxBytes:8*1024*1024
    });
    if(data===null)continue;
    const native=exactNativeIdentity(
      await provider.statIdentity(root,candidate),{type:'file'});
    if(hash(data)!==entry.oldSha256||
       native.dev!==entry.originalDev||
       native.ino!==entry.originalIno)
      deny('E_STAGE13_DISPLACED_SECTION_CHANGED');
    found.push(candidate);
  }
  if(found.length!==1)deny('E_STAGE13_DISPLACED_SECTION_UNPROVEN');
  return Object.freeze({source:found[0],destination:archived});
}
async function prepareDisplacedDirectory(root,provider,id,relative) {
  const base='.vcp/backups/'+id+'/displaced';
  const dirs=[base];
  let next=base;
  for(const segment of relative.split('/').slice(0,-1)) {
    next+='/'+segment;dirs.push(next);
  }
  for(const dir of dirs) {
    const absolute=path.join(root,...dir.split('/'));
    let current;
    try{current=await lstat(absolute);}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(current) {
      if(!current.isDirectory()||current.isSymbolicLink())
        deny('E_STAGE13_DISPLACED_DIRECTORY_COLLISION');
      continue;
    }
    const made=await provider.createDirectory(root,dir,0o700);
    if(made?.directorySynced!==true)
      deny('E_STAGE13_DISPLACED_DIRECTORY_DURABILITY');
  }
}
export async function inspectCommittedStage13(root,tx,{
  provider=new LinuxFsProvider()
}={}) {
  validateStage13Transaction(tx);
  if(tx.phase!=='committed')deny('E_STAGE13_NOT_COMMITTED');
  const inspected=[];
  for(const entry of tx.items) {
    await checkOwnedBytes(root,entry.path,entry.newSha256);
    if(entry.kind==='whole-file'||entry.kind==='managed-section') {
      const info=exactNativeIdentity(
        await provider.statIdentity(root,entry.path),{type:'file'});
      if(info.dev!==entry.stagedDev||info.ino!==entry.stagedIno)
        deny('E_STAGE13_CLAIM_OWNERSHIP_CHANGED');
    }
    if(entry.kind==='managed-section')
      await sectionDisplacedEvidence(root,tx,entry,provider);
    await checkOwnedBytes(root,'.vcp/baselines/'+entry.path,
      entry.baselineSha256);
    inspected.push({path:entry.path,postSha256:entry.newSha256,
      baselineSha256:entry.baselineSha256});
  }
  for(const directory of tx.createdDirectories) {
    const at=exactNativeIdentity(
      await provider.statIdentity(root,directory.path),{type:'dir'});
    if(at.dev!==directory.dev||at.ino!==directory.ino)
      deny('E_STAGE13_CREATED_DIRECTORY_CHANGED');
  }
  await checkOwnedBytes(root,'.vcp/manifest.json',tx.manifestSha256);
  return Object.freeze({readOnly:true,classification:'COMMITTED_MATCHES',
    writerAuthorized:false,verified:inspected.length,txId:tx.id,
    ledger:inspected});
}
export async function finishCommittedStage13(rootPath,tx,{
  provider=new LinuxFsProvider(),ownedLock=null
}={}) {
  assertManagedMigrationGate(); // prewrite fence before touching project
  const root=path.resolve(rootPath);
  if(ownedLock?.root!==root||
     !['adopt','recovery'].includes(ownedLock?.mode)||
     ownedLock?.released===true)deny('E_STAGE13_OWNED_LOCK_REQUIRED');
  const present=await inspectCommittedStage13(root,tx,{provider});
  if(present.classification!=='COMMITTED_MATCHES')
    deny('E_STAGE13_COMMIT_UNPROVEN');
  // Stage files are exact duplicates of already-committed project bytes.
  // Every removal compares the digest; unknown files are NEVER unlinked.
  const directories=new Set(['.vcp/stage/'+tx.id+'/files',
    '.vcp/stage/'+tx.id+'/dirs',
    '.vcp/stage/'+tx.id,'.vcp/stage']);
  // When a nested subtree was atomically moved into the project, its
  // temporary parent directory (e.g. dirs/.github) can remain empty.
  // Remove only exact staging directories, deepest first; rmdir itself
  // rejects new/unrecognized files. Never recurse into user project paths.
  for(const item of tx.createdDirectories) {
    let candidate=path.posix.dirname(item.path);
    while(candidate!=='.'){
      directories.add('.vcp/stage/'+tx.id+'/dirs/'+candidate);
      candidate=path.posix.dirname(candidate);
    }
  }
  for(const entry of tx.items) {
    const rel=stagePath(tx.id,entry.path);
    if(entry.kind==='managed-section') {
      const evidence=await sectionDisplacedEvidence(root,tx,entry,provider);
      if(evidence.source===rel) {
        await prepareDisplacedDirectory(root,provider,tx.id,entry.path);
        const moved=await provider.moveNoReplace(root,rel,evidence.destination);
        if(moved?.srcParentSynced!==true||moved?.dstParentSynced!==true)
          deny('E_STAGE13_DISPLACED_ARCHIVE_UNDURABLE');
        await sectionDisplacedEvidence(root,tx,entry,provider);
      }
    }else {
      const data=await checkOwnedBytes(root,rel,entry.newSha256,{
        optional:true
      });
      if(data!==null) {
        const removed=await provider.deleteFile(root,rel);
        if(removed?.directorySynced!==true)
          deny('E_STAGE13_STAGED_FILE_REMOVAL_UNDURABLE');
      }
    }
    let parent=path.posix.dirname(rel);
    while(parent.startsWith('.vcp/stage/'+tx.id+'/files/')){
      directories.add(parent);parent=path.posix.dirname(parent);
    }
  }
  for(const dir of [...directories].sort((a,b)=>
    b.split('/').length-a.split('/').length||b.localeCompare(a))) {
    let stat;
    try{stat=await lstat(path.join(root,...dir.split('/')));}
    catch(e){if(e.code!=='ENOENT')throw e;}
    if(stat) {
      if(!stat.isDirectory()||stat.isSymbolicLink())
        deny('E_STAGE13_STAGING_CHANGED');
      // Kernel refuses deletion of a nonempty directory. Never recurse.
      await provider.removeEmptyDirectory(root,dir);
    }
  }
  // The committed manifest and all baselines must still match before
  // destroying the journal's only replay identity.
  await inspectCommittedStage13(root,tx,{provider});
  const journal=Buffer.from(JSON.stringify(tx,null,2)+'\n');
  await checkOwnedBytes(root,'.vcp/transaction.json',hash(journal));
  await provider.deleteFile(root,'.vcp/transaction.json');
  return Object.freeze({classification:'COMMITTED_FINALIZED',
    restoredState:'MANAGED',journalCleared:true,
    ownershipRetained:true,verifiedFiles:tx.items.length});
}
