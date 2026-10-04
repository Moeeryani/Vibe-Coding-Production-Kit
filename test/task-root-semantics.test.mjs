import assert from 'node:assert/strict';
import { access, cp, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const referenceRoot = path.join(repoRoot, 'examples', 'reference-saas-invite');

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function runVcp(args) {
  return execFileAsync(process.execPath, [bin, ...args], { cwd: repoRoot });
}

function completedTask() {
  return `# Task — Project-root ownership\n\nStatus: Ready\nSlug: \`root-owned\`\n\n## Outcome\n\nProve one Task Pack is interpreted only from its selected VCP project root.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Root contract | \`docs/product/ROOT-OWNERSHIP.md\` |\n\n## Requirement restatement\n\nKeep task, source, context, and verification paths rooted in the selected project.\n\n## Acceptance criteria\n\n- [ ] AC-001 — Task creation, readiness, context, and verification use the same selected project root.\n\n## Scope\n\n### In scope\n- Project-root path semantics.\n\n### Out of scope\n- Persisting a new root field in Task Pack schema.\n\n## Affected boundaries\n\n- Modules/files likely affected: task workflow path handling and documentation.\n- Public API/contract impact: clarify existing \`--dir\` behavior.\n- Data/schema/migration impact: n/a — no persisted schema change.\n- External integration impact: n/a — repository-local tooling only.\n\n## Domain invariants\n\nA Task Pack and its repository-local references are interpreted from one selected project root.\n\n## Security and privacy\n\n- Authentication impact: n/a — local tooling.\n- Authorization/resource ownership: n/a — local tooling.\n- Tenant isolation: n/a — local tooling.\n- Input/trust boundaries: repository-local paths remain inside the selected project root.\n- Secrets/PII/logging: n/a — no sensitive output added.\n- Abuse/rate/replay considerations: n/a — local tooling.\n- Relevant threat IDs: n/a — no product security change.\n\n## Failure modes and edge cases\n\n- A Task Pack copied to another project root must not silently resolve files from its old or parent root.\n\n## Observability\n\nn/a — deterministic CLI reports and tests provide evidence.\n\n## Test plan\n\n### Unit\n- n/a — contract is exercised through public commands.\n\n### Integration / contract\n- Run task, ready, context, and verify with one nested \`--dir\`.\n\n### E2E / regression\n- Copy the task to another root and prove unresolved references fail there.\n\n### Negative/security paths\n- Prove a same-named source file in the parent directory is not used as fallback.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: preserve existing Task Packs and command behavior.\n- Migration/backfill: n/a — project root is supplied by command context.\n- Rollback or recovery: revert the documentation/test-only contract change.\n\n## Implementation plan\n\n1. Document one selected project-root contract.\n2. Keep task/source/context/verification resolution relative to that root.\n3. Lock the contract with nested-project CLI coverage.\n\n## Verification commands\n\n- \`CHECK_COMMAND\`: \`npm run check\`\n`;
}

test('CLI help advertises --dir for context and verification', async () => {
  const { stdout } = await runVcp(['--help']);
  assert.match(stdout, /vcp verify <task> \[--dir <directory>\]/);
  assert.match(stdout, /vcp context <task> \[--dir <directory>\]/);
  assert.match(stdout, /--dir <directory>  Task\/ready\/context\/verify\/manage\/prompt-eval: project directory/);
});

test('task, ready, context, and verify share one selected project root', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'vcp-task-root-'));
  const outerSource = path.join(parent, 'docs', 'product', 'ROOT-OWNERSHIP.md');
  await mkdir(path.dirname(outerSource), { recursive: true });
  await writeFile(outerSource, '# OUTER SOURCE\n\nThis file must never satisfy the nested task.\n', 'utf8');

  const project = path.join(parent, 'workspace', 'app');
  await mkdir(path.dirname(project), { recursive: true });
  await cp(referenceRoot, project, { recursive: true });

  const created = await runVcp(['task', 'root-owned', '--dir', project, '--title', 'Project-root ownership']);
  assert.match(created.stdout, /Created task pack: docs[\\/]tasks[\\/]root-owned\.md/);
  const taskPath = path.join(project, 'docs', 'tasks', 'root-owned.md');
  assert.equal(await exists(taskPath), true);
  assert.equal(await exists(path.join(parent, 'docs', 'tasks', 'root-owned.md')), false);
  const generated = await readFile(taskPath, 'utf8');
  assert.match(generated, /This Task Pack belongs to one VCP project root/);
  assert.match(generated, /Copying this Task Pack to another project does not rebase its references automatically/);

  const nestedSource = path.join(project, 'docs', 'product', 'ROOT-OWNERSHIP.md');
  await writeFile(nestedSource, '# NESTED SOURCE\n\nThe nested project owns this task and source.\n', 'utf8');
  await writeFile(taskPath, completedTask(), 'utf8');

  const readyResult = await runVcp(['ready', 'root-owned', '--dir', project, '--stage', 'implement', '--json']);
  const ready = JSON.parse(readyResult.stdout);
  assert.equal(ready.target, path.resolve(project));
  assert.equal(ready.task, 'docs/tasks/root-owned.md');
  assert.equal(ready.summary.fail, 0);

  const contextResult = await runVcp(['context', 'root-owned', '--dir', project, '--mode', 'plan']);
  assert.match(contextResult.stdout, /NESTED SOURCE/);
  assert.doesNotMatch(contextResult.stdout, /OUTER SOURCE/);
  assert.match(contextResult.stdout, /docs\/product\/ROOT-OWNERSHIP\.md/);

  const verifyResult = await runVcp(['verify', 'root-owned', '--dir', project, '--run', '--only', 'CHECK_COMMAND', '--json']);
  const verification = JSON.parse(verifyResult.stdout);
  assert.equal(verification.target, path.resolve(project));
  assert.equal(verification.task, 'docs/tasks/root-owned.md');
  assert.equal(verification.success, true);
  assert.equal(verification.commands.length, 1);
  assert.equal(verification.commands[0].key, 'CHECK_COMMAND');
  assert.equal(verification.commands[0].status, 'pass');

  const movedRoot = path.join(parent, 'moved-project');
  const movedTask = path.join(movedRoot, 'docs', 'tasks', 'root-owned.md');
  await mkdir(path.dirname(movedTask), { recursive: true });
  await copyFile(taskPath, movedTask);

  await assert.rejects(
    runVcp(['ready', 'root-owned', '--dir', movedRoot, '--stage', 'plan', '--json']),
    (error) => {
      const report = JSON.parse(error.stdout);
      const source = report.checks.find((item) => item.id === 'source-truth');
      assert.equal(report.target, path.resolve(movedRoot));
      assert.equal(report.task, 'docs/tasks/root-owned.md');
      assert.equal(source.status, 'fail');
      assert.match(source.detail, /Referenced file does not exist: docs\/product\/ROOT-OWNERSHIP\.md/);
      return true;
    }
  );
});
