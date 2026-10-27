// D-PC-02: L3 independent-review evidence. The contract binds task digest,
// Git revision, scope, reviewer identity, decision, and timestamps — and
// live L3 authorization stays DISABLED: no trustworthy reviewer-identity or
// signature mechanism exists, so even perfect evidence must never authorize.
// A JSON file with `approved: true` and a boolean flag are both refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { runMechanicalGate } from '../lib/gate-run.mjs';
import {
  L3_AUTHORIZATION_DISABLED_REASON, buildReviewEvidenceDraft, validateL3ReviewEvidence,
} from '../lib/l3-review-evidence.mjs';

const execFileAsync = promisify(execFile);
const BIN = path.resolve('bin/vibe-coding-production.mjs');
process.env.GIT_AUTHOR_NAME = 'Fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@example.invalid';
process.env.GIT_COMMITTER_NAME = 'Fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@example.invalid';
const GIT_ENV = { ...process.env };
function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: GIT_ENV }).trim();
}

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const TASK_DIGEST = 'c'.repeat(64);
const AUTHOR = 'Fixture <fixture@example.invalid>';
const REVIEWER = 'Riley Reviewer <riley@example.invalid>';
const NOW = '2026-10-27T12:00:00.000Z';
function goodEvidence(overrides = {}) {
  return {
    schemaVersion: 'l3-review-evidence/1',
    policyVersion: 'l3-review-policy/1',
    evidenceId: 'ev-test-0001',
    task: { slug: 'l3-task', taskPackSha256: TASK_DIGEST },
    reviewedRevision: { baseSha: BASE, headSha: HEAD },
    scope: { changedFiles: ['.github/workflows/ci.yml'], reviewTarget: 'CI workflow change' },
    reviewer: { identity: REVIEWER, identityKind: 'git' },
    decision: 'APPROVED',
    reviewedAt: '2026-10-27T11:00:00.000Z',
    validUntil: null,
    supersedes: null,
    origin: { kind: 'local-file', detail: 'unsigned local file' },
    ...overrides,
  };
}
function goodContext(overrides = {}) {
  return {
    taskSlug: 'l3-task', taskSha256: TASK_DIGEST, baseSha: BASE, headSha: HEAD,
    changedFiles: ['.github/workflows/ci.yml'], changeAuthorIdentity: AUTHOR, now: NOW,
    ...overrides,
  };
}

test('perfect evidence is valid but NEVER authorized', () => {
  const result = validateL3ReviewEvidence(goodEvidence(), goodContext());
  assert.equal(result.valid, true);
  assert.equal(result.authorized, false);
  assert.deepEqual(result.reasons, [L3_AUTHORIZATION_DISABLED_REASON]);
  assert.equal(result.bindings.originVerified, false);
  assert.equal(result.bindings.decision, 'APPROVED');
});

test('a bare approved:true file and other forgeries are refused', () => {
  const cases = [
    ['bare approved:true', { approved: true }, goodContext(), 'L3_EVIDENCE_SCHEMA_UNKNOWN'],
    ['non-object evidence', 'approved', goodContext(), 'L3_EVIDENCE_NOT_AN_OBJECT'],
    ['null evidence', null, goodContext(), 'L3_EVIDENCE_NOT_AN_OBJECT'],
    ['unknown schema version', goodEvidence({ schemaVersion: 'l3-review-evidence/2' }), goodContext(), 'L3_EVIDENCE_SCHEMA_UNKNOWN'],
    ['unknown policy version', goodEvidence({ policyVersion: 'l3-review-policy/9' }), goodContext(), 'L3_EVIDENCE_POLICY_UNKNOWN'],
    ['decision not approved', goodEvidence({ decision: 'CHANGES_REQUESTED' }), goodContext(), 'L3_EVIDENCE_DECISION_NOT_APPROVED'],
    ['self approval', goodEvidence({ reviewer: { identity: AUTHOR, identityKind: 'git' } }), goodContext(), 'L3_EVIDENCE_SELF_APPROVAL'],
    ['author unverified', goodEvidence(), goodContext({ changeAuthorIdentity: null }), 'L3_EVIDENCE_AUTHOR_UNVERIFIED'],
    ['evidence for another commit', goodEvidence({ reviewedRevision: { baseSha: BASE, headSha: 'd'.repeat(40) } }), goodContext(), 'L3_EVIDENCE_HEAD_MISMATCH'],
    ['evidence for another base', goodEvidence({ reviewedRevision: { baseSha: 'e'.repeat(40), headSha: HEAD } }), goodContext(), 'L3_EVIDENCE_BASE_MISMATCH'],
    ['evidence for another task digest', goodEvidence({ task: { slug: 'l3-task', taskPackSha256: 'f'.repeat(64) } }), goodContext(), 'L3_EVIDENCE_TASK_DIGEST_MISMATCH'],
    ['evidence for another task', goodEvidence({ task: { slug: 'other-task', taskPackSha256: TASK_DIGEST } }), goodContext(), 'L3_EVIDENCE_TASK_MISMATCH'],
    ['malformed task digest', goodEvidence({ task: { slug: 'l3-task', taskPackSha256: 'xyz' } }), goodContext(), 'L3_EVIDENCE_TASK_MISMATCH'],
    ['scope missing a changed file', goodEvidence(), goodContext({ changedFiles: ['.github/workflows/ci.yml', 'lib/auth.mjs'] }), 'L3_EVIDENCE_SCOPE_INCOMPLETE'],
    ['scope with an escaping path', goodEvidence({ scope: { changedFiles: ['../escape.txt'], reviewTarget: 'x' } }), goodContext(), 'L3_EVIDENCE_SCOPE_INVALID'],
    ['expired evidence', goodEvidence({ validUntil: '2026-10-27T11:30:00.000Z' }), goodContext(), 'L3_EVIDENCE_EXPIRED'],
    ['future review timestamp', goodEvidence({ reviewedAt: '2026-10-28T12:00:00.000Z' }), goodContext(), 'L3_EVIDENCE_TIMESTAMP_FUTURE'],
    ['revoked evidence', goodEvidence(), goodContext({ revokedEvidenceIds: ['ev-test-0001'] }), 'L3_EVIDENCE_REVOKED'],
    ['missing reviewer', goodEvidence({ reviewer: { identity: '', identityKind: 'git' } }), goodContext(), 'L3_EVIDENCE_REVIEWER_MISSING'],
    ['undeclared origin', goodEvidence({ origin: { kind: 'telepathy', detail: 'x' } }), goodContext(), 'L3_EVIDENCE_ORIGIN_UNDECLARED'],
    ['no context: bindings unverified', goodEvidence(), {}, null],
  ];
  for (const [label, evidence, context, code] of cases) {
    const result = validateL3ReviewEvidence(evidence, context);
    assert.equal(result.valid, false, label);
    assert.equal(result.authorized, false, label);
    assert.ok(result.reasons.includes(L3_AUTHORIZATION_DISABLED_REASON), label);
    if (code) assert.ok(result.reasons.includes(code), `${label}: reasons=${result.reasons.join(',')}`);
  }
});

test('no --approve flag exists on the gate', async () => {
  const { stdout } = await execFileAsync(process.execPath, [BIN, '--help']);
  assert.ok(!stdout.includes('--approve'), 'no approval flag may exist');
  assert.ok(stdout.includes('review-evidence'), 'review-evidence command is documented');
});

async function l3Fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-l3-'));
  git(root, 'init', '-q');
  await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
  const taskDir = path.join(root, 'docs', 'tasks');
  await mkdir(taskDir, { recursive: true });
  await writeFile(path.join(taskDir, 'l3-task.md'), '# Task — L3 fixture\nStatus: Review\n\n## Outcome\n\nShip one verified change.\n', 'utf8');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'l3 change');
  return { root, base };
}

test('live gate: perfect evidence is validated and still blocks L3', async () => {
  const { root, base } = await l3Fixture();
  try {
    const evidence = await buildReviewEvidenceDraft({
      targetDir: root, task: 'l3-task', baseRef: base,
      reviewer: { identity: REVIEWER, identityKind: 'git' },
    });
    const report = await runMechanicalGate({ targetDir: root, task: 'l3-task', baseRef: base, run: true, reviewEvidence: evidence });
    assert.equal(report.preflight.changes.requiredLevel, 'L3');
    assert.equal(report.status, 'BLOCKED');
    assert.ok(report.blockingReasons.includes('INDEPENDENT_L3_REVIEW_REQUIRED'));
    assert.ok(report.blockingReasons.includes(L3_AUTHORIZATION_DISABLED_REASON));
    assert.ok(!report.blockingReasons.includes('L3_REVIEW_EVIDENCE_INVALID'), 'perfect evidence is not invalid');
    assert.equal(report.reviewEvidenceValidation.valid, true);
    assert.equal(report.reviewEvidenceValidation.authorized, false);
    assert.equal(report.verificationExecuted, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('live gate: forged and self-approved evidence are invalid and block L3', async () => {
  const { root, base } = await l3Fixture();
  try {
    const draft = await buildReviewEvidenceDraft({
      targetDir: root, task: 'l3-task', baseRef: base,
      reviewer: { identity: REVIEWER, identityKind: 'git' },
    });
    const forged = { ...draft, reviewedRevision: { ...draft.reviewedRevision, headSha: '0'.repeat(40) } };
    const forgedReport = await runMechanicalGate({ targetDir: root, task: 'l3-task', baseRef: base, run: true, reviewEvidence: forged });
    assert.equal(forgedReport.status, 'BLOCKED');
    assert.ok(forgedReport.blockingReasons.includes('L3_REVIEW_EVIDENCE_INVALID'));
    assert.ok(forgedReport.reviewEvidenceValidation.reasons.includes('L3_EVIDENCE_HEAD_MISMATCH'));

    const selfApproved = await buildReviewEvidenceDraft({
      targetDir: root, task: 'l3-task', baseRef: base,
      reviewer: { identity: AUTHOR, identityKind: 'git' },
    });
    const selfReport = await runMechanicalGate({ targetDir: root, task: 'l3-task', baseRef: base, run: true, reviewEvidence: selfApproved });
    assert.equal(selfReport.status, 'BLOCKED');
    assert.ok(selfReport.blockingReasons.includes('L3_REVIEW_EVIDENCE_INVALID'));
    assert.ok(selfReport.reviewEvidenceValidation.reasons.includes('L3_EVIDENCE_SELF_APPROVAL'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CLI review-evidence check: bindings valid exit 0, forged exit 1, never authorization', async () => {
  const { root, base } = await l3Fixture();
  try {
    const evidence = await buildReviewEvidenceDraft({
      targetDir: root, task: 'l3-task', baseRef: base,
      reviewer: { identity: REVIEWER, identityKind: 'git' },
    });
    const file = path.join(root, 'review.json');
    await writeFile(file, JSON.stringify(evidence, null, 2), 'utf8');
    const ok = await execFileAsync(process.execPath, [BIN, 'review-evidence', file, '--task', 'l3-task', '--base', base, '--dir', root, '--json']);
    const okReport = JSON.parse(ok.stdout);
    assert.equal(okReport.valid, true);
    assert.equal(okReport.authorized, false);
    assert.equal(okReport.authorizationDisabled, true);

    const forged = { ...evidence, decision: 'REJECTED' };
    const forgedFile = path.join(root, 'forged.json');
    await writeFile(forgedFile, JSON.stringify(forged), 'utf8');
    await assert.rejects(
      execFileAsync(process.execPath, [BIN, 'review-evidence', forgedFile, '--task', 'l3-task', '--base', base, '--dir', root, '--json']),
      (e) => e.code === 1 && JSON.parse(e.stdout).valid === false,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [BIN, 'review-evidence', file, '--dir', root, '--json']),
      (e) => {
        const structuralReport = JSON.parse(e.stdout);
        return e.code === 1 && structuralReport.valid === false &&
          structuralReport.authorized === false &&
          structuralReport.reasons.includes('L3_EVIDENCE_TASK_DIGEST_UNVERIFIED');
      },
      'without bindings context the evidence cannot validate',
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});
