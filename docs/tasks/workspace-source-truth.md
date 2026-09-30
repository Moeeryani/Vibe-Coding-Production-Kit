# Task — Add explicit workspace Source-of-Truth references

Status: Review
Slug: `workspace-source-truth`

## Outcome

A nested VCP project can explicitly depend on selected governing Source-of-Truth documents from its enclosing Git worktree without implicit root inheritance, sibling-package authority, host-specific paths, or widening the project's normal path/command/output boundaries.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Source-of-Truth contract | `docs/SOURCE-OF-TRUTH.md` |
| Task Pack contract | `docs/TASK-PACKS.md` |
| Context Pack contract | `docs/CONTEXT-PACKS.md` |

## Requirement restatement

Preserve unqualified Task Pack Source-of-Truth references as project-local. Add one explicit `workspace:<path>` qualifier for governing references that must resolve from the enclosing Git worktree root. Apply existing freshness rules identically, preserve portable qualified identity in readiness/context, reject traversal/symlink escape and non-Git use, and keep ad hoc context/output/planned/verification boundaries project-local.

## Acceptance criteria

- [x] AC-001 — Existing unqualified Source-of-Truth references preserve project-root behavior and existing readiness detail when no workspace reference is present.
- [x] AC-002 — `workspace:<path>` resolves from the enclosing Git worktree root for a nested VCP project.
- [x] AC-003 — Workspace-qualified governing references fail clearly when the selected project is outside an accessible Git worktree.
- [x] AC-004 — Workspace-qualified paths cannot escape the enclosing worktree through traversal or canonical symlink/junction resolution.
- [x] AC-005 — `DRAFT`, `ACCEPTED`, `SUPERSEDED`, and `ARCHIVED` freshness semantics apply identically to workspace-qualified governing references.
- [x] AC-006 — Readiness diagnostics and Context Pack manifests preserve portable `workspace:<path>` identity rather than absolute checkout paths.
- [x] AC-007 — Context remains bounded: unrelated root documents and sibling-package documents are not auto-included.
- [ ] AC-008 — `workspace:` is rejected for `--include`; `--planned`, `--output`, verification output, verification cwd, task files, prompts, and AGENTS ownership remain project-local.
- [x] AC-009 — Documentation defines explicit project-local vs workspace-qualified authority and rejects hidden parent/sibling inheritance.
- [ ] AC-010 — Corrective focused contract tests, strict readiness/context/verification dogfood, and full repository validation pass on the exact pre-final head after the post-merge AC-008 fix.

## Scope

### In scope
- explicit `workspace:` qualifier for Task Pack governing Source-of-Truth references;
- enclosing Git worktree discovery for that qualifier;
- canonical path containment including symlink/junction escape rejection;
- workspace freshness enforcement in readiness/context;
- portable qualified readiness/context identity;
- bounded-context tests excluding unrelated root/sibling documents;
- reserved `workspace:` qualifier rejection across project-local context path options;
- canonical docs and focused tests.

### Out of scope
- automatic workspace/package discovery;
- parent-directory or nearest-file Source-of-Truth lookup;
- implicit root authority;
- sibling-package Source-of-Truth imports;
- workspace-qualified `--include`, `--planned`, or output paths;
- package dependency graph/scheduling;
- package-manager workspace manifest interpretation;
- hosted CI repair or provider APIs (#15 remains separate);
- declaring Stage 5 complete.

## Affected boundaries

- Modules/files likely affected: `lib/source-truth-scope.mjs`, `lib/readiness.mjs`, `lib/context.mjs`, focused tests, Source-of-Truth/Task Pack/Context Pack docs.
- Public API/contract impact: additive Task Pack reference syntax `workspace:<path>`; existing CLI invocation and unqualified references remain compatible. The reserved `workspace:` prefix is rejected by project-local context path options.
- Data/schema/migration impact: none — repository Markdown contract only; no persisted database/schema migration.
- External integration impact: local Git executable is consulted only when a Task Pack actually declares a workspace-qualified governing reference.

## Domain invariants

- `--dir` continues to define one VCP project root.
- Unqualified Source-of-Truth references always resolve from that project root.
- Root/sibling authority is never inferred from filesystem location alone.
- `workspace:` means explicit governing authority from the enclosing Git worktree root, not generic cross-root filesystem access.
- Freshness rules do not change based on reference scope.
- Context remains bounded by declared references and the existing explicit context options.
- Verification cwd/output ownership remains project-local.

## Security and privacy

- Authentication impact: n/a — local repository tooling.
- Authorization/resource ownership: explicit workspace governing reads are limited to the enclosing Git worktree and do not expand write/output/command authority.
- Tenant isolation: n/a — workflow tooling only.
- Input/trust boundaries: Task Pack references and local Git metadata are repository-controlled input; workspace paths undergo lexical and canonical containment checks, ambient `GIT_DIR` / `GIT_WORK_TREE` / `GIT_COMMON_DIR` overrides are removed before discovering the authority-bearing worktree root, and the reserved `workspace:` qualifier is rejected before generic project-local path resolution.
- Secrets/PII/logging: Context Pack manifests expose only portable qualified paths and file contents already selected as governing context; no host absolute workspace path is emitted as source identity.
- Abuse/rate/replay considerations: one local Git root lookup per workspace-qualified readiness/context resolution; no network or provider API.
- Relevant threat IDs: n/a — local workflow boundary; traversal/symlink escape and reserved-prefix confusion are covered as deterministic negative paths.

## Failure modes and edge cases

- selected project is outside Git → workspace-qualified reference fails visibly;
- workspace path is empty → fail visibly;
- workspace path is URL-like → fail visibly;
- workspace path traverses above worktree → fail visibly;
- existing symlink/junction resolves outside worktree → fail visibly;
- ambient Git directory/worktree overrides point elsewhere → ignore them and derive scope from the selected filesystem project;
- workspace governing file is missing → readiness reports missing qualified path; context preserves legacy missing-reference behavior while readiness remains the authority gate;
- workspace governing file is `DRAFT` → plan may use it, implementation may not;
- workspace governing file is `SUPERSEDED`/`ARCHIVED` → cannot govern current execution/context;
- workspace-qualified canonical template path still contains starter signals → preserve the existing readiness warning;
- unrelated root/sibling files exist → not included unless explicitly declared;
- caller tries `--include workspace:...` → fail with the existing boundary-specific message;
- caller tries `--planned workspace:...` or `--output workspace:...` → fail before the qualifier can be interpreted as a literal project-relative path.

## Observability

Readiness identifies explicit workspace governing references with their portable qualified path. Context sections/manifests use `workspace:<path>` and the normal Context Pack byte budget, so shared authority is inspectable without leaking host-specific absolute checkout paths.

## Test plan

### Unit
- preserve project-local reference behavior;
- resolve accepted workspace-qualified source;
- reject non-Git and traversal input;
- reject the reserved workspace qualifier in generic project-local context path validation.

### Integration / contract
- nested project readiness/context loads one project-local and one workspace governing document;
- manifest keeps portable workspace identity;
- unrelated root and sibling files stay absent;
- freshness behavior matches existing project-local contract;
- workspace-qualified canonical template paths retain starter-template diagnostics;
- `--planned workspace:...` and `--output workspace:...` fail deterministically.

### E2E / regression
- full repository validation remains green;
- strict readiness/context/verification dogfood on this Task Pack remains green.

### Negative/security paths
- symlink/junction escape outside worktree is rejected;
- ambient Git root override environment cannot redirect workspace authority;
- `--include workspace:...`, `--planned workspace:...`, and `--output workspace:...` are rejected;
- stale workspace authority cannot drive implementation/review context.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive Task Pack syntax only; existing unqualified references are unchanged. Nested projects that deliberately use workspace authority now require local Git availability for those references. Literal project-local paths beginning with the reserved `workspace:` qualifier are intentionally rejected.
- Migration/backfill: none — no existing Task Pack must change unless it incorrectly used the newly reserved qualifier as an ordinary project-local path.
- Rollback or recovery: remove workspace qualification support and references; project-local baseline remains intact.

## Implementation plan

1. Add a shared explicit workspace Source-of-Truth resolver with Git-root discovery and canonical containment.
2. Wire readiness to resolve workspace-qualified governing references while preserving project-local behavior.
3. Wire context to include qualified governing sources with portable manifest identity and reject cross-root `--include` use.
4. Add nested-workspace fixtures for accepted/stale authority, bounded context, non-Git failure, traversal, and symlink/junction escape.
5. Update Source-of-Truth, Task Pack, and Context Pack contracts.
6. Reserve `workspace:` in generic project-local context path validation and add `--planned` / `--output` regressions.
7. Run static review and exact-head pre-final validation; only then finalize this Task Pack to `Done` and rerun the exact-head gate before merge.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] `workspace:` is opt-in authority, never implicit inheritance.
- [x] Existing project-local references remain backward compatible.
- [x] Workspace qualification is limited to governing Task Pack Source-of-Truth references.
- [x] Git worktree lookup occurs only when a workspace-qualified reference is present.
- [x] Ambient Git root overrides cannot redirect the discovered authority root.
- [x] Traversal and canonical symlink/junction escape are rejected.
- [x] Freshness semantics are scope-independent.
- [x] Starter-template readiness diagnostics remain scope-independent.
- [x] Context manifest identity is portable and bounded.
- [x] Root and sibling files are not auto-included.
- [ ] Verification cwd/output and context extra/planned/output paths remain project-local with the reserved qualifier rejected.
- [ ] Executable exact-head pre-final validation confirms the corrective implementation.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| DEFECT | must fix in this task | Initial focused test assertions guessed non-canonical freshness wording for workspace errors. | Assertions were aligned to the existing `Source-of-Truth authority is ...` contract instead of changing stable diagnostics. | none known |
| DEFECT | must fix in this task | Initial readiness wiring looked up starter-template signals using the qualified `workspace:` display path, which bypassed the existing canonical-path template warning. | Template-signal lookup now strips only the `workspace:` scope qualifier while diagnostics keep the qualified identity; regression added. | none known |
| DEFECT | must fix in this task | While fixing workspace template lookup, the template-warning branch briefly dropped the stable `Source of truth` finding title. | Restored the existing finding shape and asserted the title in the workspace-template regression. | none known |
| DEFECT | must fix in this task | Ambient `GIT_DIR`, `GIT_WORK_TREE`, or `GIT_COMMON_DIR` could redirect `git rev-parse --show-toplevel`, making process environment rather than the selected filesystem project determine cross-root read authority. | Workspace root discovery removes those overrides before invoking Git; regression proves unrelated ambient Git state cannot redirect the root. | Other standard Git discovery configuration still follows Git semantics; project containment and canonical candidate containment remain mandatory. |
| DEFECT | must fix in this task | CodeRabbit's PR #61 review body identified that `safePath` did not reserve the `workspace:` qualifier for generic project-local paths. On POSIX, `--planned workspace:...` / `--output workspace:...` could be interpreted as literal paths inside the selected project, contradicting AC-008. Because the finding was outside the diff it produced no inline thread and was missed by the no-unresolved-thread merge check. | Corrective branch reserves `workspace:` centrally in project-local context path validation and adds focused planned/output regressions. PR #61's passing final gate is retained only as superseded historical completion evidence until this corrective head is validated. | Merge-gate review must inspect review submissions/body findings as well as inline threads. |
| NO ACTION | n/a | A general workspace-qualified `--include` mechanism would make a narrow governing-authority feature into a broad cross-root path escape hatch. | Kept `--include` project-local and added an explicit refusal for `workspace:` qualification. | Callers must declare shared governing authority in the Task Pack, by design. |
| NO ACTION | n/a | Automatic parent/sibling Source-of-Truth lookup could reduce typing but would make authority depend on repository layout and hidden search order. | No implicit inheritance/search added; workspace authority is explicit per reference. | Richer monorepo conformance remains a later Stage 5 slice. |

## Finalization

- [ ] Acceptance criteria satisfied on the corrective exact pre-final head.
- [ ] Corrective pre-final implementation/review gate passed before finalization edit.
- [x] Independent review evidence is current.
- [ ] Completion report reflects accepted corrective executable evidence.
- [ ] Top-level `Status` changed to `Done`.

After the corrective finalization edit, rerun the same required exact-head gate. Do not edit this Task Pack solely to record that rerun; merge only if it passes.

## Completion report

- What changed and why: explicit shared-worktree governing Source-of-Truth qualification remains the intended feature; the corrective branch additionally reserves `workspace:` across project-local context paths so the qualifier cannot be reinterpreted as a literal planned/output path.
- Superseded completion evidence: PR #61's requested pre-final gate passed on `85d6bfa96aa3eead0068e066c0ffd733619592f8`; its final exact-head gate passed on `0eb9d587ee42b7db3cecc6799f660085abc3941a`; PR #61 then merged as `7f31c5e3ef32b89b5dd39f76343c86617bbc2b93`. A later audit confirmed the unaddressed AC-008 review-body defect, so those passes are historical evidence and do not establish current task completion.
- Current accepted verification: pending corrective exact-head pre-final executable validation.
- Independent review evidence updated: yes; the post-merge review-body finding and why it escaped the thread-only check are durable above.
- Migration/operational impact: additive Task Pack syntax; no migration. Workspace-qualified references require an accessible local Git worktree, and the qualifier is reserved from ordinary project-local context paths.
- Remaining risks/limitations: no automatic package discovery, sibling imports, workspace scheduler, root/package precedence engine, provider CI integration, or full realistic monorepo conformance yet.
