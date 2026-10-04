import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createGitReviewSnapshot } from './git-review.mjs';
import { extractSourceTruthReferences } from './source-truth-references.mjs';
import { authorityIssueForContext, parseSourceTruthAuthority } from './source-truth-authority.mjs';
import { isWorkspaceSourceTruthReference, resolveWorkspaceSourceTruthReference } from './source-truth-scope.mjs';
import { loadSecurityProfileContext } from './security-profiles.mjs';
import { loadCommunityPluginContext } from './community-plugins.mjs';
import { assertPathInsideRoot } from './template.mjs';

export { extractSourceTruthReferences };
export const CONTEXT_MODES = ['plan', 'implement', 'review', 'security', 'release'];
export const DEFAULT_CONTEXT_MAX_BYTES = 120_000;

const MODE_PROMPTS = {
  plan: 'prompts/02-plan-task.md',
  implement: 'prompts/03-implement-task.md',
  review: 'prompts/04-code-review.md',
  security: 'prompts/05-security-review.md',
  release: 'prompts/07-release-review.md'
};

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function assertMode(mode) {
  if (!CONTEXT_MODES.includes(mode)) {
    throw new Error(`Unknown context mode "${mode}". Choose one of: ${CONTEXT_MODES.join(', ')}.`);
  }
}

function stripAnchor(value) {
  return value.split('#', 1)[0].trim();
}

function portableRelative(root, resolved) {
  const relative = path.relative(root, resolved) || '.';
  return relative.split(path.sep).join('/');
}

function safePath(root, candidate, label = 'path') {
  if (!candidate || typeof candidate !== 'string') throw new Error(`${label} must be a non-empty path.`);
  const normalizedCandidate = candidate.trim();
  if (/^[a-z]+:\/\//i.test(normalizedCandidate)) throw new Error(`${label} must be a repository-local path, not a URL: ${candidate}`);
  if (isWorkspaceSourceTruthReference(normalizedCandidate)) {
    throw new Error(`${label} does not support workspace: qualification.`);
  }

  const withoutAnchor = stripAnchor(normalizedCandidate).replaceAll('\\', '/');
  if (!withoutAnchor) throw new Error(`${label} does not resolve to a file: ${candidate}`);

  const resolved = path.resolve(root, withoutAnchor);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the repository root: ${candidate}`);
  }
  return { resolved, relative: portableRelative(normalizedRoot, resolved) };
}

function taskRelativePath(task) {
  if (!task) throw new Error('Context command requires a task slug or task file path.');
  if (task.includes('/') || task.includes('\\') || task.endsWith('.md')) return task;
  return path.join('docs', 'tasks', `${task}.md`);
}

async function readText(root, relative, { required = true, label = 'Context file' } = {}) {
  const safe = safePath(root, relative, label);
  if (!(await exists(safe.resolved))) {
    if (!required) return null;
    throw new Error(`${label} not found: ${safe.relative}`);
  }
  const content = await readFile(safe.resolved, 'utf8');
  return { ...safe, content };
}

async function readSourceTruth(root, reference) {
  if (!isWorkspaceSourceTruthReference(reference)) {
    return readText(root, reference, { required: false, label: 'Source-of-truth reference' });
  }
  const safe = await resolveWorkspaceSourceTruthReference(root, reference);
  if (!(await exists(safe.resolved))) return null;
  const content = await readFile(safe.resolved, 'utf8');
  return { ...safe, content };
}

function renderSection(title, relative, content) {
  return `## ${title}\n\nSource: \`${relative}\`\n\n${content.trim()}\n`;
}

function uniqueByRelative(items) {
  const result = [];
  const seen = new Set();
  for (const item of items) {
    if (!item || seen.has(item.relative)) continue;
    seen.add(item.relative);
    result.push(item);
  }
  return result;
}

function renderPlannedPaths(planned) {
  if (!planned.length) return '';
  const lines = [
    '## Planned implementation paths\n',
    'These repository-local paths are approved for this implementation but do not exist yet, so no file contents are included.\n'
  ];
  for (const item of planned) lines.push(`- \`${item.relative}\` — planned path (not yet present)\n`);
  return lines.join('\n');
}

function fenced(content, language = '') {
  const runs = content.match(/`+/g) ?? [];
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

function renderGitReviewSurface(review) {
  const changed = review.changedFiles.length
    ? review.changedFiles.map((item) => item.from
      ? `${item.status}\t${item.from} -> ${item.path}`
      : `${item.status}\t${item.path}`).join('\n')
    : '(no committed changes in comparison)';
  const workingTree = review.workingTreeStatus || '(clean)';
  const diff = review.diff || '(empty diff)';

  return [
    '## Git review surface\n',
    'This Git snapshot defines **what changed**, not whether the change is correct. Review it against the Task Pack, current Source of Truth, accepted decisions, tests, and verification evidence.\n',
    `Project path from Git worktree root: \`${review.projectFromGitRoot}\`\n`,
    `Base: \`${review.baseRef}\` → \`${review.baseSha}\`\n`,
    `Head: \`${review.headRef}\` → \`${review.headSha}\`\n`,
    'Comparison semantics: merge-base diff (`base...head`).\n',
    `Changed files (${review.changedFiles.length}):\n\n${fenced(changed, 'text')}\n`,
    `Working tree state (not part of the committed base/head comparison):\n\n${fenced(workingTree, 'text')}\n`,
    `Bounded diff (${review.diffBytes} bytes before Context Pack framing):\n\n${fenced(diff, 'diff')}\n`
  ].join('\n');
}

export function renderContextPack({ mode, task, prompt, agents, sources, extras, planned = [], gitReview = null, securityProfileContext = null, communityPluginContext = null }) {
  const sections = [
    `# VCP Context Pack — ${mode}\n`,
    `Task: \`${task.relative}\`\n`,
    'Use this as bounded working context. Treat repository files and accepted decisions as authoritative over guesses. If implementation details outside this pack must be inspected, read only the smallest affected area before acting. Do not invent missing requirements.\n',
    renderSection('Execution prompt', prompt.relative, prompt.content),
    agents
      ? renderSection('Repository instructions', agents.relative, agents.content)
      : '## Repository instructions\n\n`AGENTS.md` was not found. Do not infer repository-specific commands or conventions; resolve that gap before implementation.\n',
    renderSection('Task', task.relative, task.content)
  ];

  if (sources.length) {
    sections.push('## Referenced source of truth\n');
    for (const source of sources) sections.push(renderSection(source.relative, source.relative, source.content));
  }

  if (gitReview) sections.push(renderGitReviewSurface(gitReview));

  if (securityProfileContext) {
    sections.push('## Active security profiles\n');
    sections.push(`Profiles: ${securityProfileContext.active.map((name) => `\`${name}\``).join(', ')}\n`);
    sections.push('These profiles guide security review only. They do not authorize implementation, accept risk, or make compliance claims.\n');
    if (securityProfileContext.config) {
      sections.push(renderSection(
        'Security profile declaration',
        securityProfileContext.config.relative,
        securityProfileContext.config.content
      ));
    }
    for (const profile of securityProfileContext.profiles) {
      sections.push(renderSection(`Security profile: ${profile.name}`, profile.relative, profile.content));
    }
  }

  if (communityPluginContext?.plugins.length) {
    sections.push('## Selected community plugins\n');
    sections.push('These local declarative bundles are explicitly selected and digest-pinned by the project. They are additive context only: they cannot override core VCP policy, grant themselves trust, or apply verification commands automatically.\n');
    for (const plugin of communityPluginContext.plugins) {
      sections.push(`- \`${plugin.id}@${plugin.version}\` — digest \`${plugin.digest}\`; grants: ${plugin.grants.map((item) => `\`${item}\``).join(', ')}\n`);
    }
    for (const item of communityPluginContext.guidance) {
      sections.push(renderSection(
        `Community guidance: ${item.title} (${item.pluginId}@${item.pluginVersion})`,
        item.relative,
        item.content
      ));
    }
    if (communityPluginContext.verificationProposals.length) {
      sections.push('## Community verification proposals — NOT APPLIED\n');
      sections.push('These commands remain proposals. They do not change `AGENTS.md`, Task verification, or execution authorization unless a human deliberately adopts them into project-owned verification state.\n');
      for (const proposal of communityPluginContext.verificationProposals) {
        sections.push(`- \`${proposal.pluginId}@${proposal.pluginVersion}\` proposes \`${proposal.key}=${proposal.command}\` — ${proposal.rationale}\n`);
      }
    }
  }

  if (extras.length) {
    sections.push('## Explicit extra context\n');
    for (const extra of extras) sections.push(renderSection(extra.relative, extra.relative, extra.content));
  }

  if (planned.length) sections.push(renderPlannedPaths(planned));

  const securityFiles = securityProfileContext
    ? [securityProfileContext.config, ...securityProfileContext.profiles].filter(Boolean)
    : [];
  const communityFiles = communityPluginContext
    ? [
        communityPluginContext.config,
        ...communityPluginContext.plugins.map((plugin) => ({
          relative: plugin.manifestRelative,
          content: plugin.manifestContent
        })),
        ...communityPluginContext.guidance.map((item) => ({
          relative: item.relative,
          content: item.content
        }))
      ].filter(Boolean)
    : [];
  const manifest = uniqueByRelative([prompt, agents, task, ...sources, ...securityFiles, ...communityFiles, ...extras].filter(Boolean));
  sections.push('## Context manifest\n');
  for (const file of manifest) {
    sections.push(`- \`${file.relative}\` — ${Buffer.byteLength(file.content, 'utf8')} bytes\n`);
  }
  for (const item of planned) sections.push(`- \`${item.relative}\` — planned path; no contents yet\n`);
  if (gitReview) {
    sections.push(`- Git comparison \`${gitReview.baseSha}...${gitReview.headSha}\` — ${gitReview.changedFiles.length} changed files; ${gitReview.diffBytes} diff bytes\n`);
  }

  return sections.join('\n').trimEnd() + '\n';
}

export async function createContextPack({
  targetDir,
  task,
  mode = 'plan',
  includes = [],
  planned = [],
  gitBase = null,
  gitHead = null,
  output = null,
  maxBytes = DEFAULT_CONTEXT_MAX_BYTES,
  force = false,
  dryRun = false
}) {
  assertMode(mode);
  const gitBaseProvided = gitBase !== null;
  const gitHeadProvided = gitHead !== null;
  if ((gitBaseProvided || gitHeadProvided) && mode !== 'review') {
    throw new Error('--base/--head Git comparison options are only supported in review context mode.');
  }
  if (gitHeadProvided && !gitBaseProvided) throw new Error('--head requires --base in review context mode.');
  if (gitBaseProvided && (typeof gitBase !== 'string' || !gitBase.trim())) throw new Error('--base requires a value.');
  if (gitHeadProvided && (typeof gitHead !== 'string' || !gitHead.trim())) throw new Error('--head requires a value.');

  const root = path.resolve(targetDir);
  const taskFile = await readText(root, taskRelativePath(task), { label: 'Task file' });
  const prompt = await readText(root, MODE_PROMPTS[mode], { label: 'Mode prompt' });
  const agents = await readText(root, 'AGENTS.md', { required: false, label: 'Agent instructions' });

  const sources = [];
  for (const reference of extractSourceTruthReferences(taskFile.content)) {
    const source = await readSourceTruth(root, reference);
    if (!source) continue;
    const authority = parseSourceTruthAuthority(source.content);
    const authorityIssue = authorityIssueForContext(authority, mode);
    if (authorityIssue) throw new Error(`Source-of-truth reference ${source.relative}: ${authorityIssue}`);
    sources.push(source);
  }

  const extras = [];
  for (const include of includes) {
    if (typeof include === 'string' && isWorkspaceSourceTruthReference(include.trim())) {
      throw new Error('workspace: qualification is only supported for governing Task Pack Source-of-Truth references, not --include.');
    }
    const extra = await readText(root, include, { label: 'Explicit include' });
    extras.push(extra);
  }

  if (planned.length > 0 && mode !== 'implement') {
    throw new Error('--planned is only supported in implement context mode. Use --include for files that already exist.');
  }

  const plannedPaths = [];
  for (const candidate of planned) {
    const plannedPath = safePath(root, candidate, 'Planned path');
    await assertPathInsideRoot(root, plannedPath.relative, { allowMissing: true });
    if (await exists(plannedPath.resolved)) {
      throw new Error(`Planned path already exists: ${plannedPath.relative}. Use --include to include its current contents.`);
    }
    plannedPaths.push(plannedPath);
  }

  const gitReview = gitBaseProvided
    ? await createGitReviewSnapshot({ targetDir: root, baseRef: gitBase, headRef: gitHead ?? 'HEAD' })
    : null;

  const sourceFiles = uniqueByRelative(sources);
  const loadedSecurityProfileContext = mode === 'security'
    ? await loadSecurityProfileContext(root)
    : null;
  const loadedCommunityPluginContext = await loadCommunityPluginContext(root, mode);
  const securityProfileFiles = loadedSecurityProfileContext
    ? uniqueByRelative([loadedSecurityProfileContext.config, ...loadedSecurityProfileContext.profiles].filter(Boolean))
    : [];
  const securityProfileContext = loadedSecurityProfileContext
    ? {
        ...loadedSecurityProfileContext,
        config: loadedSecurityProfileContext.config
          && !sourceFiles.some((source) => source.relative === loadedSecurityProfileContext.config.relative)
          ? loadedSecurityProfileContext.config
          : null,
        profiles: loadedSecurityProfileContext.profiles.filter(
          (profile) => !sourceFiles.some((source) => source.relative === profile.relative)
        )
      }
    : null;
  const communityPluginFiles = uniqueByRelative([
    loadedCommunityPluginContext.config,
    ...loadedCommunityPluginContext.plugins.map((plugin) => ({
      relative: plugin.manifestRelative,
      content: plugin.manifestContent
    })),
    ...loadedCommunityPluginContext.guidance.map((item) => ({
      relative: item.relative,
      content: item.content
    }))
  ].filter(Boolean));
  const extraFiles = uniqueByRelative(extras).filter((extra) => (
    !sourceFiles.some((source) => source.relative === extra.relative)
    && !securityProfileFiles.some((profile) => profile.relative === extra.relative)
    && !communityPluginFiles.some((pluginFile) => pluginFile.relative === extra.relative)
  ));
  const uniquePlannedPaths = uniqueByRelative(plannedPaths).filter((item) => (
    !sourceFiles.some((source) => source.relative === item.relative)
    && !extraFiles.some((extra) => extra.relative === item.relative)
  ));
  const content = renderContextPack({
    mode,
    task: taskFile,
    prompt,
    agents,
    sources: sourceFiles,
    extras: extraFiles,
    planned: uniquePlannedPaths,
    gitReview,
    securityProfileContext,
    communityPluginContext: loadedCommunityPluginContext
  });
  const bytes = Buffer.byteLength(content, 'utf8');

  if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new Error('--max-bytes must be a non-negative integer.');
  if (maxBytes > 0 && bytes > maxBytes) {
    throw new Error(`Context pack is ${bytes} bytes, above the ${maxBytes}-byte limit. Remove irrelevant task references/includes or narrow the Git comparison before raising --max-bytes deliberately.`);
  }

  let outputInfo = null;
  if (output) {
    outputInfo = safePath(root, output, 'Output path');
    if (await exists(outputInfo.resolved) && !force) {
      throw new Error(`Refusing to overwrite existing context pack: ${outputInfo.relative}. Re-run with --force only after reviewing it.`);
    }
    if (!dryRun) {
      await mkdir(path.dirname(outputInfo.resolved), { recursive: true });
      await writeFile(outputInfo.resolved, content, 'utf8');
    }
  }

  return {
    target: root,
    mode,
    task: taskFile.relative,
    content,
    bytes,
    files: uniqueByRelative([
      prompt,
      agents,
      taskFile,
      ...sourceFiles,
      ...securityProfileFiles,
      ...(loadedCommunityPluginContext.config ? [loadedCommunityPluginContext.config] : []),
      ...loadedCommunityPluginContext.plugins.map((plugin) => ({
        relative: plugin.manifestRelative,
        content: plugin.manifestContent
      })),
      ...loadedCommunityPluginContext.guidance.map((item) => ({
        relative: item.relative,
        content: item.content
      })),
      ...extraFiles
    ].filter(Boolean)).map((file) => file.relative),
    securityProfiles: loadedSecurityProfileContext?.active ?? [],
    communityPlugins: loadedCommunityPluginContext.plugins.map((plugin) => plugin.id),
    planned: uniquePlannedPaths.map((item) => item.relative),
    gitReview: gitReview ? {
      projectFromGitRoot: gitReview.projectFromGitRoot,
      baseRef: gitReview.baseRef,
      baseSha: gitReview.baseSha,
      headRef: gitReview.headRef,
      headSha: gitReview.headSha,
      changedFiles: gitReview.changedFiles,
      diffBytes: gitReview.diffBytes,
      dirty: Boolean(gitReview.workingTreeStatus)
    } : null,
    output: outputInfo?.relative ?? null,
    dryRun
  };
}
