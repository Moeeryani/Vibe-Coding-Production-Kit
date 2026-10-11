// Stage13 absent-claim provenance: missing does NOT mean safely restored.
// For an applying/verified/restoring transaction, the desired absent
// user path must have its precise staged inode still in a pinned private
// stage, or the exact same inode in a transaction-owned forensic archive.
// Anything else is an unaccounted loss and blocks journal retirement.
import {createHash} from 'node:crypto';
import {readProjectBytes} from './safe-read.mjs';
import {exactNativeIdentity} from './stage13-identity.mjs';
import {validateStage13Transaction} from './stage13-transaction.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
function reject(code){const e=new Error(code);e.code=code;throw e;}
const fail=(path,reason)=>Object.freeze({path,classification:'BLOCKED',
  reason,readOnly:true,writeAuthorized:false});
async function snapshot(root,provider,relative,expected) {
  const raw=await readProjectBytes(root,relative,{
    managedState:true,optional:true,maxBytes:8*1024*1024
  });
  if(raw===null)return null;
  const identity=exactNativeIdentity(
    await provider.statIdentity(root,relative),{type:'file'});
  if(sha(raw)!==expected.newSha256||
     identity.dev!==expected.stagedDev||
     identity.ino!==expected.stagedIno)
    reject('E_STAGE13_PROVENANCE_INODE_CHANGED');
  return Object.freeze({path:relative,sha256:sha(raw),
    dev:identity.dev,ino:identity.ino});
}
export async function inspectStage13AbsentClaims(root,tx,{
  missingPaths,provider
}={}) {
  validateStage13Transaction(tx);
  if(!(missingPaths instanceof Set)||!provider||
     typeof provider.statIdentity!=='function')
    reject('E_STAGE13_PROVENANCE_INPUT');
  const evidence=[],issues=[];
  for(const relative of missingPaths) {
    const item=tx.items.find(x=>x.kind==='whole-file'&&x.path===relative);
    if(!item) {
      issues.push({path:relative,reason:'NOT_LEDGERED_CLAIM'});
      continue;
    }
    const stageFile='.vcp/stage/'+tx.id+'/files/'+relative;
    const stageDir='.vcp/stage/'+tx.id+'/dirs/'+relative;
    const quarantine='.vcp/backups/'+tx.id+'/rollback-claims/'+relative;
    let staged=null,stagedTree=null,archived=null;
    try {
      staged=await snapshot(root,provider,stageFile,item);
      stagedTree=await snapshot(root,provider,stageDir,item);
      archived=await snapshot(root,provider,quarantine,item);
    }catch(error) {
      issues.push({path:relative,reason:error.code??
        'STAGE13_PROVENANCE_INSPECTION_FAILED'});
      continue;
    }
    const found=[staged,stagedTree,archived].filter(Boolean);
    if(found.length!==1){
      issues.push({path:relative,reason:found.length===0?
        'ABSENT_CLAIM_WITHOUT_STAGING_OR_ARCHIVE_PROOF':
        'DUPLICATE_CLAIM_INODE_LOCATIONS'});
      continue;
    }
    evidence.push(Object.freeze({path:relative,
      classification:archived?'FORENSICALLY_ARCHIVED':'STAGED_NOT_APPLIED',
      location:found[0].path,
      originalClaimDev:item.stagedDev,originalClaimIno:item.stagedIno}));
  }
  return Object.freeze({
    classification:issues.length?'BLOCKED':'ABSENT_CLAIMS_ACCOUNTED_FOR',
    readOnly:true,writeAuthorized:false,evidence,
    issues,examined:missingPaths.size
  });
}
