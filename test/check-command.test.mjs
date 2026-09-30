import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { runVerification } from '../lib/verify.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-check-command-'));
}

async function writeReadyTask(target, slug) {
  const dir = path.join(target, 'docs', 'tasks');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.md`), `# Task — Check command evidence\n\n## Outcome\n\nShip one bounded change with all repository-required checks represented in VCP evidence.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n| Security | \`docs/security/THREAT-MODEL.md\` |\n\n## Acceptance criteria\n\n- [ ] AC-001 — General project checks and unit tests both produce executable evidence.\n\n## Scope\n\n### In scope\n- Verification command execution and evidence.\n\n### Out of scope\n- Deployment and production credentials.\n\n## Affected boundaries\n\n- Modules/files likely affected: verification contract.\n- Public API/contract impact: additive verification key.\n- Data/schema/migration impact: n/a — no schema change.\n- External integration impact: n/a — local commands only.\n\n## Domain invariants\n\nEvidence must never claim a command passed unless it exited successfully.\n\n## Security and privacy\n\n- Authentication impact: n/a — local developer tool.\n- Authorization/resource ownership: n/a — local developer tool.\n- Tenant isolation: n/a — local developer tool.\n- Input/trust boundaries: repository-controlled commands execute only with explicit --run.\n- Secrets/PII/logging: raw command output is not persisted by default.\n- Abuse/rate/replay considerations: commands execute sequentially and stop after failure.\n- Relevant threat IDs: n/a — local tooling only.\n\n## Failure modes and edge cases\n\n- A required command exits non-zero.\n\n## Observability\n\nRecord the exact command key, command, duration, and exit status.\n\n## Test plan\n\n### Unit\n- Parse CHECK_COMMAND distinctly from lint.\n\n### Integration / contract\n- Execute CHECK_COMMAND and UNIT_TEST_COMMAND.\n\n### E2E / regression\n- Persist both results in verification evidence.\n\n### Negative/security paths\n- Existing verify failure semantics remain unchanged.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: additive text contract; old tasks remain valid.\n- Migration/backfill: n/a — no persisted schema.\n- Rollback or recovery: remove the additive command key.\n\n## Implementation plan\n\n1. Represent the general project check explicitly.\n2. Execute it with the existing verification runner.\n3. Persist both results.\n\n## Verification commands\n\n- \`CHECK_COMMAND\`: \`node -e "process.exit(0)"\`\n- \`UNIT_TEST_COMMAND\`: \`node -e "process.exit(0)"\`\n`, 'utf8');
}

test('JavaScript package check script is represented as CHECK_COMMAND in generated tasks', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    scripts: {
      check: 'node --check src/app.js',
      test: 'node --test'
    }
  }));

  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^CHECK_COMMAND=npm run check$/m);
  assert.match(agents, /^LINT_COMMAND=n\/a$/m);
  assert.doesNotMatch(agents, /^LINT_COMMAND=npm run check$/m);

  const task = await createTaskPack({ targetDir: target, slug: 'check-contract', title: 'Check contract' });
  assert.match(task.content, /`CHECK_COMMAND`: `npm run check`/);
  assert.match(task.content, /`UNIT_TEST_COMMAND`: `npm run test`/);
  assert.doesNotMatch(task.content, /`LINT_COMMAND`: `npm run check`/);
  assert.doesNotMatch(task.content, /`LINT_COMMAND`: `n\/a`/);
});

test('JavaScript profile keeps lint unresolved when neither lint nor general check is configured', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    scripts: {
      test: 'node --test'
    }
  }));

  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: false });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.match(agents, /^LINT_COMMAND=<define>$/m);
  assert.match(agents, /^CHECK_COMMAND=n\/a$/m);
});

test('verify executes and persists CHECK_COMMAND alongside unit tests', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeReadyTask(target, 'check-evidence');

  const report = await runVerification({
    targetDir: target,
    task: 'check-evidence',
    run: true,
    quiet: true,
    output: '.vcp/evidence/check-evidence.json'
  });

  assert.equal(report.success, true);
  assert.deepEqual(report.commands.map(({ key, status }) => ({ key, status })), [
    { key: 'CHECK_COMMAND', status: 'pass' },
    { key: 'UNIT_TEST_COMMAND', status: 'pass' }
  ]);

  const evidence = JSON.parse(await readFile(path.join(target, '.vcp/evidence/check-evidence.json'), 'utf8'));
  assert.deepEqual(evidence.commands.map(({ key, status }) => ({ key, status })), [
    { key: 'CHECK_COMMAND', status: 'pass' },
    { key: 'UNIT_TEST_COMMAND', status: 'pass' }
  ]);

  const onlyCheck = await runVerification({
    targetDir: target,
    task: 'check-evidence',
    only: ['CHECK_COMMAND'],
    run: true,
    quiet: true
  });
  assert.deepEqual(onlyCheck.commands.map(({ key }) => key), ['CHECK_COMMAND']);
  assert.equal(onlyCheck.success, true);
});
