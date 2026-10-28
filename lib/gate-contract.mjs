// Phase 7: deterministic conservative CHANGE CLASSIFICATION, not an authorization gate.
// No subprocess, network, file writing, or project mutation occurs in this module.
export const WORKFLOW_LEVELS=Object.freeze(['L0','L1','L2','L3']);
export const GATE_POLICY_VERSION='phase7-preview-1';
const LEVEL_WEIGHT={L0:0,L1:1,L2:2,L3:3};
const TASK_STATUS=new Set(['Draft','Review','Done']);
const SENSITIVE=/^(?:\.github\/workflows\/|\.gitlab-ci\.yml$|azure-pipelines(?:\.yml)?$|\.circleci\/|(?:lib|src|scripts|test)\/(?:auth|security|permission|secret|credential|crypto|native|release|gate|managed-migration|production-writer|manifest|journal|lifecycle|rollback|recovery|safe-path|safe-read|safe-create|safe-replace|command-authority|versioned-journal)(?:\/|[-.])|(?:scripts\/native\/)|(?:docs\/security\/)|(?:docs\/decisions\/)|(?:docs\/plugins\/)|(?:skills\/vcp\/)|(?:AGENTS\.md$)|(?:package-lock\.json$)|(?:package\.json$))/i;
const PROJECT_DOC=/^docs\/(?:product|architecture|delivery|testing|tasks)\//i;
const TEST=/^(?:test|tests|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const DOCS=/^(?:README(?:\.[a-z0-9-]+)?\.md|CHANGELOG\.md|LICENSE|NOTICE|docs\/(?!tasks\/|decisions\/|security\/|architecture\/adr\/).+\.md)$/i;
const SOURCE=/\.(?:[cm]?[jt]sx?|py|go|rs|java|rb|sh|ps1|cpp|hpp|h|c|sql)$/i;
// Data/config formats that can carry behavior (schemas, flags, queries,
// dependency pins). They are material even when they sit under a
// governing-doc directory: a path whose name looks harmless must never buy
// L1 treatment for a change whose KIND (inferred from path and extension,
// never from file contents — this module reads no file contents) is
// behavioral (D-PC-01, conservative promotion).
const MATERIAL_DATA=/\.(?:json|ya?ml|toml|xml|csv|lock|env|ini|cfg)$/i;
function fail(code){const e=new Error(code);e.code=code;throw e;}

// D-PC-01: the readiness bar follows the FINAL required level. L0 keeps its
// lightweight changed-surface contract (no readiness bar); L1 requires
// plan-stage readiness (L1 never executes verification commands, so the
// implement bar — implementation plan + command authority — does not apply);
// L2/L3 keep implement-stage readiness, and L3 adds independent review.
export function readinessStageForLevel(level){
 if(level==='L0')return 'none';
 if(level==='L1')return 'plan';
 if(level==='L2'||level==='L3')return 'implement';
 fail('E_GATE_LEVEL');
}
function rec(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function validPath(p){
 return typeof p==='string'&&p.length>0&&p.length<=1024&&!p.includes('\\')&&
 !p.includes('\0')&&!p.startsWith('/')&&!/^[A-Za-z]:/.test(p)&&
 p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.endsWith(' ')&&!s.endsWith('.'));
}
function labelForPath(p){
 if(SENSITIVE.test(p))return {level:'L3',reason:'SENSITIVE_BOUNDARY'};
 // Executable, test, and data/config file KINDS are material before any
 // directory-based downgrade: a .sql/.sh/.json file under docs/product/
 // is classified as a behavioral change by path and extension, not by
 // reading its contents (this module never inspects file contents), and
 // never as a governing-doc edit (D-PC-01).
 if(TEST.test(p))return {level:'L2',reason:'TEST_CONTRACT_CHANGE'};
 if(SOURCE.test(p))return {level:'L2',reason:'EXECUTABLE_OR_SCHEMA_CHANGE'};
 if(MATERIAL_DATA.test(p))return {level:'L2',reason:'MATERIAL_DATA_CHANGE'};
 if(PROJECT_DOC.test(p))return {level:'L1',reason:'PROJECT_GOVERNING_DOC'};
 if(DOCS.test(p))return {level:'L0',reason:'DOCUMENTATION_ONLY_CANDIDATE'};
 return {level:'L2',reason:'UNKNOWN_MATERIAL_CHANGE'};
}
export function parseTaskLifecycle(text){
 if(typeof text!=='string'||Buffer.byteLength(text)>512*1024)fail('E_GATE_TASK_BYTES');
 const lines=text.replace(/\r\n/g,'\n').split('\n');
 const statuses=lines.slice(0,35).map(l=>/^Status:\s*(.+?)\s*$/.exec(l)).filter(Boolean).map(m=>m[1]);
 if(statuses.length!==1||!TASK_STATUS.has(statuses[0]))fail('E_GATE_TASK_STATUS');
 const decisions=(text.match(/\bHUMAN DECISION\b/g)||[]).length;
 return Object.freeze({status:statuses[0],humanDecisionMentions:decisions,
  statusIsEvidence:false,approvalInferred:false,readOnly:true});
}
export function classifyChangeSet(changedFiles,{workingTreeStatus='',selection=null}={}){
 if(!Array.isArray(changedFiles)||changedFiles.length>20000)fail('E_GATE_CHANGES');
 if(typeof workingTreeStatus!=='string'||workingTreeStatus.length>1024*1024)fail('E_GATE_STATUS');
 if(selection!==null&&(!rec(selection)||!['L0','L1','L2','L3'].includes(selection.minimumLevel)))fail('E_GATE_MINIMUM_LEVEL');
 const records=[];
 for(const f of changedFiles){
  if(!rec(f)||typeof f.status!=='string'||!/^(?:[AMDTU]|R\d{1,3}|C\d{1,3})$/.test(f.status)||
    !validPath(f.path)||(f.from!==null&&f.from!==undefined&&!validPath(f.from)))fail('E_GATE_CHANGED_ENTRY');
  const paths=f.from?[f.from,f.path]:[f.path];
  const assessments=paths.map(p=>labelForPath(p));
  const level=assessments.reduce((acc,x)=>LEVEL_WEIGHT[x.level]>LEVEL_WEIGHT[acc]?x.level:acc,'L0');
  // Renames, copies and unresolved/unmerged entries are never trivial.
  const finalLevel=f.status==='T'||f.status==='U'?'L3'
    :/^[RC]/.test(f.status)&&LEVEL_WEIGHT[level]<2?'L2'
    :f.status==='D'&&LEVEL_WEIGHT[level]<1?'L1':level;
  records.push(Object.freeze({path:f.path,from:f.from??null,status:f.status,level:finalLevel,
    reasons:Object.freeze([...new Set(assessments.map(x=>x.reason))])}));
 }
 let requiredLevel=records.reduce((acc,x)=>LEVEL_WEIGHT[x.level]>LEVEL_WEIGHT[acc]?x.level:acc,'L0');
 if(selection&&LEVEL_WEIGHT[selection.minimumLevel]>LEVEL_WEIGHT[requiredLevel])requiredLevel=selection.minimumLevel;
 const clean=workingTreeStatus.trim().length===0;
 const reasons=[];
 if(!changedFiles.length)reasons.push('NO_CHANGED_FILES');
 if(!clean)reasons.push('DIRTY_WORKTREE');
 const block=reasons.length>0;
 return Object.freeze({policyVersion:GATE_POLICY_VERSION,requiredLevel,clean,
  readinessStage:readinessStageForLevel(requiredLevel),
  classification:block?'BLOCKED':'CLASSIFIED',blockingReasons:Object.freeze(reasons),
  changedFileCount:records.length,entries:Object.freeze(records),
  reviewRequired:requiredLevel!=='L0',verificationRequired:LEVEL_WEIGHT[requiredLevel]>=2,
  securityReviewRequired:requiredLevel==='L3',
  evidenceComplete:false,automaticPermission:false});
}
export function previewGateDecision({task=null,changes,requestedLevel=null,readiness=null}={}){
 if(!rec(changes)||!WORKFLOW_LEVELS.includes(changes.requiredLevel))fail('E_GATE_CHANGE_CLASSIFICATION');
 if(requestedLevel!==null&&!WORKFLOW_LEVELS.includes(requestedLevel))fail('E_GATE_REQUESTED_LEVEL');
 if(task!==null&&(!rec(task)||!TASK_STATUS.has(task.status)))fail('E_GATE_TASK');
 if(readiness!==null&&(!rec(readiness)||!rec(readiness.summary)||!Number.isInteger(readiness.summary.fail)))fail('E_GATE_READINESS');
 const reasons=[...changes.blockingReasons];
 if(requestedLevel&&LEVEL_WEIGHT[requestedLevel]<LEVEL_WEIGHT[changes.requiredLevel])reasons.push('LEVEL_DOWNGRADE_REFUSED');
 if(changes.requiredLevel!=='L0'&&!task)reasons.push('MATERIAL_TASK_REQUIRED');
 if(task&&task.status==='Draft')reasons.push('TASK_DRAFT');
 if(readiness&&readiness.summary.fail>0)reasons.push('READINESS_FAILURES');
 if(changes.requiredLevel==='L3')reasons.push('HIGH_RISK_INDEPENDENT_REVIEW_REQUIRED');
 return Object.freeze({status:reasons.length?'BLOCKED':'PREVIEW_READY',level:changes.requiredLevel,
  readinessStage:readinessStageForLevel(changes.requiredLevel),
  reasons:Object.freeze(reasons),taskStatus:task?.status??null,
  verificationExecuted:false,readinessEvidencePresent:readiness!==null,
  securityReviewRequired:changes.securityReviewRequired,
  independentReviewCompleted:false,
  approvalInferred:false,executionAuthorized:false,mergeAuthorized:false,
  note:'PREVIEW_READY means inputs are sufficient for a reviewable plan only; it never means PASS, DONE, approval, or permission to run verification.'});
}
