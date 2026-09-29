# VCP Roadmap — System Completion Plan

**Status:** Living execution roadmap and system-completion contract  
**Baseline:** VCP `v0.9.2`  
**Purpose:** Define what VCP must become, how the parts depend on each other, what evidence is required before a capability is considered complete, and how the original VCP v1 roadmap and the agent-first workflow evolution converge into one coherent system.

This document is the current execution roadmap. Historical handoffs and deeper design documents remain evidence and design references, but this file is the current answer to:

- what is released;
- what is in flight;
- what is blocked;
- what is designed but not yet productized;
- what remains for v1 quality;
- what each roadmap stage depends on;
- what must be proven before any roadmap item can be marked Done.

The roadmap must be updated whenever project state or sequencing materially changes.

---

## 1. North Star

VCP is an **Engineering Control Plane for AI Coding Agents**.

External coding agents:

- understand developer intent;
- inspect repository evidence;
- ask focused questions;
- draft engineering artifacts;
- propose reversible engineering defaults;
- implement approved work;
- run VCP commands.

VCP:

- preserves approved truth;
- separates discovered facts from proposed and approved decisions;
- protects human decision boundaries;
- gates plan and implementation readiness;
- bounds phase-specific context;
- preserves task and dependency constraints;
- executes deterministic verification;
- preserves evidence;
- supports independent review;
- protects lifecycle updates and rollback;
- prevents unsupported success claims.

The governing principle remains:

> **AI does the paperwork. Human makes the decisions. VCP preserves the decisions. AI codes within those decisions. VCP verifies the result.**

VCP must remain:

- agent-agnostic;
- deterministic at its core;
- scriptable;
- inspectable;
- repository-native;
- usable without an embedded LLM runtime.

---

## 2. Explicit Non-Goals

VCP is not becoming:

- an LLM runtime;
- a cloud scheduler;
- a Kanban SaaS product;
- a generic multi-agent platform;
- an AI API integration layer;
- a deployment platform;
- a replacement for GitHub, Linear, Jira, or another issue system;
- a universal architecture generator;
- a compliance-certification product.

External coding agents remain the orchestrators.

A dependency graph does **not** imply that VCP should become an autonomous scheduler. A useful protocol concept should become persistent product state only when dogfood proves that persistence or enforcement is necessary.

---

## 3. Source Hierarchy

This roadmap reconciles three kinds of evidence:

1. **Released repository behavior and immutable release history** — highest authority for what exists today.
2. **The consolidated VCP handoff / original v1 roadmap** — authority for previously accepted roadmap commitments.
3. **The Agent-First Workflow Evolution design** — authority for the Matt-derived workflow semantics and proposed execution model.

When these sources differ:

- released behavior is not rewritten by a design document;
- later design may refine future semantics;
- roadmap priority changes must be explicit rather than silently inferred;
- old commitments are preserved unless intentionally superseded.

---

## 4. Status Legend

- ✅ **Done** — merged/released and supported by required evidence.
- 🟡 **In flight** — implemented in an open PR or awaiting integration evidence.
- 🔴 **Blocked** — progress depends on unresolved infrastructure/external evidence.
- 🔵 **Designed** — semantics are documented but not yet productized.
- 🧪 **Dogfood required** — implementation exists but the real workflow has not yet proven the contract.
- ⬜ **Planned** — roadmap work not yet started.

A feature is **not Done merely because code exists**. The Definition of Done for roadmap capabilities appears later in this document.

---

# 5. System Invariants

These are cross-cutting rules. Future features must not violate them.

## 5.1 Human intent is not inferred

The agent may discover facts and propose defaults, but must not manufacture unresolved product, business, security, privacy, compatibility, architecture, destructive migration, risk-acceptance, or rollout decisions.

## 5.2 Discover before asking

If repository evidence can reliably answer a question, the agent should inspect instead of asking the developer.

## 5.3 AFK does not mean ready

`AFK` describes **who can execute**.

Dependencies, unresolved decisions, readiness, and verification determine **whether execution is allowed**.

```text
AFK + unblocked + no unresolved human intent + ready = eligible
```

## 5.4 Blocked work stays blocked

An AFK task blocked by unresolved human intent must not proceed by guessing the missing decision.

## 5.5 Context is a budget

Each phase receives the smallest sufficient authoritative context. Chat history is not a required source of truth.

## 5.6 Restartability

A fresh capable agent should be able to continue from repository state + VCP context without needing the previous chat transcript.

## 5.7 Evidence outranks confidence

If a claim can be verified deterministically, executable evidence outranks an agent saying that the implementation “looks correct.”

## 5.8 Scope does not silently expand

A newly discovered issue is either:

- required to satisfy the current acceptance criteria, so it is fixed now; or
- outside current acceptance criteria, so it becomes a follow-up.

## 5.9 Historical artifacts do not masquerade as current truth

Superseded or archived decisions must not be treated as current authority.

## 5.10 Released identity is immutable

Released tags, package versions, release commits, and release evidence are not rewritten in place.

---

# 6. Canonical End-to-End VCP Lifecycle

The complete target lifecycle must stay visible as one system rather than being distributed across unrelated features:

```text
1.  INTENT
2.  RESEARCH / PROTOTYPE IF NEEDED
3.  GRILL / CLARIFICATION
4.  SHARED DESIGN CONCEPT
5.  DECISION RECORDING
6.  PRD / DESTINATION
7.  VERTICAL SLICING
8.  TASK GRAPH
9.  AFK / HITL CLASSIFICATION
10. DEPENDENCY ANALYSIS
11. PLAN READINESS
12. PLAN CONTEXT
13. PLAN / APPROVAL
14. IMPLEMENTATION READINESS
15. AFK ELIGIBILITY CHECK
16. IMPLEMENTATION CONTEXT
17. IMPLEMENT
18. DETERMINISTIC FEEDBACK
19. VERIFY
20. FRESH REVIEW CONTEXT
21. INDEPENDENT REVIEW
22. MANUAL / PRODUCT QA WHERE NEEDED
23. NEW ISSUES / CORRECTIONS
24. RECLASSIFY + RECOMPUTE GRAPH
25. REPEAT
26. RELEASE
27. OBSERVE
28. MAINTAIN
```

Every roadmap capability must ultimately connect to this lifecycle or to the lifecycle infrastructure that makes it safe.

---

# 7. Permanent Roadmap Tracks

VCP development should be managed as five converging tracks rather than a single flat list.

## Track A — Core Agent Workflow

Intent → clarification → shared design → decisions → vertical slices → task graph → AFK/HITL → execution → verification → review → QA → follow-up.

## Track B — Knowledge and State

Source of Truth, accepted decisions, negative decisions, supersession, task state, lifecycle state, migrations, rollback, ownership.

## Track C — Engineering Assurance

Verification, Git-aware review, security profiles, prompt evaluation, architecture fitness, conformance evidence.

## Track D — Repository Scale and Delivery

Monorepos, CI evidence, stack profiles, mobile profiles, release automation, package/repository scale.

## Track E — Developer UX and Ecosystem

Onboarding, agent interoperability, reference projects, documentation consistency, community/plugin model.

The tracks may advance in parallel only when dependencies are satisfied. They must converge on shared contracts rather than introducing separate competing state models.

---

# 8. Current Released Baseline

## ✅ VCP v0.9.2 foundation

The immutable public baseline already includes:

- CLI bootstrap and evidence-based JavaScript/TypeScript/Python/Go stack detection;
- agent-first onboarding guidance;
- repository discovery and verification-command discovery;
- bounded Task Packs;
- plan and implementation readiness gates;
- phase-specific bounded Context Packs;
- planned-path support for approved greenfield files;
- deterministic verification and evidence;
- read-only Doctor audits and documented coverage semantics;
- lifecycle-aware `vcp update`;
- three-way merge;
- versioned migrations;
- path and symlink safety;
- lifecycle locking;
- transactions and backups;
- rollback;
- manage ignore/track ownership behavior;
- reference/dogfood projects;
- proven manual release discipline.

Do not recreate, retag, or republish v0.9.2 while vNext work is in progress.

---

# 9. Current Integration Frontier

## 🟡 Stage 1 — Safe stack-profile provenance and re-profiling

Tracked by Issue #8 and PR #14.

Implemented behavior:

- preserve the original selector as `install.requestedStack`;
- distinguish explicit `generic` from `auto` falling back to `generic`;
- allow automatic re-profiling only when:
  - stored profile is `generic`;
  - `requestedStack` proves the original request was `auto`;
  - current deterministic detection resolves to a supported concrete stack;
- preserve explicit `generic`;
- preserve provenance-unknown legacy `generic`;
- expose transitions in update check, dry-run, JSON, and apply;
- retain normal merge/conflict/backup/rollback protections;
- protect customized verification decisions;
- cover idempotence and reporting in regression tests.

### Exit criteria

Stage 1 is not complete until:

1. executable repository validation runs successfully;
2. the current PR head passes the repository validation contract;
3. a realistic legacy/auto-derived `generic` upgrade is dogfooded;
4. no user-owned product/architecture/security/verification decision is silently rewritten;
5. PR #14 is independently reviewed and merged;
6. Issue #8 is closed only after evidence supports the final policy;
7. release impact is explicitly classified.

---

## 🟡 Stage 2 — Agent workflow protocol foundation

Tracked by Issue #16 and PR #18.

Implemented guidance:

- clarification classification:
  - discoverable;
  - proposal-safe;
  - human decision required;
- vertical-slice planning;
- AFK-safe versus HITL-required work;
- explicit dependency awareness;
- rule that AFK work never bypasses readiness, conflicts, safety, unresolved human intent, or verification failures;
- fresh review based on task/Source of Truth/acceptance criteria/diff/evidence;
- must-fix-now versus follow-up-candidate disposition.

### Stage 2 is only Slice A of the workflow evolution

PR #18 does **not** complete the full agent-first model. It is the first protocol layer.

### Exit criteria

1. executable validation evidence exists;
2. fresh review is completed against the final PR head;
3. all intended guidance surfaces converge, including the remaining documentation listed in the Workflow Completion Spine below;
4. the protocol is dogfooded on a real feature;
5. dogfood records whether classification, vertical slicing, HITL timing, dependency boundaries, and review disposition behaved correctly;
6. PR #18 is merged;
7. only after dogfood do we decide whether `mode` and `blockedBy` become machine-readable.

---

## 🔴 Infrastructure blocker — GitHub Actions validation

Tracked by Issue #15.

Observed behavior:

- Framework Validation jobs finish as failed before repository steps execute;
- zero workflow steps run;
- no runner is assigned;
- retry reproduces the same condition.

This is infrastructure evidence, not source-test evidence.

### Exit criteria

The blocker is resolved only when a workflow job acquires a runner and executes the actual repository validation commands, or an equivalent reliable repository validation channel is deliberately adopted and documented.

Red infrastructure status must never be converted into a false claim that source changes failed, and unavailable CI must never be converted into a false claim that source changes passed.

---

# 10. Workflow Completion Spine

The Agent-First Workflow Evolution should be implemented in the following evidence-driven sequence.

## Slice A — Protocol and canonical documentation

Status: 🟡 in flight.

Required semantics:

- clarification / Grill behavior;
- DISCOVERABLE / PROPOSABLE / HUMAN DECISION classification;
- shared design concept;
- decision-state model;
- negative/out-of-scope decisions;
- vertical slicing;
- AFK/HITL definitions;
- dependency rules;
- no execution of blocked tasks;
- deterministic feedback requirement;
- fresh-context review;
- follow-up discipline;
- canonical QA feedback loop.

Required documentation convergence:

- `AGENTS.md`;
- `prompts/01-discovery.md`;
- `prompts/02-plan-task.md`;
- `prompts/03-implement-task.md`;
- `prompts/04-code-review.md`;
- `docs/OPERATING-MODEL.md`;
- `docs/TASK-PACKS.md`;
- `docs/CONTEXT-PACKS.md`;
- `docs/QUICKSTART.md`.

PR #18 currently covers only part of this surface. The remaining docs are not optional if VCP is to behave as one system.

### Exit criteria

- terminology is consistent across all guidance surfaces;
- no document says AFK implies readiness;
- no document encourages agents to infer human intent;
- the canonical lifecycle appears explicitly in the operating model;
- discovery output separates facts, proposals, decisions, conflicts, dependencies, and next action;
- planning output supports vertical slices, dependency relationships, and verification strategy;
- implementation guidance refuses blocked tasks and scope expansion;
- review guidance assumes fresh context and classifies findings.

---

## Slice B — Real workflow dogfood

Status: ⬜ required immediately after Slice A.

Run the workflow on at least one real feature with meaningful dependencies and at least one human decision boundary.

The dogfood must answer:

- Did the agent discover repository facts instead of asking for them?
- Did it distinguish proposals from decisions?
- Did it reach a real shared design concept before implementation planning?
- Were tasks sliced vertically?
- Were AFK/HITL classifications sensible?
- Were dependencies clear?
- Did an AFK task stay blocked when HITL input was unresolved?
- Did the system request human input at the smallest blocking frontier?
- Did verification provide trustworthy feedback?
- Did fresh review challenge implementation assumptions?
- Did QA/follow-up findings avoid silently expanding the current task?
- Could a fresh agent continue from repository state without chat history?

### Exit criteria

Dogfood produces written evidence of observed strengths, failures, ambiguous semantics, and which concepts require machine-readable enforcement.

---

## Slice C — Minimum machine-readable task metadata

Status: 🔵 designed; gated on Slice B evidence.

If dogfood proves prose is insufficient, introduce the minimum useful task metadata:

```text
mode: AFK | HITL
blockedBy: [...]
```

Do not introduce a larger scheduler state model unless separately justified.

### Required compatibility work

- schema evolution policy;
- defaults for existing Task Packs;
- migration/backward-compatibility behavior;
- human-readable and machine-readable reporting;
- deterministic validation;
- fixtures for old and new task shapes;
- no silent interpretation of ambiguous legacy intent.

### Exit criteria

- old Task Packs continue to work according to documented semantics;
- new metadata is validated deterministically;
- invalid dependencies fail explicitly;
- the metadata improves dogfood orchestration enough to justify persistence.

---

## Slice D — Dependency Graph Engine

Status: 🔵 designed; depends on Slice C.

Required capabilities:

- graph construction from Task Packs;
- missing-reference validation;
- duplicate ID validation;
- cycle detection;
- unblocked-task calculation;
- AFK eligibility;
- HITL eligibility;
- human dependency frontier;
- eligible AFK queue;
- dependency-aware parallel phases;
- clear blocked explanations;
- optional `WAITING_FOR_HUMAN` explanation semantics;
- recomputation after task completion or new issue creation.

### Eligibility invariant

An AFK task is executable only when:

```text
mode == AFK
AND all blockers are complete
AND no unresolved human decisions remain
AND implementation readiness passes
AND required verification is executable
```

### Correct scheduling principle

```text
dependencies first
then execution mode
```

Never implement:

```text
sort all tasks by AFK first
then HITL
```

### Exit criteria

- graph cycles are detected and reported;
- blocked tasks never enter the executable queue;
- independent eligible work can be identified in parallel;
- the human frontier is the smallest current set of HITL decisions blocking further eligible work;
- graph recomputation is deterministic;
- no scheduler guesses a human decision.

---

## Slice E — Source-of-Truth freshness

Status: ⬜ planned; can begin design earlier but must integrate with the workflow state model.

Initial authority states:

```text
DRAFT
ACCEPTED
SUPERSEDED
ARCHIVED
```

Requirements:

- accepted material is current authority;
- superseded material remains historical but is not current truth;
- supersession identifies its replacement where applicable;
- archived material is history-only;
- ADR supersession works explicitly;
- Context Packs prefer current/accepted material;
- Doctor may later detect obvious freshness problems;
- negative/out-of-scope decisions remain durable until explicitly changed.

Do not build a knowledge graph first.

### Exit criteria

A fresh agent can identify current authoritative decisions without relying on chronology or chat history.

---

# 11. Decision Contract

The agent-first workflow needs a durable distinction between fact, proposal, and human-approved intent.

## Decision states

```text
DISCOVERED
PROPOSED
APPROVED
```

### DISCOVERED

Repository evidence proves the fact.

Examples:

- package manager;
- framework;
- existing test runner;
- current auth mechanism;
- existing API style.

### PROPOSED

No accepted decision exists, but the agent can suggest a reversible/default engineering choice.

A material proposal does not become approved merely because the agent wrote it.

### APPROVED

A human has accepted a consequential choice, or an authoritative existing project artifact already establishes it according to VCP's accepted-truth rules.

## Human-decision domains

Agents must not independently settle material decisions involving:

- product behavior;
- business rules;
- security posture;
- privacy;
- compatibility;
- data ownership;
- destructive migration policy;
- architecture direction;
- risk acceptance;
- rollout policy.

## Negative decisions / exclusions

VCP must preserve approved decisions about what **will not** be done.

Examples:

```text
No leaderboard in this release.
No retroactive points.
No admin override.
```

Without durable exclusions, future agents can accidentally reopen rejected scope.

---

# 12. Shared Design Concept Contract

Before a feature becomes an implementation backlog, the human and agent should share a clear concept of:

- what is being built;
- why it is being built;
- who it is for;
- what behavior changes;
- what remains unchanged;
- what is explicitly out of scope;
- what decisions are approved;
- what remains unresolved;
- what constraints already exist in the repository.

The PRD / destination artifact should be drafted from:

```text
clarification conversation
+ repository evidence
+ approved human decisions
```

It should not be a questionnaire that forces the developer to manually fill fields the agent can discover or draft.

---

# 13. Vertical Slice Contract

A strong implementation slice should be:

- bounded;
- outcome-oriented;
- reviewable;
- testable;
- independently understandable;
- small enough for one strong agent context;
- valuable or behaviorally coherent end to end.

Prefer a vertical behavior such as:

```text
Award points when a lesson is completed
and display the updated total.
```

over horizontal phases such as:

```text
database
backend
API
frontend
tests
```

Horizontal work is acceptable only where it is independently necessary or valuable.

Mixed tasks containing a human decision plus substantial autonomous implementation should normally be split:

```text
HITL decision
    ↓
AFK implementation blockedBy the decision
```

---

# 14. Complete Task Graph Contract

The conceptual Task Graph model is broader than only `mode` and `blockedBy`.

A task eventually needs a coherent contract covering:

```text
id
title
outcome
mode: AFK | HITL
blockedBy: []
status / derived state
acceptanceCriteria
sourceOfTruth
verification
scope
planned paths / affected area
```

Not every field must immediately become stored schema. The roadmap must explicitly distinguish:

- persisted state;
- derived state;
- protocol-only convention;
- external issue-system metadata.

Do not create duplicate sources of truth merely to make the graph machine-readable.

---

# 15. Task State Semantics

Candidate lifecycle states include:

```text
DRAFT
READY
BLOCKED
IN_PROGRESS
VERIFYING
REVIEW
DONE
```

`WAITING_FOR_HUMAN` may be a derived explanation rather than a stored status.

Before state becomes first-class product data, define:

- legal transitions;
- which states are persisted versus derived;
- how readiness interacts with state;
- how external issue trackers interact with state;
- what happens when verification or review fails;
- what completion means;
- how reopened work is represented.

Avoid a second competing workflow engine inside VCP.

---

# 16. Context and Restartability Contract

## Plan context

Should include only what planning needs, such as:

```text
intent
task
relevant accepted Source of Truth
constraints
approved / unresolved decisions
```

## Implementation context

Should include only what implementation needs, such as:

```text
approved task
approved plan
relevant contracts
existing affected files
approved planned future files
verification commands
```

## Review context

Should include only what independent review needs, such as:

```text
task
accepted requirements
approved decisions
relevant current Source of Truth
actual changed area / diff
tests
verification evidence
```

## Restartability acceptance criterion

A capable fresh agent should be able to resume using repository state + VCP context without previous chat history.

This property must become an explicit prompt-evaluation and conformance scenario.

---

# 17. Verification Contract for Autonomous Work

AFK work requires stronger deterministic feedback because a human is not continuously observing execution.

Possible feedback includes:

- unit tests;
- integration tests;
- contract tests;
- typecheck;
- lint;
- build;
- migration checks;
- security tests;
- E2E tests.

Not every task must use literal test-first development, but unattended implementation must have trustworthy feedback appropriate to the task.

Core rule:

```text
weak checks + AFK = high risk
clear contract + strong checks + bounded task = good AFK candidate
```

An AFK task must not be considered eligible merely because its dependencies are complete if its required verification cannot actually be executed.

---

# 18. Fresh Review and QA Contract

## Fresh review

The independent reviewer starts from:

- requirements;
- accepted decisions;
- current Source of Truth;
- actual scope/diff;
- tests;
- verification evidence.

The reviewer must not treat the implementer's summary as proof.

Initial finding classes:

```text
BLOCKER
DEFECT
RISK
FOLLOW-UP
NO ACTION
```

The first product version may keep these as prompt/output conventions before making them machine-readable.

## QA is not a silent ending

Even when tests and review pass, manual/product QA may still be required for UI, human behavior, integration, or judgment-heavy outcomes.

QA findings can include:

- bug;
- missing behavior;
- bad UX;
- new constraint;
- architecture problem;
- security concern.

The loop is:

```text
Implement
→ Verify
→ Review
→ QA
→ Finding
→ Issue / task
→ AFK/HITL classification
→ Dependencies
→ Recompute eligibility
→ Execute when eligible
→ Repeat
```

This QA → new issue → graph recomputation loop is a real roadmap capability, not merely documentation wording.

---

# 19. Developer UX Contract

The target experience must remain simple even as the internal system becomes rigorous.

A developer should be able to say something like:

```text
"Add expiring team invitations."
```

The agent should then:

1. inspect the repository;
2. discover existing product and technical facts;
3. identify conflicts and missing evidence;
4. ask only consequential human-intent questions;
5. record accepted decisions;
6. draft/update the relevant Source of Truth;
7. create vertical tasks;
8. classify AFK/HITL;
9. establish dependencies;
10. run readiness/context;
11. execute only eligible autonomous work;
12. stop at the human dependency frontier;
13. verify with executable evidence;
14. perform fresh review;
15. run product/manual QA where appropriate;
16. turn non-current findings into follow-up work.

## UX acceptance criteria

At any meaningful point the developer should be able to understand:

- what VCP/agent discovered;
- what was proposed;
- what was approved;
- what is ready;
- what is blocked;
- why it is blocked;
- what decision, if any, is required from the human;
- what was executed;
- what verification passed or failed;
- what remains uncertain;
- what was moved to follow-up.

The user should not have to understand VCP's internal metadata model to use VCP correctly.

---

# 20. Feature Completion Standard

No roadmap capability may be marked Done solely because implementation code exists.

For every material capability, record the following evidence where applicable:

1. **User outcome** — what real problem is solved?
2. **Inputs** — what repository/task/state information enters the capability?
3. **Outputs** — what artifact, state, report, or evidence is produced?
4. **Human boundary** — what can AI do and what still requires human intent?
5. **Invariants** — what rules must never be violated?
6. **State model** — what is persisted, derived, or protocol-only?
7. **Failure modes** — how can it fail and how is failure surfaced?
8. **Backward compatibility** — how do existing projects behave?
9. **Migration behavior** — if state/schema changes, how is it upgraded safely?
10. **Verification contract** — what commands/tests prove the executable claims?
11. **Security/privacy impact** — what trust boundaries or sensitive data are affected?
12. **Documentation** — can a developer/agent understand the contract?
13. **Reference example** — is there a concrete example when useful?
14. **Dogfood evidence** — was the behavior exercised on a realistic repository?
15. **Independent review** — did a fresh reviewer challenge the implementation?
16. **Release evidence** — is the shipped artifact the exact validated artifact?
17. **Rollback/recovery** — if the capability mutates lifecycle state, can failure be recovered safely?

If a category is not applicable, that should be explicit rather than silently omitted.

---

# 21. Requirement Traceability

To prevent roadmap drift and forgotten requirements, material requirements should be traceable through implementation.

Target chain:

```text
Design requirement
    ↓
Roadmap capability
    ↓
Issue / Task Pack
    ↓
Acceptance criteria
    ↓
Implementation PR
    ↓
Tests / verification
    ↓
Documentation
    ↓
Dogfood / conformance scenario
    ↓
Release evidence
```

Example invariant:

```text
AFK must not cross unresolved human intent
→ graph eligibility requirement
→ acceptance criteria
→ implementation
→ blocked-HITL regression test
→ operating/task docs
→ dogfood scenario
→ release evidence
```

The traceability model should begin as disciplined project practice. Machine-readable traceability should be added only if manual references become unreliable at project scale.

---

# 22. End-to-End Conformance Suite

Unit and regression tests are necessary but insufficient to prove that VCP works as one system.

VCP should develop end-to-end fixture/reference repositories covering at least:

1. small greenfield application;
2. existing/brownfield application;
3. legacy VCP repository being upgraded;
4. security-sensitive multi-tenant SaaS;
5. monorepo;
6. intentionally ambiguous or broken repository configuration;
7. mobile repository once mobile profiles are supported.

Each relevant fixture should exercise a coherent lifecycle, for example:

```text
intent
→ discovery
→ clarification
→ accepted decisions
→ Source-of-Truth update
→ task creation
→ readiness
→ context
→ implementation
→ deterministic verification
→ review
→ QA/follow-up
→ lifecycle/update behavior where relevant
→ release checks where relevant
```

## Cross-agent conformance

Because VCP is agent-agnostic, prompt/behavior evaluation should eventually test representative external coding-agent integrations where practical, while keeping the deterministic VCP core independent of vendor-specific behavior.

The goal is not identical prose output. The goal is preservation of behavioral properties and safety boundaries.

---

# 23. Prompt Evaluation Harness

Use:

```text
fixture repositories
+ fixed intents
+ seeded ambiguity/defects
+ expected behavioral properties
```

Avoid brittle exact-text matching.

Evaluate questions such as:

- does discovery ask questions repository evidence already answers?
- does the agent distinguish discovered facts from proposals?
- does it invent product behavior?
- does it preserve approved and negative decisions?
- does planning create vertical rather than arbitrary horizontal slices?
- does the agent classify AFK/HITL sensibly?
- does it honor `blockedBy`?
- does it request the human at the true dependency frontier?
- does implementation broaden scope silently?
- does review catch seeded defects?
- does security review catch authorization and tenant-isolation failures?
- does the agent respect meaningful `n/a`?
- does a fresh agent recover from repository/VCP state without chat history?

This harness becomes one of the strongest protections against prompt/documentation regressions.

---

# 24. Documentation Architecture

The product should have one coherent documentation hierarchy rather than several competing workflow definitions.

## `docs/ROADMAP.md`

Answers:

- what we are building;
- current status;
- dependencies;
- stage exit criteria.

## `docs/OPERATING-MODEL.md`

Owns the canonical end-to-end workflow.

## Future `docs/SYSTEM-CONTRACT.md`

Should centralize cross-feature invariants such as:

- human/AI boundary;
- decision semantics;
- task-graph semantics;
- state ownership;
- dependency/eligibility rules;
- restartability.

Create this only as a focused documentation slice; do not duplicate detailed command docs.

## `docs/TASK-PACKS.md`

Owns task shape, slicing, dependencies, modes, task-state semantics, and task-size guidance.

## `docs/CONTEXT-PACKS.md`

Owns context budgets, phase inputs, restartability, and fresh-review context.

## `docs/VERIFICATION-EVIDENCE.md`

Owns executable proof and evidence semantics.

## Future `docs/QUALITY-GATES.md`

Should define the Feature Completion Standard and conformance requirements once those rules are dogfooded enough to deserve a dedicated contract.

## `docs/UPDATES.md`

Owns lifecycle upgrade, migration, conflict, rollback, and recovery semantics.

The README should remain an approachable public entry point and link to authoritative detailed docs rather than duplicating the full roadmap.

---

# 25. Git-Aware Bounded Review Foundation

Status: ⬜ planned.

This combines the original roadmap with the fresh-review contract.

Desired review inputs:

```text
task requirements
+ accepted decisions / current Source of Truth
+ actual git diff
+ tests
+ verification evidence
```

Capabilities to investigate:

- base/head diff discovery;
- changed-file discovery;
- planned versus actual paths;
- scope drift;
- unrelated files;
- contract changes;
- migrations;
- Source-of-Truth changes;
- bounded review context from the actual diff.

This track can begin design while workflow dogfood proceeds, but final semantics must consume the same accepted-decision/task/context model rather than invent a parallel model.

No new CLI command name is approved merely by this roadmap entry.

---

# 26. Monorepo + CI Evidence Model

Status: ⬜ planned.

Start with one ecosystem, likely Node/npm workspaces if repository evidence supports it.

Goals:

- discover workspace roots;
- understand package boundaries;
- distinguish repo-wide from package-local commands;
- identify affected workspaces;
- build workspace-aware bounded context;
- support package-local verification;
- avoid unnecessary whole-monorepo checks;
- discover existing CI before proposing changes;
- model PR, merge/main, release, scheduled, matrix, and security CI tiers.

Exit criteria must include at least one realistic monorepo conformance fixture and evidence that VCP avoids unnecessary whole-repository verification when bounded verification is sufficient.

---

# 27. Security Profiles

Status: ⬜ planned.

Start concrete rather than generic. A strong first profile is multi-tenant web SaaS.

Potential checks/guidance:

- authentication vs authorization;
- tenant isolation;
- invite/token threats;
- replay and idempotency;
- negative-path tests;
- secret handling;
- logging/PII;
- trust boundaries.

A security profile may improve prompts, Task Packs, verification expectations, and review checks, but must not claim compliance without real process/evidence.

The first profile should be dogfooded against the existing/reference invitation-style application or another realistic security-sensitive fixture.

---

# 28. Architecture Fitness and Agent-Friendly Architecture

Status: ⬜ planned.

Turn selected **project-specific** architectural rules into executable checks where practical.

Potential examples:

- forbidden dependency direction;
- private/internal import violations;
- circular dependencies;
- cross-domain DB ownership violations;
- API/package boundary violations.

Avoid a generic architecture score and do not invent architecture from framework defaults.

This track should also preserve the agent-friendly design principle:

> **Good architecture is context compression.**

Prefer stable, meaningful module interfaces and deep/coherent modules over unnecessary abstraction fragmentation that forces agents to load many files to understand one behavior.

Architecture fitness and context-budget evaluation should converge rather than become separate competing quality systems.

---

# 29. Release Automation

Status: ⬜ planned.

Encode the manual discipline already proven across releases:

```text
release readiness
→ validation
→ package/tarball identity
→ immutable tag validation
→ explicit publish approval
→ registry smoke
→ GitHub Release
```

Potential checks:

- clean tree;
- version consistency;
- changelog/release-note state;
- validation evidence;
- package identity;
- tag target;
- registry version;
- release evidence.

Publishing remains explicit. Release automation must expose evidence rather than hiding the release process behind a single opaque action.

---

# 30. Community Profiles / Plugin Model

Status: ⬜ planned after core contracts stabilize.

Define:

- trust model;
- compatibility and versioning;
- ownership interaction;
- allowed commands;
- security boundaries;
- supply-chain protections;
- handling of conflicting rules;
- hidden-prompt risks;
- lifecycle compatibility.

Plugin behavior must not compromise the deterministic VCP core.

---

# 31. Mobile Stack Profiles

Status: ⬜ planned but not reprioritized.

The public README already carries this commitment. Neither the consolidated handoff nor Agent-First Workflow Evolution removed it.

Before implementation, explicitly decide:

- which mobile ecosystems are first-class;
- what evidence proves the stack;
- what verification commands are discoverable;
- whether mobile needs additional security/build/release concerns;
- how mobile profiles interact with monorepos.

Do not silently assign it a new priority without a roadmap decision.

---

# 32. Dependency-Aware Execution Order

The roadmap is not purely linear. The following dependencies govern sequencing.

## Immediate frontier

```text
Resolve CI validation (#15)
        ↓
Validate + dogfood + merge PR #14
        ↓
Complete protocol docs + validate/review + dogfood PR #18
```

## Workflow spine

```text
Slice A — protocol/docs
        ↓
Slice B — dogfood
        ↓
Decision: persistence justified?
        ↓ yes
Slice C — mode + blockedBy metadata
        ↓
Slice D — graph validation / eligibility / human frontier
        ↓
Slice E — freshness integrated into current-truth context
```

If dogfood shows persistence is unnecessary, retain the semantics as protocol and revisit only with evidence.

## Parallel-safe design work

These may advance in design/research while the workflow spine is being dogfooded, but final implementation must consume shared contracts:

- Git-aware bounded review;
- Source-of-Truth freshness design;
- monorepo/CI evidence research;
- security-profile design;
- prompt-evaluation fixtures.

## Later tracks

Architecture fitness, release automation, mobile profiles, and community/plugin work proceed after the relevant core contracts are stable enough to avoid building on transient semantics.

---

# 33. Stage Exit Criteria Rule

Every future roadmap stage must define, before implementation or early during planning:

- dependency prerequisites;
- explicit user outcome;
- non-goals;
- state/schema impact;
- backward-compatibility expectations;
- human-decision boundaries;
- verification plan;
- dogfood/conformance scenario;
- documentation surfaces;
- independent review requirement;
- release classification.

A numbered stage without exit criteria is planning shorthand, not a completion contract.

---

# 34. Definition of V1-Quality Completion

V1 is not “all checkboxes implemented.”

V1 quality means:

> A new or experienced programmer can bring VCP into a supported repository, state an engineering intent, and have an external coding agent carry that intent through evidence discovery, clarification, accepted decisions, bounded vertical tasks, dependency-aware execution, deterministic verification, independent review, QA/follow-up, safe lifecycle management, and release readiness — without hidden AI decisions, manual-paperwork dependency, uncontrolled scope expansion, or unverifiable success claims.

And:

> A fresh capable agent can continue from repository state + VCP context without requiring the previous chat transcript.

## Core workflow

```text
[x] init
[x] doctor
[x] task
[x] readiness
[x] context
[x] verify
[x] update
[x] rollback
[x] manage ownership
```

## Agent-first behavior

```text
[x] repository discovery guidance
[x] AI-drafted paperwork
[x] human decision boundary
[in flight] clarification contract
[in flight] vertical-slice guidance
[in flight] AFK/HITL protocol
[in flight] fresh independent review protocol
[ ] canonical docs convergence
[ ] real workflow dogfood
[ ] shared-design / decision / negative-decision contract proven
[ ] decide task-graph persistence from evidence
[ ] dependency graph validation if persistence is justified
[ ] QA → follow-up → graph recomputation loop
[ ] restartability conformance scenario
```

## Knowledge lifecycle

```text
[x] Source-of-Truth structure
[ ] decision-state contract
[ ] negative-decision durability
[ ] freshness/supersession semantics
```

## Repository scale

```text
[x] single-project stack profiles
[ ] mobile stack profiles
[ ] monorepo topology
[ ] deeper CI profiles
```

## Security

```text
[x] generic security/threat framework
[ ] concrete security profiles
[ ] profile conformance fixture(s)
```

## Review / release

```text
[x] review context
[x] proven manual release discipline
[ ] Git-aware bounded review
[ ] encoded release automation
```

## Product quality / assurance

```text
[x] regression suite
[x] existing dogfood workflow
[ ] Feature Completion Standard adopted
[ ] requirement traceability practiced
[ ] end-to-end conformance suite
[ ] prompt evaluation harness
[ ] architecture fitness functions
[ ] cross-agent behavioral conformance where practical
```

## Ecosystem

```text
[ ] community profile/plugin model
```

---

# 35. Current Status Board

```text
RELEASED FOUNDATION
[x] v0.9.2 immutable baseline
[x] agent-first onboarding
[x] repository evidence discovery
[x] dynamic stack detection
[x] verification command discovery
[x] Task Packs
[x] readiness gates
[x] bounded Context Packs
[x] planned paths
[x] verification evidence
[x] Doctor coverage semantics
[x] safe lifecycle updates
[x] rollback / ownership management
[x] dogfood-driven releases

IN FLIGHT
[~] Issue #8 / PR #14 — safe profile provenance + re-profiling
[~] Issue #16 / PR #18 — workflow protocol foundation
[~] Issue #19 / PR #20 — system-completion roadmap

BLOCKED
[!] Issue #15 — GitHub Actions jobs fail before runner assignment

WORKFLOW DESIGNED
[design] Canonical Grill → shared design → PRD → vertical slices → graph → QA loop
[design] DISCOVERED / PROPOSED / APPROVED
[design] AFK/HITL model
[design] blockedBy dependency model
[design] Dependency DAG
[design] Human dependency frontier
[design] AFK eligibility / queue
[design] task-state candidates

WORKFLOW REMAINING
[ ] canonical documentation convergence
[ ] new workflow dogfood
[ ] mode persistence decision
[ ] blockedBy persistence decision
[ ] graph validation
[ ] cycle detection
[ ] eligibility engine
[ ] human frontier computation
[ ] QA → issue → graph recomputation
[ ] restartability conformance
[ ] Source-of-Truth freshness

ORIGINAL V1 TRACKS REMAINING
[ ] Git-aware review
[ ] monorepo + deeper CI profiles
[ ] security profiles
[ ] prompt evaluation
[ ] architecture fitness
[ ] release automation
[ ] mobile stack profiles
[ ] community/plugin model

ASSURANCE REMAINING
[ ] Feature Completion Standard dogfooded/adopted
[ ] requirement traceability practice
[ ] end-to-end conformance suite
[ ] cross-agent behavioral conformance where practical
```

---

# 36. Next Smallest Coherent Execution Slices

Do not start all remaining work simultaneously.

## Next 1 — Restore executable validation

Resolve Issue #15 or establish an explicitly accepted equivalent validation channel.

## Next 2 — Finish Issue #8 evidence

Run validation, real upgrade dogfood, independent review, then merge PR #14 if evidence holds.

## Next 3 — Finish protocol coverage

Extend the Stage 2 guidance so the remaining canonical surfaces converge:

- discovery prompt;
- operating model;
- Task Pack guidance;
- Context Pack guidance;
- Quickstart where necessary.

Keep this documentation/protocol-only unless dogfood proves product state is necessary.

## Next 4 — Dogfood the complete protocol

Use a real feature with:

- at least one discoverable fact;
- at least one proposal-safe decision;
- at least one true human decision;
- at least one AFK task blocked by HITL;
- at least two independent tasks if possible;
- executable verification;
- fresh review;
- QA/follow-up finding.

## Next 5 — Decide persistence from evidence

Only after dogfood decide whether `mode` and `blockedBy` become Task Pack metadata.

If yes, implement the smallest backward-compatible schema slice before building graph algorithms.

---

# 37. Working Rule

At every roadmap step:

1. inspect current repository evidence before calling behavior a defect;
2. preserve released identities;
3. preserve explicit human decisions;
4. distinguish facts, proposals, and approvals;
5. prefer the smallest coherent dogfoodable slice;
6. keep context bounded and restartable;
7. require deterministic evidence for executable claims;
8. do not turn protocol concepts into persistent state without evidence;
9. do not let the agent silently expand scope;
10. do not let blocked AFK work infer missing human intent;
11. define exit criteria before claiming a stage complete;
12. connect every material requirement to implementation, tests, documentation, dogfood, and release evidence;
13. make every new capability integrate with the same VCP operating model rather than creating a parallel subsystem.

---

# 38. Final Product Standard

The long-term standard is not that VCP magically guarantees every generated project is perfect.

The standard is that VCP makes high-quality AI-assisted engineering **systematic, inspectable, evidence-driven, and difficult to bypass accidentally**.

A roadmap capability is complete only when its:

```text
design
+ human boundary
+ state model
+ implementation
+ compatibility/migration behavior
+ tests
+ security implications
+ documentation
+ real workflow evidence
+ independent review
+ shipped artifact
```

agree with each other.

That is how VCP becomes one coherent engineering control plane rather than a collection of individually useful commands.