// Phase 7 read-only gate preview. Use the existing verified Git and Task readers.
// This is deliberately not 'vcp gate --run' and never executes project commands.
import path from 'node:path';
import {createGitReviewSnapshot} from './git-review.mjs';
import {readProjectTaskPack} from './task-read.mjs';
import {classifyChangeSet,parseTaskLifecycle,previewGateDecision} from './gate-contract.mjs';

const TASK=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function fail(code){const e=new Error(code);e.code=code;throw e;}
export async function runGatePreview({targetDir,task=null,baseRef,headRef='HEAD',minimumLevel=null}={}){
 if(typeof baseRef!=='string'||!baseRef.trim())fail('E_GATE_BASE_REQUIRED');
 if(typeof headRef!=='string'||!headRef.trim())fail('E_GATE_HEAD');
 if(task!==null&&(typeof task!=='string'||!TASK.test(task)))fail('E_GATE_TASK_SLUG');
 const root=path.resolve(targetDir??'.');
 const git=await createGitReviewSnapshot({targetDir:root,baseRef,headRef});
 const changes=classifyChangeSet(git.changedFiles,{workingTreeStatus:git.workingTreeStatus,
   selection:minimumLevel?{minimumLevel}:null});
 let taskData=null,taskSha256=null;
 if(task!==null){
  const record=await readProjectTaskPack(root,`docs/tasks/${task}.md`);
  taskData=parseTaskLifecycle(record.content);
  taskSha256=record.sha256;
 }
 const decision=previewGateDecision({task:taskData,changes});
 return Object.freeze({kind:'gate-preview',policyVersion:changes.policyVersion,
  root,baseRef:git.baseRef,baseSha:git.baseSha,headRef:git.headRef,headSha:git.headSha,
  task,taskSha256,taskStatus:taskData?.status??null,
  changes,decision,sourceWorkingTreeClean:changes.clean,
  currentHeadFreshness:'NOT_ATTESTED_AFTER_PREVIEW',
  evidenceExecuted:false,readOnly:true,commandsExecuted:0,
  mergeApproved:false,productionGateOpened:false,
  guidance:'This preview is not acceptance. Executing checks, rechecking Git head, independently reviewing, and satisfying platform enforcement remain separate work.'});
}
