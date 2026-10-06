# VCP Roadmap — System Completion Plan

**Status:** Living execution roadmap and system-completion contract
**Released baseline:** VCP `v0.9.3`
**Current candidate:** none — next bounded work is Stage 11 design, not a prepared release candidate

This is the current execution roadmap. Historical handoffs and design documents remain evidence, but this file owns current status, sequencing, dependencies, and completion criteria.

---

## 1. North Star

VCP is an **Engineering Control Plane for AI Coding Agents**.

> AI does the paperwork. Human makes the decisions. VCP preserves the decisions. AI codes within those decisions. VCP verifies the result.

External agents inspect, reason, ask, draft, implement, review, and run VCP. VCP remains deterministic, repository-native, agent-agnostic, scriptable, inspectable, and free of an embedded LLM runtime.

The developer experience should be:

```text
State intent
→ answer only real HUMAN DECISION questions
→ approve/correct important decisions and plan
→ review result + evidence + follow-ups
```

### Non-goals

VCP is not an LLM runtime, cloud scheduler, Kanban SaaS, generic multi-agent platform, deployment platform, issue-tracker replacement, or universal architecture generator.

---

## 2. System Invariants

1. **Discover before asking.** Repository-answerable questions are DISCOVERABLE.
2. **One uncertainty vocabulary:** `DISCOVERABLE / PROPOSABLE / HUMAN DECISION`.
3. **Proposal is not approval.** Conceptually: `DISCOVERED / PROPOSED / APPROVED`.
4. **Preserve negative decisions.** Out-of-scope/rejected choices are durable engineering truth.
5. **AFK does not mean ready.**

```text
AFK + unblocked + no unresolved HUMAN DECISION
+ implementation-ready + executable verification
= eligible
```

6. **Blocked work stays blocked.** An agent never manufactures missing human intent.
7. **Context is a budget.** Chat history is not a required source of truth.
8. **Restartability is required.** A fresh agent should continue from repo + VCP state.
9. **Evidence outranks confidence.** Executed checks outrank narrative claims.
10. **Scope does not silently expand.** Must-fix stays in task; broader work becomes follow-up.
11. **Material review findings are durable.** Preserve finding, disposition, resolution/follow-up, residual risk.
12. **Released identity is immutable.** Never move/recreate released tags or silently rewrite release evidence.

---

## 3. Canonical Lifecycle

```text
INTENT
→ RESEARCH / PROTOTYPE IF NEEDED
→ GRILL / CLARIFICATION
→ SHARED DESIGN CONCEPT
→ DECISION RECORDING
→ PRD / DESTINATION SOURCE OF TRUTH
→ VERTICAL SLICES
→ TASK GRAPH / DEPENDENCIES
→ AFK / HITL CLASSIFICATION
→ PLAN READINESS + PLAN CONTEXT
→ PLAN / APPROVAL
→ IMPLEMENTATION READINESS + ELIGIBILITY
→ IMPLEMENTATION CONTEXT
→ IMPLEMENT
→ DETERMINISTIC FEEDBACK
→ VERIFY
→ FRESH REVIEW
→ MANUAL / PRODUCT QA WHERE NEEDED
→ NEW ISSUES / CORRECTIONS
→ RECLASSIFY + RECOMPUTE
→ REPEAT
→ RELEASE
→ OBSERVE
→ MAINTAIN
```

Every roadmap capability must connect to this lifecycle or to infrastructure that makes it safe.

---

## 4. Current State

### ✅ Current immutable released baseline — v0.9.3

Released and verified:

- npm package: `vibe-coding-production@0.9.3`;
- npm dist-tag: `latest -> 0.9.3`;
- annotated tag: `v0.9.3`;
- tag object: `2dba09f0375574d880ace812f9f7aae6ce5f222e`;
- peeled/release commit: `dc3c6a6572e1b86994de5a46cfb8fc815ed45378`;
- GitHub Release: `Vibe Coding Production Kit v0.9.3`;
- published-registry clean-consumer smoke: both public CLI aliases report `0.9.3`;
- Stages 3–10 are included in this released baseline.

Do not move, delete, recreate, or silently republish the `v0.9.3` release identity.

### ✅ Previous immutable released baseline — v0.9.2

Already released:

- agent-first onboarding;
- deterministic stack detection;
- verification-command discovery;
- bounded Task Packs;
- plan/implementation readiness;
- bounded Context Packs;
- planned greenfield paths;
- deterministic verification + evidence;
- Doctor coverage semantics;
- lifecycle update, migrations, baselines, three-way merge, conflicts, ownership, locks, transactions, backups, rollback, path/symlink safety;
- reference/dogfood projects;
- proven manual release discipline.

Do not recreate, retag, or republish v0.9.2.

### ✅ Post-v0.9.2 workflow protocol — PR #18 / Issue #16

Merged to main.

Canonical guidance now converges across:

- `AGENTS.md`;
- `docs/QUICKSTART.md`;
- `docs/OPERATING-MODEL.md`;
- `docs/TASK-PACKS.md`;
- `docs/CONTEXT-PACKS.md`;
- `prompts/01-discovery.md`;
- `prompts/02-plan-task.md`;
- `prompts/03-implement-task.md`;
- `prompts/04-code-review.md`.

Proven by exact-head validation, realistic feature dogfood, genuine HUMAN DECISION boundaries, fresh review, durable follow-ups, and zero-context restartability.

### ✅ Post-v0.9.2 stack provenance/re-profiling — PR #14 / Issue #8

Merged to main.

Behavior:

- preserve `install.requestedStack` separately from resolved `install.stack`;
- re-profile only when stored stack is `generic`, requested selector is `auto`, and deterministic detection is concrete;
- explicit `generic` remains generic;
- legacy missing-provenance generic remains generic;
- check/JSON/dry-run/apply expose the transition;
- local decisions, conflict blocking, backups, rollback, and idempotence remain intact.

Evidence:

- full validation: **128/128**;
- targeted lifecycle tests: **28/28**;
- four-scenario realistic dogfood;
- final-head review.

### ✅ Executable evidence policy — Issue #15 closed; Linux/hosted follow-up #69

GitHub Actions on this account repeatedly failed before runner assignment and before any repository step executed. Those zero-step failures were infrastructure evidence, not source-test evidence.

VCP now deliberately accepts the proven fresh-clone Windows exact-head maintainer channel as the current long-term executable evidence policy. Evidence remains bound to exact SHA, clean tree, toolchain versions, commands, exit codes, and revalidation after head movement.

Issue #15 is closed by that deliberate alternative policy; this does **not** claim GitHub Actions itself was repaired. Linux/hosted cross-OS compatibility remains explicitly unproven and is tracked as non-blocking follow-up #69.

---

## 5. Workflow Completion Spine

### Slice A — Protocol + canonical docs

**Status:** ✅ Done.

Includes uncertainty classification, shared design, decision discipline, vertical slicing, AFK/HITL semantics, dependency awareness, AFK ≠ READY, bounded context, restartability, deterministic feedback, fresh review, durable findings, and QA/follow-up discipline.

### Slice B — First real workflow dogfood

**Status:** ✅ Done for single-branch protocol proof.

Dogfood proved the protocol can discover facts, stop at genuine human decisions, keep proposals distinct from approvals, verify mechanically, perform fresh review, create follow-ups, and restart from durable repo state.

It also produced real product follow-ups #21–#27.

### Slice C — Decide whether execution mode (AFK/HITL) / `blockedBy` deserve persistence

**Status:** ✅ Done — Issue #44 dogfood found current Task Pack prose sufficient; required execution-mode / `blockedBy` persistence is not justified yet.

The multi-branch dogfood exercised:

- an independent executable AFK repository branch that completed while a product decision remained unresolved;
- an AFK application branch that stayed blocked instead of manufacturing the missing human decision;
- one genuine HUMAN DECISION about expired-pending invitation visibility;
- explicit approval of Option A and durable rejection of Option B;
- deterministic eligibility recomputation after approval;
- downstream implementation with readiness, verification, fresh review, and exact-head local evidence;
- zero-context reconstruction from current repository/VCP artifacts.

The zero-context read recovered AFK/HITL classification, the blocking decision, dependency rationale, approved/rejected choices, and the eligibility transition without required graph metadata. Therefore:

```text
executionMode: AFK | HITL
blockedBy: [...]
```

remain conceptual/derived state, not required Task Pack schema. Revisit persistence only if later dogfood demonstrates ambiguity or restartability failure that these fields would actually solve.

The same reconstruction exposed a separate completion-evidence hygiene problem: merged Task Packs can retain stale `In progress` / `Review` and prior validation text. Track that independently in #48 rather than treating it as evidence for graph-state persistence.

### Slice D — Dependency Graph Engine

**Status:** 🔵 Designed; execution deferred — Slice C did not justify graph-state persistence or a scheduler/queue engine.

Potential capabilities remain:

- task identity/reference validation;
- duplicate/missing dependency checks;
- cycle detection;
- unblocked calculation;
- AFK/HITL eligibility;
- human dependency frontier;
- eligible AFK queue;
- dependency-aware parallel phases;
- deterministic recomputation.

Scheduling rule:

```text
dependencies first
then execution mode
```

Never “all AFK first, then all HITL.”

Do not implement this slice merely because the conceptual model exists. Require new evidence that deterministic graph validation solves an observed problem current Task Pack prose cannot handle safely.

### Slice E — Source-of-Truth freshness

**Status:** ✅ Done — PR #52 / Issue #51.

Implemented repository-native authority states:

```text
DRAFT
ACCEPTED
SUPERSEDED
ARCHIVED
```

Legacy unmarked documents remain current for backward compatibility. `ACCEPTED` governs current execution; `DRAFT` is plan-usable but cannot authorize implementation; `SUPERSEDED` and `ARCHIVED` remain inspectable history but cannot silently govern current work. Invalid explicit markers fail visibly, while deliberate `--include` can still carry historical material for inspection.

Reference SaaS dogfood proves current accepted authority remains sufficient for implementation and preserves the rejected expired-invitation alternative as a durable negative decision while a separate historical proposal is marked `SUPERSEDED`.

---

## 6. Permanent Product Tracks

### Track A — Core Agent Workflow

Intent, clarification, shared design, decisions, vertical tasks, dependencies, AFK/HITL, eligibility, implementation, verification, review, QA, follow-up.

**Next:** maintain completed Stage 5 monorepo/workspace semantics and conformance; keep Linux/hosted compatibility as non-blocking follow-up #69; revisit graph validation only if later evidence justifies it.

### Track B — Knowledge and State

Source-of-Truth freshness, decision lifecycle, negative decisions, task state, lifecycle state, migrations, ownership, rollback.

**Next:** preserve freshness/negative-decision semantics through repository-scale work; add more persisted state only when concrete restartability evidence requires it.

### Track C — Engineering Assurance

Verification, Git-aware review, security profiles, prompt evaluation, architecture fitness, conformance.

**Next:** maintain the released Stage 9 evidence mechanics and immutable release discipline; keep future publication/tag creation human-controlled and Linux/hosted compatibility as non-blocking conformance follow-up #69.

### Track D — Repository Scale and Delivery

CI evidence, monorepos, release automation, stack/mobile profiles, package/repo scale.

**Next:** reconcile the merged Stage 11 closeout evidence gap, then implement Stage 12 Safe Adoption Planning from the current-main baseline. Linux/hosted compatibility remains a separate non-blocking follow-up (#69).

### Track E — Developer UX and Ecosystem

Onboarding, simple workflow, agent interoperability, reference projects, docs consistency, community/plugin model.

**Next:** cross-agent conformance and clearer current-vs-historical Source-of-Truth UX.

---

## 7. Dogfood-Derived Follow-Up Queue

### Historical completed follow-ups

Issues `#21–#30` and `#48` are all **Closed / Completed** and are retained here as historical evidence, not active backlog:

| Issue | Completed capability |
|---|---|
| #21 | Project-level required check commands |
| #22 | Source-of-Truth reference parsing |
| #23 | Reference project context self-containment |
| #24 | Project-root semantics |
| #25 | Canonical Task Pack convention |
| #26 | Durable fresh-review findings |
| #27 | Accept-vs-revoke race coverage |
| #28 | Doctor detected-vs-preserved stack clarity |
| #29 | Stage-directory cleanup contract |
| #30 | Lifecycle exit-code semantics |
| #48 | Task Pack completion finalization |

### Open non-blocking follow-ups

#### #69 — Linux/hosted execution compatibility

Prove cross-OS/hosted conformance when an authorized environment with Node >=22 and Git is available. This remains non-blocking because the accepted fresh-clone Windows exact-head evidence channel is proven and the current hosted Actions failure occurs before any repository step executes.

#### #73 — Concurrent local filesystem replacement TOCTOU

Investigate a portable root-anchored/no-follow confinement design for concurrently replaced local paths. Current static traversal/symlink/digest contracts remain valid; do not claim an atomic filesystem snapshot.

### Intentionally deferred design

The Dependency Graph Engine / Slice D remains designed but deferred. Re-open it only if later dogfood proves a concrete ambiguity, restartability, cycle, dependency-frontier, or AFK-eligibility problem that current Task Pack semantics cannot solve safely.

Prioritize by dependency and user impact, not issue number.
---

## 8. Completed v1 Stages + Next Design Stage

### Stage 3 — Git-aware bounded review

**Status:** ✅ Done — PR #55 / Issue #54.

Implemented an additive local Git review surface for review Context Packs:

- explicit `--base <ref>` with optional `--head <ref>` (default `HEAD`);
- exact resolved base/head commit SHAs;
- merge-base changed-file and bounded textual diff evidence;
- changed files from the enclosing worktree root so nested projects cannot hide root/workspace changes;
- separately labeled dirty working-tree state;
- committed submodule-pointer visibility even when repository config ignores submodules;
- binary-safe diff behavior with textconv disabled;
- existing Context Pack byte-budget enforcement;
- durable fresh-review findings and finalization evidence.

Legacy review context remains backward compatible when no Git comparison is requested. Git evidence defines the changed surface only; Task Pack, current Source of Truth, accepted decisions, tests, and executed verification remain the correctness/acceptance authority.

Exit criteria achieved:

- bounded changed-file/diff discovery;
- branch/base awareness;
- unrelated changes visible;
- fresh reviewer reconstructs intent;
- material findings become durable evidence.

### Stage 4 — Source-of-Truth freshness

**Status:** ✅ Done — PR #52 / Issue #51.

Exit criteria achieved:

- current vs historical authority is explicit enough for deterministic agent use;
- superseded material cannot silently drive work;
- accepted negative decisions remain discoverable.

### Stage 5 — Monorepo + CI evidence

**Status:** ✅ Done — verification provenance foundation PR #58 / Issue #57; explicit project/workspace Source-of-Truth semantics PR #61 + PR #64 / Issue #60; realistic monorepo/workspace conformance PR #67 / Issue #66; evidence-policy decision closes Issue #15.

Exit criteria achieved:

- `--dir` remains the explicit VCP project root, verification cwd, and path-safety/evidence-output boundary;
- enclosing Git worktree provenance does not widen selected-project authority;
- verification evidence schema v2 records portable project scope, exact Git revision when available, and dirty state;
- nested package verification, explicit `workspace:<path>` governing authority, freshness parity, unrelated root/sibling exclusion, and reserved project-local workspace boundary enforcement are covered;
- realistic fresh-checkout monorepo conformance proves bounded context, nested path safety, restartability, package-local verification evidence, and root-aware Git review;
- final merged Stage 5 source passed 34/34 focused tests and 223/223 full validation on exact clean heads before and after Task Pack finalization;
- GitHub Actions repeatedly failed before runner/job steps on this account, so VCP deliberately adopted the proven fresh-clone Windows exact-head maintainer channel as the current long-term executable evidence policy under #15.

Linux/hosted cross-OS compatibility is **not claimed**. Existing local Docker images lacked the Node 22+ plus Git combination required by the VCP provenance contract and downloads/installations were intentionally disallowed. Linux/hosted execution is later compatibility work, not a Stage 5 blocker.

### Stage 6 — Security profiles

**Status:** ✅ Done — PR #70 / Issue #68.

Implemented repository-native project-sensitive security review profiles:

- mandatory `baseline` guidance even for pre-Stage-6 projects with no declaration;
- explicit composable `web-api`, `multi-tenant`, `sensitive-data`, and `stateful-data` profiles;
- deterministic `docs/security/SECURITY-PROFILE.md` selection with current-authority enforcement, duplicate/unknown/malformed rejection, and exact profile-document identity checks;
- automatic profile inclusion only in `security` Context Packs, with exact active profiles/files exposed in the bounded manifest;
- project-root/symlink safety for automatic local profile reads and packaged baseline fallback for older projects;
- lifecycle ownership that preserves project selection while merge-managing canonical VCP guidance;
- project-sensitive guidance for authorization/resource ownership, tenant isolation, secrets/PII/logging, trust boundaries, abuse/rate/replay, migrations/data integrity/recovery, and negative-path testing;
- explicit prohibition on inferred risk acceptance and compliance claims;
- reference multi-tenant SaaS dogfood selecting all project-sensitive profiles.

Stage 6 lands only through the normal exact-head Review → pre-final gate → Task Pack-only finalization → final gate sequence, so this Done status reaches `main` only with accepted executable/review evidence.

### Stage 7 — Prompt evaluation harness

**Status:** ✅ Done — PR #72 / Issue #71.

Stage 7 evaluates observable behavioral properties rather than exact wording:

- discovers before asking;
- never manufactures HUMAN DECISION answers;
- separates proposal from approval;
- preserves negative decisions;
- produces bounded vertical plans;
- respects blockers/readiness;
- reports executed evidence accurately;
- records follow-ups without silently expanding scope;
- remains restartable from durable repository/evidence artifacts.

The harness is provider-independent and contains no embedded LLM runtime. Canonical packaged scenarios define structured ground truth; external agents/adapters record normalized behavior events; VCP deterministically evaluates those records through `vcp prompt-eval`.

Reference green records exercise every canonical property. One deliberate mutation per property must turn that property red, proving the lanes are non-vacuous. Free-form wording is not scored. A failed executed check reported truthfully as failed is considered correct prompt behavior; the harness does not confuse behavioral honesty with repository success.

This Done state reaches `main` only through the standard exact-head Review → pre-final gate → Task Pack-only finalization → final gate sequence.

### Stage 8 — Architecture fitness functions

**Status:** ✅ Done — PR #75 / Issue #74.

Stage 8 makes explicit project architecture boundaries executable without reviving a generic dependency-graph platform:

- every analyzed source file can be required to belong to exactly one declared module owner;
- cross-module dependencies follow explicit `mayImport` allow-lists;
- cross-module access can be restricted to exact public entrypoints, encouraging deep modules with narrow interfaces;
- realized module dependency cycles fail;
- unresolved, outside-source-root, unsupported static, and non-literal dynamic local dependency behavior fails rather than disappearing;
- governing architecture contract markers must remain present exactly once;
- governing ADRs must retain their configured contract marker and exactly one `Accepted` status.

The initial analyzer is deliberately bounded to explicitly configured JavaScript-family source roots and relative/local import forms. Non-relative specifiers—including package imports, Node builtins, and project aliases—are outside the Stage 8 module graph and are not scored as module edges. VCP does not infer modules, persist a dependency graph, require graph metadata in Task Packs, or claim architectural correctness beyond the configured rules.

The reference SaaS dogfoods a layered `application -> domain` dependency through the narrow `src/domain/index.mjs` public contract and binds the executable rules to durable architecture/ADR markers.

This Done state reaches `main` only through the standard exact-head Review → pre-final gate → Task Pack-only finalization → final gate sequence.

### Stage 9 — Release automation

**Status:** ✅ Done — PR #77 / Issue #76.

Stage 9 automates repeatable **release-candidate evidence** without automating away human approval:

- candidate package/lockfile/changelog/release-note identity must agree;
- `[Unreleased]` release bullets must be rolled into the dated candidate section;
- lifecycle migration continuity from the retained previous release is executable;
- immutable historical tag object + peeled commit identity is checked and never mutated;
- missing candidate tag is a HUMAN DECISION, while an existing mismatched candidate tag fails;
- `npm pack` surface, `npm publish --dry-run`, and local tarball install are repeatable mechanics;
- local lifecycle smoke starts from the retained previous release source/tag and proves dry-run/apply/backup/Doctor/framework/idempotence against the candidate;
- optional JSON release evidence is bound to the exact clean Git revision and omits command stdout/stderr.

The command never executes actual `npm publish`, creates/moves/deletes tags, creates GitHub releases, or deploys. A green `vcp release-check` result proves the declared candidate mechanics only; **release approval and publication remain HUMAN DECISION actions**.

The Stage 9 candidate mechanics were subsequently used to release `vibe-coding-production@0.9.3` from exact commit `dc3c6a6572e1b86994de5a46cfb8fc815ed45378`, with immutable annotated tag `v0.9.3`, npm publication, clean-consumer registry smoke, and a non-draft/non-prerelease GitHub Release. The automation contract itself still does not infer or perform approval/publication.

This Done state reaches `main` only through the standard exact-head Review → pre-final gate → Task Pack-only finalization → final gate sequence.

### Stage 10 — Community profiles / plugin model

**Status:** ✅ Done — PR #79 / Issue #78.

Stage 10 adds a deliberately narrow declarative extension model:

- project-owned `docs/plugins/PLUGINS.json` is the only selection authority;
- local plugin bundles are exact id/version/path/digest pinned;
- bundles are text-only in v1 and cannot execute code or hooks;
- capability grants are explicit and cannot be self-granted;
- guidance is additive bounded context only;
- verification commands remain proposals until a human deliberately adopts them into project-owned verification state;
- Doctor and `vcp plugins` use the same validator;
- invalid/tampered/incompatible/ungranted/symlinked bundles fail rather than silently weakening core behavior;
- no npm/network plugin discovery, marketplace, remote signature system, Source-of-Truth override, or core-policy override is introduced.

A React Native-readiness fixture dogfoods the Stage 10 plugin model only and does not itself confer built-in mobile authority. Stage 11 implements first-party React Native support separately in `examples/mobile-react-native/`.


### Stage 11 — Mobile Profiles

**Status:** 🟠 Implementation merged; closeout evidence reconciliation required. Issue #84 / merged PR #85 / accepted contract docs/MOBILE-PROFILES.md / implementation Task Pack docs/tasks/stage11-mobile-profiles-implementation.md.

PR #85 merged on 2026-10-06 and React Native first-party runtime support is present on main.

The consistency audit found a process/evidence mismatch that must not be hidden:

- the implementation Task Pack was marked Done at merge; this consistency audit corrected it to Review because the final rerun evidence is missing;
- the pre-final exact-head gate and fresh review are durably recorded;
- Task Pack finalization is recorded;
- `c7af261… -> bcc79c1…` is a single Task-Pack-only finalization commit, so the reviewed implementation surface did not change;
- the required post-finalization Windows exact-head rerun remains unchecked/unrecorded;
- both hosted `Framework Validation` runs on `bcc79c1…` failed before job steps were reported; those hosted failures are not equivalent to the accepted Windows gate and remain within the separately tracked #69 compatibility boundary;
- the PR nevertheless merged.

No missing historical verification is inferred.

Therefore Stage 11 functionality is merged, but the canonical completion record is not considered fully reconciled until the repository explicitly records the evidence gap and performs an appropriate current-main re-baseline gate. A later current-main run is new evidence; it must not be described as the missing historical rerun.

The merged Stage 11 contract includes:

- explicit react-native stack selection;
- deterministic selected-root dependency + application-marker detection;
- detection precedence go → python → react-native → typescript → javascript → generic;
- first-party React Native engineering/security guidance;
- repository-script verification discovery without invented native/signing/deploy commands;
- generic/javascript/typescript → react-native automatic specialization only for requestedStack=auto and exact current evidence;
- explicit selector and legacy unknown-provenance preservation;
- nested-project and monorepo behavior consistent with Stage 5;
- Stage 10 community-plugin coexistence;
- sensitive mobile HUMAN DECISION boundaries;
- realistic first-party mobile conformance/dogfood.

Flutter, native iOS, and native Android remain out of Stage 11 scope.

Dependency Graph Engine / Slice D remains deferred.

### Stage 12 — Safe Adoption Planning

**Status:** 🔵 Next designed execution stage — implementation must begin from a reconciled current-main baseline. Canonical design: docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md with code authority in docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md.

Stage 12 is intentionally read-only for **unmanaged brownfield Smart Init**. Already-managed repositories may still migrate through the normal transactional `vcp update` lifecycle.

It establishes:

- VCP-state readability before NEW / EXISTING / MANAGED classification, including fail-closed newer/malformed/recovery states;
- project-override / packaged canonical prompt resolution with inspectable source provenance;
- lifecycle manifest schema v2 for whole-file vs section ownership plus a minimum-reader compatibility guard;
- schema-v1 → schema-v2 managed-update migration and previous-release lifecycle smoke;
- section-composition/baseline/update primitives;
- classified install-surface planning for migrated legacy-full, fresh greenfield-safe, and brownfield-minimal projects; fresh Adaptive installs no longer receive the source-repository npm validation workflow; Doctor understands intentionally absent assets;
- inspect-before-prompt option resolution; preserved agent-selector provenance, explicit adapter intent, and VCP-managed adapter ownership without claiming merely observed-compatible project files;
- verification-command authority inspection;
- safe tri-state GitHub-option provenance with new Adaptive surfaces treating GitHub hygiene separately from CI;
- reserved `.vcp` / mixed-stack ambiguity checks;
- content-free `vcp init --dry-run` planning;
- removal of destructive init `--force` behavior.

Stage 12 does not mutate unmanaged EXISTING repositories through Smart Init; `vcp init` on MANAGED state redirects to lifecycle update/status.

### Stage 13 — Smart Init Apply

**Status:** ⚪ Planned after Stage 12 proves the adoption planner.

Stage 13 adds transactional brownfield mutation:

~~~text
first-adoption-aware lifecycle lock
→ own temporary lock bootstrap state
→ inspect again
→ fresh plan
→ conflict/precondition check
→ complete recovery point
→ staged apply
→ ownership-aware baselines/manifest
→ verify
→ clear transaction
~~~

Apply never treats an earlier preview as executable authority.

If planning blocks before backup creation, lock bootstrap must not leave a stray `.vcp/` directory in a previously unmanaged repository. Once a recovery point exists, rollback must restore prior absence of VCP lifecycle state as well as prior file contents.

Stage 13 is followed immediately by Adaptive Validation Checkpoint A before broader capability/profile/CI/Auto machinery proceeds.

## 9. Conceptual Contracts That Must Stay Coherent

### Shared design concept

Before material implementation planning, make explicit:

- what is being built;
- why;
- for whom;
- what changes;
- what remains unchanged;
- what is out of scope;
- what is approved;
- what remains unresolved.

### Conceptual task model

```text
id
title
outcome
executionMode
blockedBy
status
acceptanceCriteria
sourceOfTruth
verification
```

Not every field must become schema.

Candidate states:

```text
DRAFT
READY
BLOCKED
IN_PROGRESS
VERIFYING
REVIEW
DONE
```

`WAITING_FOR_HUMAN` may remain derived.

### Verification

```text
weak checks + AFK = high risk
clear contract + strong checks + bounded task = good AFK candidate
```

Never infer success where executable checks exist.

### Context

Context is transport, not authorization. A context pack never makes blocked work executable.

### Review

Finding classes:

```text
BLOCKER / DEFECT / RISK / FOLLOW-UP / NO ACTION
```

Task disposition:

```text
must fix in this task / follow-up candidate
```

Material findings must be durable.

---

## 10. Feature Completion Standard

A capability is not Done until every materially applicable item is addressed:

1. user outcome;
2. inputs;
3. outputs;
4. human decision boundary;
5. invariants;
6. persisted vs derived state;
7. failure modes;
8. backward compatibility;
9. migration behavior;
10. deterministic verification;
11. security/privacy impact;
12. documentation;
13. realistic reference example;
14. dogfood evidence;
15. independent review;
16. release evidence;
17. rollback/recovery where state mutates.

If a materially applicable item is missing, the capability is not Done.

---

## 11. Requirement Traceability

Material requirements should remain traceable through:

```text
Design requirement
→ roadmap capability
→ issue / Task Pack
→ acceptance criteria
→ implementation PR
→ tests / verification
→ documentation
→ dogfood / conformance
→ release evidence
```

Critical decisions must not exist only in chat history.

---

## 12. End-to-End Conformance

Maintain realistic fixtures for at least:

1. greenfield project;
2. brownfield project;
3. legacy VCP upgrade;
4. security-sensitive multi-tenant SaaS;
5. monorepo/workspace;
6. intentionally broken/ambiguous repository;
7. mobile project once supported.

Exercise as much of the full lifecycle as applicable and record exact SHA, toolchain, commands, exit codes, human decisions, uncertainty, and restartability.

Because VCP is agent-agnostic, repeat important protocol scenarios across multiple capable external agents where practical. Evaluate behavior, not identical prose.

---

## 13. Developer UX Acceptance Criteria

A programmer should be able to state intent naturally and always understand:

- what was discovered;
- what is proposed;
- what was approved;
- what is ready;
- what is blocked and why;
- what human decision is needed now;
- what can proceed independently;
- what was verified;
- what failed;
- what remains uncertain;
- what became follow-up work.

Do not ask the developer about framework/package-manager/test-runner/repository facts that the repository answers. Do ask when the answer changes product behavior, safety, compatibility, architecture, data, or risk.

---

## 14. Documentation Ownership

Avoid competing master documents.

- `docs/ROADMAP.md` — status, sequencing, dependencies, exit criteria.
- `docs/OPERATING-MODEL.md` — canonical workflow and role boundaries.
- `docs/TASK-PACKS.md` — task semantics, sizing, dependencies, follow-up discipline.
- `docs/CONTEXT-PACKS.md` — phase context, budgets, restartability.
- verification docs — executable evidence semantics.
- `docs/UPDATES.md` — lifecycle state, ownership, migrations, conflicts, backups, rollback.

Add future `SYSTEM-CONTRACT.md` / `QUALITY-GATES.md` only if they reduce ambiguity without duplicating these sources.

---


## 15. Recommended Execution Order From Current Main

1. Keep released v0.9.3 immutable.
2. Reconcile the merged Stage 11 closeout evidence gap honestly; do not fabricate the missing historical post-finalization rerun.
3. Run and record the appropriate current-main re-baseline evidence before Stage 12 code work.
4. Implement Stage 12 Safe Adoption Planning only: read/inspect/classify/plan for EXISTING repositories, with no brownfield mutation.
5. Implement Stage 13 Smart Init Apply using the Stage 12 planner under the lifecycle lock, with rollback to truly unmanaged prior state.
6. Run Adaptive Validation Checkpoint A and simplify/stop if real brownfield adoption is still noisy or unsafe.
7. Only after Checkpoint A, continue consumer-asset cleanup, provider-neutral CI work, composable capabilities/profiles, workflow modes/levels, gate integration, and expanded Skills in the order defined by the Adaptive documents.
8. Preserve completed Stage 5–10 invariants and merged Stage 11 behavior through every migration.
9. Keep Linux/hosted compatibility follow-up #69 and filesystem-concurrency residual risk #73 explicit unless separately resolved.
10. Revisit Dependency Graph Engine / Slice D only if new dogfood demonstrates a problem current Task Pack prose cannot solve safely.

The Adaptive implementation documents are the detailed authority for Stages 12+; this Roadmap remains the status/sequencing authority.

## 16. v1 Quality Definition

VCP v1-quality means a programmer can bring VCP into a supported repository, state engineering intent, and have an external coding agent carry it through:

- evidence discovery;
- clarification;
- shared design;
- accepted decisions;
- bounded vertical work;
- dependency-aware execution;
- deterministic verification;
- fresh review;
- QA/follow-up;
- safe lifecycle management;
- release readiness;

without hidden AI product decisions, manual paperwork dependency, uncontrolled scope expansion, unverifiable success claims, or dependence on old chat history.

Before calling the system v1-quality:

- canonical docs agree;
- human decision boundaries are explicit;
- task/context/verification contracts agree;
- restartability is proven;
- Source-of-Truth freshness is addressed;
- Git-aware review exists;
- monorepo/nested-project semantics are coherent;
- CI/local evidence semantics are coherent;
- concrete security checks exist;
- prompt behavior has evaluation coverage;
- architecture fitness rules exist where useful;
- release mechanics are repeatable and evidenced;
- lifecycle update/rollback remains safe;
- conformance fixtures exercise the system;
- no capability is marked Done without applicable completion evidence.

---

## 17. Roadmap Success Test

The roadmap succeeds when this loop is trustworthy:

```text
Developer states intent
→ agent discovers facts
→ agent asks only real human questions
→ decisions become durable truth
→ work becomes bounded vertical tasks
→ dependencies determine eligibility
→ agent implements only eligible scope
→ deterministic evidence proves claims
→ fresh review challenges assumptions
→ QA/follow-up creates new bounded work
→ a fresh agent can continue
→ lifecycle/release remain safe
```

The measure of progress is not the number of commands added. It is how reliably VCP reduces developer bookkeeping while increasing engineering correctness, evidence, restartability, and control.
