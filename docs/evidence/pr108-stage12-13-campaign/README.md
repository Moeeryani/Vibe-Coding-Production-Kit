# Evidence — VCP Stage 12/13 full build-completion campaign (PR #108)

**PR:** Moeeryani/Vibe-Coding-Production-Kit #108 (Draft — WIP native NTFS scratch foundation)
**Branch:** `integration/stage12-stage13-native-windows-foundation-20261011`
**Frozen SHA under test:** `f4b6832b8c732c2f544322d0615690021db800df`
**PR base:** `de8faa19c6959c4188632e2e908909db485c3ef3`
**Campaign date:** 2026-10-14
**Standing gates (untouched):** D-01 = DEFERRED · G-FENCE = NO-GO

This branch is kept off the PR branch per the standing evidence rule: it
carries only receipts and reports, no product code. Nothing here was merged,
released, or published.

## Contents

| File | What it is |
|---|---|
| `phase0-inventory.md` | Phase-0 deep inventory: per-area change summary of the 63-file PR diff, full TODO/FIXME/DEFERRED/NO-GO/UNPROVEN marker table, Phase-0 status table (Component \| Status \| Missing Proof \| Action) |
| `phases1-3-review.md` | Security review of phases 1–3: native Windows foundation (path/handle safety), NTFS inventory V2 (identity, ADS, security descriptor), receipts & evidence — findings with severity + file:line |
| `phase8-ci-diagnosis.md` | CI diagnosis: the two failed "validate" check runs on `f4b6832b` are a GitHub account billing lock (zero steps executed), not a code failure; remediation is account-level |
| `test-summary.md` | Linux test campaign results, exact commands, exit codes, pass/fail/skip counts scoped per SHA |
| `named-changes.md` | Itemized named change list (FIX-01, FIX-02 — implemented + verified locally, NOT pushed) and additive proposals (PROP-01..03), awaiting push direction |

## How to verify

- `test-summary.md` names the exact commands and the SHAs they ran on.
- PASS evidence never transfers between SHAs: every number is scoped to the
  SHA (and local fix set) stated beside it.
- Windows proofs (MSVC build, native exe tests, NTFS scratch tests) are
  DEFERRED/UNVERIFIED — no Windows host exists in the proving sandbox; nothing
  here simulates them.

## Key results (detail in `test-summary.md`)

- `npm run check`: PASS (150 modules) after FIX-01.
- `npm run test:stage13`: 59 pass / 0 fail / 12 skipped (Windows-only).
- Stage-12 suites: 103 pass / 0 fail / 1 skipped.
- Full `npm test` on `f4b6832b` + FIX-01 + FIX-02: 0 branch-introduced failures
  (all remaining failures are pre-existing on base `de8faa19`, byte-identical
  failure set modulo the one fixed test).
- G-FENCE: `assertManagedMigrationGate()` throws `E_G_FENCE_NO_GO` unconditionally;
  `managedV2MutationAuthorized=false`; candidate provider imported by tests only.
