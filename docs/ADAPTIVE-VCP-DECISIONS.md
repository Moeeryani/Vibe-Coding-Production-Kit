# Adaptive VCP — Canonical decision register (PROPOSED)

**Status: DRAFT / ALL DECISIONS PROPOSED.** Baseline: `8ccb276545fdb3cc301ce7ce324812eb4c314586` (VCP 0.9.3).

This file records questions and proposed recommendations, **not** maintainer acceptance. Stage12 product-code work is not authorized by this document. Any decision becomes accepted only with explicit maintainer acknowledgement, owner, UTC date, selected alternative, documented rationale, affected S/T/roadmap/task locations and proving fixtures.

## Normative register rules

- IDs `D-01` through `D-12` are stable and must never be reassigned.
- For every newly accepted correction, record each affected file/section and tests. A correction is complete only after all anchors are updated.
- Existing S Appendix Z and T Appendix Z are historical and **need not have identical rows**. CI should check canonical decision references/coverage rather than historical row equality.
- D-01 is an explicit **NO-GO** for enabling v1→v2 migration until a real released-v0.9.3 cross-platform safety mechanism is proven.
- D-07–D-10 may be decided at their dependent phase; they do not block preparatory Stage12 documentation work.

## Decisions

| ID | Status | Topic | Deadline | Affected anchors | Proposed outcome | Required evidence |
|---|---|---|---|---|---|---|
| D-01 | **PROPOSED** | Old 0.9.3 mutation fence | Before any managed schema-v2 write | S §3.5; T §4.8 | UNRESOLVED: directory sentinel POC vs backup-only risk reduction vs deferred migration | Real published 0.9.3 update/manage/rollback/init POSIX+Windows, concurrent and crash fixtures; zero user-edit loss |
| D-02 | **PROPOSED** | Doctor --strict scope | Before Stage12 Doctor implementation | S §3.11; T §7.4 | Recommend applicable install-health WARN/FAIL only; governance informational | Synthetic brownfield-minimal/legacy-full strict and nonstrict exit matrix |
| D-03 | **PROPOSED** | Untrusted symlink policy | Before new project path helper | T §7.2; T §9.4A | Recommend no-follow and refuse in-root symlink without explicit purpose-specific exception | Read/write paths, escapes and Windows junction tests |
| D-04 | **PROPOSED** | Init action vocabulary and JSON | Before public planner | S §3.7; T §4.5 | Recommend CLAIM, update ADOPT unchanged, planVersion=1, skippedPaths separate | Content-free zero-write JSON conformance and unknown-version rejection |
| D-05 | **PROPOSED** | Markdown managed-section grammar | Before section-ownership writes | S §3.5; T §5.2–5.3 | Recommend exact markers, [a-z0-9-]{1,64}, outside bytes immutable | Malformed/fenced/duplicate markers, Unicode BOM mixed-line-ending fixtures |
| D-06 | **PROPOSED** | Canonical decisions and amendments | Before corrected S/T marked accepted | S Appendix Z; T Appendix Z | Recommend one canonical register; do not demand historical Z-row equality | Reference coverage CI for accepted IDs and exact affected locations |
| D-07 | **PROPOSED** | packageDependencyExists semantics | Before Phase5 | S §6.5; T §9.4 | No false equivalence to jsonFieldEquals; require expressibility matrix | Dotted keys, aliases, presence vs value semantics |
| D-08 | **PROPOSED** | lockfileExists semantics | Before Phase5 | S §6.5; T §9.4 | Recommend exact enumerated names if included | Bounded and path-safe lockfile fixtures |
| D-09 | **PROPOSED** | Workflow-level downgrade | Before Phase7 | S §8.5B; T §12.3B | Recommend remove; close and recreate | Task transition graph and history tests |
| D-10 | **PROPOSED** | L0 policy storage | Before Phase7 | S §8.5; T §12.3 | Recommend project-owned .vcp/policy/l0.md | No implicit state-driven L0 policy |
| D-11 | **PROPOSED** | First-adoption recovery verb | Before Stage13 apply | S §3.11; T §4.8 | Recommend vcp recover; optional init --recover alias | Kill-9 and true-absence recovery; foreign lock evidence |
| D-12 | **PROPOSED** | Destructive command gate scope | Before Stage12 command-authority work | S §3.6; T §4.12 | Re-screen migrated commands AND enforce exact VCP verify --run bytes; do not claim external prompt interception | Grandfathered command, manual Task Pack edit, --yes refusal and receipt freshness |

## Decision record on acceptance

```yaml
id: D-XX
status: ACCEPTED # or DEFERRED / REJECTED
owner: <maintainer>
decidedAtUtc: <timestamp>
chosenOption: <exact behavioral contract>
rejectedAlternatives: [<option and rationale>]
affectedLocations: [<exact S/T/roadmap/task anchors>]
provingTests: [<test IDs and recorded evidence>]
implementationPR: <URL or pending>
```

## D-01 compatibility safeguard

A normal persistent `.vcp/update.lock` file is **not** a fence against the published 0.9.3 binary: old stale-lock reaping can remove it, and old rollback can restore a backup without first reading the live schema. A post-migration newest-v2-backup policy bounds schema regression only under assumptions, **not** arbitrary content mutation or lost later edits. A directory sentinel remains a candidate, not a proved fix. Old/new concurrency, transaction-journal precedence, crash transition, and Windows behavior are mandatory evidence. If proof fails, defer live managed v2 migration and mark the slice BLOCKED.
