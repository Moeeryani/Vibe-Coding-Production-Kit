# Task — Decide expired invitation visibility in the admin active list

Status: Approved
Slug: `decide-expired-invitation-listing`

## Outcome

Record the product-policy decision that determines whether an invitation whose persisted status is still `pending` but whose `expiresAt` is at or before the current time belongs in the administrator's active-invitations list.

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

Issue #44 requires one genuine HUMAN DECISION whose answer changes downstream acceptance behavior. Existing repository evidence defines invitation storage, expiry during acceptance, revocation, tenant ownership, and a status-neutral organization query. It did not define the administrator-facing meaning of an expired record that is still persisted with status `pending`.

This was HUMAN DECISION, not DISCOVERABLE. The choice has now been explicitly approved and must be preserved as product truth.

## Decision required

The options presented were:

- **Option A — include expired pending records:** the admin active-invitations list includes them, but marks them `expired` in the returned/view model so an administrator can still see the invitation and its usability state.
- **Option B — exclude expired pending records:** the admin active-invitations list contains only currently usable pending invitations; expired pending records are omitted from that active list.

## Dependency evidence

- Completed prerequisite: `list-invitations-by-organization-repository` — merged via PR #45 and provides status-neutral organization-scoped enumeration.
- Previously blocked downstream task: `list-active-invitations` — now eligible because the required human decision is APPROVED.
- Delivery/API work depending on the application listing remains downstream of `list-active-invitations`.

## Acceptance criteria

- [x] Human explicitly selected Option A.
- [x] Approval is recorded durably in this Task Pack and the governing Product / PRD document.
- [x] Rejected Option B remains recorded as a negative decision.
- [x] Downstream eligibility is recomputed after approval.

## Scope

### In scope
- product meaning of expired-but-persisted-pending records in the admin active-invitations list;
- durable approval/rejection evidence;
- downstream eligibility recomputation.

### Out of scope
- implementing the application listing in this decision task;
- repository filtering changes;
- API/UI design beyond what the approved policy requires;
- cleanup jobs that mutate expired invitation status;
- `mode` / `blockedBy` schema or graph engine work.

## HUMAN DECISION record

Classification: HUMAN DECISION
State: APPROVED

Approved option: **Option A — include expired pending records and mark them `expired` in the application/view model.**

Rejected option: **Option B — exclude expired pending records from the active list.**

Rationale / notes: Human approval was explicit on 2026-09-30. No additional rationale was supplied. The implementation must preserve stored invitation state; projecting `expired` for display/listing does not mutate persisted `status: pending`.

## Eligibility recomputation

Before approval:

- `list-invitations-by-organization-repository`: completed and merged via PR #45;
- `decide-expired-invitation-listing`: HUMAN DECISION frontier;
- `list-active-invitations`: AFK but blocked by this decision.

After approval:

- human dependency frontier for this slice: cleared;
- `list-active-invitations`: AFK and now eligible, subject to its normal implementation readiness and executable verification checks;
- no scheduler or graph engine was required to perform this recomputation.

## Verification commands

This is a decision Task Pack, not an implementation task. No code verification command can substitute for human approval. Downstream implementation uses its own executable verification plan.

## Independent review evidence

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Human approval was recorded without inferring rationale, and rejected Option B remains durable. | No change required. | Application implementation still requires deterministic verification. |

## Completion report

- What changed and why: Option A was explicitly approved and preserved as product truth for Issue #44.
- Verification actually run: n/a — human intent cannot be verified mechanically.
- Remaining risks/limitations: downstream application behavior is not implemented by this decision task.
