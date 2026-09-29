# Task — Manually revoke a pending organization invitation

Status: Implemented — fresh review complete, must-fix findings resolved
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

- [x] AC-001 — An admin in the invitation's organization with `members.invite` transitions the pending invitation to `revoked`.
- [x] AC-002 — After revocation, acceptance with the original delivery token fails with the coarse invalid-invitation error (links to AC-102).
- [x] AC-003 — An actor without `members.invite` is rejected (T-002).
- [x] AC-004 — An actor from another organization cannot revoke the invitation, with no existence leak (T-001, T-008 pattern).
- [x] AC-005 — Non-pending invitations (`accepted`, `revoked`) cannot be revoked; `revoked` stays terminal; a second revoke does not succeed (AD-02, T-007).
- [x] AC-006 — Identification input is the invitation id per AD-06; organization is never taken from client input as authoritative (AD-04).
- [x] AC-007 — No raw token appears as an input to revocation, in persisted state, or in any new error text (ADR-001, T-010).
- [x] AC-008 — Tests added for every path above; `npm test` and `npm run check` pass.

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

- [x] Acceptance criteria are satisfied.
- [x] No unrelated changes are included. (prompts/ copy is disclosed VCP tooling enablement, commit 380c9f2, not feature scope)
- [x] Architecture/module boundaries are respected.
- [x] Authorization and tenant/resource ownership are correct.
- [x] Validation/error handling covers negative paths.
- [x] Concurrency/idempotency/race risks were considered where relevant.
- [x] Tests prove behavior rather than implementation details.
- [x] Docs/contracts/ADRs were updated when required.

## Completion report

- **What changed and why:** `InvitationService.revoke({ actor, invitationId })` (AD-06) enforces `members.invite` + actor-org match (AD-01/AD-04) with coarse indistinguishable failures for unknown/cross-org/non-pending (AP-03, AC-201); repository gained `revokeIfPending` compare-and-set (AP-02); existing domain `revokeInvitation` reused (AP-01). Status-only revocation per AD-07 — no attribution columns. Docs: PRD FR-003 (AC-201..205 + decision note), USER-FLOWS Flow C, ARCHITECTURE/DATA-MODEL production CAS lines (fresh-review finding 2, folded in).
- **Verification actually run:** `npm test` → 18/18 pass, exit 0 (run directly and via `vcp verify --run`; evidence `.vcp/evidence/revoke-pending-invite.json`); `npm run check` → exit 0 (run manually — no `CHECK_COMMAND` key exists in VCP's fixed key list); plan gate 13 pass/0 fail exit 0; implement gate 15 pass/0 fail exit 0; fresh independent reviewer re-ran both commands with the same results.
- **Migration/operational impact:** none; additive in-memory behavior, no schema change (AD-07).
- **Remaining risks/limitations:** in-memory CAS demonstrates but cannot prove production atomicity (documented in ARCHITECTURE.md); manual revocation attribution is production-audit-event-only (AD-07, PRD decision note); no HTTP surface or rate limiting (AD-05, pre-existing example gaps).

## Follow-ups recorded (not in this task)

- FU-1: service-level interleaved accept-vs-revoke race test (fresh-review finding 3; repository-level CAS coverage exists).
- FU-2: `vcp task`/verify cannot represent `npm run check` because VCP's command-key list has no `CHECK_COMMAND`; candidate kit improvement.
- FU-3: the reference example lacked `prompts/`, so `vcp context` could not run against it; resolved by copying canonical prompts (commit 380c9f2) — decide whether examples should ship prompts or context needs a fallback.
