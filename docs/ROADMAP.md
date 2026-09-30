# VCP Roadmap — System Completion Plan

**Status:** Living execution roadmap and system-completion contract  
**Released baseline:** VCP `v0.9.2`  
**Current main:** unreleased post-v0.9.2 workflow + lifecycle work  

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

### ✅ Immutable released baseline — v0.9.2

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

### 🔴 GitHub Actions infrastructure — Issue #15

Jobs still fail before repository steps execute. This is infrastructure evidence, not source-test evidence.

An accepted interim local validation channel binds evidence to exact SHA, clean tree, Node/npm versions, commands, exit codes, and revalidation after head movement.

Issue #15 stays open until Actions itself works or a deliberate long-term equivalent is adopted.

---

## 5. Workflow Completion Spine

### Slice A — Protocol + canonical docs

**Status:** ✅ Done.

Includes uncertainty classification, shared design, decision discipline, vertical slicing, AFK/HITL semantics, dependency awareness, AFK ≠ READY, bounded context, restartability, deterministic feedback, fresh review, durable findings, and QA/follow-up discipline.

### Slice B — First real workflow dogfood

**Status:** ✅ Done for single-branch protocol proof.

Dogfood proved the protocol can discover facts, stop at genuine human decisions, keep proposals distinct from approvals, verify mechanically, perform fresh review, create follow-ups, and restart from durable repo state.

It also produced real product follow-ups #21–#27.

### Slice C — Decide whether `mode` / `blockedBy` deserve persistence

**Status:** ✅ Done — Issue #44 dogfood found current Task Pack prose sufficient; required `mode` / `blockedBy` persistence is not justified yet.

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
mode: AFK | HITL
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

**Next:** build Git-aware bounded review; revisit graph validation only if later evidence justifies it.

### Track B — Knowledge and State

Source-of-Truth freshness, decision lifecycle, negative decisions, task state, lifecycle state, migrations, ownership, rollback.

**Next:** preserve freshness/negative-decision semantics through upcoming review and repository-scale work; add more persisted state only when concrete restartability evidence requires it.

### Track C — Engineering Assurance

Verification, Git-aware review, security profiles, prompt evaluation, architecture fitness, conformance.

**Next:** Git-aware review foundation and conformance fixtures.

### Track D — Repository Scale and Delivery

CI evidence, monorepos, release automation, stack/mobile profiles, package/repo scale.

**Next:** #15, then monorepo/mobile work after current nested-project/lifecycle contracts remain stable.

### Track E — Developer UX and Ecosystem

Onboarding, simple workflow, agent interoperability, reference projects, docs consistency, community/plugin model.

**Next:** cross-agent conformance and clearer current-vs-historical Source-of-Truth UX.

---

## 7. Dogfood-Derived Follow-Up Queue

### #21 — Project-level required check commands
Represent required commands such as `npm run check` without forcing them into inaccurate verification categories.

### #22 — Source-of-Truth reference parsing
Do not interpret every Markdown code span as a file path; keep path safety deterministic.

### #23 — Reference project context self-containment
Make the flagship nested example run plan/implement/review/security/release context from a clean checkout without undocumented prompt copying.

### #24 — Project-root semantics
Make task/readiness/context/verify agree on the owning root and reference resolution in nested `--dir` workflows.

### #25 — Canonical Task Pack convention
Unify current generated tasks with older `docs/delivery/TASK-*` examples without silently deleting historical user artifacts.

### #26 — Durable fresh-review findings
Preserve concise material finding/disposition evidence so continuation does not depend on reviewer chat.

### #27 — Accept-vs-revoke race coverage
Add a deterministic service-level concurrency test to the invitation reference slice.

### #28 — Doctor detected vs preserved stack clarity
Explain when deterministic detection differs from the intentionally preserved lifecycle profile.

### #29 — Stage-directory cleanup contract
Define whether empty `.vcp/stage/` is removed or intentionally retained after successful lifecycle operations.

### #30 — Lifecycle exit-code semantics
Document no-work / work-available / blocked / failure semantics for scripting and CI.

### #48 — Task Pack completion finalization
Keep final Task Pack status and bounded verification evidence synchronized after successful exact-head validation and merge so restartability does not depend on stale `pending` / prior-failure text.

Prioritize by dependency and user impact, not issue number.

---

## 8. Remaining v1 Stages

### Stage 3 — Git-aware bounded review

**Status:** ⬜ Planned.

Review should consume actual changed surface, task/acceptance decisions, Source of Truth, tests, and evidence rather than implementation narration.

Exit criteria:

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

**Status:** ⬜ Planned.

Required:

- explicit workspace/project roots;
- package-specific verification;
- root/package Source-of-Truth semantics;
- bounded package context;
- nested path safety;
- CI/local evidence with compatible contracts.

Dependencies include #15, #23, #24.

### Stage 6 — Security profiles

**Status:** ⬜ Planned.

Move from generic security prose to project-sensitive checks/guidance for authorization, tenant isolation, secrets, PII, trust boundaries, abuse/rate limits, migration/data safety, and negative-path testing.

Do not create false compliance claims or infer human risk acceptance.

### Stage 7 — Prompt evaluation harness

**Status:** ⬜ Planned.

Evaluate behavioral properties, not exact wording:

- discovers before asking;
- never manufactures HUMAN DECISION answers;
- separates proposal from approval;
- preserves negative decisions;
- produces bounded vertical plans;
- respects blockers/readiness;
- reports executed evidence accurately;
- records follow-ups;
- remains restartable.

### Stage 8 — Architecture fitness functions

**Status:** ⬜ Planned.

Potential executable boundaries:

- forbidden dependency direction;
- circular dependencies;
- module/package ownership;
- public-contract access;
- ADR/architecture regressions.

Architecture should also compress context through deep modules, narrow interfaces, and explicit contracts.

### Stage 9 — Release automation

**Status:** ⬜ Planned.

Automate repeatable mechanics without automating away human release approval.

Require version/changelog consistency, pack inspection, publish dry-run, install/update smoke, migration checks, immutable tags, and retained release evidence.

### Stage 10 — Community profiles / plugin model

**Status:** ⬜ Planned.

Only after core contracts stabilize. Extension loading must remain deterministic, versioned, explicit in trust, and unable to weaken core safety rules silently.

### Mobile profiles

**Status:** ⬜ Planned commitment retained from the public roadmap.

Define detection, generated guidance, verification, nested-project behavior, lifecycle updates, and plugin/profile compatibility before implementation.

---

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
mode
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

1. Keep #15 open and preserve an executable exact-head local validation channel.
2. Build Git-aware bounded review.
3. Resolve monorepo/project-root + CI evidence semantics.
4. Build concrete security profiles.
5. Build prompt behavioral evaluation.
6. Add architecture fitness functions.
7. Automate release mechanics without automating approval.
8. Extend mobile/plugins/ecosystem only after core contracts stabilize.
9. Revisit graph validation/eligibility only if later dogfood demonstrates a concrete problem that required metadata would solve.

---

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
