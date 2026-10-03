# Task — Format order identifiers under explicit workspace policy

Status: Review
Slug: `format-order-id`

## Outcome

The nested orders package formats order identifiers according to its local product requirement and one explicitly declared shared workspace policy without inheriting unrelated root or sibling authority.

## Source of truth

This Task Pack belongs to the `packages/orders-api` VCP project root.

| Source | Reference |
|---|---|
| Package PRD | `docs/product/PRD.md` |
| Shared platform policy | `workspace:docs/platform/SHARED-ORDER-POLICY.md` |

## Requirement restatement

Implement the package-local `formatOrderId(rawId)` contract while treating the workspace policy as explicit governing authority. No other root or sibling document governs this task.

## Acceptance criteria

- [ ] AC-001 — Surrounding whitespace is trimmed from the caller identifier.
- [ ] AC-002 — Empty identifiers are rejected.
- [ ] AC-003 — Successful identifiers use the shared `ord_` prefix.
- [ ] AC-004 — Package verification remains dependency-free and executable from the selected project root.
- [ ] AC-005 — No unrelated root or sibling authority is required.

## Scope

### In scope
- `src/order-id.mjs`;
- package-local tests;
- explicit local + workspace Source-of-Truth authority.

### Out of scope
- sibling package behavior;
- automatic workspace discovery;
- persistence, networking, API frameworks, schedulers, or dependency graphs.

## Affected boundaries

- Modules/files likely affected: order-id formatter and its tests.
- Public API/contract impact: one fixture-local exported function.
- Data/schema/migration impact: none.
- External integration impact: none.

## Domain invariants

- Shared workspace authority is opt-in through the Task Pack.
- Package-local paths remain owned by this selected project.
- A sibling package never becomes authority because it shares the same Git worktree.

## Security and privacy

- Authentication impact: n/a — pure fixture utility.
- Authorization/resource ownership: workspace authority is read-only and explicitly declared.
- Tenant isolation: n/a.
- Input/trust boundaries: caller input is trimmed and empty values are rejected.
- Secrets/PII/logging: no logging or persistence.
- Abuse/rate/replay considerations: n/a.
- Relevant threat IDs: n/a.

## Failure modes and edge cases

- whitespace-only identifier → throw a visible error;
- non-string input → throw a visible type error;
- root/sibling files exist but are not declared → remain outside context.

## Observability

Verification evidence records exact command results, portable package scope, and Git revision. No application logging is added.

## Test plan

### Unit
- valid identifier;
- surrounding whitespace;
- empty input;
- non-string input.

### Integration / contract
- readiness/context use both declared governing documents.

### E2E / regression
- Stage 5 conformance test executes package verification from a fresh copied checkout.

### Negative/security paths
- unrelated root/sibling authority remains absent;
- cross-package project-local paths remain rejected.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: fixture only.
- Migration/backfill: none.
- Rollback or recovery: remove the fixture.

## Implementation plan

1. Keep shared authority explicit in this Task Pack.
2. Implement the package-local formatter.
3. Cover positive and negative behavior.
4. Use VCP readiness/context/verification/review from the selected package root.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

## Independent review evidence

| Finding class | Disposition | Finding / evidence | Resolution or follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Pending final Stage 5 review. | No completion claim yet. | Final combined gate still required. |
