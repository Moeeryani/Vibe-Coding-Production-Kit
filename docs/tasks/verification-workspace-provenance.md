# Task — Bind verification evidence to workspace/project scope and Git revision

Status: Done
Slug: `verification-workspace-provenance`

## Outcome

A fresh developer or agent can tell which VCP project inside which repository workspace was mechanically verified, at which Git revision/worktree state, using the same evidence contract locally or in CI without expanding the selected project root's authority.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Verification evidence contract | `docs/VERIFICATION-EVIDENCE.md` |
| Task Pack project-root contract | `docs/TASK-PACKS.md` |

## Requirement restatement

Keep `--dir` as the VCP project root, Task Pack/Source-of-Truth namespace, command cwd, and evidence-output safety root. When that project is inside a Git worktree, use the enclosing worktree only as provenance: record a slash-portable workspace-relative project path, exact Git HEAD when available, and pre-verification dirty state. Keep verification functional outside Git and keep existing evidence fields available to older consumers. Automatic provenance inspection must not silently widen repository authority or execute repository-controlled Git integrations merely to decide dirty/clean state.

## Acceptance criteria

- [x] AC-001 — Verification evidence adds explicit project/workspace scope without removing existing `task`, `target`, readiness, command, result, timing, or output fields.
- [x] AC-002 — A nested VCP project records a slash-portable `scope.projectPath` relative to the enclosing Git worktree.
- [x] AC-003 — Git-backed evidence records exact `revision.headSha` when available and `revision.dirty` before verification commands execute.
- [x] AC-004 — A non-Git project still verifies successfully and reports project-only scope with `revision: null` rather than invented Git provenance.
- [x] AC-005 — Verification commands continue to execute with the selected project root as cwd.
- [x] AC-006 — Evidence output remains constrained to the selected project root; workspace detection does not redirect output to the Git root.
- [x] AC-007 — Workspace discovery does not widen Source-of-Truth or other project-local path authority.
- [x] AC-008 — Persisted schema-v2 evidence preserves the new scope/revision metadata; historical schema-v1 evidence requires no migration or rewrite.
- [x] AC-009 — Documentation defines project root vs workspace root, safe automatic Git provenance inspection, and a provider-agnostic local/CI comparison contract.
- [x] AC-010 — Focused tests, strict readiness/context/verification, evidence provenance checks, and full repository validation passed on corrected pre-final exact head `c4b45d0db74a5e56551336d7a7658aaed8e98420` after all late review fixes.

## Scope

### In scope
- additive verification evidence schema v2;
- selected project root vs enclosing Git worktree semantics;
- portable workspace-relative project identity;
- Git HEAD and dirty-state provenance;
- safe automatic Git metadata inspection in preview and run modes;
- non-Git fallback behavior;
- nested-package and submodule verification fixtures;
- local/CI evidence compatibility documentation.

### Out of scope
- automatic workspace/package discovery;
- cross-project task scheduling or dependency graph execution;
- implicit root-level Source-of-Truth inheritance into nested projects;
- CI provider APIs, remote workflow fetching, hosted runner orchestration, or run-ID persistence;
- automatic package-check selection from a monorepo root manifest;
- changing repository-controlled verification commands;
- making dirty worktrees an automatic verification failure;
- executing repository Git filters merely to collect provenance.

## Affected boundaries

- Modules/files likely affected: `lib/verify.mjs`, `test/verification-scope.test.mjs`, `docs/VERIFICATION-EVIDENCE.md`, `docs/tasks/verification-workspace-provenance.md`.
- Public API/contract impact: no new CLI flags; verification JSON advances to schema version 2 with additive `scope` and `revision` fields while retaining existing fields. Git provenance collection now has explicit safe-failure semantics for active external filters.
- Data/schema/migration impact: new verification evidence files use schema v2; historical schema-v1 evidence remains valid and is not backfilled.
- External integration impact: local `git` executable is consulted for provenance when available; verification remains usable outside Git.

## Domain invariants

- `--dir` defines one VCP project root and remains the command cwd and path-safety boundary.
- The enclosing Git worktree is workspace provenance only; it does not authorize cross-root reads or writes.
- Git metadata never proves correctness; command results remain mechanical verification evidence.
- A dirty worktree is recorded, not silently treated as clean and not automatically approved.
- Automatic provenance collection must not run active repository-configured external clean/process filters.
- Repository settings must not hide dirty submodule state from provenance.
- Non-Git verification remains supported.
- Existing evidence consumers retain the legacy absolute `target` field.
- Portable local/CI comparison uses `scope.projectPath` + Git revision, not host-specific checkout paths.

## Security and privacy

- Authentication impact: n/a — local workflow tooling only.
- Authorization/resource ownership: project-root path ownership remains unchanged; workspace discovery cannot widen it.
- Tenant isolation: n/a — no application tenant behavior changes.
- Input/trust boundaries: Git metadata is invoked without a shell; provenance commands force the `C` locale, disable `core.fsmonitor`, disable optional Git locks/index refresh writes, canonicalize filesystem paths for containment, override submodule-ignore settings, and refuse dirty-state inspection when tracked content activates a configured external Git clean/process filter. Implementation-unready `--run` requests are refused before provenance processes; repository-controlled verification commands still execute only after explicit `--run`.
- Secrets/PII/logging: raw command stdout/stderr remain unpersisted by default; new evidence stores only project path relative to workspace, Git SHA, and dirty boolean in addition to existing metadata.
- Abuse/rate/replay considerations: Git metadata reads are bounded; verification timeout/sequential-stop behavior remains unchanged.
- Relevant threat IDs: n/a — repository-local workflow tooling, with no new remote trust boundary.

## Failure modes and edge cases

- selected project is not in Git or Git is unavailable → project-only scope and `revision: null`;
- localized caller environment → Git failure classification remains deterministic via forced `C` locale;
- selected project equals Git worktree root → `scope.projectPath: "."`;
- selected project is nested → slash-portable relative path such as `packages/api`;
- selected project is reached through a filesystem symlink/junction → canonical paths determine workspace containment/projectPath while legacy `target` remains unchanged;
- Git repository has no commit yet → Git scope may have `headSha: null` rather than inventing a SHA;
- worktree contains uncommitted/untracked changes → `revision.dirty: true` without blocking verification;
- configured submodule ignore policy requests `dirty`/`all` → provenance uses explicit `--ignore-submodules=none` so dirty submodules remain visible;
- tracked content activates an external clean/process filter → fail provenance visibly before `git status` rather than executing the filter during preview;
- evidence output path attempts project escape → existing path-safety rejection remains authoritative;
- Git workspace root does not contain selected project root → fail rather than record contradictory provenance;
- worktree is detected but later Git HEAD/status metadata fails unexpectedly → fail visibly instead of silently downgrading provenance;
- absolute `target` differs between developer and CI checkout → compare portable scope/revision fields instead.

## Observability

Human-readable verification output identifies scope and Git revision/dirty state. JSON evidence records schema version, portable scope, optional revision, readiness, exact commands, results, exit/signal/timeout state, durations, and existing output metadata.

## Test plan

### Unit
- non-Git scope produces `{ kind: "project", projectPath: "." }` and `revision: null`;
- Git-root project produces `projectPath: "."` and exact clean HEAD;
- localized caller environment still handles an unborn repository deterministically.

### Integration / contract
- nested `packages/api` project command executes from that selected cwd;
- nested evidence persists `scope.projectPath: "packages/api"` plus exact Git HEAD;
- evidence file is written inside nested project `.vcp/evidence`, not at workspace root;
- symlinked/junction project selection canonicalizes only provenance identity and does not change `target`;
- dirty workspace is captured before command execution;
- dirty initialized submodule remains visible despite `.gitmodules ignore=all`.

### E2E / regression
- existing verification tests continue to pass with additive schema-v2 output;
- active external filter fixture fails safely before the filter can execute;
- full framework validation remains green.

### Negative/security paths
- project/output path authority is unchanged despite enclosing workspace discovery;
- no Git metadata is invented outside Git;
- implementation-unready `--run` remains refused before provenance processes;
- configured external fsmonitor and optional Git index-lock side effects are disabled for provenance reads;
- active external clean/process filters are refused rather than executed during automatic dirty-state inspection;
- configured submodule ignore state cannot hide dirty submodule evidence;
- absolute target path is retained for compatibility but not promoted as portable identity.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive evidence fields and schema version bump; no CLI invocation changes. Repositories whose tracked content requires an external clean/process filter may receive a visible provenance refusal rather than automatic dirty-state evidence.
- Migration/backfill: none — keep historical v1 evidence unchanged; new runs emit v2.
- Rollback or recovery: revert provenance fields/schema bump; existing command execution/readiness/path-safety behavior remains the baseline.

## Implementation plan

1. Inspect enclosing Git worktree without changing selected project ownership.
2. Add portable `scope` and optional Git `revision` to verification reports/evidence.
3. Render the new provenance in human-readable verification output.
4. Harden automatic Git provenance so locale, optional locks, symlink aliases, filters, and submodule ignore rules cannot silently weaken the evidence contract.
5. Add focused non-Git/root/nested/dirty/localized/symlink/filter/submodule fixtures including persisted nested evidence.
6. Document schema v2, project/workspace semantics, safe provenance inspection, and local/CI comparison behavior.
7. Run a corrected pre-final exact-head gate; only then finalize this Task Pack to `Done` and rerun exact-head validation before merge per #48.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Existing evidence fields remain present.
- [x] Workspace detection does not change command cwd.
- [x] Workspace detection does not change Task Pack/Source-of-Truth/output root authority.
- [x] Non-Git projects remain supported.
- [x] Dirty state is evidence rather than an inferred failure or approval.
- [x] Detected Git metadata failures cannot silently downgrade to weaker provenance.
- [x] Git provenance reads disable configured external fsmonitor behavior and optional index-lock writes.
- [x] Git failure classification is locale-stable.
- [x] Symlinked project/workspace paths use canonical provenance containment without changing the selected target.
- [x] Active external clean/process filters cannot execute during automatic dirty-state inspection.
- [x] Submodule ignore settings cannot hide dirty submodule state.
- [x] Implementation-unready `--run` refuses before provenance processes.
- [x] Provider-specific CI metadata is not required for the core evidence contract.
- [x] Historical v1 evidence is not rewritten.
- [x] Executable corrected pre-final validation confirmed behavior on exact head `c4b45d0db74a5e56551336d7a7658aaed8e98420`.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| DEFECT | must fix in this task | Initial nested fixture embedded an absolute Windows path inside `node -e`, creating platform-sensitive nested quoting/backslash behavior. | Replaced the assertion with a portable `path.basename(process.cwd()) === "api"` check while retaining the same cwd contract. | none known |
| DEFECT | must fix in this task | Initial provenance fallback caught every `git rev-parse --show-toplevel` / HEAD error, so a detected workspace could be silently misreported as project-only or unborn after an unexpected Git failure. | Fallback is limited to non-Git/missing-Git cases; once a worktree is detected, contradictory HEAD/status failures are actionable errors. | none known |
| DEFECT | must fix in this task | Automatic provenance collection used `git status` before the `--run` readiness refusal and could consult a repository-configured external fsmonitor. | Readiness refusal occurs before provenance collection for execution; metadata commands force `core.fsmonitor=false`. | none known |
| DEFECT | must fix in this task | Late review found Git error matching depended on localized stderr, so non-Git/unborn fallback could fail under non-English locales. | Provenance commands force `LC_ALL/LANG/LANGUAGE=C`; HEAD uses `--quiet` exit-code handling; localized-environment regression added. | none known |
| DEFECT | must fix in this task | Late review found `git status` could perform optional index refresh writes/locks during provenance inspection, including preview mode. | All metadata commands use Git `--no-optional-locks`; provenance remains metadata-only with no optional index writes. | none known |
| DEFECT | must fix in this task | Late review found lexical `path.resolve()` containment rejected valid symlink/junction-selected projects because Git reports a physical worktree path. | Canonicalize project/workspace with filesystem `realpath()`, use `path.relative()` containment, preserve legacy selected `target`; regression added. | none known |
| DEFECT | must fix in this task | Late security review found automatic `git status` may execute active external clean/process filters while collecting dirty state, including preview mode. | Determine filter drivers active for tracked files (including initialized submodules) without executing them; if an active driver has external `clean`/`process` config, fail provenance before status. | conservative refusal for repositories that genuinely require active external filters; documented |
| DEFECT | must fix in this task | Late review found `.gitmodules`/Git submodule ignore settings could hide a dirty submodule and falsely record `revision.dirty: false`. | Status forces `--ignore-submodules=none`; initialized submodules are recursively safety-checked; dirty-submodule regression added. | none known |
| NO ACTION | n/a | The slice deliberately does not add implicit cross-root Source-of-Truth inheritance; current project-root isolation remains deterministic. | Treat shared root/package Source-of-Truth policy as a later Stage 5 slice if concrete monorepo dogfood requires it. | Cross-project shared truth still needs an explicit future contract rather than hidden fallback. |

## Finalization

Prepared only after the corrected pre-final implementation/review gate passed.

- [x] Acceptance criteria satisfied on the corrected head.
- [x] Corrected pre-final implementation/review gate passed before this finalization edit.
- [x] Independent review evidence is current and all known late findings have source/test/documentation resolutions.
- [x] Completion report reflects the corrected accepted pre-final gate and marks earlier-head evidence superseded.
- [x] Top-level `Status` changed to `Done`.

After this finalization edit, rerun the required exact-head gate. Do not edit this Task Pack solely to record that rerun; merge only if it passes.

## Completion report

- What changed and why: added portable workspace/project and Git revision provenance to mechanical verification evidence so nested-package local/CI results can be compared without treating host-specific checkout paths as identity; late review additionally hardened automatic Git provenance against locale drift, optional writes, path aliases, external filters, and hidden dirty submodules.
- Accepted corrected pre-final verification: the maintainer reported the complete requested corrected pre-final gate passed on exact head `c4b45d0db74a5e56551336d7a7658aaed8e98420`, including diff hygiene, focused verification-scope/verify tests, repository check script, strict implementation readiness, Git-aware review context and changed-file visibility, schema-v2 scope/SHA evidence checks, both VCP verification commands, full repository validation, unchanged exact head, and a clean working tree. No test counts are inferred from that report.
- Finalization-head requirement: rerun the same required gate on this Task Pack-only finalization head before merge; do not edit the Task Pack solely to record that rerun.
- Superseded evidence: the maintainer reported the complete requested pre-final gate passed on `54dd88e26822e9e5a54669423069ad493d9079b1`, and the earlier finalization-head gate passed on `fb47b0611578f9ab2631c5a16967913d8eb817d8`; both are superseded for merge eligibility because late review findings required source changes afterward. No test counts are inferred from those reports.
- Independent review evidence updated: yes; all late findings are recorded above with bounded fixes and regression coverage, and their live review threads were resolved/outdated before this finalization edit.
- Migration/operational impact: new evidence emits schema v2; no historical evidence migration and no CLI flag change. Active external content filters may cause a visible safe provenance refusal rather than automatic dirty-state collection.
- Remaining risks/limitations: this slice does not auto-discover packages, inherit root-level Source of Truth, integrate remote CI-provider metadata, or attempt to execute repository-controlled Git filters to obtain dirty-state evidence.
