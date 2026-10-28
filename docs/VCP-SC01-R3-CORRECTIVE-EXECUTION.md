# VCP SC-01 — R-3 Final Pre-Open Check: Corrective Build Agent Instructions

Parent plan: [VCP Final Completion](VCP-FINAL-COMPLETION-MASTER-PLAN.md) | Owner ruling: [SC-01 Owner Ruling](VCP-SC01-OWNER-RULING-20261028.md) | Tracker: [#109](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/109).

**Status:** owner authorized LOCAL BUILD only; this is a planning prompt, not an executed result or activation.
**Frozen G3 PASS candidate:** `57e4df465f6a56da91717b1ffb0474dae8b91e65`, tree `bd066b01ada5855bfd19e3f11fbae302f9d55a12` (local-only).

## Assignment to the Linux engineering agent

Read this entire file, the original VCP-SC01-G3-INDEPENDENT-ACCEPTANCE.md, builder report, threat model, acceptance matrix, and owner ruling. Do not use subagents.

Verify the exact frozen HEAD/tree exists in the local SC-01 checkout. Do not use the remote baseline (`d4fb3ce`) or the OD-1 design branch (`68a5da5`) as substitutes: neither contains SC-01 implementation. Create NEW local branch `fix/sc01-final-vcp-check` based on exactly `57e4df4`. Preserve the frozen original and G3 validator worktrees untouched.

**Task:** implement ONE late `.vcp` absence re-check after parent directories have been prepared and immediately before exclusive `open(O_EXCL|O_NOFOLLOW)`, as close as practical. Fail closed if any `.vcp` entry is present: regular file, directory, symlink, or dangling symlink. Do not claim that a check followed by open is atomic or that R-3 is entirely eliminated. The G3 report demonstrated late `.vcp` planting in 150/150 adversarial runs; this correction must address that demonstrated interval.

**Critical mutation-phase rule:** if the helper already created a parent directory, the operation is post-mutation even if the destination file does not exist. On a late refusal, preserve error, phase metadata, cleanup ledger, accurate filesystem evidence, identity checking and original causes. Do not route a post-mutation error into the pre-mutation G-FENCE fall-through, do not retry the create via another writer, and never delete a partial created Task Pack.

Keep all existing E1–E10 checks, Linux durability preflight, root/parent identity pins, strict `docs/tasks/<slug>.md` scope, no commands, no `.vcp`/AGENTS.md/Git writes, unchanged existing-file/`--force`/`--dry-run` behavior and unchanged shared gate helper. No native helper change or F-H2 descriptor-pinned implementation. No Windows support.

## Builder tests and evidence

Complete the narrow implementation and new tests first. Design deterministic externally controlled race evidence (e.g. disposable filesystem synchronization or safe external interposition) without production-only test hooks where practical; disclose any impossible deterministic ordering. Cover `.vcp` planted after parent creation, `.vcp` type variations, parents already created vs pre-existing, ledger cleanup and no unrelated deletion, failure evidence and original cause, no second write attempt, ordinary unmanaged creation, managed refusal, path/no-follow and authority boundaries.

After construction run focused/new SC-01 tests, Stage 12/13/14 contracts, syntax, D-03 and 13/13 command authority boundary, real CLI smoke, and full `npm test` with verified persistent-disk TMPDIR. Report exact test totals and sorted failing-name set; separate inherited 48 refusal-family cases and intermittent known PH-06, which can appear as an extra failure. Do not weaken historical checks.

Freeze the new local HEAD/tree. Deliver `VCP-SC01-R3-CORRECTIVE-BUILD-REPORT.md`, `VCP-SC01-R3-INDEPENDENT-DELTA-VALIDATION-HANDOFF.md`, and a SHA256 evidence manifest. List changed files, proof of untouched protected primitives/D-01, results and limitations. The earlier G3 PASS is only for old `57e4df4`; a separate independent delta G3 must test the new exact SHA/tree before owner activation review.

## Immutable non-authorizations

D-01=DEFERRED; G-FENCE=NO-GO; B-2=NOT_PROVEN; full transaction containment=NOT_PROVEN; Windows principal provider=null; production writers/L3 authorization/mandatory CI=DISABLED. R-1 accepted for local limited evaluation only; F-H2 deferred for current narrow Linux evaluation. **OD-ACT remains PENDING.**

NO subagents. NO Docker. NO GitHub Actions. NO push/merge/PR/tag/npm publish/release, NO activation, NO unauthorized gate change. Stop on a security boundary regression or source mismatch; otherwise complete this bounded build now.