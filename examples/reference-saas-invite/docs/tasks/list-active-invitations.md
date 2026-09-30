# Task — List active invitations for an organization admin

Status: Blocked — waiting for `decide-expired-invitation-listing`
Slug: `list-active-invitations`

## Outcome

An authorized organization administrator can request the organization's active invitations with tenant-safe application semantics after the expired-record visibility policy is approved.

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

Build the application-level admin listing on top of the completed status-neutral repository query. Authorization and tenant ownership can be derived from existing repository contracts, but the correct inclusion/filtering behavior for expired-but-still-`pending` invitations cannot be determined until `decide-expired-invitation-listing` is APPROVED.

This task is AFK in execution mode but **not currently eligible**. Its implementation is blocked by a genuine HUMAN DECISION, not by technical difficulty.

## Dependency evidence

- Completed prerequisite: `list-invitations-by-organization-repository` (PR #45).
- Blocking decision: `decide-expired-invitation-listing`.
- Downstream delivery/API work must wait for this application contract.

## Acceptance criteria

The following are stable now:

- [ ] Only an actor with `members.invite` may list invitations for their own organization.
- [ ] Organization scope comes from the authenticated actor/application request boundary and cannot expose another tenant's records.
- [ ] Repository enumeration uses the completed `listByOrganization(orgId)` primitive.
- [ ] Raw invitation tokens are never returned or logged.
- [ ] Returned records are detached application/view data rather than mutable repository state.

The following criterion is intentionally unresolved until human approval:

- [ ] Expired-but-still-`pending` records are handled according to the APPROVED option in `decide-expired-invitation-listing`.

## Scope

### In scope after unblock
- application-service listing method;
- permission and tenant checks;
- approved active/expired policy;
- focused tests for authorization, tenant isolation, and expiry behavior.

### Out of scope
- resolving the HUMAN DECISION inside implementation;
- pagination/search/sorting product choices not required by the approved policy;
- HTTP/UI transport;
- background expiry mutation/cleanup;
- graph/scheduler/schema persistence.

## Affected boundaries

- Application invitation service.
- Existing memory repository organization query.
- Product PRD after decision approval.
- Application-service tests.

## Domain invariants

- Stored invitation status is not rewritten by a read operation.
- Cross-tenant data never appears in results.
- Expiry policy must not be inferred from persisted `pending` alone.
- Raw token material remains outside listing output.

## Security and privacy

- Authorization: `members.invite` plus same-organization ownership.
- Tenant isolation: no caller-selected foreign organization can be used to enumerate another tenant's invitations.
- PII: email is already invitation state; return only fields required by the approved admin listing contract.
- Secrets: token hashes/raw tokens are not part of the application listing contract.

## Failure modes and edge cases

- actor lacks `members.invite`;
- organization has no invitations;
- mixed pending/accepted/revoked records;
- expired record remains persisted as `pending`;
- records from another organization exist in repository;
- human decision remains unresolved — implementation must not begin by choosing a policy.

## Test plan

### Unit / application contract
- permission denial;
- tenant isolation;
- empty result;
- mixed-state filtering according to approved policy;
- expired pending behavior according to approved policy;
- token material absent from response.

## Rollout, migration, and recovery

- No schema migration expected for the reference fixture.
- Additive read-only application behavior.
- Rollback by reverting the bounded application/tests/docs change.

## Implementation plan

1. Wait for APPROVED `decide-expired-invitation-listing` evidence.
2. Recompute implementation readiness and eligibility.
3. Update PRD with the approved active-list contract and preserved negative decision.
4. Add the application listing with authorization/tenant checks.
5. Add focused regression tests and deterministic verification evidence.

## Verification commands

When unblocked, run:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim implementation readiness or verification success while the HUMAN DECISION is unresolved.

## Independent review evidence

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| | | | | |

## Completion report

- What changed and why: blocked downstream Task Pack created for Issue #44 dependency dogfood.
- Verification actually run: not applicable yet; implementation is intentionally blocked.
- Remaining risks/limitations: correct expired-record semantics depend on the unresolved human decision.
