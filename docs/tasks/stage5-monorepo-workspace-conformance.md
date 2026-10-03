# Task — Prove Stage 5 monorepo/workspace conformance

Status: Review
Slug: `stage5-monorepo-workspace-conformance`

## Outcome

A realistic checked-in monorepo/workspace fixture proves that VCP can reconstruct, verify, and review a nested package using explicit project/workspace authority while retaining bounded context, project-local path ownership, portable Git evidence, and zero-chat restartability.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Source-of-Truth contract | `docs/SOURCE-OF-TRUTH.md` |
| Context Pack contract | `docs/CONTEXT-PACKS.md` |
| Verification evidence | `docs/VERIFICATION-EVIDENCE.md` |
| Fixture contract | `examples/reference-workspace-monorepo/README.md` |

## Requirement restatement

Complete the product-semantic remainder of Roadmap Stage 5 without adding automatic package discovery, hidden authority inheritance, a scheduler, or package-manager orchestration. The proof must start from checked-in repository state and exercise the public VCP CLI against a nested project in a fresh Git checkout.

## Acceptance criteria

- [x] AC-001 — Checked-in fixture has one nested VCP package, one explicit workspace governing document, one unrelated root document, and one unrelated sibling package.
- [x] AC-002 — Fresh-checkout implementation readiness succeeds using project-local + explicit workspace Source of Truth.
- [x] AC-003 — Plan and implementation context include only declared governing authority and exclude unrelated root/sibling sentinels.
- [x] AC-004 — Verification runs from the selected nested package and persists schema-v2 `scope.projectPath`, exact Git revision, and pre-run dirty state inside the project boundary.
- [x] AC-005 — Git-aware review from the nested package exposes a committed workspace-root governing-document change.
- [x] AC-006 — Project-local include/planned/output paths reject sibling/root escape in the realistic fixture.
- [x] AC-007 — Workspace-qualified traversal outside the worktree fails visibly.
- [x] AC-008 — Fixture-local plan/implement/review prompts remain byte-identical to canonical prompts, so a fresh checkout needs no undocumented prompt copying.
- [x] AC-009 — No scheduler, graph engine, implicit inheritance, package discovery, or package-manager orchestration is added.
- [x] AC-010 — Hosted CI status is re-checked on the implementation branch/PR and Issue #15 is closed only if repository steps actually execute normally.
- [x] AC-011 — One comprehensive maintainer-local Stage 5 exact-head gate is run after the complete implementation is ready; no partial local pass is treated as final Stage 5 evidence.

## Scope

### In scope
- realistic monorepo/workspace reference fixture;
- public-CLI end-to-end conformance/restartability coverage;
- nested path-boundary regression coverage;
- portable verification provenance assertions;
- root-aware Git review assertions;
- Stage 5 documentation and durable task evidence.

### Out of scope
- automatic workspace/package discovery;
- dependency scheduling/queues;
- persisted graph state;
- package-manager-specific orchestration;
- broad cross-root include/planned/output authority;
- provider API integration inside VCP;
- Stage 6 security profiles.

## Affected boundaries

- Modules/files likely affected: new reference fixture, conformance test, roadmap/task documentation.
- Public API/contract impact: none; this slice proves existing Stage 5 contracts.
- Data/schema/migration impact: none.
- External integration impact: GitHub Actions status is observed as external evidence only; no provider API dependency is added to VCP.

## Domain invariants

- `--dir` owns one selected VCP project root.
- Workspace authority exists only when explicitly declared with `workspace:<path>`.
- Repository layout alone grants no root or sibling authority.
- Verification cwd and evidence output remain selected-project-local.
- Git review may expose the wider changed surface without widening implementation authority.
- Evidence shape is provider-agnostic.

## Security and privacy

- Authentication impact: n/a.
- Authorization/resource ownership: workspace governing reads are explicit; project-local write/output boundaries stay narrow.
- Tenant isolation: n/a — workflow tooling fixture.
- Input/trust boundaries: repository Task Packs, Git metadata, and CLI path options are untrusted local inputs.
- Secrets/PII/logging: no secrets; verification evidence does not persist raw stdout/stderr.
- Abuse/rate/replay considerations: bounded local commands only.
- Relevant threat IDs: traversal/symlink and authority-confusion classes are covered by existing Stage 5 contracts plus realistic escape regressions.

## Failure modes and edge cases

- sibling path supplied to project-local include/planned → fail;
- output tries to escape nested project → fail before writing;
- workspace reference traverses above Git root → fail;
- unrelated root/sibling governing docs exist → remain absent unless explicitly declared;
- GitHub Actions still receives no runner → keep #15 open and record infrastructure failure honestly.

## Observability

Conformance asserts portable context identities, exact Git review SHAs/changed files, and verification evidence scope/revision. Hosted CI is separate external execution evidence.

## Test plan

### Unit
- Existing Stage 5 unit tests remain authoritative for resolver and normalization details.

### Integration / contract
- Fresh copied workspace runs readiness and plan/implement context.
- Prompt snapshots remain canonical.

### E2E / regression
- Public CLI runs verification and Git-aware review from the nested package.
- Evidence is persisted inside the selected package with portable workspace-relative identity.

### Negative/security paths
- sibling/root include/planned/output escape;
- workspace traversal above Git root;
- unrelated root/sibling context exclusion.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive fixture/test/docs only.
- Migration/backfill: none.
- Rollback or recovery: revert the fixture/conformance slice; existing Stage 5 semantics remain unchanged.

## Implementation plan

1. Add the realistic workspace fixture and nested project.
2. Add dependency-free package behavior/test so verification executes real commands.
3. Add fresh-checkout CLI conformance for readiness/context/verify/review.
4. Add realistic nested path-boundary negative cases.
5. Re-check hosted Actions on the branch/PR.
6. Perform fresh review.
7. Run one comprehensive Stage 5 exact-head maintainer-local gate only after all implementation/review fixes are complete.
8. After that gate, finalize this Task Pack using the established Task Pack-only finalization sequence.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/stage5-workspace-conformance.test.mjs`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Fresh checkout needs no prior chat or manual VCP scaffolding.
- [x] Explicit workspace authority is necessary and sufficient.
- [x] Unrelated root/sibling content stays absent.
- [x] Verification evidence remains package-local and portable.
- [x] Root changes remain review-visible from nested project.
- [x] Negative path tests prove project/workspace ownership boundaries.
- [x] No scheduler/implicit inheritance/product-scope expansion appears.
- [x] Hosted CI state is classified from executed steps, not check color alone.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Fresh full-diff changed-surface audit of PR #67 verified the intended fixture/scope boundaries and no scheduler/discovery/orchestration expansion. | Superseded as completion evidence by the later CodeRabbit review below; the high-level scope audit remains valid. | Test assertions still required correction before final acceptance. |
| NO ACTION | n/a | Maintainer reported the complete Stage 5 pre-final gate passed on exact head `2a5254d1374e57bb78bd4029f247d7a7ad0da375`: diff check; 34/34 focused Stage 5 tests; repository check over 29 modules; strict implementation readiness 15 pass / 0 warn / 0 fail; VCP verification 2 pass / 0 fail on a clean exact revision; full validation 223 tests / 0 fail; package-content check; unchanged remote/local head; clean tree. Observed toolchain: Node v24.5.0, npm 11.5.2. | Accepted as the pre-final exact-head evidence. | The same gate must rerun after this Task Pack-only finalization commit. |
| DEFECT | must fix in this task | Late CodeRabbit review on pre-final head `2a5254d1374e57bb78bd4029f247d7a7ad0da375` found the negative-test helper could catch its own `assert.fail`; a successful CLI call whose assertion text matched `outside` could be misclassified as the expected rejection. | Corrective source now uses `assert.rejects(runVcp(...))` and matches diagnostics only from the actual rejected CLI call. | Requires corrected exact-head validation before finalization. |
| DEFECT | must fix in this task | Late review found `evidence.commands.every(...)` vacuously passes for an empty array, so missing command records could still satisfy the conformance assertion. | Corrective source now asserts the exact expected `CHECK_COMMAND=npm run check` and `UNIT_TEST_COMMAND=npm test` records before requiring both statuses to be `pass`. | Requires corrected exact-head validation before finalization. |
| DEFECT | must fix in this task | Late review found the root-change assertions searched all review stdout, allowing governing Source-of-Truth content to satisfy AC-005 even if the Git review surface omitted the workspace-root change. | Corrective source isolates the `## Git review surface` section, requires its resolved base/head SHAs, and requires the shared-policy path + review marker inside that bounded section. | Requires corrected exact-head validation before finalization. |
| RISK | follow-up candidate | Hosted Framework Validation reproduced Issue #15 on both implementation head `92c851281ab87a296df4612f12a5ad51a360e03f` (run `37159472243`, job `111309712396`) and pre-final head `2a5254d1374e57bb78bd4029f247d7a7ad0da375` (run `37159724002`, job `111310476370`), each failing with zero executed steps before checkout/setup/install/validation. | Evidence was added to #15; keep #15 open and classify these as infrastructure-only failures. | Stage 5 cannot honestly claim hosted-CI execution until #15 recovers or a deliberate long-term equivalent is approved. |

## Finalization

- [ ] Acceptance criteria satisfied on the corrected exact head.
- [ ] Corrected comprehensive Stage 5 pre-final gate passed after all late review fixes.
- [x] Independent review evidence records the late must-fix findings and their source corrections.
- [ ] Task Pack-only finalization edit made after the corrected pre-final gate.
- [ ] Same comprehensive exact-head gate rerun on the eventual finalization head.
- [ ] Top-level `Status` changed to `Done`.

## Completion report

- What changed and why: added a realistic nested workspace/monorepo conformance fixture and public-CLI coverage proving explicit project/workspace authority, bounded context, package-local verification/evidence, root-aware Git review, nested path safety, and zero-chat restartability without adding a scheduler, graph engine, implicit inheritance, package discovery, or package-manager orchestration.
- Superseded pre-final verification: maintainer reported the complete requested Stage 5 gate passed on exact head `2a5254d1374e57bb78bd4029f247d7a7ad0da375` (34/34 focused tests; repository check over 29 modules; readiness 15 pass / 0 warn / 0 fail; VCP verification 2 pass / 0 fail; full validation 223 tests / 0 fail; package-content validation; clean unchanged head; Node v24.5.0 / npm 11.5.2). Late CodeRabbit findings required source/test changes afterward, so that passing head is historical evidence, not merge evidence for the corrected implementation.
- Windows batch note: the maintainer used `call` for npm invocations so the parent batch continued through every gate step; command intent, environment, working tree, and required checks were otherwise unchanged.
- Hosted CI: GitHub Actions remains blocked under Issue #15 and failed before any job step executed on the Stage 5 candidate. This is infrastructure evidence, not a source-test failure; #15 remains open.
- Independent review evidence updated: yes; CodeRabbit later published three must-fix conformance-test findings (two major, one minor). All three are corrected in source, but the corrections are not yet accepted by an exact-head executable gate.
- Corrective state: because source changed after the attempted `Done` finalization, this Task Pack has returned to `Review`. Run the full Stage 5 gate on the corrected exact head before making a new Task Pack-only finalization edit.
- Remaining limitation: hosted-CI execution remains separate unresolved infrastructure debt in #15.
