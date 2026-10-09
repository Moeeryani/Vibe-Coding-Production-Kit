import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { extractSourceTruthReferences } from './source-truth-references.mjs';
import { authorityIssueForStage, parseSourceTruthAuthority } from './source-truth-authority.mjs';
import { isWorkspaceSourceTruthReference, resolveWorkspaceSourceTruthReference } from './source-truth-scope.mjs';
import { parseTaskVerificationCommands } from './verification-commands.mjs';
import { readProjectCommandAuthority,authorizeTaskCommands,parseTaskCommandSnapshot } from './command-authority.mjs';
import { readApprovedCommandReceipts } from './approval-receipts.mjs';
import { resolveProjectPath } from './safe-path.mjs';

export const READINESS_STAGES = ['plan', 'implement'];

const PLACEHOLDER_TEXT = [
  'Describe the single user/business/engineering outcome this task must produce.',
  'State the required behavior without prescribing implementation unless the source of truth already decided it.',
  'List invariants this change must preserve. If none apply, say why.',
  'Define logs, metrics, traces, audit/domain events, or alerts needed for the changed behavior. Use `n/a` only with a reason.'
];

const SOURCE_TEMPLATE_SIGNALS = {
  'docs/product/PRODUCT-BRIEF.md': [
    'What painful, frequent, or valuable problem are we solving?',
    'Who experiences the problem? Segment primary vs secondary users.'
  ],
  'docs/product/PRD.md': [
    'FR-001 — <Requirement name>',
    '- Owner:\n- Status: Draft / Review / Accepted / Superseded'
  ],
  'docs/product/USER-FLOWS.md': ['## Flow: <name>'],
  'docs/architecture/DOMAIN.md': ['### <Entity>', '| | | |'],
  'docs/architecture/ARCHITECTURE.md': ['List the qualities the architecture must optimize for', '| | | | |'],
  'docs/security/THREAT-MODEL.md': ['| T-001 | | | | | | | |'],
  'docs/testing/TEST-STRATEGY.md': ['| | | | | |']
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function taskRelativePath(task) {
  if (!task) throw new Error('Ready command requires a task slug or task file path.');
  if (task.includes('/') || task.includes('\\') || task.endsWith('.md')) return task;
  return path.join('docs', 'tasks', `${task}.md`);
}

function safePath(root, candidate) {
  const normalizedRoot = path.resolve(root);
  const withoutAnchor = candidate.split('#', 1)[0].trim().replaceAll('\\', '/');
  const resolved = path.resolve(normalizedRoot, withoutAnchor);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Source-of-truth reference escapes the repository root: ${candidate}`);
  }
  const relative = path.relative(normalizedRoot, resolved).split(path.sep).join('/');
  return { resolved, relative: relative || '.' };
}

async function existsFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function headingSection(content, heading, level = 2) {
  const prefix = '#'.repeat(level);
  const expression = new RegExp(`^${prefix} ${escapeRegExp(heading)}[ \\t]*$`, 'im');
  const match = content.match(expression);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const next = rest.search(new RegExp(`^#{1,${level}}\\s+`, 'm'));
  return next === -1 ? rest : rest.slice(0, next);
}

function subsection(content, parent, child) {
  return headingSection(headingSection(content, parent, 2), child, 3);
}

function normalize(value) {
  return value
    .replace(/`/g, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[[ xX]\]/g, '')
    .trim();
}

function isSubstantive(value) {
  const text = normalize(value);
  if (!text || /^[-—:|.\s]+$/.test(text)) return false;
  if (PLACEHOLDER_TEXT.some((placeholder) => text.includes(normalize(placeholder)))) return false;
  if (/^(n\/?a|not applicable)$/i.test(text)) return false;
  return text.length >= 4;
}

function meaningfulBullets(section) {
  return [...section.matchAll(/^[-*]\s+(.*)$/gm)]
    .map((match) => match[1].trim())
    .filter(isSubstantive);
}

function meaningfulNumbered(section) {
  return [...section.matchAll(/^\d+\.\s+(.*)$/gm)]
    .map((match) => match[1].trim())
    .filter(isSubstantive);
}

function fieldValue(section, label) {
  const expression = new RegExp(`^[-*][ \\t]*${escapeRegExp(label)}:[ \\t]*(.*)$`, 'mi');
  return section.match(expression)?.[1]?.trim() ?? '';
}

function statusForStage(stage) {
  return stage === 'implement' ? 'fail' : 'warn';
}

function finding(status, id, title, detail, remediation = null) {
  return { status, id, title, detail, remediation };
}

function acceptanceCriteria(content) {
  return [...headingSection(content, 'Acceptance criteria').matchAll(/^[-*][ \\t]+\[[ xX]\][ \\t]+AC-[A-Za-z0-9_-]+[ \\t]*[—-][ \\t]*(.*)$/gm)]
    .map((match) => match[1].trim())
    .filter(isSubstantive);
}

function duplicateLevelTwoHeadings(content) {
  const seen = new Map();
  const duplicates = new Set();
  for (const match of content.matchAll(/^##[ \\t]+(.+?)[ \\t]*$/gm)) {
    const display = match[1].trim();
    const key = display.toLowerCase();
    if (seen.has(key)) duplicates.add(seen.get(key));
    else seen.set(key, display);
  }
  return [...duplicates];
}

function templateSignalsFor(relative) {
  const projectRelative = relative.startsWith('workspace:') ? relative.slice('workspace:'.length) : relative;
  return SOURCE_TEMPLATE_SIGNALS[projectRelative] ?? [];
}

async function sourceTruthChecks(root, content, stage) {
  const refs = extractSourceTruthReferences(content);
  const issues = [];
  const templateRefs = [];
  const draftRefs = [];
  const workspaceRefs = [];
  let valid = 0;

  if (refs.length === 0) {
    return { valid: 0, refs: [], issues: ['No Source-of-Truth reference is defined.'], templateRefs: [], draftRefs: [], workspaceRefs: [] };
  }

  for (const ref of refs) {
    if (ref.includes('...') || ref.includes('<') || ref.includes('>')) {
      issues.push(`Placeholder reference remains: ${ref}`);
      continue;
    }
    let safe;
    try {
      safe = isWorkspaceSourceTruthReference(ref)
        ? await resolveWorkspaceSourceTruthReference(root, ref)
        : safePath(root, ref);
    } catch (error) {
      issues.push(error.message);
      continue;
    }
    if (!(await existsFile(safe.resolved))) {
      issues.push(`Referenced file does not exist: ${safe.relative}`);
      continue;
    }

    const referenced = await readFile(safe.resolved, 'utf8');
    const authority = parseSourceTruthAuthority(referenced);
    const authorityIssue = authorityIssueForStage(authority, stage);
    if (authorityIssue) {
      issues.push(`${safe.relative}: ${authorityIssue}`);
      continue;
    }

    valid += 1;
    if (isWorkspaceSourceTruthReference(ref)) workspaceRefs.push(safe.relative);
    if (authority.state === 'DRAFT') draftRefs.push(safe.relative);
    const signals = templateSignalsFor(safe.relative);
    if (signals.length > 0 && signals.some((signal) => referenced.includes(signal))) templateRefs.push(safe.relative);
  }

  return {
    valid,
    refs,
    issues,
    templateRefs: [...new Set(templateRefs)],
    draftRefs: [...new Set(draftRefs)],
    workspaceRefs: [...new Set(workspaceRefs)]
  };
}

function filledFields(section, labels) {
  const missing = [];
  for (const label of labels) {
    if (!isSubstantive(fieldValue(section, label))) missing.push(label);
  }
  return missing;
}

export async function runTaskReadiness({ targetDir, task, stage = 'plan' }) {
  if (!READINESS_STAGES.includes(stage)) {
    throw new Error(`Unknown readiness stage "${stage}". Choose one of: ${READINESS_STAGES.join(', ')}.`);
  }

  const root = path.resolve(targetDir);
  const taskPath = safePath(root, taskRelativePath(task));
  const checks = [];

  try {
    await access(taskPath.resolved);
  } catch {
    return {
      target: root,
      task: taskPath.relative,
      stage,
      checks: [finding('fail', 'task-file', 'Task file', `Task file not found: ${taskPath.relative}`, 'Create it with `vcp task <slug>` or pass the correct path.')],
      summary: { pass: 0, warn: 0, fail: 1 }
    };
  }

  await resolveProjectPath(root,taskPath.relative,{purpose:'read-existing'});
  const content = await readFile(taskPath.resolved, 'utf8');
  checks.push(finding('pass', 'task-file', 'Task file', `${taskPath.relative} is readable.`));

  const duplicateSections = duplicateLevelTwoHeadings(content);
  checks.push(duplicateSections.length === 0
    ? finding('pass', 'duplicate-sections', 'Task structure', 'No duplicate level-two task sections were found.')
    : finding('fail', 'duplicate-sections', 'Task structure', `Duplicate task section(s) found: ${duplicateSections.join(', ')}.`, 'Merge each duplicated section into the generated section instead of appending a second copy.'));

  const outcome = headingSection(content, 'Outcome');
  checks.push(isSubstantive(outcome)
    ? finding('pass', 'outcome', 'Outcome', 'A concrete task outcome is defined.')
    : finding('fail', 'outcome', 'Outcome', 'The task outcome is still blank or template text.', 'Describe one concrete user/business/engineering outcome.'));

  const source = await sourceTruthChecks(root, content, stage);
  if (source.valid === 0 || source.issues.length > 0) {
    checks.push(finding('fail', 'source-truth', 'Source of truth', source.issues.join(' '), 'Reference current governing documents. Unqualified paths are project-local; use `workspace:<path>` only for explicit enclosing-worktree authority. Use `Authority: ACCEPTED` for accepted truth; draft authority is plan-only, and superseded/archived material is historical.'));
  } else if (source.templateRefs.length > 0) {
    checks.push(finding(
      'warn',
      'source-truth',
      'Source of truth',
      `${source.valid} repository reference(s) resolve, but ${source.templateRefs.length} still contain starter-template signals: ${source.templateRefs.join(', ')}.`,
      'Have the coding agent draft project-specific decisions from repository evidence and ask the developer only for unresolved human-intent decisions.'
    ));
  } else if (source.draftRefs.length > 0) {
    checks.push(finding('pass', 'source-truth', 'Source of truth', `${source.valid} repository reference(s) resolve; plan stage explicitly permits draft authority: ${source.draftRefs.join(', ')}.`));
  } else if (source.workspaceRefs.length > 0) {
    checks.push(finding('pass', 'source-truth', 'Source of truth', `${source.valid} repository reference(s) resolve successfully. Explicit workspace governing reference(s): ${source.workspaceRefs.join(', ')}.`));
  } else {
    checks.push(finding('pass', 'source-truth', 'Source of truth', `${source.valid} repository reference(s) resolve successfully.`));
  }

  const criteria = acceptanceCriteria(content);
  checks.push(criteria.length > 0
    ? finding('pass', 'acceptance', 'Acceptance criteria', `${criteria.length} concrete acceptance criterion/criteria defined.`)
    : finding('fail', 'acceptance', 'Acceptance criteria', 'No concrete acceptance criterion is defined.', 'Define testable AC-* statements with observable outcomes.'));

  const inScope = meaningfulBullets(subsection(content, 'Scope', 'In scope'));
  const outScope = meaningfulBullets(subsection(content, 'Scope', 'Out of scope'));
  checks.push(inScope.length > 0 && outScope.length > 0
    ? finding('pass', 'scope', 'Scope boundaries', 'Both in-scope and out-of-scope boundaries are explicit.')
    : finding('fail', 'scope', 'Scope boundaries', 'In-scope or out-of-scope boundaries are still empty.', 'State what this task changes and what it deliberately does not change.'));

  const secondaryStatus = statusForStage(stage);

  const boundaries = headingSection(content, 'Affected boundaries');
  const boundaryMissing = filledFields(boundaries, [
    'Modules/files likely affected',
    'Public API/contract impact',
    'Data/schema/migration impact',
    'External integration impact'
  ]);
  checks.push(boundaryMissing.length === 0
    ? finding('pass', 'boundaries', 'Affected boundaries', 'Module, contract, data, and integration impact are addressed.')
    : finding(secondaryStatus, 'boundaries', 'Affected boundaries', `Unanswered: ${boundaryMissing.join(', ')}.`, 'Answer each boundary or write `n/a — <reason>`.'));

  const domain = headingSection(content, 'Domain invariants');
  checks.push(isSubstantive(domain)
    ? finding('pass', 'domain', 'Domain invariants', 'Relevant invariants or a reasoned non-applicability statement is present.')
    : finding(secondaryStatus, 'domain', 'Domain invariants', 'Domain invariants are not resolved.', 'List invariants to preserve or write `n/a — <reason>`.'));

  const security = headingSection(content, 'Security and privacy');
  const securityMissing = filledFields(security, [
    'Authentication impact',
    'Authorization/resource ownership',
    'Tenant isolation',
    'Input/trust boundaries',
    'Secrets/PII/logging',
    'Abuse/rate/replay considerations',
    'Relevant threat IDs'
  ]);
  checks.push(securityMissing.length === 0
    ? finding('pass', 'security', 'Security and privacy', 'Security/trust-boundary questions are explicitly answered.')
    : finding(secondaryStatus, 'security', 'Security and privacy', `Unanswered: ${securityMissing.join(', ')}.`, 'Answer each item or write `n/a — <reason>` before implementation.'));

  const failures = meaningfulBullets(headingSection(content, 'Failure modes and edge cases'));
  checks.push(failures.length > 0
    ? finding('pass', 'failures', 'Failure modes and edge cases', `${failures.length} concrete failure/edge case item(s) defined.`)
    : finding(secondaryStatus, 'failures', 'Failure modes and edge cases', 'No concrete failure mode or edge case is defined.', 'List negative paths or write one reasoned n/a item.'));

  const observability = headingSection(content, 'Observability');
  checks.push(isSubstantive(observability)
    ? finding('pass', 'observability', 'Observability', 'Operational visibility is addressed.')
    : finding(secondaryStatus, 'observability', 'Observability', 'Observability is not resolved.', 'Define logs/metrics/traces/audit events or write `n/a — <reason>`.'));

  const testPlan = headingSection(content, 'Test plan');
  const testSections = ['Unit', 'Integration / contract', 'E2E / regression', 'Negative/security paths'];
  const missingTests = testSections.filter((name) => meaningfulBullets(headingSection(testPlan, name, 3)).length === 0);
  checks.push(missingTests.length === 0
    ? finding('pass', 'tests', 'Test plan', 'Every test layer is addressed or explicitly marked non-applicable with a reason.')
    : finding(secondaryStatus, 'tests', 'Test plan', `Unresolved test areas: ${missingTests.join(', ')}.`, 'Add concrete checks or `n/a — <reason>` under every test subsection.'));

  const rollout = headingSection(content, 'Rollout, migration, and recovery');
  const rolloutMissing = filledFields(rollout, [
    'Deployment/compatibility concerns',
    'Migration/backfill',
    'Rollback or recovery'
  ]);
  checks.push(rolloutMissing.length === 0
    ? finding('pass', 'rollout', 'Rollout and recovery', 'Deployment, migration, and recovery are addressed.')
    : finding(secondaryStatus, 'rollout', 'Rollout and recovery', `Unanswered: ${rolloutMissing.join(', ')}.`, 'Answer each item or write `n/a — <reason>`.'));

  if (stage === 'implement') {
    const plan = meaningfulNumbered(headingSection(content, 'Implementation plan'));
    checks.push(plan.length > 0
      ? finding('pass', 'implementation-plan', 'Implementation plan', `${plan.length} concrete implementation step(s) defined.`)
      : finding('fail', 'implementation-plan', 'Implementation plan', 'The plan-before-code section is still empty.', 'Complete and approve the bounded implementation plan before editing implementation files.'));

    const verificationCommands = parseTaskVerificationCommands(content).filter(({ key }) => key !== 'INSTALL_COMMAND');
    checks.push(verificationCommands.length > 0
      ? finding('pass', 'verification-plan', 'Verification plan', `${verificationCommands.length} executable verification command(s) are defined in the task.`)
      : finding('fail', 'verification-plan', 'Verification plan', 'No executable verification command can be built from this task.', 'Configure AGENTS.md first, then recreate/update the task so `## Verification commands` contains keyed entries such as `- `UNIT_TEST_COMMAND`: `npm test``.'));

    if(verificationCommands.length) {
      try {
        const authority=await readProjectCommandAuthority(root);
        const receipts=await readApprovedCommandReceipts(root);
        const authorized=authorizeTaskCommands({
          taskCommands:verificationCommands,authority,approvalReceipts:receipts
        });
        const snapshot=parseTaskCommandSnapshot(content);
        if(snapshot) {
          for(const item of authorized) {
            const matched=snapshot.find(x=>x.key===item.key);
            if(!matched||matched.digest!==item.digest||matched.source!==item.source) {
              throw new Error('Task command approval snapshot is stale for '+item.key);
            }
          }
        }
        checks.push(finding('pass','command-authority','Executable command authority',
          authorized.length+' task command(s) match current project command authority.'));
      } catch(error) {
        checks.push(finding('fail','command-authority','Executable command authority',
          error.code??error.message,
          'Resolve duplicate/conflicting commands, refresh Task Pack, or obtain exact human approval before verify --run.'));
      }
    }
  }

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const item of checks) summary[item.status] += 1;

  return { target: root, task: taskPath.relative, stage, checks, summary };
}

export function readinessExitCode(report, strict = false) {
  if (report.summary.fail > 0) return 1;
  if (strict && report.summary.warn > 0) return 1;
  return 0;
}

export function formatReadinessReport(report) {
  const lines = [
    'Vibe Coding Production Task Readiness',
    `Task: ${report.task}`,
    `Stage: ${report.stage}`,
    ''
  ];
  for (const item of report.checks) {
    lines.push(`[${item.status.toUpperCase()}] ${item.title}: ${item.detail}`);
    if (item.remediation && item.status !== 'pass') lines.push(`       Fix: ${item.remediation}`);
  }
  lines.push('');
  lines.push(`Summary: ${report.summary.pass} pass, ${report.summary.warn} warn, ${report.summary.fail} fail`);
  return lines.join('\n');
}
