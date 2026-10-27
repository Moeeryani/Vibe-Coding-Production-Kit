// Adaptive Phase 4: normalized, read-only capability state.
// This is discovery/proposal state, NOT authorization to apply capabilities,
// execute verification commands, mutate lifecycle state, or persist approvals.
const MAX_CAPABILITIES=128;
const VALID_ID=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VALID_EVIDENCE=/^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9_./-]{1,256}$/;
const STACK_BRIDGE=Object.freeze({
  go:'language.go',python:'language.python',typescript:'language.typescript',
  javascript:'ecosystem.node','react-native':'framework.react-native'
});
function error(code){const e=new Error(code);e.code=code;throw e;}
function checkRecord(value){return value && typeof value==='object' && !Array.isArray(value);}
export function normalizeCapabilityEvidence(discovery,{installedStack=null,requestedStack=null}={}){
  if(!checkRecord(discovery)||!Array.isArray(discovery.capabilities)||
      discovery.capabilities.length>MAX_CAPABILITIES)error('E_CAPABILITY_DISCOVERY_INVALID');
  if(installedStack!==null&&(typeof installedStack!=='string'||installedStack.length>64))
    error('E_CAPABILITY_STACK_INVALID');
  if(requestedStack!==null&&(typeof requestedStack!=='string'||requestedStack.length>64))
    error('E_CAPABILITY_STACK_INVALID');
  const seen=new Set(),rows=[];
  for(const item of discovery.capabilities){
    if(!checkRecord(item)||!VALID_ID.test(item.id??'')||seen.has(item.id)||
      !Array.isArray(item.evidence)||item.evidence.length<1||item.evidence.length>32||
      item.evidence.some(p=>typeof p!=='string'||!VALID_EVIDENCE.test(p)||p.startsWith('.vcp/')||p.startsWith('.git/')))
      error('E_CAPABILITY_EVIDENCE_INVALID');
    seen.add(item.id);
    const evidence=[...new Set(item.evidence)].sort();
    rows.push(Object.freeze({id:item.id,
      state:'DETECTED_NOT_APPLIED',
      proposalState:'AVAILABLE_FOR_REVIEW',
      evidence:Object.freeze(evidence),
      authority:'FIRST_PARTY_READ_ONLY_EVIDENCE'}));
  }
  rows.sort((a,b)=>a.id.localeCompare(b.id));
  const installedCapability=STACK_BRIDGE[installedStack]??null;
  const observedInstalledStackEvidence=installedCapability?seen.has(installedCapability):false;
  return Object.freeze({
    readOnly:true,
    status:discovery.status==='PARTIAL'?'PARTIAL':'INSPECTED',
    detected:Object.freeze(rows),
    proposed:Object.freeze(rows.map(x=>x.id)),
    appliedCapabilities:Object.freeze([]),
    applicationProvenance:'NOT_RECORDED_IN_SCHEMA_V2',
    legacyCompatibility:Object.freeze({installedStack,requestedStack,
      installedCapability,observedInstalledStackEvidence,
      interpretation:'Historical exclusive stack metadata is not a composable capability approval or grant.'}),
    issues:Object.freeze([...(Array.isArray(discovery.issues)?discovery.issues:[])]),
    executionAuthorized:false,
    commandsAuthorized:false,
    migrationAuthorized:false,
    note:'Detected means evidence observed; proposed is a review candidate. No capability is APPLIED without a separately authorized, versioned project-owned lifecycle contract.'
  });
}

// Pure, bounded task/Context hint renderer: never embeds marker file contents,
// never suggests executable commands and never elevates evidence into a decision.
export function renderCapabilityEvidenceSummary(state,{maxItems=16}={}){
  if(!checkRecord(state)||!Array.isArray(state.detected)||
     !Number.isSafeInteger(maxItems)||maxItems<0||maxItems>32)
    error('E_CAPABILITY_SUMMARY_INVALID');
  const lines=[
    '## Detected project capabilities — NOT APPROVED',
    'The following signals are read-only evidence, not accepted Source of Truth,',
    'not applied lifecycle capabilities and not permission to execute commands.',
    'The agent must inspect governing decisions and project-owned commands separately.'
  ];
  if(state.status==='PARTIAL')lines.push('Detection was PARTIAL; absence of a capability is not proof of absence.');
  if(!state.detected.length)lines.push('- No supported capability evidence observed.');
  for(const c of state.detected.slice(0,maxItems)){
    lines.push(`- ${c.id}: ${c.evidence.slice(0,4).join(', ')} (DETECTED; NOT APPLIED)`);
  }
  if(state.detected.length>maxItems)lines.push(`- ${state.detected.length-maxItems} additional signals omitted by context budget.`);
  lines.push('No project configuration, task command authority or lifecycle manifest was changed.');
  const out=lines.join('\n')+'\n';
  if(Buffer.byteLength(out,'utf8')>4096)error('E_CAPABILITY_SUMMARY_LIMIT');
  return out;
}
