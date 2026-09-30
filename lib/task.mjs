import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseAgentVerificationCommands } from './verification-commands.mjs';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function validateSlug(slug) {
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Task slug must use lowercase kebab-case, for example: accept-invite.');
  }
}

function titleFromSlug(slug) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function commandSection(commands) {
  if (commands.length === 0) {
    return '- Read `AGENTS.md` and run every verification command relevant to this task.\n- Do not claim a command passed unless it was actually executed.';
  }
  return [
    'Run the relevant configured commands below before completion:',
    '',
    ...commands.map(({ key, value }) => `- \`${key}\`: \`${value}\``),
    '',
    'Do not claim a command passed unless it was actually executed.'
  ].join('\n');
}

export function renderTaskPack({ slug, title, commands = [] }) {
  return `# Task — ${title}\n\nStatus: Draft\nSlug: \`${slug}\`\n\n## Outcome\n\nDescribe the single user/business/engineering outcome this task must produce.\n\n## Source of truth\n\nThis Task Pack belongs to one VCP project root: the repository directory selected by \`--dir\`, or the current directory when \`--dir\` is omitted. Resolve repository-local references from that root. Copying this Task Pack to another project does not rebase its references automatically.\n\nLink the exact requirement and decisions that govern this task. Remove irrelevant rows. Put repository-local file references only in the \`Reference\` column; inline code used in explanatory prose is not a file reference.\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md#...\` |\n| User flow | \`docs/product/USER-FLOWS.md#...\` |\n| Domain | \`docs/architecture/DOMAIN.md#...\` |\n| Architecture | \`docs/architecture/ARCHITECTURE.md#...\` |\n| ADR | \`docs/architecture/adr/ADR-...md\` |\n| Security | \`docs/security/THREAT-MODEL.md#...\` |\n| Testing | \`docs/testing/TEST-STRATEGY.md#...\` |\n\n## Requirement restatement\n\nState the required behavior without prescribing implementation unless the source of truth already decided it.\n\n## Acceptance criteria\n\n- [ ] AC-001 —\n- [ ] AC-002 —\n\n## Scope\n\n### In scope\n-\n\n### Out of scope\n-\n\n## Affected boundaries\n\n- Modules/files likely affected:\n- Public API/contract impact:\n- Data/schema/migration impact:\n- External integration impact:\n\n## Domain invariants\n\nList invariants this change must preserve. If none apply, say why.\n\n## Security and privacy\n\n- Authentication impact:\n- Authorization/resource ownership:\n- Tenant isolation:\n- Input/trust boundaries:\n- Secrets/PII/logging:\n- Abuse/rate/replay considerations:\n- Relevant threat IDs:\n\n## Failure modes and edge cases\n\n-\n\n## Observability\n\nDefine logs, metrics, traces, audit/domain events, or alerts needed for the changed behavior. Use \`n/a\` only with a reason.\n\n## Test plan\n\n### Unit\n-\n\n### Integration / contract\n-\n\n### E2E / regression\n-\n\n### Negative/security paths\n-\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns:\n- Migration/backfill:\n- Rollback or recovery:\n\n## Implementation plan\n\nThe coding agent must fill this section **before editing implementation files**:\n\n1.\n2.\n3.\n\n## Verification commands\n\n${commandSection(commands)}\n\n## Independent review checklist\n\n- [ ] Acceptance criteria are satisfied.\n- [ ] No unrelated changes are included.\n- [ ] Architecture/module boundaries are respected.\n- [ ] Authorization and tenant/resource ownership are correct.\n- [ ] Validation/error handling covers negative paths.\n- [ ] Concurrency/idempotency/race risks were considered where relevant.\n- [ ] Tests prove behavior rather than implementation details.\n- [ ] Docs/contracts/ADRs were updated when required.\n\n## Completion report\n\nAt handoff, record:\n\n- What changed and why:\n- Verification actually run:\n- Migration/operational impact:\n- Remaining risks/limitations:\n`;
}

export async function createTaskPack({ targetDir, slug, title, force = false, dryRun = false }) {
  validateSlug(slug);
  const target = path.resolve(targetDir);
  const relative = path.posix.join('docs', 'tasks', `${slug}.md`);
  const destination = path.join(target, relative);

  if (await exists(destination) && !force) {
    throw new Error(`Refusing to overwrite existing task: ${relative}. Re-run with --force only after reviewing it.`);
  }

  let agents = '';
  try {
    agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  } catch {
    // A task can still be drafted before the kit is fully installed, but verification remains generic.
  }

  const commands = parseAgentVerificationCommands(agents);
  const content = renderTaskPack({ slug, title: title?.trim() || titleFromSlug(slug), commands });

  if (!dryRun) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, 'utf8');
  }

  return { target, relative, destination, content, dryRun, commandCount: commands.length };
}