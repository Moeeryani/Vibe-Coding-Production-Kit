import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const WORKSPACE_PREFIX = 'workspace:';

function stripAnchor(value) {
  return value.split('#', 1)[0].trim();
}

function portablePath(value) {
  return (value || '.').split(path.sep).join('/');
}

function containedRelative(root, target, label) {
  const relative = path.relative(root, target);
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} escapes the enclosing Git worktree.`);
  }
  return relative;
}

function gitEnv() {
  const env = {
    ...process.env,
    LC_ALL: 'C',
    LANG: 'C',
    LANGUAGE: 'C'
  };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_COMMON_DIR;
  return env;
}

async function gitWorktreeRoot(projectRoot) {
  try {
    const { stdout } = await execFileAsync('git', [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-C',
      projectRoot,
      'rev-parse',
      '--show-toplevel'
    ], {
      encoding: 'utf8',
      env: gitEnv(),
      windowsHide: true
    });
    const value = stdout.trim();
    if (!value) throw new Error('empty Git worktree root');
    return value;
  } catch {
    throw new Error('workspace: Source-of-truth references require the selected VCP project to be inside an accessible Git worktree.');
  }
}

export function isWorkspaceSourceTruthReference(reference) {
  return typeof reference === 'string' && reference.startsWith(WORKSPACE_PREFIX);
}

export function workspaceSourceTruthPath(reference) {
  if (!isWorkspaceSourceTruthReference(reference)) return null;
  const raw = reference.slice(WORKSPACE_PREFIX.length).trim();
  if (!raw) throw new Error('workspace: Source-of-truth reference requires a path.');
  if (raw.includes('\0')) throw new Error('workspace: Source-of-truth reference contains an invalid NUL byte.');
  if (/^[a-z]+:\/\//i.test(raw)) throw new Error(`workspace: Source-of-truth reference must be a worktree-local path, not a URL: ${raw}`);
  const withoutAnchor = stripAnchor(raw).replaceAll('\\', '/');
  if (!withoutAnchor) throw new Error(`workspace: Source-of-truth reference does not resolve to a file: ${reference}`);
  return withoutAnchor;
}

export async function resolveWorkspaceSourceTruthReference(projectRoot, reference) {
  const relativeInput = workspaceSourceTruthPath(reference);
  const selectedProject = path.resolve(projectRoot);
  const discoveredWorkspace = await gitWorktreeRoot(selectedProject);

  let canonicalProject;
  let canonicalWorkspace;
  try {
    canonicalProject = await realpath(selectedProject);
    canonicalWorkspace = await realpath(path.resolve(discoveredWorkspace));
  } catch (error) {
    throw new Error(`Unable to canonicalize workspace Source-of-truth roots: ${error.message}`);
  }

  containedRelative(canonicalWorkspace, canonicalProject, 'Selected VCP project root');

  const lexicalCandidate = path.resolve(canonicalWorkspace, relativeInput);
  const workspaceRelative = containedRelative(canonicalWorkspace, lexicalCandidate, `workspace:${relativeInput}`);

  let resolved = lexicalCandidate;
  try {
    const canonicalCandidate = await realpath(lexicalCandidate);
    containedRelative(canonicalWorkspace, canonicalCandidate, `workspace:${relativeInput}`);
    resolved = canonicalCandidate;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const normalizedRelative = portablePath(workspaceRelative || '.');
  return {
    resolved,
    relative: `${WORKSPACE_PREFIX}${normalizedRelative}`,
    workspaceRoot: canonicalWorkspace,
    workspaceRelative: normalizedRelative
  };
}
