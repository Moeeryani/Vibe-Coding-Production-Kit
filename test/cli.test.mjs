import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject } from '../lib/init.mjs';
import { doctorExitCode, runDoctor } from '../lib/doctor.mjs';
import { createTaskPack } from '../lib/task.mjs';

const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-'));
}

test('installs the core framework and GitHub assets', async () => {
  const target = await tempDir();
  const result = await initProject({ targetDir: target, agent: 'codex', includeGitHub: true });

  assert.equal(result.dryRun, false);
  assert.match(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), /# AGENTS\.md/);
  assert.match(await readFile(path.join(target, 'docs/product/PRD.md'), 'utf8'), /PRD/);
  assert.match(await readFile(path.join(target, '.github/workflows/validate.yml'), 'utf8'), /Framework Validation/);

  const installedShell = await readFile(path.join(target, 'scripts/validate-framework.sh'), 'utf8');
  assert.equal(installedShell.includes('\r'), false);
  await assert.rejects(
    readFile(path.join(target, 'evaluations', 'prompt-behavior', 'scenarios.json'), 'utf8'),
    /ENOENT/
  );
  const { stdout } = await execFileAsync(process.execPath, [path.join(target, 'scripts/validate-framework.mjs')], { cwd: target });
  assert.match(stdout, /Framework validation passed/);
});

test('adds thin adapters only when the selected tool needs them', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'all', includeGitHub: true });

  assert.match(await readFile(path.join(target, 'CLAUDE.md'), 'utf8'), /@AGENTS\.md/);
  assert.match(await readFile(path.join(target, '.github/copilot-instructions.md'), 'utf8'), /AGENTS\.md/);
});

test('refuses to overwrite existing managed paths without --force', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'AGENTS.md'), 'existing policy\n');

  await assert.rejects(
    initProject({ targetDir: target, agent: 'generic', includeGitHub: false }),
    /Refusing to overwrite/
  );

  assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), 'existing policy\n');
});

test('dry-run performs no writes', async () => {
  const target = await tempDir();
  const result = await initProject({ targetDir: target, agent: 'claude', includeGitHub: false, dryRun: true });

  assert.equal(result.dryRun, true);
  await assert.rejects(readFile(path.join(target, 'AGENTS.md'), 'utf8'));
});

test('merges into existing directories when individual framework files do not conflict', async () => {
  const target = await tempDir();
  await mkdir(path.join(target, 'docs'), { recursive: true });
  await writeFile(path.join(target, 'docs/EXISTING.md'), 'keep me\n');

  await initProject({ targetDir: target, agent: 'generic', includeGitHub: false });

  assert.equal(await readFile(path.join(target, 'docs/EXISTING.md'), 'utf8'), 'keep me\n');
  assert.match(await readFile(path.join(target, 'docs/product/PRD.md'), 'utf8'), /PRD/);
});

test('auto-detects TypeScript and fills commands proven by package scripts', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n');
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    scripts: {
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'node --test',
      build: 'tsc -p tsconfig.json'
    }
  }));
  await writeFile(path.join(target, 'package-lock.json'), '{}\n');

  const result = await initProject({ targetDir: target, agent: 'codex', stack: 'auto', includeGitHub: false });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'typescript');
  assert.match(agents, /LINT_COMMAND=npm run lint/);
  assert.match(agents, /TYPECHECK_COMMAND=npm run typecheck/);
  assert.match(agents, /## 16\. TypeScript stack profile/);
});

test('auto-detects JavaScript package projects and imports existing check/test scripts', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    type: 'module',
    scripts: {
      test: 'node --test',
      check: 'node --check src/app.js'
    }
  }));

  const result = await initProject({ targetDir: target, agent: 'codex', stack: 'auto', includeGitHub: false });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'javascript');
  assert.match(agents, /INSTALL_COMMAND=npm install/);
  assert.match(agents, /LINT_COMMAND=n\/a/);
  assert.match(agents, /CHECK_COMMAND=npm run check/);
  assert.match(agents, /UNIT_TEST_COMMAND=npm run test/);
  assert.match(agents, /FORMAT_CHECK_COMMAND=n\/a/);
  assert.match(agents, /TYPECHECK_COMMAND=n\/a/);
  assert.match(agents, /BUILD_COMMAND=n\/a/);
  assert.match(agents, /## 16\. JavaScript \/ Node\.js stack profile/);
});

test('Go stack installs stable verification commands', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'go.mod'), 'module example.com/demo\n\ngo 1.24\n');

  const result = await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'go');
  assert.match(agents, /LINT_COMMAND=go vet \.\/\.\.\./);
  assert.match(agents, /BUILD_COMMAND=go build \.\/\.\.\./);
  assert.match(agents, /## 16\. Go stack profile/);
});

test('auto-detects Python tooling only when configuration provides evidence', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'pyproject.toml'), '[tool.ruff]\nline-length = 100\n\n[tool.mypy]\nstrict = true\n\n[tool.pytest.ini_options]\n');
  await writeFile(path.join(target, 'uv.lock'), 'version = 1\n');

  const result = await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  assert.equal(result.stack, 'python');
  assert.match(agents, /INSTALL_COMMAND=uv sync --frozen/);
  assert.match(agents, /LINT_COMMAND=ruff check \./);
  assert.match(agents, /TYPECHECK_COMMAND=mypy \./);
  assert.match(agents, /UNIT_TEST_COMMAND=python -m pytest/);
  assert.match(agents, /## 16\. Python stack profile/);
});

test('doctor fails when the framework is not installed', async () => {
  const target = await tempDir();
  const report = await runDoctor(target);

  assert.ok(report.summary.fail > 0);
  assert.equal(doctorExitCode(report), 1);
  assert.ok(report.checks.some((item) => item.id === 'agents' && item.status === 'fail'));
});

test('doctor warns for untouched templates but passes structural checks after init', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: true });
  const report = await runDoctor(target);

  assert.equal(report.summary.fail, 0);
  assert.ok(report.summary.warn > 0);
  assert.equal(doctorExitCode(report), 0);
  assert.equal(doctorExitCode(report, true), 1);
  assert.ok(report.checks.some((item) => item.id === 'product-brief' && item.status === 'warn'));
});

test('doctor reports explicit stack commands as resolved', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n');
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    scripts: {
      'format:check': 'prettier --check .',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'node --test',
      'test:integration': 'node --test test/integration',
      build: 'tsc',
      'test:e2e': 'playwright test'
    }
  }));
  await writeFile(path.join(target, 'package-lock.json'), '{}\n');
  await initProject({ targetDir: target, agent: 'codex', stack: 'auto', includeGitHub: true });
  const report = await runDoctor(target);

  const commands = report.checks.find((item) => item.id === 'commands');
  assert.equal(report.stack, 'typescript');
  assert.equal(commands.status, 'pass');
});

test('task generator creates a bounded task and imports configured verification commands', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'tsconfig.json'), '{}\n');
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    scripts: {
      lint: 'eslint .',
      typecheck: 'tsc --noEmit',
      test: 'node --test',
      build: 'tsc'
    }
  }));
  await writeFile(path.join(target, 'package-lock.json'), '{}\n');
  await initProject({ targetDir: target, agent: 'codex', stack: 'auto', includeGitHub: false });

  const result = await createTaskPack({
    targetDir: target,
    slug: 'accept-invite',
    title: 'Accept invitation'
  });
  const task = await readFile(path.join(target, result.relative), 'utf8');

  assert.equal(result.relative, 'docs/tasks/accept-invite.md');
  assert.match(task, /# Task — Accept invitation/);
  assert.match(task, /`LINT_COMMAND`: `npm run lint`/);
  assert.match(task, /`TYPECHECK_COMMAND`: `npm run typecheck`/);
  assert.match(task, /Implementation plan/);
  assert.match(task, /Independent review checklist/);
});

test('task generator does not turn reasoned n/a decisions into executable commands', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeFile(path.join(target, 'AGENTS.md'), [
    'INSTALL_COMMAND=npm install',
    'FORMAT_CHECK_COMMAND=n/a — no formatter configured',
    'LINT_COMMAND=npm run check',
    'TYPECHECK_COMMAND=n/a - plain JavaScript',
    'UNIT_TEST_COMMAND=npm test',
    'INTEGRATION_TEST_COMMAND=not applicable — no integrations',
    'BUILD_COMMAND=n/a — no build step',
    'E2E_COMMAND=n/a — no UI'
  ].join('\n') + '\n');

  const result = await createTaskPack({ targetDir: target, slug: 'reasoned-na' });
  const task = await readFile(path.join(target, result.relative), 'utf8');

  assert.match(task, /`INSTALL_COMMAND`: `npm install`/);
  assert.match(task, /`LINT_COMMAND`: `npm run check`/);
  assert.match(task, /`UNIT_TEST_COMMAND`: `npm test`/);
  assert.doesNotMatch(task, /FORMAT_CHECK_COMMAND/);
  assert.doesNotMatch(task, /TYPECHECK_COMMAND/);
  assert.doesNotMatch(task, /INTEGRATION_TEST_COMMAND/);
  assert.doesNotMatch(task, /BUILD_COMMAND/);
  assert.doesNotMatch(task, /E2E_COMMAND/);
});

test('task generator refuses overwrite and supports dry-run', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'billing-retry' });

  await assert.rejects(
    createTaskPack({ targetDir: target, slug: 'billing-retry' }),
    /Refusing to overwrite existing task/
  );

  const preview = await createTaskPack({ targetDir: target, slug: 'new-task', dryRun: true });
  assert.equal(preview.dryRun, true);
  await assert.rejects(readFile(path.join(target, preview.relative), 'utf8'));
});

test('task generator validates kebab-case slugs', async () => {
  const target = await tempDir();
  await assert.rejects(
    createTaskPack({ targetDir: target, slug: 'Bad Task' }),
    /lowercase kebab-case/
  );
});
