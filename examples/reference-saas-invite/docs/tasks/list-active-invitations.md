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

- [x] Only an actor with `members.invite` may list invitations for their own organization.
- [x] Organization scope is derived from the authenticated actor; callers cannot enumerate another tenant by supplying a foreign organization id.
- [x] Repository enumeration uses the completed `listByOrganization(orgId)` primitive.
- [x] Only records whose stored invitation status is `pending` appear in the active list; accepted/revoked records are excluded.
- [x] Pending records with `expiresAt > now` are projected with display state `pending`.
- [x] Pending records with `expiresAt <= now` remain in the list and are projected with display state `expired`.
- [x] Listing never mutates persisted invitation status while deriving display state.
- [x] Listing returns only `invitationId`, `email`, `expiresAt`, and derived `state` for each item.
- [x] Raw invitation tokens, token hashes, issuer identity, acceptance attribution, and other persistence-only fields are not returned or logged.
- [x] Returned values are detached application/view data rather than mutable repository state.
- [x] Focused tests cover authorization, tenant isolation, terminal-state exclusion, expiry projection, and response-shape/secret-field omission.

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

- Application invitation service.
- Existing memory repository organization query.
- Product PRD.
- Architecture boundary documentation.
- Application-service tests.

## Domain invariants

- Stored invitation status is not rewritten by a read operation.
- Cross-tenant data never appears in results.
- Accepted and revoked invitations are terminal and absent from the active list.
- Expired-but-stored-pending records remain visible and are represented as `expired` only in application/view output.
- Raw token material and token hashes remain outside listing output.

## Security and privacy

- Authorization: `members.invite` is required.
- Tenant isolation: organization scope comes from the authenticated actor; listing accepts no caller-selected foreign organization id.
- PII: email is already invitation state and is the only identity field returned to an authorized organization administrator for invitation administration.
- Secrets: raw tokens and token hashes are not part of the application listing contract.
- Data minimization: issuer identity, acceptance attribution, and repository-only fields are omitted.
- Read-only behavior: no invitation state mutation occurs.

## Failure modes and edge cases

- actor is missing or lacks `members.invite`;
- actor lacks an organization context;
- organization has no invitations;
- mixed pending/accepted/revoked records;
- expired record remains persisted as `pending`;
- records from another organization exist in repository;
- expiry occurs exactly at `now` (`expiresAt <= now` is `expired`).

## Test plan

### Unit / application contract
- permission denial and missing actor organization;
- empty result;
- tenant isolation;
- accepted/revoked exclusion;
- unexpired pending → `pending` display state;
- expired pending → `expired` display state and remains visible;
- persisted expired record remains stored as `pending` after listing;
- exact output shape contains only `invitationId`, `email`, `expiresAt`, `state`;
- returned projection mutation does not alter repository state.

### Integration / contract
- service uses repository `listByOrganization(actor.orgId)` and returns detached projection data.

### E2E / regression
- n/a — no delivery surface in this reference slice.

### Negative/security paths
- missing permission;
- missing actor organization context;
- foreign-tenant records present in repository but absent from results;
- token hash and persistence-only attribution never leak through response.

## Rollout, migration, and recovery

- No schema migration expected for the reference fixture.
- Additive read-only application behavior.
- Rollback by reverting the bounded application/tests/docs change.

## Implementation plan

1. Add `InvitationService.listActive({ actor })` using `actor.orgId` and `members.invite` authorization.
2. Read records through `repository.listByOrganization(actor.orgId)`.
3. Keep stored `pending` records only; exclude terminal accepted/revoked records.
4. Project `state: 'expired'` when `expiresAt <= now`, otherwise `state: 'pending'`.
5. Return exactly `invitationId`, `email`, `expiresAt`, and derived `state`; omit token material/hash and persistence-only attribution.
6. Add focused application-service tests and deterministic verification evidence.

## Verification commands

Run:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim implementation readiness or verification success unless the commands were actually executed.

## Independent review evidence

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Fresh branch review confirmed tenant scope comes only from `actor.orgId`, terminal records are filtered, expiry is a read-time projection, and the service constructs an exact four-field response with no token/hash or persistence attribution. | No correction required before executable validation. | Production persistence/indexing and HTTP/UI delivery remain outside this reference slice. |

## Completion report

- What changed and why: implemented the now-unblocked active-invitation application contract using the approved Option A policy from Issue #44.
- Verification actually run: pending exact-head maintainer-local validation.
- Migration/operational impact: none; additive read-only reference behavior only.
- Remaining risks/limitations: delivery/API/UI representation and production persistence/indexing remain out of scope.
- Independent review evidence updated: yes; no blocking finding in the bounded implementation review.
