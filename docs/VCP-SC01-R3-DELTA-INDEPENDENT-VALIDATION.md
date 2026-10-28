# VCP SC-01 R-3 — Independent Delta G3 Validation Assignment

**Purpose:** Independently challenge the locally frozen one-commit R-3 correction. This document is a TEST ASSIGNMENT, not a passing test result, risk acceptance or activation approval.
**Owner rulings:** [SC-01 ruling](VCP-SC01-OWNER-RULING-20261028.md) | [Master completion plan](VCP-FINAL-COMPLETION-MASTER-PLAN.md) | [Issue #109](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/109)

## Candidate and previous acceptance

- Parent frozen G3-PASS candidate: `57e4df465f6a56da91717b1ffb0474dae8b91e65`, tree `bd066b01ada5855bfd19e3f11fbae302f9d55a12`.
- New corrective candidate: `98c63ad827290f3da0862b6e291535cee0869849`, tree `c704aedc4bfb442d5776f170ae5806463f586cb8`, branch `fix/sc01-final-vcp-check`; ONE local commit from exact parent; never pushed.
- Expected 3 changed files: `lib/scoped-task-create.mjs` (+22), `test/scoped-task-create-r3.test.mjs` (new, 314 lines), `docs/CLI.md` (one new sentence).
- Location: `~/workspace/vcp-sc01-r3/clone`; previous frozen parent in `~/workspace/vcp-sc01-impl/clone`. These paths are locations reported by builder, not verified from this chat environment.
- The former independent G3 PASS applies **only to `57e4df4`**. The new exact HEAD has no acceptance yet.

## Role and first actions

You are an INDEPENDENT native Linux security validation engineer. No subagents, no Docker, no GitHub Actions. **No repairs to frozen code or tests.** No push, merge, PR, tag, release, npm publish or activation.
1. Obtain the actual local Git objects via a fresh disposable `git clone --no-local` from the builder's verified checkout. Do not substitute GitHub `main` or the uploaded report text for source bytes. Remove remotes in your disposable clone and verify commit, tree, parent, clean status, `git fsck --strict`.
2. Read completely `VCP-SC01-R3-CORRECTIVE-BUILD-REPORT.md`, `VCP-SC01-R3-INDEPENDENT-DELTA-VALIDATION-HANDOFF.md`, `VCP-SC01-G3-INDEPENDENT-ACCEPTANCE.md`, the owner's ruling and previous SC-01 threat/acceptance documents.
3. Compare the complete source diff against `57e4df4` and the 13 protected files against `d4fb3ce`; verify `lib/task.mjs` and all gates identical, with D-01 DEFERRED and G-FENCE NO-GO.

## Independent challenge matrix

### DG3-1 — Placement, timing and exact phase

Inspect the actual `await lstatOrNull(root/.vcp)` ordering after parent preparation and immediately before exclusive `open`. Build YOUR OWN probe, not the builder's 8 tests. Distinguish lstat scheduling/completion, check-to-open micro-window, and the possibility of concurrent renames after return. Do not claim an `await`-then-open check is atomic.
Test all `.vcp` shapes (directory, file, symlink to live/managed target, dangling symlink), planted before classification, between checks, during parent creation, immediately after parents exist and after the final check if a safely controlled interleaving is possible. Independently verify `.vcp` bytes, links and targets remain unchanged.

### DG3-2 — Critical test gap: PRE-EXISTING PARENTS

Builder R3-04 ran 20 trials but planted `.vcp` before classification on all 20; it therefore did NOT exercise the final pre-open check with pre-existing parents. Construct a genuinely late, controlled probe with existing `docs/tasks/` and independently prove: the check can refuse as `pre-mutation`; no cleanup ledger is incorrectly attached; `createTaskPack` falls through ONLY to the immutable gated helper and refuses (no second successful write). If deterministic timing is unavailable without changing production code, state INCONCLUSIVE, do not count R3-04 as coverage.

### DG3-3 — PARENTS CREATED / POST-MUTATION

Plant `.vcp` when the operation itself created one/both parents. Require `E_SCOPED_MANAGED_STATE_PRESENT` with `scopedPhase='post-mutation'`, original error preserved, correct `scopedCleanup`, no `scopedFile`, cleanup only of owned empty parents, no G-FENCE fallback and no retry. Verify no mutation of `.vcp` or unrelated files, including under concurrent sibling creation/removal. Check non-ENOENT filesystem errors are fail-closed and not mislabeled.

### DG3-4 — Unaddressed state-marker race

The owner approved ONLY a final `.vcp` re-check. Independently plant root `manifest.json`, `update.lock`, `transaction.json` and `.vcp-adoption-*` / recovery markers after their EARLY checks, both with existing and newly created parents. Record whether a Task Pack is created despite the new marker, its exact bytes, the immutable G-FENCE behavior on subsequent calls, and the worst demonstrated impact. Explicitly judge whether this observation requires a NEW owner risk decision before activation. Never silently expand scope or consider these states covered by the `.vcp` check.

### DG3-5 — Parent-swap residual and state purity

Re-run narrowly scoped source/dynamic probes to ensure R-1 is unchanged and post-sync detection remains intact. Owner only accepted R-1 for LIMITED LOCAL EVALUATION, not production; do not infer permission to write to managed roots or outside the selected root. No writes to `.vcp`, AGENTS.md, Git metadata or unrelated state. No execution of project commands.

### DG3-6 — Full exact-head regression and docs audit

Run all new R3-01..R3-08, previous 44 SC-01 blocks, syntax, Stage 12/13/14 contracts, 13/13 authority probes, D-03 no-follow, Linux fence, real CLI create, and COMPLETE `npm test` on the FINAL FROZEN exact `98c63ad` checkout. This is important: the builder's full suite ran before an import-only tidy; targeted and syntax tests ran after tidy, but no full suite did. Re-establish final-HEAD evidence directly.
Builder claims 1424 total = 1360 pass / 48 fail / 16 skip, failing-name hash `e4344bf531508fcd4ce8f44897c3556b93777b1eb47994e6ea4a6e73496a4f61`. Recompute exact sorted failing-name set and compare by name. A standalone PH-06 both-won intermittent failure (observed during parent G3) is pre-existing and unresolved: report it separately, never hide it or call its absence a fix. Other inherited failures should remain unchanged.
Investigate the deliberately stale SC-01 conformance-matrix text (it still says G3 pending and R-1 pending owner disposition); flag as documentation debt to correct on an appropriate authorized branch/decision path before activation, rather than treating stale prose as accepted contract.

## Required verdict and evidence

Output a local frozen `VCP-SC01-R3-INDEPENDENT-DELTA-ACCEPTANCE.md` with:
- Verified exact SHA/tree, source diff, protected-files integrity and auth-gate status.
- Independently authored probe logic, raw outcomes, filesystem before/after identity receipts and SHA256 manifest.
- Distinct results for pre-existing-parent late planting, post-mutation planting, and late root strays/markers.
- Honest remaining final check/open race, R-1 and F-H2 boundary; any NOT_PROVEN or harness limitation.
- Full final-HEAD suite and failing-name delta, independent fault classification and documentation consistency.
- G1–G6-style verdict and explicit: `DELTA ENGINEERING ACCEPT / CONDITIONAL / REJECT`, `DELTA G3 PASS / FAIL / INCONCLUSIVE`, `READY_FOR_OWNER_ACTIVATION_REVIEW YES / NO`, `RELEASE_READINESS FAIL`.
- Precise requested owner decisions: residual R-3 micro-window, late root strays/recovery markers, any stale conformance cleanup, OD-ACT and OD-SCOPE.

## Immutable restrictions

D-01=DEFERRED; G-FENCE=NO-GO; B-2=NOT_PROVEN; FULL_TRANSACTION_CONTAINMENT=NOT_PROVEN; Windows Principal Provider=null; PRODUCTION_WRITERS DISABLED; L3 live authorization DISABLED; mandatory CI enforcement DISABLED. No SC-01 activation or canonical record creation. STOP on security regression or unprovable exact source identity. No push/merge/release.

**Begin independent DELTA security validation now; do not modify the frozen candidate.**