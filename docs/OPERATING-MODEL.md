# Operating Model

VCP is an **engineering control plane for AI coding agents**. External coding agents reason, inspect, ask, draft, implement, and run VCP commands. VCP preserves accepted truth, gates readiness, bounds context, verifies executable claims, and protects lifecycle state.

> AI does the paperwork. Human makes the decisions. VCP preserves the decisions. AI codes within those decisions. VCP verifies the result.

## Roles

### Human decision owner
Owns product intent, business rules, security/privacy posture, compatibility policy, architecture direction, data ownership, destructive migration decisions, risk acceptance, rollout policy, prioritization, and final approval where judgment is required.

### Discovery / planning agent
Inspects repository evidence, separates discovered facts from proposals and human decisions, drafts Source of Truth and bounded tasks, identifies dependencies, and proposes the smallest coherent plan. It does not silently invent unresolved human intent.

### Implementation agent
Executes only approved, unblocked, implementation-ready scope. It adds/updates tests, uses deterministic feedback, runs configured verification, and does not broaden scope silently.

### Review agent / human reviewer
Starts from requirements, accepted decisions, current Source of Truth, actual diff, tests, and verification evidence rather than trusting the implementation narrative. It classifies concrete defects/risks, separates required fixes from follow-up work, and preserves material review findings/dispositions in durable task/completion evidence so later agents can audit the review without the old conversation.

### CI / executable validation channel
Acts as the mechanical gate for reproducible checks when available. Executed evidence is more authoritative than an agent saying “looks good.” If CI infrastructure cannot run, an explicitly accepted equivalent validation channel must still execute the repository contract; unavailable CI is neither a pass nor a source failure.

## Source-of-truth hierarchy

1. Accepted product requirements and acceptance criteria
2. Accepted security/privacy/compliance requirements
3. Architecture + accepted ADRs
4. API/data/domain contracts
5. Approved task scope and decisions
6. Existing code behavior where not contradictory
7. Chat context

When sources conflict, do not silently guess. Surface the conflict and resolve it in the durable Source of Truth.

Historical documents that are superseded or archived must not masquerade as current truth.

## Clarification protocol

Before interrupting the developer, classify uncertainty:

- **DISCOVERABLE** — inspect repository evidence; do not ask.
- **PROPOSABLE** — propose a small reversible engineering default and label it as a proposal/assumption.
- **HUMAN DECISION** — stop and ask when the answer changes product behavior, business rules, security/privacy, compatibility, data ownership, architecture direction, destructive migration policy, risk acceptance, rollout, or another non-inferable intent choice.

Preserve approved negative decisions and exclusions as carefully as positive requirements.

## Canonical lifecycle

```text
Intent / brief
  ↓
Research / prototype when needed
  ↓
Clarification / Grill
  ↓
Shared design concept
  ↓
Decision recording
  ↓
PRD / destination Source of Truth
  ↓
Vertical slices
  ↓
Task graph / dependencies
  ↓
AFK / HITL classification
  ↓
Plan readiness + bounded plan context
  ↓
Plan / approval
  ↓
Implementation readiness
  ↓
Eligibility check
  ↓
Bounded implementation context
  ↓
Implementation
  ↓
Deterministic feedback
  ↓
Verification evidence
  ↓
Fresh independent review
  ↓
Manual / product QA where judgment is required
  ↓
New issues / corrections
  ↓
Reclassify + recompute dependencies
  ↓
Repeat
  ↓
Release → observe → maintain
```

This lifecycle is the canonical workflow. Individual prompts/docs may focus on one phase, but they must not define conflicting workflows.

## Shared design concept

Before turning intent into implementation work, align on:

- what is being built;
- why;
- for whom;
- what behavior changes;
- what remains unchanged;
- what is explicitly out of scope;
- what decisions are approved;
- what remains unresolved.

The agent drafts the destination artifacts from repository evidence + clarification + accepted human decisions. The developer should not be turned into a form-filler for discoverable information.

## Vertical slicing

Prefer the smallest coherent end-to-end behavior that is independently understandable, reviewable, testable, and small enough for one strong context.

Avoid broad horizontal phases such as “database, then backend, then API, then frontend, then tests” unless a horizontal slice is independently valuable or required as infrastructure.

When a task combines one human decision with substantial autonomous implementation, split it when safe:

```text
HITL decision
    ↓ blockedBy
AFK implementation
```

## AFK, HITL, and dependencies

`AFK` and `HITL` describe **who can execute**.

Dependencies/readiness describe **when execution is allowed**.

```text
AFK ≠ READY
AFK + unblocked + no unresolved human intent + implementation-ready + executable verification = eligible
```

An AFK task blocked by unresolved human intent remains blocked. The agent must not infer the missing decision.

A blocked human decision should stop only the affected branch. Independent eligible AFK work may continue.

The **human dependency frontier** is the smallest currently unblocked set of HITL decisions preventing further autonomous progress. Human attention should be pulled only when it becomes a true dependency of further progress.

These semantics are protocol-first today. They do not imply a new persisted scheduler or task schema until dogfood proves that enforcement requires machine-readable state.

## Context is a budget

Each phase receives the smallest sufficient authoritative context.

- planning context: intent, task, current Source of Truth, constraints, approved/unresolved decisions;
- implementation context: approved task/plan, relevant contracts, affected files, planned files, verification commands;
- review context: task, accepted requirements/decisions, current Source of Truth, actual diff/changed area, tests, verification evidence.

A fresh capable agent should be able to continue from repository state + VCP context without needing previous chat history.

## Deterministic feedback and verification

AFK work requires trustworthy executable feedback because a human is not continuously observing it.

Possible evidence includes tests, typecheck, lint, build, contract checks, migration checks, security tests, and E2E checks.

Never infer success when a check can be run.

```text
weak checks + AFK = high risk
clear contract + strong checks + bounded task = good AFK candidate
```

## Fresh review and QA

Fresh review reconstructs intent from requirements and evidence instead of inheriting the implementation agent's assumptions.

Useful finding classes:

- `BLOCKER`
- `DEFECT`
- `RISK`
- `FOLLOW-UP`
- `NO ACTION`

For current-task scope, ask:

```text
Is this required to satisfy the current acceptance criteria safely?
```

If yes, fix it now. If not, capture follow-up work explicitly rather than silently expanding scope.

Material review findings, dispositions, resolutions, follow-up references, and residual risks belong in durable task/completion evidence. Reviewer chat is not sufficient engineering state for restartability.

Tests and review do not eliminate manual/product QA where UI, human behavior, integration, or judgment still matters.

QA findings re-enter the task graph:

```text
Implement
→ Verify
→ Review
→ QA
→ Finding
→ Issue / task
→ classify AFK/HITL
→ dependencies
→ recompute eligibility
→ repeat
```

## Developer experience

The developer should normally experience:

```text
State intent
  ↓
Answer only unresolved human decisions
  ↓
Approve/correct important decisions and plan
  ↓
Review final result + evidence
```

The agent/system should make it easy to see:

- discovered facts;
- proposals;
- approved decisions;
- ready work;
- blocked work and why;
- the next human dependency when one exists;
- verification results;
- remaining uncertainty;
- follow-up work.

The developer should not need to understand internal VCP metadata to use the workflow correctly.

## Core rules

1. Discover before asking.
2. Never manufacture unresolved human intent.
3. Preserve positive and negative accepted decisions.
4. Prefer vertical behavior over horizontal technical phases.
5. Dependencies first, then execution mode.
6. Only unblocked, ready AFK work may run unattended.
7. Keep context bounded and restartable.
8. Executed evidence outranks agent confidence.
9. Fresh review must challenge implementation assumptions and preserve material findings durably.
10. QA findings re-enter work tracking instead of silently expanding scope.
11. Do not persist workflow concepts merely because they are useful prose; dogfood first, then add the minimum state enforcement actually requires.
