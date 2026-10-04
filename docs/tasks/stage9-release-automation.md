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
- Input/trust boundaries: policy/changelog/package metadata/Git history/npm JSON are validated; output paths reject traversal/symlinks.
- Secrets/PII/logging: no command stdout/stderr is retained in evidence.
- Abuse/replay considerations: reruns are deterministic evidence collection; candidate tag mismatch fails rather than being repaired.
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

### Negative/security paths
- dirty tree;
- mismatched version/changelog;
- immutable tag mismatch;
- missing migration;
- package required-file failure;
- alias/version install failure;
- output traversal/symlink/overwrite.

## Rollout, migration, and recovery

- Compatibility: additive CLI plus 0.9.3 lifecycle migration.
- Migration/backfill: fresh 0.9.2 managed project is the executable upgrade dogfood source.
- Recovery: release-check never changes candidate repository source/tag/publication state; temporary worktrees/consumers are removed. Lifecycle smoke uses VCP's normal backup/rollback-protected update path.

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
| NO ACTION | n/a | Awaiting complete Stage 9 changed-surface review and exact-head executable validation. | Keep in Review. | Actual publication/tag creation remain intentionally outside automated evidence. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread + top-level-comment audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
