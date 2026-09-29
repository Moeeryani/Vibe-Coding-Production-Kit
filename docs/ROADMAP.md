# VCP Roadmap — Current Execution Plan

**Status:** Living execution roadmap  
**Baseline:** VCP `v0.9.2`  
**Purpose:** Keep one current view of what is released, in flight, blocked, next, and later across the original VCP v1 roadmap and the agent-first workflow evolution.

This document is the current execution roadmap. Historical handoffs and deeper design notes remain useful evidence, but this file should be updated whenever roadmap state materially changes.

## North Star

VCP is an **Engineering Control Plane for AI Coding Agents**.

External coding agents reason, inspect, ask, draft, and implement. VCP stores approved truth, gates readiness, bounds context, protects dependencies, runs deterministic verification, preserves evidence, and prevents unverified success claims.

The governing principle remains:

> AI does the paperwork. Human makes the decisions. VCP preserves the decisions. AI codes within those decisions. VCP verifies the result.

VCP must remain agent-agnostic, deterministic, scriptable, inspectable, and free of an embedded LLM runtime.

## Status legend

- ✅ **Done** — released or merged foundation.
- 🟡 **In flight** — implemented in an open PR or otherwise awaiting integration evidence.
- 🔴 **Blocked** — progress depends on resolving an external or infrastructure blocker.
- 🔵 **Designed** — semantics are documented, but product/state implementation has not started.
- ⬜ **Planned** — roadmap work not yet started.

## Current baseline

### ✅ Released foundation — v0.9.2

The current immutable public baseline already includes:

- CLI bootstrap and evidence-based stack detection;
- agent-first onboarding guidance;
- repository discovery and verification-command discovery;
- bounded task packs;
- plan and implementation readiness gates;
- phase-specific bounded context packs;
- explicit planned-path support for greenfield implementation;
- deterministic verification evidence;
- read-only Doctor audits and coverage semantics;
- lifecycle-aware `vcp update`;
- three-way merge, migrations, locking, backups, rollback, and ownership management;
- worked dogfood/reference flows;
- proven manual release discipline.

Do not recreate, retag, or republish v0.9.2 while vNext work is in progress.

## Current integration frontier

### 🟡 Stage 1 — Safe stack-profile provenance and re-profiling

Tracked by Issue #8 and PR #14.

Implemented behavior:

- preserve the original stack selector as `install.requestedStack`;
- distinguish an explicit `generic` selection from `auto` falling back to `generic`;
- allow re-profiling only when stored `stack` is `generic`, recorded `requestedStack` is `auto`, and current deterministic evidence resolves to a supported concrete stack;
- preserve explicit `generic` and provenance-unknown legacy installs;
- expose profile transitions through update check, dry-run, JSON reporting, and transactional apply;
- preserve user-owned verification decisions through normal conflict protections;
- regression coverage for idempotence, reporting, explicit generic, legacy unknown provenance, and customized verification commands.

Remaining before completion:

1. restore executable repository validation;
2. run the real validation contract successfully;
3. dogfood a realistic legacy/auto-derived generic upgrade;
4. merge PR #14;
5. close Issue #8 when the dogfood evidence supports the implemented policy;
6. decide whether the change warrants a patch release.

### 🟡 Stage 2 — Agent workflow protocol

Tracked by Issue #16 and PR #18.

Implemented guidance:

- clarification classification before interrupting the developer: discoverable / proposal-safe / human decision required;
- smallest coherent vertical slices with acceptance evidence and tests;
- autonomous/AFK-safe versus HITL-required boundaries;
- explicit rule that autonomy never bypasses readiness failures, safety rules, conflicts, dependency blockers, or verification failures;
- fresh review that reconstructs intent from task, Source of Truth, acceptance criteria, and diff;
- must-fix-now versus follow-up-candidate disposition so review/QA findings do not silently expand task scope.

Remaining before completion:

1. obtain executable validation evidence;
2. obtain appropriate fresh review evidence for the final PR head;
3. dogfood the protocol on a real feature;
4. merge PR #18;
5. close Issue #16 after dogfood confirms the guidance is coherent.

### 🔴 Infrastructure blocker — GitHub Actions validation

Tracked by Issue #15.

Current symptom:

- Framework Validation jobs finish as failed before repository steps execute;
- zero workflow steps run;
- no runner is assigned;
- retrying reproduces the same behavior.

This must be treated as infrastructure evidence, not as a source/test failure and not as permission to weaken the validation gate.

## Agent-first workflow evolution

The target workflow is:

```text
Intent / brief
  ↓
Research / prototype when needed
  ↓
Clarification / Grill
  ↓
Shared design concept
  ↓
Approved Source of Truth / PRD destination
  ↓
Vertical slices
  ↓
Task graph
  ↓
AFK / HITL classification
  ↓
Dependency analysis
  ↓
Readiness + bounded context
  ↓
Eligible autonomous implementation
  ↓
Deterministic feedback + verification
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
```

Important invariant:

> AFK describes who can execute. Dependencies and readiness determine when execution is allowed.

### 🔵 Designed, not yet persisted

The following concepts are intentionally protocol-first today:

- task execution mode: `AFK | HITL`;
- `blockedBy` relationships;
- dependency DAG;
- cycle detection;
- AFK eligibility;
- human dependency frontier;
- eligible AFK queue;
- dependency-aware parallel phases;
- `WAITING_FOR_HUMAN` explanation/state semantics.

Do **not** add all of these directly to `.vcp/manifest.json` or the task schema yet.

### Next decision after Stage 2 dogfood

If dogfood demonstrates that the semantics materially improve orchestration and cannot be maintained reliably as prose alone, graduate the minimum useful fields to machine-readable task metadata:

```text
mode: AFK | HITL
blockedBy: [...]
```

Then add graph validation in a later slice:

```text
cycle detection
eligibility
human dependency frontier
AFK queue
```

Do not build a scheduler or multi-agent runtime merely because a dependency graph exists.

## Recommended execution order

### 1. Finish the integration frontier

Before starting a large new product surface:

1. fix or otherwise resolve Issue #15 so repository validation actually executes;
2. validate + dogfood + merge PR #14;
3. validate + review + dogfood + merge PR #18.

### 2. Decide whether task-graph semantics graduate from protocol to state

Dogfood first. Then decide whether `mode` and `blockedBy` deserve first-class Task Pack representation.

Avoid prematurely adding:

- cloud scheduling;
- agent runtime;
- Kanban SaaS;
- multi-agent orchestration;
- AI API integration.

### 3. Git-aware bounded review foundation

Combine the original roadmap with the fresh-review contract.

Desired review inputs:

```text
task requirements
+ accepted decisions / Source of Truth
+ actual git diff
+ tests
+ verification evidence
```

Investigate:

- base/head diff discovery;
- changed-file discovery;
- planned versus actual paths;
- scope drift and unrelated files;
- contract changes;
- migrations;
- Source-of-Truth changes;
- bounded review context from the actual diff.

No new CLI command name is approved merely by this roadmap entry.

### 4. Source-of-Truth freshness and supersession

Introduce simple authority states at the document/ADR level first:

```text
DRAFT
ACCEPTED
SUPERSEDED
ARCHIVED
```

Requirements:

- historical artifacts must never masquerade as current truth;
- supersession should identify the current authority;
- context generation should prefer accepted/current material;
- Doctor checks may follow after the semantics are dogfooded.

Do not build a knowledge graph first.

### 5. Monorepo + CI evidence model

Start with one ecosystem, likely Node/npm workspaces if repository evidence supports it.

Goals:

- discover workspace roots;
- understand package boundaries;
- distinguish repo-wide from package-local commands;
- identify affected workspaces;
- build workspace-aware bounded context;
- support package-local verification;
- avoid unnecessary whole-monorepo checks;
- model PR, main/merge, release, scheduled, matrix, and security CI tiers by discovering existing CI first.

### 6. Security profiles

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

Do not claim compliance without real evidence and process.

### 7. Prompt evaluation harness

Use fixture repositories, fixed intents, seeded defects, and expected behavioral properties rather than brittle exact-text matching.

Evaluate questions such as:

- does discovery ask questions repository evidence already answers?
- does the agent invent product behavior?
- does planning respect human decision boundaries?
- does vertical slicing improve task quality?
- does implementation broaden scope silently?
- does review catch seeded defects?
- does security review catch authorization failures?
- does the agent preserve accepted decisions and meaningful `n/a` choices?

### 8. Architecture fitness functions

Turn selected project-specific architecture rules into executable checks where practical.

Potential examples:

- forbidden dependency direction;
- private/internal import violations;
- circular dependencies;
- cross-domain DB ownership violations;
- API/package boundary violations.

Avoid a generic architecture score and do not invent architecture from framework defaults.

### 9. Release automation

Encode the manual discipline already proven across releases:

```text
release readiness
  ↓
validation
  ↓
package/tarball identity
  ↓
immutable tag validation
  ↓
explicit publish approval
  ↓
registry smoke
  ↓
GitHub Release
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

Publishing remains explicit.

### 10. Community profiles / plugin model

Only after the core contracts are stable.

Define:

- trust model;
- compatibility and versioning;
- ownership interaction;
- allowed commands;
- security boundaries;
- supply-chain protections;
- handling of conflicting rules and hidden prompts.

The plugin model must not compromise the deterministic VCP core.

## Matt-derived workflow status

The Matt-inspired workflow is **included**, but additive to—not a replacement for—the original VCP roadmap.

Current state:

- ✅ repository discovery before asking questions;
- 🟡 clarification classification protocol — PR #18;
- 🟡 vertical-slice guidance — PR #18;
- 🟡 AFK/HITL protocol — PR #18;
- 🟡 fresh-context review + follow-up discipline — PR #18;
- 🔵 task dependency DAG semantics — designed;
- 🔵 human dependency frontier — designed;
- 🔵 AFK eligibility / queue — designed;
- ⬜ machine-readable `mode` / `blockedBy` — pending dogfood decision;
- ⬜ graph validation / cycle detection — pending persistence decision;
- ⬜ full QA → new-issue → graph recomputation loop — not yet implemented;
- ⬜ Source-of-Truth freshness — planned separately.

## Original VCP v1 tracks

These remain active and must not be displaced by workflow work:

- Git-aware review/release foundations;
- monorepo/CI profiles;
- security profiles;
- prompt evaluation;
- architecture fitness functions;
- community profiles/plugins.

The roadmap intentionally interleaves workflow improvements with the original product track rather than finishing one entire stream before touching the other.

## Non-goals

VCP is not becoming:

- an LLM runtime;
- a cloud scheduler;
- a Kanban SaaS product;
- a generic multi-agent platform;
- an AI API integration layer;
- a deployment platform.

External coding agents remain the orchestrators.

## Definition of v1-quality completion

### Core workflow

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

### Agent-first behavior

```text
[x] repository discovery guidance
[x] AI-drafted paperwork
[x] human decision boundary
[in flight] clarification contract
[in flight] vertical-slice guidance
[in flight] AFK/HITL protocol
[in flight] fresh independent review protocol
[ ] dogfood protocol on a real feature
[ ] decide/persist task graph metadata if justified
```

### Knowledge lifecycle

```text
[x] Source of Truth structure
[ ] freshness/supersession semantics
```

### Repository scale

```text
[x] single-project stack profiles
[ ] monorepo topology
[ ] deeper CI profiles
```

### Security

```text
[x] generic security/threat framework
[ ] concrete security profiles
```

### Review / release

```text
[x] review context
[x] proven manual release discipline
[ ] Git-aware bounded review
[ ] encoded release automation
```

### Product quality

```text
[x] regression suite
[x] dogfood workflow
[ ] prompt evaluation harness
[ ] architecture fitness functions
```

### Ecosystem

```text
[ ] community profile/plugin model
```

## Working rule

At every roadmap step:

1. inspect current repository evidence before calling behavior a defect;
2. prefer the smallest coherent dogfoodable slice;
3. preserve explicit human decisions;
4. keep context bounded;
5. require deterministic verification for executable claims;
6. do not turn a useful protocol concept into persistent product state until dogfood proves persistence or enforcement is needed;
7. do not let the agent silently expand scope;
8. keep released identities immutable.
