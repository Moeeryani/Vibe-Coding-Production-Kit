// Stage13 section-file replacement: ATOMIC RETENTION, NOT AUTHORITY.
// A Linux RENAME_EXCHANGE preserves BOTH inodes: original document moved
// into the owned stage slot, candidate document moved to the project path.
// This avoids destructive rename-replace but does not itself defeat another
// user process that can race on the same directory. Until an independently
// accepted OS-enforced exclusive-writer isolation backend is installed,
// this operation is deliberately unavailable even after user consent.
import {createHash} from 'node:crypto';
import path from 'node:path';
import {readProjectBytes} from './safe-read.mjs';
import {validateStage13Transaction} from './stage13-transaction.mjs';
import {exactNativeIdentity} from './stage13-identity.mjs';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function deny(code){const e=new Error(code);e.code=code;throw e;}
// Intentionally no exported minting function: an untrusted JSON receipt or
// caller-supplied "MAC verified" boolean MUST NOT produce writer authority.
// A genuine native, privileged isolation backend must be integrated here
// and independently approved before any function can mint a token.
const kernelVerifiedIsolation=new WeakSet();
function requireEnforcedIsolation(token) {
  if(!token||typeof token!=='object'||!kernelVerifiedIsolation.has(token))
    deny('E_STAGE13_SECTION_OS_ISOLATION_UNPROVEN');
}
const stageRel=(id,relative)=>'.vcp/stage/'+id+'/files/'+relative;
export function previewStage13SectionExchange(tx,relative,{
  originalBytes,stagedBytes
}={}) {
  validateStage13Transaction(tx);
  const item=tx.items.find(i=>i.path===relative);
  if(!item||item.kind!=='managed-section')
    deny('E_STAGE13_NOT_AN_OWNED_SECTION');
  if(!Buffer.isBuffer(originalBytes)||!Buffer.isBuffer(stagedBytes)||
     sha(originalBytes)!==item.oldSha256||
     sha(stagedBytes)!==item.newSha256)
    deny('E_STAGE13_SECTION_BYTES_UNPROVEN');
  return Object.freeze({
    classification:'NATIVE_EXCHANGE_PREVIEW_ONLY',stage:13,
    relative,readOnly:true,executionAuthorized:false,
    preservedOriginalSha256:item.oldSha256,
    stagedSha256:item.newSha256,
    originalInode:item.originalIno,stagedInode:item.stagedIno,
    requiresNativeExchange:true,requiresExclusiveWriterIsolation:true,
    displacedOriginalRetainedAt:stageRel(tx.id,relative)
  });
}
export async function exchangeStage13Section({
  targetDir,transaction,relative,ownedLock,
  kernelIsolationToken=null,provider=new LinuxFsProvider()
}={}) {
  assertManagedMigrationGate(); // Never examine/mutate project before D-01.
  requireEnforcedIsolation(kernelIsolationToken);
  validateStage13Transaction(transaction);
  const root=path.resolve(targetDir??'.');
  if(ownedLock?.root!==root||ownedLock.mode!=='adopt'||
     ownedLock.released||transaction.phase!=='applying')
    deny('E_STAGE13_SECTION_NOT_LOCKED');
  const item=transaction.items.find(i=>i.path===relative);
  if(!item||item.kind!=='managed-section')
    deny('E_STAGE13_NOT_AN_OWNED_SECTION');
  const staged=stageRel(transaction.id,relative);
  const [userBytes,candidate,backup]=await Promise.all([
    readProjectBytes(root,relative,{maxBytes:4*1024*1024}),
    readProjectBytes(root,staged,{managedState:true,maxBytes:4*1024*1024}),
    readProjectBytes(root,'.vcp/backups/'+transaction.id+
      '/preimages/'+relative,{managedState:true,maxBytes:4*1024*1024})
  ]);
  if(sha(userBytes)!==item.oldSha256||
     sha(backup)!==item.oldSha256||
     sha(candidate)!==item.newSha256)
    deny('E_STAGE13_SECTION_PREEXCHANGE_CHANGED');
  const [oldIdentity,newIdentity]=await Promise.all([
    provider.statIdentity(root,relative),
    provider.statIdentity(root,staged)
  ]);
  const before=exactNativeIdentity(oldIdentity,{type:'file'});
  const staging=exactNativeIdentity(newIdentity,{type:'file'});
  if(before.dev!==item.originalDev||before.ino!==item.originalIno||
     staging.dev!==item.stagedDev||staging.ino!==item.stagedIno)
    deny('E_STAGE13_SECTION_PREEXCHANGE_IDENTITY_CHANGED');
  const swapped=await provider.exchangeNames(root,staged,relative);
  if(swapped?.srcParentSynced!==true||swapped?.dstParentSynced!==true)
    deny('E_STAGE13_SECTION_EXCHANGE_SYNC_UNPROVEN');
  const [installed,displaced]=await Promise.all([
    readProjectBytes(root,relative,{maxBytes:4*1024*1024}),
    readProjectBytes(root,staged,{managedState:true,maxBytes:4*1024*1024})
  ]);
  const [now,retained]=await Promise.all([
    provider.statIdentity(root,relative),
    provider.statIdentity(root,staged)
  ]);
  const n=exactNativeIdentity(now,{type:'file'});
  const p=exactNativeIdentity(retained,{type:'file'});
  if(sha(installed)!==item.newSha256||
     sha(displaced)!==item.oldSha256||
     n.dev!==item.stagedDev||n.ino!==item.stagedIno||
     p.dev!==item.originalDev||p.ino!==item.originalIno)
    deny('E_STAGE13_EXCHANGED_BYTES_RETAINED_FOR_REVIEW');
  return Object.freeze({
    operation:'NATIVE_SECTION_EXCHANGE',stage:13,relative,
    originalRetained:true,originalStagePath:staged,
    installedSha256:item.newSha256
  });
}
