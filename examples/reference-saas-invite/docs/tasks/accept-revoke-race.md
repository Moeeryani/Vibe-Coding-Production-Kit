# Task — Prove accept-vs-revoke mutual exclusion

Status: Review
Slug: `accept-revoke-race`

## Outcome

Prove at the application-service boundary that concurrent acceptance and manual revocation of the same pending invitation cannot both succeed.

## Source of truth

This Task Pack belongs to the `examples/reference-saas-invite` project root. Repository-local references resolve from that root.

| Source | Reference |
|---|---|
| Product / PRD | `docs/product/PRD.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| Domain | `docs/architecture/DOMAIN.md` |
| Testing | `docs/testing/TEST-STRATEGY.md` |
| Security | `docs/security/THREAT-MODEL.md` |

## Requirement restatement

Add deterministic service-level regression coverage for the concurrency invariant already required by the invitation contract: `pending -> accepted` and `pending -> revoked` are mutually exclusive. Force `InvitationService.accept(...)` and `InvitationService.revoke(...)` to observe the same pending snapshot before either compare-and-set mutation proceeds, then prove exactly one terminal transition succeeds and the loser preserves the existing coarse application error.

No production concurrency framework, scheduler, retry mechanism, or persistence implementation is added.

## Acceptance criteria

- [ ] AC-001 — The test starts from one pending invitation and invokes service-level accept and revoke operations against that same invitation.
- [ ] AC-002 — The interleaving is deterministic and does not depend on sleeps, timers, or probabilistic scheduling.
- [ ] AC-003 — Both service operations read the same pending invitation state before either terminal compare-and-set mutation occurs.
- [ ] AC-004 — Exactly one operation succeeds and exactly one operation fails.
- [ ] AC-005 — The losing operation fails with the existing coarse `InvalidInviteError` contract.
- [ ] AC-006 — Final stored state is exactly one terminal state: `accepted` or `revoked`.
- [ ] AC-007 — No production application/domain/repository behavior is changed solely to make the test pass.
- [ ] AC-008 — `npm test` and `npm run check` pass for the reference project.

## Scope

### In scope
- one focused service-level race regression;
- test-only interleaving/barrier support local to the test;
- deterministic assertions for winner, loser, coarse error, and final terminal state.

### Out of scope
- production scheduler/concurrency primitives;
- database transaction implementation;
- changes to acceptance or revocation semantics;
- new error types or more detailed error messages;
- HTTP/API/authentication changes;
- persisted workflow/AFK/HITL state.

## Affected boundaries

- Modules/files likely affected: reference invitation tests and this Task Pack only.
- Public API/contract impact: none.
- Data/schema/migration impact: none.
- External integration impact: none.

## Domain invariants

- only a pending invitation may transition to a terminal state;
- accepted and revoked are mutually exclusive terminal states;
- a losing terminal transition must not overwrite the winning state;
- tenant, token, and coarse-error behavior remain unchanged.

## Security and privacy

- Authentication impact: none.
- Authorization/resource ownership: existing revoke authorization remains unchanged.
- Tenant isolation: no cross-tenant behavior is introduced.
- Input/trust boundaries: existing service inputs only.
- Secrets/PII/logging: no new logging and no raw token persistence.
- Abuse/rate/replay considerations: the test strengthens exactly-once terminal-transition evidence without changing runtime policy.
- Relevant threat IDs: existing invitation replay/state-transition threats in `docs/security/THREAT-MODEL.md`.

## Failure modes and edge cases

- both operations accidentally succeed;
- both operations fail despite one valid pending transition being available;
- loser exposes a new/different error contract;
- terminal winner is overwritten by the loser;
- test passes only because scheduling happens to favor one call.

## Observability

n/a — test-only reliability coverage; no runtime observability contract changes.

## Test plan

### Unit
- n/a — no new domain unit behavior.

### Integration / contract
- exercise `InvitationService.accept(...)` and `InvitationService.revoke(...)` concurrently through the real in-memory repository CAS methods.

### E2E / regression
- force both service reads through a two-party barrier, release them together, and assert one success / one coarse failure / one terminal stored state.

### Negative/security paths
- assert the loser is `InvalidInviteError` and does not mutate the winner's terminal state.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: none; test-only change.
- Migration/backfill: n/a.
- Rollback or recovery: remove the regression test if the underlying product contract is deliberately superseded by an accepted Source-of-Truth change.

## Implementation plan

1. Wrap the real in-memory repository in a test-only read barrier for `findByTokenHash` and `findById`.
2. Start service accept and revoke concurrently after issuing one pending invitation.
3. Assert exactly one fulfillment, one coarse `InvalidInviteError`, and one persisted terminal state without changing production code.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [ ] Acceptance criteria are satisfied.
- [ ] No production code was changed to manufacture the race outcome.
- [ ] The interleaving is deterministic without timing sleeps.
- [ ] Both service reads observe pending state before CAS mutation.
- [ ] Exactly one terminal transition wins.
- [ ] Losing error remains coarse.
- [ ] Final state cannot contain both outcomes.
- [ ] Test remains bounded to the reference slice.

## Independent review evidence

Record concise material findings here after a fresh review. Do not copy the full reviewer transcript.

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| | | | | |

## Completion report

- What changed and why: added deterministic service-level accept-vs-revoke race coverage for issue #27.
- Verification actually run: pending exact-head local validation.
- Migration/operational impact: none; test-only reference change.
- Remaining risks/limitations: in-memory CAS demonstrates service orchestration semantics but does not prove production database atomicity; that remains an explicit architecture responsibility.
- Independent review evidence updated: pending fresh review.
