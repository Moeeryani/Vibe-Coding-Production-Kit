import crypto from 'node:crypto';
import { parseManagedSections, replaceManagedSection, composeInitialManagedSection } from './managed-markdown.mjs';
import { validateAdaptiveManifest,validManagedRelative } from './manifest-v2.mjs';

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


export function planAdaptiveSectionMutation({
  manifest,readerVersion,relativePath,currentDocument,baselineBody,desiredBody,
  desiredTemplateVersion=null
}={}) {
  validateAdaptiveManifest(manifest,{readerVersion});
  if(!validManagedRelative(relativePath))err('E_OWNERSHIP_PATH');
  const ownership=manifest.ownership?.[relativePath];
  const entry=manifest.managedFiles?.[relativePath];
  if(!ownership||ownership.kind!=='managed-section'||!entry)err('E_SECTION_OWNERSHIP_REQUIRED');
  const baseline=Buffer.from(baselineBody);
  if(hash(baseline)!==ownership.baselineHash||
      hash(baseline)!==entry.baselineHash)err('E_SECTION_BASELINE_INTEGRITY');
  const result=planManagedSectionUpdate({
    currentDocument,baselineBody:baseline,desiredBody,sectionId:ownership.sectionId
  });
  const preview={
    action:result.action,reason:result.reason,relativePath,
    sectionId:ownership.sectionId,readOnly:true,writeAuthorized:false,
    beforeDocumentHash:hash(Buffer.from(currentDocument)),
    updatedDocumentHash:result.resultingDocumentHash??null,
    oldBaselineHash:result.baselineHash,nextBaselineHash:
      result.action==='UPDATE_SECTION'?result.desiredHash:result.baselineHash,
    conflict:result.action==='CONFLICT',
    nextDocument:result.output??null,
    nextBaseline:result.action==='UPDATE_SECTION'?Buffer.from(desiredBody):null,
    nextManifest:null
  };
  if(result.action!=='UPDATE_SECTION')return preview;
  const nextManifest=JSON.parse(JSON.stringify(manifest));
  nextManifest.managedFiles[relativePath].baselineHash=result.desiredHash;
  nextManifest.ownership[relativePath].baselineHash=result.desiredHash;
  if(desiredTemplateVersion) {
    nextManifest.managedFiles[relativePath].templateVersion=desiredTemplateVersion;
  }
  validateAdaptiveManifest(nextManifest,{readerVersion});
  return {...preview,nextManifest};
}


export function planInitialManagedSection({currentDocument,sectionId,proposedContent}={}) {
  if(!/^[a-z0-9-]{1,64}$/.test(sectionId))err('E_OWNERSHIP_SECTION');
  const before=Buffer.from(currentDocument);
  const candidate=composeInitialManagedSection(before,sectionId,proposedContent);
  const snapshot=snapshotManagedSection(candidate.document,sectionId);
  if(candidate.document.subarray(0,before.length).equals(before)===false) {
    err('E_SECTION_USER_BYTES_CHANGED');
  }
  return {
    action:'PROPOSE_SECTION',sectionId,
    ownership:{kind:'managed-section',sectionId,baselineHash:snapshot.baselineHash},
    originalDocumentHash:hash(before),
    candidateDocumentHash:hash(candidate.document),
    baselineHash:snapshot.baselineHash,
    candidateDocument:candidate.document,baselineBody:snapshot.content,
    readOnly:true,writeAuthorized:false
  };
}
