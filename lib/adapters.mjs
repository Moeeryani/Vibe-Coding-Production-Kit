export const AGENT_CHOICES = ['generic', 'codex', 'cursor', 'claude', 'copilot', 'all'];

const claude = `# Claude Code project instructions

@AGENTS.md

Use AGENTS.md for repository-level authority and the current task's bounded
Context Pack for relevant requirements. Do not assume VCP starter docs exist.
Follow the configured Task Pack verification and human approval boundaries.
`;

const copilot = `# GitHub Copilot repository instructions

Follow AGENTS.md as the repository-wide routing authority.
Use the current Task Pack Source-of-Truth references and bounded Context Pack.
Preserve existing project documentation and CI; do not invent VCP starter paths.
Run only configured, approved verification commands before claiming completion.
`;

export function adapterFiles(agent) {
  const files = new Map();

  if (agent === 'claude' || agent === 'all') {
    files.set('CLAUDE.md', claude);
  }

  if (agent === 'copilot' || agent === 'all') {
    files.set('.github/copilot-instructions.md', copilot);
  }

  // Codex and Cursor both support AGENTS.md directly. Generic relies on it too.
  return files;
}

export function agentNote(agent) {
  switch (agent) {
    case 'codex':
      return 'Codex will use the generated AGENTS.md directly.';
    case 'cursor':
      return 'Cursor will use the generated AGENTS.md directly.';
    case 'claude':
      return 'CLAUDE.md was added as a thin adapter that imports AGENTS.md.';
    case 'copilot':
      return '.github/copilot-instructions.md was added as a thin adapter.';
    case 'all':
      return 'Adapters were added for Claude Code and GitHub Copilot; Codex and Cursor use AGENTS.md directly.';
    default:
      return 'Use AGENTS.md as the repository-wide instruction source.';
  }
}
