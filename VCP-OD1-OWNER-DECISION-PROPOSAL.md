# OD-1 Owner Decision Proposal — Scoped Task Pack Creation

**Status: PROPOSAL ONLY. No approval is recorded by this document.
The owner decides. Nothing here implements, activates, or
authorizes the exception.**

- Baseline: `d4fb3ce` / tree `e7119fa2`.
- Design: `VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md`. Threat model:
  `VCP-OD1-THREAT-MODEL.md`. Acceptance matrix:
  `VCP-OD1-SECURITY-ACCEPTANCE-MATRIX.md`.
- D-01 remains DEFERRED and G-FENCE remains NO-GO unless and
  until the owner decides otherwise in a separate, explicit
  decision. This proposal recommends Option B (below) under
  strict conditions. If the owner prefers Option C, the design
  remains a design and no code follows.

## 1. The question

Ordinary Task Pack creation (`vcp task <slug>`) is the first
productive step in the VCP workflow, and it currently refuses on
every project while D-01/G-FENCE are closed — including on plain,
never-managed projects where no managed state exists to protect.
The question is whether that one operation — exclusive creation
of a single Markdown file, `docs/tasks/<slug>.md` — can safely
operate in *non-managed* projects while the managed-migration
fence stays fully closed, or whether the universal refusal must
stand until a full D-01 GO.

## 2. Alternatives compared

### Option A — Full D-01 GO

| Dimension | Assessment |
|---|---|
| Functional benefits | Everything unblocks at once: init, update apply, schema-v2 migration, recovery-apply, production writers, Task Pack creation, Checkpoint A/D live steps, and a releasable 0.9.4. |
| Security exposure | Maximum. Reopens every path the fence closed, including the exact operations the POC proved unsafe against the published 0.9.3 CLI (silent rollback downgrade, post-backup edit erasure, stale-backup precedence, lock reaping, `init --force` clobbering). Exposure is to *installed old CLIs on user machines*, not to the new code alone. |
| Required proof | All five D-01 reopen conditions (complete compatibility fence covering all 0.9.3 entrypoints even with absent manifest; Windows NTFS-safe lifecycle-directory durability protocol; atomic transition/lock ownership + concurrent old/new writer + crash/partial-journal recovery proofs on Linux *and* native Windows; byte-for-byte retention of post-backup user changes + legacy-rollback containment; new independent exact-head receipts) + explicit maintainer approval. None is in hand. |
| Implementation cost / complexity | Highest: fence design + proofs + Windows acceptance environment + principal provider + durability rig + independent validation campaigns. Months-scale, multi-campaign work. |
| Interaction with previous D-01 findings | Directly re-litigates them: the POC verdict (NO-GO) must be *disproven by new evidence*, not outvoted. The directory-sentinel counterexample and the lock-separation falsification stand until fenced by proof. |
| Residual risks | Old/new coexistence risk remains even after GO (published 0.9.3 is immutable and hazardous); requires ongoing old-CLI containment strategy. |
| Effect on the 42 fenced tests | All 42 must be re-decided: their expectations change from refusal to success, and the fence evidence base is rebuilt from new proofs. Highest regression risk to the safety case. |
| Effect on release readiness | The only option that unblocks release *as a managed product*. Still FAIL until the proofs exist; GO without them would be a false release. |

### Option B — Narrowly scoped non-managed Task Pack creation exception (RECOMMENDED, conditional)

| Dimension | Assessment |
|---|---|
| Functional benefits | Unblocks the first productive workflow step on plain projects: users can create Task Packs, run readiness/verify/context flows against hand-maintained projects, and evaluate the tool — without any managed operation. Checkpoint B read-only work and Checkpoint D scripted flows gain a real (if partial) path. Does not unblock init, migration, update, recovery, or release. |
| Security exposure | Bounded and named: one new write primitive, one file type, one path, one predicate, Linux only. Exposure is misclassification (a managed project read as eligible), namespace swaps in a micro-window, and scope creep. No managed state is created, read-for-writing, or modified; no lock, manifest, backup, or `AGENTS.md` is touched. Old-CLI exposure is limited to a Markdown file the old CLI ignores (see Design §4). |
| Required proof | Predicate correctness + caller-scope proof + the 49-case acceptance matrix (Linux) + independent adversarial validation (G3) + decision record + doc updates. No Windows proof (Windows refuses). No D-01 reopen condition is claimed satisfied. |
| Implementation cost / complexity | Small: one new module (~200 lines), one call-site hunk, one fixture helper, ~49 tests, one decision record. No dependency, schema, migration, or CLI surface change. Reviewable in one focused pass. |
| Interaction with previous D-01 findings | Consistent with them: the POC harm requires managed state; the scoped path creates none and does not touch the fence. The B-3 source fix (new CLI `init --force` safety) is orthogonal and untouched. The design explicitly does not authorize old/new coexistence. |
| Residual risks | R-1 (micro-window parent swap, detected-not-prevented), R-2 (empty-dir clutter), R-3 (late `.vcp` appearance undetected), R-4 (partial file on crash), R-5 (scope creep — the largest long-term risk, mitigated by decision-record language, §4). All are bounded, documented, and gated. |
| Effect on the 42 fenced tests | **Zero.** Every F1 fixture is a MANAGED (seeded v1) project, so every F1 test keeps refusing with `E_G_FENCE_NO_GO`. Verified from the seeder (unconditional `.vcp/manifest.json` write) — see Design §1.9. The fence suite remains a valid regression net; no F1 expectation changes. |
| Effect on release readiness | RELEASE_READINESS stays FAIL (49 failures remain; checkpoints unperformed; D-01 closed). Option B improves *evaluability*, not releasability. It must not be presented as release progress beyond that. |

### Option C — Universal G-FENCE refusal (status quo)

| Dimension | Assessment |
|---|---|
| Functional benefits | None beyond the current state. `vcp task` remains unusable on every project; evaluation requires hand-written task files or fixtures. |
| Security exposure | None added. The fence evidence base is untouched and the POC risk stays fully contained. |
| Required proof | None. |
| Implementation cost / complexity | Zero. |
| Interaction with previous D-01 findings | Fully consistent; the safest reading of the POC verdict. |
| Residual risks | Opportunity/adoption risk: the tool cannot be evaluated through its primary workflow, which starves Checkpoints A/D of the evidence D-01 GO itself needs. Users work around the fence with hand-written files, which is unmeasured and unaudited. (This is a product risk, not a safety argument for B — it does not make B safe, only worth deciding.) |
| Effect on the 42 fenced tests | Zero. |
| Effect on release readiness | FAIL, unchanged. |

## 3. Recommendation

**Recommend Option B, conditional on all of the following:**

1. **Linux-only v1.** Activation on Windows (or any non-Linux
   platform) is refused by the existing durability preflight
   and requires a separate Windows-native proof campaign and a
   new decision. No allow-list change without that proof.
2. **Exact scope.** Only the operation, predicate, path, and
   platform in the approved draft decision language (§4). Any
   widening — other file types, managed projects, other
   commands, Windows-by-analogy — needs a new decision.
3. **Independent validation before activation.** Acceptance
   gates G1–G6 (Matrix §3) all pass, including adversarial
   validation by an agent other than the implementer. Any
   predicate bypass is a stop condition (R-STOP-1).
4. **Fence suite intact.** The 42 F1 tests and gate tests are
   unchanged in outcome; the diff contains no change to any
   gated, authority, path, inspection, lock, writer, migration,
   or recovery file.
5. **Decision record first.** `SC-01` is recorded with owner
   approval *before* the implementation lands, and D-01.json
   stays byte-identical.
6. **Honest user messaging.** Docs state the Linux-only scope,
   the partial-file-on-crash behavior, and that old/new CLI
   coexistence is not authorized and old 0.9.3 lifecycle
   operations remain hazardous.

If any condition fails, the recommendation reverts to Option C:
the design stays a design, and no scoped code is kept on a shared
branch without a new decision.

**What this recommendation is not:** it is not a D-01 GO, not a
release GO, not a Windows finding, not a containment proof, and
not a judgment that the scoped path is "safe" in any absolute
sense. It is a judgment that the bounded risk, with the stated
gates, is proportionate to unblocking evaluation on plain
projects while the fence stands.

## 4. Draft decision language (for the owner to approve, amend, or reject)

The following is draft text. It records a **scoped ruling**,
distinct from D-01. D-01's status, rationale, and reopen
conditions are unchanged by it. If approved, it is recorded as a
new decision record (`docs/decisions/SC-01.json`, draft content
below) — D-01.json itself is not edited.

> **SC-01 — Scoped ruling: Task Pack creation in non-managed projects (Linux only).**
>
> **Decision.** Task Pack creation (`vcp task`) MAY create one
> file, `docs/tasks/<slug>.md`, by exclusive creation, in a
> project that satisfies ALL of the following at the moment of
> creation: (a) classification NEW or EXISTING with no `.vcp`
> entry, no manifest, no update/recovery lock, and no recovery
> marker, verified inside the write operation including
> re-validation immediately before creation; (b) selected root
> and all ancestors are real directories, not symlinks, with
> pinned identities re-verified before creation; (c) host
> platform Linux, with directory-durability preflight passing;
> (d) the operation is the caller-scoped helper specified in
> `VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md` §2, reachable only
> from Task Pack creation, creating only that one file and its
> parent directories.
>
> **Explicitly NOT decided by this ruling.** D-01 remains
> DEFERRED. G-FENCE remains NO-GO. No managed schema-v2 write,
> init, update, migration, recovery-apply, production-writer,
> or lifecycle-lock operation is authorized. L3 authorization
> and mandatory CI enforcement remain disabled. No Windows
> behavior is authorized or implied. No old/new CLI coexistence
> is authorized; published 0.9.3 lifecycle operations remain
> hazardous and unendorsed. No release, tag, or publish is
> authorized. This ruling is not a D-01 GO, in whole or in
> part, and must not be cited as one.
>
> **Conditions.** Independent adversarial validation (Acceptance
> Matrix gates G1–G6) passes before activation. The 42 fenced
> tests keep refusing. The shared gated helper and all
> authority/path/inspection/lock/writer/migration/recovery
> files stay byte-identical. Any widening of scope — file
> types, project states, commands, platforms — requires a new
> decision record. If any acceptance gate fails, this ruling
> does not activate and the implementation is reverted.
>
> **Review.** This ruling is reviewed if (i) a predicate bypass
> is demonstrated, (ii) Windows activation is proposed, or
> (iii) D-01 GO is decided — at which point SC-01 is
> superseded or retired explicitly, never silently absorbed.

Draft decision-record fields (JSON shape follows the existing
`docs/decisions/*.json` convention; values to be confirmed by
the owner at approval time):

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
  "requiresBeforeActivation": ["Acceptance gates G1-G6", "Independent adversarial validation", "Fence suite unchanged (42 F1 tests still refuse)"],
  "explicitNonAuthorizations": ["D-01 GO", "Windows activation", "Old/new CLI coexistence", "Release/tag/publish", "Any managed write"],
  "reviewTriggers": ["Predicate bypass demonstrated", "Windows activation proposed", "D-01 GO decided"],
  "owner": "Moeeryani",
  "decidedAtUtc": "<to be filled at approval>",
  "approvalChannel": "<to be filled at approval>"
}
```

## 5. Proof requirements before any implementation begins

None of the following is done by this design package. Each is a
precondition for the implementation follow-up, in order:

1. **Owner decision.** The owner approves, amends, or rejects
   §4 (or chooses Option A or C). No implementation work
   begins on an unapproved draft. The decision, once made, is
   recorded verbatim in `docs/decisions/SC-01.json` (Option B)
   or as a D-01 update (Option A) — never only in chat.
2. **Implementer briefing.** The implementer receives this
   package plus the instruction that the acceptance matrix is
   the contract: no existing test or implementation file is
   modified except as the matrix allows (none expected), and
   any deviation stops the work for re-decision.
3. **Independent validator commission.** A validator other than
   the implementer is commissioned for gate G3 before the
   implementation starts, so adversarial cases are not written
   to fit the implementation.
4. **Windows scope confirmation.** The owner confirms Q1
   (Linux-only v1) explicitly, so no implementer improvises a
   Windows path.
5. **Branch hygiene.** Implementation happens on a new branch
   from the approved baseline, preserving `d4fb3ce` and the
   design branch untouched; no push/merge/tag/publish without
   separate named approval.

## 6. What remains unknown (honest limits of this package)

- Whether the predicate survives a hostile reviewer's
  fault-injection harness (that is G3's job, not this
  document's claim).
- Whether any Windows-native behavior can ever satisfy the
  predicate (UNPROVEN; SC-T47–SC-T49).
- Whether the micro-window parent swap (R-1) is exploitable
  in practice beyond the bounded impact stated (requires the
  F-H2 hardening decision later).
- Whether users will misunderstand the scoped exception as a
  general unblocking (a documentation and messaging risk the
  owner accepts or mitigates at approval time).

— End of proposal —
