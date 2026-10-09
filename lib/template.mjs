import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adapterFiles } from './adapters.mjs';
import { requireAssetSet, selectAssetPaths } from './asset-catalog.mjs';
import { applyStackProfileToContent } from './stacks.mjs';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CORE_ASSET_ROOTS = [
  'AGENTS.md',
  'docs',
  'prompts',
  'examples/feature-spec.example.md',
  'scripts/validate-framework.sh',
  'scripts/validate-framework.mjs'
];

export const GITHUB_ASSET_ROOTS = [
  '.github/ISSUE_TEMPLATE',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/workflows/validate.yml'
];

export function normalizeManagedPath(relative) {
  if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0')) {
    throw new Error('Managed path must be a non-empty relative path.');
  }
  const normalized = relative.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe managed path: ${relative}`);
  }
  const clean = path.posix.normalize(normalized);
  if (clean === '.' || clean.startsWith('.vcp/') || clean === '.vcp') {
    throw new Error(`Reserved managed path: ${relative}`);
  }
  return clean;
}

export function normalizeTemplateText(content) {
  return content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

export async function assertPathInsideRoot(root, relative, { allowMissing = true } = {}) {
  const safe = normalizeManagedPath(relative);
  const rootResolved = path.resolve(root);
  const candidate = path.resolve(rootResolved, safe);
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`Path escapes repository root: ${relative}`);
  }

  const parts = safe.split('/');
  let current = rootResolved;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Refusing to follow symlink in managed path: ${relative}`);
    } catch (error) {
      if (error?.code === 'ENOENT' && allowMissing) break;
      throw error;
    }
  }
  return candidate;
}

async function expandAsset(relative) {
  const safe = normalizeManagedPath(relative);
  const source = path.join(packageRoot, safe);
  const sourceStat = await stat(source);
  if (sourceStat.isFile()) return [safe];
  const result = [];
  async function walk(currentRelative) {
    const entries = await readdir(path.join(packageRoot, currentRelative), { withFileTypes: true });
    for (const entry of entries) {
      const child = normalizeManagedPath(path.posix.join(currentRelative.replaceAll('\\', '/'), entry.name));
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) result.push(child);
    }
  }
  await walk(safe);
  return result;
}

export async function expandAssetRoots(roots) {
  return (await Promise.all(roots.map(expandAsset))).flat().sort();
}

function policyForPath(relative) {
  if (relative === 'AGENTS.md') return 'merge';
  if (relative === 'CLAUDE.md' || relative === '.github/copilot-instructions.md') return 'generated';
  if (/^docs\/(product|architecture)\//.test(relative)) return 'preserve';
  if (relative === 'docs/security/THREAT-MODEL.md' || relative === 'docs/security/SECURITY-PROFILE.md' || relative === 'docs/testing/TEST-STRATEGY.md') return 'preserve';
  if (/^docs\/security\/profiles\/.*\.md$/.test(relative)) return 'merge';
  if (/^docs\/delivery\/(DEFINITION-OF-READY|DEFINITION-OF-DONE)\.md$/.test(relative)) return 'merge';
  if (/^prompts\//.test(relative)) return 'merge';
  if (/^scripts\/validate-framework\.(?:sh|mjs)$/.test(relative)) return 'merge';
  if (/^\.github\/(ISSUE_TEMPLATE|PULL_REQUEST_TEMPLATE\.md|workflows\/)/.test(relative)) return 'merge';
  return 'managed';
}

async function sourceMode(relative) {
  const info = await stat(path.join(packageRoot, relative));
  return info.mode & 0o777;
}

export async function buildDesiredFiles({ targetDir, agent = 'generic', stack = 'auto', includeGitHub = true, assetSet = 'legacy-full-v1' }) {
  requireAssetSet(assetSet);
  const roots = [...CORE_ASSET_ROOTS, ...(includeGitHub ? GITHUB_ASSET_ROOTS : [])];
  const sourceFiles = selectAssetPaths(assetSet, await expandAssetRoots(roots), { includeGitHub });
  const files = new Map();
  for (const relative of sourceFiles) {
    files.set(relative, {
      content: normalizeTemplateText(await readFile(path.join(packageRoot, relative), 'utf8')),
      mode: await sourceMode(relative),
      policy: policyForPath(relative),
      origin: 'template'
    });
  }

  for (const [relativeRaw, content] of adapterFiles(agent)) {
    const relative = normalizeManagedPath(relativeRaw);
    if (!selectAssetPaths(assetSet,[relative],{includeGitHub}).length) continue;
    files.set(relative, { content: normalizeTemplateText(content), mode: 0o644, policy: policyForPath(relative), origin: 'adapter' });
  }

  const agents = files.get('AGENTS.md');
  if (!agents) throw new Error('Package template is missing AGENTS.md.');
  const stackResult = await applyStackProfileToContent(path.resolve(targetDir), stack, agents.content);
  files.set('AGENTS.md', { ...agents, content: normalizeTemplateText(stackResult.content) });

  return { files, stack: stackResult.stack, assetSet };
}
