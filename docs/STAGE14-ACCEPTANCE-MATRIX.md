# Stage 14 — Phase-2 consumer asset separation acceptance matrix

**Status: SOURCE-CONSTRUCTION REVIEW / EXECUTION UNTESTED.**
This file is an inventory of source and proposed witnesses, NOT a PASS receipt.
Version `0.9.3` remains unchanged. D-01=DEFERRED,
G-FENCE=NO-GO, `managedV2MutationAuthorized=false`.

Checkpoint A is a **separate prerequisite** from Stage14 code:
brownfield apply, rollback to genuinely unmanaged absence, user-file preservation
and reduction in adoption noise have not been demonstrated while writer
activation remains blocked.

| Case | Contract | Source/fixture | Evidence status |
|---|---|---|---|
| A14-01 | Strict four-class catalog and reviewed consumer allowlist | `lib/asset-catalog.mjs`, `test/stage14-consumer-assets.test.mjs` | BUILT / UNTESTED |
| A14-02 | Stable legacy/safe/minimal surface semantics | `lib/template.mjs`, safe/legacy golden tests | BUILT / UNTESTED |
| A14-03 | Brownfield minimal never invents project authority | `lib/brownfield-routing.mjs`, `lib/template.mjs` | BUILT / UNTESTED |
| A14-04 | Legacy prompt/validator/CI kept in npm package | `package.json`, release policy, provider validator | BUILT / UNTESTED |
| A14-05 | Greenfield safe excludes source framework and npm workflow | Explicit safe inventory, `lib/greenfield-routing.mjs` | BUILT / UNTESTED |
| A14-06 | Prompt override and bounded package fallback | Existing `lib/prompt-resolver.mjs`, strict eligibility, fixtures | BUILT / UNTESTED |
| A14-07 | Concise always-on routing, no user file clobber | `lib/greenfield-routing.mjs`, legacy-path regression | BUILT / UNTESTED |
| A14-08 | Doctor/Task/Context/update/manifests agree on ownership | Doctor asset health; existing Stage12/13 guardrails | BUILT / UNTESTED |
| A14-09 | Read-only legacy retirement with exact baseline and conflict taxonomy | `lib/consumer-asset-retirement-plan.mjs`, `vcp asset-plan` | BUILT / UNTESTED |
| A14-10 | No cleanup writes, D-01/writer isolation not bypassed | Existing migration gate; new planner has no apply function | BUILT / UNTESTED; runtime proof pending |
| A14-11 | Source validator and release package retain legacy/runtime | `scripts/validate-framework.mjs`, `.github/release-policy.json` | BUILT / UNTESTED |
| A14-12 | Negative portable path/security/provenance fixtures | `test/stage14-consumer-assets.test.mjs` | BUILT / UNTESTED |
| A14-13 | Measurable first-use inventory/noise (never fake apply) | `test/stage14-dogfood.test.mjs` | PREVIEW BUILT; real adoption dogfood PENDING |
| A14-14 | Docs/onboarding/source-of-truth aligned | `docs/CONSUMER-ASSET-SEPARATION.md`, CLI/Doctor/Updates/Context/Quickstart/README/Roadmap | BUILT / REVIEW PENDING |
| A14-15 | Exact SHA independent Linux+Windows/NTFS execution and package smoke | Deferred final campaign, separate computer agents | **NOT RUN** |
| A14-16 | Checkpoint A GO, Stage12 full, Stage13 full, D-01/Windows native durability | Independent owner decisions and full proof | **NO-GO** |

## Mandatory final acceptance campaign (only after source freeze)

1. Publish source freeze full SHA, lineage, exact changed files, package hash and clean detached checkouts on independently controlled Linux and native Windows/NTFS.
2. On Linux: `npm ci`, `npm run build:native-linux`, `npm run check`, `npm run check:stage12-contract`, `npm run check:stage13-contract`, `npm run check:stage14-contract`, `npm run test:stage13`, `npm run test:stage14`, `npm test`, `npm run validate`, `npm run pack:check`. Capture exit code/stdout/stderr after **every** command, even when an earlier one fails.
3. On native Windows/NTFS: perform the same supported source/contract/focused/full/package checks; record Node/npm/Git, volume, junction/reparse privileges and exact temp volume with adequate free disk space (C: historically exhausted; use sufficiently provisioned D: TMP/TEMP). No WSL evidence substitution.
4. Compare exact failing test IDs to baseline `98cb12e9` and historic Stage12/13 source `61373569`; no automatic classification of 65/63 old failures as environment. Separate true product failure, intentional G-FENCE red, broken test, missing native helper, missing NTFS writer and unavailable test privilege.
5. Run golden per-surface installed path inventory, BOM/mixed-EOL/Unicode/case aliases, project override, nested workspace/symlink/junction, source-only legacy workflow and edited user document preservation. Capture SHA-256 byte proofs before and after and verify no unapproved user-file writer invoked.
6. Run `npm pack --dry-run` / local isolated package smoke ensuring the old source workflow, canonical prompts and validators are present **in the package** but never selected into safe consumers.
7. Verify the actual old published `0.9.3` native Linux/Windows writers cannot destroy edits under the future accepted D-01 design. A Stage14 plan/read-only denial is **not** that proof.
8. Mechanically complete Checkpoint A against mature brownfield sample applications: preview vs actual fresh locked apply, modified-preview replan, exactly preserved CI/instructions/sections, staged crash recovery and rollback-to-absence; record time/noise/questions/bytes, then maintainer GO/SIMPLIFY/STOP-DEFER. None can be marked PASS while D-01 and native writers are unavailable.
9. Independent review all blocking issues, resolve or preserve NO-GO, freeze source again if fixed, then re-run the required final exact-HEAD campaign. Preserve logs and SHA256SUMS on evidence branches, not just local D: or unverified chat excerpts.

## Current safety boundary

All source-only build claims are conditional. `vcp asset-plan` exposes only
`readOnly:true`, every candidate `executionAuthorized:false`, and no apply
path. Unknown files, stale/missing baselines, untrusted linked paths and user
edits remain blocked/preserved. The new catalog does not stop unchanged
published-v0.9.3 old binary operations on a writable shared root; no release,
tag, main merge or producer write activation follows from this file.
