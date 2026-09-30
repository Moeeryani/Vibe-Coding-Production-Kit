# Task — Add organization-scoped invitation repository query

Status: Done
Slug: `list-invitations-by-organization-repository`

## Outcome

The reference invitation repository can return detached invitation records for one organization without making any user-facing decision about which records count as active invitations.

## Source of truth

This Task Pack belongs to the `examples/reference-saas-invite` project root. Repository-local references resolve from that root.

| Source | Reference |
|---|---|
| Product / PRD | `docs/product/PRD.md` |
| Architecture | `docs/architecture/ARCHITECTURE.md` |
| Domain | `docs/architecture/DOMAIN.md` |
| Security | `docs/security/THREAT-MODEL.md` |
| Testing | `docs/testing/TEST-STRATEGY.md` |

## Requirement restatement

Issue #44 is dogfooding dependency-aware AFK/HITL execution before VCP persists graph state. This branch is deliberately independent of the unresolved admin-listing product policy. Add only a repository primitive that enumerates records already owned by one organization. The repository must not decide whether expired-but-still-`pending` records belong in an admin-facing active list; that remains a separate HUMAN DECISION and downstream application concern.

This task is AFK because its correct next action is determined by existing repository boundaries and does not require new product intent.

## Acceptance criteria

- [x] AC-001 — Repository exposes an organization-scoped query primitive.
- [x] AC-002 — The query returns only invitations whose stored `orgId` equals the requested organization.
- [x] AC-003 — The query is status-neutral and does not filter accepted, revoked, expired, or pending records into a user-facing category.
- [x] AC-004 — Returned records are detached copies; callers cannot mutate repository state by editing query results.
- [x] AC-005 — No application-service listing method, API shape, UI semantics, or active/expired filtering policy is introduced in this branch.
- [x] AC-006 — Focused regression tests cover tenant scoping, copy isolation, and status-neutral behavior.

## Scope

### In scope
- in-memory repository organization query;
- focused repository tests;
- durable dogfood evidence that this AFK branch can proceed while the admin-listing HUMAN DECISION is unresolved.

### Out of scope
- application-level `listActiveInvitations` semantics;
- whether expired-but-still-pending invitations are shown or excluded;
- delivery/API/UI work;
- pagination, sorting, search, database indexing, or persistent storage;
- persisted `mode` / `blockedBy` fields or a dependency graph engine.

## Affected boundaries

- Modules/files likely affected: memory invitation repository and repository-focused tests.
- Public API/contract impact: additive repository method `listByOrganization(orgId)` inside the reference fixture.
- Data/schema/migration impact: n/a — in-memory query only; no stored shape changes.
- External integration impact: n/a — dependency-free reference fixture.

## Domain invariants

- invitation organization ownership is read from stored records;
- query behavior never rewrites invitation state;
- terminal state semantics remain unchanged;
- repository enumeration does not reinterpret `pending` as active or non-expired.

## Security and privacy

- Authentication impact: n/a — repository primitive is below the authenticated application boundary.
- Authorization/resource ownership: application authorization remains responsible for deciding whether an actor may request an organization's records.
- Tenant isolation: repository results are restricted to exact stored `orgId` equality.
- Input/trust boundaries: `orgId` is a repository selector only; records are not reassigned or inferred.
- Secrets/PII/logging: no logging is added; raw token values remain absent from repository state.
- Abuse/rate/replay considerations: n/a for the in-memory primitive.
- Relevant threat IDs: T-001 — cross-tenant invite/data exposure is the relevant threat for this tenant-scoped repository query; authorization/token-use threats remain enforced at their owning application/domain boundaries.

## Failure modes and edge cases

- organization has no invitations → empty list;
- organization has mixed invitation statuses → all matching records returned without policy filtering;
- caller mutates a returned record → stored repository state remains unchanged;
- expired record still has domain status `pending` → repository returns it as stored and leaves classification to the application policy layer.

## Observability

No new logging or event behavior. This query is read-only and remains below the production adapter layer.

## Test plan

### Unit
- organization scoping across multiple tenants;
- detached-copy behavior;
- status-neutral handling of expired pending records.

### Integration / contract
- n/a — no application-service listing contract is introduced.

### E2E / regression
- n/a — no delivery surface exists in this branch.

### Negative/security paths
- prove records from another organization are absent from results.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive in-memory repository method only.
- Migration/backfill: n/a.
- Rollback or recovery: revert the bounded repository/test change.

## Implementation plan

1. Add `listByOrganization(orgId)` to the memory repository.
2. Return structured clones for exact organization matches.
3. Add focused tests proving tenant scoping, copy isolation, and policy neutrality.
4. Leave the admin-listing HUMAN DECISION unresolved and do not add application semantics here.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Scope stays below the application/user-facing policy layer.
- [x] Cross-tenant records cannot appear in query results.
- [x] Returned values cannot mutate stored state.
- [x] No hidden active/expired semantics are introduced.
- [x] No graph/scheduler/schema persistence is added.
- [x] Tests prove the repository contract rather than a proposed UI policy.

## Independent review evidence

Record concise material findings here after a fresh review. Do not copy the full reviewer transcript.

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Fresh PR #45 review confirmed the repository query is tenant-scoped, returns detached copies, and remains status-neutral without choosing the unresolved admin-list policy. | No correction required before merge. | Application authorization and user-facing active/expired semantics were intentionally separate downstream work. |

## Finalization

- [x] Acceptance criteria satisfied.
- [x] Required verification passed on the final reviewed PR #45 head.
- [x] Independent review evidence is current and no `must fix in this task` finding remains unresolved.
- [x] Completion report reflects the final accepted gate rather than stale pending text.
- [x] Top-level `Status` is `Done`.

## Completion report

- What changed and why: added the independent AFK repository prerequisite for Issue #44's multi-branch dogfood without resolving the separate HUMAN DECISION.
- Final accepted verification: maintainer-local exact-head gate for PR #45 passed the requested focused repository test, reference fixture test/check, implementation readiness, VCP verification commands, full framework validation, and clean-tree/unchanged-head checks. Detailed historical counts are intentionally not reconstructed here.
- Superseded failed evidence (if material): n/a.
- Independent review evidence updated: yes; no blocking finding remained at merge.
- Migration/operational impact: none; additive in-memory reference behavior only.
- Remaining risks/limitations: the repository primitive remains status-neutral by design; application authorization and active-list policy were completed separately downstream.
