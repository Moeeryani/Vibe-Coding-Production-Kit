export const COMMAND_KEYS = [
  'INSTALL_COMMAND',
  'FORMAT_CHECK_COMMAND',
  'LINT_COMMAND',
  'TYPECHECK_COMMAND',
  'CHECK_COMMAND',
  'UNIT_TEST_COMMAND',
  'INTEGRATION_TEST_COMMAND',
  'BUILD_COMMAND',
  'E2E_COMMAND'
];

const DEFINE_PLACEHOLDER = /^<define(?: or n\/a)?>$/i;
const NOT_APPLICABLE = /^(?:n\/a|not applicable)(?:\s*(?:[-—:]\s*).+)?$/i;

export function isConfiguredCommandValue(value) {
  if (!value) return false;
  const normalized = value.trim();
  return normalized.length > 0
    && !DEFINE_PLACEHOLDER.test(normalized)
    && !NOT_APPLICABLE.test(normalized);
}

export function parseAgentVerificationCommands(agents) {
  const commands = [];
  for (const key of COMMAND_KEYS) {
    const match = agents.match(new RegExp(`^${key}=(.*)$`, 'm'));
    const value = match?.[1]?.trim();
    if (!isConfiguredCommandValue(value)) continue;
    commands.push({ key, value });
  }
  return commands;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headingSection(content, heading, level = 2) {
  const prefix = '#'.repeat(level);
  const expression = new RegExp(`^${prefix} ${escapeRegExp(heading)}[ \\t]*$`, 'im');
  const match = content.match(expression);
  if (!match || match.index === undefined) return '';
  const rest = content.slice(match.index + match[0].length);
  const next = rest.search(new RegExp(`^#{1,${level}}\\s+`, 'm'));
  return next === -1 ? rest : rest.slice(0, next);
}

export function parseTaskVerificationCommands(content) {
  const section = headingSection(content, 'Verification commands');
  const commands = [];
  const seen = new Map();
  const expression = /^[-*][ \\t]+`([A-Z][A-Z0-9_]*)`:[ \\t]+`([^`]+)`[ \\t]*$/gm;
  for (const match of section.matchAll(expression)) {
    const key = match[1].trim();
    const command = match[2].trim();
    if (!isConfiguredCommandValue(command)) continue;
    if (seen.has(key)) {
      if (seen.get(key) !== command) {
        throw new Error(`Conflicting Task Pack verification commands for ${key}; refuse first-match authority.`);
      }
      continue;
    }
    seen.set(key, command);
    commands.push({ key, command });
  }
  return commands;
}
