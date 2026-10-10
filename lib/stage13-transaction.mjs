// Stage13 brownfield adoption write-ahead descriptor (format v3).
// Self-contained identity and read-only transitions. No public v2 journal
// decoder may mistake this for a greenfield init or schema migration.
import {createHash} from 'node:crypto';
import {validManagedRelative} from './manifest-v2.mjs';

const DIGEST=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PHASES=['snapshotted','staged','applying','verified','committed',
  'restoring','restored'];
const TRANSITIONS={
  snapshotted:['staged','restoring'],
  staged:['applying','restoring'],
  applying:['verified','restoring'],
  verified:['committed','restoring'],
  committed:[],restoring:['restored'],restored:[]
};
const KEYS=new Set(['formatVersion','operation','id','rootIdentity',
  'consentFingerprint','manifestSha256','createdAt','phase',
  'previousVcpAbsent','items','minimumReaderVersion']);
function refuse(code){const e=new Error(code);e.code=code;throw e;}
function record(v){return v&&typeof v==='object'&&!Array.isArray(v);}
const sha=b=>createHash('sha256').update(b).digest('hex');
export function describeStage13Transaction({id,rootIdentity,consentFingerprint,
  manifestSha256,minimumReaderVersion,createdAt,phase,items}={}) {
  return Object.freeze({
    formatVersion:3,operation:'adopt',id,rootIdentity,
    consentFingerprint,manifestSha256,minimumReaderVersion,createdAt,
    previousVcpAbsent:true,phase,
    items:Array.isArray(items)?items.map(x=>({...x})):items
  });
}
export function validateStage13Transaction(value) {
  if(!record(value)||Object.keys(value).some(k=>!KEYS.has(k))||
    value.formatVersion!==3||value.operation!=='adopt'||
    !ID.test(value.id??'')||!DIGEST.test(value.consentFingerprint??'')||
    !DIGEST.test(value.manifestSha256??'')||
    !DIGEST.test(value.rootIdentity??'')||
    !/^\d{4}-\d{2}-\d{2}T/.test(value.createdAt??'')||
    typeof value.minimumReaderVersion!=='string'||
    value.previousVcpAbsent!==true||!PHASES.includes(value.phase)||
    !Array.isArray(value.items)||value.items.length<1||
    value.items.length>64)refuse('E_STAGE13_TRANSACTION_FORMAT');
  const names=new Set();
  for(const item of value.items) {
    if(!record(item)||Object.keys(item).some(k=>![
      'path','kind','oldSha256','newSha256','baselineSha256','sectionId',
      'oldMode'].includes(k))||
      !validManagedRelative(item.path)||
      !['whole-file','managed-section'].includes(item.kind)||
      !DIGEST.test(item.newSha256??'')||
      !DIGEST.test(item.baselineSha256??'')||
      (item.kind==='whole-file'&&
        (item.oldSha256!==null||item.sectionId!==undefined))||
      (item.kind==='managed-section'&&
        (!DIGEST.test(item.oldSha256??'')||
         !/^[a-z0-9-]{1,64}$/.test(item.sectionId??'')||
         !Number.isInteger(item.oldMode)||item.oldMode<0||
         item.oldMode>0o777)))refuse('E_STAGE13_TRANSACTION_ITEM');
    const fold=item.path.normalize('NFC').toLowerCase();
    if(names.has(fold))refuse('E_STAGE13_TRANSACTION_ALIAS');
    names.add(fold);
  }
  for(const name of names) {
    let ancestor=name;
    while(ancestor.includes('/')) {
      ancestor=ancestor.slice(0,ancestor.lastIndexOf('/'));
      if(names.has(ancestor))refuse('E_STAGE13_TRANSACTION_ALIAS');
    }
  }
  return Object.freeze({operation:'adopt',phase:value.phase,
    id:value.id,items:value.items.length,writeAuthorized:false});
}
export function assertStage13TransactionTransition(previous,next) {
  validateStage13Transaction(next);
  if(previous===null) {
    if(next.phase!=='snapshotted')refuse('E_STAGE13_FIRST_PHASE');
    return Object.freeze({from:null,to:next.phase});
  }
  validateStage13Transaction(previous);
  if(!TRANSITIONS[previous.phase]?.includes(next.phase))
    refuse('E_STAGE13_BAD_TRANSITION');
  for(const key of ['id','rootIdentity','consentFingerprint',
    'manifestSha256','minimumReaderVersion','createdAt',
    'previousVcpAbsent']) {
    if(previous[key]!==next[key])refuse('E_STAGE13_CHANGED_IDENTITY');
  }
  if(sha(JSON.stringify(previous.items))!==sha(JSON.stringify(next.items)))
    refuse('E_STAGE13_CHANGED_LEDGER');
  return Object.freeze({from:previous.phase,to:next.phase});
}
export function stage13LedgerFromTarget(prepared,{id,rootIdentity,
  createdAt=new Date().toISOString()}={}) {
  if(!prepared?.postimages||!prepared?.baselines||!prepared?.manifestBytes)
    refuse('E_STAGE13_UNPREPARED_LEDGER');
  const items=[...prepared.postimages].map(([p,f])=>({
    path:p,kind:f.kind,oldSha256:f.priorPresent?f.priorHash:null,
    newSha256:f.postHash,baselineSha256:sha(prepared.baselines.get(p)),
    ...(f.kind==='managed-section'?{sectionId:f.sectionId,
      oldMode:prepared.manifest.managedFiles[p].mode}: {})
  })).sort((a,b)=>a.path.localeCompare(b.path));
  const descriptor=describeStage13Transaction({
    id,rootIdentity,createdAt,consentFingerprint:prepared.planFingerprint,
    manifestSha256:sha(prepared.manifestBytes),
    minimumReaderVersion:prepared.readerVersion,
    phase:'snapshotted',items
  });
  validateStage13Transaction(descriptor);
  return descriptor;
}
