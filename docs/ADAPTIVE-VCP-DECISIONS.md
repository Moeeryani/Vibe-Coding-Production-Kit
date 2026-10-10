# Adaptive VCP — Canonical decision register (maintainer decisions and proposals)

**Status: maintainer selected D-02/D-03/D-04/D-05/D-06/D-12 = ACCEPTED (2026-10-10T19:02:43Z); D-01 = DEFERRED; D-07–D-11 = PROPOSED. Required-anchor coverage and implementation verification are NOT YET ACCEPTED.** Baseline: `8ccb276545fdb3cc301ce7ce324812eb4c314586` (VCP 0.9.3).

This register records the maintainer's explicit 2026-10-10 choice of D-02, D-03, D-04, D-05, D-06 and D-12 as ACCEPTED design decisions, and preserves D-01 as DEFERRED. Decision selection does **not** certify implementation, coverageReview or release readiness. The independent required-anchor inventory remains PENDING until separately reviewed. Stage12 product-code work is not automatically authorized by this document. Any decision becomes accepted only with explicit maintainer acknowledgement, owner, UTC date, selected alternative, documented rationale, affected S/T/roadmap/task locations and proving fixtures.

## Normative register rules

- IDs `D-01` through `D-12` are stable and must never be reassigned.
- For every newly accepted correction, record each affected file/section and tests. A correction is complete only after all anchors are updated.
- **D-06 (ACCEPTED DECISION; COVERAGE PENDING):** this canonical register is the authoritative status ledger, but its entries are not approvals. Before a status becomes ACCEPTED, review the independent per-ID mandatory affected-location inventory, complete actual source-document applicability (S/T/Roadmap/CLI/Task), record maintainer identity/UTC and evidence, and run the exact-final-HEAD cooperative gate. Current local receipts do not constitute protected remote merge enforcement.
- Existing S Appendix Z and T Appendix Z are historical and **need not have identical rows**. CI should check canonical decision references/coverage rather than historical row equality.
- D-01 is an explicit **NO-GO** for enabling v1→v2 migration until a real released-v0.9.3 cross-platform safety mechanism is proven.
- D-07–D-10 may be decided at their dependent phase; they do not block preparatory Stage12 documentation work.

## Decisions

| ID | Status | Topic | Deadline | Affected anchors | Proposed outcome | Required evidence |
|---|---|---|---|---|---|---|
| D-01 | **DEFERRED** | Old 0.9.3 mutation fence | Before any managed schema-v2 write | S §3.5; T §4.8; ROADMAP Stage12; CLI/UPDATES legacy warnings | **Maintainer-selected Option C: defer live managed v1→v2 migration**. No writer, rollback/recovery migration or release assertion until a separately proved and accepted old-CLI safety fence. Backup-only and lifecycle-lock separation are empirically insufficient; directory sentinel is FALSIFIED for old init when the manifest is missing (native Windows 13th scenario) | Authentic 0.9.3: Linux 7/12 and native Windows 8/13 protected user-edit losses; old init ignores sentinel when manifest absent. Windows NTFS v2 lock sync EPERM. New complete fence, Windows durability, concurrency, crash and old/new proof remain required |
| D-02 | **ACCEPTED** | Doctor --strict scope | Before Stage12 Doctor implementation | S §3.11; T §7.4 | Recommend applicable install-health WARN/FAIL only; governance informational | Synthetic brownfield-minimal/legacy-full strict and nonstrict exit matrix |
| D-03 | **ACCEPTED** | Untrusted symlink policy | Before new project path helper | S §5.4; T §7.2/§9.4A; ROADMAP #73; CLI/UPDATES path warnings | **Maintainer confirmed the design choice**: no-follow for untrusted selected-root paths, including in-root symlinks and native junctions; only separately reviewed purpose-specific exceptions. Canonical acceptance and product implementation remain PENDING complete coverage-map review and native-platform tests | Record of design choice in docs/decisions/D-03-policy-selection.md; exact selected-root read/write/managed-state conformance, native Windows junction tests and TOCTOU risk audit required before security claims |
| D-04 | **ACCEPTED** | Init action vocabulary and JSON | Before public planner | S §3.7; T §4.5 | Recommend CLAIM, update ADOPT unchanged, planVersion=1, skippedPaths separate | Content-free zero-write JSON conformance and unknown-version rejection |
| D-05 | **ACCEPTED** | Markdown managed-section grammar | Before section-ownership writes | S §3.5; T §5.2–5.3 | Recommend exact markers, [a-z0-9-]{1,64}, outside bytes immutable | Malformed/fenced/duplicate markers, Unicode BOM mixed-line-ending fixtures |
| D-06 | **ACCEPTED** | Canonical decisions and amendments | Before corrected S/T marked accepted | S Appendix Z; T Appendix Z | Recommend one canonical register; historical Z tables need not match; require independent per-ID required-anchor coverage and cooperative exact-HEAD local receipts while Actions unavailable (NOT trusted merge protection) | Independently reviewed per-ID S/T/Roadmap/CLI/Task coverage map, negative omitted-anchor test, exact-final-HEAD raw receipts + maintainer review; Phase8 enforcement remains BLOCKED |
| D-07 | **PROPOSED** | packageDependencyExists semantics | Before Phase5 | S §6.5; T §9.4 | No false equivalence to jsonFieldEquals; require expressibility matrix | Dotted keys, aliases, presence vs value semantics |
| D-08 | **PROPOSED** | lockfileExists semantics | Before Phase5 | S §6.5; T §9.4 | Recommend exact enumerated names if included | Bounded and path-safe lockfile fixtures |
| D-09 | **PROPOSED** | Workflow-level downgrade | Before Phase7 | S §8.5B; T §12.3B | Recommend remove; close and recreate | Task transition graph and history tests |
| D-10 | **PROPOSED** | L0 policy storage | Before Phase7 | S §8.5; T §12.3 | Recommend project-owned .vcp/policy/l0.md | No implicit state-driven L0 policy |
| D-11 | **PROPOSED** | First-adoption recovery verb | Before Stage13 apply | S §3.11; T §4.8 | Recommend vcp recover; optional init --recover alias | Kill-9 and true-absence recovery; foreign lock evidence |
| D-12 | **ACCEPTED** | Destructive command gate scope | Before Stage12 command-authority work | S §3.6; T §4.12 | Re-screen migrated commands AND enforce exact VCP verify --run bytes; do not claim external prompt interception | Grandfathered command, manual Task Pack edit, --yes refusal and receipt freshness |

## Decision record on acceptance

```yaml
id: D-XX
status: ACCEPTED # or DEFERRED / REJECTED
owner: <maintainer>
decidedAtUtc: <timestamp>
approvalEvidence: <explicit human sign-off reference>
chosenOption: <exact behavioral contract>
rejectedAlternatives: [{option: <rejected choice>, reason: <rationale>}]
affectedLocations: [<exact S/T/roadmap/task anchors>]
provingTests: [<test IDs and recorded evidence>]
implementationPR: <URL or pending>
```

## D-01 — maintainer-selected Option C: deferred managed schema-v2 migration

The actual published v0.9.3 Linux POC in #89 observed **7/12 unsafe mutations**; newest-v2 backups erased user changes after backup, and an independent `lifecycle.lock` did not prevent the legacy CLI from mutating. Therefore **G-FENCE = NO-GO and live managed schema-v2 migration is BLOCKED NOW**. The recommended option is **C: defer**; no schema-v2 write, migrator, automatic restore or release claim may rely on a directory sentinel merely blocking three isolated Linux cases. Native Windows, old init against absent manifest with directory sentinel, atomic conversion, old/new concurrency and crash recovery are unverified.

**Maintainer decision recorded:** Option C (defer), owner `Moeeryani` (authenticated repository maintainer), approval conveyed in the project conversation at `2026-10-09T01:25:54Z`; structured record `docs/decisions/D-01.json`. No cross-platform safety proof or migration authorization is implied. Reopen only after documented D-01 fence evidence and an additional explicit maintainer decision. D-03 is now an ACCEPTED design decision along with D-02/D-04/D-05/D-06/D-12; independent anchor coverage and runtime proof remain PENDING.

## D-01 compatibility safeguard

A normal persistent `.vcp/update.lock` file is **not** a fence against the published 0.9.3 binary: old stale-lock reaping can remove it, and old rollback can restore a backup without first reading the live schema. A post-migration newest-v2-backup policy bounds schema regression only under assumptions, **not** arbitrary content mutation or lost later edits. Native Windows has disproved the directory sentinel as a universal fence for manifest-absent old init. Old/new concurrency, transaction-journal precedence, crash transition, and Windows behavior are mandatory evidence. If proof fails, defer live managed v2 migration and mark the slice BLOCKED.

## 2026-10-10 superseding D-01 evidence and proposed Stage12 scope

The authenticated published-0.9.3 native Windows evidence is now on
`evidence/stage12-d01-windows-native-20261009` at
`9711013177900b4834906069491e5a1c6b2f8f45`: 8 protected
user-edit loss witnesses among 13 scenarios, including old `init --force`
overwriting project files after deleting the manifest with a directory
sentinel intact. The earlier hypothesis that a directory sentinel might
cover every old entrypoint has been falsified. Also, NTFS directory sync
reported EPERM for the current v2 lock protocol. D-01 remains DEFERRED;
no migration/recovery writer activation is authorized.

A separate review-only proposal at
`docs/STAGE12-SAFE-SUBSET-ACCEPTANCE-PROPOSAL.md` defines a potential
**read-only Stage12 foundation**, deliberately excluding the full Stage12
managed v2 lifecycle and release. It is not accepted yet. D-02, D-03,
D-04, D-05, D-06 and D-12 remain PROPOSED and need their own semantic
maintainer sign-off and required-anchor coverage review. A successful
test suite cannot change those decision states.

## 2026-10-10 maintainer ratification — full original Stage12

At **2026-10-10T19:02:43Z**, the maintainer explicitly approved
**D-02, D-03, D-04, D-05, D-06, D-12** with the respective behavior
specified in `docs/decisions/stage12-p0-review-packet-20261010.md`
and chose **the entire original Stage12 scope**, not the proposed
read-only subset. This authorization permits engineering and review;
it does **not** approve a release or certify that code already conforms.
Structured records `docs/decisions/D-02.json` through D-06 and D-12
preserve the exact decision source, rejected alternatives and
independent affected-anchor inventory. `coverageReview: PENDING`
remains in `docs/decisions/required-anchors.json` until an actual
independent maintainer review of normative applicability.

**D-01 remains DEFERRED; G-FENCE remains NO-GO.**
Work on an alternative old-binary compatibility fence, native Windows
durability and versioned recovery remains **in Stage12 scope**.
No v2 mutation can be enabled until independent real-package
Windows/Linux atomic/concurrency/crash proof and a separate explicit
D-01 GO decision. The alternative subset acceptance proposal is
**REJECTED AS THE STAGE12 DELIVERY TARGET**; it remains a historical
draft only and cannot be used to close AC-004/005/006.
