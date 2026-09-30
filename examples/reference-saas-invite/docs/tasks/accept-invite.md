# Task — Accept organization invitation

Status: Done
Slug: `accept-invite`

## Outcome

Allow an authenticated user whose verified email matches a pending organization invitation to accept that invitation exactly once, deriving organization membership context only from the stored invitation.

## Source of truth

This Task Pack belongs to the `examples/reference-saas-invite` project root. All repository-local references below resolve from that root.

| Source | Reference |
|---|---|
| Product / PRD | `docs/product/PRD.md` |
| Domain | `docs/architecture/DOMAIN.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| ADR | `docs/architecture/adr/ADR-001-invite-token-storage.md` |
| Security | `docs/security/THREAT-MODEL.md` |
| Testing | `docs/testing/TEST-STRATEGY.md` |

## Requirement restatement

Implement the application/domain behavior governed by PRD FR-002 and its invitation-acceptance criteria: resolve a pending invitation by token, enforce expiry/revocation/replay and verified-email rules, and derive the organization from persisted invitation state rather than client input.

## Acceptance criteria

- [x] AC-001 — Unknown invitation tokens are rejected.
- [x] AC-002 — Expired invitations are rejected.
- [x] AC-003 — Revoked invitations are rejected.
- [x] AC-004 — A verified-email mismatch is rejected.
- [x] AC-005 — A valid invitation can be accepted exactly once and replay is rejected.
- [x] AC-006 — The accepted organization ID comes from the stored invitation, never client input.

## Scope

### In scope
- token-hash lookup;
- invitation state and expiry checks;
- verified-email binding;
- exactly-once in-memory transition semantics for the reference repository;
- negative-path tests for invitation acceptance.

### Out of scope
- HTTP endpoint;
- authentication implementation;
- persistent database;
- membership write;
- email provider.

## Affected boundaries

- Modules/files likely affected: invitation domain model, application service, in-memory repository, and tests.
- Public API/contract impact: application-level invitation acceptance behavior only; no HTTP/API transport contract is added.
- Data/schema/migration impact: n/a — the reference slice uses in-memory persistence and adds no schema migration.
- External integration impact: n/a — no external provider or network integration is part of this slice.

## Domain invariants

- Invitation acceptance uses the organization ID stored on the invitation.
- A raw invitation token is not persisted in entity state.
- An invitation cannot be accepted after expiry, revocation, or prior acceptance.
- Acceptance requires the authenticated user's verified email to match the invitation email.

## Security and privacy

- Authentication impact: acceptance assumes an authenticated caller identity supplied to the application boundary; authentication implementation itself is out of scope.
- Authorization/resource ownership: organization context is derived from the stored invitation; no client-supplied organization ID is trusted.
- Tenant isolation: accepting an invitation cannot cross into another organization because membership context comes from the invitation record.
- Input/trust boundaries: raw invitation token and authenticated verified email are untrusted inputs validated against repository/domain state.
- Secrets/PII/logging: never log raw invitation tokens; email is used only for the approved matching rule.
- Abuse/rate/replay considerations: replay must fail after the first successful acceptance; production rate limiting remains out of scope for this reference.
- Relevant threat IDs: T-004 through T-008 in `docs/security/THREAT-MODEL.md`.

## Failure modes and edge cases

- Unknown token.
- Expired invitation.
- Revoked invitation.
- Already accepted invitation / replay.
- Verified-email mismatch.
- Attempt to supply or substitute an organization outside the stored invitation.

## Observability

n/a — this dependency-free reference slice does not implement production telemetry; failures remain intentionally coarse and raw invitation tokens must not be logged.

## Test plan

### Unit
- Prove domain invitation state transitions and rejection of invalid states.

### Integration / contract
- Prove the application service resolves the invitation repository and returns the stored organization ID.

### E2E / regression
- Use the reference test suite to exercise the complete in-memory invitation acceptance slice.

### Negative/security paths
- Cover unknown, expired, revoked, replayed, and email-mismatch attempts plus organization-context tampering.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: n/a — reference-only in-memory behavior with no deployed API contract.
- Migration/backfill: n/a — no persistent schema or historical data.
- Rollback or recovery: revert the bounded reference implementation and Task Pack together if the example contract changes.

## Implementation plan

1. Resolve and validate the invitation using token-hash lookup and domain invariants.
2. Enforce authenticated verified-email matching and exactly-once state transition semantics.
3. Return organization context from stored invitation state and cover all negative paths with tests.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Acceptance criteria are satisfied.
- [x] No unrelated changes are included.
- [x] Architecture/module boundaries are respected.
- [x] Authorization and tenant/resource ownership are correct.
- [x] Validation/error handling covers negative paths.
- [x] Concurrency/idempotency/race risks were considered where relevant.
- [x] Tests prove behavior rather than implementation details.
- [x] Docs/contracts/ADRs were updated when required.

## Completion report

- What changed and why: implemented the bounded reference invitation-acceptance behavior governed by the PRD, domain model, ADR, and threat model.
- Verification actually run: this Task Pack requires `npm run check` and `npm test`; current conformance validation must execute them before using this file as release evidence.
- Migration/operational impact: none; reference-only in-memory implementation.
- Remaining risks/limitations: production persistence, authentication, transport, rate limiting, delivery, and observability remain intentionally out of scope as documented by the reference project.
