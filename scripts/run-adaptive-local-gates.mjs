#!/usr/bin/env node
// Local receipt producer. Cooperative, not a trusted remote merge gate.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function parse(args) {
  if (args.length !== 4) throw new Error(
    'Usage: node scripts/run-adaptive-local-gates.mjs --expected-sha <40-hex> --evidence-dir <fresh-absolute-directory-outside-repo>'
  );
  const o = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--expected-sha', '--evidence-dir'].includes(args[i]) || o[args[i]]) throw new Error('Bad argument: ' + args[i]);
    o[args[i]] = args[i + 1];
  }
  if (!/^[0-9a-f]{40}$/i.test(o['--expected-sha'] ?? '')) throw new Error('Supply a complete expected Git SHA');
  if (!path.isAbsolute(o['--evidence-dir'] ?? '')) throw new Error('Evidence directory MUST be an absolute path');
  return { expected: o['--expected-sha'].toLowerCase(), out: path.resolve(o['--evidence-dir']) };
}
function command(name, args) {
  const start = new Date().toISOString();
  const executable = name === 'npm' && process.platform === 'win32' ? 'npm.cmd' : name;
  // Only fixed local commands are invoked. The shell mode on Windows supports .cmd.
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32' && name === 'npm',
    timeout: 180000
  });
  return {
    invocation: [name, ...args], startedAtUtc: start, completedAtUtc: new Date().toISOString(),
    exitCode: result.status, signal: result.signal ?? null,
    error: result.error?.message ?? null,
    stdout: result.stdout ?? '', stderr: result.stderr ?? ''
  };
}
export function sha256Utf8(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function successful(r) { return r.exitCode === 0 && !r.signal && !r.error; }
function singleLine(r) { return r.stdout.trim().split(/\r?\n/)[0] || ''; }
function inRoot(target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
async function main() {
  const { expected, out } = parse(process.argv.slice(2));
  const parent = await realpath(path.dirname(out));
  if (inRoot(out) || inRoot(path.join(parent, path.basename(out)))) {
    throw new Error('Evidence MUST be outside source checkout; no generated receipts in repository');
  }
  const shaBefore = command('git', ['rev-parse', '--verify', 'HEAD']);
  const statusBefore = command('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  if (!successful(shaBefore) || singleLine(shaBefore).toLowerCase() !== expected) {
    throw new Error('Expected SHA does not match checked-out HEAD — refusing unsupported receipt');
  }
  if (!successful(statusBefore) || statusBefore.stdout.trim()) {
    throw new Error('Working tree must be clean BEFORE local gates (including untracked files)');
  }
  await mkdir(out);
  const steps = [
    ['check-adaptive-contracts', 'node', [path.join(root, 'scripts', 'check-adaptive-contracts.mjs')]],
    ['npm-ci', 'npm', ['ci', '--no-audit', '--no-fund']],
    ['npm-validate', 'npm', ['run', 'validate']],
    ['npm-pack-check', 'npm', ['run', 'pack:check']]
  ];
  const results = [];
  for (const [slug, executable, args] of steps) {
    const r = command(executable === 'node' ? process.execPath : executable, args);
    const stdoutFile = slug + '.stdout.log';
    const stderrFile = slug + '.stderr.log';
    await writeFile(path.join(out, stdoutFile), r.stdout, { flag: 'wx' });
    await writeFile(path.join(out, stderrFile), r.stderr, { flag: 'wx' });
    results.push({
      step: slug, invocation: r.invocation, startedAtUtc: r.startedAtUtc,
      completedAtUtc: r.completedAtUtc, exitCode: r.exitCode, signal: r.signal,
      error: r.error, stdoutFile, stderrFile,
      stdoutSha256: sha256Utf8(r.stdout), stderrSha256: sha256Utf8(r.stderr)
    });
  }
  const shaAfter = command('git', ['rev-parse', '--verify', 'HEAD']);
  const statusAfter = command('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  const unchanged = successful(shaAfter) && singleLine(shaAfter).toLowerCase() === expected &&
    successful(statusAfter) && !statusAfter.stdout.trim();
  const passed = unchanged && results.every(x => x.exitCode === 0 && !x.error && !x.signal);
  const receipt = {
    receiptSchemaVersion: 1, evidenceKind: 'cooperative-local-PR-gate',
    result: passed ? 'LOCAL_GATE_PASS_NOT_REMOTE_ENFORCEMENT' : 'LOCAL_GATE_FAIL',
    verificationLimitations: [
      'Not independently attested; maintainer must review raw logs and final PR head',
      'No GitHub Actions checks or trusted remote status guarantees',
      'Does not approve D-01, G-DOCS, G-FENCE, schema-v2 migration, or merges',
      'A passing Linux run is not a Windows native run'
    ],
    git: { expectedHeadSha: expected, before: singleLine(shaBefore),
      after: singleLine(shaAfter), cleanBefore: true, cleanAfter: successful(statusAfter) && !statusAfter.stdout.trim(),
      statusAfter: statusAfter.stdout },
    platform: { name: process.platform, architecture: process.arch, release: os.release(),
      node: process.version, npm: singleLine(command('npm', ['--version'])),
      git: singleLine(command('git', ['--version'])) },
    runner: { host: 'LOCAL_COMPUTER', recordedAtUtc: new Date().toISOString(),
      evidenceDirectory: out },
    steps: results
  };
  await writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(receipt.result + ' SHA=' + expected + ' EVIDENCE=' + path.join(out, 'receipt.json'));
  if (!passed) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error('LOCAL_GATE_NO_RECEIPT: ' + e.message); process.exitCode = 2; });
}
