# Task — List active invitations for an organization admin

Status: Review
Slug: `list-active-invitations`

## Outcome

An authorized organization administrator can request the organization's active invitations with tenant-safe application semantics. Persisted `pending` invitations remain in the active list even when expired; expired entries are projected as `expired` without mutating stored invitation state.

## Source of truth

This Task Pack belongs to the `examples/reference-saas-invite` project root. Repository-local references resolve from that root.

| Source | Reference |
|---|---|
| Product / PRD | `docs/product/PRD.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| Domain | `docs/architecture/DOMAIN.md` |
| Security | `docs/security/THREAT-MODEL.md` |
| Testing | `docs/testing/TEST-STRATEGY.md` |
| Human decision | `docs/tasks/decide-expired-invitation-listing.md` |

## Requirement restatement

Build the application-level admin listing on top of the completed status-neutral repository query. The previously unresolved expired-record visibility policy is APPROVED: include records whose stored status is `pending` even when `expiresAt <= now`, and project those entries as `expired`. Accepted and revoked records are terminal and are excluded from the active list.

This task was AFK and became eligible after its technical prerequisite completed and the genuine HUMAN DECISION was approved. The implementation now follows that durable evidence without adding graph state.

## Dependency evidence

- Completed prerequisite: `list-invitations-by-organization-repository` (PR #45).
- Approved decision: `decide-expired-invitation-listing` — Option A.
- Rejected negative decision: do not exclude expired pending records merely because they are expired.
- Downstream delivery/API work remains dependent on this application contract.

## Acceptance criteria

- [x] AC-001 — Only an actor with `members.invite` and organization context may list invitations for their own organization.
- [x] AC-002 — Organization scope is derived from the authenticated actor; callers cannot enumerate another tenant by supplying a foreign organization id.
- [x] AC-003 — Repository enumeration uses the completed `listByOrganization(orgId)` primitive.
- [x] AC-004 — Only records whose stored invitation status is `pending` appear in the active list; accepted/revoked records are excluded.
- [x] AC-005 — Pending records with `expiresAt > now` are projected with display state `pending`.
- [x] AC-006 — Pending records with `expiresAt <= now` remain in the list and are projected with display state `expired`.
- [x] AC-007 — Listing never mutates persisted invitation status while deriving display state.
- [x] AC-008 — Listing returns only `invitationId`, `email`, `expiresAt`, and derived `state` for each item.
- [x] AC-009 — Raw invitation tokens, token hashes, issuer identity, acceptance attribution, and other persistence-only fields are not returned or logged.
- [x] AC-010 — Returned values are detached application/view data rather than mutable repository state.
- [x] AC-011 — Focused tests cover authorization, tenant isolation, terminal-state exclusion, expiry projection, response-shape/secret-field omission, and empty results.

## Scope

### In scope
- application-service listing method;
- permission and tenant checks;
- approved pending/expired projection policy;
- bounded administration-safe response shape;
- focused tests for authorization, tenant isolation, filtering, expiry behavior, and response shape.

### Out of scope
- repository filtering changes;
- pagination/search/sorting;
- HTTP/UI transport;
- background expiry mutation/cleanup;
- graph/scheduler/schema persistence.

## Affected boundaries

- Modules/files likely affected: application invitation service, active-list service tests, architecture boundary documentation, and this Task Pack.
- Public API/contract impact: additive `InvitationService.listActive({ actor })` method returning administration-safe invitation projections.
- Data/schema/migration impact: n/a — read-only behavior; no persisted shape or migration changes.
- External integration impact: n/a — dependency-free reference fixture with no HTTP/UI adapter in this slice.

## Domain invariants

- Stored invitation status is not rewritten by a read operation.
- Cross-tenant data never appears in results.
- Accepted and revoked invitations are terminal and absent from the active list.
- Expired-but-stored-pending records remain visible and are represented as `expired` only in application/view output.
- Raw token material and token hashes remain outside listing output.

## Security and privacy

- Authentication impact: actor identity and organization context remain supplied by the upstream authenticated boundary.
- Authorization/resource ownership: `members.invite` is required and tenant scope is derived only from `actor.orgId`.
- Input/trust boundaries: listing accepts no caller-selected organization id; repository records are treated as stored state and projected into a bounded view model.
- Secrets/PII/logging: email is the only returned identity field; raw tokens, token hashes, issuer identity, acceptance attribution, and repository-only fields are omitted; no logging is added.
- Abuse/rate/replay considerations: read-only in-memory listing adds no replay mutation risk; production rate limiting/pagination remain out of scope.
- Relevant threat IDs: T-001, T-002, T-007, T-010.

## Failure modes and edge cases

- actor is missing or lacks `members.invite`;
- actor lacks an organization context;
- organization has no invitations;
- mixed pending/accepted/revoked records;
- expired record remains persisted as `pending`;
- records from another organization exist in repository;
- expiry occurs exactly at `now` (`expiresAt <= now` is `expired`).

## Observability

n/a — this bounded read-only reference slice adds no logs, metrics, traces, or audit events. Production delivery/observability behavior remains outside the reference application-service contract.

## Test plan

### Unit
- authorization denies missing actor, missing organization context, and missing `members.invite`;
- exact expiry boundary projects `expiresAt <= now` as `expired`;
- empty organization returns an empty list.

### Integration / contract
- service enumerates only `repository.listByOrganization(actor.orgId)`;
- accepted/revoked records are excluded while expired persisted-pending records remain visible;
- returned projections contain exactly `invitationId`, `email`, `expiresAt`, and `state`;
- mutating returned projections does not alter repository state.

### E2E / regression
- n/a — no delivery/API/UI surface exists in this reference slice.

### Negative/security paths
- permission denial and missing actor organization context;
- foreign-tenant records remain absent from results;
- raw tokens, token hashes, issuer identity, acceptance attribution, and persistence-only fields never leak through response.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive read-only method in the reference application service; existing issue/accept/revoke behavior remains unchanged.
- Migration/backfill: n/a — no schema or persisted historical data changes.
- Rollback or recovery: revert the bounded service/test/docs change.

## Implementation plan

1. Add `InvitationService.listActive({ actor })` using `actor.orgId` and `members.invite` authorization.
2. Read records through `repository.listByOrganization(actor.orgId)`.
3. Keep stored `pending` records only; exclude terminal accepted/revoked records.
4. Project `state: 'expired'` when `expiresAt <= now`, otherwise `state: 'pending'`.
5. Return exactly `invitationId`, `email`, `expiresAt`, and derived `state`; omit token material/hash and persistence-only attribution.
6. Add focused application-service tests and deterministic verification evidence.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Acceptance criteria match the approved Option A policy.
- [x] Tenant scope comes only from authenticated actor organization context.
- [x] Accepted/revoked records are excluded and expired persisted-pending records remain visible.
- [x] Read-time expiry projection does not mutate stored invitation status.
- [x] Response shape excludes raw token, token hash, org id, issuer identity, acceptance attribution, and persistence-only fields.
- [x] No pagination/search/sorting, transport, background cleanup, graph, scheduler, or schema scope was introduced.
- [x] Tests prove authorization, tenant isolation, projection semantics, response shape, and copy isolation.

## Independent review evidence

Record concise material findings here after a fresh review. Do not copy the full reviewer transcript.

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Fresh branch review confirmed tenant scope comes only from `actor.orgId`, terminal records are filtered, expiry is a read-time projection, and the service constructs an exact four-field response with no token/hash or persistence attribution. | No correction required before executable validation. | Production persistence/indexing and HTTP/UI delivery remain outside this reference slice. |

## Completion report

- What changed and why: implemented the now-unblocked active-invitation application contract using the approved Option A policy from Issue #44.
- Verification actually run: focused listing tests, reference tests/check, and full framework validation passed on prior head `b26dbcab31d7839a0cb1d3e3aae73e847ce2162a`; readiness/verify failed because this Task Pack had drifted from canonical readiness labels, so exact-head validation must be rerun after this documentation correction.
- Migration/operational impact: none; additive read-only reference behavior only.
- Remaining risks/limitations: delivery/API/UI representation and production persistence/indexing remain out of scope.
- Independent review evidence updated: yes; no blocking finding in the bounded implementation review.
