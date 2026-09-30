# Task — Manually revoke a pending organization invitation

Status: Review
Slug: `revoke-pending-invite`

## Outcome

An authorized organization administrator can manually revoke a pending invitation in their own organization, after which the invitation's original token can never be accepted.

## Source of truth

This Task Pack belongs to the `examples/reference-saas-invite` project root. Repository-local references resolve from that root.

| Source | Reference |
|---|---|
| Product / PRD | `docs/product/PRD.md` |
| User flow | `docs/product/USER-FLOWS.md` |
| Domain | `docs/architecture/DOMAIN.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| ADR | `docs/architecture/adr/ADR-001-invite-token-storage.md` |
| Security | `docs/security/THREAT-MODEL.md` |
| Testing | `docs/testing/TEST-STRATEGY.md` |

## Requirement restatement

Add the already-approved administrator-initiated revocation use case to the reference invitation application service. Authorization is `members.invite` in the invitation's organization. The admin identifies the target by invitation id; organization context is derived from the stored invitation. Only `pending` may transition to `revoked`, and application-facing invalid/unknown/cross-tenant outcomes remain coarse.

Approved decisions from the PR #18 dogfood are durable and must not be reopened in this promotion:

- revoke input is `invitationId`, not email or raw token;
- revocation is status-only in this reference slice: no `revokedByUserId` / `revokedAt` entity fields;
- production attribution belongs to the `invitation.revoked` audit event;
- an expired-but-still-pending invitation may be manually revoked;
- compare-and-set repository semantics are used so terminal transitions do not overwrite one another.

## Acceptance criteria

- [x] AC-001 — An admin with `members.invite` can revoke a pending invitation in their own organization.
- [x] AC-002 — A revoked invitation's original token can no longer be accepted.
- [x] AC-003 — An actor without `members.invite` is rejected.
- [x] AC-004 — Cross-organization and unknown invitation ids fail with the same coarse application error and do not mutate the invitation.
- [x] AC-005 — Accepted and revoked invitations cannot be revoked; a second revoke does not succeed.
- [x] AC-006 — Revocation takes an invitation id only; organization is derived from stored state and raw token material is not a revocation input.
- [x] AC-007 — Repository revocation uses pending-only compare-and-set semantics.
- [x] AC-008 — Product flow and architecture documents reflect the approved contract.

## Scope

### In scope
- application-service revoke operation;
- same-org permission enforcement and coarse failures;
- in-memory pending-only revoke compare-and-set;
- existing domain revoke transition reuse;
- reference tests and Source-of-Truth updates.

### Out of scope
- HTTP/API transport;
- authentication implementation;
- persistent database implementation;
- persisted revocation attribution;
- email delivery, rate limiting, and audit-event emission;
- service-level accept-vs-revoke race regression tracked separately by kit issue #27.

## Affected boundaries

- Modules/files likely affected: application invitation service, memory repository, invitation service tests, PRD/user flow/architecture docs.
- Public API/contract impact: additive `InvitationService.revoke({ actor, invitationId })` method in the reference example.
- Data/schema/migration impact: n/a — status `revoked` already exists; no persisted attribution fields are added.
- External integration impact: n/a — dependency-free reference project only.

## Domain invariants

- only `pending` may transition to `revoked`;
- `accepted` and `revoked` are terminal;
- organization ownership is never rewritten or trusted from client input;
- raw invitation tokens never enter revocation state or error text;
- a revoked invitation cannot later be accepted.

## Security and privacy

- Authentication impact: actor identity remains supplied by the upstream boundary.
- Authorization/resource ownership: `members.invite` plus same-organization ownership is required.
- Tenant isolation: unknown and cross-org identifiers remain indistinguishable at the application boundary.
- Input/trust boundaries: invitation id is untrusted input; organization is derived from stored state.
- Secrets/PII/logging: revocation does not accept/log raw tokens; no new PII is added.
- Abuse/rate/replay considerations: repeated revoke cannot re-succeed; production rate limiting remains out of scope.
- Relevant threat IDs: T-001, T-002, T-007, T-010.

## Failure modes and edge cases

- missing permission;
- missing/unknown invitation id;
- cross-organization id probe;
- accepted invitation;
- already-revoked invitation;
- expired but still pending invitation;
- concurrent terminal transition (repository CAS semantics; service-level interleaving coverage is #27).

## Observability

The reference implementation emits no events. Production architecture reserves `invitation.revoked` as the audit/domain event and must not include raw token data.

## Test plan

### Unit
- domain revoke succeeds only from pending.

### Integration / contract
- application service enforces permission, ownership, coarse failure, and terminal-state behavior.

### E2E / regression
- revoked token cannot be accepted through the application service.

### Negative/security paths
- permission denial, cross-org probe, unknown id, accepted/revoked states, double revoke, and repository CAS refusal.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive reference-example behavior; existing issue/accept methods are unchanged.
- Migration/backfill: n/a — no schema or persisted historical data.
- Rollback or recovery: revert the bounded reference-example change.

## Implementation plan

1. Reuse the existing domain `revokeInvitation` transition.
2. Add service authorization/ownership/coarse-error handling and pending-only repository CAS.
3. Add the approved product flow/docs and focused regression tests.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [ ] Acceptance criteria are satisfied.
- [ ] No unrelated dogfood/protocol history was imported.
- [ ] Architecture/module boundaries are respected.
- [ ] Authorization and tenant/resource ownership are correct.
- [ ] Coarse failure behavior covers negative paths.
- [ ] Compare-and-set semantics do not overwrite terminal state.
- [ ] Tests prove behavior rather than implementation details.
- [ ] Source of Truth matches the approved human decisions.

## Independent review evidence

Record concise material findings here after a fresh review. Do not copy the full reviewer transcript.

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| | | | | |

## Completion report

- What changed and why: promoted the already-approved manual-revoke dogfood behavior onto a fresh current-main branch without importing unrelated dogfood history.
- Verification actually run: pending exact-head local validation.
- Migration/operational impact: none; additive in-memory reference behavior only.
- Remaining risks/limitations: production persistence atomicity remains architecture responsibility; service-level accept-vs-revoke race coverage remains #27.
- Independent review evidence updated: pending fresh review.
