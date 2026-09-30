# Task Packs

`vcp task` turns a feature-sized intention into a repository-native work packet before implementation begins.

The goal is not to generate implementation code. The goal is to create the **bounded context, decision boundary, dependency contract, and verification contract** that a coding agent and reviewer need.

The coding agent should draft and maintain the Task Pack from repository evidence. The developer should be asked only for product or engineering decisions that require human intent.

## Create a task

```bash
vcp task accept-invite --title "Accept organization invitation"
```

When running directly from this GitHub repository:

```bash
npx --yes --package=github:Moeeryani/Vibe-Coding-Production-Kit \
  vibe-coding-production task accept-invite \
  --title "Accept organization invitation"
```

By default the file is created at:

```text
docs/tasks/accept-invite.md
```

Target a different repository with:

```bash
vcp task accept-invite --dir ../my-app
```

Preview without writing:

```bash
vcp task accept-invite --dry-run
```

Replacing an existing task requires explicit opt-in:

```bash
vcp task accept-invite --force
```

## Project-root ownership

A Task Pack belongs to one **VCP project root**. For task workflow commands, the project root is:

- the directory passed with `--dir`; or
- the current working directory when `--dir` is omitted.

That same root owns the whole task workflow:

```text
vcp task <slug> --dir <project>
vcp ready <slug> --dir <project>
vcp context <slug> --dir <project>
vcp verify <slug> --dir <project>
```

Within that selected root:

- task slugs resolve to `docs/tasks/<slug>.md`;
- Source-of-Truth references are repository-relative to that root;
- context `--include`, `--planned`, and `--output` paths are relative to that root;
- verification evidence output is relative to that root;
- verification commands execute with that root as their working directory;
- human/JSON task paths are reported repository-relative with portable `/` separators.

`--dir` selects which project owns the task. It does **not** rebase a Task Pack authored for another project. If a Task Pack is copied or moved to a different project root, its repository-local references and verification contract must already be valid in that new project or be deliberately updated there. VCP must not fall back to parent-repository files or infer an old root.

This keeps nested repositories and monorepo subprojects deterministic without adding a persisted `projectRoot` field or migration to current Task Packs.

## What a Task Pack contains

- one explicit outcome;
- Source-of-Truth references;
- requirement restatement;
- acceptance criteria;
- in-scope and out-of-scope boundaries;
- affected architecture/data/API boundaries;
- domain invariants;
- security/privacy/tenant questions;
- failure modes and edge cases;
- observability expectations;
- unit/integration/E2E/security test plan;
- rollout/migration/recovery thinking;
- a plan-before-code section;
- independent review checklist;
- durable independent-review evidence;
- completion report.

Source-of-Truth file references must be explicit. The canonical Task Pack table uses its `Reference` column for repository-local references; labeled bullets such as `Reference:`, `Source:`, or `File:` are also supported. Ordinary inline code in explanatory prose—permissions, states, commands, identifiers, API names, and similar terms—is not a file reference merely because it is wrapped in backticks. This keeps Task Packs readable without weakening path validation for references that are actually declared.

The agent should populate these sections from existing repository evidence and bounded analysis. If a decision changes intended product behavior, security posture, compatibility policy, data ownership, destructive migration policy, architecture direction, risk acceptance, rollout, or another choice that cannot be inferred safely, the agent should ask the developer a focused question and record the approved answer in the task or governing Source of Truth.

Preserve approved negative decisions and explicit exclusions as well as positive requirements. A later agent should not reopen rejected scope merely because it is absent from the implementation diff.

## What makes a good AI-sized task?

A strong task should be:

- bounded;
- outcome-oriented;
- reviewable;
- testable;
- independently understandable;
- small enough for one strong implementation/review context;
- explicit about acceptance evidence;
- explicit about dependencies and unresolved human decisions.

Prefer a coherent vertical behavior over a broad technical phase.

Good:

```text
Award points when a lesson is completed and show the updated total.
```

Potentially poor if it is only a project phase:

```text
Create all database tables.
Implement all backend services.
Build all frontend screens.
Add tests later.
```

A vertical slice may legitimately cross schema, domain, service, API, UI, and tests when that is the smallest independently verifiable behavior.

Horizontal work is acceptable when it is independently valuable or genuinely required infrastructure, but it should not be the default decomposition merely because technical layers exist.

## AFK vs HITL

`AFK` and `HITL` describe **who can execute a task**, not whether the task is currently ready.

### AFK candidate

A task can be considered AFK-safe when the correct implementation can be determined from:

- approved requirements;
- repository evidence;
- clear task boundaries;
- known dependencies;
- executable verification;
- no unresolved human intent.

Examples:

- implement an already-approved API contract;
- add a regression test for a known defect;
- perform a bounded internal rename from an accepted plan;
- implement approved parser behavior.

### HITL required

A task/decision requires human involvement when the correct answer depends on non-inferable intent, such as:

- breaking or preserving compatibility;
- retroactive data behavior;
- authorization semantics;
- material UX behavior;
- destructive migration acceptance;
- residual security/privacy risk;
- rollout policy.

AFK does **not** mean easy and HITL does **not** mean hard. The key question is whether the agent can determine the correct next action without new human intent.

## Dependencies and blocking

Execution mode and dependency state are separate concepts.

```text
mode: AFK | HITL
blockedBy: [...]
```

These fields are **protocol concepts today**. They are not yet required Task Pack schema fields. Dogfood must prove that machine-readable persistence materially improves orchestration before the product requires them.

Core invariant:

```text
AFK ≠ READY
```

An AFK task is executable only when:

```text
AFK
+ all blockers complete
+ no unresolved human decisions
+ implementation readiness passes
+ required verification is executable
```

An AFK task blocked by HITL input must stay blocked. The agent must not infer the missing decision.

Independent unblocked AFK tasks may proceed even when another branch is waiting for a human decision.

## Split mixed tasks when safe

Avoid making a large task entirely HITL when only one small decision actually requires the human.

Instead of:

```text
Decide retention period and implement cleanup worker.
```

prefer:

```text
Task A — HITL
Approve retention period.

Task B — AFK
Implement cleanup worker using the approved retention period.
blockedBy: A
```

This preserves the human decision boundary while freeing the implementation work for autonomous execution after the decision is resolved.

## Human dependency frontier

The **human dependency frontier** is the smallest currently unblocked set of HITL decisions preventing further AFK progress.

Agents should not ask the developer to resolve every future decision up front when only one decision blocks executable work now.

Desired behavior:

```text
Eligible AFK: none
Next human dependency: approve token-expiration policy
Downstream blocked: implement expiry + integration tests
```

After the human decision is recorded, eligibility should be recomputed.

## Task state semantics

VCP may eventually need task-state concepts such as:

```text
DRAFT
READY
BLOCKED
IN_PROGRESS
VERIFYING
REVIEW
DONE
```

`WAITING_FOR_HUMAN` may be a derived explanation rather than persisted state.

These are not new required schema fields in this protocol slice. Before persistence, VCP must define legal transitions, readiness interaction, external issue-tracker interaction, failure/reopen behavior, and backward compatibility.

## Context-aware verification

If `AGENTS.md` contains concrete verification commands, the generator copies the applicable configured commands into the Task Pack.

For example, this project configuration:

```text
LINT_COMMAND=npm run lint
TYPECHECK_COMMAND=npm run typecheck
UNIT_TEST_COMMAND=npm test
BUILD_COMMAND=npm run build
```

becomes an explicit task verification section. Placeholder commands and non-applicable entries such as `n/a — no E2E surface` are not presented as executable checks.

This matters because the task should say **what was actually configured**, not invent commands from the language or framework.

For unattended work, verification is part of eligibility, not a cleanup step after implementation.

```text
weak checks + AFK = high risk
clear contract + strong checks + bounded task = good AFK candidate
```

## Durable independent-review evidence

Fresh review is only restartable when its **material outcome** survives beyond the reviewer conversation. The canonical Task Pack therefore includes `## Independent review evidence` as the durable handoff location.

For every material finding preserve:

- finding class: `BLOCKER`, `DEFECT`, `RISK`, `FOLLOW-UP`, or `NO ACTION`;
- current-task disposition: `must fix in this task`, `follow-up candidate`, or `n/a` for summarized `NO ACTION` evidence;
- concise finding/evidence;
- resolution or follow-up reference;
- residual risk where applicable.

Use the bounded table in the Task Pack:

```text
| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| DEFECT | must fix in this task | Replay test fails after state mutation | Fixed in service + regression test | none known |
| FOLLOW-UP | follow-up candidate | Persistent-store race is not exercised | #123 | remains until persistent adapter exists |
```

Do **not** paste the full review transcript. Do **not** repeat the PRD or other authoritative Source of Truth. Routine `NO ACTION` checks may be summarized in one row rather than exhaustively recorded.

If a finding is fixed in the current task, keep the finding and record its resolution instead of deleting the evidence. If work is deferred, record the durable issue/task reference where possible. This preserves why scope was accepted and lets a fresh continuation agent distinguish resolved findings from residual risk without the old chat.

Older explicit task files remain compatible. If they do not yet contain this section, the reviewer may add the bounded section to the task/completion record; VCP does not require a schema migration or a separate review database.

## Current task vs follow-up

When implementation/review/QA discovers additional work, ask:

```text
Is this required to satisfy the current acceptance criteria safely?
```

If yes, fix it in the current task.

If no, create an explicit follow-up rather than silently broadening the task.

## Recommended daily loop

What the developer does:

```text
State feature intent
      ↓
Answer only unresolved human decisions
      ↓
Approve/correct important decisions and plan
      ↓
Review final evidence and result
```

What the coding agent drives:

```text
Inspect repository + current Source of Truth
        ↓
Clarify facts / proposals / human decisions
        ↓
Draft shared design / destination when needed
        ↓
Break work into vertical slices
        ↓
vcp task <slug>
        ↓
Draft/update bounded Task Pack from evidence
        ↓
Identify dependencies + AFK/HITL recommendation
        ↓
vcp ready <slug> --stage plan
        ↓
vcp context <slug> --mode plan
        ↓
Plan + resolve blocking human decisions
        ↓
vcp ready <slug> --stage implement
        ↓
Implement only eligible bounded scope
        ↓
Use deterministic feedback
        ↓
vcp verify <slug> --run
        ↓
Fresh independent review
        ↓
Persist material review evidence in the Task Pack
        ↓
Manual/product QA where judgment is required
        ↓
Fix current-task defects or record follow-ups
        ↓
vcp doctor .
        ↓
Merge / release / observe
```

## Task naming

Use lowercase kebab-case slugs that describe one outcome:

Good:
- `accept-invite`
- `rotate-api-key`
- `retry-failed-payment`

Too broad:
- `build-auth-system`
- `finish-backend`
- `refactor-everything`

A large outcome should be decomposed before creating the Task Pack.

## Protocol-first rule

AFK/HITL, `blockedBy`, human-frontier, graph status, and queue concepts are intentionally guidance/protocol first. Do not add required metadata or scheduler behavior merely because these concepts are useful. Dogfood the workflow, observe where prose becomes unreliable, then persist only the minimum state enforcement actually requires.
