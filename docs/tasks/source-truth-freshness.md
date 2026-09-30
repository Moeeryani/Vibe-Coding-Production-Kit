# Task — Enforce Source-of-Truth freshness

Status: Review
Slug: `source-truth-freshness`

## Outcome

VCP deterministically distinguishes current governing Source-of-Truth documents from drafts and retained history while preserving backward compatibility for legacy unmarked documents.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Freshness contract | `docs/SOURCE-OF-TRUTH.md` |

## Requirement restatement

Implement roadmap Slice E with optional explicit `Authority:` markers: `DRAFT`, `ACCEPTED`, `SUPERSEDED`, and `ARCHIVED`. Legacy documents without a marker remain usable as current authority. Draft governing material may support planning but not implementation. Superseded/archived material remains inspectable history but must not silently govern current task execution. Invalid or ambiguous explicit markers fail visibly. Accepted negative decisions remain discoverable in current accepted authority.

## Acceptance criteria

- [x] AC-001 — Legacy unmarked Source-of-Truth documents remain backward compatible for implementation readiness/context.
- [x] AC-002 — `Authority: ACCEPTED` documents remain valid governing material.
- [x] AC-003 — `Authority: DRAFT` is allowed for plan readiness/context but blocks implementation readiness and non-plan governing context.
- [x] AC-004 — `SUPERSEDED` and `ARCHIVED` governing references fail deterministically instead of silently driving current execution.
- [x] AC-005 — Unknown or multiple explicit authority markers fail visibly instead of falling back to legacy behavior.
- [x] AC-006 — Explicit `--include` can deliberately carry historical material without treating it as governing Source of Truth.
- [x] AC-007 — The reference SaaS marks its live PRD `ACCEPTED`, retains one `SUPERSEDED` policy artifact, and keeps the rejected listing alternative discoverable in the accepted PRD.
- [ ] AC-008 — Focused conformance plus the full repository validation pass on the pre-final PR head before Task Pack finalization.

## Scope

### In scope
- deterministic Markdown authority parser/helper;
- readiness enforcement by stage;
- context enforcement by mode;
- backward compatibility for unmarked documents;
- focused conformance tests;
- reference SaaS dogfood with accepted and superseded material;
- public freshness documentation.

### Out of scope
- document database/index;
- revision graph or automatic supersession inference;
- migrations/backfill for existing documents;
- scheduler/dependency graph engine;
- embedded AI decision-making;
- automatic deletion or rewriting of historical material;
- roadmap status finalization before executable validation.

## Affected boundaries

- Modules/files likely affected: `lib/readiness.mjs`, `lib/context.mjs`, a shared authority helper, focused tests, freshness docs, and reference SaaS product docs.
- Public API/contract impact: additive optional `Authority:` Source-of-Truth marker semantics; existing CLI command names and flags remain unchanged.
- Data/schema/migration impact: n/a — repository Markdown only; no manifest/schema migration and no backfill requirement.
- External integration impact: n/a — no network/provider integration.

## Domain invariants

- Legacy unmarked documents remain current for compatibility.
- Explicit authority never silently falls back when malformed.
- Historical files remain inspectable and are never deleted by freshness enforcement.
- A governing Task Pack reference means current authority, not merely related history.
- Accepted negative decisions remain durable in current accepted authority.
- Context transport does not turn stale authority into permission to implement.

## Security and privacy

- Authentication impact: n/a — local repository metadata behavior only.
- Authorization/resource ownership: n/a — no user/resource authorization surface changes.
- Tenant isolation: n/a — framework workflow metadata only; reference SaaS tenant behavior is unchanged.
- Input/trust boundaries: repository-authored Markdown authority markers are parsed deterministically; explicit historical includes remain caller-selected.
- Secrets/PII/logging: no secrets/PII are introduced or logged; diagnostics report file paths and authority states only.
- Abuse/rate/replay considerations: n/a — no remote or mutable service surface.
- Relevant threat IDs: n/a — workflow freshness metadata does not create a new application security boundary.

## Failure modes and edge cases

- document has no marker → legacy current behavior is preserved;
- document uses lowercase accepted state → normalized deterministically;
- document has unknown authority → visible failure;
- document has multiple authority markers → visible failure;
- draft document is referenced for planning → allowed and identified;
- draft document is referenced for implementation → blocked;
- superseded/archived document is a governing reference → blocked;
- superseded/archived document is deliberately passed with `--include` → inspectable extra context.

## Observability

n/a — deterministic readiness/context diagnostics are the required visibility; no long-running service, metrics, tracing, or audit stream is added.

## Test plan

### Unit
- parse legacy, accepted, invalid, and duplicate authority markers.

### Integration / contract
- readiness behavior for legacy/accepted/draft/historical states;
- context behavior for draft plan-only enforcement and historical governing rejection;
- explicit historical include remains available.

### E2E / regression
- reference SaaS active-list task remains implementation-ready from its accepted PRD and does not receive superseded policy as governing context.

### Negative/security paths
- invalid explicit marker does not fall back to legacy semantics;
- superseded/archived governing references cannot silently authorize implementation.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive opt-in marker; existing unmarked projects retain current behavior.
- Migration/backfill: n/a — no migration is required; projects may adopt markers document-by-document.
- Rollback or recovery: revert the helper/readiness/context/docs/test slice; repository Source-of-Truth files remain ordinary Markdown.

## Implementation plan

1. Add one shared authority parser with the four allowed explicit states plus legacy-unmarked compatibility.
2. Enforce stage-aware authority in readiness: draft is plan-usable; implementation requires accepted or legacy current authority.
3. Enforce mode-aware authority in context: only plan may use draft governing material; historical governing references fail, while explicit `--include` remains inspectable.
4. Add focused temporary-fixture tests covering compatibility, enforcement, invalid markers, negative decisions, and explicit history inspection.
5. Dogfood the rule in the reference SaaS by marking the live PRD accepted and retaining one superseded historical listing proposal.
6. Run pre-final focused/full validation; only then make the Task Pack finalization edit and rerun exact-head validation before merge.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Authority parsing is centralized so readiness/context cannot drift independently.
- [x] Legacy projects require no migration/backfill.
- [x] Draft planning does not accidentally become implementation authorization.
- [x] Superseded/archived material remains inspectable but not governing.
- [x] Accepted negative decisions remain present in the current accepted reference PRD.
- [x] No document database, revision graph, scheduler, schema migration, or embedded AI runtime was introduced.
- [ ] Executable pre-final validation confirms the branch behavior.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Static review confirms one shared authority helper owns parsing/policy, readiness consumes stage semantics, context consumes mode semantics, and `--include` is intentionally outside governing-reference enforcement. | No correction required before executable validation. | Exact behavior remains gated on pre-final executable validation under Issue #15. |

## Finalization

Prepare the finalization edit only after the pre-final implementation/review gate passes.

- [ ] Acceptance criteria satisfied.
- [ ] Pre-final implementation/review gate passed before the finalization edit.
- [x] Independent review evidence is current and no `must fix in this task` finding remains unresolved.
- [ ] Completion report reflects the intended final accepted gate; earlier failures are marked superseded if retained.
- [ ] Top-level `Status` changed to `Done`.

After the finalization edit, rerun the required exact-head gate. Do not edit this Task Pack solely to record that rerun; merge only if it passes.

## Completion report

- What changed and why: added deterministic Source-of-Truth freshness states so current authority cannot be silently confused with drafts/history, while legacy projects remain compatible.
- Final accepted verification: pending pre-final executable validation; replace during finalization, then prove it with the post-finalization exact-head rerun before merge.
- Superseded failed evidence (if material): n/a.
- Independent review evidence updated: yes; static review found no blocking design issue before executable validation.
- Migration/operational impact: none; optional Markdown marker, no schema/backfill.
- Remaining risks/limitations: freshness is explicit per-document metadata; VCP does not infer supersession relationships or build a revision graph.
