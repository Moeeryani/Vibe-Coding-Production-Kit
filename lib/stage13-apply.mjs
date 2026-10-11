// Stage13 Smart Init Apply, gated construction candidate.
// Complete write-ahead setup and ownership-aware claim path. Existing
// user-document replacement remains fail-closed until an OS-enforced
// compare-and-swap / write isolation contract is independently proven.
// This module CANNOT authorize schema-v2 writes while D-01 is DEFERRED.
import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import path from 'node:path';
import {assertManagedMigrationGate} from './managed-migration.mjs';
import {acquireLifecycleLock} from './lifecycle-lock-v2.mjs';
import {planSmartInit} from './adoption-plan.mjs';
import {assessStage13Preview} from './stage13-brownfield-preflight.mjs';
import {prepareStage13Adoption} from './stage13-materialize.mjs';
import {stage13LedgerFromTarget,
  assertStage13TransactionTransition} from './stage13-transaction.mjs';
import {readProjectBytes} from './safe-read.mjs';
import {getCliVersion} from './version.mjs';
import {resolveProjectPath} from './safe-path.mjs';
import {LinuxFsProvider} from './linux-fs-provider.mjs';
import {finishCommittedStage13} from './stage13-finalize.mjs';
import {assertStage13SectionIsolationAvailable,
  exchangeStage13Section} from './stage13-section-exchange.mjs';
import {inspectStage13DirectoryTopology,
  stage13ClaimStagingPath} from './stage13-directory-ownership.mjs';
import {exactNativeIdentity,sameExactNativeIdentity} from './stage13-identity.mjs';
import {assertStage13PostLockIdentity} from './stage13-replan-contract.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function deny(code){const e=new Error(code);e.code=code;throw e;}
function requireAcknowledged(receipt) {
  if(receipt?.dataSynced!==true||receipt?.directorySynced!==true)
    deny('E_STAGE13_DURABILITY_UNPROVEN');
}
function requireMoveAcknowledged(receipt) {
  if(receipt?.srcParentSynced!==true||receipt?.dstParentSynced!==true)
    deny('E_STAGE13_NAMESPACE_DURABILITY_UNPROVEN');
}
async function createDirectoryChain(provider,root,relative,owned) {
  if(relative==='.'||relative==='')return;
  const parts=relative.split('/');
  let at='';
  for(const part of parts) {
    at=at?at+'/'+part:part;
    if(at==='.vcp'||owned.has(at))continue;
    if(at.startsWith('.vcp/')) {
      // Only known first-adoption state directories may be introduced.
      const allowed=at==='.vcp/backups'||at.startsWith('.vcp/backups/')||
        at==='.vcp/baselines'||at.startsWith('.vcp/baselines/')||
        at==='.vcp/stage'||at.startsWith('.vcp/stage/');
      if(!allowed)deny('E_STAGE13_STATE_DIRECTORY');
    }
    if(!at.startsWith('.vcp/')) {
      // Never grant authority to replace/create project-owned ancestors
      // without an independent nofollow topology proof.
      await resolveProjectPath(root,at+'/.__vcp_probe__',{purpose:'write-new'});
      let current;
      try {current=await lstat(path.join(root,...at.split('/')));}
      catch(e){if(e.code!=='ENOENT')throw e;}
      if(current){
        if(current.isSymbolicLink()||!current.isDirectory())
          deny('E_STAGE13_PARENT_UNSAFE');
        owned.add(at);continue;
      }
    }
    // Directories inside the transaction's private control prefix stay
    // mode 0700. Directories that will be atomically MOVED into the user
    // project preserve normal traversable 0755 permissions; otherwise an
    // adopted .github subtree could unexpectedly become private.
    const isFutureProjectDirectory=/^\.vcp\/stage\/[^/]+\/dirs\/.+/.test(at);
    const madeDirectory=await provider.createDirectory(root,at,
      isFutureProjectDirectory?0o755:0o700);
    if(madeDirectory?.directorySynced!==true)
      deny('E_STAGE13_DIRECTORY_DURABILITY_UNPROVEN');
    owned.add(at);
  }
}
function requireSectionWriteAuthority(prepared,sectionIsolationToken=null) {
  // Whole-file CLAIM uses O_EXCL + renameat2(NOREPLACE). In contrast,
  // replacing an existing user document by ordinary rename, even after
  // a hash check, is subject to a writer race. Do NOT ever fall back.
  if([...prepared.postimages.values()].some(v=>v.kind==='managed-section'))
    assertStage13SectionIsolationAvailable(sectionIsolationToken);
}
async function writeJournal(provider,root,descriptor,previous=null) {
  assertStage13TransactionTransition(previous,descriptor);
  const file='.vcp/transaction.json';
  if(previous!==null) {
    const bytes=await readProjectBytes(root,file,{managedState:true,maxBytes:512*1024});
    if(sha(bytes)!==sha(Buffer.from(JSON.stringify(previous,null,2)+'\n')))
      deny('E_STAGE13_JOURNAL_CHANGED');
  }
  const encoded=Buffer.from(JSON.stringify(descriptor,null,2)+'\n');
  const outcome=previous===null?
    await provider.writeFileSynced(root,file,encoded,0o600):
    await provider.replaceFileAtomic(root,file,encoded,{mode:0o600});
  requireAcknowledged(outcome);
  return descriptor;
}
async function validateStagedInputs(root,prepared) {
  for(const [relative,record] of prepared.postimages) {
    const bytes=await readProjectBytes(root,relative,{
      optional:record.kind==='whole-file',maxBytes:4*1024*1024
    });
    if(record.kind==='whole-file'&&bytes!==null)deny('E_STAGE13_CLAIM_RACED');
    if(record.kind==='managed-section'&&
      (!bytes||sha(bytes)!==record.priorHash))
      deny('E_STAGE13_SECTION_EDIT_RACED');
  }
}
export async function applyStage13SmartInit({
  targetDir,agentPreference=null,stackPreference='auto',
  githubPreference=null,adoptionApproval=null,
  sectionIsolationToken=null
}={}) {
  assertManagedMigrationGate(); // MUST precede all fs reads and mutations.
  const root=path.resolve(targetDir??'.');
  const choice={agentPreference,stackPreference,githubPreference};
  const preview=await planSmartInit(root,choice);
  if(assessStage13Preview(preview,{approval:adoptionApproval}).classification!==
    'READY_TO_REPLAN_UNDER_OWNED_LOCK')
    deny('E_STAGE13_EXPLICIT_APPROVAL_REQUIRED');
  const version=await getCliVersion();
  const pre=await prepareStage13Adoption(preview,{
    approval:adoptionApproval,readerVersion:version
  });
  requireSectionWriteAuthority(pre,sectionIsolationToken);
  const claims=[...pre.postimages].filter(([,v])=>v.kind==='whole-file')
    .map(([name])=>name);
  const preTopology=await inspectStage13DirectoryTopology(root,claims);
  const lock=await acquireLifecycleLock(root,{mode:'adopt',
    consentFingerprint:pre.planFingerprint});
  let backupStarted=false,controlWriteAttempted=false,journal=null;
  try {
    const locked=await planSmartInit(root,{
      ...choice,ownedBootstrapLock:lock
    });
    if(assessStage13Preview(locked,{approval:adoptionApproval}).classification!==
      'READY_TO_REPLAN_UNDER_OWNED_LOCK')
      deny('E_STAGE13_POSTLOCK_REPLAN_BLOCKED');
    const fresh=await prepareStage13Adoption(locked,{
      approval:adoptionApproval,readerVersion:version
    });
    assertStage13PostLockIdentity(pre,fresh);
    requireSectionWriteAuthority(fresh,sectionIsolationToken);
    const topology=await inspectStage13DirectoryTopology(root,claims);
    if(JSON.stringify(topology.projectRootsToMove)!==
         JSON.stringify(preTopology.projectRootsToMove)||
       JSON.stringify(topology.plannedCreatedDirectories)!==
         JSON.stringify(preTopology.plannedCreatedDirectories)||
       JSON.stringify([...topology.existingDirectories])!==
         JSON.stringify([...preTopology.existingDirectories]))
      deny('E_STAGE13_DIRECTORY_TOPOLOGY_CHANGED');
    await validateStagedInputs(root,fresh);
    const rootInfo=await lstat(root,{bigint:true});
    if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())
      deny('E_STAGE13_ROOT_CHANGED');
    const identity=sha(Buffer.from(root+'|'+rootInfo.dev+'|'+rootInfo.ino));
    const id=lock.operationId;
    if(!/^adopt-[a-f0-9]{32}$/.test(id??''))
      deny('E_STAGE13_BOOTSTRAP_OPERATION_ID');
    const provider=new LinuxFsProvider();
    const made=new Set(['.vcp']);
    const backupRoot='.vcp/backups/'+id;
    // From this point a crash or rejected syscall may leave a partial
    // private namespace before the journal exists. Preserve the exact
    // adopt lock/operation ID so the forensic bootstrap inspector can
    // attribute state without guessing or deleting user content.
    controlWriteAttempted=true;
    await createDirectoryChain(provider,root,backupRoot+'/preimages',made);
    await createDirectoryChain(provider,root,'.vcp/baselines',made);
    await createDirectoryChain(provider,root,'.vcp/stage/'+id,made);
    backupStarted=true;
    // Persist every original user document BEFORE writing the first user
    // path. Claims have no old bytes and are not backed up as empty files.
    for(const [relative,item] of fresh.postimages) {
      if(item.kind!=='managed-section')continue;
      const rel=backupRoot+'/preimages/'+relative;
      await createDirectoryChain(provider,root,path.posix.dirname(rel),made);
      requireAcknowledged(await provider.writeBackupData(root,rel,item.priorBytes));
    }
    // Stage under .vcp BEFORE the first user-target mutation. The same
    // inode is then moved into a CLAIM destination by kernel NOREPLACE.
    // Its device+inode is included in the durable journal, preventing a
    // byte-identical user replacement from being mistaken as our file.
    const stagedIdentities=new Map(),originalIdentities=new Map(),
      stageLocations=new Map();
    for(const [relative,item] of fresh.postimages) {
      const stage=item.kind==='managed-section'?
        '.vcp/stage/'+id+'/files/'+relative:
        stage13ClaimStagingPath(id,relative,topology);
      stageLocations.set(relative,stage);
      if(item.kind==='managed-section') {
        const orig=await provider.statIdentity(root,relative);
        exactNativeIdentity(orig,{type:'file'});
        originalIdentities.set(relative,orig);
      }
      await createDirectoryChain(provider,root,path.posix.dirname(stage),made);
      requireAcknowledged(await provider.writeFileSynced(
        root,stage,item.content,item.mode??item.oldMode??0o600));
      const staged=await provider.statIdentity(root,stage);
      exactNativeIdentity(staged,{type:'file'});
      stagedIdentities.set(relative,staged);
    }
    const createdDirectories=[];
    for(const relative of topology.plannedCreatedDirectories) {
      const directory='.vcp/stage/'+id+'/dirs/'+relative;
      const evidence=await provider.statIdentity(root,directory);
      const exact=exactNativeIdentity(evidence,{type:'dir'});
      createdDirectories.push({path:relative,kind:'stage13-created-directory',
        dev:exact.dev,ino:exact.ino});
    }
    const ledger=stage13LedgerFromTarget(fresh,{
      id,rootIdentity:identity,stagedIdentities,
      originalIdentities,createdDirectories
    });
    const metadata=Buffer.from(JSON.stringify({
      kind:'stage13-complete-recovery-point',formatVersion:3,
      id,previousVcpAbsent:true,rootIdentity:identity,
      consentFingerprint:fresh.planFingerprint,
      items:ledger.items,createdDirectories:ledger.createdDirectories,
      minimumReaderVersion:ledger.minimumReaderVersion,
      manifestSha256:ledger.manifestSha256
    },null,2)+'\n');
    requireAcknowledged(await provider.writeBackupData(root,
      backupRoot+'/backup.json',metadata));
    journal=await writeJournal(provider,root,ledger);
    journal=await writeJournal(provider,root,
      {...journal,phase:'staged'},journal);
    await validateStagedInputs(root,fresh);
    journal=await writeJournal(provider,root,
      {...journal,phase:'applying'},journal);
    // Move entire missing directory trees as atomic, exclusive namespace
    // operations. The directory and every included file retain their
    // originally journaled inode identities; no unowned parent is created
    // in the selected project and therefore no unrecorded empty directory
    // can be left by an interrupted init.
    for(const directory of topology.projectRootsToMove) {
      requireMoveAcknowledged(await provider.moveNoReplace(root,
        '.vcp/stage/'+id+'/dirs/'+directory,directory));
      const actual=await provider.statIdentity(root,directory);
      const expected=createdDirectories.find(v=>v.path===directory);
      if(!expected)deny('E_STAGE13_CREATED_DIRECTORY_CHANGED');
      sameExactNativeIdentity({devExact:expected.dev,inoExact:expected.ino,
        type:'dir'},actual,{type:'dir'});
    }
    for(const [relative,item] of fresh.postimages) {
      // Case-insensitive collisions and links checked again at the actual
      // native no-replace operation; no lstat+overwrite fallback.
      if(item.kind==='managed-section') {
        await exchangeStage13Section({targetDir:root,transaction:journal,
          relative,ownedLock:lock,kernelIsolationToken:sectionIsolationToken,
          provider});
        continue;
      }
      if(!topology.claims.find(v=>v.path===relative)?.firstMissingAncestor) {
        requireMoveAcknowledged(await provider.moveNoReplace(root,
          stageLocations.get(relative),relative));
      }
      const installed=await provider.statIdentity(root,relative);
      sameExactNativeIdentity(stagedIdentities.get(relative),installed,
        {type:'file'});
      if(installed.mode!==item.mode)
        deny('E_STAGE13_CLAIM_IDENTITY_OR_MODE_CHANGED');
    }
    for(const [relative,content] of fresh.baselines) {
      const rel='.vcp/baselines/'+relative;
      await createDirectoryChain(provider,root,path.posix.dirname(rel),made);
      requireAcknowledged(await provider.writeBackupData(root,rel,content));
    }
    requireAcknowledged(await provider.writeFileSynced(root,
      '.vcp/.gitignore',Buffer.from('backups/\nstage/\ntransaction.json\nupdate.lock\n'),0o644));
    requireAcknowledged(await provider.writeFileSynced(root,
      '.vcp/manifest.json',fresh.manifestBytes,0o600));
    const manifest=await readProjectBytes(root,'.vcp/manifest.json',{
      managedState:true,maxBytes:256*1024
    });
    if(sha(manifest)!==ledger.manifestSha256)deny('E_STAGE13_MANIFEST_CHANGED');
    journal=await writeJournal(provider,root,
      {...journal,phase:'verified'},journal);
    journal=await writeJournal(provider,root,
      {...journal,phase:'committed'},journal);
    await finishCommittedStage13(root,journal,{provider,ownedLock:lock});
    return {stage:13,classification:'COMMITTED_MANAGED',root,
      assetSet:'brownfield-minimal-v1',backupId:id,createdFiles:ledger.items.length,
      requiresIndependentAcceptance:true};
  }catch(error) {
    // DO NOT remove foreign/user files or .vcp after a failed transaction.
    // A durable backup/journal may exist: preserve it for owned recovery.
    if(controlWriteAttempted||backupStarted||journal)
      error.stage13RecoveryRequired=true;
    throw error;
  }finally{
    if(controlWriteAttempted&&journal===null) {
      // Pre-WAL interruption: retain exact lock bytes and operation ID.
      // Removing this lock would create unattributable staging residue;
      // the owner must inspect and retire it via the explicit bounded
      // orphan protocol rather than a generic lock-stealing shortcut.
    }else{
      await lock.release();
      if(!controlWriteAttempted&&!journal)
        await lock.cleanupBootstrapIfEmpty();
    }
  }
}
