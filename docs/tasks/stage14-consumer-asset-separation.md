# Task — Stage 14 Consumer Asset Separation (BUILD ONLY / NOT ACCEPTED)

Status: Review
Readiness: SOURCE CONSTRUCTION COMPLETE (not tested or accepted); Checkpoint A and D-01 remain NO-GO.
Slug: `stage14-consumer-asset-separation`
Tracking issue: https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/103
Development base: `98cb12e9a68129ba35f551195241ce426d6af802`
Package version: `0.9.3` (unchanged)

## Outcome

Implement the full Adaptive Phase-2 consumer/package asset separation: make the actual installed surface explicit, smaller and project-owned while retaining canonical VCP runtime assets in the npm package and retaining legacy rollback/migration inputs. Reduce permanent instructions and make Doctor/Context/Task/release/consumer validation agree. Do not make v2 lifecycle writes executable while Stage12 D-01 remains deferred.

**Sequencing:** The governing Roadmap places Adaptive Validation Checkpoint A immediately after Stage13 and *before* Phase 2. This Task Pack names Phase 2 `Stage14` for tracking only. Checkpoint A is PENDING/NO-GO, not waived by commencing isolated source construction; Stage14 cannot ship/merge or be accepted without the checkpoint's independently checkable GO or a new explicit owner scope decision. Owner instruction is to stop repeat test rounds now, finish source, then test on one frozen combined HEAD.

## Source of truth

| Source | Reference |
|---|---|
| Stage14 tracker | `#103` |
| Execution ordering and checkpoint | `docs/ROADMAP.md` §8 and §15 |
| Phase-2 design | `docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md` §4.4 and `Phase 2` |
| Cross-workstream safety audit | `docs/ADAPTIVE-VCP-FINAL-PREIMPLEMENTATION-AUDIT.md` |
| Accepted design decisions | `docs/ADAPTIVE-VCP-DECISIONS.md` (D-01 remains deferred) |
| Real source catalog | `lib/asset-catalog.mjs`, `lib/template.mjs` |
| Consumer lifecycle | `lib/adaptive-update-plan.mjs`, `lib/manifest-v2.mjs` |
| Consumer health | `lib/doctor.mjs`, `lib/ownership-health.mjs` |
| Packaged fallback | `lib/prompt-resolver.mjs` and `lib/context.mjs` |
| Packaging | `package.json`, `scripts/validate-framework.mjs` |

## Requirement restatement

The npm package owns framework source/reference/runtime material. Installed repositories own their product documents, instructions, CI, command decisions, and user edits. Each asset-set manifest explicitly identifies what VCP installs and owns, while unknown or unproven paths cannot be silently overwritten, deleted, adopted, or interpreted as Source of Truth. Package-only prompts may be read as bounded fallback, never written to a brownfield repository by implication.

## Acceptance criteria

- [ ] **A14-01**: One canonical explicit asset manifest classifies every installed/package asset as `runtime-required`, `greenfield-starter`, `optional-hygiene`, or `package-only`; strict portable unique paths; no silent glob/directory-root expansion of unknown source files into consumer state.
- [ ] **A14-02**: `legacy-full-v1`, `greenfield-safe-v1`, `brownfield-minimal-v1` maintain stable meaning and deterministic golden inventories; upgrades never retroactively relabel old install metadata.
- [ ] **A14-03**: Established brownfield repositories receive no default Product/Architecture/Testing/CI starter files; observed user content is not claimed or turned into accepted Source of Truth.
- [ ] **A14-04**: Existing legacy source assets, prompts, validator scripts and old `.github/workflows/validate.yml` remain available **inside the npm package** as compatibility, recovery and migration inputs until separately approved removal.
- [ ] **A14-05**: Fresh safe surfaces omit source-repository validators, copied framework docs, source-only workflow, and default canonical prompts while still supporting packaged prompt fallback. No implied CI coverage.
- [ ] **A14-06**: Prompt resolution is fixed allowlist project override → packaged canonical fallback; links/oversized bytes/unknown paths fail closed; provenance, package version and Context byte budget remain correct; packaged prompts never satisfy Source-of-Truth authority.
- [ ] **A14-07**: Short permanent routing instructions preserve critical policy, human decision and command-authority boundaries; long procedural references load on demand; no silent replacement of user-edited AGENTS/CLAUDE/Copilot instructions.
- [ ] **A14-08**: Doctor, Task, readiness, Context, update and manage agree on asset-set-specific presence and missing/intentional omissions; no fake missing-starter or missing-CI failure for a safe surface; old v1 installs retain historical health semantics.
- [ ] **A14-09**: Legacy consumer-asset cleanup/detach is an **inspection-only plan** until D-01 release. Each candidate has exact ownership+baseline provenance and explicit before hash; user edits, foreign content, links, ambiguous names, invalid journals and incomplete backups BLOCK. No implicit delete/auto migration.
- [ ] **A14-10**: Any subsequent mutating cleanup is constrained by the existing versioned backup/journal, actual lifecycle lock and exact user bytes/identities; D-01 remains a mandatory independent barrier (no source bypass, override flag or JS-only shortcut).
- [ ] **A14-11**: Framework validator and package/release checks distinguish provider-owned source files from installed consumer files; packaged assets/golden inventories are complete and no source-only validation workflow is installed for safe profiles.
- [ ] **A14-12**: Strict negative and compatibility fixtures cover malformed asset manifests, duplicate case/Unicode aliases, traversal/UNC/NTFS device paths, extra project-owned files, CRLF/BOM/customized prompts, nested workspaces, template version changes, and recovery paths.
- [ ] **A14-13**: Multi-repository dogfood records exact installed file/path deltas, preserved before/after user bytes, standing-context size, noise, and steps/questions to first productive feature; no success inferred from refusal alone.
- [ ] **A14-14**: All observable behavior and trust boundaries documented in CLI, Doctor, updates, quickstart, README, Roadmap, Task Pack and package surface; no prose-only claim of a capability not implemented.
- [ ] **A14-15**: Final integrated exact-SHA build on native Linux and Windows/NTFS passes applicable syntax/contract checks, focused/complete tests, package dry run, old published 0.9.3 compatibility, adversarial recovery/owner preservation and independent review **after source construction is complete**; any blocked platform is UNVERIFIED, not PASS.
- [ ] **A14-16**: Checkpoint A decision and original Stage12/13 security/acceptance remain separate mandatory external gates; no Stage14 Done, release or main merge while they are outstanding.

## Scope

### In scope

Consumer catalog; package vs installed file selection; standing-context reduction; legacy prompt preservation/fallback; assetSet-dependent install-health; read-only migration/detach planning; validator/package contracts; docs and negative/dogfood fixtures; portable Linux/native-Windows evidence after one full build freeze.

### Out of scope

Native Windows NTFS durable writer implementation; D-01 old-published-CLI zero-write fence design; granting write authority; Stage13 final acceptance; CI provider-neutral detection (Adaptive Phase 3); capability detection/profile DSL (Phases 4–5); Skills/router (Phases 6/9); workflow level/gate enforcement (Phases 7–8); npm version/tag/publish/main merge. These are **distinct**, still-required project items, not removed requirements.

## Design and invariants

- Decision status: `D-01=DEFERRED`; `G-FENCE=NO-GO`; `managedV2MutationAuthorized=false`.
- `assetSet` is persisted project lifecycle identity, not a helper default. Absence or unknown values never produce implicit new ownership or deletes.
- `includeGitHub` keeps old legacy meaning; on safe surfaces it can request issue/PR hygiene, **not** implicit CI.
- Package-only prompt fallback is guidance transport, not project-owned document authority.
- Read-only preview does not supply finality, lock ownership, approval or write capability.
- All explicit cleanup requires a proven owned path, complete prior bytes, approved lifecycle transition and post-crash replay compatibility.
- Existing tracked source workflow stays in package while historical rollback could need it.
- Windows-native durability remains fail-closed; Linux provider behavior never implies NTFS parity.

## Failure modes and recovery

Malformed or unknown asset catalog → refuse consumer selection; no defaulting to legacy.
User-edited legacy asset or adapter → preserve, return conflict; never silently replace.
No baseline/manifest/corrupt journal → inspect-only BLOCKED.
Linked/untrusted nested project paths → BLOCKED without traversal.
Crash across any future cleanup → retain journal+backup and require exact recovery; do not assume a rename is durable on Windows.
Absent packaged fallback → explicit missing canonical resource, never invent starter Source-of-Truth text.
Checkpoint A unavailable because adoption apply is fenced → checkpoint stays PENDING/NO-GO.

## Implementation plan — construction first, one acceptance campaign later

1. Inventory every current `template` candidate and map it to an explicit consumer/package class, assetSet, owner and migration rule. Preserve canonical v0.9.3 inputs.
2. Implement single manifest and deterministic selection; replace broad implicit copying in the new safe asset sets while reproducing complete legacy compatibility.
3. Complete short standing-context/router contract and packaged canonical prompt fallback; preserve all project overrides.
4. Implement assetSet-aware Doctor, Task, Context, update, manage and validator contracts in one consistent consumer surface.
5. Implement inspection-only legacy cleanup/detach planning, exact ownership/preimage conflict taxonomy and disabled writer guard; do not cross D-01.
6. Add golden/negative tests and realistic fixture/dogfood source in the same construction branch.
7. Reconcile user docs, package inventory, release-check contracts and acceptance matrix with explicit TODO/NO-GO statuses.
8. **Only after all source is written:** code review, final source freeze, separate computer-equipped Linux+native Windows evidence, original Stage12/13 regressions, Checkpoint A decision, owner approval (separate if needed). A red gate is not silently waived.

## Planned verification commands (NOT EXECUTED)

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`
- `INTEGRATION_TEST_COMMAND`: `npm run validate`
- `BUILD_COMMAND`: `npm run pack:check`

Additional final checks: `npm run check:stage12-contract`; `npm run check:stage13-contract`; `npm run test:stage13`; Stage14 focused/golden fixtures; authenticated published old CLI, native Windows/NTFS rollback/durability proof. No live project writes or release operations.

## Current status

**PLAN / BUILD ONLY / CHECKPOINT A PENDING / D-01 NO-GO.**
The user authorized moving **construction effort** to Stage14 and pausing tests. No exit/GO, production write permission, Stage12/13 closure, or release approval has been inferred.

## Construction closeout — source only, no executable acceptance

Phase-2 implementation source has been authored across: strict four-class
`lib/asset-catalog.mjs`; stable legacy+explicit greenfield/minimal
`lib/template.mjs`; slim `lib/greenfield-routing.mjs`;
read-only `lib/consumer-asset-retirement-plan.mjs`; metadata-only
`lib/consumer-asset-health.mjs` wired into Doctor; `vcp asset-plan`
CLI with strictly refused mutation flags; package/framework/release-policy
retention; 24 authored focused and preflight dogfood tests across
`test/stage14-consumer-assets.test.mjs` and
`test/stage14-dogfood.test.mjs`; developer docs and the
`docs/STAGE14-ACCEPTANCE-MATRIX.md` handoff.

Safety review included excluding newly added provider-only Stage14 docs
from legacy-full installation, preserving unowned historical AGENTS files,
no accidental CI assumption, catalog case/NFC/path collision refusal and
keeping published 0.9.3/Windows-writer/D-01 boundaries intact.

**This closes construction of the source slice, NOT any acceptance criterion
requiring executable evidence.** No `npm test`, check, validate, native
Linux/Windows, package smoke or Stage12/13/A13 final campaign was executed
for this new branch during source construction. Final exact-SHA freeze and
independent evidence are required before `Done`; Checkpoint A currently
remains PENDING/NO-GO, and A14-15/A14-16 are NOT RUN/NO-GO respectively.
