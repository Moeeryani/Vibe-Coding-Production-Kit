# VCP P2 — Read-Only Acceptance Execution Contract & Agent Prompt

**Plan:** VCP-FCP-2026-10-28 · **Parent tracker:** [#109](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/109) · **P2 ticket:** [#110](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/110)  
**Status:** READY TO EXECUTE, NOT MEASURED  
**Source protocol:** \`VCP-ACCEPTANCE-CHECKPOINT-PROTOCOLS.md\` (local original; SHA256 as recorded in prior P0 inventory: \`9e47a0e0b58390cd724b8afdf52fb1924e092de82bcd9b411a6fc87436371f94\`). This document complements but does **not** override the original protocol or invent results.

## Run assignment — paste this file path into one independent agent session

You are the **VCP P2 empirical-measurement engineer**. Run the Checkpoint B (adaptation accuracy) and Checkpoint E (ablation/capability audit) campaigns, plus the **fixture-only** portion of Checkpoint C. Do not use subagents. Build one reproducible evidence pack and an owner decision proposal; you cannot grant final checkpoint acceptance.

### 1. Source identity and permitted work

- Accepted source to evaluate (not current release): remote branch \`feat/vcp-release-readiness-baseline\` pinned to \`d4fb3ceec55113b56aa0cfa7e4885ac00d8a1e17\`, tree \`e7119fa2c778110d2475aaeb7ad7f2275d7a4bcd\`.
- Verify the exact HEAD/tree, ancestry, clean status, Git provenance, and reproducibility **before** running the campaign. Refuse to substitute GitHub \`main\` (older) or the docs-only \`planning/*\` branch.
- The concurrently developed SC-01 \`fix/sc01-final-vcp-check\` is a separate branch and MUST NOT be used as a surrogate baseline; SC-01 independently passed G3 on frozen \`57e4df4\`, but the R-3 corrective candidate is not yet validated.
- Open/read original \`~/workspace/VCP-ACCEPTANCE-CHECKPOINT-PROTOCOLS.md\`; hash it and compare to the source protocol hash. If unavailable, request the original source and mark affected metrics PROTOCOL_SOURCE_UNAVAILABLE rather than inventing criteria. Read the final-completion plan, conformance matrix, and earlier \`VCP-ADAPTIVE-CHECKPOINT-C-REPORT.md\` for prior C fixture denominators.
- **No live managed writes.** D-01 DEFERRED / G-FENCE NO-GO; production writers, L3 authorization, mandatory CI enforcement DISABLED. Native Linux, no Docker, no GitHub Actions, no subagents. No push/merge/PR/tag/release or \`main\` edits. Use only isolated disposable copies; no mutation of selected live projects.
- Do not change the VCP source, tests, thresholds or security policies. Ablation occurs only in separate disposable experiment clones. Source candidate remains byte-identical.

### 2. Checkpoint B — independently measured real-project detection

Recruit **2–3 genuine reviewers**, of whom the ground-truth reviewer must not see the VCP detections before assigning labels. If 2–3 reviewers cannot be obtained, run a clearly marked **exploratory/unblinded** pilot only; do not declare Checkpoint B GO or claim independent ground truth.

Select **8–12 real projects** with verified Git commit identity and diversified stack/size:

- JS/TS standalone service, full-stack or package
- Python project using declared tools
- Go module
- React Native project
- Generic, unsupported or mixed-stack project
- Include at least one monorepo or project with multiple candidate commands and at least one repo with intentionally absent standard commands.

Do not manufacture a repository to count it as real. Public repositories are acceptable when license/access permits use; do not execute their install/build scripts just to collect read-only detection evidence. Record exact URLs, SHAs, license/context, stack, Git state, size and whether a disposable copy was used.

Before any VCP output is revealed to the ground-truth reviewer, independently label project facts at file/line granularity: stack, test/build/lint/typecheck commands actually declared, capabilities, and unknowns.

In a separate record, run native VCP **read-only** inspection, capability discovery and context composition. Collect full stdout/stderr, JSON results, command/exit codes, context sizes (bytes, and tokens only if measured with named method), and filesystem before/after manifests.

Reconcile fact-by-fact:
- True positives, false positives, false negatives; each with project/file/line.
- VCP-proposed commands: accepted, corrected, rejected; the danger of falsely proposing executable commands is a critical finding.
- Unknowns: explicitly labeled vs silently guessed.
- Reviewer corrections by count and kind.
- Per-project and per-mode context-size median/max and outlier explanations.

Metrics must include **numerators and denominators**:
- Precision = correct detections / all detections.
- Recall = correct detections / ground-truth facts.
- False-positive rate = false positives / all detections.
- Command acceptance = accepted / proposed.
- Correction rate = corrected / proposed.
- Unknown rate = unknowns / ground-truth facts.
- Context sizes = median/max bytes per project/mode.

If any denominator is zero: report UNDEFINED (not 0% or 100%).

Protocol decision threshold: **GO candidate only when precision AND recall >=90% on the corpus, zero false-positive executable commands, and unknown facts explicitly labeled.** SIMPLIFY for bounded systematic detection/context defects; STOP-DEFER for unsafe command proposals across a majority or silent guessing. Even a numeric GO is a **recommendation**, not owner acceptance.

**Checkpoint B DONE:** frozen corpus manifest + independent, time-stamped ground-truth sheet + raw tool outputs + reconciled fact-level measurement sheet + hash-verified unchanged source-tree receipts + SHA256 evidence manifest.

### 3. Checkpoint E — removable surfaces, core checks and ablation

Use **1–2 auditors**. Inventory all candidate surfaces: \`skills/\`, \`prompts/\`, CLI commands, generated guidance, documents, workflow modes, and gate levels. The list must be derived from actual source and help output.

For each bounded candidate, in a **separate disposable copy**:
1. Record exact baseline SHA/tree and surface inventory.
2. Remove or disable that candidate only in the disposable copy; save the exact diff.
3. Run the same full VCP test suite, the negative/failure-injection corpus (stale evidence, dirty Git tree, conflicting commands, symlinked markers, forged sessions, downgrade/detached-state attempts), and the prior C fixture measurements. Record command, exit, and pass/fail/skip counts and **failing-name set**, with inherited D-01 fence and PH-06 issues separated rather than hidden.
4. For each core security check: inject a concrete adverse condition with check present vs absent, compare caught/missed counts with denominators. Disabling a check in a disposable clone is an experiment, NOT approval to remove it from VCP.
5. Score maintenance/migration burden (files, lines, user-facing concepts, dependencies) against demonstrated failure-catching benefit. Differentiate missing coverage from proven redundancy.

Every candidate must have \`KEEP / REMOVE_PROPOSED / DEFER\` with data; include a deletion/deprecation candidate list even if **zero actual deletions** are approved. No automatic change to a protected helper, published skill, CLI, or gate.

**Checkpoint E DONE:** complete audited surface inventory, experiment diffs, per-candidate full-suite/failure-corpus/C-fixture comparison, quantified catch-rate deltas, a deletion/deprecation register (file + commit when authorized and actually deleted; otherwise "not performed, owner approval pending"), artifacts + SHA256 manifest. The checkpoint itself is only recommended for owner review.

### 4. Checkpoint C — fixture-only regression, NOT dogfood

Re-run the earlier Checkpoint C fixture corpus on the exact pinned candidate. Record:
- L0/L1/L2/L3 routing accuracy (with ground truth).
- False-high and unsafe-trivial rates; all denominators.
- Dirty/stale/override refusal outcomes.
- Context size per level.
- No change to L3 live authorization, no new approval-format assumptions, no mandatory CI activation.

The real dogfood cohort (2–4 developers, >=5 tasks each) **has not been executed** and is NOT part of this task. Report C as **PARTIAL / FIXTURE-ONLY** and list owner decisions for L1 readiness stage and L3 reviewer identity. Do not fabricate user interviews or simulator data.

### 5. Evidence, integrity and stopping rules

Keep \`P2/evidence/\` local, with one immutable run manifest and exact commands, timestamps, tool versions, environment details and SHA256 for every report/source/probe file. Store failure details and raw logs; avoid publishing sensitive path/project data. Do not push anything without a separate approval.

**Stop and report** on: any unexpectedly mutated live repository, unapproved command execution, confirmed security boundary violation, unlicensed/private repo exposure, altered exact-head candidate, untraceable metric denominator, or inability to obtain independently blind B labels for final GO claim. Inconclusive or skipped experiments must remain NOT_MEASURED/NOT_PROVEN.

No percentages, benchmarks, real-user conclusions, or checkpoint decisions may be fabricated.

### 6. Deliverables and reporting format

Return:
- \`VCP-P2-CHECKPOINT-B-REAL-PROJECT-REPORT.md\`
- \`VCP-P2-CHECKPOINT-E-ABLATION-REPORT.md\`
- \`VCP-P2-CHECKPOINT-C-FIXTURE-REMEASUREMENT.md\`
- \`VCP-P2-MEASUREMENT-INDEX.md\` with evidence hashes, individual checkpoint status and owner choices.

Every report must contain: candidate HEAD/tree, corpus/reviewer identities (pseudonymous), raw-log path, exact denominator sheet, passed/failed experiment outcomes, unchanged repository evidence, limitations, and a decision-ready GO/SIMPLIFY/STOP-DEFER or KEEP/REMOVE/DEFER recommendation as applicable.

Do not label B or E **ACCEPTED** merely because an agent completed an experiment. Final checkpoint decisions require independent validation and owner acceptance.

### 7. Branch and collaboration boundaries

- Follow [master plan](VCP-FINAL-COMPLETION-MASTER-PLAN.md) and [#110](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/110).
- Do not use the SC-01 builder's worktree; no edits to \`fix/sc01-final-vcp-check\`.
- No test-code changes committed to the frozen source; experimental deletions occur only in throwaway clones.
- Deliver reports and raw evidence locally for independent handoff first; do not auto-create a GitHub PR or publish evidence.
- This is P2 measurement work, not P3/P4, D-01, PH-06 or release execution.

**Begin with independent B corpus preparation and fact-label assignment, then run B, E and fixture-only C to produce the exact evidence pack. Do not stop for optional clarification; if real reviewers are unavailable, complete the pilot/data preparation and report the acceptance boundary honestly.**

## Owner-facing progress fields

- P2 B: \`NOT_STARTED / MEASURING / EVIDENCE_READY / INDEPENDENT_REVIEW / OWNER_ACCEPTED / SIMPLIFY / BLOCKED\`
- P2 E: same + individual \`KEEP/REMOVE_PROPOSED/DEFER\` records.
- P2 C-fixture: \`NOT_STARTED / PARTIAL_FIXTURE_EVIDENCE\`
- P2 linked ticket: #110; parent: #109.
