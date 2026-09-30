import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { runTaskReadiness } from './readiness.mjs';
import { parseTaskVerificationCommands } from './verification-commands.mjs';

const execFileAsync = promisify(execFile);
const GIT_METADATA_MAX_BUFFER_BYTES = 8 * 1024 * 1024;

export const DEFAULT_VERIFY_TIMEOUT_MS = 900_000;

function taskRelativePath(task) {
  if (!task) throw new Error('Verify command requires a task slug or task file path.');
  if (task.includes('/') || task.includes('\\') || task.endsWith('.md')) return task;
  return path.join('docs', 'tasks', `${task}.md`);
}

function safePath(root, candidate, label = 'path') {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, candidate.replaceAll('\\', '/'));
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`${label} escapes the repository root: ${candidate}`);
  }
  const relative = path.relative(normalizedRoot, resolved).split(path.sep).join('/');
  return { resolved, relative: relative || '.' };
}

function portableRelative(root, target) {
  return (path.relative(root, target) || '.').split(path.sep).join('/');
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function runGitMetadata(cwd, args) {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_METADATA_MAX_BUFFER_BYTES,
    windowsHide: true
  });
  return stdout;
}

function gitErrorMessage(error) {
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : '';
  return stderr || error?.message || 'unknown Git failure';
}

function gitWorkspaceUnavailable(error) {
  if (error?.code === 'ENOENT') return true;
  return /not a git repository|not a git work tree/i.test(gitErrorMessage(error));
}

function gitHeadIsUnborn(error) {
  return /needed a single revision|unknown revision|bad revision|ambiguous argument .*head/i.test(gitErrorMessage(error));
}

async function inspectVerificationScope(targetDir) {
  const projectRoot = path.resolve(targetDir);
  let workspaceRoot;

  try {
    workspaceRoot = (await runGitMetadata(projectRoot, ['rev-parse', '--show-toplevel'])).trim();
  } catch (error) {
    if (!gitWorkspaceUnavailable(error)) {
      throw new Error(`Unable to inspect Git workspace provenance: ${gitErrorMessage(error)}`);
    }
    return {
      scope: {
        kind: 'project',
        projectPath: '.'
      },
      revision: null
    };
  }

  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  if (projectRoot !== normalizedWorkspaceRoot && !projectRoot.startsWith(`${normalizedWorkspaceRoot}${path.sep}`)) {
    throw new Error(`Git worktree root does not contain the selected project root: ${normalizedWorkspaceRoot}`);
  }

  let headSha = null;
  try {
    const candidate = (await runGitMetadata(normalizedWorkspaceRoot, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim();
    if (!/^[0-9a-f]{40,64}$/i.test(candidate)) {
      throw new Error(`Git HEAD provenance did not resolve to a commit SHA: ${candidate || '(empty)'}`);
    }
    headSha = candidate;
  } catch (error) {
    if (!gitHeadIsUnborn(error)) {
      throw new Error(`Unable to resolve Git HEAD provenance: ${gitErrorMessage(error)}`);
    }
  }

  let status;
  try {
    status = await runGitMetadata(normalizedWorkspaceRoot, ['status', '--short', '--untracked-files=all']);
  } catch (error) {
    throw new Error(`Unable to inspect Git worktree state for verification provenance: ${gitErrorMessage(error)}`);
  }

  return {
    scope: {
      kind: 'git-worktree',
      projectPath: portableRelative(normalizedWorkspaceRoot, projectRoot)
    },
    revision: {
      system: 'git',
      headSha,
      dirty: Boolean(status.trim())
    }
  };
}

function selectCommands(commands, only = []) {
  if (!only.length) return commands.filter(({ key }) => key !== 'INSTALL_COMMAND');
  const wanted = new Set(only.map((value) => value.trim().toUpperCase()));
  const known = new Set(commands.map(({ key }) => key));
  const unknown = [...wanted].filter((key) => !known.has(key));
  if (unknown.length) throw new Error(`Unknown or unconfigured verification key(s): ${unknown.join(', ')}.`);
  return commands.filter(({ key }) => wanted.has(key));
}

async function executeCommand({ command, cwd, timeoutMs, quiet }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, {
      cwd,
      env: process.env,
      shell: true,
      stdio: quiet ? ['ignore', 'ignore', 'ignore'] : 'inherit'
    });

    let timedOut = false;
    let timer = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({
        status: 'fail',
        exitCode: null,
        signal: null,
        timedOut,
        durationMs: Date.now() - started,
        error: error.message
      });
    });

    child.on('exit', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        status: code === 0 && !timedOut ? 'pass' : 'fail',
        exitCode: code,
        signal: signal ?? null,
        timedOut,
        durationMs: Date.now() - started,
        error: null
      });
    });
  });
}

export async function buildVerificationPlan({ targetDir, task, only = [] }) {
  const target = path.resolve(targetDir);
  const taskPath = safePath(target, taskRelativePath(task), 'Task path');
  if (!(await exists(taskPath.resolved))) throw new Error(`Task file not found: ${taskPath.relative}`);
  const content = await readFile(taskPath.resolved, 'utf8');
  const configured = parseTaskVerificationCommands(content);
  if (!configured.length) {
    throw new Error('No concrete verification commands were found in the task. Recreate/update the task after configuring AGENTS.md.');
  }
  const commands = selectCommands(configured, only);
  if (!commands.length) throw new Error('No verification commands selected.');
  return { target, task: taskPath.relative, commands };
}

export async function runVerification({
  targetDir,
  task,
  only = [],
  run = false,
  output = null,
  force = false,
  timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  quiet = false
}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) throw new Error('--timeout-ms must be a non-negative integer.');
  const plan = await buildVerificationPlan({ targetDir, task, only });
  const readiness = await runTaskReadiness({ targetDir: plan.target, task: plan.task, stage: 'implement' });

  let outputInfo = null;
  if (output) {
    outputInfo = safePath(plan.target, output, 'Evidence output path');
    if (await exists(outputInfo.resolved) && !force) {
      throw new Error(`Refusing to overwrite existing verification evidence: ${outputInfo.relative}. Re-run with --force only after reviewing it.`);
    }
  }

  const provenance = await inspectVerificationScope(plan.target);
  const report = {
    schemaVersion: 2,
    task: plan.task,
    target: plan.target,
    scope: provenance.scope,
    revision: provenance.revision,
    mode: run ? 'run' : 'preview',
    createdAt: new Date().toISOString(),
    readiness: readiness.summary,
    commands: plan.commands.map(({ key, command }) => ({ key, command, status: run ? 'pending' : 'planned' }))
  };

  if (run && readiness.summary.fail > 0) {
    throw new Error(`Task is not ready for implementation (${readiness.summary.fail} readiness failure(s)). Run vcp ready ${task} --stage implement first.`);
  }

  if (run) {
    let blocked = false;
    for (const item of report.commands) {
      if (blocked) {
        item.status = 'skipped';
        item.reason = 'A previous verification command failed.';
        continue;
      }
      if (!quiet) console.log(`\n[VCP verify] ${item.key}: ${item.command}`);
      const result = await executeCommand({ command: item.command, cwd: plan.target, timeoutMs, quiet });
      Object.assign(item, result);
      if (result.status === 'fail') blocked = true;
    }
  }

  const counts = { pass: 0, fail: 0, skipped: 0, planned: 0 };
  for (const item of report.commands) counts[item.status] = (counts[item.status] ?? 0) + 1;
  report.summary = counts;
  report.success = run ? counts.fail === 0 && counts.skipped === 0 : null;

  if (outputInfo) {
    report.output = outputInfo.relative;
    await mkdir(path.dirname(outputInfo.resolved), { recursive: true });
    await writeFile(outputInfo.resolved, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }

  return report;
}

export function verificationExitCode(report) {
  if (report.mode !== 'run') return 0;
  return report.success ? 0 : 1;
}

export function formatVerificationReport(report) {
  const lines = [
    `Vibe Coding Production Verification ${report.mode === 'run' ? 'Evidence' : 'Plan'}`,
    `Task: ${report.task}`,
    `Scope: ${report.scope?.kind ?? 'unknown'} / ${report.scope?.projectPath ?? '.'}`
  ];
  if (report.revision?.system === 'git') {
    const head = report.revision.headSha ?? 'unborn';
    lines.push(`Revision: ${head} (${report.revision.dirty ? 'dirty' : 'clean'} worktree)`);
  } else {
    lines.push('Revision: unavailable (no Git provenance recorded)');
  }
  lines.push(
    `Readiness: ${report.readiness.pass} pass, ${report.readiness.warn} warn, ${report.readiness.fail} fail`,
    ''
  );
  for (const item of report.commands) {
    const suffix = item.durationMs !== undefined ? ` (${item.durationMs} ms${item.exitCode === null || item.exitCode === undefined ? '' : `, exit ${item.exitCode}`})` : '';
    lines.push(`[${item.status.toUpperCase()}] ${item.key}: ${item.command}${suffix}`);
    if (item.timedOut) lines.push('       Timed out.');
    if (item.error) lines.push(`       Error: ${item.error}`);
    if (item.reason) lines.push(`       ${item.reason}`);
  }
  lines.push('');
  if (report.mode === 'preview') {
    lines.push('No commands were executed. Re-run with --run to execute this repository-controlled verification plan.');
  } else {
    lines.push(`Summary: ${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.skipped} skipped`);
  }
  if (report.output) lines.push(`Evidence: ${report.output}`);
  return lines.join('\n');
}
