// Stage14 short standing-context contract for new greenfield-safe installs.
// The authoritative VCP framework and long procedural guides remain packaged.
// Command slots are discovered proposals, NEVER approval to run them.
import { COMMAND_KEYS } from './verification-commands.mjs';
export function renderGreenfieldRouting(){
  return [
    '# Project AI execution routing',
    '',
    'VCP is deterministic engineering workflow tooling; it is not an LLM runtime.',
    'Treat the actual project docs/code/decisions as the only Source of Truth.',
    'Discover before asking. Label uncertainty DISCOVERABLE / PROPOSABLE / HUMAN DECISION.',
    'Never convert an assistant suggestion into APPROVED human intent.',
    'Preserve all pre-existing project files, authored instructions, CI and user edits.',
    'Use Task Packs for bounded scope; use VCP readiness, context and review for evidence.',
    'Read canonical procedural prompts from the installed VCP package on demand.',
    'Project-local prompt overrides are project-owned, and are never Source of Truth by themselves.',
    'A verification command string is not permission to run sensitive/destructive actions.',
    'Refuse mutation or recovery when lifecycle ownership or explicit approval is unproved.',
    'Do not infer that a starter template is accepted project policy.',
    '',
    '## Verification command evidence (must be reviewed before use)',
    '',
    ...COMMAND_KEYS.map(key=>key+'=<define>'),
    ''
  ].join('\n');
}
