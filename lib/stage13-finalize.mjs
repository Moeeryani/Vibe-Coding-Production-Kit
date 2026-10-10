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
export async function inspectCommittedStage13(root,tx) {
  validateStage13Transaction(tx);
  if(tx.phase!=='committed')deny('E_STAGE13_NOT_COMMITTED');
  const inspected=[];
  for(const entry of tx.items) {
    await checkOwnedBytes(root,entry.path,entry.newSha256);
    await checkOwnedBytes(root,'.vcp/baselines/'+entry.path,
      entry.baselineSha256);
    inspected.push({path:entry.path,postSha256:entry.newSha256,
      baselineSha256:entry.baselineSha256});
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
  if(ownedLock?.root!==root||ownedLock?.mode!=='adopt'||
     ownedLock?.released===true)deny('E_STAGE13_OWNED_LOCK_REQUIRED');
  const present=await inspectCommittedStage13(root,tx);
  if(present.classification!=='COMMITTED_MATCHES')
    deny('E_STAGE13_COMMIT_UNPROVEN');
  // Stage files are exact duplicates of already-committed project bytes.
  // Every removal compares the digest; unknown files are NEVER unlinked.
  const directories=new Set(['.vcp/stage/'+tx.id+'/files',
    '.vcp/stage/'+tx.id,'.vcp/stage']);
  for(const entry of tx.items) {
    const rel=stagePath(tx.id,entry.path);
    const data=await checkOwnedBytes(root,rel,entry.newSha256,{optional:true});
    if(data!==null)await provider.deleteFile(root,rel);
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
  await inspectCommittedStage13(root,tx);
  const journal=Buffer.from(JSON.stringify(tx,null,2)+'\n');
  await checkOwnedBytes(root,'.vcp/transaction.json',hash(journal));
  await provider.deleteFile(root,'.vcp/transaction.json');
  return Object.freeze({classification:'COMMITTED_FINALIZED',
    restoredState:'MANAGED',journalCleared:true,
    ownershipRetained:true,verifiedFiles:tx.items.length});
}
