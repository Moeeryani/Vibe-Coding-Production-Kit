# Task — Implement Stage 7 prompt behavioral evaluation harness

Status: Review
Slug: `stage7-prompt-evaluation`

## Outcome

VCP can deterministically evaluate recorded external-agent behavior against canonical prompt scenarios without embedding a model runtime or grading exact wording.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Prompt evaluation contract | `docs/PROMPT-EVALUATION.md` |
| Operating model | `docs/OPERATING-MODEL.md` |
| Issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/71 |

## Requirement restatement

Complete Stage 7 by adding provider-independent behavioral evaluation for the nine roadmap prompt properties. The harness must consume structured evidence from external agent runs and deterministically score observable behavior, not prose similarity or model confidence.

## Acceptance criteria

- [ ] AC-001 — canonical versioned scenario and behavior-record contracts exist.
- [ ] AC-002 — all nine Stage 7 roadmap properties are covered by canonical scenarios.
- [ ] AC-003 — one scenario and full-suite CLI evaluation produce deterministic human/JSON reports and non-zero failures.
- [ ] AC-004 — exact wording/free-form notes are not part of pass/fail logic.
- [ ] AC-005 — discover-before-ask and HUMAN DECISION boundaries are mechanically checked.
- [ ] AC-006 — proposal vs approval and negative decisions are mechanically checked.
- [ ] AC-007 — bounded vertical planning and blocker/readiness behavior are mechanically checked.
- [ ] AC-008 — verification reporting accuracy treats truthful failure reporting as correct behavior and false success as failure.
- [ ] AC-009 — out-of-scope follow-ups and restartability are mechanically checked.
- [ ] AC-010 — missing/invalid/mismatched evidence fails visibly.
- [ ] AC-011 — one deliberate mutation per property proves every evaluation lane can turn red.
- [ ] AC-012 — canonical runtime assets are published and framework validation requires them.
- [ ] AC-013 — documentation preserves VCP's no-embedded-LLM boundary and avoids provider/model-quality claims.
- [ ] AC-014 — Roadmap/README/CLI documentation records Stage 7 behavior and usage.

## Scope

### In scope
- versioned canonical scenario suite;
- normalized behavior-record contract;
- deterministic evaluator/reporting;
- `vcp prompt-eval` list/single/all CLI;
- repository-bounded response-file handling;
- passing reference suite and per-property mutation fixtures;
- package/framework/docs/roadmap integration;
- automated evaluator/CLI tests.

### Out of scope
- provider/model API clients;
- automatic prompt execution;
- semantic grading by another model;
- model leaderboards/statistical benchmarking;
- production telemetry ingestion;
- Stage 8 architecture fitness functions.

## Affected boundaries

- Modules/files likely affected: `lib/prompt-eval.mjs`, `lib/cli.mjs`, `evaluations/prompt-behavior/**`, `test/prompt-eval*.test.mjs`, `package.json`, framework validation, and Stage 7 docs/roadmap.
- Public API/contract impact: adds `vcp prompt-eval list|all|<scenario>` plus versioned JSON scenario/behavior/report contracts; existing commands remain unchanged.
- Data/schema/migration impact: no application data or existing VCP lifecycle schema migration; evaluation response records are opt-in JSON inputs under project-owned paths.
- External integration impact: none — no model/provider, network grader, telemetry service, or credential integration is introduced.

## Domain invariants

- VCP evaluates recorded observable behavior, not prose quality.
- Proposal is not approval.
- HUMAN DECISION answers are never manufactured by the harness.
- A failed repository check reported as failed can be good prompt behavior.
- Missing evidence never defaults to pass.
- Canonical property coverage is explicit and inspectable.
- The harness proves only evaluated scenarios/records, not universal model quality.

## Security and privacy

- Authentication impact: n/a — local evaluation command adds no authentication surface.
- Authorization/resource ownership: n/a — the harness reads only explicitly selected project-local behavior records and packaged canonical scenarios.
- Tenant isolation: n/a — no tenant/runtime data plane exists in this feature.
- Input/trust boundaries: JSON response records are untrusted local inputs; schema/identity checks and project-root/symlink bounds must fail visibly.
- Secrets/PII/logging: behavior records should contain scenario identity keys rather than secrets or raw production payloads; evaluator output does not persist model credentials or provider transcripts.
- Abuse/rate/replay considerations: n/a — no remote endpoint or repeated external action is introduced; deterministic reruns are intentionally supported.
- Relevant threat IDs: n/a — no accepted project-specific threat ID governs this local offline evaluator and none should be invented.

## Failure modes and edge cases

- unknown scenario id -> visible error;
- scenario/record schema version mismatch -> visible failure;
- scenario/prompt identity mismatch -> visible failure;
- missing required observation array -> visible failure;
- missing suite response file -> scenario/property failure, not implicit pass;
- path traversal/symlink input -> rejected;
- accurately reported failed check -> behavioral pass;
- unexecuted check reported as pass -> behavioral fail;
- free-form notes/wording changes -> no score impact.

## Observability

Human output reports scenario/property/assertion pass/fail counts and failed assertion details. JSON output preserves scenario ids, prompt ids, per-property assertions, coverage, summaries, and overall success.

## Test plan

### Unit
- canonical suite schema/property coverage;
- behavior-record validation and identity mismatch;
- all nine property evaluators;
- truthful failed verification reporting;
- wording-independent scoring.

### Integration / contract
- canonical reference suite passes all scenarios/properties;
- every mutation fixture turns its target property red;
- missing suite records fail visibly;
- response path traversal is rejected.

### E2E / regression
- CLI `prompt-eval list`, single scenario, and `all` operate against packaged canonical scenarios;
- JSON output is parseable and exit codes follow success/failure;
- existing CLI commands and lifecycle assets remain unchanged.

### Negative/security paths
- malformed JSON/schema/required observation failure;
- unknown scenario;
- scenario/prompt mismatch;
- blocked work executed;
- unexecuted/failed check falsely reported as passing;
- out-of-scope follow-up silently implemented;
- chat-dependent continuation.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive CLI/runtime assets; no existing command or prompt contract is removed.
- Migration/backfill: none; existing projects may optionally record behavior runs without lifecycle migration.
- Rollback or recovery: revert Stage 7 package/docs/evaluator assets; no external or production state is mutated.

## Implementation plan

1. Define canonical properties, scenario schema, and normalized behavior record.
2. Implement deterministic property evaluator and suite aggregation.
3. Add reference green records plus one mutation per property.
4. Expose list/single/all CLI with JSON and bounded local response paths.
5. Add package/framework validation and documentation.
6. Dogfood the canonical reference suite and prove every mutation lane red.
7. Run exact-head comprehensive validation and independent review.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/prompt-eval.test.mjs test/prompt-eval-cli.test.mjs`
- full gate: `npm run validate` and `npm run pack:check`

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Awaiting complete changed-surface review and executable Stage 7 gate. | Keep in Review. | External agent/provider behavior beyond canonical recorded scenarios is not yet claimed. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread + top-level-comment audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
