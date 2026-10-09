import crypto from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { COMMAND_KEYS, isConfiguredCommandValue } from './verification-commands.mjs';

export const COMMAND_AUTHORITY_POLICY_VERSION='v1';
const MAX_AGENTS_BYTES=512*1024;
const dangerPatterns=[
  {id:'fetch-execute',re:/(?:\bcurl\b|\bwget\b)[^\n|;&]*(?:\|\s*(?:ba)?sh\b|\|\s*powershell\b)/i},
  {id:'recursive-delete',re:/(?:\brm\s+(?:-[A-Za-z]*r[A-Za-z]*f|-rf|-fr)\b|\brmdir\s+\/s\b|\bdel\s+\/[fs]\b|\bRemove-Item\b[^\n]*-Recurse)/i},
  {id:'filesystem-format',re:/\b(?:mkfs(?:\.\w+)?|format\s+[A-Za-z]:|diskpart|dd\s+if=)\b/i},
  {id:'dynamic-eval',re:/(?:^|[;&|])\s*(?:eval|Invoke-Expression|iex)\s+/im}
];
function failure(code,detail=code) {const e=new Error(detail);e.code=code;return e;}
export function commandDigest(key,command,source='AGENTS.md') {
  if(!COMMAND_KEYS.includes(key)||typeof command!=='string'||!command.trim())throw failure('E_COMMAND_IDENTITY');
  return crypto.createHash('sha256').update(JSON.stringify({
    key,command:command.trim().replace(/\r\n/g,'\n'),source,policy:COMMAND_AUTHORITY_POLICY_VERSION
  })).digest('hex');
}
export function classifyCommandEffects(command) {
  return dangerPatterns.filter(p=>p.re.test(command)).map(p=>p.id);
}
export function inspectCommandAuthority(agentsText) {
  if(typeof agentsText!=='string'||Buffer.byteLength(agentsText)>MAX_AGENTS_BYTES)throw failure('E_COMMAND_DOCUMENT');
  const entries=[], grouped=new Map();
  for(const line of agentsText.split(/\r?\n/)) {
    const m=/^(INSTALL_COMMAND|FORMAT_CHECK_COMMAND|LINT_COMMAND|TYPECHECK_COMMAND|CHECK_COMMAND|UNIT_TEST_COMMAND|INTEGRATION_TEST_COMMAND|BUILD_COMMAND|E2E_COMMAND)=(.*)$/.exec(line);
    if(!m)continue;
    const command=m[2].trim();
    if(!isConfiguredCommandValue(command))continue;
    const key=m[1],next={key,command,source:'AGENTS.md',
      digest:commandDigest(key,command),effects:classifyCommandEffects(command)};
    entries.push(next);
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key).push(next);
  }
  const commands=[],conflicts=[],duplicateEquivalent=[];
  for(const key of COMMAND_KEYS){
    const list=grouped.get(key)??[];
    if(!list.length)continue;
    const distinct=new Set(list.map(x=>x.command));
    if(distinct.size>1) conflicts.push({key,code:'E_COMMAND_CONFLICT',count:list.length});
    else {
      if(list.length>1)duplicateEquivalent.push({key,count:list.length});
      commands.push(list[0]);
    }
  }
  return {policyVersion:COMMAND_AUTHORITY_POLICY_VERSION,commands,conflicts,duplicateEquivalent};
}
export function authorizeTaskCommands({taskCommands,authority,approvalReceipts=[]}) {
  if(!authority||!Array.isArray(authority.commands)||!Array.isArray(taskCommands))throw failure('E_COMMAND_AUTHORITY');
  if(authority.conflicts.length)throw failure('E_COMMAND_CONFLICT','Conflicting command declarations require human resolution.');
  const found=new Map(authority.commands.map(x=>[x.key,x]));
  const approvals=Array.isArray(approvalReceipts)?approvalReceipts:[];
  const results=[];
  const seen=new Set();
  for(const entry of taskCommands){
    if(seen.has(entry.key))throw failure('E_TASK_COMMAND_DUPLICATE');
    seen.add(entry.key);
    const authoritative=found.get(entry.key);
    if(!authoritative||authoritative.command!==entry.command.trim()) {
      throw failure('E_COMMAND_STALE',`Task ${entry.key} command does not match current AGENTS.md authority.`);
    }
    if(authoritative.effects.length){
      const approved=approvals.some(r=>r&&r.key===entry.key&&r.digest===authoritative.digest&&
        r.source===authoritative.source&&r.decision==='accepted'&&!r.grandfathered);
      if(!approved)throw failure('E_COMMAND_HUMAN_DECISION_REQUIRED',
        `Sensitive ${entry.key} command needs a current, fingerprint-bound human approval.`);
    }
    results.push({key:entry.key,command:entry.command,digest:authoritative.digest,
      source:authoritative.source,effects:authoritative.effects});
  }
  return results;
}
export async function readProjectCommandAuthority(root) {
  const file=await resolveProjectPath(root,'AGENTS.md',{purpose:'read-existing'});
  const fd=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  let data;
  try{
    if((await fd.stat()).size>MAX_AGENTS_BYTES)throw failure('E_COMMAND_DOCUMENT');
    data=await fd.readFile('utf8');
  }finally{await fd.close();}
  return inspectCommandAuthority(data);
}


export function renderTaskCommandSnapshot(commands) {
  if(!Array.isArray(commands)||commands.length>COMMAND_KEYS.length)throw failure('E_TASK_COMMAND_SNAPSHOT');
  const records=commands.map(item=>{
    const key=item.key,command=item.value??item.command;
    return {key,digest:commandDigest(key,command),source:'AGENTS.md',
      policyVersion:COMMAND_AUTHORITY_POLICY_VERSION};
  });
  const json=JSON.stringify({version:1,records});
  if(Buffer.byteLength(json)>8192)throw failure('E_TASK_COMMAND_SNAPSHOT');
  return `<!-- VCP:COMMAND-AUTHORITY:v1:${Buffer.from(json).toString('base64')} -->`;
}
export function parseTaskCommandSnapshot(taskText) {
  const matches=[...taskText.matchAll(/^<!-- VCP:COMMAND-AUTHORITY:v1:([A-Za-z0-9+/=]+) -->$/gm)];
  if(!matches.length)return null; // Legacy task: execution-time AGENTS re-screen still applies.
  if(matches.length!==1||matches[0][1].length>12000)throw failure('E_TASK_COMMAND_SNAPSHOT');
  let record;
  try{record=JSON.parse(Buffer.from(matches[0][1],'base64').toString('utf8'));}
  catch{throw failure('E_TASK_COMMAND_SNAPSHOT');}
  if(!record||record.version!==1||!Array.isArray(record.records)||
    record.records.length>COMMAND_KEYS.length)throw failure('E_TASK_COMMAND_SNAPSHOT');
  const seen=new Set();
  for(const item of record.records) {
    if(!COMMAND_KEYS.includes(item?.key)||seen.has(item.key)||
      !(/^[a-f0-9]{64}$/).test(item.digest)||item.source!=='AGENTS.md'||
      item.policyVersion!==COMMAND_AUTHORITY_POLICY_VERSION)throw failure('E_TASK_COMMAND_SNAPSHOT');
    seen.add(item.key);
  }
  return record.records;
}
