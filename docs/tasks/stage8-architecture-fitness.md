# Task — Implement Stage 8 architecture fitness functions

Status: Review
Slug: `stage8-architecture-fitness`

## Outcome

VCP can execute explicit project-owned architecture boundaries and fail deterministically on ownership, dependency-direction, public-contract, cycle, unresolved-import, or governing architecture/ADR regressions without introducing an inferred dependency-graph platform.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Architecture fitness contract | `docs/ARCHITECTURE-FITNESS.md` |
| Operating model | `docs/OPERATING-MODEL.md` |
| Issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/74 |

## Requirement restatement

Complete Stage 8 with a bounded executable architecture checker driven only by explicit repository configuration. The checker must protect declared module ownership, dependency direction, narrow public interfaces, cycles, and durable architecture/ADR contracts while preserving VCP's no-hidden-authority and no-generic-graph-engine boundaries.

## Acceptance criteria

- [ ] AC-001 — versioned explicit architecture fitness config contract exists.
- [ ] AC-002 — every analyzed source file can be required to belong to exactly one declared module owner.
- [ ] AC-003 — forbidden cross-module dependency direction fails.
- [ ] AC-004 — cross-module access can be restricted to exact public entrypoints.
- [ ] AC-005 — realized module dependency cycles fail.
- [ ] AC-006 — unresolved/outside/unsupported local imports fail rather than disappearing.
- [ ] AC-007 — governing architecture markers and Accepted ADR state are executable checks.
- [ ] AC-008 — unsupported non-literal dynamic dependency expressions fail visibly.
- [ ] AC-009 — CLI produces deterministic human/JSON output and non-zero failure status.
- [ ] AC-010 — missing config fails; VCP does not infer architecture.
- [ ] AC-011 — reference SaaS dogfoods layered direction and a narrow domain public contract.
- [ ] AC-012 — negative/mutation tests prove every material Stage 8 lane can turn red.
- [ ] AC-013 — package/framework/docs integration is complete without forcing a generic fitness config into every initialized project.
- [ ] AC-014 — roadmap records Stage 8 completion evidence.

## Scope

### In scope
- `lib/architecture-fitness.mjs`;
- `vcp fitness` CLI;
- explicit `docs/architecture/FITNESS.json` contract;
- JavaScript-family static local-import analyzer;
- module ownership/direction/public-entry/cycle checks;
- governing architecture/ADR marker checks;
- reference SaaS public domain entrypoint + fitness config;
- deterministic tests and docs.

### Out of scope
- automatic architecture/module discovery;
- persisted dependency graph engine;
- generic multi-language AST platform;
- package-manager/workspace orchestration;
- runtime service/deployment topology;
- automatic ADR authoring;
- Stage 9 release automation.

## Affected boundaries

- Modules/files likely affected: `lib/architecture-fitness.mjs`, `lib/cli.mjs`, Stage 8 tests/docs, framework validation, and the reference SaaS architecture/domain public entrypoint.
- Public API/contract impact: adds `vcp fitness [--dir <project>] [--config <path>] [--json]`; existing commands remain unchanged.
- Data/schema/migration impact: no application data or VCP manifest migration; project fitness configuration is opt-in repository state.
- External integration impact: none — no graph service, package registry analyzer, model/provider, scheduler, or network dependency is introduced.

## Domain invariants

- Architecture authority comes only from explicit project configuration and durable governing documents.
- Same-module imports remain internal implementation detail.
- Cross-module imports use declared allow-lists and, when enabled, destination public contracts.
- Unresolved/ambiguous analyzer evidence fails rather than being treated as safe.
- Task Packs do not acquire required dependency graph metadata.
- A green fitness report proves only configured executable rules, not universal architecture quality.

## Security and privacy

- Authentication impact: n/a — local read-only repository analysis adds no authentication surface.
- Authorization/resource ownership: file/module ownership labels are architecture metadata only; they do not grant runtime authorization.
- Tenant isolation: n/a to the checker; the reference SaaS's module architecture remains tenant-aware through its existing domain/application contracts.
- Input/trust boundaries: config/source/doc paths are project-local inputs; path traversal/symlinks and malformed config must fail visibly.
- Secrets/PII/logging: checker reads source/docs locally and reports paths/rule violations; it should not require production secrets or data.
- Abuse/rate/replay considerations: n/a — no remote endpoint or repeated external action is introduced.
- Relevant threat IDs: n/a — no accepted project-specific threat ID governs this local architecture checker and none should be invented.

## Failure modes and edge cases

- missing/invalid config;
- unsupported extension/analyzer;
- overlapping module roots;
- unowned source file;
- forbidden module direction;
- deep internal import bypassing public entrypoint;
- missing explicit local-import target;
- local import leaving configured source roots;
- non-literal dynamic import/require;
- module dependency cycle;
- removed/duplicated contract marker;
- governing ADR no longer Accepted;
- symlink inside analyzed source/config path.

## Observability

Human output lists modules, owners, realized dependency edges, governing-contract count, and each violation code. JSON output preserves the full deterministic report and summary. No magic architecture score is produced.

## Test plan

### Unit
- config validation and overlap/reference checks;
- import extraction/resolution;
- ownership/direction/public-contract/cycle behavior;
- governing marker and ADR Accepted parsing;
- deterministic report/exit behavior.

### Integration / contract
- reference SaaS passes its checked-in fitness config;
- each material rule is mutated independently and turns red;
- missing config and symlink/path violations fail visibly.

### E2E / regression
- public CLI human/JSON paths;
- reference SaaS tests/check still pass after domain public-entrypoint introduction;
- full framework validation and package dry-run remain green.

### Negative/security paths
- unowned file;
- forbidden dependency;
- non-public cross-module import;
- cycle;
- unresolved/outside local import;
- non-literal dynamic dependency;
- architecture marker regression;
- ADR status regression.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive CLI and docs; no project is fitness-checked unless the command is explicitly run against a config.
- Migration/backfill: none; existing projects create a project-owned config only when their architecture boundaries are ready to be made executable.
- Rollback or recovery: remove/revert Stage 8 runtime/docs/config changes; no external or production state is mutated.

## Implementation plan

1. Implement and validate the explicit fitness configuration contract.
2. Analyze configured JavaScript-family source roots and resolve exact local imports.
3. Enforce ownership, allowed direction, public entrypoints, and module cycles.
4. Validate governing architecture/ADR markers and accepted ADR state.
5. Add CLI/reporting and reference SaaS dogfood.
6. Add red mutations for every material rule and regression coverage.
7. Run exact-head review + comprehensive validation.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/architecture-fitness.test.mjs test/architecture-fitness-cli.test.mjs`
- full gate: `npm run validate` and `npm run pack:check`

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Awaiting complete Stage 8 changed-surface review and exact-head executable validation. | Keep in Review. | The initial analyzer is intentionally bounded to configured JavaScript-family static local imports. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread + top-level-comment audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
