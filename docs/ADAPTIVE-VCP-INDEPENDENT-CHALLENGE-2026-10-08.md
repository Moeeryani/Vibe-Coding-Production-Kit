# Adaptive VCP — Independent Code/Design Challenge Audit (2026-10-08)

**Status:** Independent evidence review; not a green executable gate  
**Base:** `main` at `8ccb276545fdb3cc301ce7ce324812eb4c314586`  
**Scope:** Independent challenge of the strategic plan, technical code integration analysis, and the existing consolidated audit before Stage 12 implementation.  
**Product code modified:** No.  
**Parent documents:** `docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md`, `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md`, `docs/ADAPTIVE-VCP-FINAL-PREIMPLEMENTATION-AUDIT.md`.

## 1. Outcome and evidence boundary

The **core architecture remains justified**: external coding agents handle reasoning and task UX; VCP owns deterministic lifecycle, state, verification, freshness, and fail-closed gates. The planned Stage 12/13 boundary is sound: Stage 12 supports speculative brownfield preview, while Stage 13 obtains the lifecycle lock and recomputes a fresh plan before mutation.

However, **do not equate the existing “41/41 contracts aligned” assertion with runnable correctness**. That is a cross-document consistency result, not passing migration, transactional, cross-platform, or package tests. This review independently inspected connected GitHub source and the current test inventory; executable checks were not run here.

A direct checkout attempt in the available execution environment failed before code checkout:

~~~text
fatal: unable to access 'https://github.com/Moeeryani/Vibe-Coding-Production-Kit.git/':
Could not resolve host: github.com
~~~

Therefore the status is:

| Assurance layer | Result |
|---|---|
| Design direction and staged separation | Supported by inspected code and external references |
| Existing v0.9 implementation risks | Directly confirmed in code |
| Both Adaptive documents describe these risks | Confirmed for sampled load-bearing contracts |
| New Stage 12 behavior exists | No — it remains proposed |
| Stage 12 acceptance tests run | Not executed in this independent pass |
| Current-main executable re-baseline | Not established by this review |
| Entire Adaptive roadmap authorized for implementation | No |
| Bounded Stage 12 design handoff | Reasonable **after** the Roadmap's executable re-baseline precondition |

**Do not use “all points verified” or “ready to merge” for this review.** The coverage below identifies precisely what was rechecked and what still requires executable evidence.

## 2. External design references checked

1. **Terraform plan/apply freshness:** the official CLI documents distinguish a speculative preview from a saved plan; applying without a saved plan computes a fresh plan. VCP appropriately chooses speculative preview + fresh re-plan under lock, not persisted executable previews. https://developer.hashicorp.com/terraform/cli/commands/plan
2. **GitHub Actions merge queue:** a required Actions status check must run on `merge_group` when merge queue is used, or the queue may never receive its required check. Phase 8 must test the installed repository's actual ruleset/queue configuration rather than assume PR-only runs are sufficient. https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
3. **Agent Skills progressive disclosure:** Skills can keep startup metadata small and load deeper instructions on demand, but this is platform-specific UX behavior, not a safety guarantee. VCP's Core must not depend on a particular host lazily loading SKILL.md. https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

These references support the broad architecture; they do not verify VCP implementation.

## 3. Real-code trace and implementation-impact findings

### A. Brownfield Smart Init and option provenance — CONFIRMED; Stage 12 priority

**Current code:** `lib/cli.mjs` initializes `includeGitHub: true`; `promptForOptions()` resolves `--yes` with `parsed.agent ?? 'generic'` and `parsed.stack ?? 'auto'`. `lib/init.mjs` initializes `agent='generic'`, `includeGitHub=true`, calls `buildDesiredFiles()`, treats every existing desired path as a collision and can overwrite through `force`.

**Effect:** Absent option is indistinguishable from an explicit decision after prompt resolution. An existing Claude/Copilot project could be misinterpreted as explicitly generic, and unspecified GitHub preference could install optional assets.

**Correct fix:** Preserve raw `agentPreference`, `githubPreference`, and selected-stack provenance through repository inspection. Infer existing agent surfaces only as evidence, not consent. Make positive/negative GitHub options independently representable and conflict checked. Keep greenfield backward compatibility where explicitly planned.

**Connections:** `cli → init-plan → adapters/template → manifest.install → update-plan → manage/Doctor`; public CLI help and onboarding must use the same resolved preference.

**Proof:** Test `--yes` with existing `CLAUDE.md`, Copilot instructions, both, neither, explicitly generic, explicitly all, GitHub include/exclude/unspecified, and contradictory flags. Re-run update to prove adapter intent and ownership remain stable.

**Disposition:** The two design documents already cover this. No new product module is warranted beyond the Stage 12 planner/option normalization.

### B. Full template expansion is not an acceptable brownfield desired state — CONFIRMED

**Current code:** `lib/template.mjs` expands `CORE_ASSET_ROOTS` including entire `docs/`, `prompts/`, and framework validator scripts; `GITHUB_ASSET_ROOTS` includes `.github/workflows/validate.yml`. `buildDesiredFiles()` has no adopted `assetSet` parameter.

**Effect:** Even a safe collision-aware planner could propose an unnecessarily large framework footprint. Worse, a minimal Smart Init without persisted `assetSet` would be reversed by the next `vcp update`.

**Correct fix:** One classified asset catalog, install-profile-specific selection, persisted `assetSet`, and assetSet-aware desired state for update, Doctor, manage track, migration and package smoke. Legacy-full and brownfield-minimal are *not* one identical installed path set.

**Proof:** Snapshot exact planned files for an empty repo, mature TS app, Python service, Go app, and mixed monorepo. For minimal brownfield: no framework docs/source validators/npm-specific CI by default. After adoption, `vcp update --dry-run` must not propose skipped legacy assets.

**Disposition:** Existing documents cover this dependency; it is a hard Stage 12/13 acceptance boundary.

### C. Whole-file vs section ownership, versioned reader semantics — CONFIRMED

**Current code:** `lib/state.mjs` has `MANIFEST_SCHEMA_VERSION=1`, creates whole-file baselines through `snapshotBaselines()`, and validates only broad manifest shape in `readManifest()`. Unknown per-file fields can survive without being understood.

**Effect:** Introducing section-owned baselines in schema v1 could make an older CLI read them as whole-file baselines and mutate surrounding user content.

**Correct fix:** Distinguish `ownership.kind=file|section` from `policy=managed|merge|generated|preserve`; migrate v1 entries as file-owned; bump structural schema; introduce fail-closed `minimumReaderVersion` for future behavior-bearing same-schema semantics. Section extraction/merge/reconstruction must preserve unowned bytes and reject malformed/colliding markers.

**Proof:** Old released CLI rejects new schema; new CLI migrates/round-trips current v1; same-schema older reader rejects newer reader guard; marker manipulation, code fences, duplicate/nested markers, ignore/retrack and update/rollback have negative tests.

**Disposition:** Described in the current design. Require **published-version** compatibility smoke, not just running two current-source variants.

### D. First-adoption locking and rollback must restore *absence* — CONFIRMED

**Current code:** `acquireUpdateLock()` creates `.vcp/` before a backup exists. `applyUpdate()` locks, replans, then backs up. `restoreBackup()` restores prior manifest/baselines when backups exist but, by itself, does not express absence of prior lifecycle state.

**Effect:** Early conflict or failure on an unmanaged repository can leave stray state, and a reused update backup without prior-presence metadata could leave a false managed manifest.

**Correct fix:** First-adoption-aware lock bootstrap cleanup and generalized transaction recovery recording old manifest/baselines/.vcp path presence. Abort before backup must release lock and remove only an operation-created *empty* VCP directory. Never recursively delete unknown pre-existing state.

**Proof:** Fault injection at every boundary: lock acquired, re-plan, conflict, backup, staged writes, managed-section composition, baseline write, manifest write, post-apply verification. Compare pre/post file tree/content/modes for all failed cases; no false managed state.

**Disposition:** The current design covers the conceptual fix. Its implementation must reuse update mechanics without adding a second weaker engine.

### E. Verification-command authority is currently first-match — CONFIRMED

**Current code:** `lib/verification-commands.mjs` and `lib/doctor.mjs` use the first regular-expression match for `*_COMMAND=` slots within `AGENTS.md`.

**Effect:** Composing a VCP block into a mature `AGENTS.md` can result in multiple command declarations, ambiguous authority, or outdated task snapshots. This is also an execution-risk boundary because command text may be untrusted.

**Correct fix:** One shared authority inspection, with missing/unique/equivalent duplicate/conflicting duplicate states, command fingerprint/provenance, and explicit human authorization for sensitive/destructive patterns. Task creation, Doctor, readiness and future gate must consume the same effective decision. A temporary decision/answers record is not a license to reuse stale approvals after commands change.

**Proof:** Existing identical/contradictory declarations, changes after preview, tampered answers receipt, sensitive command authorization, and task snapshot staleness. No first-match fallback or silent execution.

**Disposition:** Already planned, but it deserves its own Stage 12 negative-test group and Stage 13 exact-current-authority revalidation.

### F. Packaged prompt fallback and Doctor/starter docs are coupled — CONFIRMED

**Current code:** `lib/doctor.mjs` has hard-coded `CORE_DOCS` paths and first-match verification parsing; existing Context Packs primarily depend on project-local prompt files.

**Effect:** Correctly minimal brownfield install may be classified unhealthy because project-local VCP starters/prompts intentionally do not exist. Conversely a packaged prompt must not masquerade as a project-governing Source of Truth.

**Correct fix:** Canonical allowlisted package-prompt resolver + confined project overrides, typed context identity, byte budget, and Doctor checks split into VCP install integrity vs informational project-governance coverage. Render thin brownfield AGENTS instructions aware of the selected asset profile.

**Proof:** Project override wins, package fallback works, symlink/escape is rejected, no arbitrary package URI reads, packaged prompt never satisfies Source-of-Truth authority, and Doctor strict does not fail solely because greenfield starters were not installed.

**Disposition:** Required minimum Doctor/prompt behavior is Stage 12, not all deferred to Phase 2.

### G. Composable capabilities and Stage 11 compatibility — DESIGN VALID; NOT STAGE 12

**Current code:** `lib/stacks.mjs` resolves one stack; merged Stage 11 includes `react-native`, selected-root evidence and bounded re-profiling in `lib/stack-provenance.mjs`.

**Effect:** A capability migration that blindly reclassifies existing installs would lose requestedStack provenance and could silently change verification commands/managed guidance.

**Correct fix:** Preserve legacy stack summary and install intent; separately model deterministic evidence, application authority and provenance. Core/first-party eligibility differs from community detector evidence. Model `unknown` rather than fake certainty in polyglot roots.

**Proof:** v0.9 React Native auto-specialization, explicit generic, unknown legacy provenance, mixed roots, symlinked markers, and community-selected profiles retain prior safety behavior. No new legacy `mixed` selector unless all consumers are migrated.

**Disposition:** Phase 4+ only. Existing Stage 11 runtime is real; its missing historical final closeout gate is separately recorded.

### H. Community detector DSL, CI, modes, levels, Skills and gate — ARCHITECTURE PATH VALID; FUTURE WORK

The docs correctly separate:

- `workflowMode` (Auto/Manual routing), `workflowLevel` (L0–L3 ceremony), `executionMode` (AFK/HITL), `contextMode` (plan/implement/review/security/release), and `gatePolicy` (merge enforcement);
- Skills/adapters as best-effort user-facing routing, never as deterministic gate authority;
- detected community predicate evidence from actually applied project capabilities;
- agent/review narratives from shell exit codes, Git provenance and durable evidence;
- independent review head from a bounded, semantically checked task-finalization head.

Important later-phase negative tests:

- no explicit L0 policy → minimum L1;
- a Markdown governing document is not trivially L0 based on extension;
- old no-level Task Packs normalize L2;
- L1 promotion expands the *same* Task Pack without overwriting evidence;
- L3 security profiles remain restricted to dedicated security-context mode;
- post-review edits to acceptance/scope invalidate the reviewed head even when only the Task Pack path changed;
- Manual + required gate makes the merge requirement explicit;
- merge-queue required checks emit `merge_group` where needed.

These are coherent future contracts, not executable claims about current code.

## 4. Cross-document crosswalk (independently sampled)

| Workstream | Strategic target | Technical integration | Observed source | Audit judgment |
|---|---|---|---|---|
| Smart Init | Stage 12 preview; Stage 13 transactional apply | inspection/planner/sections/state/update | cli/init/template/state/update | Good design, unimplemented |
| Consumer assets | classified catalog + per-install profile | assetSet-aware desired files, Doctor, migration | template/doctor/update-plan | Required coupling covered |
| Capabilities | evidence vs application; polyglot | legacy stack bridge, provenance, plugins | stacks/stack-provenance | Defer until after adoption |
| Profiles | declarative, bounded, digest/grants | DSL evaluator and trust constraints | community-plugins | Future; no v2 evaluator yet |
| CI | inspect, preserve, optional delegation | provider detection and gate receipt | template CI/current workflow | Merge queue needs platform proof |
| Auto/Manual | routing preference | adapters, Skills, manifest reader guard | adapters/cli | Future; no universal interceptor |
| Workflow levels | L0 conservative; L1 compact; L2 legacy | shared task-state parser/readiness/review | task/readiness | Future; one artifact family |
| Gate | deterministic verification and provenance | verify/Git/review/finalization integration | verify/git-review | Future; no gate yet |
| Conformance | compatibility and negative fixtures | cross-platform + package smoke | current test inventory | Existing tests are a foundation only |
| Complexity ROI | avoid Core bureaucracy | prove failure before durable new machinery | Roadmap Slice C deferral | Correct governance |

This is a focused **independent source/contract challenge**, not an execution of every test proposed by the existing 255-test design inventory. Do not restate its sample-based checks as a new 41/41 or 255/255 validation.

## 5. Existing tests that must change with Stage 12

The checked-in suite already contains tests proving **current v0.9 behavior**. In particular:

- `test/cli.test.mjs` currently expects full framework/GitHub asset installation, init collision behavior with `--force`, and the current dry-run shape;
- `test/update-init-guard.test.mjs` expects init to refuse reinit even when `--force` is supplied;
- `test/update-lifecycle.test.mjs` covers current manifest requested/resolved stack semantics and React Native specialization;
- `test/update-manage.test.mjs` covers whole-file ignore/track assumptions;
- `test/update-transaction.test.mjs` covers current locking, schema rejection and corrupted transaction safety;
- `test/doctor-coverage.test.mjs` covers current starter-document reporting;
- `test/verification-commands.test.mjs` covers current first-match command parsing;
- `test/release-portability.test.mjs` covers source/package portability.

These are not failures. They are compatibility contracts that must be migrated deliberately with the Stage 12 change.

A responsible implementation change must distinguish:

1. legacy-full installs preserving their existing semantics;
2. new minimal-brownfield preview semantics;
3. schema-v1-to-v2 managed migration semantics;
4. unchanged same-version update idempotence;
5. published old-CLI incompatibility behavior when a new schema/reader guard appears.

Do not delete a failing old test solely because the new architecture is different. Replace its assertion with either a legacy-compatibility fixture or an explicitly justified new Stage-12 contract.

## 6. Extra audit risk: what the prior consolidated “complete” result cannot prove

The existing consolidated report's conclusion that 41 named contracts are mutually compatible is useful **as a design artifact**. It cannot prove:

- an interrupted installation can restore exact pre-init filesystem state;
- the old published CLI fails closed against a future schema-v2 manifest;
- section composition is byte-preserving across platforms/editors;
- package prompts resolve correctly from a packed npm installation;
- an actual representative brownfield repo accepts minimal VCP without unwanted CI/docs mutation;
- first-install lock cleanup survives race/fault injection;
- GitHub checks/branch protection really enforce merge policy;
- model/agent routing behaves consistently across hosts.

Those require executable and platform-specific evidence. Prior “PASS” should always carry its design-only qualifier.

## 7. Required implementation-start gate and acceptance evidence

**Before Stage 12 product-code work:**

- reconcile the Stage 11/current-main gate evidence per `docs/ROADMAP.md`;
- run and record the accepted executable verification on the current head in an environment that can execute the repository;
- create a bounded Stage 12 Task Pack tied to a known base/head;
- do not mix unrelated Adaptive phases into the Stage 12 PR.

**Stage 12 exit:** in addition to standard tests, show durable results for:

| Test group | Required evidence |
|---|---|
| Fresh repo | Current greenfield no-regression; plan semantics |
| Brownfield preview | Zero writes, deterministic ordered actions, content-free JSON |
| Option provenance | Unspecified vs explicit agent/GitHub/stack selections |
| VCP state readability | malformed, unsupported, newer reader, interrupted managed |
| Sections | markers, code fences, unchanged surrounding bytes |
| Schema/reader | v1 migration; published-old-reader refusal; guard changes |
| Asset profile | minimal vs legacy; next update does not expand |
| Prompt/Doctor | canonical fallback, project override, no false install failure |
| Command authority | equivalent/conflicting duplicates, approval/fingerprint/freshness |
| Regression | existing v0.9 update, React Native, plugins, root confinement |
| Package/release | packed-package consumer smoke and retained migration assets |

**Stage 13 exit (not Stage 12):** fault-injected transactional apply/rollback, recovery of initial absence, post-lock re-plan freshness, idempotence and immediate subsequent update.

**Go/no-go:** documentation alignment is **necessary but not sufficient**. Implementation approval must be based on code changes and the executable evidence above, with current-head provenance.

## 8. Audit recommendation

Proceed with **bounded Stage 12 contract and executable re-baseline**, not the whole Adaptive redesign. Maintain the two large Adaptive documents as strategic/technical authorities; do not duplicate them into this review.

This independent review **confirms several real pre-implementation risks and finds no demonstrated reason to reverse the architecture**, but it does **not independently certify every paragraph or run the existing test suite**. The outstanding blocker is executable proof, not another large design feature.

If Stage 12 uncovers a conflict with the accepted contract, stop that slice, update the smallest necessary design section, and add a failing regression test before changing lifecycle behavior.
