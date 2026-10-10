# Adaptive VCP — Stage12.0 contract-reconciliation errata (review proposal)

**Status:** DRAFT / NOT APPROVED. **Pinned baseline:** `8ccb276545fdb3cc301ce7ce324812eb4c314586`. **Scope:** planning documentation only. This record accompanies the proposed canonical decision register and Stage12 Task Pack; it is not a substitute for eventually editing S/T at all affected normative anchors.

## Five resolved *internal plan-reference* mistakes

1. **Decision D-07 vs D-08:** `packageDependencyExists` belongs to **D-07**; D-08 exclusively decides `lockfileExists`. Do not state that `jsonFieldEquals` is semantically equivalent to dependency-key presence without an expressibility matrix. Phase5 remains the decision deadline.
2. **Decision D-02 vs D-04:** Doctor install-health/`--strict` belongs to **D-02**; D-04 exclusively decides Init-plan action vocabulary and JSON. Proposed Doctor truth table: non-strict FAIL only on applicable installation FAIL; strict FAIL on applicable installation FAIL or WARN. Governance stays a separate informational section, and starter paths intentionally excluded by the chosen `assetSet` never create an installation WARN/FAIL. This is still a proposed rule pending acceptance.
3. **Canonical amendment registry vs historical equality:** S Appendix Z and T Appendix Z may contain legitimately different historical rows. Do not assert `S Z.1 == T Z.1`. Instead record one accepted canonical decision with stable ID, exact affected anchors, statuses and tests, and validate all required S/T references through CI. `docs/ADAPTIVE-VCP-DECISIONS.md` is proposed as that source after review.
4. **Old CLI `rollback` compatibility:** Until D-01 is proven, label it **UNSUPPORTED; SAFETY OUTCOME UNPROVEN**. Newest schema-v2 backup may still cause old rollback to overwrite later user edits and is NOT a zero-write mutation fence. Directory sentinel remains a hypothesis requiring real published-v0.9.3 POSIX + Windows evidence, lock conversion, stale-journal and concurrency checks. No live managed v2 migration until a proven barrier is accepted.
5. **Execution evidence count:** The former heading `14-field receipt` named **16 field groups**, excluding envelope version. Freeze `executionEvidenceVersion:1` plus 16 groups: testId, gitSha, checkoutState, packageIdentity, platform, toolVersions, invocation, utcTiming, exitCode, testCounts, manifestHashes, changedPaths, observation, logArtifact, runnerIdentity, caveats. Keep a versioned JSON schema, mandatory nullable hash for true manifest absence, skip reasons and platform scope.

## Normative Stage12.0 stop gates

- **G-ENTRY:** latest SHA and clean checkout, exact-head baseline validate + pack-check with raw logs, separately labeled platform evidence; cannot backfill the historical Stage11 Windows rerun.
- **G-DOCS:** C-01 through C-14 adopted and applied at every actual S/T/roadmap/CLI anchor; D-01–D-06 and D-12 accepted before their dependent code decisions. Future-phase D-07–D-10 stay proposed until needed.
- **G-FENCE:** published 0.9.3 `update`, `manage`, `rollback`, `init` treated as adversarial actors; prove desired zero-mutation or record an explicitly accepted reduced contract. Backups alone do not meet zero-write.
- **G-ST12:** Stage12 never mutates unmanaged EXISTING roots, and its exit is **planning + managed lifecycle** only. Adoption Checkpoint A follows Stage13 actual apply.

## Repo status / expected reviewer action

This is a **draft PR start**, not completion of G-ENTRY, G-DOCS or G-FENCE. Review the five internal errata and the canonical register, then approve a bounded separate S/T contract-edit sequence. Do not merge this PR or enable any product-code migration simply because these draft files exist.

## 2026-10-10 superseding compatibility observation

The prior directory-sentinel discussion was a test hypothesis and
must not be treated as still viable by default. Authenticated native
Windows old-CLI 0.9.3 ignored its update.lock directory on
`init --force` when manifest was missing and overwrote AGENTS.md.
The writer-side `syncContainingDirectory` implementation failed
with EPERM on NTFS. D-01 remains DEFERRED and G-FENCE NO-GO;
read-only foundation scope is proposed separately from full Stage12.
