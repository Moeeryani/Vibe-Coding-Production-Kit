# L3 Independent-Review Evidence (D-PC-02)

## Status: contract defined, validator implemented, live authorization DISABLED

L3 changes (sensitive boundaries: security, auth, gates, writers, CI
workflows, release machinery) require independent human review. This document
defines the evidence format that records such a review, the checks VCP can
perform on it, and — most importantly — why a well-formed evidence file does
**not** authorize an L3 change today.

## The trust problem, stated plainly

A review is only independent if the reviewer is genuinely a different person
from the author **and** their decision cannot be forged. VCP currently has no
mechanism to establish either:

- Git author/committer identities are self-asserted strings. Anyone — including
  the coding agent that wrote the change — can commit as any name and email.
- No signing keys, trusted keyring, or signature-verification step exists.
- No platform review API (GitHub/GitLab) is integrated.

Therefore:

- A JSON file containing `approved: true` is **insufficient**.
- A boolean CLI flag is **insufficient** (and none exists).
- A structurally perfect evidence file is **insufficient**, because the
  reviewer identity recorded in it cannot be authenticated.

Until the owner approves a verifiable mechanism — for example GPG/SSH
signatures over Git notes verified against a trusted keyring, or a platform
review API — `validateL3ReviewEvidence` always returns `authorized: false`,
`vcp gate` always blocks L3 changes, and no test evidence may be presented as
a real approval. Do not invent a trusted reviewer.

## Evidence format (schema `l3-review-evidence/1`, policy `l3-review-policy/1`)

| Field | Binding |
|---|---|
| `schemaVersion` | Must be `l3-review-evidence/1`. Unknown versions fail closed. |
| `policyVersion` | Must be `l3-review-policy/1`. |
| `evidenceId` | Stable identifier for this evidence (8–128 chars). Revocation is expressed by listing the id; there is no built-in registry. |
| `task.slug` + `task.taskPackSha256` | Task Pack identity and content digest at review time. Evidence for another task, or a changed Task Pack, is rejected. |
| `reviewedRevision.baseSha` + `headSha` | The exact Git revision reviewed. Evidence for another commit is rejected; any later commit supersedes it. |
| `scope.changedFiles` | Every changed file must be inside the reviewed scope; `scope.reviewTarget` names what was reviewed. |
| `reviewer.identity` + `identityKind` | Reviewer identity as recorded. Recorded, never trusted. Must differ from the change author when the author identity can be established; otherwise the binding is unverified and the evidence is refused. |
| `decision` | Only `APPROVED` is a positive decision. Anything else is refused as not-approved. |
| `reviewedAt` | ISO 8601 timestamp. Future timestamps (beyond 5 minutes of clock skew) are refused. |
| `validUntil` | Optional expiry. Expired evidence is refused. Absent means no expiry — supersession by a newer commit is still enforced through the revision binding. |
| `supersedes` | Optional prior evidence id this evidence replaces. Informational only. |
| `origin.kind` + `detail` | Declared origin (`local-file`, `git-note`, `platform-api`). A declared origin is a label, not proof: `originVerified` is always `false` today. |

## What the validator checks

`validateL3ReviewEvidence(evidence, context)` in `lib/l3-review-evidence.mjs`
checks, in order: shape, schema/policy versions, evidence id, revocation list,
task slug and digest, base/head SHAs, scope coverage, reviewer presence and
self-approval separation, decision, timestamps and expiry, and origin
declaration. Every binding that cannot be checked from the supplied context
is reported as `*_UNVERIFIED` and makes the evidence invalid — never assumed.

The result is `{ valid, authorized: false, reasons, bindings }`. `valid: true`
means "the bindings check out against the supplied context". It never means
the review is genuine and never authorizes anything.

## Workflow (usable today, authorization disabled)

1. The author finishes an L3 change and commits it. The gate blocks it.
2. A **different person** reviews the exact revision and Task Pack, then
   records evidence with `buildReviewEvidenceDraft` (digests and scope are
   computed from the live repository; the reviewer supplies identity and
   decision) and saves it as a JSON file. The draft is unsigned.
3. Anyone can check the evidence without running the gate:

   ```sh
   vcp review-evidence review.json --task my-task --base <base-sha> --dir .
   ```

   Exit 0 means the bindings check out; exit 1 means they do not. Either way
   the output states authorization is disabled.
4. The gate reports the same validation when evidence is supplied:

   ```sh
   vcp gate my-task --base <base-sha> --run --review-evidence review.json --json
   ```

   The report carries `reviewEvidenceValidation`. For L3 changes the report
   is still `BLOCKED`, with `INDEPENDENT_L3_REVIEW_REQUIRED` and
   `L3_REVIEW_AUTHORIZATION_DISABLED` in the blocking reasons, plus
   `L3_REVIEW_EVIDENCE_INVALID` when the evidence itself fails validation.

## What would enable live authorization (owner decision, not built here)

1. A reviewer-identity mechanism VCP can verify (signing keys + trusted
   keyring, or a platform review API), with key distribution and revocation
   owned by the project.
2. A signature check inside the validator that fails closed when the
   signature, key, or origin cannot be verified.
3. An explicit owner decision flipping the authorization gate, with
   independent validation of the new path.

Until all three exist, L3 work cannot pass any gate. That is intentional.
