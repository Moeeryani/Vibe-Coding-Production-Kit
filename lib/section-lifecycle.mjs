import crypto from 'node:crypto';
import { parseManagedSections, replaceManagedSection } from './managed-markdown.mjs';

const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function err(code){const e=new Error(code);e.code=code;throw e;}
function section(bytes,id) {
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  const locations=parseManagedSections(buffer);
  const match=locations.find(r=>r.id===id);
  if(!match)err('E_OWNED_SECTION_MISSING');
  return {buffer,body:buffer.subarray(match.contentStart,match.contentEnd),
    ownership:{kind:'managed-section',sectionId:id}};
}
export function snapshotManagedSection(document,id) {
  const result=section(document,id);
  return {kind:'managed-section',sectionId:id,baselineHash:hash(result.body),
    content:Buffer.from(result.body),documentHash:hash(result.buffer)};
}
export function planManagedSectionUpdate({currentDocument,baselineBody,desiredBody,sectionId}) {
  if(typeof sectionId!=='string'||!(/^[a-z0-9-]{1,64}$/).test(sectionId))err('E_OWNERSHIP_SECTION');
  const current=section(currentDocument,sectionId);
  const baseline=Buffer.from(baselineBody),desired=Buffer.from(desiredBody);
  const currentHash=hash(current.body),baselineHash=hash(baseline),desiredHash=hash(desired);
  const localChanged=currentHash!==baselineHash,templateChanged=desiredHash!==baselineHash;
  if(!templateChanged) {
    return {action:'KEEP',sectionId,reason:localChanged?'USER_MODIFIED':'UNCHANGED',
      currentHash,baselineHash,desiredHash,writeAuthorized:false,output:null};
  }
  if(localChanged && currentHash!==desiredHash){
    return {action:'CONFLICT',sectionId,reason:'LOCAL_AND_TEMPLATE_EDITED',
      currentHash,baselineHash,desiredHash,writeAuthorized:false,output:null};
  }
  if(currentHash===desiredHash){
    return {action:'KEEP',sectionId,reason:'ALREADY_CURRENT',
      currentHash,baselineHash,desiredHash,writeAuthorized:false,output:null};
  }
  const composed=replaceManagedSection(current.buffer,sectionId,desired);
  return {action:'UPDATE_SECTION',sectionId,reason:'TEMPLATE_CHANGED_UNMODIFIED_LOCAL',
    currentHash,baselineHash,desiredHash,writeAuthorized:false,output:composed,
    resultingDocumentHash:hash(composed)};
}
