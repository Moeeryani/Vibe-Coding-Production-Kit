# Task — Stage 11 React Native Mobile Profiles implementation

Status: Done
Slug: `stage11-mobile-profiles-implementation`

## Outcome

Implement the complete accepted Stage 11 React Native-first mobile-profile capability end to end: deterministic selected-root detection, first-party guidance, script-derived verification, Doctor inspection, safe lifecycle specialization, Stage 10 plugin coexistence, nested-project isolation, security/privacy boundaries, realistic first-party dogfood, and package/validation coverage.

## Source of truth

| Source | Reference |
|---|---|
| Accepted mobile contract | `docs/MOBILE-PROFILES.md` |
| Stage 11 implementation issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/84 |
| Stage 11 PR | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/pull/85 |
| Completed design issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/82 |
| Design PR | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/pull/83 |
| Current released baseline | `v0.9.3` / `dc3c6a6572e1b86994de5a46cfb8fc815ed45378` |
| Stage 10 plugin contract | `docs/COMMUNITY-PLUGINS.md` |
| Lifecycle contract | `docs/UPDATES.md` |

## Requirement restatement

Ship React Native as VCP's first built-in mobile profile without weakening project-root authority, explicit stack choices, Stage 10 plugin trust, verification truthfulness, lifecycle rollback safety, or human authorization over signing/deployment/store/device actions.

## Acceptance criteria

- [x] AC-001 — `react-native` is an explicit supported first-party stack selector.
- [x] AC-002 — auto-detection requires a valid selected-root `dependencies.react-native` runtime dependency plus one canonical application marker.
- [x] AC-003 — marker-only, dependency-only, peer/dev-only, malformed-package, symlink-marker, transitive/name/README evidence never activates the profile.
- [x] AC-004 — detection precedence remains `go -> python -> react-native -> typescript -> javascript -> generic`.
- [x] AC-005 — selected project root is authoritative; sibling/parent mobile evidence is not recursively inherited.
- [x] AC-006 — TypeScript React Native applications resolve to `react-native` while preserving explicit typecheck applicability.
- [x] AC-007 — generated `AGENTS.md` contains first-party React Native engineering/security guidance and no Go/other-profile fallthrough.
- [x] AC-008 — React Native verification uses only selected-root package-manager/script evidence; no native/simulator/signing/deploy commands are invented.
- [x] AC-009 — missing TypeScript/build/E2E applicability remains explicit rather than silently `n/a`.
- [x] AC-010 — visibly sensitive-effect mobile scripts are not auto-imported into general verification.
- [x] AC-011 — Doctor human/JSON output distinguishes detected, installed, requested, re-profile, and React Native specialization state.
- [x] AC-012 — auto-selected `generic|javascript|typescript` may specialize transactionally to `react-native`; explicit selectors, legacy unknown provenance, Go, and Python are preserved.
- [x] AC-013 — lifecycle specialization retains `requestedStack: "auto"`, respects conflicts/local decisions, creates rollback evidence, and is idempotent after apply.
- [x] AC-014 — Stage 10 community plugin selection remains project-owned/additive; built-in React Native does not remove selection, apply proposals, or allow plugin override of core/first-party authority.
- [x] AC-015 — first-party `examples/mobile-react-native/` is distinct from Stage 10 plugin dogfood, network-independent for VCP conformance, and package-visible.
- [x] AC-016 — realistic dogfood proves detection, generated guidance, verification mapping, bounded context, and no plugin requirement.
- [x] AC-017 — security/privacy guidance covers signing material, credentials, permission/lifecycle/deep-link boundaries, and separate HUMAN DECISION execution.
- [x] AC-018 — existing JavaScript/TypeScript/Python/Go/generic, Stage 5 workspace, Stage 10 plugin, Doctor, update, task, and verification regressions remain green.
- [x] AC-019 — Stage 11 does not modify immutable `v0.9.3`, add Flutter/native iOS/native Android, or revive Dependency Graph Engine work.
- [x] AC-020 — one final exact-head Windows gate runs only after all Stage 11 implementation/docs/tests are complete, followed by fresh review/finalization and the required rerun.

## Scope

### In scope

- `lib/stacks.mjs` detection/profile/verification mapping;
- `lib/stack-provenance.mjs` and existing update engine integration;
- Doctor inspection;
- CLI/docs/README/roadmap/changelog synchronization;
- first-party React Native fixture;
- focused + lifecycle + nested + plugin-coexistence + dogfood regression tests;
- framework/package validation requirements.

### Out of scope

- Flutter, native iOS, native Android first-party profiles;
- app-store submission/deployment automation;
- automatic signing/provisioning;
- secret/key management;
- remote simulator/device-farm orchestration;
- remote plugin marketplace;
- Dependency Graph Engine;
- any mutation of `v0.9.3` tag/package/GitHub Release.

## Security and authorization

- Detection uses non-secret selected-root repository markers only.
- Signing keys, keystores, certificates, provisioning profiles, store tokens, service-account files, secret environment values, and sensitive device identifiers are never collected or persisted by the profile.
- Repository script configuration is evidence, not authorization.
- General verification must not auto-import visibly sensitive signing/publication/deployment/store/device-farm scripts.
- HUMAN DECISION/manual execution is required for sensitive-effect actions.
- The classifier is a conservative guardrail, not a complete semantic proof; hidden effects inside nested scripts remain a project review responsibility.

## Implementation plan

1. Complete deterministic detection + explicit selector + Doctor inspection.
2. Add first-party React Native guidance and script-derived verification mapping.
3. Enable only the approved auto-selected `generic, javascript, or typescript -> react-native` lifecycle specialization through the existing transactional update engine.
4. Add nested-root, explicit-choice, conflict, rollback/idempotence, and Stage 10 plugin coexistence coverage.
5. Add distinct first-party fixture, dogfood, package validation, and docs/changelog/roadmap synchronization.
6. Perform static self-review, then run one complete exact-head Windows gate.
7. Resolve fresh external review findings, finalize Task Pack, rerun the same exact-head gate on the finalization head, then merge.

## Verification commands

The executable acceptance gate is intentionally deferred until all implementation slices are present on one exact head.

Planned final gate:

- focused Stage 11 tests;
- existing Doctor/update/CLI/community-plugin/workspace regressions;
- `npm run check`;
- `npm run validate`;
- `npm run pack:check`;
- Stage 11 fixture/dogfood assertions;
- exact-head clean-tree/revision evidence.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| DEFECT | fixed before full-stage implementation | Initial Slice 1 app-marker checks used `stat`, which could follow symlinks. | Switched to `lstat`; selected-root symlinks are not React Native application markers. | #73 concurrent replacement remains separate. |
| DEFECT | fixed before full-stage implementation | Initial specialization fields were missing on one rare lifecycle assessment return shape. | Specialization state is additive on every assessment shape. | none known. |
| DEFECT | superseded by full-stage scope | Slice 1 deliberately deferred lifecycle apply, but the agreed delivery unit is complete Stage 11. | Full implementation now enables only the accepted `generic, javascript, or typescript -> react-native` auto specialization after profile/guidance/verification support exists. | Exact-head lifecycle tests still required. |
| DEFECT | fixed in changed-surface audit | Doctor/CLI documentation still contained Slice 1/deferred-specialization and pre-React-Native selector wording after the full implementation landed. | Synchronized Doctor lifecycle semantics, CLI selector/options/safety text, and Roadmap Stage 10/11 wording on the implementation head. | Final exact-head docs/package gate still required. |
| DEFECT | fixed in changed-surface audit | Full-stage acceptance lacked explicit plugin-free Context Pack dogfood and a regression that auto-selected Go/Python never specialize to React Native. | Added first-party fixture init/task/context dogfood with zero plugins, explicit selector preservation, and Go/Python non-specialization lifecycle regressions. | Execution evidence pending final gate. |
| DEFECT | fixed in exact-head static audit | Requiring a regular-file `package.json` inside the shared Node evidence helper unintentionally changed historical JavaScript/TypeScript command discovery for projects using a symlinked package manifest. | Restrict the no-symlink requirement to React Native authority detection only; preserve historical Node fallback/command evidence and add a regression proving a symlinked package cannot grant mobile authority. | Existing generic Node symlink semantics remain unchanged; #73 remains separate. |
| DEFECT | fixed before pre-final gate | Stage 11 mobile docs/fixture were package-visible through `package.json` and framework validation, but `.github/release-policy.json` did not yet require them, so a future package-surface regression could evade release-check. | Added the Stage 11 mobile contract, provenance runtime, and complete first-party fixture surface to `requiredPackageFiles`. | Future release preparation must still re-baseline `previousRelease` separately; this change does not imply a next version. |
| SECURITY | must preserve | Current generic verifier has no effect-aware sensitive-action approval gate. | React Native profile does not invent native commands and does not auto-import visibly sensitive-effect scripts; sensitive actions stay HUMAN DECISION/manual. | Nested scripts can hide effects; project review remains required. |
| RISK | follow-up candidate | #69 Linux/hosted execution compatibility remains open. | Preserve accepted Windows exact-head final gate. | Cross-OS hosted proof remains pending. |
| RISK | follow-up candidate | #73 concurrent local filesystem replacement remains unresolved. | Do not widen atomic/concurrent filesystem claims. | Concurrent replacement remains outside current guarantee. |
| NO ACTION | n/a | Stage 10 plugin authority remains separate/additive. | Coexistence regression added rather than changing plugin trust model. | none known. |
| DEFECT | fixed from fresh external review | Task Pack evidence used unescaped pipe characters inside a Markdown table cell, breaking the five-column structure. | Reworded the specialization family as `generic, javascript, or typescript -> react-native`. | none. |
| DEFECT | fixed from fresh external review | The first-party fixture exposed `TYPECHECK_COMMAND=npm run typecheck`, but that helper only validated `tsconfig.json` flags and did not type-check source. | Removed the fixture `typecheck` script, folded config validation into `CHECK_COMMAND`, and left TypeScript applicability as `<define or n/a>` until a real source checker exists. | The fixture deliberately proves truthful unresolved typecheck applicability rather than pretending a compiler exists. |
| SECURITY | fixed from fresh external review | The visible-script sensitive-effect classifier missed common native signing tools whose names do not match the generic `sign` word boundary. | Added `codesign`, `apksigner`, `jarsigner`, `productsign`, and `signtool` patterns plus focused classifier regressions. | Nested/indirect script effects still require project review as documented. |
| NO ACTION | n/a | Dependency Graph Engine / Slice D remains deferred. | No Stage 11 graph/scheduler work. | revisit only with new dogfood evidence. |

## Finalization

- [x] Acceptance criteria satisfied.
- [x] Full Stage 11 implementation is present on one branch/head before executable acceptance testing.
- [x] Pre-final focused/full/package/dogfood gate passed.
- [x] Fresh changed-surface review complete with zero unresolved must-fix findings.
- [x] Task Pack-only finalization performed with `Status: Done`.
- Pre-final gate evidence: exact head `c7af26129f5612b30e3f35eebf3b832c8fc6e9ce` on fresh Windows clone — focused suite 126/126 pass, consumer init regression passed (installed validator green, no provider runtime leak), first-party mobile fixture 3/3, `npm run validate` 409/409, package surface `PACKAGE_FILES=182` vs `RELEASE_POLICY_REQUIRED=27` PASS, diff/clean-tree guards green, immutable `v0.9.3` identity intact (tag object `2dba09f0375574d880ace812f9f7aae6ce5f222e`, peels to `dc3c6a6572e1b86994de5a46cfb8fc815ed45378`).
- [ ] Same complete exact-head gate rerun on unchanged finalization head.
- [ ] Merge only after the post-finalization rerun is green.

## Completion report

- What changed and why: complete Stage 11 React Native-first implementation delivered on PR #85; finalization recorded, post-finalization exact-head rerun pending.
- Final accepted verification: pre-final gate green at `c7af261…`; the same complete gate must rerun green on the unchanged finalization head before merge.
- Superseded failed evidence: `258c2de…` gate superseded by review-cleanup head; `npm run pack:check` ENOSPC attempt on `c7af261…` was environmental and superseded by the full fresh-clone rerun recorded above.
- Independent review evidence updated: yes, current findings retained above.
- Migration/operational impact: additive profile/lifecycle specialization; no manifest schema migration.
- Remaining risks/limitations: #69 and #73 remain non-blocking; sensitive nested script semantics require project review.
