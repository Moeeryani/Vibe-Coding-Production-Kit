// Stage12 neutral standing instructions for a mature, unowned repository.
// No assumed PRD, architecture, threat model or source-framework workflow.
const SECTION_ID='agent-routing';
export function renderBrownfieldRoutingBody() {
  return [
    'VCP provides a deterministic task, readiness, context, and verification control plane.',
    'Preserve all existing project documentation, instructions, CI and code as project-owned.',
    'Do not infer that a VCP starter document exists or is authoritative.',
    'For each task, cite the real repository Source-of-Truth locations in its Task Pack.',
    'Use the current bounded Context Pack and the task-specific planning/review prompts.',
    'Use verification commands only from the current, approved AGENTS.md authority.',
    'Never run destructive commands without the separately required explicit approval.',
    'Treat missing, ambiguous or conflicting authority as a decision request, not permission to overwrite.'
  ].join('\n')+'\n';
}
export function renderBrownfieldRouting() {
  return '# Repository AI execution routing\n\n'+
    '<!-- VCP:BEGIN:'+SECTION_ID+' -->\n'+
    renderBrownfieldRoutingBody()+
    '<!-- VCP:END:'+SECTION_ID+' -->\n';
}
export const BROWNFIELD_ROUTING_SECTION_ID=SECTION_ID;
