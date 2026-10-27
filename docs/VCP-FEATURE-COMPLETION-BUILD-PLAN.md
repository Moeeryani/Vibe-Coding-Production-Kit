# VCP — Feature Completion Construction Plan

**Date:** 2026-10-26  
**Type:** evidence-informed execution plan, NOT a release or acceptance decision  
**Source repository:** `Moeeryani/Vibe-Coding-Production-Kit`  
**Verified integrated construction baseline:** `9f9202d205e1704c3d05d844e48f41b962036928`  
**Git tree:** `45f00d57faa8c391ed0260050a40849ff5920a22`  
**Released baseline:** v0.9.3 (immutable)  
**Unreleased development package version in integrated source:** 0.9.4

## 1. Authoritative product contract

VCP is a repository-native, deterministic, external-agent-agnostic **engineering control plane for AI coding agents**, not merely a packaged skill or an LLM runtime. The agent does discovery and drafts work; the human controls genuine decisions; VCP preserves evidence, approved decisions, negative decisions, task/readiness/implementation/verification/review state and safe lifecycle operations. Target experience: state the intent, approve genuinely human decisions, review evidence and follow-ups.

Canonical sources inspected:

- `docs/ROADMAP.md` — owner of stage order, lifecycle and completion criteria. **Its top-line current-stage summary is stale relative to later development branches; do not interpret it as the current Git HEAD.**
- `docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md`, especially §§7.2–7.6 and execution Phase 2–10 — implementation target and checkpoints.
- `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md` — integration/dependency companion, originally inspected on older main. Revalidate claims against the pinned integrated source.
- `docs/ADAPTIVE-VCP-DECISIONS.md` — human decisions and D-01 constraint.
- Issue #103, draft PRs #104–#108, Stage 14 Task Pack and acceptance matrix — existing, largely constructed features that must NOT be reconstructed from scratch.
- Independent Phase N+4 R1 Linux report — exact independent acceptance and remaining security limitations.

## 2. Verified Git lineage and current status

The GitHub comparison establishes that `9f9202d` is a **descendant** of both:

- Stage 14 / Adaptive Phase 2 review SHA `de8faa19c6959c4188632e2e908909db485c3ef3` (0 behind, 263 commits ahead).
- Stage 12/13/Windows draft PR #108 SHA `b36b0997c4a52a85bac2a3ee630484448564fc65` (0 behind, 38 commits ahead).

The feature files `lib/asset-catalog.mjs`, `lib/consumer-asset-health.mjs`, `lib/consumer-asset-retirement-plan.mjs`, and Stage 14 tests/docs are present on the integrated R1 tree. **No need to re-implement Stage 14 or blindly merge draft PRs.**

`main` remains `8ccb276545fdb3cc301ce7ce324812eb4c314586`; PR #108 remains OPEN/DRAFT at `b36b0997…`. No main merge, release, or tag follows from this plan. Stage 14 code construction does not imply Checkpoint A GO; Stage 12/13 full acceptance or Windows-native durability is still blocked.

### Distinguish three separate types of progress

| Dimension | Current interpretation |
|---|---|
| Functional source construction | Stages 3–10 released in v0.9.3; Stage 11 merged with historical evidence gap; Stage12/13/14 draft source has been constructed along the integrated lineage. Adaptive Phases 3–10 remain to be built against this lineage. |
| Security validation | Phases N through N+4 R1 narrow security scopes accepted; full transaction containment NOT_PROVEN, Linux total validation PARTIAL. |
| Shipping/operational authorization | Checkpoint A NO-GO, D-01 DEFERRED, G-FENCE NO-GO, Windows production principal provider null, writers DISABLED, B-2 NOT_PROVEN; do not merge, tag or release based on source construction alone. |

## 3. Construction priority — build functionality rather than opening unlimited N+ phases

| Order | Capability package | Deliverable at construction freeze | Dependencies and boundaries |
|---|---|---|---|
| 0 | Stage 14 / Phase 2 preservation | Preserve the already authored consumer asset catalog, asset-set semantics, on-demand package prompts, Doctor health and read-only retirement plan. Only repair proven cross-feature integration problems. | Feature source present; Checkpoint A acceptance still separate and NO-GO. |
| 1 | Adaptive Phase 3 — CI inspection and legacy workflow transition | Multi-provider read-only CI inventory; Doctor coverage truth; explicit read-only legacy managed workflow DELETE/DETACH/PRESERVE decision plan; issue/PR scaffolding separate; no CI workflow generated. | Stage 14 asset provenance; no uncontrolled lifecycle writes; Phase 8 owns generated CI. |
| 2 | Adaptive Phase 4 — deterministic capability foundation | Normalized detected/proposed/applied capability records; bounded first-party detectors; stack bridge; manifest application provenance; Doctor/Context/Task/update integration; polyglot scenarios. | Strong read-only detection and project-root safety; no automatic approval of proposed commands. |
| 3 | Adaptive Checkpoint B | Measurable detection correctness, unknown rate, false positives, commands proposed vs approved, interrupt burden, context size; GO/SIMPLIFY/STOP-DEFER decision artifact. | A checkpoint **measurement** and decision, not a new long-running N+ engineering stage. Do not invent GO. |
| 4 | Adaptive Phase 5 — declarative profiles | Strict community schema v2, bounded detector DSL, explicit grants, first-party definitions, compat with schema v1 and Stage 11 React Native; no arbitrary code execution/network. | Phase 4 normalized capabilities; existing Stage 10 plugin policy immutable. |
| 5 | Adaptive Phase 6 — workflow mode and router Skill | Persist Auto/Manual workflowMode; Doctor/status/mode changes; thin package-owned `skills/vcp/SKILL.md` entrypoint using real deterministic commands; preserve external agent neutrality. | Router is UX, not an embedded agent or decision authority. Do not simulate Phase 7 gate. |
| 6 | Adaptive Phase 7 — workflow levels and mechanical gate | Shared task-state reader; `vcp gate` preview/run; freshness of Git evidence; L0–L3 classification, promotion and final diff reclassification; deterministic refusal and human approvals. | Gate's authority is internal and deterministic; only code plus tests here; Phase 8 owns CI wiring. |
| 7 | Adaptive Checkpoint C | Measure routing accuracy, false positives, human interruptions, actual defects/bypasses caught and gate friction; decision record. | Must precede Phase 8 mandatory integrations. |
| 8 | Adaptive Phase 8 — CI gate integration | Gate policy + provider-neutral integration points; snippets after project-owned bootstrap; explicit task slug; fail closed on missing/shallow refs; only generate workflow when prerequisites proven and accepted. | No GitHub Actions runner claims; this account's Actions unavailable. Build source and isolated fixtures, obtain external enforcement later. |
| 9 | Adaptive Phase 9 — Skills UX expansion | Thin progressively disclosed discovery/grill/review/retro Skills and on-demand references, all routed to canonical VCP commands; installation and prompt-eval conformance. | No duplicated Core policy or markdown-only features. |
| 10 | Adaptive Checkpoint D + Checkpoint E | Prove complexity reduction and real model/tool compatibility; record deletion/simplification decisions and limitations. | Separate manual/empirical acceptance, not invented source PASS. |
| 11 | Adaptive Phase 10 — conformance/release hardening | End-to-end cross-agent, fresh-clone, installed package, legacy/migration, CI, capability, mode, gate, security, docs, provenance, regression and operator/release artifacts. | Production, Windows durable writer, D-01, B-2 and Checkpoint A remain independent explicit release gates. |

**Dependency note:** This list preserves the original Adaptive Phase 3–10 contract. It is NOT an invented new project scope and is not a mandate to ship Phases 3–10 before Checkpoint A. Construction can continue on isolated unreleased branches; rollout and acceptance retain their checkpoint order.

## 4. Current construction started — Phase 3 Slice A

A source-only bundle has been authored with:

- `lib/ci-inspection.mjs`: bounded, read-only GitHub Actions/GitLab/Circle/Azure/custom CI marker detector, explicit coverage limits, no command execution, no external requests.
- `test/ci-inspection.test.mjs`: six source tests for absent CI, multi-provider, textual gate evidence, custom CI, linked workflow directories, oversized configurations.
- `apply_phase3_slice_a.py`: exact-baseline, clean-worktree, feature-branch-only Doctor integration script. It updates `ciCoverage` and human-readable Doctor output without altering Doctor's health exit behavior.
- `docs/ADAPTIVE-PHASE3-CI-BUILD-STATUS.md`: feature status and remaining integration work.

**Local smoke performed:** syntax of the new module and its test; six isolated checks against a stand-in safe-read implementation. All six passed. **Not performed:** running against the actual VCP `safe-read.mjs`, Doctor integration test, full tests, Windows/NTFS, published GitHub source, independent acceptance. The module is an initial source candidate, not a passed product feature.

Apply the bundle only on the pinned R1 source in an isolated local feature branch. It deliberately does **not** push, commit, merge, run a release or change security gates.

## 5. Construction method (authoritative for this build campaign)

1. Build from a clean isolated clone of the `9f9202d` integrated baseline (not `main`, old PR #104, or an older Stage12 tree).
2. Keep one advancing **local integration branch**, with small auditable feature commits; each new functional workstream branches from the latest verified integrated construction tip. Avoid parallel mutually divergent branch trees and uncontrolled cherry-picks.
3. For each Adaptive phase, implement product code + migration design + docs + new tests/fixtures in coherent batches. Perform syntax/type/localized checks when needed to catch source defects early, **not** a full independent campaign after each small fix.
4. Before moving to the next phase, ensure its source contract is mechanically inspectable, code review is completed, security gates preserved, and no unresolved design conflict would invalidate downstream work. Mark `SOURCE COMPLETE / NOT ACCEPTED` where warranted.
5. Record each risk/finding once with owner, severity, affected interface, safe behavior and release-blocking classification. PH-06's concurrent journal creation is a **real** pre-existing defect; record it for targeted resolution before relying on exclusive production journal semantics, but do not halt unrelated feature source construction.
6. Keep historical release version `v0.9.3` immutable; `0.9.4` remains an unreleased development version. No tags/npm publish until explicit owner release decision.
7. After the full planned construction set and frozen integrated HEAD: independent Linux + native Windows/NTFS campaign for applicable scopes, security/contract tests, full test+pack, true user-workflow dogfood, Checkpoint decisions and release gates. No fabricated green statuses.
8. If a critical defect compromises the feature actively being built (data loss, unauthorized write, false authorization), fix in that phase. Other known risks remain in the release security ledger; do not open an unbounded sequence of N+ phases.

## 6. Explicit safety and acceptance ledger

- `D-01 = DEFERRED`
- `G-FENCE = NO-GO`
- `B-2 = NOT_PROVEN`
- `WINDOWS_PRINCIPAL_PROVIDER = null`
- `PRODUCTION_WRITERS = DISABLED`
- `FULL_TRANSACTION_CONTAINMENT = NOT_PROVEN`
- `LINUX_VALIDATION = PARTIAL`
- `B9-01b = INCONCLUSIVE`
- `PH-06 = PRE-EXISTING INTERMITTENT CONCURRENT-JOURNAL-CREATION DEFECT`
- `X-05 = OPEN`
- `R-4 / R-5 / R-6 = OPEN`
- `CHECKPOINT A = PENDING / NO-GO`
- `STAGE 14 = SOURCE BUILT; INDEPENDENT END-TO-END ACCEPTANCE NOT ESTABLISHED`

Release acceptance requires a distinct owner decision, complete necessary security proofs, and no accidental promotion of source-only progress into production authority.

## 7. Next concrete builder actions

1. Create **local** branch `feat/adaptive-phase3-ci-inspection-build-20261026` at exact R1 SHA/tree.
2. Apply `VCP_Adaptive_Phase3_Slice_A_Source.zip` using its guarded installer. Review source diff and correct any real in-repository integration issues; do not claim stand-in tests are sufficient.
3. Finish Phase 3 B–E: read-only workflow detach plan; Doctor status/health truth; lifecycle integration and negative fixtures; docs and package invariants. Do not generate CI or change writing authority.
4. Continue Phases 4–10 by the explicit dependency order above, retaining checkpoints as review/rollout gates and building source first.
5. Return frozen integrated feature-construction SHA, changed-file inventory, source verification results, known blockers and a **single consolidated independent acceptance handoff** after the construction campaign.
