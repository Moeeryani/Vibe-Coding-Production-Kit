# Stage 12 — D-06 / D-03 / D-01 maintainer decision packet

**Status: PROPOSED FOR EXPLICIT MAINTAINER RATIFICATION. No decision ACCEPTED or DEFERRED in the canonical register by this draft PR.**

**Purpose:** Record a reviewable and specific decision choice, evidence, consequences, and the remaining conditions for Stage 12. This file is a decision *candidate*, not a substitute for maintainer identity/UTC sign-off and matched S/T/Roadmap/CLI/Task anchors. It does not authorize product writes or automatic merges.

**Scope and observed sources (current at authoring):** #86 decision register / Stage12 Task Pack; #87 S/T contracts at `8651b571bf4cb648788906eb5850bcd9a47a256a`; #90 offline-local gate at `e4006e6604aa8e01bdc4e9a535eb318f919eb949`; #89 real published-old-CLI Linux POC at `2e8e098924e0c01d7b02bf93b1c82205acb50f32`. `main` baseline `8ccb276545fdb3cc301ce7ce324812eb4c314586` (0.9.3).

## Decision D-06 — recommended SELECT: canonical register + exact-head local review (not protected CI)

**Current register status:** PROPOSED. **Suggested ratified status:** ACCEPTED *only after maintainer expressly confirms and the acceptance-record prerequisites below are met*.

**Proposed contract:**

1. `docs/ADAPTIVE-VCP-DECISIONS.md` is the **single canonical ledger** for D-01..D-12, each exactly once with immutable ID, explicit state/owner/UTC/rationale and selected alternative. S Appendix Z and T Appendix Z remain historical independent appendices; never require identical row sets.
2. A decision becomes ACCEPTED only through an explicit maintainer review and corresponding structured `docs/decisions/D-XX.json`; never automatically through a successful test, a proposed table row, assistant text, a PR comment from an executor, or a new receipt alone.
3. The accepted record includes: exact ID/status, actual approving owner, decision timestamp in UTC, exact chosen behavior and rejected options, rationale, coverage expectations, concrete tests/evidence IDs and implementation PR/phase (or explicit future-phase deferral). Mark unknown, pending or missing evidence honestly. Do not fabricate IDs, approvals or dates.
4. **Independent coverage authority:** accepted-decision validation must compare the record's claimed `affectedLocations` against an independently reviewed, *version-controlled required-anchor inventory per decision*, spanning all applicable S/T/Roadmap/CLI/Task locations. A self-declared subset is NOT enough. Require the named section and substantive chosen-contract text, not just a globally occurring keyword. Any missing required location, mismatched status, stale locator or unknown ID **fails** the guard; negative tests must omit one required location on purpose.
5. While GitHub Actions are unavailable for this account, use #90's local SHA-bound script with separate raw stdout/stderr and receipts outside the checkout, plus **independent maintainer review on the actual final HEAD**. A new commit (including an evidence-only commit) invalidates any prior 'final-head' receipt. Share the new receipt out-of-band via PR comment/immutable artifact reference to avoid infinite evidence-commit HEAD rotation. Windows tests require native Windows; Linux does not substitute.
6. A local hook is a convenience but can be bypassed. **Neither a passing receipt nor mergeable=true is remotely enforced branch protection**. Remote protected gating belongs to Phase 8 and must be recorded as UNIMPLEMENTED/BLOCKED pending a real enforcement platform.

**Coverage acceptance blockers / current state:** PR #90's 14 focused S/T token pairs (including the C-14 forbidden `A15` token) are useful regression smoke tests, but its `verifyAcceptedRecord` currently validates only the locations supplied by the prospective accepted record; a complete independently maintained per-ID required-anchor map is not yet present. #90's committed `receipt.json` pins predecessor `a865d941...`; the evidence-only commit changed #90's final HEAD to `e4006e66...`. Until the gaps are addressed and a fresh externally published final-HEAD receipt exists, **DO NOT record D-06 as ACCEPTED or claim G-DOCS mechanically complete**.

**Maintainer decision request:** Is this canonical-register + independent mandatory coverage map + cooperative local exact-HEAD review policy the accepted interim model, with trusted remote merge enforcement explicitly deferred to Phase 8? If yes, require the named coverage tests and receipts before marking it effective; otherwise document rejected alternatives.

## Decision D-03 — recommended SELECT: deny untrusted links (in-root included), purpose-aware validator

**Current register status:** PROPOSED. **Suggested ratified status:** ACCEPTED only after explicit maintainer sign-off with the specific exception policy and required evidence.

**Proposed contract:**

1. Introduce one `resolveProjectPath`-equivalent selected-root path trust primitive with distinct intents: **read existing project evidence**, **write new project file**, and **read/write managed state**. No generic prefix-string-only confinement; do not let a selected project's sibling/parent grant authority.
2. Reject absolute, drive-/UNC-based, empty/invalid, traversal and reserved-state-relative paths except explicitly authorized `.vcp` state operations. Normalize separator and Unicode/path aliases appropriately by platform without inventing authority.
3. For untrusted project metadata/evidence/prompt overrides/default project leaves, **reject symbolic links and Windows junctions/reparse points even when their targets stay inside the root** unless a purpose-specific exception is explicitly documented, reviewed and tested. Reject a link in any existing parent component. Existing legacy `access()` behavior is not authority for new capability detection.
4. Validate the explicitly selected root and each existing parent component with filesystem-aware no-follow checks; bound traversal and handle nonexistent leaves according to read-vs-create intent. Refuse escapes rather than silently resolve to sibling files. Reinspect the real target immediately before a write while the relevant lifecycle lock is held. Document remaining TOCTOU limitations; do not claim race-free writes solely from `lstat`/`realpath`.
5. Negative conformance fixtures MUST include traversal, outside-root and inside-root links, dangling links, symlinked parent directories, junctions/reparse points on **native Windows**, malformed/case-variant paths and unexpected filesystem types. Confirm every refused read or planned write preserves **protected bytes** and does not create `.vcp` state. Keep true-unavailable platform coverage UNVERIFIED.
6. This policy is a Stage12 **design choice and future implementation contract**; it must NOT be interpreted as permission to modify the existing released v0.9.3 mutators, force migration, or claim Windows security coverage before its tests run.

**Maintainer decision request:** Accept the default *no-follow including in-root symlinks* rule, with only separately justified, purpose-specific exceptions? If ratified, implement it in a distinct PR12.1a product-code change after B-05/G-DOCS/entry gates; #91 is presently characterization tests only.

## Decision D-01 — recommended SELECT: C / DEFER LIVE MANAGED SCHEMA-V2 MIGRATION

**Current canonical status:** PROPOSED (open safety decision). **Operational state right now: G-FENCE = NO-GO; Migration BLOCKED.**

**Evidence:** #89 reported running the real registry-SHA512-authenticated published npm `vibe-coding-production@0.9.3` on Linux x64 with a 12-case fixture runner, testing original commit `c89960b9ed1bc2ce17fd291019820e16caa11044`. The committed receipt reports **7 unsafe old-CLI protected-file mutations**: v1 rollback downgrade, newest-v2 backup erasing post-backup user edits, stale transaction choosing an older backup, dead-PID stale-lock reaping, separated `lifecycle.lock` ignored, aged malformed lock stale reaping, and manifest-absent `init --force` overwriting files. `directory-sentinel-rollback/update/manage` each refused mutation on isolated Linux fixtures (3/3) but do not settle adoption safety.

**Proposed decision:** Choose **C (defer)** rather than claiming any legacy CLI fence. Keep project manifests and existing installed projects at v1 for live update operations until an explicitly accepted future mechanism meets the **zero user-owned byte mutation** invariant. New read-only investigation/planning/test work may proceed subject to other decisions, but the schema-v2 writer, managed v1→v2 transaction apply, auto recovery that mutates v2, migration release claim and related feature flags stay **disabled**.

**Specifically rejected as sufficient standalone full fences by empirical Linux evidence:** newest-v2 backup preservation; separate lifecycle lock; permanent regular-file lock (stale-reaped). Do not label these 'bounded zero-write' mitigations.

**Still only a candidate:** directory sentinel at `.vcp/update.lock` because it blocked three tested published-old-CLI entrypoints in Linux fixtures. It is NOT proven for the combined **directory sentinel + absent manifest + old `init --force`**, native Windows, atomic file→directory conversion while old processes may race, old/new concurrent writers, crash/partial journal recovery, PID reuse or targeted failure injection. No new migration writer exists yet to exercise all transitions. Treat any unproven hazard as NO-GO.

**How to reopen D-01:** introduce a separately reviewable, initially **disabled** migration writer prototype; run real published-old-CLI adversarial fixtures under Linux and native Windows; prove atomic acquisition/conversion or a different complete fence across old init/update/manage/rollback including absent manifest; prove concurrent and interrupted transitions, no post-backup edits lost; submit independently reviewable raw receipts and seek a new explicit maintainer decision. Never auto-promote a passing three-case sentinel test to D-01 ACCEPTED.

**Recommended future ratified ledger status:** `DEFERRED`, with owner, UTC, observed no-go evidence, re-entry conditions and selected C recorded, **only if the maintainer explicitly chooses that ledger transition**. Until then, this packet records an operational hard-stop and recommends that ledger transition without manufacturing approval.

## Required maintainer sign-off and execution order

**No generated file in this PR is an authorized acceptance.** The reviewer should record one explicit result for each:

| Decision | Recommended recorded outcome | Must-have before acceptance/status change |
|---|---|---|
| D-06 | Accept proposed canonical+independent-anchor+local-review process | Real maintainer/UTC sign-off; required-anchor completeness guard + negative omissions; fresh external final-HEAD receipt; S/T/Roadmap/CLI/Task anchors identified |
| D-03 | Accept default no-follow path trust boundary | Real maintainer/UTC sign-off; exact exception policy; accepted S/T anchors; named POSIX/native-Windows proving fixtures scheduled or executed as appropriate |
| D-01 | Defer live v1→v2 managed migration (C) | Real maintainer/UTC sign-off; link #89 receipt; precise re-entry tests; explicit operational block; no weakened safety guarantee |

**Merge planning (NOT authorization):** #86 → #87 → #90, after independent clean exact-HEAD receipts, review and per-PR requested contract decisions. This packet is stacked on #90 to keep its change separate. #91 remains standalone read-only preflight; do not treat it as shipping live product behavior. After ratification, reopen the PR12.1a implementation readiness assessment **without enabling D-01-dependent writes**.

**Do not record all twelve IDs as ACCEPTED:** D-07..D-10 belong to later Phase5/Phase7, D-11 to Stage13. D-02/D-04/D-05/D-12 require their own milestone-appropriate explicit decisions. An absent accept/reject record does not count as a yes.
