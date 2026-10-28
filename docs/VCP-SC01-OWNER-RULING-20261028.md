# VCP SC-01 — Owner Rulings on G3 Residuals (2026-10-28)

**Record type:** Planning/owner instruction only. **This is NOT a canonical activation decision.**
**Owner instruction:** "اعتمد" on 2026-10-28, in response to the specific OD-R1/OD-R3/OD-H/OD-ACT proposal in the project discussion.
**Tracking:** [Master Plan](VCP-FINAL-COMPLETION-MASTER-PLAN.md) · [Issue #109](https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/109)
**Source evidence:** Local independent `VCP-SC01-G3-INDEPENDENT-ACCEPTANCE.md`, G3 verdict PASS for frozen `57e4df465f6a56da91717b1ffb0474dae8b91e65` / tree `bd066b01ada5855bfd19e3f11fbae302f9d55a12`; G3 report not yet archived on GitHub.

## Owner-approved disposition — local engineering/evaluation scope only

| ID | Owner ruling | Implementation consequence |
|---|---|---|
| **OD-R1** | **ACCEPT FOR LOCAL LIMITED EVALUATION ONLY**: existing parent-swap residual (a file may be placed into a swapped-in tree before a post-sync identity error; detected after writing, not prevented). | Preserve explicit warning and evidence; do not claim path-based atomic confinement or production risk acceptance. Require new owner decision before production activation / scope widening. |
| **OD-R3** | **REQUIRE NARROW HARDENING**: add one final `.vcp`-absence check immediately before `open(O_EXCL)` in the SC-01 scoped create path. | Build/test on a NEW local corrective branch based on exact accepted frozen `57e4df4`, preserving original freeze. Do not silently claim this eliminates the race: there remains a final check→open interleaving. |
| **OD-H** | **DEFER F-H2 FOR CURRENT LINUX-ONLY EVALUATION**, require reconsideration and evidence before expanding eligibility, Windows or managed-adjacent writes. | No descriptor-pinned native-helper widening in this limited correction. Hardening requirement for broader scope cannot be waived implicitly. |
| **OD-ACT** | **NOT APPROVED**. Activation remains pending the corrective build and independent validation, compatible canonical decision recording, scope review, and a fresh explicit owner action. | No canonical SC-01 record, no modifying D-01–D-12 register, no behavior shipped/released as activated. |
| **OD-SCOPE** | Prior Linux-only, non-managed, single Task Pack file engineering scope remains unchanged. | SC-T47–SC-T49 Windows UNPROVEN; no Windows code or evidence claim. |

## Corrective implementation constraints

1. Start from exact local frozen G3-accepted source `57e4df465f6a56da91717b1ffb0474dae8b91e65`, tree `bd066b01ada5855bfd19e3f11fbae302f9d55a12`; do not edit/rewrite the frozen branch. Use a separate local `fix/sc01-final-vcp-check` branch.
2. Place the check as late as practical, after parents have been prepared and before the exclusive open; use existing lstat/no-follow and fail-closed semantics. Treat a newly appeared `.vcp` as a refusal. If parent directories were created already, preserve post-mutation cleanup/evidence semantics; **do not** relabel a post-mutation failure as pre-mutation, do not fall through to a second gated creation attempt.
3. Add deterministic test for `.vcp` appearing after parent creation but before open, ideally with an external/disposable probe that controls ordering; add negative tests for symlink/dir/file shapes and concurrent parent operations. Avoid new injection hooks in production code.
4. Build the bounded change first, then run focused + full regression and an **independent delta security validation on the NEW HEAD**. Prior G3 PASS on `57e4df4` remains historical evidence, not acceptance of modified code.
5. Builder and independent validator must explicitly distinguish what the last-minute check prevents from the final unavoidable check/open micro-window, and must prove no new managed-state write, no command execution, and no changes to shared gated helpers or D-01.
6. Activation review requires owner approval based on the final corrective SHA/tree, security evidence and decision schema compatible with the existing D-01–D-12 rules.

## Frozen governance and release states

- `D-01=DEFERRED`; `G-FENCE=NO-GO`.
- `B-2=NOT_PROVEN`; `FULL_TRANSACTION_CONTAINMENT=NOT_PROVEN`.
- `WINDOWS_PRINCIPAL_PROVIDER=null`; `PRODUCTION_WRITERS=DISABLED`.
- Live `L3 authorization=DISABLED`; `mandatory CI enforcement=DISABLED`.
- `PH-06` unresolved, independent of SC-01.
- **No code push, merge, PR, tag, npm publish, release, activation or security-gate reopening is authorized by this record.**

**Current P1 state:** G3 PASS for frozen `57e4df4`; scoped final-check correction **AUTHORIZED TO BUILD LOCALLY, NOT YET BUILT OR VALIDATED**; owner activation remains PENDING.
