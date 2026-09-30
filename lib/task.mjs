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
  return `# Task — ${title}\n\nStatus: Draft\nSlug: \`${slug}\`\n\n## Outcome\n\nDescribe the single user/business/engineering outcome this task must produce.\n\n## Source of truth\n\nThis Task Pack belongs to one VCP project root: the repository directory selected by \`--dir\`, or the current directory when \`--dir\` is omitted. Resolve repository-local references from that root. Copying this Task Pack to another project does not rebase its references automatically.\n\nLink the exact requirement and decisions that govern this task. Remove irrelevant rows. Put repository-local file references only in the \`Reference\` column; inline code used in explanatory prose is not a file reference.\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md#...\` |\n| User flow | \`docs/product/USER-FLOWS.md#...\` |\n| Domain | \`docs/architecture/DOMAIN.md#...\` |\n| Architecture | \`docs/architecture/ARCHITECTURE.md#...\` |\n| ADR | \`docs/architecture/adr/ADR-...md\` |\n| Security | \`docs/security/THREAT-MODEL.md#...\` |\n| Testing | \`docs/testing/TEST-STRATEGY.md#...\` |\n\n## Requirement restatement\n\nState the required behavior without prescribing implementation unless the source of truth already decided it.\n\n## Acceptance criteria\n\n- [ ] AC-001 —\n- [ ] AC-002 —\n\n## Scope\n\n### In scope\n-\n\n### Out of scope\n-\n\n## Affected boundaries\n\n- Modules/files likely affected:\n- Public API/contract impact:\n- Data/schema/migration impact:\n- External integration impact:\n\n## Domain invariants\n\nList invariants this change must preserve. If none apply, say why.\n\n## Security and privacy\n\n- Authentication impact:\n- Authorization/resource ownership:\n- Tenant isolation:\n- Input/trust boundaries:\n- Secrets/PII/logging:\n- Abuse/rate/replay considerations:\n- Relevant threat IDs:\n\n## Failure modes and edge cases\n\n-\n\n## Observability\n\nDefine logs, metrics, traces, audit/domain events, or alerts needed for the changed behavior. Use \`n/a\` only with a reason.\n\n## Test plan\n\n### Unit\n-\n\n### Integration / contract\n-\n\n### E2E / regression\n-\n\n### Negative/security paths\n-\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns:\n- Migration/backfill:\n- Rollback or recovery:\n\n## Implementation plan\n\nThe coding agent must fill this section **before editing implementation files**:\n\n1.\n2.\n3.\n\n## Verification commands\n\n${commandSection(commands)}\n\n## Independent review checklist\n\n- [ ] Acceptance criteria are satisfied.\n- [ ] No unrelated changes are included.\n- [ ] Architecture/module boundaries are respected.\n- [ ] Authorization and tenant/resource ownership are correct.\n- [ ] Validation/error handling covers negative paths.\n- [ ] Concurrency/idempotency/race risks were considered where relevant.\n- [ ] Tests prove behavior rather than implementation details.\n- [ ] Docs/contracts/ADRs were updated when required.\n\n## Independent review evidence\n\nRecord concise material review outcomes here so a fresh agent can audit the review without the prior reviewer chat. Do not copy the full review transcript or duplicate authoritative requirements. Summarize routine \`NO ACTION\` checks when practical.\n\nAllowed classes: \`BLOCKER\`, \`DEFECT\`, \`RISK\`, \`FOLLOW-UP\`, \`NO ACTION\`.\nAllowed dispositions: \`must fix in this task\`, \`follow-up candidate\`, or \`n/a\` for summarized \`NO ACTION\` evidence.\n\n| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |\n|---|---|---|---|---|\n| | | | | |\n\n## Finalization\n\n\`Status: Done\` is the durable final state for an implementation Task Pack. Prepare the finalization edit only after acceptance criteria are satisfied, the required implementation/review gate has passed, material review findings are resolved or dispositioned, and no current-task blocker or unresolved HUMAN DECISION remains.\n\nThe finalization edit itself moves the head. It may set \`Status: Done\` and replace stale \`pending\` or prior-failure text with the bounded final-gate summary, but \`Done\` is not accepted evidence until the required exact-head gate is rerun on that unchanged finalization head and passes. If that rerun fails, do not merge; return the task to an appropriate non-final state while correcting the failure, then finalize and rerun again.\n\nIf a prior failed gate is materially useful, summarize it separately as superseded evidence. Do not paste full logs. After a passing exact-head finalization gate, do not edit the Task Pack merely to mark that rerun as passed; the rerun validates the already-written finalization. Any later code/docs change moves the head and requires another rerun before merge. Git/PR history owns merge identity, so do not create self-referential Task Pack edits merely to embed the merge commit SHA.\n\nFinalization checklist for the finalization edit:\n\n- [ ] Acceptance criteria satisfied.\n- [ ] Pre-final implementation/review gate passed before the finalization edit.\n- [ ] Independent review evidence is current and no \`must fix in this task\` finding remains unresolved.\n- [ ] Completion report reflects the intended final accepted gate; earlier failures are clearly marked superseded when retained.\n- [ ] Top-level \`Status\` changed to \`Done\`.\n\nAfter saving this edit, rerun the required exact-head gate. Do not change this Task Pack solely to record that rerun; merge only if it passes.\n\n## Completion report\n\nAt handoff, record:\n\n- What changed and why:\n- Final accepted verification: summarize the gate this finalization claims; the post-finalization exact-head rerun must prove it before merge.\n- Superseded failed evidence (if material): n/a.\n- Independent review evidence updated:\n- Migration/operational impact:\n- Remaining risks/limitations:\n`;
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
