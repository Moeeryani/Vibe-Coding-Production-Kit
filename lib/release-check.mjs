import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { compareVersions, MIGRATIONS, resolveMigrationPath } from './migrations.mjs';
import { inspectVerificationScope } from './verify.mjs';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const COMMAND_MAX_BUFFER = 32 * 1024 * 1024;

export const RELEASE_EVIDENCE_SCHEMA_VERSION = 1;
export const DEFAULT_RELEASE_POLICY = '.github/release-policy.json';
export const DEFAULT_RELEASE_TIMEOUT_MS = 900_000;

function npmExecutable() {
  return 'npm';
}

function npmRunOptions(options) {
  return { ...options, shell: process.platform === 'win32' };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function portable(value) {
  return value.split(path.sep).join('/');
}

function safeRelativePath(relative, label, { allowVcp = false } = {}) {
  if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0')) {
    throw new Error(`${label} must be a non-empty repository-relative path.`);
  }
  const normalized = relative.replaceAll('\\', '/');
  if (path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`${label} escapes the repository root: ${relative}`);
  }
  const clean = path.posix.normalize(normalized);
  if (clean === '.' || clean === '.git' || clean.startsWith('.git/')) {
    throw new Error(`${label} cannot target Git metadata: ${relative}`);
  }
  if (!allowVcp && (clean === '.vcp' || clean.startsWith('.vcp/'))) {
    throw new Error(`${label} cannot target reserved VCP state: ${relative}`);
  }
  return clean;
}

async function safeOutputPath(root, relative) {
  const clean = safeRelativePath(relative, 'Release evidence output path', { allowVcp: true });
  if ((clean === '.vcp' || clean.startsWith('.vcp/')) && !clean.startsWith('.vcp/evidence/releases/')) {
    throw new Error('Release evidence inside .vcp must stay under .vcp/evidence/releases/.');
  }
  const rootResolved = await realpath(root);
  const candidate = path.resolve(rootResolved, ...clean.split('/'));
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`Release evidence output path escapes the repository root: ${relative}`);
  }
  let current = rootResolved;
  for (const part of clean.split('/')) {
    current = path.join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Refusing to follow symlink in release evidence output path: ${relative}`);
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      throw error;
    }
  }
  return { relative: clean, absolute: candidate };
}

async function safeInputPath(root, relative, label) {
  const clean = safeRelativePath(relative, label);
  const rootResolved = await realpath(root);
  const candidate = path.resolve(rootResolved, ...clean.split('/'));
  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error(`${label} escapes the repository root: ${relative}`);
  }
  let current = rootResolved;
  for (const part of clean.split('/')) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`Refusing to follow symlink in ${label.toLowerCase()}: ${relative}`);
  }
  return { relative: clean, absolute: candidate };
}

async function runCommand(executable, args, { cwd, timeoutMs = DEFAULT_RELEASE_TIMEOUT_MS, env = process.env, shell = false } = {}) {
  try {
    const result = await execFileAsync(executable, args, {
      cwd,
      env,
      encoding: 'utf8',
      windowsHide: true,
      shell,
      timeout: timeoutMs > 0 ? timeoutMs : undefined,
      maxBuffer: COMMAND_MAX_BUFFER
    });
    return {
      ok: true,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: 0,
      timedOut: false
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout ?? '',
      stderr: error?.stderr ?? '',
      exitCode: Number.isInteger(error?.code) ? error.code : null,
      timedOut: Boolean(error?.killed && error?.signal)
    };
  }
}

async function runGit(cwd, args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync('git', [
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-C',
      cwd,
      ...args
    ], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: GIT_MAX_BUFFER,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C', LANGUAGE: 'C' }
    });
    return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim(), code: 0 };
  } catch (error) {
    if (allowFailure) {
      return {
        ok: false,
        stdout: String(error?.stdout ?? '').trim(),
        stderr: String(error?.stderr ?? '').trim(),
        code: Number.isInteger(error?.code) ? error.code : null
      };
    }
    throw new Error(String(error?.stderr ?? error?.message ?? 'Git command failed').trim());
  }
}

function parseJsonOutput(output, label) {
  const trimmed = output.trim();
  if (!trimmed) throw new Error(`${label} produced no JSON output.`);
  try {
    return JSON.parse(trimmed);
  } catch {
    const starts = [trimmed.indexOf('['), trimmed.indexOf('{')].filter((value) => value >= 0).sort((a, b) => a - b);
    for (const start of starts) {
      try {
        return JSON.parse(trimmed.slice(start));
      } catch {}
    }
    throw new Error(`${label} did not produce parseable JSON output.`);
  }
}

function check(id, status, detail, extra = {}) {
  return { id, status, detail, ...extra };
}

function addCheck(report, id, pass, detail, extra = {}) {
  report.checks.push(check(id, pass ? 'pass' : 'fail', detail, extra));
  return pass;
}

function addHumanDecision(report, id, detail) {
  report.checks.push(check(id, 'human-decision', detail));
  report.humanDecisions.push({ id, detail });
}

function hasFailure(report) {
  return report.checks.some((item) => item.status === 'fail');
}

function markdownOutsideFences(content) {
  const kept = [];
  let fence = null;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([`~]{3,})/);
    if (match) {
      const token = match[1];
      if (!fence) {
        fence = { char: token[0], length: token.length };
        continue;
      }
      if (token[0] === fence.char && token.length >= fence.length) {
        fence = null;
        continue;
      }
    }
    if (!fence) kept.push(line);
  }
  return kept.join('\n');
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function releaseSection(changelog, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...changelog.matchAll(new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})\\s*$`, 'gm'))];
}
function sectionBetween(changelog, heading) {
  const start = changelog.indexOf(heading);
  if (start < 0) return null;
  const bodyStart = changelog.indexOf('\n', start);
  if (bodyStart < 0) return '';
  const next = changelog.indexOf('\n## [', bodyStart + 1);
  return changelog.slice(bodyStart + 1, next < 0 ? changelog.length : next);
}

function validSemver(version) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version ?? '');
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('Release policy must be a JSON object.');
  if (policy.schemaVersion !== 1) throw new Error(`Unsupported release policy schemaVersion: ${policy.schemaVersion}`);
  if (typeof policy.packageName !== 'string' || !policy.packageName) throw new Error('Release policy packageName is required.');
  if (typeof policy.changelog !== 'string' || !policy.changelog) throw new Error('Release policy changelog is required.');
  if (typeof policy.releaseNotesPattern !== 'string' || !policy.releaseNotesPattern.includes('{version}')) {
    throw new Error('Release policy releaseNotesPattern must contain {version}.');
  }
  const previous = policy.previousRelease;
  if (!previous || typeof previous !== 'object') throw new Error('Release policy previousRelease is required.');
  if (!validSemver(previous.version)) throw new Error('Release policy previousRelease.version must be semantic version text.');
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(previous.tag)) {
    throw new Error('Release policy previousRelease.tag must be a version tag such as v0.9.2.');
  }
  if (previous.tag !== `v${previous.version}`) {
    throw new Error('Release policy previousRelease.tag must exactly match previousRelease.version.');
  }
  for (const key of ['version', 'tag', 'tagObjectSha', 'commitSha']) {
    if (typeof previous[key] !== 'string' || !previous[key]) throw new Error(`Release policy previousRelease.${key} is required.`);
  }
  if (!/^[0-9a-f]{40}$/i.test(previous.tagObjectSha) || !/^[0-9a-f]{40}$/i.test(previous.commitSha)) {
    throw new Error('Release policy previous release SHA values must be 40-character Git object IDs.');
  }
  if (!Array.isArray(policy.requiredPackageFiles) || policy.requiredPackageFiles.length === 0) {
    throw new Error('Release policy requiredPackageFiles must be a non-empty array.');
  }
  for (const item of policy.requiredPackageFiles) safeRelativePath(item, 'Required package file');
  if (!Array.isArray(policy.binNames) || policy.binNames.length === 0 || policy.binNames.some((item) => typeof item !== 'string' || !item)) {
    throw new Error('Release policy binNames must be a non-empty string array.');
  }
  return policy;
}

async function loadJson(file, label) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new Error(`${label} not found: ${portable(file)}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON: ${portable(file)}`);
  }
}

async function packageAliasExists(consumerRoot, alias) {
  const base = path.join(consumerRoot, 'node_modules', '.bin', alias);
  for (const candidate of [base, `${base}.cmd`, `${base}.ps1`]) {
    if (await exists(candidate)) return true;
  }
  return false;
}

function installedPackagePath(consumerRoot, packageName) {
  return path.join(consumerRoot, 'node_modules', ...packageName.split('/'));
}

export function evaluateReleasePack(entry, policy, version, tarballExists = true) {
  const packageFiles = new Set((entry?.files ?? []).map((item) => String(item.path ?? '').replaceAll('\\', '/')));
  const missingFiles = policy.requiredPackageFiles.filter((item) => !packageFiles.has(item));
  return {
    ok: Boolean(entry) && entry.name === policy.packageName && entry.version === version && tarballExists && missingFiles.length === 0,
    missingFiles
  };
}

export function validateInstallEvidence({ pkg, packageName, binNames, aliases, version, versionOutput }) {
  if (pkg?.name !== packageName || pkg?.version !== version) {
    throw new Error(`Installed package identity mismatch: expected ${packageName}@${version}, received ${pkg?.name}@${pkg?.version}.`);
  }
  for (const name of binNames) {
    if (pkg.bin?.[name] !== 'bin/vibe-coding-production.mjs') {
      throw new Error(`Installed package bin mapping for ${name} is missing or unexpected.`);
    }
    if (!aliases?.[name]) throw new Error(`Installed package did not create the ${name} CLI alias.`);
  }
  if (String(versionOutput ?? '').trim() !== version) {
    throw new Error(`Installed CLI version smoke failed: expected ${version}.`);
  }
  return true;
}

export function validateLifecycleEvidence({ preview, apply, doctor, idempotent, previousVersion, version }) {
  if (preview?.fromVersion !== previousVersion || preview?.toVersion !== version || preview?.conflicts !== 0) {
    throw new Error('Candidate lifecycle dry-run reported unexpected version identity or conflicts.');
  }
  if (apply?.blocked || !apply?.applied || apply?.toVersion !== version || !apply?.backupId) {
    throw new Error('Candidate lifecycle apply did not produce a successful backed-up update.');
  }
  if ((doctor?.summary?.fail ?? 0) !== 0) throw new Error('Post-update Doctor reported failures.');
  if (!idempotent?.upToDate || idempotent?.conflicts !== 0) {
    throw new Error('Post-update idempotence check did not report an up-to-date project.');
  }
  return {
    fromVersion: previousVersion,
    toVersion: version,
    previewChanges: preview.changes,
    previewConflicts: preview.conflicts,
    migrationIds: preview.migrationIds,
    backupCreated: Boolean(apply.backupId),
    doctor: doctor.summary,
    idempotent: true
  };
}

async function installTarball({ tarball, targetDir, packageName, binNames, version, timeoutMs }) {
  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, 'package.json'), JSON.stringify({ private: true }, null, 2) + '\n', 'utf8');
  const installed = await runCommand(npmExecutable(), [
    'install',
    tarball,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--package-lock=false',
    '--save=false'
  ], npmRunOptions({ cwd: targetDir, timeoutMs }));
  if (!installed.ok) throw new Error('Local tarball installation failed.');

  const packageDir = installedPackagePath(targetDir, packageName);
  const pkg = await loadJson(path.join(packageDir, 'package.json'), 'Installed package.json');
  const aliases = Object.fromEntries(await Promise.all(binNames.map(async (name) => [name, await packageAliasExists(targetDir, name)])));
  const binPath = path.join(packageDir, 'bin', 'vibe-coding-production.mjs');
  const versionResult = await runCommand(process.execPath, [binPath, '--version'], { cwd: targetDir, timeoutMs });
  if (!versionResult.ok) throw new Error('Installed CLI version smoke failed.');
  validateInstallEvidence({ pkg, packageName, binNames, aliases, version, versionOutput: versionResult.stdout });
  return { packageDir, binPath };
}

async function npmPack(sourceRoot, destination, timeoutMs) {
  await mkdir(destination, { recursive: true });
  const result = await runCommand(npmExecutable(), [
    'pack',
    '--json',
    '--pack-destination',
    destination
  ], npmRunOptions({ cwd: sourceRoot, timeoutMs }));
  if (!result.ok) throw new Error('npm pack failed.');
  const parsed = parseJsonOutput(result.stdout, 'npm pack');
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!entry?.filename) throw new Error('npm pack JSON did not report a package filename.');
  return { raw: entry, tarball: path.resolve(destination, entry.filename) };
}

async function inspectPreviousTag(root, policy, report) {
  const previous = policy.previousRelease;
  const ref = await runGit(root, ['rev-parse', `refs/tags/${previous.tag}`], { allowFailure: true });
  const tagObjectMatch = ref.ok && ref.stdout.toLowerCase() === previous.tagObjectSha.toLowerCase();
  addCheck(report, 'previous-tag-object', tagObjectMatch,
    tagObjectMatch
      ? `${previous.tag} tag object matches retained immutable identity ${previous.tagObjectSha}.`
      : `${previous.tag} tag object does not match retained immutable identity ${previous.tagObjectSha}.`,
    { expected: previous.tagObjectSha, actual: ref.ok ? ref.stdout : null });

  const peeled = await runGit(root, ['rev-parse', `refs/tags/${previous.tag}^{}`], { allowFailure: true });
  const commitMatch = peeled.ok && peeled.stdout.toLowerCase() === previous.commitSha.toLowerCase();
  addCheck(report, 'previous-tag-commit', commitMatch,
    commitMatch
      ? `${previous.tag} peels to retained release commit ${previous.commitSha}.`
      : `${previous.tag} does not peel to retained release commit ${previous.commitSha}.`,
    { expected: previous.commitSha, actual: peeled.ok ? peeled.stdout : null });
}

async function inspectCandidateTag(root, version, headSha, report) {
  const tag = `v${version}`;
  const ref = await runGit(root, ['show-ref', '--verify', '--hash', `refs/tags/${tag}`], { allowFailure: true });
  if (!ref.ok) {
    report.candidateTag = { tag, state: 'missing' };
    addHumanDecision(report, 'candidate-tag', `Candidate tag ${tag} does not exist. Creating the immutable tag remains a HUMAN DECISION after evidence review.`);
    return;
  }
  const peeled = await runGit(root, ['rev-parse', `refs/tags/${tag}^{}`], { allowFailure: true });
  const matches = peeled.ok && peeled.stdout.toLowerCase() === headSha.toLowerCase();
  report.candidateTag = { tag, state: matches ? 'existing-match' : 'existing-mismatch', objectSha: ref.stdout, commitSha: peeled.ok ? peeled.stdout : null };
  addCheck(report, 'candidate-tag', matches,
    matches
      ? `Existing candidate tag ${tag} resolves to this exact release revision.`
      : `Existing candidate tag ${tag} does not resolve to this exact release revision and must not be moved.`,
    { tagObjectSha: ref.stdout, commitSha: peeled.ok ? peeled.stdout : null });
}

async function runLifecycleSmoke({ root, policy, candidateTarball, version, timeoutMs, scratch, report }) {
  const previousSource = path.join(scratch, 'previous-source');
  const previousPackDir = path.join(scratch, 'previous-pack');
  const previousTool = path.join(scratch, 'previous-tool');
  const candidateTool = path.join(scratch, 'candidate-tool');
  const managedProject = path.join(scratch, 'managed-project');
  let worktreeAdded = false;
  let primaryError = null;

  try {
    const add = await runGit(root, ['worktree', 'add', '--detach', previousSource, policy.previousRelease.tag], { allowFailure: true });
    if (!add.ok) throw new Error('Unable to create previous-release worktree from the retained tag.');
    worktreeAdded = true;

    const previousPack = await npmPack(previousSource, previousPackDir, timeoutMs);
    const previousInstall = await installTarball({
      tarball: previousPack.tarball,
      targetDir: previousTool,
      packageName: policy.packageName,
      binNames: policy.binNames,
      version: policy.previousRelease.version,
      timeoutMs
    });
    const candidateInstall = await installTarball({
      tarball: candidateTarball,
      targetDir: candidateTool,
      packageName: policy.packageName,
      binNames: policy.binNames,
      version,
      timeoutMs
    });

    const initResult = await runCommand(process.execPath, [
      previousInstall.binPath,
      'init',
      managedProject,
      '--yes',
      '--stack',
      'generic',
      '--no-github'
    ], { cwd: scratch, timeoutMs });
    if (!initResult.ok) throw new Error('Previous-release init smoke failed.');

    const preview = await runCommand(process.execPath, [
      candidateInstall.binPath,
      'update',
      managedProject,
      '--dry-run',
      '--offline',
      '--to',
      version,
      '--json'
    ], { cwd: scratch, timeoutMs });
    if (!preview.ok) throw new Error('Candidate lifecycle dry-run failed.');
    const previewJson = parseJsonOutput(preview.stdout, 'Candidate lifecycle dry-run');

    const apply = await runCommand(process.execPath, [
      candidateInstall.binPath,
      'update',
      managedProject,
      '--offline',
      '--to',
      version,
      '--json'
    ], { cwd: scratch, timeoutMs });
    if (!apply.ok) throw new Error('Candidate lifecycle apply failed.');
    const applyJson = parseJsonOutput(apply.stdout, 'Candidate lifecycle apply');

    const doctor = await runCommand(process.execPath, [
      candidateInstall.binPath,
      'doctor',
      managedProject,
      '--json'
    ], { cwd: scratch, timeoutMs });
    if (!doctor.ok) throw new Error('Post-update Doctor smoke failed.');
    const doctorJson = parseJsonOutput(doctor.stdout, 'Post-update Doctor');

    const validate = await runCommand(process.execPath, [
      path.join(managedProject, 'scripts', 'validate-framework.mjs')
    ], { cwd: managedProject, timeoutMs });
    if (!validate.ok) throw new Error('Updated consumer framework validation failed.');

    const idempotent = await runCommand(process.execPath, [
      candidateInstall.binPath,
      'update',
      managedProject,
      '--dry-run',
      '--offline',
      '--to',
      version,
      '--json'
    ], { cwd: scratch, timeoutMs });
    if (!idempotent.ok) throw new Error('Post-update idempotence check failed.');
    const idempotentJson = parseJsonOutput(idempotent.stdout, 'Post-update idempotence check');
    report.lifecycle = validateLifecycleEvidence({
      preview: previewJson,
      apply: applyJson,
      doctor: doctorJson,
      idempotent: idempotentJson,
      previousVersion: policy.previousRelease.version,
      version
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (worktreeAdded) {
      const removed = await runGit(root, ['worktree', 'remove', '--force', previousSource], { allowFailure: true });
      const pruned = await runGit(root, ['worktree', 'prune'], { allowFailure: true });
      if ((!removed.ok || !pruned.ok) && !primaryError) {
        throw new Error('Temporary previous-release worktree cleanup failed.');
      }
    }
  }
}

export async function runReleaseCheck({
  targetDir,
  version,
  policyPath = DEFAULT_RELEASE_POLICY,
  run = false,
  output = null,
  force = false,
  timeoutMs = DEFAULT_RELEASE_TIMEOUT_MS,
  quiet = false
}) {
  if (!validSemver(version)) throw new Error(`Release candidate version must be semantic version text: ${version}`);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0) throw new Error('--timeout-ms must be a non-negative integer.');

  const root = await realpath(path.resolve(targetDir));
  const policyInput = await safeInputPath(root, policyPath, 'Release policy path');
  const policyRelative = policyInput.relative;
  const policy = validatePolicy(await loadJson(policyInput.absolute, 'Release policy'));

  let outputInfo = null;
  if (output) {
    outputInfo = await safeOutputPath(root, output);
    if (await exists(outputInfo.absolute) && !force) {
      throw new Error(`Refusing to overwrite existing release evidence: ${outputInfo.relative}. Re-run with --force only after reviewing it.`);
    }
  }

  const provenance = await inspectVerificationScope(root);
  if (provenance.scope.kind !== 'git-worktree' || provenance.scope.projectPath !== '.') {
    throw new Error('Release checks must run at the root of a Git worktree.');
  }

  const report = {
    schemaVersion: RELEASE_EVIDENCE_SCHEMA_VERSION,
    kind: 'release-candidate',
    mode: run ? 'run' : 'preview',
    createdAt: new Date().toISOString(),
    packageName: policy.packageName,
    version,
    candidateTag: null,
    scope: provenance.scope,
    revision: provenance.revision,
    policy: policyRelative,
    previousRelease: { ...policy.previousRelease },
    checks: [],
    humanDecisions: [],
    package: null,
    lifecycle: null,
    success: false,
    releaseApproved: false,
    published: false
  };

  addCheck(report, 'clean-revision', provenance.revision?.dirty === false && Boolean(provenance.revision?.headSha),
    provenance.revision?.dirty === false
      ? `Release evidence is bound to clean revision ${provenance.revision.headSha}.`
      : 'Release candidate worktree must be clean and have a Git HEAD revision.');

  const packageJson = await loadJson(path.join(root, 'package.json'), 'package.json');
  addCheck(report, 'package-name', packageJson.name === policy.packageName,
    packageJson.name === policy.packageName
      ? `package.json name matches ${policy.packageName}.`
      : `package.json name ${packageJson.name} does not match release policy ${policy.packageName}.`);
  addCheck(report, 'package-version', packageJson.version === version,
    packageJson.version === version
      ? `package.json version matches candidate ${version}.`
      : `package.json version ${packageJson.version} does not match candidate ${version}.`);

  const lock = await loadJson(path.join(root, 'package-lock.json'), 'package-lock.json');
  const lockMatches = lock.version === version
    && lock.packages?.['']?.version === version
    && lock.name === policy.packageName
    && lock.packages?.['']?.name === policy.packageName;
  addCheck(report, 'lockfile-version', lockMatches,
    lockMatches ? 'package-lock.json root identity matches the candidate.' : 'package-lock.json root identity does not match package.json candidate version/name.');

  const changelogPath = safeRelativePath(policy.changelog, 'Changelog path');
  const changelog = markdownOutsideFences(await readFile(path.join(root, ...changelogPath.split('/')), 'utf8'));
  const candidateSections = releaseSection(changelog, version);
  const candidateDate = candidateSections[0]?.[1] ?? null;
  const changelogValid = candidateSections.length === 1 && validIsoDate(candidateDate);
  addCheck(report, 'changelog-version', changelogValid,
    changelogValid
      ? `CHANGELOG has exactly one dated ${version} release heading (${candidateDate}).`
      : `CHANGELOG must contain exactly one valid dated [${version}] release heading; found ${candidateSections.length}.`,
    { date: candidateDate });

  const unreleased = sectionBetween(changelog, '## [Unreleased]');
  const unreleasedBullets = unreleased === null ? null : unreleased.split(/\r?\n/).filter((line) => /^\s*-\s+\S/.test(line));
  addCheck(report, 'changelog-unreleased', Array.isArray(unreleasedBullets) && unreleasedBullets.length === 0,
    unreleased === null
      ? 'CHANGELOG is missing [Unreleased].'
      : unreleasedBullets.length === 0
        ? 'CHANGELOG [Unreleased] contains no release bullets.'
        : `CHANGELOG [Unreleased] still contains ${unreleasedBullets.length} release bullet(s).`);
  const releaseNotesRelative = safeRelativePath(policy.releaseNotesPattern.replace('{version}', version), 'Release notes path');
  let releaseNotes = '';
  try {
    releaseNotes = await readFile(path.join(root, ...releaseNotesRelative.split('/')), 'utf8');
  } catch {}
  const releaseNotesSemantic = markdownOutsideFences(releaseNotes);
  const releaseNotesValid = releaseNotesSemantic.includes(`v${version}`)
    && releaseNotesSemantic.split(/\r?\n/).some((line) => line.trim() === 'Release status: Candidate — publication requires HUMAN DECISION.');
  addCheck(report, 'release-notes', releaseNotesValid,
    releaseNotesValid
      ? `Candidate release notes exist at ${releaseNotesRelative} and preserve the HUMAN DECISION boundary.`
      : `Candidate release notes at ${releaseNotesRelative} are missing the candidate identity or HUMAN DECISION marker.`);

  try {
    const migrationPath = resolveMigrationPath(policy.previousRelease.version, version, MIGRATIONS);
    const validPath = migrationPath.length > 0 && migrationPath.at(-1)?.to === version;
    addCheck(report, 'migration-chain', validPath,
      validPath
        ? `Migration chain ${policy.previousRelease.version} -> ${version}: ${migrationPath.map((item) => item.id).join(', ')}.`
        : `Migration chain from ${policy.previousRelease.version} does not terminate at ${version}.`,
      { migrationIds: migrationPath.map((item) => item.id) });
  } catch (error) {
    addCheck(report, 'migration-chain', false, error.message);
  }

  const monotonic = compareVersions(policy.previousRelease.version, version) < 0;
  addCheck(report, 'version-order', monotonic,
    monotonic
      ? `Candidate ${version} is newer than retained previous release ${policy.previousRelease.version}.`
      : `Candidate ${version} must be newer than retained previous release ${policy.previousRelease.version}.`);

  await inspectPreviousTag(root, policy, report);
  await inspectCandidateTag(root, version, provenance.revision?.headSha ?? '', report);

  addHumanDecision(report, 'npm-publish', `Actual npm publication of ${policy.packageName}@${version} remains a HUMAN DECISION and is never executed by release-check.`);

  const executableIds = ['package-inspection', 'publish-dry-run', 'install-smoke', 'lifecycle-smoke'];
  if (!run) {
    for (const id of executableIds) report.checks.push(check(id, 'planned', 'Not executed in preview mode. Re-run with --run after reviewing static release contracts.'));
  } else if (hasFailure(report)) {
    for (const id of executableIds) report.checks.push(check(id, 'skipped', 'Skipped because a static release contract failed.'));
  } else {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'vcp-release-check-'));
    try {
      const candidatePack = await npmPack(root, path.join(scratch, 'candidate-pack'), timeoutMs);
      const entry = candidatePack.raw;
      const packEvaluation = evaluateReleasePack(entry, policy, version, await exists(candidatePack.tarball));
      const packOk = packEvaluation.ok;
      addCheck(report, 'package-inspection', packOk,
        packOk
          ? `npm pack produced ${entry.filename} for ${entry.name}@${entry.version} with all required runtime files.`
          : `npm pack identity/runtime surface failed; missing: ${packEvaluation.missingFiles.join(', ') || 'none'}.`,
        { missingFiles: packEvaluation.missingFiles });
      report.package = {
        filename: entry.filename,
        name: entry.name,
        version: entry.version,
        size: entry.size ?? null,
        unpackedSize: entry.unpackedSize ?? null,
        shasum: entry.shasum ?? null,
        integrity: entry.integrity ?? null,
        fileCount: Array.isArray(entry.files) ? entry.files.length : null
      };

      if (packOk) {
        const publish = await runCommand(npmExecutable(), ['publish', '--dry-run', '--json'], npmRunOptions({ cwd: root, timeoutMs }));
        addCheck(report, 'publish-dry-run', publish.ok,
          publish.ok ? 'npm publish --dry-run completed successfully; nothing was published.' : 'npm publish --dry-run failed.',
          { exitCode: publish.exitCode, timedOut: publish.timedOut });

        try {
          const consumer = await installTarball({
            tarball: candidatePack.tarball,
            targetDir: path.join(scratch, 'install-smoke'),
            packageName: policy.packageName,
            binNames: policy.binNames,
            version,
            timeoutMs
          });
          addCheck(report, 'install-smoke', true, `Local tarball install exposed ${policy.binNames.join(' and ')} and reported version ${version}.`,
            { binPath: portable(path.relative(path.join(scratch, 'install-smoke'), consumer.binPath)) });
        } catch (error) {
          addCheck(report, 'install-smoke', false, error.message);
        }

        try {
          await runLifecycleSmoke({ root, policy, candidateTarball: candidatePack.tarball, version, timeoutMs, scratch, report });
          addCheck(report, 'lifecycle-smoke', true,
            `Local ${policy.previousRelease.version} install updated to ${version}, validated, and became idempotent without registry access.`,
            { migrationIds: report.lifecycle?.migrationIds ?? [] });
        } catch (error) {
          addCheck(report, 'lifecycle-smoke', false, error.message);
        }
      } else {
        for (const id of ['publish-dry-run', 'install-smoke', 'lifecycle-smoke']) {
          report.checks.push(check(id, 'skipped', 'Skipped because package inspection failed.'));
        }
      }
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  report.summary = {
    pass: report.checks.filter((item) => item.status === 'pass').length,
    fail: report.checks.filter((item) => item.status === 'fail').length,
    planned: report.checks.filter((item) => item.status === 'planned').length,
    skipped: report.checks.filter((item) => item.status === 'skipped').length,
    humanDecision: report.checks.filter((item) => item.status === 'human-decision').length
  };
  report.success = report.summary.fail === 0 && (!run || report.summary.planned === 0 && report.summary.skipped === 0);

  if (outputInfo) {
    report.output = outputInfo.relative;
    await mkdir(path.dirname(outputInfo.absolute), { recursive: true });
    await writeFile(outputInfo.absolute, JSON.stringify(report, null, 2) + '\n', 'utf8');
  }

  return report;
}

export function releaseCheckExitCode(report) {
  return report.success ? 0 : 1;
}

export function formatReleaseCheckReport(report) {
  const lines = [
    `VCP Release Candidate ${report.mode === 'run' ? 'Evidence' : 'Plan'}`,
    `Package: ${report.packageName}@${report.version}`,
    `Revision: ${report.revision?.headSha ?? 'unavailable'} (${report.revision?.dirty ? 'dirty' : 'clean'} worktree)`,
    ''
  ];
  for (const item of report.checks) {
    lines.push(`[${item.status.toUpperCase().replace('-', '_')}] ${item.id}: ${item.detail}`);
  }
  lines.push(
    '',
    `Summary: ${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.planned} planned, ${report.summary.skipped} skipped, ${report.summary.humanDecision} HUMAN_DECISION`,
    'Release approval: HUMAN DECISION — this command never publishes npm packages or creates/moves tags.'
  );
  if (report.output) lines.push(`Evidence: ${report.output}`);
  return lines.join('\n');
}
