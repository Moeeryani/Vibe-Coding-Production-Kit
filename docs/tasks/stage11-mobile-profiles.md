# Task — Design Stage 11 deterministic Mobile Profiles

Status: Draft
Slug: `stage11-mobile-profiles`

## Outcome

VCP has an approved, bounded design for deterministic first-party mobile profiles that preserves existing stack, workspace, lifecycle, security, verification, and Stage 10 plugin trust contracts before any Stage 11 product implementation begins.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Stage 11 design issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/82 |
| Roadmap re-baseline issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/81 |
| Released baseline | `v0.9.3` / `dc3c6a6572e1b86994de5a46cfb8fc815ed45378` |
| Community plugin contract | `docs/COMMUNITY-PLUGINS.md` |
| Update/lifecycle contract | `docs/UPDATES.md` |

## Requirement restatement

Define built-in mobile support as a deterministic first-party VCP capability without treating the Stage 10 React Native-readiness plugin fixture as built-in authority, inventing verification commands, weakening explicit project/workspace boundaries, or automating mobile signing/deployment decisions.

## HUMAN DECISION before implementation

Select the first built-in ecosystem boundary.

### Proposal A — recommended

Ship the Stage 11 framework plus **React Native as the first built-in supported profile**. Flutter, native iOS, and native Android remain explicit follow-ups until independently designed and evidenced.

### Alternative B

Ship only a generic mobile-profile framework with no built-in supported ecosystem.

### Alternative C

Ship multiple ecosystems in Stage 11. This materially expands detection, tooling, lifecycle, security, fixture, and conformance scope and is not recommended for the first bounded stage.

**State:** PROPOSED — NOT APPROVED. No implementation may encode A/B/C until the human decision is explicit.

## Acceptance criteria

- [ ] AC-001 — first built-in ecosystem boundary is explicitly approved.
- [ ] AC-002 — deterministic mobile detection evidence, precedence, ambiguity, and negative markers are documented.
- [ ] AC-003 — built-in mobile profile authority is explicitly separated from Stage 10 community plugin guidance.
- [ ] AC-004 — verification discovery uses concrete repository/tool evidence and never invents simulator/device/signing/deploy commands.
- [ ] AC-005 — nested-project/monorepo behavior preserves Stage 5 project/workspace authority and sibling isolation.
- [ ] AC-006 — lifecycle/re-profile/update semantics preserve explicit stack/profile choices, migration continuity, backup/rollback safety, and idempotence.
- [ ] AC-007 — mobile signing credentials, certificates, provisioning, keystores, tokens, device identifiers, and store deployment remain sensitive/HUMAN DECISION boundaries.
- [ ] AC-008 — realistic positive, negative, and ambiguous mobile fixtures are defined before implementation.
- [ ] AC-009 — implementation is decomposed into bounded vertical slices with deterministic executable evidence.
- [ ] AC-010 — Stage 11 preserves immutable `v0.9.3` release identity and does not silently expand #69, #73, or Slice D scope.

## Scope

### In scope for design

- mobile stack/profile detection contract;
- first-party mobile guidance model;
- verification-command discovery;
- Doctor/readiness/context/verify interactions;
- project-root/workspace/nested semantics;
- init/update/re-profile/migration behavior;
- Stage 10 plugin compatibility and precedence;
- mobile-specific security/privacy guidance;
- realistic conformance fixtures and negative lanes;
- docs/package/release evidence expectations.

### Out of scope

- App Store / Play Store publishing;
- automatic signing or provisioning;
- storage/management of signing secrets;
- remote device farms or simulator orchestration;
- dependency scheduler/graph engine;
- remote plugin marketplace;
- universal mobile ecosystem claims;
- modifying immutable `v0.9.3`.

## Affected boundaries

- Stack detection and stored requested/resolved profile provenance.
- Built-in guidance/templates and bounded Context Packs.
- Verification discovery and Task Pack command mapping.
- Doctor/readiness reporting.
- Monorepo/workspace project-root semantics.
- Lifecycle init/update/re-profile/migrations.
- Community plugin composition and trust precedence.
- Package surface, reference fixtures, docs, and release evidence.

## Domain invariants

- Repository evidence outranks naming guesses.
- Explicit profile/stack choices are not silently overridden.
- Built-in profile authority and community plugin guidance are distinct.
- Context is transport, not authorization.
- Verification commands must be evidenced, not invented.
- Signing/publishing/deployment always remains human-controlled.
- Selected project/workspace authority does not widen to siblings or enclosing repository content.
- Released identities remain immutable.

## Security and privacy

- Never collect, persist, print, or infer signing keys, certificates, provisioning profiles, keystores, app-store tokens, private build secrets, or credentials.
- Detection may inspect non-secret repository markers only.
- Guidance may identify sensitive surfaces without reading secret values.
- No generated verification command may sign, deploy, publish, upload, or contact a store/device service without explicit human authorization.
- Mobile permissions/privacy guidance must not claim legal or regulatory compliance.

## Failure modes and edge cases

- generic JavaScript repository falsely detected as mobile;
- multiple conflicting mobile markers;
- stale/transitive package marker mistaken for project authority;
- nested mobile app under non-mobile monorepo root;
- multiple sibling mobile apps;
- explicit generic/non-mobile requested profile conflicting with auto evidence;
- plugin guidance attempting to override built-in/core authority;
- missing or placeholder verification scripts;
- signing/build command requiring secrets or interactive device state;
- unsupported ecosystem markers;
- lifecycle update discovering a new mobile profile but explicit prior choice forbids re-profile;
- package/fixture drift between source and published surface.

## Observability

Design must define human/JSON inspection that explains:

- detected evidence;
- selected built-in profile;
- requested vs resolved profile state;
- ambiguity/blocking reason;
- discovered verification commands;
- active first-party guidance;
- active community-plugin guidance separately;
- lifecycle re-profile transition, when applicable.

## Proposed implementation slices after approval

1. Detection + read-only inspection + ambiguity/negative lanes.
2. First-party mobile guidance + bounded context + plugin authority separation.
3. Verification discovery + readiness/Doctor integration.
4. Nested/workspace + lifecycle re-profile/update/idempotence conformance.
5. Security/privacy guidance + realistic dogfood + full exact-head gate.

## Test plan

### Unit

- detection markers/precedence/ambiguity;
- explicit-choice preservation;
- verification discovery;
- profile/plugin precedence;
- mobile security-boundary rendering.

### Integration / contract

- Doctor/readiness/context/verify with selected mobile profile;
- workspace/nested project boundary behavior;
- lifecycle init/update/re-profile/idempotence;
- package surface and installed CLI behavior.

### E2E / regression

- realistic fresh-clone mobile project dogfood;
- ambiguous/broken mobile fixture;
- Stage 10 community-plugin regression;
- Stage 5 workspace regressions;
- existing generic/JS stack detection and re-profiling regressions;
- full `npm run validate` and `npm run pack:check`.

## Rollout, migration, and recovery

- Stage 11 must be additive for existing non-mobile projects.
- Persisted profile-state changes require an explicit migration.
- Explicit user selections remain preserved.
- Lifecycle changes remain transactional, conflict-aware, backup-protected, rollback-safe, and idempotent.
- Stage 11 ships only after exact-head review/gate/finalization evidence; it does not alter the already released `v0.9.3`.

## Design plan

1. Approve the first built-in ecosystem boundary.
2. Inventory current stack detection, requested/resolved provenance, workspace semantics, verification discovery, lifecycle update behavior, and Stage 10 plugin composition.
3. Specify exact detection markers, precedence, ambiguity, and negative rules.
4. Specify first-party guidance and plugin coexistence/precedence.
5. Specify verification discovery and sensitive command boundaries.
6. Specify nested/workspace and lifecycle behavior.
7. Define fixtures and vertical implementation slices.
8. Run plan readiness/fresh design review before changing product code.

## Verification commands

Design-only PR:

- `git diff --check`;
- documentation/task consistency review;
- no product-code or package-version changes.

Implementation verification will be finalized after AC-001 and the detailed design are approved.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| HUMAN DECISION | blocks implementation, not design | First built-in mobile ecosystem is not yet approved. | Issue #82 proposes React Native-first, generic-framework-only, or multi-ecosystem alternatives. | No product implementation until approved. |
| RISK | non-blocking design input | #69 Linux/hosted conformance remains open. | Preserve accepted Windows exact-head evidence; prove hosted/Linux separately when environment is available. | Cross-OS execution remains unproven. |
| RISK | non-blocking design input | #73 concurrent local filesystem replacement remains unresolved. | Do not widen filesystem trust guarantees or claim atomic snapshots. | Concurrent privileged/local mutation remains outside current guarantee. |
| NO ACTION | deliberate scope boundary | Dependency Graph Engine / Slice D remains deferred. | Do not couple Stage 11 to graph/scheduler implementation. | Revisit only with new dogfood evidence. |

## Finalization

- [ ] First built-in ecosystem HUMAN DECISION approved.
- [ ] Design acceptance criteria complete.
- [ ] Fresh design review complete.
- [ ] Implementation Task Pack/readiness approved.
- [ ] Product-code implementation started only after the above gates.
