# Context Packs

`vcp context` builds the **smallest useful context bundle** for one task and one engineering phase.

The goal is not to dump the repository or prior conversation into an AI chat. The goal is to give a coding agent enough authoritative context to plan, implement, review, or assess risk without losing the task boundary.

> **Context is a budget, not a dumping ground.**

The coding agent should normally drive this command itself after it has drafted the task and passed the relevant readiness gate.

## Restartability principle

A capable fresh agent should be able to continue from repository state + VCP context without needing the previous chat transcript.

That means durable decisions belong in repository-native Source of Truth, ADRs, Task Packs, tests, and VCP evidence—not only in conversation history.

If a phase cannot be reconstructed without the old chat, the context/Source-of-Truth contract is incomplete.

## Basic usage

Create a planning context from a task slug:

```bash
vcp context accept-invite --mode plan
```

The command reads `docs/tasks/accept-invite.md`, `AGENTS.md`, the planning prompt, and repository-local files referenced in the task's `## Source of truth` section.

Running directly from GitHub:

```bash
npx --yes --package=github:Moeeryani/Vibe-Coding-Production-Kit \
  vibe-coding-production context accept-invite --mode plan
```

You can also pass the task file explicitly:

```bash
vcp context docs/tasks/accept-invite.md --mode implement
```

## Modes

| Mode | Prompt used | Purpose |
|---|---|---|
| `plan` | `prompts/02-plan-task.md` | understand scope and propose the smallest coherent plan before code |
| `implement` | `prompts/03-implement-task.md` | execute an approved eligible task within repository constraints |
| `review` | `prompts/04-code-review.md` | fresh independent review against requirements, current truth, actual changed area, tests, and evidence |
| `security` | `prompts/05-security-review.md` | focused threat/control review for sensitive changes |
| `release` | `prompts/07-release-review.md` | release-readiness and operational verification |

## Phase context contracts

Context should be phase-specific rather than an ever-growing transcript.

### Plan context

The planning phase normally needs:

```text
intent / task outcome
bounded Task Pack
relevant current Source of Truth
constraints
approved decisions
unresolved human decisions
known dependencies
```

Planning does not need unrelated implementation files or the full chat history.

### Implementation context

Implementation normally needs:

```text
approved task
approved plan
relevant contracts / Source of Truth
existing affected files
approved planned future files
known dependencies / blockers
verification commands
```

If required human intent is unresolved or the task is otherwise blocked/unready, context availability is not permission to implement.

### Review context

Fresh review normally needs:

```text
task
accepted requirements / acceptance criteria
approved decisions
current relevant Source of Truth
actual changed files / diff surface
tests
verification evidence
```

The reviewer should not need the implementation agent's conversation history or summary to reconstruct the intended behavior.

### Security context

Security review should include only the relevant trust boundaries, data flows, authorization/authentication rules, threat model, affected code, tests, and evidence needed to assess the change.

### Release context

Release review should include version/release state, relevant changes, verification evidence, operational/recovery concerns, and release-specific Source of Truth—not unrelated historical conversation.

## Explicit implementation context

Source-of-truth documents describe intent and constraints, but an implementer or reviewer may need a small amount of current code context.

Use repeatable `--include` flags only for repository-local files that already exist and whose current contents belong in the context pack:

```bash
vcp context accept-invite \
  --mode implement \
  --include src/invitations/repository.ts
```

For greenfield implementation files that do **not** exist yet, use repeatable `--planned` flags in `implement` mode:

```bash
vcp context accept-invite \
  --mode implement \
  --planned src/invitations/service.ts \
  --planned test/invitations/service.test.ts
```

A planned path is recorded in the context pack and manifest as an approved repository-local implementation path, but no file contents are included because the file does not exist yet. This lets the agent build implement context before creating greenfield files.

The distinction is deliberate:

- `--include <path>` means **this file exists; include its contents**;
- `--planned <path>` means **this implement-mode path is approved but does not exist yet**.

`--planned` is rejected outside `implement` mode. It is also rejected when the path already exists; use `--include` in that case. Both options reject paths outside the repository root. Review context remains strict: changed files should exist by review time and should be passed with `--include`.

## Context and task eligibility are separate

A context pack is transport, not authorization.

Creating implement context must never be interpreted as permission to run a task that is:

- blocked by incomplete dependencies;
- waiting on unresolved human intent;
- failing implementation readiness;
- missing required executable verification;
- stopped by another safety/conflict gate.

AFK/HITL describes who can execute. Dependencies and readiness determine whether work may execute.

## Fresh-review discipline

The builder should not be the only reviewer operating inside the same assumption-heavy context.

Preferred flow:

```text
Implementation Agent
      ↓
Verification Evidence
      ↓
Fresh Review Context
      ↓
Independent Reviewer
```

The review pack should reconstruct requirements and evidence independently instead of embedding unnecessary implementation narration.

Material review findings, dispositions, resolutions, follow-up references, and residual risks should then be written back to durable Task Pack/completion evidence. The context pack is transport into review; reviewer chat is not durable engineering state.

## Write a reusable pack

By default the pack is printed to stdout so it can be piped or passed into any coding tool. To save it:

```bash
vcp context accept-invite \
  --mode plan \
  --output .vcp/context/accept-invite-plan.md
```

Existing output files are protected. Replacing one requires explicit `--force`.

Preview an output operation without writing:

```bash
vcp context accept-invite \
  --mode plan \
  --output .vcp/context/accept-invite-plan.md \
  --dry-run
```

## Context budget

The default rendered limit is **120,000 bytes**. A pack above that limit fails instead of silently flooding the agent with context.

```bash
vcp context accept-invite --mode plan --max-bytes 80000
```

Set `--max-bytes 0` only when you deliberately want no limit.

When a pack is too large, prefer:

1. removing irrelevant Source-of-Truth references;
2. removing unnecessary `--include` files;
3. tightening the task boundary;
4. preferring stable module interfaces over loading many implementation files;
5. only then considering a larger budget.

Good architecture compresses context. A context-budget failure may reveal that task boundaries or module boundaries are too broad, not merely that the byte limit is inconvenient.

## Security and path safety

The command rejects:

- task paths outside the repository;
- Source-of-Truth references that escape the repository root;
- explicit includes outside the repository;
- planned paths outside the repository;
- output paths outside the repository;
- URL references as local files.

This prevents a task document or context option from accidentally causing the context builder to read or authorize unrelated local paths.

## Recommended phase loop

What the developer should experience:

```text
State feature intent
      ↓
Answer only unresolved human decisions
      ↓
Approve/correct important decisions and plan
      ↓
Review final result and evidence
```

What the coding agent should execute:

```text
Inspect repository + current Source of Truth
      ↓
Clarify discovered / proposed / human decisions
      ↓
Draft/update vertical bounded task
      ↓
vcp ready <slug> --stage plan
      ↓
vcp context <slug> --mode plan
      ↓
Plan + resolve blocking human decisions
      ↓
vcp ready <slug> --stage implement
      ↓
confirm dependency / AFK eligibility
      ↓
vcp context <slug> --mode implement [--include <existing affected files>] [--planned <new files>]
      ↓
Implement bounded scope + deterministic feedback
      ↓
vcp verify <slug> --run
      ↓
vcp context <slug> --mode review --include <changed files/tests>
      ↓
Fresh independent review
      ↓
Manual/product QA where needed
      ↓
fix required findings or record follow-ups
      ↓
vcp doctor .
      ↓
Merge / release / observe
```

## What context packs are not

A context pack is a **transport format**, not a replacement for repository-native documentation, task state, accepted decisions, or executable evidence.

Do not persist entire chat transcripts merely to make context “complete.” Preserve the durable engineering truth that a fresh agent actually needs.
