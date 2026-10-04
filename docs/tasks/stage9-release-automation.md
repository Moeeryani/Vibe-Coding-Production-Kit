# Task — Implement Stage 9 release automation evidence gate

Status: Review
Slug: `stage9-release-automation`

## Outcome

VCP can produce deterministic exact-revision release-candidate evidence for repeatable packaging/install/update mechanics while preserving actual publication and immutable tag creation as HUMAN DECISION actions.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Release automation contract | `docs/RELEASE-AUTOMATION.md` |
| Release checklist | `docs/delivery/RELEASE-CHECKLIST.md` |
| Candidate release notes | `docs/releases/v0.9.3.md` |
| Issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/76 |

## Requirement restatement

Complete Stage 9 by automating release-candidate mechanics and retained evidence without automating irreversible publication, tag creation/movement, GitHub release creation, or deployment.

## Acceptance criteria

- [ ] AC-001 — versioned release-evidence schema and human/JSON reports exist.
- [ ] AC-002 — package.json, package-lock, changelog, candidate notes, and candidate version must agree.
- [ ] AC-003 — `[Unreleased]` contains no release bullets for a prepared candidate.
- [ ] AC-004 — migration path from retained previous release to candidate is explicit and deterministic.
- [ ] AC-005 — retained v0.9.2 annotated tag object and peeled commit are checked without mutation.
- [ ] AC-006 — missing candidate tag is HUMAN_DECISION; existing mismatched candidate tag fails and is never moved.
- [ ] AC-007 — package inspection validates candidate name/version and required runtime surface.
- [ ] AC-008 — `npm publish --dry-run` executes only with explicit `--run`.
- [ ] AC-009 — local candidate tarball install proves both CLI aliases and candidate version.
- [ ] AC-010 — local lifecycle smoke starts from retained v0.9.2 source/tag, previews/applies 0.9.3 offline, creates a backup, stays conflict-free, passes Doctor/framework validation, and becomes idempotent.
- [ ] AC-011 — optional evidence output is preflighted before commands, root-bounded, symlink-safe, and overwrite-protected.
- [ ] AC-012 — evidence binds exact clean Git revision and does not retain command stdout/stderr.
- [ ] AC-013 — actual npm publish/tag/release/deployment actions are absent and remain HUMAN DECISION.
- [ ] AC-014 — negative tests independently turn version/changelog/migration/tag/package/install/update/dirty/output-preflight lanes red.
- [ ] AC-015 — v0.9.3 candidate metadata and release documentation are coherent without claiming publication.
- [ ] AC-016 — Roadmap/README/CLI documentation records Stage 9 completion and boundaries.

## Scope

### In scope
- `vcp release-check <version>` preview/run;
- repo-specific release policy;
- exact Git provenance/tag identity checks;
- local pack/publish-dry-run/install/update mechanics;
- migration continuity;
- optional retained JSON evidence;
- v0.9.3 candidate metadata;
- deterministic tests and negative lanes.

### Out of scope
- actual npm publication;
- tag creation/movement/deletion;
- GitHub release creation;
- deployment;
- registry post-publish smoke;
- Linux/hosted compatibility proof.

## Affected boundaries

- Modules/files likely affected: release-check module, CLI, package/version metadata, migrations, changelog/release docs, release policy, tests, framework validation, roadmap/readmes.
- Public API/contract impact: additive `vcp release-check`; existing commands remain unchanged.
- Data/schema/migration impact: adds release evidence schema v1 and explicit `0.9.2 -> 0.9.3` lifecycle migration.
- External integration impact: `npm publish --dry-run` may exercise npm tooling but never publishes; install/update smoke uses local tarballs and Git history, not the package registry.

## Domain invariants

- Proposal/evidence is not approval.
- Green release mechanics do not authorize publication.
- Existing immutable tags are never moved/recreated.
- Missing evidence fails where mechanically applicable.
- Candidate evidence is revision-bound.
- Command stdout/stderr is not persisted.
- Historical v0.9.2 identity is immutable.

## Security and privacy

- Authentication impact: release-check never needs or stores registry credentials for publication; actual publish is outside the command.
- Authorization/resource ownership: command only reads the selected release repo and creates temporary local worktrees/consumers; optional evidence output is project-local.
- Tenant isolation: n/a — release-check is a local single-repository maintainer command and has no tenant model or shared tenant-owned state.
- Input/trust boundaries: policy/changelog/package metadata/Git history/npm JSON are validated; output paths reject traversal/symlinks.
- Secrets/PII/logging: no command stdout/stderr is retained in evidence.
- Abuse/rate/replay considerations: reruns are deterministic evidence collection; no remote rate-controlled operation is performed except npm dry-run tooling, and candidate tag mismatch fails rather than being repaired.
- Relevant threat IDs: n/a — no accepted project-specific threat ID governs this local release-candidate gate and none should be invented.

## Failure modes and edge cases

- dirty candidate worktree;
- package/lock/changelog version mismatch;
- release notes missing HUMAN DECISION marker;
- migration chain missing/overshooting;
- previous immutable tag identity mismatch;
- candidate tag existing at wrong commit;
- package surface missing required files;
- npm pack/publish-dry-run failure;
- local install alias/version failure;
- lifecycle conflict/apply/Doctor/framework/idempotence failure;
- output traversal/symlink/existing-file conflict;
- temp worktree cleanup after failures.

## Observability

Human output shows each PASS/FAIL/PLANNED/HUMAN_DECISION item. JSON evidence stores exact revision, historical/candidate tag state, package artifact metadata, migration/update summary, check counts, and decision boundary without command logs.

## Test plan

### Unit
- policy/changelog/version/migration checks;
- candidate/previous tag identity;
- output preflight;
- preview safety and HUMAN_DECISION states.

### Integration / contract
- npm pack surface and local candidate tarball install;
- previous-tag local pack/init;
- candidate dry-run/apply/Doctor/framework/idempotence update smoke;
- retained evidence schema and no stdout/stderr fields.

### E2E / regression
- exact-head `vcp release-check 0.9.3 --run` dogfood from a fresh clone proves package inspection, publish dry-run, both installed CLI aliases, previous-release local pack/init, offline 0.9.2→0.9.3 update, Doctor/framework validation, and idempotence;
- regression coverage keeps earlier version/changelog/tag/output-path/provider-boundary/current-version failures red-capable.

### Negative/security paths
- dirty tree;
- mismatched version/changelog;
- immutable tag mismatch;
- missing migration;
- package required-file failure;
- alias/version install failure;
- output traversal/symlink/overwrite.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: no deployment is performed; the additive CLI and 0.9.3 lifecycle migration must preserve existing managed-project behavior, while Linux/hosted compatibility remains the separate non-blocking follow-up #69.
- Migration/backfill: fresh 0.9.2 managed project is the executable upgrade dogfood source.
- Rollback or recovery: release-check never changes candidate repository source/tag/publication state; temporary worktrees/consumers are removed. Lifecycle smoke uses VCP's normal backup/rollback-protected update path and requires a backup before a successful apply.

## Implementation plan

1. Prepare coherent 0.9.3 candidate metadata and migration.
2. Add repo-specific immutable release policy.
3. Implement preview-safe static release contracts and exact Git/tag provenance.
4. Add explicit-run package/publish-dry-run/install/update mechanics.
5. Add retained evidence output and CLI.
6. Add negative tests and exact v0.9.2 identity regressions.
7. Dogfood release-check on 0.9.3 candidate.
8. Run exact-head review/gate/finalization protocol.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/release-check.test.mjs test/release-check-cli.test.mjs test/migrations-0.9.3.test.mjs`
- full gate: `npm run validate`, `npm run pack:check`, and explicit `vcp release-check 0.9.3 --run`

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| TEST / AUTHORING DEFECT | corrected after red pre-final gate | Fresh-clone gate on `92ccb3551e5722a43a6e9a887ebd24a31c4a2dca` proved the Stage 9 mechanics themselves green (focused 68/68, Doctor 0 fail, full validation 337/337, package check pass, release-check run success with 0.9.2→0.9.3 lifecycle and HUMAN_DECISION publication/tag boundary) but failed `git diff --check` on one trailing-space Roadmap line and strict readiness on three missing Task Pack labels. VCP verify correctly refused because readiness had 3 failures. | Remove the Roadmap trailing whitespace; add exact readiness labels for tenant isolation, abuse/rate/replay, E2E/regression, deployment/compatibility, and rollback/recovery with reasoned n/a/bounded statements. | Same fresh-clone exact-head gate must rerun; prior green mechanics are superseded as merge evidence by the red overall gate. |
| DEFECT | must fix before corrected gate | CodeRabbit review of `92ccb355…` found Windows `cmd.exe /s /c` quoting could break execution of installed CLI aliases when the temporary path contains spaces. | Build one quoted command string with an outer quote pair for `/s` stripping while preserving the quoted alias path; reject unsafe quote/newline input. | Windows fresh-clone gate must exercise the real install/lifecycle alias smoke. |
| DEFECT | corrected after second red pre-final gate | Fresh-clone Windows gate on `a746b493080a5a5178278d56050e9ec3058b547b` passed focused 69/69, strict readiness 15/0/0, task verification UNIT 29/29, full validation 338/338, package check, immutable v0.9.2 identity, and cleanup; the real release-check dogfood alone failed install-smoke and lifecycle-smoke when TEMP contained spaces. Maintainer isolated the root cause: the generated `""<spaced alias>.cmd" --version"` command succeeds in raw CMD but normal Node `execFile(cmd.exe, argv)` re-quotes the /c payload and corrupts it. | Preserve the raw /c command only for this cmd.exe call via `windowsVerbatimArguments: true`, and add an executable Windows regression that creates a .cmd file under a spaced temp directory and runs it through the exact helper. | The `a746b493…` gate is superseded. Corrected fresh-clone gate must rerun with spaced TEMP/TMP. |
| TEST DEFECT | must fix before corrected gate | CodeRabbit found the two public CLI preview tests used the live repository as `--dir`, making them dependent on live dirty/tag state rather than the CLI contract. | Run both output tests against isolated clean temporary Git fixtures with retained `v0.9.2` annotated tag identity and no candidate tag. | Prevents future `v0.9.3` tag creation or unrelated working-tree changes from changing test meaning. |
| NO ACTION | n/a | Awaiting complete Stage 9 changed-surface review and exact-head executable validation. | Keep in Review. | Actual publication/tag creation remain intentionally outside automated evidence. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread + top-level-comment audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
