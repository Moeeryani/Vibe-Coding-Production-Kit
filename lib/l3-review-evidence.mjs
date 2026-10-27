// D-PC-02: L3 independent-review evidence contract.
//
// TRUST BOUNDARY — READ BEFORE RELYING ON ANYTHING IN THIS MODULE.
//
// An L3 change may only proceed with independent human review. This module
// defines the evidence format that would record such a review, validates
// every binding that can be checked deterministically from local evidence
// (task digest, Git revision, changed-file scope, reviewer-vs-author
// separation, decision, timestamps, expiry, revocation list, schema
// version), and REFUSES everything it cannot verify.
//
// What it does NOT do: authorize anything. There is currently NO trustworthy
// reviewer-identity or signature-verification mechanism available to VCP:
// Git author/committer identities are self-asserted strings anyone can set,
// no signing keys or trusted keyring exist, and no platform review API is
// integrated. A JSON file containing `approved: true`, a boolean CLI flag,
// and a forged identity are therefore all insufficient — and so is a
// structurally perfect evidence file, because its reviewer identity cannot
// be authenticated. Consequently `authorized` is ALWAYS false and live L3
// authorization stays DISABLED (reason L3_REVIEW_AUTHORIZATION_DISABLED)
// until the owner approves a verifiable mechanism (for example GPG/SSH
// signatures over Git notes verified against a trusted keyring, or a
// platform review API). `valid: true` means only "the bindings check out
// against the supplied context" — never "this review is genuine", never
// approval. Do not invent a trusted reviewer, and do not present test
// evidence as a real approval.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { createGitReviewSnapshot } from './git-review.mjs';
import { readProjectTaskPack } from './task-read.mjs';

export const L3_REVIEW_EVIDENCE_SCHEMA_VERSION = 'l3-review-evidence/1';
export const L3_REVIEW_POLICY_VERSION = 'l3-review-policy/1';
export const L3_AUTHORIZATION_DISABLED_REASON = 'L3_REVIEW_AUTHORIZATION_DISABLED';

const execFileAsync = promisify(execFile);
const SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function validPath(p) {
  return typeof p === 'string' && p.length > 0 && p.length <= 1024 && !p.includes('\\') &&
    !p.includes('\0') && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) &&
    p.split('/').every((s) => s && s !== '.' && s !== '..' && !s.endsWith(' ') && !s.endsWith('.'));
}
function parseTimestamp(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

// Best-effort read of a commit's self-asserted author identity. Returns null
// when Git is unavailable or the commit is unknown. A null result is a
// verification failure (fail closed), never a pass.
export async function readCommitAuthorIdentity({ targetDir, sha }) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', path.resolve(targetDir), 'log', '-1', '--format=%an <%ae>', sha]);
    const identity = stdout.trim();
    return identity || null;
  } catch { return null; }
}

// Validate L3 review evidence against a context. `context` fields are all
// optional; every binding that cannot be checked from the supplied context
// is reported as UNVERIFIED (valid: false), never assumed.
// Returns { valid, authorized: false, reasons, bindings }.
export function validateL3ReviewEvidence(evidence, context = {}) {
  const reasons = [];
  const bindings = {
    taskSlug: null, taskPackSha256: null, baseSha: null, headSha: null,
    scopeCovered: null, reviewerIdentity: null, decision: null,
    reviewedAt: null, validUntil: null, originVerified: false,
  };
  const refuse = (code) => { if (!reasons.includes(code)) reasons.push(code); };

  if (!isObject(evidence)) {
    refuse('L3_EVIDENCE_NOT_AN_OBJECT');
    refuse(L3_AUTHORIZATION_DISABLED_REASON);
    return Object.freeze({ valid: false, authorized: false, reasons: Object.freeze(reasons), bindings: Object.freeze(bindings) });
  }
  if (evidence.schemaVersion !== L3_REVIEW_EVIDENCE_SCHEMA_VERSION) refuse('L3_EVIDENCE_SCHEMA_UNKNOWN');
  if (evidence.policyVersion !== L3_REVIEW_POLICY_VERSION) refuse('L3_EVIDENCE_POLICY_UNKNOWN');
  if (typeof evidence.evidenceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(evidence.evidenceId)) refuse('L3_EVIDENCE_ID_INVALID');
  if (Array.isArray(context.revokedEvidenceIds) && context.revokedEvidenceIds.includes(evidence.evidenceId)) refuse('L3_EVIDENCE_REVOKED');

  // Task binding.
  if (!isObject(evidence.task) || typeof evidence.task.slug !== 'string' || !SLUG.test(evidence.task.slug) ||
    typeof evidence.task.taskPackSha256 !== 'string' || !SHA.test(evidence.task.taskPackSha256)) {
    refuse('L3_EVIDENCE_TASK_MISMATCH');
  } else {
    bindings.taskSlug = evidence.task.slug;
    bindings.taskPackSha256 = evidence.task.taskPackSha256;
    if (context.taskSlug !== undefined && context.taskSlug !== null && evidence.task.slug !== context.taskSlug) refuse('L3_EVIDENCE_TASK_MISMATCH');
    if (context.taskSha256 !== undefined && context.taskSha256 !== null) {
      if (evidence.task.taskPackSha256 !== context.taskSha256) refuse('L3_EVIDENCE_TASK_DIGEST_MISMATCH');
    } else refuse('L3_EVIDENCE_TASK_DIGEST_UNVERIFIED');
  }

  // Git revision binding.
  if (!isObject(evidence.reviewedRevision) || typeof evidence.reviewedRevision.baseSha !== 'string' ||
    !SHA.test(evidence.reviewedRevision.baseSha) || typeof evidence.reviewedRevision.headSha !== 'string' ||
    !SHA.test(evidence.reviewedRevision.headSha)) {
    refuse('L3_EVIDENCE_REVISION_INVALID');
  } else {
    bindings.baseSha = evidence.reviewedRevision.baseSha;
    bindings.headSha = evidence.reviewedRevision.headSha;
    if (context.baseSha !== undefined && context.baseSha !== null && evidence.reviewedRevision.baseSha !== context.baseSha) refuse('L3_EVIDENCE_BASE_MISMATCH');
    if (context.headSha !== undefined && context.headSha !== null) {
      if (evidence.reviewedRevision.headSha !== context.headSha) refuse('L3_EVIDENCE_HEAD_MISMATCH');
    } else refuse('L3_EVIDENCE_HEAD_UNVERIFIED');
  }

  // Scope binding: every changed file must be inside the reviewed scope.
  if (!isObject(evidence.scope) || !Array.isArray(evidence.scope.changedFiles) || evidence.scope.changedFiles.length === 0 ||
    evidence.scope.changedFiles.some((p) => !validPath(p)) ||
    typeof evidence.scope.reviewTarget !== 'string' || !evidence.scope.reviewTarget.trim()) {
    refuse('L3_EVIDENCE_SCOPE_INVALID');
  } else if (Array.isArray(context.changedFiles)) {
    const scope = new Set(evidence.scope.changedFiles);
    bindings.scopeCovered = context.changedFiles.every((p) => scope.has(p));
    if (!bindings.scopeCovered) refuse('L3_EVIDENCE_SCOPE_INCOMPLETE');
  } else {
    bindings.scopeCovered = null;
    refuse('L3_EVIDENCE_SCOPE_UNVERIFIED');
  }

  // Reviewer binding: identity recorded, never trusted; self-approval refused.
  if (!isObject(evidence.reviewer) || typeof evidence.reviewer.identity !== 'string' ||
    !evidence.reviewer.identity.trim() || evidence.reviewer.identity.length > 256 ||
    !['git', 'platform', 'other'].includes(evidence.reviewer.identityKind)) {
    refuse('L3_EVIDENCE_REVIEWER_MISSING');
  } else {
    bindings.reviewerIdentity = evidence.reviewer.identity;
    if (context.changeAuthorIdentity === undefined || context.changeAuthorIdentity === null) {
      refuse('L3_EVIDENCE_AUTHOR_UNVERIFIED');
    } else if (evidence.reviewer.identity === context.changeAuthorIdentity) {
      refuse('L3_EVIDENCE_SELF_APPROVAL');
    }
  }

  // Decision: only APPROVED is a positive decision, and it never authorizes.
  if (typeof evidence.decision !== 'string') refuse('L3_EVIDENCE_DECISION_NOT_APPROVED');
  else {
    bindings.decision = evidence.decision;
    if (evidence.decision !== 'APPROVED') refuse('L3_EVIDENCE_DECISION_NOT_APPROVED');
  }

  // Timestamps and expiry.
  const reviewedAt = parseTimestamp(evidence.reviewedAt);
  const validUntil = evidence.validUntil === null || evidence.validUntil === undefined ? null : parseTimestamp(evidence.validUntil);
  if (!reviewedAt) refuse('L3_EVIDENCE_TIMESTAMP_INVALID');
  else {
    bindings.reviewedAt = evidence.reviewedAt;
    const now = context.now ? new Date(context.now) : new Date();
    if (reviewedAt.getTime() > now.getTime() + 5 * 60 * 1000) refuse('L3_EVIDENCE_TIMESTAMP_FUTURE');
  }
  if (evidence.validUntil !== null && evidence.validUntil !== undefined) {
    if (!validUntil) refuse('L3_EVIDENCE_TIMESTAMP_INVALID');
    else {
      bindings.validUntil = evidence.validUntil;
      if (reviewedAt && validUntil.getTime() < reviewedAt.getTime()) refuse('L3_EVIDENCE_TIMESTAMP_INVALID');
      const now = context.now ? new Date(context.now) : new Date();
      if (now.getTime() > validUntil.getTime()) refuse('L3_EVIDENCE_EXPIRED');
    }
  }

  // Origin is recorded, never verified: no authenticity mechanism exists.
  if (!isObject(evidence.origin) || typeof evidence.origin.kind !== 'string' ||
    !['local-file', 'git-note', 'platform-api'].includes(evidence.origin.kind) ||
    typeof evidence.origin.detail !== 'string' || !evidence.origin.detail.trim()) {
    refuse('L3_EVIDENCE_ORIGIN_UNDECLARED');
  }
  bindings.originVerified = false;

  // The trust boundary: no evidence, however well-formed, authorizes an L3
  // change until a verifiable reviewer-identity/signature mechanism exists.
  refuse(L3_AUTHORIZATION_DISABLED_REASON);
  const valid = reasons.length === 1 && reasons[0] === L3_AUTHORIZATION_DISABLED_REASON;
  return Object.freeze({ valid, authorized: false, reasons: Object.freeze(reasons), bindings: Object.freeze(bindings) });
}

// Build an UNSIGNED evidence draft with digests and scope computed from the
// live repository. The draft records what was reviewed; it does not prove
// who reviewed it. The caller supplies reviewer identity and decision; the
// reviewer must be a different person from the change author, and the draft
// must be checked with validateL3ReviewEvidence before any use.
export async function buildReviewEvidenceDraft({
  targetDir, task, baseRef, headRef = 'HEAD', reviewer, decision = 'APPROVED',
  evidenceId = null, validUntil = null, reviewTarget, supersedes = null, reviewedAt = null,
} = {}) {
  if (typeof task !== 'string' || !SLUG.test(task)) throw new Error('L3_EVIDENCE_TASK_SLUG');
  if (!isObject(reviewer) || typeof reviewer.identity !== 'string' || !reviewer.identity.trim()) {
    throw new Error('L3_EVIDENCE_REVIEWER_REQUIRED');
  }
  const root = path.resolve(targetDir ?? '.');
  const snapshot = await createGitReviewSnapshot({ targetDir: root, baseRef, headRef });
  const record = await readProjectTaskPack(root, `docs/tasks/${task}.md`);
  const headSha = snapshot.headSha;
  const taskPackSha256 = record.sha256;
  const id = evidenceId ?? `ev-${createHash('sha256').update(`${headSha}:${taskPackSha256}`).digest('hex').slice(0, 20)}`;
  const changeAuthorIdentity = await readCommitAuthorIdentity({ targetDir: root, sha: headSha });
  return Object.freeze({
    schemaVersion: L3_REVIEW_EVIDENCE_SCHEMA_VERSION,
    policyVersion: L3_REVIEW_POLICY_VERSION,
    evidenceId: id,
    task: Object.freeze({ slug: task, taskPackSha256 }),
    reviewedRevision: Object.freeze({ baseSha: snapshot.baseSha, headSha }),
    scope: Object.freeze({
      changedFiles: Object.freeze(snapshot.changedFiles.map((f) => f.path)),
      reviewTarget: typeof reviewTarget === 'string' && reviewTarget.trim() ? reviewTarget : `Review of ${snapshot.changedFiles.length} changed file(s) between ${snapshot.baseSha.slice(0, 8)} and ${headSha.slice(0, 8)}.`,
    }),
    reviewer: Object.freeze({ identity: reviewer.identity, identityKind: reviewer.identityKind ?? 'git' }),
    decision,
    reviewedAt: reviewedAt ?? new Date().toISOString(),
    validUntil: validUntil ?? null,
    supersedes: supersedes ?? null,
    origin: Object.freeze({ kind: 'local-file', detail: 'Unsigned local evidence file. Authenticity is unverified; live L3 authorization is disabled.' }),
    changeAuthorIdentity,
  });
}
