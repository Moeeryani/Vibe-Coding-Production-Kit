import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

function portablePath(value) {
  return value.split(path.sep).join('/');
}

function validateRef(ref, label) {
  if (!ref || typeof ref !== 'string' || !ref.trim()) throw new Error(`${label} must be a non-empty Git ref.`);
  const normalized = ref.trim();
  if (normalized.startsWith('-')) throw new Error(`${label} must not start with "-": ${normalized}`);
  if (normalized.includes('\0')) throw new Error(`${label} contains an invalid NUL byte.`);
  return normalized;
}

function gitFailure(label, error) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
  const message = stderr || error?.message || 'unknown Git failure';
  return new Error(`${label}: ${message}`);
}

async function runGit(cwd, args, label) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      maxBuffer: GIT_MAX_BUFFER_BYTES,
      windowsHide: true
    });
    return stdout;
  } catch (error) {
    throw gitFailure(label, error);
  }
}

async function resolveCommit(gitRoot, ref, label) {
  const safeRef = validateRef(ref, label);
  const stdout = await runGit(
    gitRoot,
    ['rev-parse', '--verify', `${safeRef}^{commit}`],
    `${label} could not be resolved (${safeRef})`
  );
  const sha = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/i.test(sha)) throw new Error(`${label} did not resolve to a commit SHA: ${safeRef}`);
  return { ref: safeRef, sha };
}

function parseNameStatusZ(output) {
  const tokens = output.split('\0');
  if (tokens.at(-1) === '') tokens.pop();
  const files = [];

  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!status) continue;
    if (/^[RC]/.test(status)) {
      const from = tokens[index++];
      const to = tokens[index++];
      if (from === undefined || to === undefined) throw new Error('Git changed-file output ended unexpectedly while parsing a rename/copy.');
      files.push({ status, path: to, from });
      continue;
    }
    const filePath = tokens[index++];
    if (filePath === undefined) throw new Error('Git changed-file output ended unexpectedly while parsing a path.');
    files.push({ status, path: filePath, from: null });
  }

  return files;
}

export async function createGitReviewSnapshot({ targetDir, baseRef, headRef = 'HEAD' }) {
  const target = path.resolve(targetDir);
  let gitRoot;
  try {
    gitRoot = (await runGit(target, ['rev-parse', '--show-toplevel'], 'Unable to locate Git worktree')).trim();
  } catch (error) {
    throw new Error(`Git-aware review requires the project directory to be inside a Git worktree. ${error.message}`);
  }

  const normalizedRoot = path.resolve(gitRoot);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Git worktree root does not contain the project directory: ${normalizedRoot}`);
  }

  const base = await resolveCommit(normalizedRoot, baseRef, 'Review base');
  const head = await resolveCommit(normalizedRoot, headRef, 'Review head');
  const comparison = `${base.sha}...${head.sha}`;

  const changedRaw = await runGit(
    normalizedRoot,
    ['diff', '--name-status', '-z', '--find-renames', '--ignore-submodules=dirty', comparison, '--'],
    'Unable to enumerate Git review changes'
  );
  const changedFiles = parseNameStatusZ(changedRaw);

  const diff = await runGit(
    normalizedRoot,
    ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames', '--ignore-submodules=dirty', '--unified=3', comparison, '--'],
    'Unable to render Git review diff'
  );
  const workingTreeStatus = await runGit(
    normalizedRoot,
    ['status', '--short', '--untracked-files=all'],
    'Unable to inspect Git working tree status'
  );

  return {
    projectFromGitRoot: portablePath(path.relative(normalizedRoot, target) || '.'),
    baseRef: base.ref,
    baseSha: base.sha,
    headRef: head.ref,
    headSha: head.sha,
    changedFiles,
    diff,
    diffBytes: Buffer.byteLength(diff, 'utf8'),
    workingTreeStatus: workingTreeStatus.trimEnd()
  };
}
