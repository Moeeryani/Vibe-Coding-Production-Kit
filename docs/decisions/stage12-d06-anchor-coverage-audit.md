# Independent D-06 accepted-anchor coverage audit (pre-ratification)

**Status: FAIL-CLOSED / COVERAGE NOT APPROVED.** This is an independent documentation review of the draft `docs/decisions/required-anchors.json` published in PR #90 at `9efc501ac1ef98d5b22cee4efb0fba1bb7b0755d`, and the D-01/D-03/D-06 ratification packet in this PR. It is **not** a maintainer approval, a Stage12 G-DOCS PASS, or a code-test receipt.

## Additional D-06 authority audit — current draft branch, not maintainer approval

The current #92 branch adds **two mandatory D-06 governance locations** to the original remediation inventory: `docs/ADAPTIVE-VCP-DECISIONS.md` `## Normative register rules` and `docs/ROADMAP.md` `### Stage 12 — Safe Adoption Planning`. The registry now has **31 draft anchors** (D-01: 6, D-02: 3, D-03: 7, D-04: 3, D-05: 3, D-06: 6, D-12: 3). A separate targeted unit test prevents either D-06 authority location from silently disappearing.

**Fresh independent text/source check for this branch:** 31/31 map entries have the exact declared heading, substantive token and literal decision ID. All seven coverageReview values are `PENDING`, and all canonical D-01..D-12 statuses are `PROPOSED`. This is **not** a Node/npm execution result, approved semantic completeness, or a signed maintainer decision.

### Source-surface applicability dispositions (proposals for maintainer review)

| Decision | Source surface / why it applies | Remaining action |
|---|---|---|
| D-01 | S/T, Stage12 Task, ROADMAP, CLI and UPDATES all have direct managed-migration/legacy-CLI safety implications | Six mandatory anchors mapped; native Windows, combined legacy-init, atomic transition and old/new concurrency still unverified; no migration GO |
| D-02 | `docs/DOCTOR.md` and CLI Doctor paragraph describe the **released v0.9.3** general WARN/FAIL semantics | **Affected in future Stage12 Doctor implementation**: propose conditional update to these docs alongside D-02 adoption, not rewrite current published behavior now; DOCTOR/CLI location inventory incomplete for an ACCEPTED future D-02 |
| D-03 | ROADMAP #73 TOCTOU, CLI Safety behavior and UPDATES Safety boundaries govern symlink/path trust | Seven mapped anchors; confirm native Windows junction semantics and any approved purpose-specific exceptions |
| D-04 | CLI `## Initialize once, then update` describes **current v0.9.3** init and `--dry-run` flags, while S/T Stage12 planner adds CLAIM/plan JSON semantics | CLI and other consumer docs require scoped update when the *public new planner* is authorized; currently D-04 pending |
| D-05 | UPDATES `### Current ownership boundary` explicitly says Markdown-section ownership is NOT current v0.9 behavior | Ensure the new D-05 section-ownership contract is documented at actual implementation/enablement time; current release statement must remain truthful |
| D-06 | Canonical register, S/T Appendix Z, Stage12 Task, local-gates policy and ROADMAP explicitly carry decision/governance authority | **Six mandatory anchors mapped.** CLI and UPDATES are command/lifecycle user documentation rather than governance authority: presently `NOT_APPLICABLE` to D-06 *unless* they later claim Stage12 merge protection or accepted registry status; still requires maintainer completeness review |
| D-12 | CLI `verify` and Task verification/readiness docs describe **current** execution capability; future accepted D-12 must constrain actual `verify --run` execution | Review CLI Verify/Task authority locations and add affected mandatory anchors when D-12 contract is ratified; no false universal protection claim |

These dispositions are **review candidates**, not assertions that D-02/D-04/D-05/D-12 are mechanically complete. A future maintainer decision must specify actual affected anchors and reconcile selected semantics before any map's `coverageReview` switches to APPROVED.

## Follow-up remediation in this draft branch — static consistency verified, approval remains pending

The findings below describe the **original 23-anchor snapshot on #90** and explain why this work was necessary. Since that audit, the #92 draft branch has integrated the exact #90 local-gate code without touching its validated branch HEAD, and proposed these fixes:

- All **10 missing literal D-IDs** were added to the named normative S/T, Stage12 Task Pack and Local Gates sections. No decision status was changed.
- The independent required-location inventory now contains **29 anchors** (the original 23 plus D-01 ROADMAP/CLI/UPDATES and D-03 ROADMAP/CLI/UPDATES).
- The D-03, D-04, D-05 and D-12 Task Pack map strings were synchronized with the now explicit `AC-XXX (D-XX PROPOSED)` contractual references.
- The released-v0.9.3 user documentation differentiates current schema-v1 behavior from proposed schema-v2 safety; old-CLI loss-of-post-backup-edits remains **NO-GO**.
- The Stage12 test suite now includes mapped-heading/required-text/decision-ID checks and independently enumerates the three mandatory user-facing source files for D-01 and D-03.

**Independent static GitHub-source check on the combined draft branch: 29/29 required sections contain their exact declared substantive snippet and corresponding D-ID; no failures.** This is a **textual inventory-consistency result**, *not* evidence that all affected documents have been discovered, that semantic requirements are correct, or that any Node/npm suite has run on the new #92 HEAD. All seven `coverageReview` values remain **PENDING**. The PR will need a fresh exact-HEAD external local-gate receipt; #90's Linux result for `9efc501a...` does not validate this modified branch.

**Remaining before any D-06 acceptance:** exhaustive human applicability decisions for D-02/04/05/06/12 against DOCTOR.md, CLI, ROADMAP, UPDATES and other source-of-truth documents; independently reviewed chosen-option clauses and owner/UTC; raw evidence inspection; complete guard rerun; and a recorded maintainer decision. In particular, no `APPROVED` map marker or `ACCEPTED` status is justified by 29/29 static coverage alone.

## Findings tied to actual source content

1. **The 23 listed section/snippet pairs exist** in the #90 source branch and are scoped under the exact heading. They represent seven Stage12-relevant decision IDs (D-01..D-06 and D-12). All seven `coverageReview` values correctly remain `PENDING`; other D-07..D-11 must fail closed if prematurely set ACCEPTED.
2. **10 of the 23 mapped sections currently omit the literal decision ID they would need for an accepted-record check.** D-03: T §9.4A, Stage12 AC-010; D-04: T `### init-plan`, Stage12 AC-015; D-05: Stage12 AC-007; D-06: S Appendix Z.1, T Appendix Z.1, Stage12 `## Source of truth`, local-gates `## Scope of local static guard`; D-12: Stage12 AC-011. `verifyAcceptedRecord` requires BOTH the accepted ID and substantive clause in each stated section. Thus merely changing a decision status to ACCEPTED and marking the map reviewed **will still fail closed** unless these locations are explicitly reconciled.
3. **Roadmap and release-CLI documentation were absent from the independent map.** The previous `docs/ROADMAP.md` Stage12 paragraph incorrectly said already-managed repositories “may still migrate” without the D-01 G-FENCE condition. This draft PR now fixes that wording in ROADMAP, explicitly records the published-v0.9.3 Linux NO-GO evidence, and distinguishes future conditional managed migration. `docs/CLI.md` and `docs/UPDATES.md` now have version-scoped D-01 warnings about post-backup edit erasure, ignored lifecycle.lock, and schema2 migration NOT enabled. These are **proposed draft documentation changes** on this PR branch only; they do not modify the released binary.
4. **Map expansion is required before acceptance.** At a minimum, D-01's independent required-location inventory must add ROADMAP `### Stage 12 — Safe Adoption Planning`, CLI `### Stage12 schema-v2 migration is not enabled (D-01 G-FENCE NO-GO)`, and UPDATES `### Legacy-release rollback is not a future schema-v2 fence (D-01)`. Then review whether D-03's ROADMAP TOCTOU and CLI/UPDATES path-safety sections, plus D-04/D-05/D-12 user-facing contracts, are genuinely affected and require extra locations. D-06 policy itself may be N/A for user-facing CLI syntax, but an explicit reasoned *applicability* disposition must be recorded—not assumed.
5. **No independent cross-platform execution proof.** PR #90 has an external local-agent comment reporting PASS on exact head `9efc501a`: 419 tests (418 pass, one skip), clean before/after and `LOCAL_GATE_PASS_NOT_REMOTE_ENFORCEMENT`. The comment does not expose its `/tmp/pr90run2` receipt or raw stdout/stderr as downloadable artifacts; a separate actual maintainer inspection of those original files remains required. Native Windows is UNVERIFIED and Phase8 trusted merge protection is unimplemented.

## Coverage follow-through (not an automatic status change)

| ID | Existing map locations | Additional review before `coverageReview: APPROVED` |
|---|---|---|
| D-01 | S old-CLI compatibility; T 0.9.3 fence; Stage12 AC-004 | **Add ROADMAP/CLI/UPDATES exact D-01 warnings from this draft**, assess Stage12 S/T order and recovery sections, native Windows + atomic/concurrent/old-init test gaps |
| D-02 | S Doctor minimum; T Doctor minimum; Stage12 AC-013 | Review DOCTOR.md and CLI Doctor truth-table applicability; preserve current-v0.9.3 vs proposed distinction |
| D-03 | S core path trust; T prompt/path and detector DSL; Stage12 AC-010 | Add/justify ROADMAP #73 TOCTOU, CLI/UPDATES path safety; add literal D-03 association in T §9.4A / Task |
| D-04 | S init semantics; T init-plan; Stage12 AC-015 | Assess CLI init examples and Stage13 scope; add D-04 ID in mapped T/Task sections |
| D-05 | S section model; T ownership model; Stage12 AC-007 | Review UPDATES current-v1 ownership warning; add D-05 ID in Task; preserve byte-level invariants |
| D-06 | S/T historical appendices; Task source of truth; local-gates scope | Add explicit D-06 associations at all four existing anchors; confirm S/T/Roadmap/CLI/Task completeness and maintain separate historical Z tables |
| D-12 | S/T re-screening; Stage12 AC-011 | Assess CLI Verify command-authority surfaces; add D-12 ID in Task |

**Technical limitation:** `checkRequiredCoverage` compares required section paths and exact `requiredText` strings against the accepted record. This prevents **omitting known** required anchors but does not independently prove that the inventory itself is complete or that its clause is the correct chosen behavior. The human review must provide that authority; the `APPROVED` flag is editable repository content, not a cryptographic signer.

## Recommendation to maintainer

- **D-06:** conceptually endorse the *proposal* for a canonical ledger plus cooperative local receipt and reviewed independent required-anchor inventory, **but do not mark ACCEPTED** until the above source-coverage fixes, maintainer sign-off, complete current-head raw receipt inspection, and acceptance-record negative tests.
- **D-03:** proposed no-follow policy including in-root symlinks is coherent; keep PROPOSED until the actual owner selects it and signs the exact purpose-specific exception policy. Native Windows safety stays UNVERIFIED.
- **D-01:** retain **operational NO-GO** and recommend explicit `DEFERRED` Option C only after actual owner signs and records re-entry evidence conditions. Nothing here permits v1→v2 migration.

**Merge order remains conditional:** #86 → #87 → #90 with individually checked exact HEAD and explicit maintainer review. #92 is a separate draft change stacked on #90 and must be reintegrated/rechecked after #90 changes. #91 is read-only preflight only. **No merges, release or schema-v2 writes authorized by this report.**
