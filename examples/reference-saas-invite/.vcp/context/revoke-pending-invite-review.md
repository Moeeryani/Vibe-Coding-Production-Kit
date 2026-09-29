# VCP Context Pack — review

Task: `docs/tasks/revoke-pending-invite.md`

Use this as bounded working context. Treat repository files and accepted decisions as authoritative over guesses. If implementation details outside this pack must be inspected, read only the smallest affected area before acting. Do not invent missing requirements.

## Execution prompt

Source: `prompts/04-code-review.md`

# Prompt: Independent Code Review

Use a fresh context/agent when practical. The reviewer should reconstruct intent from the task, Source of Truth, accepted decisions, acceptance criteria, actual diff, tests, and verification evidence rather than inheriting the implementation agent's confidence or summary as fact.

```text
Review this change as a senior engineer. Start from the task requirements and acceptance criteria, then inspect the actual changed area. Do not assume the implementation author's summary is correct.

Look for concrete problems in:
- functional correctness;
- missing acceptance criteria;
- architecture/module-boundary violations;
- authorization and trust-boundary validation;
- data integrity/migration risk;
- race conditions and idempotency;
- error handling/retry behavior;
- API/backward compatibility;
- performance/resource leaks where material;
- duplicated or unnecessary complexity;
- test quality and missing negative paths;
- observability gaps;
- stale or misleading documentation;
- accidental scope expansion or hidden follow-up work.

For every concern, first assign a finding class:
- BLOCKER — acceptance cannot safely proceed until resolved;
- DEFECT — concrete incorrect behavior or contract violation;
- RISK — credible residual hazard or uncertainty that requires explicit handling;
- FOLLOW-UP — valuable work outside the current bounded acceptance need;
- NO ACTION — reviewed concern does not require a change.

For actionable findings report:
- finding class;
- severity where applicable: critical / high / medium / low;
- file and line/area;
- concrete failure scenario or evidence;
- why it matters;
- recommended correction;
- current-task disposition: must fix in this task / follow-up candidate.

Finding class and current-task disposition are separate concepts. For example, a low-severity DEFECT may still be must-fix if it violates acceptance criteria, while a useful FOLLOW-UP should not silently expand the current task.

Use `must fix in this task` when the issue is required for acceptance criteria, correctness, security, compatibility, data integrity, or the agreed Definition of Done. Use `follow-up candidate` for broader improvements, optional refactors, or newly discovered work that is valuable but not required for this bounded task.

Do not give style-only feedback unless it affects readability, maintainability, correctness, or agreed conventions. If you find no blocking issue, state what you verified, any NO ACTION concerns you checked, and residual risks rather than merely saying “LGTM”.
```

## Repository instructions

Source: `AGENTS.md`

# AGENTS.md — Reference SaaS Invitation Slice

## Source of truth
Before code changes, read the requirement, domain model, architecture, ADR, threat model, test strategy, and current task under `docs/`.

## Scope
This is a reference vertical slice. Do not introduce an HTTP framework, database, authentication library, email provider, or other dependency unless the task explicitly expands the example.

## Architecture
- Business invitation invariants stay in `src/domain`.
- Use-case orchestration and authorization stay in `src/application`.
- Repository mechanics stay in `src/infrastructure`.
- Acceptance must never accept a client-supplied organization ID.
- Raw invitation tokens must never enter persistent entity state.

## Security
- Keep application-facing invitation failure intentionally coarse.
- Add negative tests for every security-sensitive behavior change.
- Never log invitation tokens.

## Verification

```text
INSTALL_COMMAND=npm install
FORMAT_CHECK_COMMAND=n/a
LINT_COMMAND=n/a
TYPECHECK_COMMAND=n/a
UNIT_TEST_COMMAND=npm test
INTEGRATION_TEST_COMMAND=n/a
BUILD_COMMAND=n/a
E2E_COMMAND=n/a
```

## Completion
Run `npm test` and `npm run check`. Report production gaps honestly; this example is not a deployable SaaS application.

## Task

Source: `docs/tasks/revoke-pending-invite.md`

# Task — Manually revoke a pending organization invitation

Status: Ready for implementation
Slug: `revoke-pending-invite`

## Outcome

An authorized organization administrator can manually revoke a pending invitation in their own organization, after which the revoked invitation's token can never be accepted.

## Source of truth

| Source | Reference |
|---|---|
| Product / PRD | `docs/product/PRD.md` — Actors and permissions: admin with members.invite may issue/revoke invites in own org; forbidden in another org |
| User flow | `docs/product/USER-FLOWS.md` — Flow A context; no manual-revoke flow exists yet (this task adds the behavior it implies) |
| Domain | `docs/architecture/DOMAIN.md` — invariant 3 (only pending transitions); revoked terminal state |
| Architecture | `docs/architecture/ARCHITECTURE.md` — authorization in application service; invitation.revoked observability event |
| ADR | `docs/architecture/adr/ADR-001-invite-token-storage.md` — unchanged; revocation never requires raw token material |
| Security | `docs/security/THREAT-MODEL.md` — T-001, T-002, T-007, T-010; audit trail asset |
| Testing | `docs/testing/TEST-STRATEGY.md` — unit/application layers |
| Delivery | `docs/delivery/DEFINITION-OF-READY.md`, `docs/delivery/DEFINITION-OF-DONE.md`, `docs/delivery/TASK-001-accept-invite.md` |

## Requirement restatement

Add an administrator-initiated revocation use case to the invitation application service. The actor must belong to the invitation's organization and hold `members.invite` (PRD actor table). Only a `pending` invitation may transition to `revoked`; `accepted` and `revoked` are terminal (domain invariants 3, state transitions). A revoked invitation's token must fail acceptance (AC-102 already governs this downstream consequence). Revocation identification and audit attribution are open decisions — see Decisions.

## Decisions

### Approved (from existing Source of Truth — do not reopen)

- AD-01: Authorization for revoke is `members.invite` restricted to the actor's own organization; no separate permission exists (PRD actor table; preserve as accepted scope).
- AD-02: Only `pending` may transition to `revoked`; `revoked` is terminal (DOMAIN.md invariants 3 + state transitions).
- AD-03: Application-facing invitation failures stay intentionally coarse; no raw tokens in state, logs, or inputs (example `AGENTS.md` Security; ADR-001).
- AD-04: Organization is never client-authoritative for the transition; it is derived from the stored invitation and matched against the actor (ARCHITECTURE.md boundaries, pattern of AC-105).
- AD-05: HTTP endpoint, authentication implementation, persistent database, email delivery, and audit event emission remain out of scope for this reference slice (PRODUCT-BRIEF non-goals; README production gaps).

### Proposed (agent defaults — PROPOSED, not APPROVED)

- AP-01: Reuse the existing `revokeInvitation` domain function (src/domain/invitation.mjs:39) rather than re-encoding the transition rule in the application layer.
- AP-02: Add a repository compare-and-set operation (`revokeIfPending`) mirroring `acceptIfPending` semantics, so concurrent acceptance/revocation cannot both win.
- AP-03: Non-owner/unknown invitation lookups fail with a single coarse error indistinguishable from "not found" to prevent cross-tenant enumeration; cross-org actor evidence never confirms existence of the target record (T-001/USER-FLOWS error-privacy rule).
- AP-04: An expired-but-still-`pending` invitation is revocable (derived from DOMAIN.md: expiry is behavioral, status remains `pending`, so invariant 3 permits the transition).

### Approved in session (HUMAN DECISIONS resolved by the decision owner, 2026-09-30)

- AD-06 (was HD-1): The admin identifies the invitation to revoke **by invitation id**. The service contract is `revoke({ actor, invitationId })`; the organization is derived from the stored invitation and matched against the actor; no email-based or dual identification entry point is added.
- AD-07 (was HD-2): Revocation is **status-only**. No `revokedByUserId`/`revokedAt` columns are added to the entity or DATA-MODEL in this task. Attribution is delegated to the production `invitation.revoked` audit event and recorded as an explicit documented limitation (PRD FR-003 + this task's completion report). Do not reopen either decision without a new human decision.

### Resolved proposals (accepted as engineering defaults unless later corrected)

- AP-01, AP-02, AP-03, AP-04 stand as proposed and are implemented as labeled; they do not override AD-01 through AD-07.

## Acceptance criteria

- [ ] AC-001 — An admin in the invitation's organization with `members.invite` transitions the pending invitation to `revoked`.
- [ ] AC-002 — After revocation, acceptance with the original delivery token fails with the coarse invalid-invitation error (links to AC-102).
- [ ] AC-003 — An actor without `members.invite` is rejected (T-002).
- [ ] AC-004 — An actor from another organization cannot revoke the invitation, with no existence leak (T-001, T-008 pattern).
- [ ] AC-005 — Non-pending invitations (`accepted`, `revoked`) cannot be revoked; `revoked` stays terminal; a second revoke does not succeed (AD-02, T-007).
- [ ] AC-006 — Identification input is the invitation id per AD-06; organization is never taken from client input as authoritative (AD-04).
- [ ] AC-007 — No raw token appears as an input to revocation, in persisted state, or in any new error text (ADR-001, T-010).
- [ ] AC-008 — Tests added for every path above; `npm test` and `npm run check` pass.

## Scope

### In scope
- Application-service revocation use case with actor authorization.
- Domain transition reuse (`revokeInvitation` already exists).
- Memory-repository compare-and-set revocation.
- Unit/application tests including negative security paths.
- Task Pack and, if HD-2 approves it, DATA-MODEL/DOMAIN/PRD updates (Slice 2).

### Out of scope
- HTTP/API surface, authentication implementation, persistent database, membership writes, email provider (AD-05).
- Automatic/expiry-driven revocation.
- Bulk revoke, re-invite UI semantics, audit event emission (production gaps stay documented).
- Changing issuance replacement semantics (`replacePending` behavior as-is).

## Affected boundaries

- Modules/files likely affected: `src/application/invitation-service.mjs`, `src/infrastructure/memory-invitation-repository.mjs`, `test/invitation-service.test.mjs`; conditionally `src/domain/invitation.mjs` (only if HD-2 adds attribution fields).
- Public API/contract impact: new application-service method; behavior of existing methods unchanged.
- Data/schema/migration impact: status value `revoked` already exists (DATA-MODEL); Slice 2 only, if approved, adds nullable attribution columns to the documented model.
- External integration impact: none (reference example, in-memory).

## Domain invariants

- Invariant 3: only `pending` → `revoked`; terminal states preserved.
- Invariant 2 / AD-03: raw tokens never in persistent state or in revocation inputs.
- Invariant 1: revocation must not rewrite `orgId` (DATA-MODEL: tenant ID immutable).
- Invariant 7 remains enforced: revocation cannot make an accepted invitation acceptable again.

## Security and privacy

- Authentication impact: none — actor resolution stays upstream (boundary rule).
- Authorization/resource ownership: `members.invite` + same organization required (AD-01).
- Tenant isolation: cross-org revoke must fail like cross-tenant issuance (T-001); no existence leak (AP-03).
- Input/trust boundaries: identifier input validated at service boundary; unknown identifiers fail coarse.
- Secrets/PII/logging: no tokens in errors or state; email stays normalized as already stored.
- Abuse/rate/replay considerations: second revoke must not re-succeed (terminal state); production rate limiting remains documented gap (T-009).
- Relevant threat IDs: T-001, T-002, T-007, T-010.

## Failure modes and edge cases

- Unknown identifier, non-pending status, expired-but-pending (AP-04: revocable), actor permission loss mid-flow, concurrent accept-vs-revoke (AP-02 CAS; in-memory adapter cannot prove DB atomicity — stated per DoR), double revoke, cross-tenant identifier probe.

## Observability

Reference example emits no events today. Production contract already names `invitation.revoked` (ARCHITECTURE.md); this task changes no code observability. If HD-2 approves persisted attribution, DATA-MODEL documents it; event emission stays a production gap.

## Test plan

### Unit
- Domain: `revokeInvitation` on pending succeeds; on accepted/revoked throws `invalid_transition` (direct domain coverage; function exists but has no dedicated test today).

### Integration / contract
- n/a — no external systems in this example; repository CAS behavior covered at application layer.

### E2E / regression
- Regression: revoked invite's original token rejected by `accept`.

### Negative/security paths
- Actor without permission rejected (T-002).
- Cross-org actor rejected with the same coarse outcome as unknown id (T-001).
- Accepted and already-revoked invitations not revocable (T-007).
- Double revoke does not re-succeed.
- Expired-pending revocable (if AP-04 stands).

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive service behavior; no breaking change to existing methods.
- Migration/backfill: none for Slice 1. Slice 2 (if approved) documents nullable columns; the reference repository needs no migration step.
- Rollback or recovery: revert commit; status-only data change has no irreversible effect in the in-memory example.

## Implementation plan

Slices (dependencies explicit; execution mode per slice):

1. Slice 1 — APPROVED (HD-1 resolved as AD-06), AFK-safe: implement application-service `revoke({ actor, invitationId })` (authorization per AD-01/AD-04, coarse failures per AP-03), repository `revokeIfPending` CAS per AP-02, domain reuse per AP-01, full test matrix above. Acceptance evidence: new tests + existing suite green via `npm test`; syntax gate via `npm run check`.
2. Slice 2 — RESOLVED as no-code (HD-2 resolved as AD-07): status-only revocation; no entity/DATA-MODEL attribution columns. The attribution limitation is documented in PRD FR-003 and the completion report instead.
3. Both slices — APPROVED: add PRD FR-003 (manual revoke) and USER-FLOWS Flow C (admin revokes pending invite) reflecting exactly the approved contract, including the status-only attribution limitation.

## Verification commands

Run the relevant configured commands below before completion:

- `INSTALL_COMMAND`: `npm install`
- `UNIT_TEST_COMMAND`: `npm test`

Additionally required by this project's Definition of Done but not representable as a keyed VCP command (no `CHECK_COMMAND` key exists): `npm run check` — executed manually with recorded exit code.

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [ ] Acceptance criteria are satisfied.
- [ ] No unrelated changes are included.
- [ ] Architecture/module boundaries are respected.
- [ ] Authorization and tenant/resource ownership are correct.
- [ ] Validation/error handling covers negative paths.
- [ ] Concurrency/idempotency/race risks were considered where relevant.
- [ ] Tests prove behavior rather than implementation details.
- [ ] Docs/contracts/ADRs were updated when required.

## Completion report

At handoff:

- What changed and why:
- Verification actually run:
- Migration/operational impact:
- Remaining risks/limitations:

## Referenced source of truth

## docs/product/PRD.md

Source: `docs/product/PRD.md`

# PRD — Organization Invitations

## Document control
- Owner: Membership domain
- Status: Accepted for reference implementation
- Last updated: 2026-09-22
- Related ADRs: ADR-001

## Actors and permissions

| Actor | Goal | Allowed | Forbidden |
|---|---|---|---|
| Org admin with `members.invite` | Invite a person | Issue/revoke invite in own org | Invite into another org |
| Authenticated invitee | Join invited org | Accept invite matching verified email | Accept for another email/user |
| Anonymous caller | Follow link | Reach auth boundary | Create membership |

## FR-001 — Issue invitation

**Preconditions**
- Actor is authenticated.
- Actor belongs to the target organization.
- Actor has `members.invite`.

**Main flow**
1. Normalize the invitee email.
2. Invalidate any previous pending invite for the same organization + normalized email.
3. Generate a cryptographically random bearer token.
4. Persist only a hash of the token with organization, email, issuer, and expiry.
5. Return the raw token only to the delivery boundary.

**Acceptance criteria**
- AC-001: Cross-organization issuance is rejected.
- AC-002: Missing invite permission is rejected.
- AC-003: Stored record contains token hash, never the raw token.
- AC-004: Only one pending invite exists for an organization + email in the repository contract.

## FR-002 — Accept invitation

**Preconditions**
- Caller is authenticated.
- Caller has a verified email.

**Main flow**
1. Hash supplied token and find invitation by token hash.
2. Verify state is pending and not expired/revoked/accepted.
3. Verify caller's normalized verified email equals invited email.
4. Atomically transition invitation from pending to accepted.
5. Production integration creates membership in the invitation's organization in the same transaction/workflow boundary.

**Acceptance criteria**
- AC-101: Unknown tokens do not create membership.
- AC-102: Expired/revoked/accepted invites cannot be accepted.
- AC-103: Verified-email mismatch is rejected.
- AC-104: A token can produce at most one successful acceptance.
- AC-105: Organization is derived from the invitation record, never from client input during acceptance.

## FR-003 — Manually revoke a pending invitation

**Preconditions**
- Actor is authenticated.
- Actor belongs to the invitation's organization.
- Actor has `members.invite`.

**Main flow**
1. Actor identifies the invitation by invitation id.
2. Service loads the invitation; organization is derived from the stored record and matched against the actor.
3. A `pending` invitation transitions to `revoked` exactly once; `accepted` and `revoked` are terminal.
4. The revoked invitation's original token can no longer be accepted (see AC-102).

**Acceptance criteria**
- AC-201: Cross-organization and unknown ids fail with an indistinguishable coarse error; no existence leak.
- AC-202: Missing invite permission is rejected.
- AC-203: Non-pending invitations cannot be revoked; a second revoke does not succeed.
- AC-204: After successful revocation, acceptance with the original token is rejected.
- AC-205: Revocation accepts no organization id and no raw token as input.

**Decision note (2026-09-30)**: revocation is status-only in this reference slice; persisted `revoked_by`/`revoked_at` attribution was explicitly rejected, deferring attribution to the production `invitation.revoked` audit event. This is a known limitation, not an oversight.

## Reliability and security

- Acceptance must be idempotent/safe under retries; duplicate successful transitions are not allowed.
- Token material must not appear in application logs, analytics, or persistent storage.
- Production persistence must enforce the pending->accepted transition atomically.

## Out of scope

Email rendering/delivery, authentication UX, membership database schema, billing seat rules, SCIM, and bulk invitations.

## docs/product/USER-FLOWS.md

Source: `docs/product/USER-FLOWS.md`

# User Flows — Organization Invitation

## Flow A — Admin issues invite

1. Admin opens organization member management.
2. System authenticates admin and resolves org-scoped permissions.
3. Admin enters invitee email.
4. API validates input and calls invitation application service with admin identity and target org.
5. Service verifies tenant + `members.invite`, normalizes email, replaces any prior pending invite, stores token hash, and emits delivery token to the email boundary.
6. UI shows a generic success state.

### Failure states
- admin lost permission;
- target org does not match actor org;
- invalid email;
- rate/quota exceeded;
- email provider unavailable after invite creation (production workflow must define retry/recovery).

## Flow B — Invitee accepts

1. Invitee follows emailed link containing bearer token.
2. If not authenticated, system completes authentication first.
3. System requires a verified email.
4. API submits token plus authenticated identity; it does not submit target org.
5. Service resolves invite from token hash, validates pending state, expiry, and email binding.
6. Production persistence atomically accepts invite and creates membership.
7. User enters the organization.

### Failure states
- unknown/expired/revoked/replayed token;
- authenticated user's verified email differs;
- membership already exists;
- transaction/workflow failure.

User-facing errors should avoid exposing unnecessary invite/account state.

## Flow C — Admin manually revokes a pending invite

1. Admin selects a pending invitation in organization member management (identified by invitation id).
2. System authenticates admin and resolves org-scoped permissions.
3. API calls the invitation service with the admin identity and invitation id; it does not submit a target org or the raw token.
4. Service requires `members.invite`, derives the organization from the stored invitation, and transitions `pending -> revoked` exactly once.
5. The invitee can no longer accept with the original link.

### Failure states
- unknown id or invitation from another organization (identical coarse response, no existence leak);
- invitation already accepted or revoked;
- admin lost `members.invite` permission.

Manual revocation attribution is not persisted on the invitation record in this slice; production audit events are the attribution mechanism.

## docs/architecture/DOMAIN.md

Source: `docs/architecture/DOMAIN.md`

# Domain — Invitations

## Entity: Invitation

Fields:
- `id`
- `orgId`
- `email` (normalized)
- `tokenHash`
- `status`: `pending | accepted | revoked`
- `issuedByUserId`
- `expiresAt`
- `acceptedByUserId?`
- `acceptedAt?`

## Invariants

1. Invitation belongs to exactly one organization.
2. Raw token is not part of persistent domain state.
3. Only `pending` may transition to `accepted` or `revoked`.
4. Expired invitations are not acceptable even when status remains `pending`.
5. Accepting user must have a verified email equal to the invited normalized email.
6. Organization membership target is derived from the invitation, not caller input.
7. A successful acceptance transition occurs at most once.

## State transitions

```text
pending -> accepted
pending -> revoked
pending -(time passes)-> expired behavior (derived, not persisted in this example)
accepted -> terminal
revoked -> terminal
```

The example derives expiry from `expiresAt` instead of adding a fourth persisted status, avoiding contradictory `status=pending` plus `isExpired=true` flags.

## docs/architecture/ARCHITECTURE.md

Source: `docs/architecture/ARCHITECTURE.md`

# Architecture — Invitation Vertical Slice

## Style

Layered modular slice:

```text
Delivery/API (not implemented here)
        |
Application service
        |
Domain entity + rules
        |
Repository / token / clock adapters
```

## Dependency direction

Domain has no dependency on application or infrastructure. Application depends on the domain and repository contract behavior. Infrastructure implements persistence behavior.

## Boundaries

- Authentication resolves the current actor before calling the application layer.
- Authorization to issue is enforced by the application service using actor organization + permission evidence.
- Acceptance never accepts `orgId` from the caller; tenant comes from the invitation record.
- Token hashing occurs before persistence lookup/storage.

## Production persistence contract

A real repository must make these operations atomic:

- replace previous pending invite for `(orgId, normalizedEmail)` when issuing;
- transition `pending -> accepted` exactly once;
- create membership consistently with acceptance (transaction or durable workflow, depending on architecture).

The in-memory repository demonstrates semantics but is not a concurrency substitute for a database constraint/transaction.

## Observability contract

Production adapters should emit structured audit/domain events without raw token data:
- `invitation.issued`
- `invitation.revoked`
- `invitation.accepted`
- rejected acceptance counters by coarse reason category

Do not include invitation token or unnecessary PII in logs.

## docs/architecture/adr/ADR-001-invite-token-storage.md

Source: `docs/architecture/adr/ADR-001-invite-token-storage.md`

# ADR-001 — Persist invitation token hashes, not raw tokens

## Status
Accepted

## Context
Invitation links contain bearer secrets. A database read, backup leak, debug export, or accidental internal query should not immediately expose usable invitation links.

## Decision
Generate at least 256 bits of random token material. Return the raw token only to the delivery boundary. Persist a SHA-256 hash and look up invitations by hashing the presented token.

## Alternatives considered

### Store raw token
Simpler lookup, but database compromise exposes immediately usable bearer credentials. Rejected.

### Encrypt raw token reversibly
Still creates a key-management dependency and retains the ability to recover bearer secrets. No product requirement needs recovery. Rejected.

## Consequences

- Lost raw token cannot be recovered; a resend creates/replaces an invitation.
- Token comparison occurs on a fixed-size hash.
- Logs and telemetry must still avoid raw tokens before hashing.

## Reconsider when
A future protocol requires token recovery rather than one-way validation; that would require a new threat analysis and ADR.

## docs/security/THREAT-MODEL.md

Source: `docs/security/THREAT-MODEL.md`

# Threat Model — Organization Invitations

## Assets

| Asset | Why it matters |
|---|---|
| Organization membership | Grants tenant data/access |
| Invitation bearer token | Can authorize joining an organization |
| Verified email binding | Connects invite intent to identity |
| Audit trail | Needed for investigation and admin accountability |

## Trust boundaries

```text
Admin client -> authenticated API -> invitation service -> database
Email provider -> invitee mailbox/browser -> authenticated API
```

## Threat inventory

| ID | Threat | Control | Verification |
|---|---|---|---|
| T-001 | Cross-tenant invite issuance | Actor org must equal target org | Negative test |
| T-002 | Broken access control | Require `members.invite` | Negative test |
| T-003 | DB leak exposes usable invite links | Persist hash only | Storage assertion test |
| T-004 | Stolen token used by wrong account | Verified email must match | Negative test |
| T-005 | Replay / duplicate acceptance | Atomic pending->accepted transition | Replay test + DB integration test in production |
| T-006 | Expired token accepted | Compare clock with `expiresAt` | Boundary/expiry tests |
| T-007 | Revoked token accepted | Terminal revoked state | Negative test |
| T-008 | Client chooses another tenant on acceptance | Org derived only from invite | API contract test |
| T-009 | Invite bombing | Rate limits / quotas outside this reference code | Integration/abuse tests |
| T-010 | Token leaks through logs/analytics | Redaction + never log token | Logging tests/manual review |

## Residual risks

Email account compromise can still expose a valid invitation before acceptance. Production policy may require additional controls for privileged roles (shorter expiry, re-authentication, admin approval, or SSO/SCIM).

## docs/testing/TEST-STRATEGY.md

Source: `docs/testing/TEST-STRATEGY.md`

# Test Strategy — Invitation Slice

## Unit/domain tests

Verify:
- email normalization;
- pending->accepted transition;
- expired invitation rejection;
- revoked/accepted invitation rejection;
- verified-email mismatch rejection.

## Application tests

Verify:
- issuer authorization and tenant match;
- raw token is not persisted;
- replacement semantics for a repeated invite;
- unknown token rejection;
- replay cannot succeed twice;
- acceptance returns organization derived from the stored invite.

## Production integration tests still required

- database unique/locking/transaction semantics under concurrency;
- membership creation transaction/workflow;
- API validation and error mapping;
- authentication integration;
- email provider contract;
- audit event persistence;
- rate limiting.

## E2E critical path

1. Admin signs in.
2. Admin invites `person@example.com` to org A.
3. Mailbox receives link without token appearing in server logs.
4. Intended user signs in with verified matching email.
5. Invite acceptance creates membership in org A.
6. Reopening the same link cannot create another membership.

## docs/delivery/DEFINITION-OF-READY.md

Source: `docs/delivery/DEFINITION-OF-READY.md`

# Definition of Ready — Reference Slice

A task is ready when:

- linked PRD acceptance criteria are named;
- affected domain invariants are identified;
- tenant/authorization impact is explicit;
- relevant threat IDs are listed;
- in-scope and out-of-scope boundaries are written;
- tests to add/update are specified;
- any persistence/concurrency behavior not proven by the in-memory adapter is called out.

## docs/delivery/DEFINITION-OF-DONE.md

Source: `docs/delivery/DEFINITION-OF-DONE.md`

# Definition of Done — Reference Slice

A task is done when:

- acceptance criteria are demonstrably satisfied;
- domain/application boundaries remain intact;
- negative-path security tests exist for changed sensitive behavior;
- `npm test` passes;
- `npm run check` passes;
- documentation/ADR is updated when a contract or decision changed;
- raw token material is not persisted or logged;
- remaining production gaps are stated rather than implied away.

## docs/delivery/TASK-001-accept-invite.md

Source: `docs/delivery/TASK-001-accept-invite.md`

# TASK-001 — Accept organization invitation

## Requirement
Implement the application/domain behavior for accepting a pending organization invite.

## Source of truth
- PRD: FR-002 / AC-101 through AC-105
- Domain invariants: `docs/architecture/DOMAIN.md`
- Token decision: ADR-001
- Threats: T-004 through T-008

## Scope

In scope:
- token hash lookup;
- invitation state/expiry checks;
- verified-email binding;
- exactly-once in-memory transition semantics for the reference repository;
- tests for all negative paths.

Out of scope:
- HTTP endpoint;
- authentication implementation;
- persistent database;
- membership write;
- email provider.

## Acceptance criteria

- Unknown token rejected.
- Expired invite rejected.
- Revoked invite rejected.
- Email mismatch rejected.
- Valid invite accepted once.
- Replay rejected.
- Returned org ID comes from stored invitation.

## Security notes

Do not log the raw token. Do not accept org ID as an input to acceptance.

## Verification

```bash
npm test
npm run check
```

## Explicit extra context

## src/application/invitation-service.mjs

Source: `src/application/invitation-service.mjs`

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { acceptInvitationEntity, createInvitationEntity, normalizeEmail, revokeInvitation } from '../domain/invitation.mjs';

export class AuthorizationError extends Error {
  constructor(message = 'Not authorized.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class InvalidInviteError extends Error {
  constructor(message = 'Invitation is invalid or unavailable.') {
    super(message);
    this.name = 'InvalidInviteError';
  }
}

export function hashInviteToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class InvitationService {
  constructor({ repository, now = () => new Date(), tokenFactory = () => randomBytes(32).toString('base64url'), idFactory = randomUUID }) {
    this.repository = repository;
    this.now = now;
    this.tokenFactory = tokenFactory;
    this.idFactory = idFactory;
  }

  async issue({ actor, orgId, email, ttlMs = 48 * 60 * 60 * 1000 }) {
    if (!actor || actor.orgId !== orgId || !actor.permissions?.includes('members.invite')) {
      throw new AuthorizationError();
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError('ttlMs must be positive.');

    const rawToken = this.tokenFactory();
    const issuedAt = this.now();
    const invitation = createInvitationEntity({
      id: this.idFactory(),
      orgId,
      email: normalizeEmail(email),
      tokenHash: hashInviteToken(rawToken),
      issuedByUserId: actor.userId,
      expiresAt: new Date(issuedAt.getTime() + ttlMs)
    });

    await this.repository.replacePending(invitation);
    return { invitation, deliveryToken: rawToken };
  }

  async revoke({ actor, invitationId }) {
    if (!actor || !actor.userId || !actor.permissions?.includes('members.invite')) {
      throw new AuthorizationError();
    }
    if (typeof invitationId !== 'string' || !invitationId) throw new InvalidInviteError();

    const invitation = await this.repository.findById(invitationId);
    if (!invitation || invitation.orgId !== actor.orgId) throw new InvalidInviteError();

    let revoked;
    try {
      revoked = revokeInvitation(invitation);
    } catch {
      throw new InvalidInviteError();
    }

    const committed = await this.repository.revokeIfPending(revoked);
    if (!committed) throw new InvalidInviteError();

    return { invitationId: revoked.id, status: revoked.status };
  }

  async accept({ token, authenticatedUser }) {
    if (!authenticatedUser?.userId || !authenticatedUser?.verifiedEmail) {
      throw new AuthorizationError('Authenticated user with verified email is required.');
    }
    if (typeof token !== 'string' || token.length < 16) throw new InvalidInviteError();

    const tokenHash = hashInviteToken(token);
    const invitation = await this.repository.findByTokenHash(tokenHash);
    if (!invitation) throw new InvalidInviteError();

    let accepted;
    try {
      accepted = acceptInvitationEntity(invitation, {
        userId: authenticatedUser.userId,
        verifiedEmail: authenticatedUser.verifiedEmail,
        now: this.now()
      });
    } catch {
      throw new InvalidInviteError();
    }

    const committed = await this.repository.acceptIfPending(accepted);
    if (!committed) throw new InvalidInviteError();

    return {
      invitationId: accepted.id,
      orgId: accepted.orgId,
      email: accepted.email,
      acceptedByUserId: accepted.acceptedByUserId
    };
  }
}

## src/infrastructure/memory-invitation-repository.mjs

Source: `src/infrastructure/memory-invitation-repository.mjs`

export class MemoryInvitationRepository {
  #byId = new Map();
  #idByTokenHash = new Map();

  async replacePending(invitation) {
    for (const existing of this.#byId.values()) {
      if (existing.orgId === invitation.orgId && existing.email === invitation.email && existing.status === 'pending') {
        const revoked = { ...existing, status: 'revoked' };
        this.#byId.set(existing.id, revoked);
      }
    }
    this.#byId.set(invitation.id, structuredClone(invitation));
    this.#idByTokenHash.set(invitation.tokenHash, invitation.id);
  }

  async findByTokenHash(tokenHash) {
    const id = this.#idByTokenHash.get(tokenHash);
    if (!id) return null;
    const value = this.#byId.get(id);
    return value ? structuredClone(value) : null;
  }

  async acceptIfPending(accepted) {
    const current = this.#byId.get(accepted.id);
    if (!current || current.status !== 'pending') return false;
    this.#byId.set(accepted.id, structuredClone(accepted));
    return true;
  }

  async revokeIfPending(revoked) {
    const current = this.#byId.get(revoked.id);
    if (!current || current.status !== 'pending') return false;
    this.#byId.set(revoked.id, structuredClone(revoked));
    return true;
  }

  async findById(id) {
    const value = this.#byId.get(id);
    return value ? structuredClone(value) : null;
  }
}

## src/domain/invitation.mjs

Source: `src/domain/invitation.mjs`

export class InvitationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InvitationError';
    this.code = code;
  }
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new InvitationError('invalid_email', 'Email is required.');
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new InvitationError('invalid_email', 'Email is invalid.');
  }
  return normalized;
}

export function createInvitationEntity({ id, orgId, email, tokenHash, issuedByUserId, expiresAt }) {
  if (!id || !orgId || !tokenHash || !issuedByUserId) {
    throw new InvitationError('invalid_invitation', 'Invitation identifiers are required.');
  }
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    throw new InvitationError('invalid_expiry', 'Invitation expiry is invalid.');
  }

  return {
    id,
    orgId,
    email: normalizeEmail(email),
    tokenHash,
    issuedByUserId,
    expiresAt: new Date(expiresAt),
    status: 'pending',
    acceptedByUserId: null,
    acceptedAt: null
  };
}

export function revokeInvitation(invitation) {
  if (invitation.status !== 'pending') {
    throw new InvitationError('invalid_transition', 'Only pending invitations can be revoked.');
  }
  return { ...invitation, status: 'revoked' };
}

export function acceptInvitationEntity(invitation, { userId, verifiedEmail, now }) {
  if (invitation.status !== 'pending') {
    throw new InvitationError('invite_not_pending', 'Invitation is no longer pending.');
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InvitationError('invalid_clock', 'Current time is invalid.');
  }
  if (now.getTime() >= invitation.expiresAt.getTime()) {
    throw new InvitationError('invite_expired', 'Invitation has expired.');
  }
  if (normalizeEmail(verifiedEmail) !== invitation.email) {
    throw new InvitationError('email_mismatch', 'Verified email does not match invitation.');
  }
  if (!userId) {
    throw new InvitationError('invalid_user', 'Authenticated user is required.');
  }

  return {
    ...invitation,
    status: 'accepted',
    acceptedByUserId: userId,
    acceptedAt: new Date(now)
  };
}

## test/invitation-service.test.mjs

Source: `test/invitation-service.test.mjs`

import assert from 'node:assert/strict';
import test from 'node:test';
import { InvitationService, AuthorizationError, InvalidInviteError, hashInviteToken } from '../src/application/invitation-service.mjs';
import { MemoryInvitationRepository } from '../src/infrastructure/memory-invitation-repository.mjs';
import { revokeInvitation, InvitationError } from '../src/domain/invitation.mjs';

function harness({ now = new Date('2026-09-22T12:00:00Z') } = {}) {
  const repository = new MemoryInvitationRepository();
  let current = new Date(now);
  let tokenNumber = 0;
  let idNumber = 0;
  const service = new InvitationService({
    repository,
    now: () => new Date(current),
    tokenFactory: () => `reference-token-${String(++tokenNumber).padStart(32, '0')}`,
    idFactory: () => `invite-${++idNumber}`
  });
  return { repository, service, setNow(value) { current = new Date(value); } };
}

const adminA = { userId: 'admin-a', orgId: 'org-a', permissions: ['members.invite'] };
const adminB = { userId: 'admin-b', orgId: 'org-b', permissions: ['members.invite'] };
const memberA = { userId: 'member-a', orgId: 'org-a', permissions: [] };

async function issued(h, overrides = {}) {
  return h.service.issue({ actor: adminA, orgId: 'org-a', email: 'Person@Example.com', ...overrides });
}

test('authorized admin issues an invite and repository stores only its hash', async () => {
  const h = harness();
  const { invitation, deliveryToken } = await issued(h);
  const stored = await h.repository.findById(invitation.id);
  assert.equal(stored.orgId, 'org-a');
  assert.equal(stored.email, 'person@example.com');
  assert.equal(stored.tokenHash, hashInviteToken(deliveryToken));
  assert.notEqual(stored.tokenHash, deliveryToken);
  assert.equal('deliveryToken' in stored, false);
});

test('issuer must belong to target org', async () => {
  const h = harness();
  await assert.rejects(h.service.issue({ actor: adminA, orgId: 'org-b', email: 'person@example.com' }), AuthorizationError);
});

test('issuer must have members.invite permission', async () => {
  const h = harness();
  await assert.rejects(h.service.issue({ actor: memberA, orgId: 'org-a', email: 'person@example.com' }), AuthorizationError);
});

test('reissuing for same org and email revokes previous pending invitation', async () => {
  const h = harness();
  const first = await issued(h);
  await issued(h);
  const storedFirst = await h.repository.findById(first.invitation.id);
  assert.equal(storedFirst.status, 'revoked');
});

test('intended verified user can accept exactly once', async () => {
  const h = harness();
  const { deliveryToken } = await issued(h);
  const result = await h.service.accept({ token: deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'PERSON@example.com' } });
  assert.equal(result.orgId, 'org-a');
  assert.equal(result.acceptedByUserId, 'user-1');
  await assert.rejects(h.service.accept({ token: deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } }), InvalidInviteError);
});

test('acceptance rejects verified-email mismatch', async () => {
  const h = harness();
  const { deliveryToken } = await issued(h);
  await assert.rejects(h.service.accept({ token: deliveryToken, authenticatedUser: { userId: 'user-2', verifiedEmail: 'attacker@example.com' } }), InvalidInviteError);
});

test('acceptance rejects expired invitation', async () => {
  const h = harness();
  const { deliveryToken } = await issued(h, { ttlMs: 60_000 });
  h.setNow('2026-09-22T12:01:00Z');
  await assert.rejects(h.service.accept({ token: deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } }), InvalidInviteError);
});

test('reissued invitation makes old token unusable while new token works', async () => {
  const h = harness();
  const first = await issued(h);
  const second = await issued(h);
  await assert.rejects(h.service.accept({ token: first.deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } }), InvalidInviteError);
  const result = await h.service.accept({ token: second.deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } });
  assert.equal(result.orgId, 'org-a');
});

test('unknown token fails with coarse application error', async () => {
  const h = harness();
  await assert.rejects(h.service.accept({ token: 'unknown-token-that-is-long-enough-0000', authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } }), InvalidInviteError);
});

test('authorized admin revokes a pending invitation in their own org', async () => {
  const h = harness();
  const { invitation } = await issued(h);
  const result = await h.service.revoke({ actor: adminA, invitationId: invitation.id });
  assert.deepEqual(Object.keys(result).sort(), ['invitationId', 'status']);
  assert.equal(result.status, 'revoked');
  const stored = await h.repository.findById(invitation.id);
  assert.equal(stored.status, 'revoked');
  assert.equal(stored.orgId, 'org-a');
});

test('revoked invitation token can no longer be accepted', async () => {
  const h = harness();
  const { invitation, deliveryToken } = await issued(h);
  await h.service.revoke({ actor: adminA, invitationId: invitation.id });
  await assert.rejects(
    h.service.accept({ token: deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } }),
    InvalidInviteError
  );
});

test('actor without members.invite cannot revoke', async () => {
  const h = harness();
  const { invitation } = await issued(h);
  await assert.rejects(h.service.revoke({ actor: memberA, invitationId: invitation.id }), AuthorizationError);
  await assert.rejects(h.service.revoke({ actor: null, invitationId: invitation.id }), AuthorizationError);
});

test('cross-org admin and unknown id fail indistinguishably and leave the invitation pending', async () => {
  const h = harness();
  const { invitation } = await issued(h);
  await assert.rejects(h.service.revoke({ actor: adminB, invitationId: invitation.id }), InvalidInviteError);
  await assert.rejects(h.service.revoke({ actor: adminA, invitationId: 'invite-does-not-exist' }), InvalidInviteError);
  await assert.rejects(h.service.revoke({ actor: adminA, invitationId: '' }), InvalidInviteError);
  const stored = await h.repository.findById(invitation.id);
  assert.equal(stored.status, 'pending');
});

test('accepted invitation cannot be revoked and stays accepted', async () => {
  const h = harness();
  const { invitation, deliveryToken } = await issued(h);
  await h.service.accept({ token: deliveryToken, authenticatedUser: { userId: 'user-1', verifiedEmail: 'person@example.com' } });
  await assert.rejects(h.service.revoke({ actor: adminA, invitationId: invitation.id }), InvalidInviteError);
  const stored = await h.repository.findById(invitation.id);
  assert.equal(stored.status, 'accepted');
});

test('revocation is not repeatable and revoked stays terminal', async () => {
  const h = harness();
  const { invitation } = await issued(h);
  await h.service.revoke({ actor: adminA, invitationId: invitation.id });
  await assert.rejects(h.service.revoke({ actor: adminA, invitationId: invitation.id }), InvalidInviteError);
  const stored = await h.repository.findById(invitation.id);
  assert.equal(stored.status, 'revoked');
});

test('expired-but-pending invitation can still be revoked', async () => {
  const h = harness();
  const { invitation } = await issued(h, { ttlMs: 60_000 });
  h.setNow('2026-09-22T12:01:00Z');
  const result = await h.service.revoke({ actor: adminA, invitationId: invitation.id });
  assert.equal(result.status, 'revoked');
});

test('domain revocation only accepts pending invitations', () => {
  const pending = { id: 'invite-1', orgId: 'org-a', status: 'pending' };
  assert.equal(revokeInvitation(pending).status, 'revoked');
  assert.throws(() => revokeInvitation({ ...pending, status: 'accepted' }), InvitationError);
  assert.throws(() => revokeInvitation({ ...pending, status: 'revoked' }), InvitationError);
});

test('repository compare-and-set refuses to revoke non-pending or unknown records', async () => {
  const repository = new MemoryInvitationRepository();
  assert.equal(await repository.revokeIfPending({ id: 'missing', status: 'revoked' }), false);
  const invitation = { id: 'invite-1', orgId: 'org-a', email: 'person@example.com', tokenHash: 'a'.repeat(64), issuedByUserId: 'admin-a', expiresAt: new Date('2026-09-24T12:00:00Z'), status: 'pending', acceptedByUserId: null, acceptedAt: null };
  await repository.replacePending(invitation);
  await repository.acceptIfPending({ ...invitation, status: 'accepted', acceptedByUserId: 'user-1', acceptedAt: new Date('2026-09-22T12:30:00Z') });
  assert.equal(await repository.revokeIfPending({ ...invitation, status: 'revoked' }), false);
  const stored = await repository.findById('invite-1');
  assert.equal(stored.status, 'accepted');
});

## Context manifest

- `prompts/04-code-review.md` — 2586 bytes

- `AGENTS.md` — 1257 bytes

- `docs/tasks/revoke-pending-invite.md` — 11627 bytes

- `docs/product/PRD.md` — 3882 bytes

- `docs/product/USER-FLOWS.md` — 2378 bytes

- `docs/architecture/DOMAIN.md` — 1068 bytes

- `docs/architecture/ARCHITECTURE.md` — 1554 bytes

- `docs/architecture/adr/ADR-001-invite-token-storage.md` — 1136 bytes

- `docs/security/THREAT-MODEL.md` — 1800 bytes

- `docs/testing/TEST-STRATEGY.md` — 1125 bytes

- `docs/delivery/DEFINITION-OF-READY.md` — 411 bytes

- `docs/delivery/DEFINITION-OF-DONE.md` — 459 bytes

- `docs/delivery/TASK-001-accept-invite.md` — 1027 bytes

- `src/application/invitation-service.mjs` — 3494 bytes

- `src/infrastructure/memory-invitation-repository.mjs` — 1339 bytes

- `src/domain/invitation.mjs` — 2247 bytes

- `test/invitation-service.test.mjs` — 8988 bytes
