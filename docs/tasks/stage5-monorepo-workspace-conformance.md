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

- [ ] AC-001 — Checked-in fixture has one nested VCP package, one explicit workspace governing document, one unrelated root document, and one unrelated sibling package.
- [ ] AC-002 — Fresh-checkout implementation readiness succeeds using project-local + explicit workspace Source of Truth.
- [ ] AC-003 — Plan and implementation context include only declared governing authority and exclude unrelated root/sibling sentinels.
- [ ] AC-004 — Verification runs from the selected nested package and persists schema-v2 `scope.projectPath`, exact Git revision, and pre-run dirty state inside the project boundary.
- [ ] AC-005 — Git-aware review from the nested package exposes a committed workspace-root governing-document change.
- [ ] AC-006 — Project-local include/planned/output paths reject sibling/root escape in the realistic fixture.
- [ ] AC-007 — Workspace-qualified traversal outside the worktree fails visibly.
- [ ] AC-008 — Fixture-local plan/implement/review prompts remain byte-identical to canonical prompts, so a fresh checkout needs no undocumented prompt copying.
- [ ] AC-009 — No scheduler, graph engine, implicit inheritance, package discovery, or package-manager orchestration is added.
- [ ] AC-010 — Hosted CI status is re-checked on the implementation branch/PR and Issue #15 is closed only if repository steps actually execute normally.
- [ ] AC-011 — One comprehensive maintainer-local Stage 5 exact-head gate is run after the complete implementation is ready; no partial local pass is treated as final Stage 5 evidence.

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

- [ ] Fresh checkout needs no prior chat or manual VCP scaffolding.
- [ ] Explicit workspace authority is necessary and sufficient.
- [ ] Unrelated root/sibling content stays absent.
- [ ] Verification evidence remains package-local and portable.
- [ ] Root changes remain review-visible from nested project.
- [ ] Negative path tests prove project/workspace ownership boundaries.
- [ ] No scheduler/implicit inheritance/product-scope expansion appears.
- [ ] Hosted CI state is classified from executed steps, not check color alone.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Fresh full-diff changed-surface audit of PR #67 verified the fixture has explicit local + workspace authority, unrelated root/sibling sentinels, public-CLI readiness/context/verify/review conformance, realistic project-boundary negatives, and no scheduler/discovery/orchestration expansion. No source-level must-fix finding was identified. | Keep the task in Review until executable Stage 5 validation passes. | Executable behavior still requires the comprehensive exact-head gate. |
| RISK | follow-up candidate | CodeRabbit selected all 17 changed files on exact head `92c851281ab87a296df4612f12a5ad51a360e03f` but remained pending and emitted no submitted review or inline thread, including after an explicit review request. | Do not treat the pending bot as approval or absence-of-findings evidence; re-audit submitted reviews + inline threads before merge. | External automated review availability remains nondeterministic. |
| RISK | follow-up candidate | Hosted Framework Validation run `37159472243` / job `111309712396` failed with zero executed steps, reproducing Issue #15 before checkout/setup/install/validation. | Fresh evidence was added to #15; keep #15 open and classify the result as infrastructure-only. | Stage 5 cannot honestly claim hosted-CI execution until #15 recovers or a deliberate long-term equivalent is approved. |

## Finalization

- [ ] Acceptance criteria satisfied.
- [ ] Comprehensive Stage 5 pre-final gate passed on the exact reviewed head.
- [ ] Independent review evidence is current.
- [ ] Task Pack-only finalization edit made after the pre-final gate.
- [ ] Same comprehensive exact-head gate rerun on the finalization head.
- [ ] Top-level `Status` changed to `Done`.

## Completion report

Pending the final combined Stage 5 validation/review sequence. No partial or hosted-infrastructure result is treated as final evidence.
