// D-01 Windows disposable NTFS namespace inventory: strict READ-ONLY
// receipts and comparisons. Inventories do not authorize a single writer.
// A matching point-in-time tree is NOT a crash durability or race proof.
const H24=/^[0-9a-f]{24}$/;
const H64=/^[0-9a-f]{64}$/;
const PART=/^[A-Za-z0-9_.+-]{1,96}$/;
const FIXED=new Set(['kind','status','variant','rootIdentity',
  'projectIdentity','rootAttributes','projectAttributes',
  'rootSecuritySha256','projectSecuritySha256',
  'entries','entryCount','fileBytesHashed',
  'maxEntries','maxDepth','maxSingleFileBytes','maxTotalFileBytes',
  'readOnly','sharesDelete','reparseEntriesRejected',
  'alternateDataStreamsRejected','ownerGroupDaclFingerprintMeasured',
  'hardlinkedFilesRejected','namespaceSnapshotAtomic',
  'publishedOldCliExecutionProven','WindowsNamespaceDurabilityProven',
  'managedMutationAuthorized','d01Approved']);
const ENTRY_KEYS=new Set(['path','type','identity','sha256','size',
  'attributes','securitySha256']);
const ATTRIBUTES=x=>Number.isSafeInteger(x)&&x>=0&&x<=0xffffffff;
function refuse(code){const e=new Error(code);e.code=code;throw e;}
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(x,key)=>Object.hasOwn(x,key);
function validPath(p){
  if(typeof p!=='string'||p.length>200||
     p.includes('..')||p.includes('\\'))return false;
  const names=p.split('/');
  return names.length<=10&&names.every(n=>PART.test(n)&&
    n!=='.'&&n!=='..');
}
export function validateWindowsD01NativeNamespaceInventory(value,{
  variant,rootIdentity,projectIdentity
}={}){
  if(!object(value)||Object.keys(value).some(x=>!FIXED.has(x))||
     [...FIXED].some(k=>!has(value,k))||
     value.kind!=='D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V2'||
     value.status!=='NO_GO'||
     !['with-manifest','without-manifest'].includes(value.variant)||
     !H24.test(value.rootIdentity??'')||
     !H24.test(value.projectIdentity??'')||
     value.rootIdentity===value.projectIdentity||
     !ATTRIBUTES(value.rootAttributes)||
     !ATTRIBUTES(value.projectAttributes)||
     (value.rootAttributes&0x10)===0||
     (value.projectAttributes&0x10)===0||
     (value.rootAttributes&0x400)!==0||
     (value.projectAttributes&0x400)!==0||
     !H64.test(value.rootSecuritySha256??'')||
     !H64.test(value.projectSecuritySha256??'')||
     !Array.isArray(value.entries)||
     value.entries.length>512||
     value.entryCount!==value.entries.length||
     !Number.isInteger(value.fileBytesHashed)||
     value.fileBytesHashed<0||value.fileBytesHashed>2097152||
     value.maxEntries!==512||value.maxDepth!==10||
     value.maxSingleFileBytes!==131072||
     value.maxTotalFileBytes!==2097152||
     value.readOnly!==true||value.sharesDelete!==true||
     value.reparseEntriesRejected!==true||
     value.hardlinkedFilesRejected!==true||
     value.alternateDataStreamsRejected!==true||
     value.ownerGroupDaclFingerprintMeasured!==true||
     value.namespaceSnapshotAtomic!==false||
     value.publishedOldCliExecutionProven!==false||
     value.WindowsNamespaceDurabilityProven!==false||
     value.managedMutationAuthorized!==false||
     value.d01Approved!==false)
    refuse('E_D01_WINDOWS_INVENTORY_INVALID');
  if(variant!==undefined&&variant!==value.variant||
     rootIdentity!==undefined&&rootIdentity!==value.rootIdentity||
     projectIdentity!==undefined&&projectIdentity!==value.projectIdentity)
    refuse('E_D01_WINDOWS_INVENTORY_FIXTURE_MISMATCH');
  let total=0;
  let prior='';
  const known=new Map();
  const lowercase=new Set();
  // Root and project handles are distinct namespace objects and may not
  // alias an enumerated child identity in a complete NTFS receipt.
  const identities=new Set([value.rootIdentity,value.projectIdentity]);
  const entries=[];
  for(const entry of value.entries){
    if(!object(entry)||Object.keys(entry).some(x=>!ENTRY_KEYS.has(x))||
       [...ENTRY_KEYS].some(k=>!has(entry,k))||
       !validPath(entry.path)||entry.path<=prior||
       !['file','directory'].includes(entry.type)||
       !H24.test(entry.identity??'')||
       !ATTRIBUTES(entry.attributes)||
       !H64.test(entry.securitySha256??'')||
       ((entry.attributes&0x400)!==0)||
       ((entry.attributes&0x10)!==0)!==(entry.type==='directory')||
       !Number.isInteger(entry.size)||entry.size<0||
       entry.size>131072||
       (entry.type==='directory'
         ?entry.sha256!==null||entry.size!==0
         :!H64.test(entry.sha256??'')))
      refuse('E_D01_WINDOWS_INVENTORY_ENTRY_INVALID');
    prior=entry.path;
    const normalized=entry.path.toLowerCase();
    if(lowercase.has(normalized)||identities.has(entry.identity))
      refuse('E_D01_WINDOWS_INVENTORY_DUPLICATE');
    lowercase.add(normalized);
    identities.add(entry.identity);
    const segments=entry.path.split('/');
    if(segments.length>1){
      const parent=segments.slice(0,-1).join('/');
      if(known.get(parent)!=='directory')
        refuse('E_D01_WINDOWS_INVENTORY_ORPHAN');
    }
    known.set(entry.path,entry.type);
    if(entry.type==='file')total+=entry.size;
    entries.push(Object.freeze({...entry}));
  }
  if(total!==value.fileBytesHashed)
    refuse('E_D01_WINDOWS_INVENTORY_INCOMPLETE');
  // Do not demand AGENTS.md or manifest in an AFTER snapshot: removal
  // is exactly the evidence an old-CLI mutation detector must surface.
  return Object.freeze({
    kind:'D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_REVIEW_V1',
    status:'NO_GO',variant:value.variant,
    rootIdentity:value.rootIdentity,
    projectIdentity:value.projectIdentity,
    rootAttributes:value.rootAttributes,
    projectAttributes:value.projectAttributes,
    rootSecuritySha256:value.rootSecuritySha256,
    projectSecuritySha256:value.projectSecuritySha256,
    entries:Object.freeze(entries),
    entryCount:entries.length,fileBytesHashed:total,
    claimedReadOnly:true,
    claimedAlternateStreamsRejected:true,
    claimedOwnerGroupDaclMeasured:true,
    independentNativeExecutionVerified:false,
    atomicNamespaceViewProven:false,
    privilegedOldCliDeniedProven:false,
    WindowsNamespaceDurabilityProven:false,
    safeToRetry:false,safeToDelete:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
export function compareWindowsD01NamespaceInventories({
  before,after,variant,rootIdentity,projectIdentity
}={}){
  const a=validateWindowsD01NativeNamespaceInventory(before,{
    variant,rootIdentity,projectIdentity
  });
  const b=validateWindowsD01NativeNamespaceInventory(after,{
    variant,rootIdentity,projectIdentity
  });
  if(a.variant!==b.variant||a.rootIdentity!==b.rootIdentity||
     a.projectIdentity!==b.projectIdentity)
    refuse('E_D01_WINDOWS_INVENTORY_CROSS_FIXTURE');
  const starting=new Map(a.entries.map(e=>[e.path,e.type]));
  if(starting.get('AGENTS.md')!=='file'||
     starting.get('.vcp')!=='directory'||
     (a.variant==='with-manifest'
       ?starting.get('.vcp/manifest.json')!=='file'
       :starting.has('.vcp/manifest.json')))
    refuse('E_D01_WINDOWS_INVENTORY_BAD_BASELINE');
  const prior=new Map(a.entries.map(e=>[e.path,e]));
  const next=new Map(b.entries.map(e=>[e.path,e]));
  const created=[...next.keys()].filter(p=>!prior.has(p)).sort();
  const removed=[...prior.keys()].filter(p=>!next.has(p)).sort();
  const changed=[];
  for(const [p,entry] of prior){
    const current=next.get(p);
    if(current&&(entry.type!==current.type||
       entry.identity!==current.identity||
       entry.size!==current.size||
       entry.attributes!==current.attributes||
       entry.securitySha256!==current.securitySha256||
       entry.sha256!==current.sha256))
      changed.push(p);
  }
  changed.sort();
  const rootMetadataChanged=a.rootAttributes!==b.rootAttributes||
    a.rootSecuritySha256!==b.rootSecuritySha256;
  const projectMetadataChanged=
    a.projectAttributes!==b.projectAttributes||
    a.projectSecuritySha256!==b.projectSecuritySha256;
  return Object.freeze({
    kind:'D01_WINDOWS_NAMESPACE_BEFORE_AFTER_V1',
    status:'NO_GO',
    variant:a.variant,rootIdentity:a.rootIdentity,
    projectIdentity:a.projectIdentity,
    createdPaths:Object.freeze(created),
    removedPaths:Object.freeze(removed),
    alteredPaths:Object.freeze(changed),
    rootMetadataChanged,projectMetadataChanged,
    namespaceUnchangedObserved:
      created.length===0&&removed.length===0&&changed.length===0&&
      !rootMetadataChanged&&!projectMetadataChanged,
    entryCountBefore:a.entryCount,entryCountAfter:b.entryCount,
    nativeReceiptProvenanceAttested:false,
    capturedAtomically:false,
    transientMutationsBetweenCapturesRuledOut:false,
    publishedOldCliWritePathDeniedProven:false,
    parentNamespaceProtectedProven:false,
    WindowsNamespaceDurabilityProven:false,
    safeToRetry:false,safeToDelete:false,safeToCleanup:false,
    managedMutationAuthorized:false,d01Approved:false
  });
}
