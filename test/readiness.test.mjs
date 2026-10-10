import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { readinessExitCode, runTaskReadiness } from '../lib/readiness.mjs';

const execFileAsync = promisify(execFile);

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-ready-'));
}

async function writeTask(target, slug, content) {
  const dir = path.join(target, 'docs', 'tasks');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.md`), content, 'utf8');
}

function coreReadyTask({ source = 'docs/product/PRD.md' } = {}) {
  return `# Task — Billing retry\n\n## Outcome\n\nRetry one failed invoice payment without duplicating a successful charge.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`${source}\` |\n\n## Acceptance criteria\n\n- [ ] AC-001 — A failed invoice can be retried once and returns the new payment result.\n\n## Scope\n\n### In scope\n- Retry an existing failed invoice.\n\n### Out of scope\n- Changing pricing or invoice generation.\n\n## Affected boundaries\n\n- Modules/files likely affected:\n- Public API/contract impact:\n- Data/schema/migration impact:\n- External integration impact:\n\n## Domain invariants\n\nList invariants this change must preserve. If none apply, say why.\n\n## Security and privacy\n\n- Authentication impact:\n- Authorization/resource ownership:\n- Tenant isolation:\n- Input/trust boundaries:\n- Secrets/PII/logging:\n- Abuse/rate/replay considerations:\n- Relevant threat IDs:\n\n## Failure modes and edge cases\n\n-\n\n## Observability\n\nDefine logs, metrics, traces, audit/domain events, or alerts needed for the changed behavior. Use \`n/a\` only with a reason.\n\n## Test plan\n\n### Unit\n-\n\n### Integration / contract\n-\n\n### E2E / regression\n-\n\n### Negative/security paths\n-\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns:\n- Migration/backfill:\n- Rollback or recovery:\n\n## Implementation plan\n\n1.\n2.\n3.\n`;
}

function implementationReadyTask({ withVerification = true } = {}) {
  const verification = withVerification
    ? `\n## Verification commands\n\n- \`UNIT_TEST_COMMAND\`: \`node -e "process.exit(0)"\`\n`
    : '';
  return `# Task — Accept invitation\n\n## Outcome\n\nAllow the intended verified user to accept one pending organization invitation exactly once.\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n| Security | \`docs/security/THREAT-MODEL.md\` |\n\n## Acceptance criteria\n\n- [ ] AC-001 — A matching verified user can accept a non-expired pending invitation.\n- [ ] AC-002 — Reusing, expiring, or accepting with a different verified email is rejected.\n\n## Scope\n\n### In scope\n- Invitation acceptance application behavior.\n\n### Out of scope\n- Email delivery and invitation creation UI.\n\n## Affected boundaries\n\n- Modules/files likely affected: invitation application service and repository contract.\n- Public API/contract impact: acceptance command returns organization membership result.\n- Data/schema/migration impact: n/a — existing invitation fields are sufficient.\n- External integration impact: n/a — transport is outside this task.\n\n## Domain invariants\n\nA pending invitation belongs to one organization, one normalized email, and can transition to accepted only once.\n\n## Security and privacy\n\n- Authentication impact: authenticated user with verified email is required.\n- Authorization/resource ownership: invitation token selects only its own invitation.\n- Tenant isolation: resulting membership must use the invitation organization only.\n- Input/trust boundaries: token and authenticated identity are untrusted inputs.\n- Secrets/PII/logging: never log raw invitation tokens; avoid unnecessary email logging.\n- Abuse/rate/replay considerations: acceptance is one-time and replay is rejected.\n- Relevant threat IDs: T-001 and T-002 from the threat model.\n\n## Failure modes and edge cases\n\n- Expired invitation.\n- Revoked or already accepted invitation.\n- Verified email mismatch.\n\n## Observability\n\nEmit an invitation-accepted audit event without the raw token and count rejected replay attempts.\n\n## Test plan\n\n### Unit\n- Prove state transition and email binding.\n\n### Integration / contract\n- Prove repository one-time acceptance behavior.\n\n### E2E / regression\n- n/a — HTTP transport is outside this reference task.\n\n### Negative/security paths\n- Prove expiry, replay, revocation, and cross-email rejection.\n\n## Rollout, migration, and recovery\n\n- Deployment/compatibility concerns: backward-compatible application change.\n- Migration/backfill: n/a — no schema change.\n- Rollback or recovery: revert application version; no irreversible data migration.\n\n## Implementation plan\n\n1. Add acceptance validation to the application service.\n2. Enforce one-time repository transition and negative-path tests.\n3. Run configured verification and independent review.\n${verification}`;
}

async function customizeSourceDocs(target) {
  await writeFile(path.join(target, 'docs/product/PRD.md'), '# PRD\n\nAccepted requirement: invitation acceptance is single-use and email-bound.\n', 'utf8');
  await writeFile(path.join(target, 'docs/security/THREAT-MODEL.md'), '# Threat Model\n\nT-001: replay of invitation tokens.\nT-002: cross-email acceptance.\n', 'utf8');
}

test('fresh generated task is not ready for planning', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'blank-task' });

  const report = await runTaskReadiness({ targetDir: target, task: 'blank-task', stage: 'plan' });
  assert.ok(report.summary.fail >= 4);
  assert.equal(readinessExitCode(report), 1);
  assert.ok(report.checks.some((item) => item.id === 'acceptance' && item.status === 'fail'));
});

test('core-complete task can enter planning while operational gaps remain warnings', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeTask(target, 'billing-retry', coreReadyTask());

  const report = await runTaskReadiness({ targetDir: target, task: 'billing-retry', stage: 'plan' });
  assert.equal(report.summary.fail, 0);
  assert.ok(report.summary.warn > 0);
  assert.equal(readinessExitCode(report), 0);
  assert.equal(readinessExitCode(report, true), 1);
});

test('implementation-ready task passes but warns when referenced source docs are still starter templates', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeTask(target, 'accept-invite', implementationReadyTask());

  const report = await runTaskReadiness({ targetDir: target, task: 'accept-invite', stage: 'implement' });
  assert.equal(report.summary.fail, 0);
  assert.ok(report.summary.warn > 0);
  assert.equal(readinessExitCode(report), 0);
  assert.equal(readinessExitCode(report, true), 1);
  assert.ok(report.checks.some((item) => item.id === 'source-truth' && item.status === 'warn'));
  assert.ok(report.checks.some((item) => item.id === 'implementation-plan' && item.status === 'pass'));
  assert.ok(report.checks.some((item) => item.id === 'verification-plan' && item.status === 'pass'));
});

test('customized source docs remove starter-template readiness warnings', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await customizeSourceDocs(target);
  await writeTask(target, 'accept-invite', implementationReadyTask());

  const report = await runTaskReadiness({ targetDir: target, task: 'accept-invite', stage: 'implement' });
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.warn, 0);
  assert.equal(readinessExitCode(report), 0);
});

test('implementation readiness fails when verify cannot build an executable plan', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await customizeSourceDocs(target);
  await writeTask(target, 'no-verify', implementationReadyTask({ withVerification: false }));

  const report = await runTaskReadiness({ targetDir: target, task: 'no-verify', stage: 'implement' });
  assert.ok(report.summary.fail > 0);
  assert.ok(report.checks.some((item) => item.id === 'verification-plan' && item.status === 'fail'));
  assert.equal(readinessExitCode(report), 1);
});

test('readiness rejects duplicate task sections instead of parsing an ambiguous first copy', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await customizeSourceDocs(target);
  await writeTask(target, 'duplicate-sections', `${implementationReadyTask()}\n## Outcome\n\nA second conflicting outcome.\n`);

  const report = await runTaskReadiness({ targetDir: target, task: 'duplicate-sections', stage: 'plan' });
  assert.ok(report.checks.some((item) => item.id === 'duplicate-sections' && item.status === 'fail'));
  assert.equal(readinessExitCode(report), 1);
});

test('ready detects unsafe source references and CLI supports JSON output', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await writeTask(target, 'unsafe-ref', coreReadyTask({ source: '../outside.md' }));

  const unsafe = await runTaskReadiness({ targetDir: target, task: 'unsafe-ref', stage: 'plan' });
  assert.ok(unsafe.checks.some((item) => item.id === 'source-truth' && item.status === 'fail'));

  await customizeSourceDocs(target);
  await writeTask(target, 'json-ready', implementationReadyTask());
  const bin = path.resolve('bin/vibe-coding-production.mjs');
  const { stdout } = await execFileAsync(process.execPath, [bin, 'ready', 'json-ready', '--dir', target, '--stage', 'implement', '--json']);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.stage, 'implement');
  assert.equal(parsed.summary.fail, 0);
});
