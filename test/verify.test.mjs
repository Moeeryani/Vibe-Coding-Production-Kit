import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { runVerification } from '../lib/verify.mjs';

const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-verify-'));
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function writeReadyTask(target, slug, commands) {
  const dir = path.join(target, 'docs', 'tasks');
  await mkdir(dir, { recursive: true });
  const commandLines = commands.map(({ key, command }) => `- \`${key}\`: \`${command}\``).join('\n');
  const content = `# Task — Verification fixture\n\n## Outcome\n\nShip one verified change without claiming checks that were not executed.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n| Security | \`docs/security/THREAT-MODEL.md\` |\n\n## Acceptance criteria\n\n- [ ] AC-001 — Configured verification commands produce recorded pass/fail evidence.\n\n## Scope\n\n### In scope\n- Verification command execution and evidence.\n\n### Out of scope\n- Deployment and production credentials.\n\n## Affected boundaries\n\n- Modules/files likely affected: verification runner.\n- Public API/contract impact: CLI report only.\n- Data/schema/migration impact: n/a — no schema change.\n- External integration impact: n/a — local commands only.\n\n## Domain invariants\n\nEvidence must never claim a command passed unless that command exited successfully.\n\n## Security and privacy\n\n- Authentication impact: n/a — local developer tool.\n- Authorization/resource ownership: n/a — local developer tool.\n- Tenant isolation: n/a — local developer tool.\n- Input/trust boundaries: repository-controlled commands are untrusted until the user explicitly passes --run.\n- Secrets/PII/logging: raw stdout/stderr are not persisted in evidence by default.\n- Abuse/rate/replay considerations: commands execute sequentially and stop after a failure.\n- Relevant threat IDs: n/a — local tooling threat described in this task.\n\n## Failure modes and edge cases\n\n- One command exits non-zero.\n- A command exceeds the configured timeout.\n- Evidence output path already exists.\n\n## Observability\n\nRecord command key, exact command, duration, exit status, timeout state, and skipped commands.\n\n## Test plan\n\n### Unit\n- Parse task verification commands and preview without execution.\n\n### Integration / contract\n- Execute deterministic local Node commands and record results.\n\n### E2E / regression\n- Exercise the public CLI JSON path.\n\n### Negative/security paths\n- Prove failure stops later commands and output paths cannot escape the repository.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: additive CLI command.\n- Migration/backfill: n/a — no persisted schema.\n- Rollback or recovery: remove the command; evidence files are optional artifacts.\n\n## Implementation plan\n\n1. Build a preview from task-defined verification commands.\n2. Require explicit --run and implementation readiness before execution.\n3. Record deterministic pass/fail evidence without persisting command output.\n\n## Verification commands\n\n${commandLines}\n`;
  await writeFile(path.join(dir, `${slug}.md`), content, 'utf8');
}

test('verify preview does not execute repository commands', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, 'preview', [
    { key: 'UNIT_TEST_COMMAND', command: `node -e "require('node:fs').writeFileSync('verify-marker','ran')"` }
  ]);

  const report = await runVerification({ targetDir: target, task: 'preview' });
  assert.equal(report.mode, 'preview');
  assert.equal(report.commands[0].status, 'planned');
  assert.equal(await exists(path.join(target, 'verify-marker')), false);
});

test('verify run records passing evidence and can write JSON inside the repo', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, 'passing', [
    { key: 'UNIT_TEST_COMMAND', command: 'node -e "process.exit(0)"' },
    { key: 'BUILD_COMMAND', command: 'node -e "process.exit(0)"' }
  ]);

  const report = await runVerification({
    targetDir: target,
    task: 'passing',
    run: true,
    quiet: true,
    output: '.vcp/evidence/passing.json'
  });
  assert.equal(report.success, true);
  assert.equal(report.summary.pass, 2);
  assert.equal(report.summary.fail, 0);
  const evidence = JSON.parse(await readFile(path.join(target, '.vcp/evidence/passing.json'), 'utf8'));
  assert.equal(evidence.commands[0].status, 'pass');
  assert.equal('stdout' in evidence.commands[0], false);
});

test('verify stops after the first failed command', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, 'failure', [
    { key: 'UNIT_TEST_COMMAND', command: 'node -e "process.exit(2)"' },
    { key: 'BUILD_COMMAND', command: `node -e "require('node:fs').writeFileSync('should-not-run','x')"` }
  ]);

  const report = await runVerification({ targetDir: target, task: 'failure', run: true, quiet: true });
  assert.equal(report.success, false);
  assert.equal(report.commands[0].status, 'fail');
  assert.equal(report.commands[1].status, 'skipped');
  assert.equal(await exists(path.join(target, 'should-not-run')), false);
});

test('verify CLI supports explicit execution and JSON output', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, 'cli-verify', [
    { key: 'UNIT_TEST_COMMAND', command: 'node -e "process.exit(0)"' }
  ]);
  const bin = path.resolve('bin/vibe-coding-production.mjs');
  const { stdout } = await execFileAsync(process.execPath, [bin, 'verify', 'cli-verify', '--dir', target, '--run', '--json']);
  const report = JSON.parse(stdout);
  assert.equal(report.mode, 'run');
  assert.equal(report.success, true);
  assert.equal(report.summary.pass, 1);
});

test('verify refuses an existing evidence path before executing commands', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, 'output-conflict', [
    { key: 'UNIT_TEST_COMMAND', command: `node -e "require('node:fs').writeFileSync('must-not-execute','x')"` }
  ]);
  await mkdir(path.join(target, '.vcp', 'evidence'), { recursive: true });
  await writeFile(path.join(target, '.vcp', 'evidence', 'existing.json'), '{}\n');

  await assert.rejects(
    runVerification({ targetDir: target, task: 'output-conflict', run: true, quiet: true, output: '.vcp/evidence/existing.json' }),
    /Refusing to overwrite existing verification evidence/
  );
  assert.equal(await exists(path.join(target, 'must-not-execute')), false);
});

test('verify refuses to run a task that has not passed implementation readiness', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  const taskDir = path.join(target, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'unready.md'), `# Task — Unready\n\n## Verification commands\n\n- \`UNIT_TEST_COMMAND\`: \`node -e "process.exit(0)"\`\n`);

  await assert.rejects(
    runVerification({ targetDir: target, task: 'unready', run: true, quiet: true }),
    /Task is not ready for implementation/
  );
});
