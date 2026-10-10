# Stage 12 P0 — maintainer review-ready decision and scope packet

**Prepared:** 2026-10-10. **Status:** PROPOSED / NOT ACCEPTED.
**Source of authority:** `docs/ADAPTIVE-VCP-DECISIONS.md`,
`docs/decisions/required-anchors.json` and original Stage12 Task Pack.
Passing tests, agent commits and this packet cannot record human approval.

## Requested Stage 12 scope choice (new acceptance authority)

- [ ] **Accept** `STAGE12_READ_ONLY_FOUNDATION` as a bounded interim
  engineering milestone, leaving original Stage12 AC-004, AC-005, AC-006
  and all v2 writers / recovery apply / Stage13 unmanaged apply BLOCKED.
- [ ] **Reject** a narrowed scope and keep full Stage12 `Plan/Blocked`
  until a new old-CLI compatibility fence is independently proven.

The proposed scope and exact exclusions are in
`docs/STAGE12-SAFE-SUBSET-ACCEPTANCE-PROPOSAL.md`.
Default without a marked decision: **NOT ACCEPTED**.

## D-02 — Doctor install-health versus governance

**Proposed:** non-strict fails on applicable install-health FAIL;
strict fails on applicable install-health FAIL or WARN. Governance
findings remain separately visible and cannot be mislabeled as missing
minimal-install assets. Keep install lifecycle-state failures observable
and separately classify safety-critical operation refusal.
**Alternative rejected only if accepted:** mixing governance warnings
with installation conformance so minimal adoption falsely fails strict.
**Evidence required:** minimal/legacy synthetic check matrix, doctor
CLI strict/non-strict cases and complete S/T/DOCTOR/CLI anchor review.
**Decision status:** PROPOSED. Implementation review still required;
do not claim current `doctorExitCode` is D-02 ratified.

## D-03 — selected-root path trust

**Proposed:** deny untrusted symlink, Windows junction and reparse traversal
by default, including links back into the root, with purpose-aware
read-existing, write-new and managed-state intent. Root ancestors and
existing parents must be no-follow; no race-free guarantee from lstat.
**Alternatives:** permissive in-root links or prefix-only confinement
are not selected. Maintainer design preference recorded earlier;
structured acceptance and native conformance are still pending.
**Evidence required:** linked root, parent, final leaf, external link,
native Windows junction and bytes-preserved refusals.
**Decision status:** PROPOSED.

## D-04 — init planner JSON contract

**Proposed:** `planVersion:1`, `planKind:init`, `CLAIM` as proposed
new-file action, `skippedPaths` separate, no embedded file contents,
stable deterministic ordering, `executionAuthorized:false` for every
Stage12 unmanaged EXISTING apply and NEW gated write.
**Alternative:** silently adopting existing content or shipping opaque
executable plans is rejected. **Evidence:** repeated plan equivalence,
nonmutating BOM/CRLF file preservation, polyglot/intent conflicts.
**Decision status:** PROPOSED.

## D-05 — managed Markdown section authority

**Proposed:** exact `VCP:BEGIN/END` markers with bounded `a-z0-9-`
section identifiers. Existing unclaimed markers are conflicts; only
manifest-owned exact baseline may authorize edits to the delimited
section, with BOM, outside bytes and mixed line endings preserved.
**Alternative:** visible markers alone grant ownership is rejected.
**Evidence:** duplicate/malformed/fenced marker negative fixtures,
CRLF/BOM/mixed-endings byte snapshots and ownership integrity.
**Decision status:** PROPOSED.

## D-06 — canonical decisions and coverage

**Proposed:** one canonical ID ledger plus independent reviewed
required-anchor inventory; exact-final-HEAD cooperative receipt with
full raw logs and maintainer review. No inference of protected CI.
**Alternative:** relying on a token-only smoke test, self-declared
affectedLocations subset or green local hook as remote protection
is rejected. **Evidence:** C-01–C-14 semantic S/T reconciliation,
omitted required anchor negatives, exact-HEAD receipts and coverage
owner review. `required-anchors.json` `coverageReview` remains PENDING.
**Decision status:** PROPOSED.

## D-12 — verification command authority

**Proposed:** every VCP-controlled `verify --run` re-reads selected
AGENTS.md authority and validates exact task command identity;
conflicting duplicated keys block; destructive migrated commands
require current matching fingerprint human receipt. `--yes` never
grants a HUMAN DECISION. External shell commands outside VCP are
not intercepted and must not be claimed covered.
**Evidence:** tampered task text, stale digest, duplicated
commands, explicitly grandfathered receipts and execution-time check.
**Decision status:** PROPOSED.

## D-01 — pre-existing deferred decision, not a new acceptance request

Native Windows 8/13 user-edit loss evidence and the lock-blind old
init counterexample are recorded in `docs/decisions/D-01.json`.
**Keep `DEFERRED` / `G-FENCE NO-GO` regardless of other decisions.**

## Signoff template — leave blank until real maintainer review

| Field | Required value |
|---|---|
| Reviewing maintainer | PENDING |
| UTC decision timestamp | PENDING |
| Scope option accepted/rejected | PENDING |
| D-02 / D-03 / D-04 / D-05 / D-06 / D-12 decisions | PENDING per ID |
| Reviewed required S/T/Roadmap/CLI/Task anchors | PENDING |
| Exact-final-head evidence IDs | PENDING until later test phase |
| Acceptance boundary | NEVER full v2 managed writer with D-01 NO-GO |

To ratify, update the canonical ledger and structured D-ID records
and ensure each mandatory anchor has independently reviewed coverage.
Do not backdate a decision or auto-populate signature fields from
this suggested packet.
