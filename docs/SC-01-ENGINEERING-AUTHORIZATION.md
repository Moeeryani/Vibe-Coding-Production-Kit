# SC-01 — Engineering Authorization (Local Implementation and Validation Only)

**This artifact records an owner authorization for local engineering
implementation and validation ONLY. It is NOT a canonical decision
record, NOT an activation approval, and NOT a D-01 GO.**

- Baseline: branch `feat/vcp-release-readiness-baseline`, HEAD
  `d4fb3ceec55113b56aa0cfa7e4885ac00d8a1e17`, tree
  `e7119fa2c778110d2475aaeb7ad7f2275d7a4bcd`.
- Design package: `VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md`,
  `VCP-OD1-THREAT-MODEL.md`, `VCP-OD1-SECURITY-ACCEPTANCE-MATRIX.md`,
  `VCP-OD1-OWNER-DECISION-PROPOSAL.md` (workspace root, and design
  branch `design/od1-scoped-task-pack-creation`, commit `68a5da5`).
- Owner approval received 2026-10-28: conditional SC-01 ruling,
  approved for **local engineering implementation only**, with the
  three additional requirements in §3 below.
- Canonical activation decision: **PENDING.** No `SC-01` entry has
  been added to the decision register (`docs/ADAPTIVE-VCP-DECISIONS.md`)
  or the required-anchors inventory (`docs/decisions/required-anchors.json`),
  because the contract checker requires register rows to be exactly
  D-01–D-12 and rejects unknown decision IDs. The canonical
  `docs/decisions/SC-01.json` record must not be created with a status
  that any tooling could interpret as activation. The draft record in
  §4 is a proposal only.

## 1. Authorized scope

APPROVED FOR LOCAL IMPLEMENTATION AND VALIDATION ONLY.

Implement a narrow Linux-only Task Pack creation path: exclusive
creation of exactly `docs/tasks/<slug>.md`, only in eligible NEW or
EXISTING projects with no `.vcp` entry, manifest, recovery marker,
or conflicting lock, following the approved design's E1–E10
eligibility predicate, with eligibility re-validated inside the
write operation.

## 2. Explicitly NOT authorized

- D-01 GO. D-01 remains DEFERRED (`docs/decisions/D-01.json`
  byte-identical).
- Opening G-FENCE. G-FENCE remains NO-GO.
- Managed schema-v2 writes, production writers, migration or
  recovery-apply.
- Windows activation. `WINDOWS_PRINCIPAL_PROVIDER` remains null.
- Old/new CLI coexistence.
- Live L3 authorization. L3 authorization remains DISABLED.
- Mandatory CI enforcement. Mandatory CI enforcement remains DISABLED.
- Merge, push, release, tag, or npm publish.
- Activation of the scoped path in any built, distributed, or
  released artifact. Activation requires a separate owner approval
  (§5).

## 3. Additional owner requirements (part of the approval)

1. The final parent-swap residual must be evaluated and presented
   for owner acceptance before activation; it does not prevent
   local construction.
2. Fall-through to G-FENCE is permitted only for pre-mutation
   eligibility refusals. Post-mutation failures retain their
   original error and evidence; no second creation attempt.
3. Independent G3 adversarial validation occurs after construction
   and before activation. No G3 PASS may be claimed from
   builder-owned tests.

## 4. Draft canonical record (PROPOSAL ONLY — not a decision record)

The following draft is the proposed content of a future canonical
`docs/decisions/SC-01.json`, to be created only if and when the
owner grants activation approval. It must not be treated as
approved, and its status value must not be recorded as an
unconditional approval while activation is pending.

```json
{
  "id": "SC-01",
  "status": "APPROVED_SCOPED_RULING",
  "scope": "Task Pack creation only; non-managed projects only; Linux only",
  "doesNotChange": ["D-01 (DEFERRED)", "G-FENCE (NO-GO)", "B-2 (NOT_PROVEN)",
    "PRODUCTION_WRITERS (DISABLED)", "L3 authorization (DISABLED)",
    "Mandatory CI enforcement (DISABLED)"],
  "operation": "Exclusive creation of docs/tasks/<slug>.md via a caller-scoped helper; see VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md §2",
  "predicate": "NEW/EXISTING classification, no .vcp entry, no manifest, no lock, no recovery marker; re-validated inside the write operation",
  "platform": "linux only; other platforms refuse via the existing durability preflight",
  "requiresBeforeActivation": ["Acceptance gates G1-G6", "Independent adversarial validation", "Fence suite unchanged (42 F1 tests still refuse)", "Parent-swap residual disposition"],
  "explicitNonAuthorizations": ["D-01 GO", "Windows activation", "Old/new CLI coexistence", "Release/tag/publish", "Any managed write"],
  "reviewTriggers": ["Predicate bypass demonstrated", "Windows activation proposed", "D-01 GO decided"],
  "owner": "Moeeryani",
  "decidedAtUtc": "<to be filled at activation approval>",
  "approvalChannel": "<to be filled at activation approval>"
}
```

## 5. Activation conditions (all must hold; none is met by construction alone)

- G1–G6 acceptance (Security Acceptance Matrix §3).
- Independent G3 adversarial validation completed and reported.
- Explicit owner disposition of the final parent-swap risk.
- Separate owner activation approval, recorded in the canonical
  decision record.

Until all four hold, the scoped path must remain unactivated: it
may exist on a local implementation branch only, must not be
merged, published, or released, and must not be presented as
available product behavior.
