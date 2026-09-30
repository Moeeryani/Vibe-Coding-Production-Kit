# Task — Decide expired invitation visibility in the admin active list

Status: Waiting for human decision
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

Issue #44 requires one genuine HUMAN DECISION whose answer changes downstream acceptance behavior. Existing repository evidence defines invitation storage, expiry during acceptance, revocation, tenant ownership, and a status-neutral organization query. It does not define the administrator-facing meaning of an expired record that is still persisted with status `pending`.

This is HUMAN DECISION, not DISCOVERABLE. Do not infer an answer from acceptance behavior or from repository storage state.

## Decision required

Choose one product contract:

- **Option A — include expired pending records:** the admin active-invitations list includes them, but marks them `expired` in the returned/view model so an administrator can still see the invitation and its terminal usability state.
- **Option B — exclude expired pending records:** the admin active-invitations list contains only currently usable pending invitations; expired pending records are omitted from that active list.

The chosen option must be recorded as APPROVED before downstream application-listing semantics are implemented.

## Dependency evidence

- Completed prerequisite: `list-invitations-by-organization-repository` — merged via PR #45 and provides status-neutral organization-scoped enumeration.
- Blocked downstream task: `list-active-invitations` — cannot define acceptance criteria or filtering behavior until this decision is approved.
- Any delivery/API task depending on the application listing is also blocked behind `list-active-invitations`.

## Acceptance criteria

- [ ] Human explicitly selects Option A or Option B.
- [ ] Approval is recorded durably in this Task Pack and the governing Product / PRD document.
- [ ] Rejected option remains recorded as a negative decision rather than disappearing.
- [ ] Downstream eligibility is recomputed after approval.

## Scope

### In scope
- product meaning of expired-but-persisted-pending records in the admin active-invitations list;
- durable approval/rejection evidence;
- downstream eligibility recomputation.

### Out of scope
- implementing the application listing before approval;
- repository filtering changes;
- API/UI design beyond what the approved policy requires;
- cleanup jobs that mutate expired invitation status;
- `mode` / `blockedBy` schema or graph engine work.

## HUMAN DECISION record

Classification: HUMAN DECISION
State: PROPOSED OPTIONS — NOT APPROVED

Approved option: _pending human decision_

Rejected option: _pending human decision_

Rationale / notes: _pending human decision_

## Verification commands

This is a decision Task Pack, not an implementation task. No code verification command can substitute for human approval. After approval, downstream implementation must use its own executable verification plan.

## Independent review evidence

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| | | | | |

## Completion report

- What changed and why: decision frontier recorded for Issue #44.
- Verification actually run: n/a — human intent cannot be verified mechanically.
- Remaining risks/limitations: downstream implementation remains blocked until approval.
