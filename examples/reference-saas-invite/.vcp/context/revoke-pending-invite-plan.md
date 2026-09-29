# VCP Context Pack — plan

Task: `docs/tasks/revoke-pending-invite.md`

Use this as bounded working context. Treat repository files and accepted decisions as authoritative over guesses. If implementation details outside this pack must be inspected, read only the smallest affected area before acting. Do not invent missing requirements.

## Execution prompt

Source: `prompts/02-plan-task.md`

# Prompt: Plan a Task Before Coding

```text
Read:
- AGENTS.md
- the task/issue
- relevant PRD acceptance criteria
- relevant architecture/domain/data/security documents
- applicable ADRs
- existing implementation and tests in the affected area

Do not modify code yet.

Before asking the developer a question, classify it:
- DISCOVERABLE: answer it from repository evidence;
- PROPOSABLE: state a small reversible/default engineering approach explicitly as a proposal/assumption; a material proposal is not APPROVED merely because the agent suggested it;
- HUMAN DECISION: ask only when the answer changes intended product behavior, security/privacy posture, compatibility policy, data ownership, architecture direction, destructive migration policy, risk acceptance, rollout, or another non-inferable decision.

Group genuinely blocking human questions instead of interrupting for every minor uncertainty. State the affected decision, what it blocks, and why repository evidence is insufficient.

Produce a bounded implementation plan containing:
1. requirement restatement;
2. discovered facts, proposed decisions/assumptions, approved decisions, and unresolved HUMAN DECISION items that affect the design;
3. affected modules/files and why;
4. proposed implementation slices, ordered as the smallest end-to-end user/domain-visible increments rather than broad technical layers;
5. for each slice, its acceptance evidence, tests, and dependencies;
6. API/data/migration impact;
7. security/privacy/authorization impact;
8. concurrency/idempotency/failure-mode concerns where relevant;
9. edge cases;
10. tests to add/update by layer;
11. verification commands to run;
12. architecture or requirement conflicts;
13. explicit out-of-scope / negative decisions;
14. execution dependencies classified as autonomous/AFK-safe or HITL required.

For each proposed slice, distinguish execution mode from readiness: AFK-safe does not mean the slice is currently executable. A slice remains blocked while dependencies, unresolved human intent, readiness failures, safety/conflict gates, or required verification prevent execution.

Prefer the smallest coherent change. Do not propose unrelated refactors. If an autonomous slice can proceed safely while another decision is blocked on human input, keep those dependencies explicit rather than treating the whole task as blocked.
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

Status: Draft
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

### Open HUMAN DECISIONS

- HD-1 (blocks Slice 1): How does the admin identify the invitation to revoke — by invitation id, by organization + invitee email, or both? The PRD actor table permits the action but no FR, user flow, or contract names the input. The choice sets the public application-service contract and cannot be inferred safely.
- HD-2 (blocks Slice 2 only): Does manual revocation persist attribution fields (`revokedByUserId`, `revokedAt`) on the invitation entity and DATA-MODEL, or stay status-only with attribution delegated to the production `invitation.revoked` audit event? DATA-MODEL.md currently has accepted-attribution columns but none for revocation; this is a data-model direction decision.

## Acceptance criteria

- [ ] AC-001 — An admin in the invitation's organization with `members.invite` transitions the pending invitation to `revoked`.
- [ ] AC-002 — After revocation, acceptance with the original delivery token fails with the coarse invalid-invitation error (links to AC-102).
- [ ] AC-003 — An actor without `members.invite` is rejected (T-002).
- [ ] AC-004 — An actor from another organization cannot revoke the invitation, with no existence leak (T-001, T-008 pattern).
- [ ] AC-005 — Non-pending invitations (`accepted`, `revoked`) cannot be revoked; `revoked` stays terminal; a second revoke does not succeed (AD-02, T-007).
- [ ] AC-006 — Identification input follows the approved HD-1 answer; organization is never taken from client input as authoritative (AD-04).
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

1. Slice 1 — HITL-blocked decision HD-1, then AFK-safe: implement application-service `revoke` (authorization per AD-01/AD-04, coarse failures per AP-03, identification per approved HD-1), repository `revokeIfPending` CAS per AP-02, domain reuse per AP-01, full test matrix above. Acceptance evidence: new tests + existing suite green via `npm test`; syntax gate via `npm run check`.
2. Slice 2 — blocked by HD-2; only executes if HD-2 approves persisted attribution: add `revokedByUserId`/`revokedAt` to entity factory/transition, DATA-MODEL columns, and attribution tests. If HD-2 chooses status-only, record "production audit attribution" as an explicit documented follow-up note in this task and change nothing.
3. Both slices: update PRD with a manual-revoke FR and USER-FLOWS with the admin revoke flow once the contract is approved (AFK after HD-1; the SoT currently permits but does not describe this operation).

## Verification commands

Run the relevant configured commands below before completion:

- `npm test`
- `npm run check`

(`vcp task` discovered only `INSTALL_COMMAND`/`UNIT_TEST_COMMAND` from `AGENTS.md`; `npm run check` is required by the example's Completion rules and Definition of Done and is added here explicitly.)

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

## Context manifest

- `prompts/02-plan-task.md` — 2375 bytes

- `AGENTS.md` — 1257 bytes

- `docs/tasks/revoke-pending-invite.md` — 11458 bytes

- `docs/product/PRD.md` — 2630 bytes

- `docs/product/USER-FLOWS.md` — 1473 bytes

- `docs/architecture/DOMAIN.md` — 1068 bytes

- `docs/architecture/ARCHITECTURE.md` — 1554 bytes

- `docs/architecture/adr/ADR-001-invite-token-storage.md` — 1136 bytes

- `docs/security/THREAT-MODEL.md` — 1800 bytes

- `docs/testing/TEST-STRATEGY.md` — 1125 bytes

- `docs/delivery/DEFINITION-OF-READY.md` — 411 bytes

- `docs/delivery/DEFINITION-OF-DONE.md` — 459 bytes

- `docs/delivery/TASK-001-accept-invite.md` — 1027 bytes
