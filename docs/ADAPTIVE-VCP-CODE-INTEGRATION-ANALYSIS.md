# Adaptive VCP — Code Integration and Impact Analysis

**Status:** Code-level implementation analysis  
**Runtime/code baseline inspected:** current main after merged Stage 11 / PR #85; detailed consistency pass performed on main at 68dca7d6e172c3ca4c12b190eeaefb372edfafd4. Later documentation-only consistency commits do not change the runtime observations below.  
**Companion design document:** docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md  
**Purpose:** Trace every agreed adaptive-VCP change through the real implementation, persisted lifecycle state, tests, release mechanics, and downstream contracts before any feature work is split into issues.

---

# 1. Why this document exists

The higher-level adaptive plan describes what VCP should become.

This document answers a different question:

> Given the code that exists today, exactly where does each change enter the system, what other behavior depends on that code, what can regress, and how should the change be integrated without breaking VCP's existing lifecycle guarantees?

This is therefore intentionally implementation-oriented.

For every workstream it records:

1. current execution path;
2. connected modules and persisted state;
3. hidden coupling and regression risk;
4. recommended integration architecture;
5. migration/backward-compatibility impact;
6. required tests;
7. concrete evidence that tells us the work is actually complete.

The central conclusion from the code review is:

> Most of the agreed direction is compatible with the current architecture, but it must be introduced through the lifecycle system rather than layered on top as prompt-only behavior.

Several changes that look independent are not independent:

~~~text
smart init
   │
   ├── agent-file ownership
   ├── manifest/baseline semantics
   ├── asset selection
   └── update compatibility

asset separation
   │
   ├── context prompt resolution
   ├── Doctor
   ├── release-check
   └── migrations

capabilities
   │
   ├── stack detection
   ├── AGENTS rendering
   ├── Doctor
   ├── update re-profiling
   ├── manage track
   └── community profiles

auto/manual
   │
   ├── adapter rendering
   ├── workflow-level policy
   └── deterministic gate

vcp gate
   │
   ├── readiness
   ├── verification evidence
   ├── Git provenance
   ├── Task Pack finalization
   └── CI integration
~~~

Implementation must respect these dependency directions.

---

# 2. Current architecture observed in code

## 2.1 Initialization path

The current initializer is concentrated in:

- lib/cli.mjs
- lib/init.mjs
- lib/template.mjs
- lib/adapters.mjs
- lib/stacks.mjs
- lib/state.mjs

Current path:

~~~text
CLI parses init options
      ↓
promptForOptions
      ↓
initProject
      ↓
buildDesiredFiles
      ├── expand CORE_ASSET_ROOTS
      ├── expand GITHUB_ASSET_ROOTS
      ├── generate agent adapters
      └── apply one stack profile to AGENTS.md
      ↓
collect every existing-path conflict
      ↓
conflict?
  yes + no force → abort
  yes + force    → overwrite
      ↓
writeManagedFile for every desired file
      ↓
build manifest
      ↓
snapshot desired baselines
      ↓
write .vcp/manifest.json
~~~

This path is safe against accidental overwrite by default, but it does not yet perform semantic adoption of existing files.

The important limitation is that the initial installer is much simpler than the update system.

---

## 2.2 Update path

The lifecycle updater is considerably more mature:

- lib/update-plan.mjs
- lib/update-apply.mjs
- lib/merge.mjs
- lib/state.mjs
- lib/migrations.mjs
- lib/update-report.mjs
- lib/manage.mjs

It already supports:

- persistent baselines;
- explicit file ownership policy;
- three-way merge;
- preserve behavior;
- generated-file conflict behavior;
- explicit migration removals/renames;
- backup;
- rollback;
- update lock;
- transaction state;
- post-apply verification;
- idempotent planning.

Current update actions include:

~~~text
NOOP
ADD
UPDATE
MERGE
RENAME
DELETE
ADOPT
DETACH
PRESERVE
IGNORED
CONFLICT
~~~

This is the right model for the new initializer to learn from.

The smart-init implementation should not create an unrelated second safety model.

---

## 2.3 Manifest and baseline model

lib/state.mjs currently uses manifest schema version 1.

The manifest stores:

- installed VCP version;
- install metadata;
- ignored paths;
- managed files;
- per-file policy;
- baseline hash/path;
- template version;
- file mode.

Current install metadata contains:

~~~text
agent
stack
includeGitHub
requestedStack     added by init after buildManifest
~~~

The update apply path spreads existing install metadata when rebuilding the manifest. That is useful: additive install fields such as workflowMode can survive updates if all writers preserve them.

However, buildManifest itself does not currently own all install fields consistently; requestedStack is added afterward by init.

That should be cleaned up before more install-state fields are introduced.

---

## 2.4 Current stack model

lib/stacks.mjs currently chooses exactly one stack.

After merged Stage 11, detection order is:

~~~text
go.mod
  → go

Python marker
  → python

React Native dependency + selected-root app marker
  → react-native

tsconfig.json
  → typescript

package.json
  → javascript

otherwise
  → generic
~~~

React Native is therefore current runtime behavior, not pending Adaptive work.

The precedence means a polyglot repository is reduced to one identity.

Stack selection then controls:

- command replacement inside AGENTS.md;
- stack-specific instruction appendix;
- manifest install.stack;
- Doctor stack reporting;
- automatic generic-to-concrete re-profiling;
- update desired-file construction;
- manage track desired-file construction.

This is why capabilities cannot be implemented as an isolated new detector.

---

## 2.5 Context/prompt model

lib/context.mjs currently hardcodes project-relative prompt locations such as:

~~~text
prompts/02-plan-task.md
prompts/03-implement-task.md
prompts/04-code-review.md
prompts/05-security-review.md
prompts/07-release-review.md
~~~

Context creation reads those files from the selected project root.

This is one reason prompts are currently copied into every initialized project.

By contrast, lib/security-profiles.mjs already implements a better package-fallback pattern:

~~~text
project-specific profile exists?
    yes → use project file
    no  → use packaged VCP profile

packaged identity is reported as:
vcp:<path>
~~~

That security-profile resolver is a useful precedent for prompt/reference asset separation.

---

## 2.6 Verification and evidence model

lib/verify.mjs already provides important pieces needed by future vcp gate:

- deterministic implementation-readiness check;
- task-owned verification command parsing;
- command execution;
- pass/fail/skip state;
- timeout/exit/signal evidence;
- selected-project-root semantics;
- Git worktree detection;
- exact HEAD SHA when available;
- dirty-state observation;
- portable nested project path.

Evidence schema version 2 includes task, scope, revision, readiness, commands, result and summary.

Important nuance:

> Git revision/dirty state is captured before verification commands execute and before an optional evidence file is written.

Therefore future final gate logic must inspect current Git state again rather than assuming the saved verification report proves the repository is still unchanged.

---

## 2.7 Review/finalization model

The Task Pack template already describes:

- independent review evidence;
- finding class;
- current-task disposition;
- finalization checklist;
- Status: Done;
- exact-head rerun semantics;
- completion report.

However, much of this is currently a prose contract.

There is no equivalent deterministic parser that proves:

- top-level status is Done;
- all acceptance criteria are checked;
- no unresolved must-fix finding remains;
- review evidence is structurally complete;
- final evidence still matches current HEAD.

This gap is exactly where vcp gate should integrate instead of creating another parallel workflow.

---

# 3. Cross-cutting invariants that must not regress

Every workstream in this document must preserve these existing properties.

## 3.1 Selected-project-root authority

Task, readiness, context, verification, output paths and project-owned Source of Truth are already deliberately rooted to the selected project.

Do not introduce capability scanning, CI scanning, skill routing or smart-init discovery that silently inherits sibling/package/parent authority.

Repository inspection may identify that an enclosing Git workspace exists, but that must not automatically make the enclosing workspace authoritative.

## 3.2 Discover before inventing

Current stack and verification logic intentionally prefers explicit placeholders to invented commands.

New capability/profile code must preserve this.

A capability is evidence.

A capability is not permission to invent a command.

## 3.3 No embedded LLM

Prompt evaluation, agent adapters and VCP workflow all assume an external coding agent.

Nothing in the agreed redesign requires putting model-provider logic into VCP Core.

## 3.4 Deterministic state survives agent changes

Durable decisions, readiness state, evidence and lifecycle information remain repository/VCP state rather than chat-only state.

## 3.5 Existing update safety remains authoritative

New lifecycle features must continue to use:

- path confinement;
- symlink checks;
- backups;
- conflict blocking;
- migration continuity;
- idempotence;
- explicit removal/rename semantics.

---



## 3.6 Adaptive terminology is orthogonal

Do not overload the existing Operating Model term "mode".

Use:

~~~text
workflowMode
  auto | manual
  → trigger behavior for a developer request

workflowLevel
  L0 | L1 | L2 | L3
  → right-sized task/readiness/review/gate ceremony

executionMode
  AFK | HITL
  → who may execute; existing Operating Model concept

contextMode
  plan | implement | review | security | release
  → existing Context Pack mode

dependency/readiness
  blocked / ready / ...
  → whether work is eligible
~~~

Consequences:

- workflowLevel never implies AFK/HITL;
- Auto never overrides blockers/readiness;
- Manual never weakens VCP invariants when invoked;
- dependencies remain evaluated before execution mode;
- CLI --mode remains reserved for Context Packs;
- workflow mode uses an explicit name such as --workflow-mode.

---

# 3A. Product-experience requirements translated into code

The strategic plan now adds five product invariants:

1. invisible-by-default UX;
2. human-attention budget;
3. progressive disclosure;
4. validation checkpoints;
5. Complexity ROI.

These must produce implementation and test consequences. Otherwise they are only aspirations.

---


## 3A.1 Invisible-by-default UX — implementation contract

### Current code reality

VCP already gestures toward an invisible UX:

- AGENTS.md tells the coding agent to drive task → readiness → context → verify → review;
- printInitResult() tells the developer to state feature intent normally and let the agent drive the VCP sequence;
- the CLI exposes deterministic primitives for agents, CI, advanced users, and debugging.

But there is no persisted Auto/Manual mode, no packaged primary VCP router Skill, and no universal interception layer.

### Architectural limit

Because VCP intentionally has no embedded LLM, it cannot deterministically intercept every natural-language request across every supported coding agent.

Therefore Auto mode must not be specified as "VCP always intercepts the prompt."

Use this model:

~~~text
developer intent
      ↓
best-effort router
  Skill + minimal standing instruction
      ↓
inspect project / choose provisional workflow
      ↓
invoke VCP Core
      ↓
deterministic gate checks the result
~~~

Optional platform hooks can tighten integration where supported, but Core correctness must not depend on one vendor's hook system.

The deterministic guarantee is at the outcome/gate boundary, not at prompt interception.

### Hide mechanics, not meaning

The human-facing layer should normally suppress command choreography while surfacing:

- what was discovered;
- what changed;
- material proposals/decisions;
- what remains blocked;
- verification actually run;
- residual risk;
- why a gate failed.

Do not turn invisible UX into opaque automation.

### Affected implementation surfaces

At minimum:

- generated/adopted AGENTS.md VCP section;
- lib/adapters.mjs;
- workflowMode state;
- packaged VCP router Skill;
- prompt/Skill evaluation;
- human-facing reports;
- workflow-level classifier;
- future gate.

### Init implications

Current interactive init asks about target, agent, stack, and GitHub assets.

Smart init should remove questions that repository evidence can answer:

- stack/capabilities → detect;
- CI → detect/preserve;
- existing agent integration → detect/compose.

Only real choices should remain.

### Required tests

A representative Auto L1/L2 evaluation must start from normal developer intent and show the adapter/Skill invoking VCP primitives internally.

The test should not model the user manually issuing every CLI command.

A bypass test must show that missing required VCP state/evidence is rejected by the gate even if agent-side routing failed.


## 3A.2 Human-attention budget — implementation and evaluation contract

### Existing code is already strong here

This point is not a greenfield feature.

Current implementation already has:

- DISCOVERABLE / PROPOSABLE / HUMAN DECISION in AGENTS and prompts;
- discovery instructions that explicitly forbid asking repository-answerable questions;
- planning/implementation instructions that group or defer human boundaries;
- prompt-eval property discover-before-ask;
- evaluator assertions such as not-questioned:<key> that fail if a discoverable fact was asked;
- human-decision-boundary and proposal-not-approval.

Preserve these contracts.

### Actual gap

The current behavior-record schema can tell which question keys were asked and their class, but it does not represent interaction rounds/batches or redundant approval requests.

Therefore it cannot yet deterministically prove:

- several human decisions were grouped into one interruption;
- the agent stopped three times instead of once;
- the agent asked for confirmation before an already-authorized reversible action.

### Recommended evolution

Do not replace the existing evaluator.

When Auto/Skills implementation is ready, evolve the behavior-record contract minimally.

A likely next schema can add bounded observations such as:

~~~text
questionBatches:
  - [decision.a, decision.b]

confirmationsRequested:
  - action-id
~~~

or an equivalent normalized interaction-round structure.

Keep existing question identity/class semantics.

Add evaluator properties equivalent to:

~~~text
human-decisions-grouped
redundant-confirmation-avoided
~~~

Do not migrate schema v1 until the exact observable contract is stable.

### Privacy boundary

VCP does not need runtime conversation telemetry.

Canonical model/adapter evaluations can emit normalized behavior records.

Real dogfood should record aggregate facts—question rounds, corrections, overrides—not full private transcripts.

### Core vs Skill boundary

Conversation behavior remains Skill/agent territory.

Core improves attention efficiency by making more facts deterministically discoverable:

- capabilities;
- commands;
- Source of Truth;
- accepted decisions;
- task state;
- Git/CI evidence.

A capability feature is incomplete if it discovers a fact but the UX still asks the human for it.

### Required regressions

- existing Stage 7 properties remain non-vacuous;
- discoverable facts still fail when questioned;
- HUMAN DECISION items remain visible and unmanufactured;
- new grouped-question scenario turns red when the same decisions are emitted as several avoidable interruption batches;
- redundant-confirmation scenario turns red for a project-policy-authorized reversible action.


## 3A.3 Progressive disclosure — resolver and Context Pack contract

### Existing implementation strengths

lib/context.mjs already provides:

- phase-specific modes;
- explicit Source-of-Truth references;
- explicit implementation includes/planned paths;
- bounded Git review surface;
- 120 KB hard context budget;
- security profiles only in security mode;
- plugin guidance filtered by declared modes.

docs/CONTEXT-PACKS.md already states that context is a budget, not a dumping ground.

### Current contradictions found in code

#### Always-on AGENTS is large

Current root AGENTS.md is roughly 13 KB / 253 lines and contains planning, architecture, data/migrations, APIs, security, error handling, observability, testing, review, Definition of Done, communication, and the full VCP agent workflow.

Because AGENTS is standing context for several agents, this is the first place to reduce always-on token tax.

#### Adapters encourage broad reads

Current Claude/Copilot adapters instruct the model to read product, architecture, security, testing, and delivery documents before implementation.

That undermines the phase-specific Context Pack design.

#### Plugin validation and plugin transport are coupled

loadCommunityPluginContext() correctly filters guidance by mode, but context construction still carries selected-plugin declaration/manifests and verification proposals broadly once plugins are selected.

Trust validation may be necessary on every context build; transport of irrelevant plugin material is not.

### Required loading tiers

~~~text
Tier 0 — minimal standing routing + cross-cutting invariants
Tier 1 — current workflow/level guidance
Tier 2 — task + governing Source of Truth + affected surface
Tier 3 — only relevant risk/profile/plugin material
Tier 4 — deep references on demand
~~~

### AGENTS redesign

Generated VCP-owned standing content should converge toward only:

- authority/source-of-truth rule;
- discover/propose/human-decision boundary;
- Auto/Manual routing;
- no false verification claims;
- configured verification command contract;
- truly universal safety invariants.

Move phase-specific detail into packaged prompts, Skills, and Context Packs.

For adopted existing AGENTS files, only the VCP-managed section should follow this design.

Measure bytes/tokens before and after; do not invent a permanent size threshold until comparative agent evals exist.

### Adapter redesign

lib/adapters.mjs should become a thin router.

Remove broad "read product + architecture + security + testing + delivery docs" language.

Instead direct the agent to:

- repository VCP instructions;
- the relevant VCP Skill/workflow;
- generated Context Pack / governing references for the current change.

### Context manifest

Current manifest gives path + byte size.

Evolve it compactly to identify inclusion class/reason without verbose prose, for example:

~~~text
[prompt]
[task]
[source-truth]
[explicit]
[security-profile]
[plugin-guidance]
[git-review]
~~~

### Community plugin transport

Separate:

~~~text
plugin trust validation
≠
plugin content inclusion
~~~

A selected plugin can be validated every time while its manifest, guidance, or proposals enter rendered context only when relevant to the current workflow.

Verification proposals should not automatically inflate every phase context.

### Negative tests

Tests must prove absence:

- L0 excludes Task Pack/security/profile machinery;
- L1 excludes irrelevant high-risk sections;
- normal plan/implement packs do not inherit security profiles;
- selected but irrelevant plugin guidance/manifests do not enter rendered context;
- package prompt fallback loads one relevant canonical prompt, not all prompts;
- deep Skill references are not eagerly required.

### Budget strategy

Keep the existing hard budget.

Add workflow-level measurement first; tune defaults only from dogfood.

The goal is to remove unnecessary inputs, not simply raise --max-bytes.


## 3A.4 Validation checkpoints and capability-audit evidence contract

Roadmap checkpoints must use durable, reviewable evidence, but they should not create a telemetry product.

Use the cheapest evidence layer capable of answering the question:

~~~text
deterministic fixtures / negative tests
→ canonical prompt/Skill behavior evals
→ structured repository dogfood
→ small real-user workflow tests
→ broader adoption evidence
~~~

### Checkpoint A — adoption

Collect bounded facts such as:

- target repository class;
- files added/changed/removed;
- conflicts;
- instruction/CI preservation;
- init questions;
- questions retrospectively discoverable;
- manual remediation;
- install-to-first-productive-work steps.

### Checkpoint B — adaptation

Collect:

- capability detector outputs;
- false-positive corrections;
- unknowns;
- command proposals vs accepted commands;
- human corrections;
- unsupported fallback result;
- Context Pack footprint delta.

### Checkpoint C — Auto/gate

Collect:

- provisional and final/effective workflow level;
- promotions triggered by inspection/final diff;
- false-high-risk / unsafe false-low-risk cases;
- human interruption rounds;
- redundant questions;
- gate false positives;
- genuine failures/stale evidence caught;
- manual overrides.

### Checkpoint D — Skills/invisible UX

Collect:

- CLI commands user had to know/type;
- VCP-specific concepts required before productive work;
- manual recovery events;
- human questions;
- steps to representative outcome;
- user ability to understand blocker/evidence output without reading framework internals.

### Capability audit

Before major VCP releases, and after a substantial improvement in mainstream coding agents, review:

- AGENTS/Skill instructions now handled natively by models;
- orchestration that can be retired;
- Core checks that no longer prevent observed failures;
- compatibility state whose migration cost exceeds remaining value.

Record removals/deprecations as valid improvement.

### Where evidence should live

Do not add a new VCP runtime command merely to store checkpoint metrics unless dogfood proves that necessary.

Initial checkpoint evidence can live in VCP development Task Packs/research/dogfood artifacts and existing prompt-eval outputs.

release-check should remain focused on reproducible package/lifecycle mechanics; do not mix subjective UX scoring into that deterministic command prematurely.

### No arbitrary thresholds yet

Do not invent percentages before a baseline exists.

Zero-tolerance invariants can be absolute:

- no destructive overwrite;
- no false pass;
- canonical discoverable question must not be asked;
- stale evidence must not pass.

Friction thresholds should be set after baseline dogfood shows realistic distributions.


## 3A.5 Complexity ROI — contribution contract

### Scope

This is a governance rule for development of VCP Core, not a field every consumer application task should carry.

The generic renderTaskPack() template is already intentionally comprehensive. Adding framework-internal ROI paperwork to every generated consumer task would violate the same anti-bloat principle.

### VCP-Core expansion record

For substantial Core expansion in this repository, record:

~~~text
## Why this belongs in VCP Core

Failure prevented:
Evidence that the failure is real/repeated:
Why agent-alone behavior is insufficient:
Why Skill-alone behavior is insufficient:
Why existing project tooling is insufficient:
Deterministic requirement:
New persistent state:
Migration/lifecycle burden:
User-visible complexity added:
User-visible complexity removed:
Dogfood evidence to collect:
~~~

### High-cost changes

Require especially careful review for:

- new persistent manifest state;
- new lifecycle state;
- new permanent CLI commands;
- new migration classes;
- new mandatory gates;
- new managed consumer asset families;
- new orchestration engines.

Every persistent field creates read/write/migrate/update/rollback/document/test obligations.

### Enforcement

Do not add this section to lib/task.mjs's generic consumer template.

Initial enforcement should live in VCP's own contributor/Task Pack/review policy.

Only add a deterministic readiness parser for "Core expansion" if repeated contribution failures prove that prose review is insufficient.

### Protocol-first consistency

This matches an existing VCP principle already used for dependency-graph/task-state ideas: persist only what enforcement proves necessary.

### Removal is part of ROI

Model/tool capability audits may conclude that an existing Core feature should move to a Skill, integrate with existing tooling, or be deprecated.

That is success, not regression.

## 3A.6 Product success is not command success

The technical acceptance model must combine:

~~~text
correctness
+
safety
+
adaptation
+
low ceremony
+
low human interruption
+
bounded relevant context
~~~

A release can be technically green and still fail the product checkpoint.

That is intentional.

# 4. Workstream A — Smart init without a separate adopt command

## 4.1 Current code involved

Primary entry points:

- lib/cli.mjs
- lib/init.mjs
- lib/template.mjs

Direct dependencies:

- lib/adapters.mjs
- lib/stacks.mjs
- lib/state.mjs

Lifecycle dependencies:

- lib/update-plan.mjs
- lib/update-apply.mjs
- lib/manage.mjs
- lib/migrations.mjs
- lib/doctor.mjs
- lib/release-check.mjs

Tests with direct or public init usage include at least:

- test/cli.test.mjs
- test/update-init-guard.test.mjs
- test/update-lifecycle.test.mjs
- test/update-cli.test.mjs
- test/context.test.mjs
- test/readiness.test.mjs
- test/verify.test.mjs
- test/check-command.test.mjs
- test/security-profiles.test.mjs
- test/community-plugins.test.mjs
- test/workspace-source-truth.test.mjs
- test/verification-scope.test.mjs
- test/git-review-context.test.mjs
- test/doctor-coverage.test.mjs
- test/release-portability.test.mjs

This is a broad API change even if the public command name stays the same.

---

## 4.2 Current problem

lib/init.mjs currently performs collision detection like this conceptually:

~~~text
desired path exists?
    no  → write
    yes → conflict

if conflict and --force:
    write desired content anyway
~~~

There is no semantic distinction between:

- an existing project-owned AGENTS.md;
- an existing user CLAUDE.md;
- a VCP-compatible file;
- an unrelated workflow;
- an identical desired file.

The initializer also writes files before any manifest exists and is not implemented through the same transaction model as updates.

---

## 4.3 Important CLI coupling: do not remove --force globally

lib/cli.mjs has one shared parsed.force field.

That flag is used by commands other than init, including operations where explicit overwrite remains useful, such as:

- Task Pack replacement;
- Context Pack output replacement;
- verification evidence replacement;
- release evidence replacement.

Therefore:

> The agreed removal is specifically destructive init force behavior, not a global deletion of every --force capability.

Implementation should make init reject/ignore no such option while keeping other command-specific overwrite behavior.

The help text should stop presenting force as an init escape hatch.

---

## 4.4 Important CLI coupling: --mode already means context mode

lib/cli.mjs already maps --mode to contextMode for vcp context.

Therefore Auto/Manual workflow mode must not reuse a global --mode parser.

Use an unambiguous name such as:

~~~text
--workflow-mode auto
--workflow-mode manual
~~~

and/or a dedicated command:

~~~text
vcp workflow-mode auto
vcp workflow-mode manual
~~~

This prevents context-mode and project-mode semantics from colliding.

---


## 4.5 Recommended implementation architecture

Do not grow `initProject()` into one large conditional function.

Split planning from mutation.

Suggested modules:

```text
lib/repository-inspection.mjs
lib/init-plan.mjs
lib/managed-sections.mjs
lib/prompt-resolver.mjs
lib/init-apply.mjs        ← Stage 13, not Stage 12
```

Names are proposals; responsibility boundaries are the contract.

### repository-inspection

Read-only responsibilities:

- detect whether `.vcp/manifest.json` exists;
- classify NEW / EXISTING / MANAGED;
- identify existing agent instruction files;
- identify CI/config/project markers needed for safe planning;
- detect current stack using the existing Stage 11-compatible stack model;
- never mutate.

Classification affects planning/UX, not path-safety trust.

### init-plan

One deterministic planner is shared by preview and later apply.

Inputs include:

- selected root;
- repository inspection result;
- agent selector;
- current stack selector/result;
- adoption-surface policy.

Output actions:

```text
ADD
ADOPT
COMPOSE
PRESERVE
NOOP
SKIP
CONFLICT
```

The plan is content-free in public JSON.

It may carry private in-memory desired content needed by apply, but public reports must not echo project file contents.

### Stage 12 boundary — planning only for brownfield repositories

Stage 12 implements the planner but **does not add mutating Smart Init for EXISTING repositories**.

Public behavior:

```text
NEW
→ greenfield init remains available
→ dry-run uses the new planner

EXISTING
→ vcp init --dry-run produces full adoption plan
→ vcp init without --dry-run blocks safely
→ no --force bypass

MANAGED
→ no re-init
→ status / update redirect
```

This avoids shipping a half-safe mutation path.

### Stage 13 boundary — init-apply

Stage 13 adds the mutation engine.

Do not pass a previously printed Stage 12 plan into apply as executable authority.

Apply must:

1. acquire the lifecycle lock;
2. inspect current repository state again;
3. run the same planner again under the lock;
4. block if the fresh plan conflicts or differs materially from expected safe conditions;
5. create a complete recovery point;
6. stage/apply;
7. write section-aware baselines/manifest;
8. verify final state;
9. clear transaction/lock.

This deliberately mirrors the existing `applyUpdate()` shape, which already acquires the lock **before** planning.

### Why previews are speculative

Repository state can change between preview and apply.

The design should follow the same principle used by mature plan/apply systems: a preview explains the current proposed effect; mutation is based on a fresh plan against current state.

Stage 12 therefore does not need:

- a saved-plan file;
- a plan database;
- a plan approval object;
- a persisted plan fingerprint.

If later automation proves a saved executable plan is necessary, it must bind to explicit repository/file/version preconditions. Do not build that now.

---

## 4.6 Brownfield adoption surface must be smaller than the current template surface

Current `buildDesiredFiles()` expands:

- all `docs/`;
- all `prompts/`;
- framework validator scripts;
- GitHub issue/PR templates;
- the npm-specific GitHub workflow.

That set is not an acceptable default Smart Init surface for an established repository.

Stage 12 planning must introduce an adoption-aware desired surface or equivalent metadata/filtering.

For EXISTING repositories, default planning should:

### Include only what is required

- VCP lifecycle/internal state;
- bounded VCP agent integration;
- essential project-operational artifacts only when their authority is clear;
- existing project prompt overrides when present.

### Use package fallback instead of copying

Canonical VCP prompts should resolve from the package when no project override exists.

### Preserve/skip by default

- existing project docs;
- existing CI;
- existing GitHub customization;
- framework roadmap/release/task-history docs;
- VCP source validation scripts;
- current npm-specific workflow;
- optional issue/PR hygiene unless explicitly requested.

Do not infer from "canonical VCP path is absent" that the established project has no equivalent product/architecture documentation.

The broader Phase-2 migration later unifies the consumer asset model for greenfield and previously managed projects. Stage 12 only needs a correct minimal brownfield planning surface.

---

## 4.7 Manifest schema boundary for section ownership

Current `readManifest()`:

- accepts schema version 1;
- checks only broad top-level shape;
- does not reject unknown per-managed-file metadata.

Therefore simply adding an `ownership` field to schema v1 is unsafe.

An older v0.9 CLI could read the manifest, ignore the new semantic field, load a section-only baseline, and treat it as a whole-file baseline.

### Required rule

Section ownership requires a new manifest schema version.

Conceptual v2 managed entry:

```json
{
  "policy": "merge",
  "ownership": {
    "kind": "section",
    "sectionId": "vcp-agent-integration",
    "beginMarker": "<!-- VCP:BEGIN -->",
    "endMarker": "<!-- VCP:END -->"
  },
  "baselineHash": "...",
  "baselinePath": "...",
  "templateVersion": "..."
}
```

Whole-file v2 entry:

```json
{
  "policy": "merge",
  "ownership": {
    "kind": "file"
  }
}
```

Migration:

```text
schema v1 entry
→ schema v2 ownership.kind=file
```

Older CLIs then fail closed on schema v2 instead of silently using the wrong baseline semantics.

Stage 12 may land schema-v2 support and migration primitives; section-owned entries are only persisted when an operation actually needs them.

---

## 4.8 Initial-adoption backup and rollback require lifecycle generalization

The current update backup code assumes an already-managed project in one important place:

```text
backup metadata.installedVersion = manifest.installedVersion
```

and current restore behavior only restores manifest/baselines when backups of those objects exist.

That is insufficient for first adoption, where the correct prior state may be:

```text
manifest did not exist
baselines did not exist
```

If Smart Init creates a manifest and then fails, rollback must remove that new lifecycle state.

### Required backup metadata

Generalize recovery metadata so it records prior-state presence explicitly, for example:

```text
operation: init | update
priorManifestExisted: true | false
priorBaselinesExisted: true | false
priorInstalledVersion: <version> | null
```

Exact names are implementation choices.

### Required rollback behavior

For initial adoption:

- restore every pre-existing project file that was composed/changed;
- delete paths that were newly added;
- remove new manifest if none existed before;
- remove new baselines if none existed before;
- clear transaction/lock/stage state.

Current `createBackup()` / `restoreBackup()` primitives should be generalized rather than duplicating backup logic in `init-apply`.

Do not rename the on-disk `.vcp/update.lock` merely for aesthetics in this stage. Helper APIs may become lifecycle-generic while preserving compatible state paths.

---

## 4.9 Stage 12/13 testing contract

### Stage 12 tests

Must prove:

- NEW / EXISTING / MANAGED classification;
- existing repositories receive an action plan instead of collision-only failure;
- EXISTING non-dry-run mutation is blocked;
- init `--force` is rejected while unrelated command-specific force behavior remains;
- dry-run performs zero project-file and zero durable VCP-state writes;
- plan action ordering is deterministic;
- public JSON omits file contents;
- broad framework/CI assets are SKIP/PRESERVE in brownfield plans;
- malformed existing VCP markers produce CONFLICT;
- planner detects existing equivalent Claude/Copilot integration without duplicate insertion.

### Stage 13 tests

Must prove:

- lock is acquired before fresh re-planning;
- a repository change between preview and apply changes/rejects the fresh plan safely;
- apply never trusts a stale preview object;
- all conflicts block before project-file mutation;
- section compose preserves surrounding bytes;
- rollback restores an unmanaged repository to truly unmanaged lifecycle state;
- re-running init after success redirects as MANAGED;
- normal `vcp update` works immediately after adoption;
- apply is idempotent.


## 4.10 Persisted asset-surface identity

A minimal brownfield adoption cannot be correct if the next vcp update immediately rebuilds the full legacy template surface.

Persist install-surface identity as lifecycle state.

Conceptually:

~~~text
legacy-full-v1
brownfield-minimal-v1
~~~

Exact identifiers are not important; reproducible desired-state behavior is.

Required propagation:

- buildManifest / centralized install metadata;
- schema-v1 → schema-v2 migration;
- init plan/apply;
- buildDesiredFiles or its successor;
- update-plan;
- manage track;
- Doctor expectations;
- rollback/restore.

Do not abuse ignoredFiles for this. Ignored paths represent project-owner lifecycle choices, not which VCP product surface was installed.

Phase 2 may deliberately migrate legacy-full and brownfield-minimal to a later unified consumer surface.

---

## 4.11 GitHub request provenance

Current CLI parsing defaults includeGitHub=true before repository classification.

For Smart Init this loses a material distinction:

~~~text
default/unspecified
!=
developer explicitly requested GitHub assets
~~~

Stage 12 planning needs tri-state request provenance such as:

~~~text
unspecified
include
exclude
~~~

For EXISTING repositories:

- unspecified → no optional GitHub hygiene mutation;
- include → only explicitly supported non-CI repository hygiene is eligible;
- exclude → skip;
- existing CI is always preserved.

The current npm-specific workflow is never part of brownfield Smart Init.

For NEW repositories, old default behavior may be retained temporarily for compatibility until Phase 2/3.

The planner input needs provenance; the lifecycle manifest only needs the actual installed decision/profile required to reproduce desired state.

---

## 4.12 Verification-command authority must be inspected, not first-match parsed

lib/verification-commands.mjs and Doctor currently use first-match regular expressions over the whole AGENTS.md.

That is safe only while VCP controls the entire file.

With brownfield section ownership, this can become ambiguous:

~~~text
project content:
UNIT_TEST_COMMAND=project test

VCP section:
UNIT_TEST_COMMAND=detected test
~~~

The current parser silently chooses whichever matching line appears first.

Stage 12 should introduce one shared command-authority inspection helper.

Conceptual output per key:

~~~text
missing
unique(value, source)
duplicate-equivalent
duplicate-conflicting
~~~

Required rules:

- one unambiguous existing project-owned command → preserve/use; do not add a conflicting duplicate;
- no occurrence → VCP section may contribute an evidence-backed value/placeholder;
- equivalent duplicates → normalize deliberately or report; never rely on ordering;
- conflicting duplicates → adoption CONFLICT/HUMAN DECISION.

Task creation and Doctor must consume the same effective-command resolver.

This is not the same as moving commands out of AGENTS.md. That larger storage migration remains separate.

---

## 4.13 Reserved .vcp state and brownfield stack ambiguity

### Reserved .vcp path

If .vcp exists without a valid recognizable VCP manifest, repository inspection must not classify the directory as harmless free space.

Treat unknown pre-existing state as CONFLICT unless a narrowly defined recovery contract recognizes it.

First-adoption recovery metadata must also know whether .vcp existed before the transaction so rollback does not delete unrelated prior content.

### Stack ambiguity before capabilities

Stage 12 continues using the Stage 11 single-stack API for compatibility.

However, auto selection in an established root must not claim that detector precedence proves project intent when multiple major stack-family markers coexist.

Repository inspection should record ambiguity separately from detectStack compatibility output.

When material ambiguity exists:

- explicit selected project root or stack selection may resolve it;
- otherwise the plan should expose a decision/conservative fallback;
- do not persist a fabricated capability set.

This is an adoption safety guard, not early implementation of Workstream C.

---

## 4.14 Prompt resolver and Doctor must land together

Stage 12 package prompt fallback changes the definition of "prompt available."

Current Doctor directly checks for project-local plan/review prompt files.

That would make a correctly adopted brownfield project warn immediately after successful init.

Therefore the canonical prompt resolver must be reusable by at least:

- Context Pack construction;
- Doctor plan/review availability;
- tests/fixtures that prove project override precedence.

The reference SaaS fixture currently proves local prompt parity/no fallback behavior. When fallback lands, update that contract:

- local prompt copies remain a deliberate **override** fixture;
- add a separate fallback test/fixture proving canonical package resolution;
- do not leave documentation claiming there is no fallback.

Doctor's broader framework-validator/CI assumptions are handled by install-surface awareness and later Phase 2/3 work; the prompt-source contradiction cannot wait.

# 5. Workstream A1 — Existing AGENTS/CLAUDE/Copilot files require section-aware ownership

This is the most important second-order effect discovered in the code review.

## 5.1 Why simple append is not enough

Suppose smart init does this:

~~~text
existing AGENTS.md
+
append VCP content
+
snapshot whole resulting file as baseline
~~~

Later buildDesiredFiles still produces VCP's canonical full AGENTS.md as the desired target.

The current update planner compares:

~~~text
baseline = combined user + VCP file
local    = combined user + VCP file
desired  = canonical VCP-only file
~~~

Because local equals baseline, current update logic is allowed to UPDATE the entire file to desired.

That could delete the user's original content on a later update.

Therefore:

> Initial non-destructive composition cannot be implemented safely while pretending VCP owns the entire composed file.

---


## 5.2 Recommended ownership model

Introduce managed-section ownership for files that already existed before VCP.

Example:

```text
existing user content

<!-- VCP:BEGIN -->
VCP-owned integration block
<!-- VCP:END -->

more project-owned content
```

The user-owned surrounding text remains outside VCP ownership.

Ownership and update policy are separate dimensions.

Do **not** model section ownership as `policy: "section"`.

Conceptually:

```text
ownership.kind
  file | section

policy
  managed/merge | generated | preserve
```

For section ownership, the baseline represents the managed section content only.

The full file is still backed up/restored as a filesystem object during transactions.

---

## 5.3 Update semantics for section ownership

The planner should:

1. validate exactly one marker pair for the tracked section;
2. reject missing, duplicate, nested, reversed, or malformed markers;
3. extract the local VCP-owned section;
4. load the section baseline;
5. build the new desired VCP section;
6. compare/merge only the managed section;
7. reconstruct the final file while preserving surrounding project text.

Recommended behavior:

```text
local section == baseline
→ replace with desired section

desired section == baseline
and local section changed
→ preserve local managed-section edit

local + desired both changed
→ bounded three-way merge inside section
   or CONFLICT if overlap

marker structure invalid
→ CONFLICT
```

Do not normalize/reformat surrounding user content as a side effect.

For small generated adapter blocks, a stricter generated policy may conflict instead of merging local section edits.

---

## 5.4 New-project and lifecycle behavior

When a file does not pre-exist:

```text
new repo:
AGENTS.md = whole-file ownership
```

When it pre-exists:

```text
brownfield:
AGENTS.md = section ownership
```

The manifest entry—not the path name alone—decides ownership semantics.

`policyForPath()` can remain a source of default update policy, but it is no longer sufficient to describe ownership.

Schema-v2 migration maps all legacy v1 entries to whole-file ownership.

`update-plan`, baseline handling, apply verification, Doctor, and manage ignore/track must use the manifest ownership record.

## 5.5 Claude adapter

Current lib/adapters.mjs generates an entire CLAUDE.md.

For an existing CLAUDE.md, smart init should preserve it and add only the necessary integration.

At minimum:

~~~text
@AGENTS.md
~~~

or a marked VCP block containing that reference and a concise VCP routing statement.

If @AGENTS.md already exists, return NOOP.

Do not duplicate it.

For new repositories, generating the thin full adapter remains reasonable.

---

## 5.6 Copilot adapter

Apply the same section strategy to an existing .github/copilot-instructions.md.

Do not replace existing organization/project guidance.

Do not duplicate conflicting repository rules.

---

## 5.7 Parsing verification commands

Today parseAgentVerificationCommands reads command slots directly from AGENTS.md.

This means the VCP-owned integration section for existing AGENTS.md must continue to expose the effective verification command contract unless/until verification configuration moves to a separate structured source.

Do not move command configuration casually during smart-init work; that would mix two large migrations.

A later capability refactor may introduce a more structured command source, but initial safe adoption should preserve current command parsing behavior.

---


## 5.8 Files affected

At minimum:

- `lib/template.mjs`;
- `lib/init.mjs` or new init planner/apply modules;
- `lib/state.mjs`;
- `lib/update-plan.mjs`;
- `lib/update-apply.mjs`;
- `lib/update-apply-helpers.mjs`;
- `lib/manage.mjs`;
- `lib/migrations.mjs`;
- `lib/doctor.mjs`;
- `lib/adapters.mjs`;
- prompt resolver/context code;
- CLI reporting/help;
- lifecycle/update/adoption tests;
- `docs/UPDATES.md`;
- `docs/CLI.md`.

The important coupling is not file count; it is that baseline meaning, apply verification, backup/rollback, and manage semantics all depend on the ownership model.


## 5.9 Definition of done

This work is correct only when tests prove:

- existing AGENTS text survives adoption byte-for-byte outside the VCP section;
- existing CLAUDE/Copilot text survives;
- duplicate integration markers are not inserted;
- section baseline contains only managed section content;
- schema-v1 entries migrate to explicit whole-file ownership;
- older-schema behavior cannot silently interpret section baselines as whole-file baselines;
- a subsequent VCP update updates only the VCP-owned section;
- user edits outside the VCP section survive multiple upgrades;
- malformed/missing markers fail safely;
- local edits inside a managed section follow the declared policy and are never silently overwritten;
- manage ignore/track semantics are explicit for section-owned paths;
- post-apply verification compares the correct reconstructed full-file result;
- rollback after first adoption removes newly created manifest/baseline state when no prior lifecycle state existed.

# 6. Workstream B — Separate framework/package assets from consumer project assets

## 6.1 Current code involved

lib/template.mjs currently installs broad roots:

~~~text
AGENTS.md
docs/
prompts/
examples/feature-spec.example.md
scripts/validate-framework.sh
scripts/validate-framework.mjs
~~~

GitHub roots also include:

~~~text
.github/ISSUE_TEMPLATE
.github/PULL_REQUEST_TEMPLATE.md
.github/workflows/validate.yml
~~~

This means consumer installs currently receive a large portion of the VCP source repository.

---

## 6.2 Current downstream dependencies on copied assets

Removing copied assets affects more than init.

### Context

lib/context.mjs expects project-local phase prompts.

### Doctor

lib/doctor.mjs checks:

- project-local plan/review prompts;
- project-local scripts/validate-framework.sh;
- .github/workflows/validate.yml.

### CLI tests

test/cli.test.mjs asserts copied validation scripts/workflow exist and can execute.

### Release automation

lib/release-check.mjs creates/updates a temporary managed consumer and then executes:

~~~text
<managed project>/scripts/validate-framework.mjs
~~~

The release smoke therefore currently assumes that a consumer project contains VCP's source-framework validator.

### Lifecycle migrations

If assets simply disappear from buildDesiredFiles without an explicit migration removal, update-plan intentionally emits CONFLICT for managed files that disappeared unexpectedly.

This is a good safety feature and must not be bypassed.

---

# 7. Workstream B1 — Replace broad asset roots with an explicit consumer asset manifest

## 7.1 Target split

The package may continue to ship VCP documentation, prompts, evaluations and source validation assets.

The consumer install should contain only project-operational artifacts.

Conceptual split:

~~~text
PACKAGE-ONLY / VCP REFERENCE
----------------------------
docs/CLI.md
docs/ROADMAP.md
docs/UPDATES.md
docs/releases/*
framework task history
scripts/validate-framework.*
evaluations/*
canonical prompts
internal design docs

CONSUMER PROJECT ASSETS
-----------------------
AGENTS integration
project Product Brief / PRD
project architecture templates
project threat model/profile declaration
project test strategy
Definition of Ready / Done
project task directory/template support
optional issue/PR hygiene
lifecycle state
~~~

Do not use a broad docs directory root in the consumer builder.

Use an explicit list.

---

## 7.2 Prompt resolution must change first

Before prompts are removed from consumer assets, lib/context.mjs must support package fallback.

Recommended precedence:

~~~text
explicit project prompt override exists
    ↓
use project override

otherwise
    ↓
use packaged canonical prompt
~~~

Identity should be explicit.

For example:

~~~text
project override:
prompts/02-plan-task.md

packaged:
vcp:prompts/02-plan-task.md
~~~

This mirrors security-profile behavior and keeps Context Pack manifests inspectable.

---

## 7.3 Existing project prompt customization migration

This pattern gives us a clean migration:

- old unmodified VCP prompt → explicit migration removes it; package fallback becomes active;
- old locally modified prompt → update removal detaches/preserves it; resolver sees it and continues using it as the project override.

That means existing custom prompt behavior survives without forcing prompt files to remain VCP-managed forever.

Tests must prove both cases.

---

## 7.4 Doctor changes

Doctor must stop treating project-local prompt copies as mandatory.

Instead it should call the same prompt resolver used by context.

Report examples:

~~~text
PASS Plan prompt: packaged VCP prompt
PASS Review prompt: project override
~~~

Similarly, Doctor should stop requiring scripts/validate-framework.sh inside every consumer.

The source repository's validate-framework script is not a universal application validation command.

Project validation is already represented by accepted verification commands plus Doctor/readiness/gate.

---

## 7.5 Release-check changes

This is a hard dependency.

Current release-check lifecycle smoke runs the copied framework validator inside the temporary consumer.

Once that asset is no longer installed, lifecycle smoke must validate the consumer using public consumer contracts instead.

Recommended replacement:

~~~text
previous CLI init temporary consumer
      ↓
candidate update --dry-run
      ↓
candidate update apply
      ↓
vcp doctor --json
      ↓
vcp update --dry-run / idempotence check
      ↓
inspect expected consumer asset surface
~~~

If a canonical consumer verification/gate fixture is available, it may also run that.

Do not call the source repository's framework validator from the consumer.

The source package itself still runs npm run validate and package/release checks separately.

---

## 7.6 Migration mechanics

When removing previously managed files:

- declare explicit migration removals;
- unmodified managed files may be deleted;
- locally modified files must be detached/preserved according to current update semantics;
- preserve files remain project-owned;
- do not manipulate project task history that was created by the user.

For old framework docs that share the same directory as project docs, removal must be path-specific.

Never remove the entire docs directory.

---

## 7.7 Definition of done

- fresh consumer install no longer receives VCP source roadmap/release/task history;
- fresh consumer install no longer receives source-framework validation scripts;
- context works with no project-local prompts;
- project prompt overrides still work;
- old modified prompts survive upgrade as overrides;
- Doctor is green/accurate without copied framework scripts;
- release-check consumer lifecycle smoke no longer depends on copied validate-framework;
- explicit migration removals prevent disappeared-file conflicts;
- package-level validation still checks the VCP source/package itself.

---

# 8. Workstream C — Composable capabilities instead of one stack identity

## 8.1 Current code involved

Primary:

- lib/stacks.mjs
- lib/stack-provenance.mjs

Consumers:

- lib/template.mjs
- lib/init.mjs
- lib/state.mjs
- lib/update-plan.mjs
- lib/update-report.mjs
- lib/manage.mjs
- lib/doctor.mjs
- tests for stack detection/re-profiling/check commands.

The current one-stack value is not only display metadata; it controls desired file content and lifecycle transitions.

---

## 8.2 Why replacing detectStack directly would be unsafe

If detectStack suddenly returns multiple values, all of these contracts break:

- CLI stack validation;
- applyStackProfileToContent;
- install.stack;
- stackProfileChange;
- Doctor lifecycleStack;
- update desired-builder calls;
- manage track;
- existing JSON tests.

The capability model therefore needs a compatibility bridge.

---

## 8.3 Recommended internal model

Introduce deterministic capability detection separately.

Suggested module:

~~~text
lib/capabilities.mjs
~~~

A capability record should include provenance.

Conceptually:

~~~json
{
  "id": "language.typescript",
  "state": "proven",
  "source": "tsconfig.json",
  "detector": "core.typescript.v1"
}
~~~

Use deterministic states, not probabilistic confidence scores.

Recommended states:

~~~text
proven
configured
proposed
unknown
~~~

Initial automatic composition should use only proven/configured capabilities.

---

## 8.4 Detection must be independent rather than priority-exclusive

Instead of:

~~~text
go found → stop
~~~

run bounded independent detectors.

Example polyglot result:

~~~text
language.go
language.typescript
runtime.node
package-manager.pnpm
testing.playwright
ci.github-actions
~~~

The selected project root still bounds all detectors.

Do not recursively infer sibling package capabilities.

---

## 8.5 Keep current stack as a compatibility summary

During transition keep:

~~~text
install.stack
install.requestedStack
~~~

Do not make old lifecycle code unreadable in one release.

Add an installed capability snapshot/provenance field.

Conceptually:

~~~json
{
  "install": {
    "stack": "typescript",
    "requestedStack": "auto",
    "capabilities": [
      "language.typescript",
      "runtime.node",
      "package-manager.pnpm"
    ],
    "capabilityMode": "auto"
  }
}
~~~

The exact schema can differ; the key separation is:

- current repository detection;
- capabilities currently applied to VCP-managed content;
- user selection/provenance.

Doctor must report these separately just as it currently distinguishes detected stack vs installed stack.

---

## 8.6 Manifest writer audit

Adding fields is not enough.

Audit all manifest writers:

- buildManifest;
- init;
- update apply buildNextManifest;
- migration manifest transforms;
- manage ignore/track;
- rollback/backup restore paths.

Current buildNextManifest spreads migrated install metadata, which is favorable.

Current buildManifest should be changed to accept requestedStack/workflowMode/capability state directly so init no longer appends important lifecycle fields ad hoc.

Tests that manually construct manifests must also be updated or loaders must provide safe defaults.

---

## 8.7 Stack compatibility adapter

Do not delete stacks.mjs immediately.

Refactor it into two layers:

~~~text
detectors
    ↓
capabilities
    ↓
legacy stack summary / compatibility profile
~~~

Existing simple projects should continue to produce the same legacy summary:

~~~text
Node JS → javascript
TS      → typescript
Python  → python
Go      → go
none    → generic
~~~

For polyglot roots, define a conservative compatibility summary, potentially generic/mixed, while the real internal behavior uses capabilities.

Do not choose one language merely because old precedence did.

---

## 8.8 Verification discovery integration

Separate:

1. capability detection;
2. repository command evidence;
3. verification proposals;
4. accepted project verification contract.

For example, detecting Playwright must not automatically create a command.

Prefer:

~~~text
package.json contains test:e2e
+
Node package manager proven
→ concrete E2E command

Playwright dependency exists but no script
→ capability proven
→ verification command unresolved/proposed
~~~

This preserves the current evidence-first principle.

---

## 8.9 AGENTS rendering

Today stack profile content is appended directly to AGENTS.md and command slots are replaced there.

The capability renderer should compose:

- base VCP integration rules;
- applicable capability guidance;
- concrete evidenced command slots.

Avoid duplicate or contradictory guidance when multiple capabilities overlap.

Create a deterministic composition order.

Do not use locale-sensitive sorting.

---

## 8.10 Doctor integration

Add capability reporting while preserving old JSON fields initially.

Conceptual report:

~~~text
Detected capabilities:
  language.typescript
  runtime.node
  package-manager.pnpm

Installed/applied capabilities:
  language.typescript
  runtime.node

Lifecycle change:
  package-manager.pnpm eligible
~~~

Do not call every difference an error.

Differentiate:

- current evidence;
- installed lifecycle state;
- explicit human selection;
- eligible automatic adaptation.

---

## 8.11 Stage 11 React Native impact

Current main contains a detailed React Native Stage 11 design, while runtime stacks.mjs still does not implement react-native.

Do not implement the old single-stack React Native design immediately before capabilities.

That would create:

~~~text
javascript → react-native concrete re-profile
~~~

and then require another redesign into composable capabilities.

Instead, reconcile Stage 11 into the capability architecture.

React Native can become the first real test of a more-specific composed capability:

~~~text
runtime.node
language.typescript
framework.react-native
mobile.react-native-app
~~~

with existing explicit project-root detection constraints preserved.

This avoids throwaway lifecycle work.

---

## 8.12 Definition of done

- JS/TS/Python/Go simple projects retain equivalent behavior;
- polyglot fixture reports multiple capabilities;
- no detector widens selected project-root authority;
- Doctor distinguishes detected vs installed capability state;
- update can propose/apply a safe capability-set change;
- explicit user selection is not silently overridden;
- verification commands remain evidence-backed;
- existing manifests remain readable;
- stack compatibility fields remain stable for the transition release.

---

# 9. Workstream D — Declarative profile/plugin extension

## 9.1 Current code involved

- lib/community-plugins.mjs
- lib/context.mjs
- lib/doctor.mjs
- docs/COMMUNITY-PLUGINS.md
- examples/community-profile-react-native/*
- test/community-plugins.test.mjs
- test/community-plugins-cli.test.mjs

Current plugin schema is intentionally strict.

Known capabilities are only:

~~~text
guidance
verification-proposals
~~~

Manifest validation rejects unknown keys.

Bundle files are text-only JSON/Markdown.

This is a strong foundation.

---

## 9.2 Do not weaken the v1 loader

Do not simply add permissive optional fields to the existing exact-key parser without a version contract.

Prefer a versioned profile schema.

For example:

~~~text
schemaVersion 1
→ current guidance/proposal behavior unchanged

schemaVersion 2
→ adds bounded declarative detection/capability contributions
~~~

Loader dispatch should validate each schema exactly.

Existing digest-pinned v1 plugins must continue to mean exactly what they mean today.

---

## 9.3 New capability must still require explicit project grant

A community plugin must not become authoritative merely because a bundle exists.

If v2 adds detection, introduce an explicit capability/grant such as:

~~~text
capability-detection
~~~

A selected plugin may then contribute deterministic detector declarations.

The plugin still cannot select itself.

---

## 9.4 Suggested declarative detector DSL

Keep it deliberately small.

Possible predicates:

~~~text
fileExists
directoryExists
jsonFieldEquals
packageDependencyExists
exactTextMarker
~~~

Every predicate must:

- be repository-relative;
- obey selected-project-root confinement;
- reject traversal/symlinks consistently;
- use bounded reads;
- be deterministic;
- never execute a shell;
- never access network;
- never run plugin JavaScript.

Create one core evaluator shared by first-party and community definitions where practical.

Suggested module:

~~~text
lib/profile-dsl.mjs
~~~

---

## 9.5 First-party vs community definitions

A useful architecture is:

~~~text
first-party profile definition
            │
            ├── trusted package source
            │
            ▼
      normalized profile

community v2 bundle
            │
            ├── digest + grants + schema validation
            │
            ▼
      normalized profile
~~~

Then one deterministic composition engine consumes normalized profiles.

Trust remains different:

- first-party definitions are part of VCP release;
- community definitions require explicit project selection/digest/grant.

---

## 9.6 Update integration

planUpdate currently validates selected community plugins before accepting an update plan.

Preserve that.

If capabilities affect desired managed content, plugin compatibility/digest must be validated before capability composition.

An invalid selected plugin must block the update rather than silently dropping its capability contribution and rewriting project behavior.

---

## 9.7 Definition of done

- v1 plugins still load unchanged;
- v2 plugin schema is strict;
- executable-style fields remain impossible;
- detector DSL cannot execute code/network;
- capability detection requires explicit selection/grant for community bundles;
- first-party/community profiles normalize into deterministic internal data;
- invalid/tampered/incompatible profile state fails before lifecycle mutation;
- detection and proposal contributions are included in context/reporting without being mistaken for approval.

---

# 10. Workstream E — Project-aware CI integration

## 10.1 Current code involved

- lib/template.mjs
- lib/init.mjs
- lib/state.mjs install.includeGitHub
- lib/update-plan.mjs
- lib/manage.mjs
- lib/doctor.mjs
- .github/workflows/validate.yml
- test/cli.test.mjs
- test/doctor-coverage.test.mjs
- lifecycle migrations.

Current includeGitHub controls issue templates, PR template and the validation workflow as one bundle.

Doctor currently looks only for:

~~~text
.github/workflows/validate.yml
~~~

and reports that as CI validation.

That is not a provider-neutral CI model.

---

## 10.2 Phase E1 — Stop doing the harmful part first

Before generating any new workflow:

1. stop installing VCP's source-repository npm workflow into arbitrary fresh consumers;
2. split CI detection from GitHub issue/PR scaffolding;
3. preserve existing CI;
4. make Doctor CI-aware rather than one-path-aware.

Do not wait for full vcp gate to stop fresh npm-workflow installation.

---

## 10.3 includeGitHub compatibility

Do not immediately remove install.includeGitHub because existing manifests and update/manage code use it.

For the transition release, reinterpret it narrowly as GitHub hygiene/scaffolding:

~~~text
issue templates
PR template
~~~

CI integration becomes a separate decision/state.

A future major version may rename the field.

---

## 10.4 Add CI inspection module

Suggested:

~~~text
lib/ci.mjs
~~~

Initial local evidence can identify:

- GitHub Actions workflows;
- GitLab CI file;
- CircleCI config;
- Azure Pipelines;
- unknown/custom indicators.

Do not claim semantic coverage simply because a CI file exists.

Report:

~~~text
provider detected
configuration paths
VCP gate presence: yes/no/unknown
project verification coverage: unassessed unless deterministically provable
~~~

---

## 10.5 Doctor changes

Replace hardcoded validate.yml check with the CI inspector.

Examples:

~~~text
PASS CI: GitHub Actions detected, 3 workflow files
WARN VCP gate: not configured
~~~

or:

~~~text
WARN CI: no known CI configuration detected
~~~

Unknown custom CI is not the same as broken CI.

---

## 10.6 Lifecycle migration for old VCP workflow

If .github/workflows/validate.yml is removed from desired consumer assets, declare it explicitly in the next migration.

Behavior then follows existing lifecycle rules:

- unmodified old VCP workflow may be deleted;
- locally modified workflow is detached/preserved;
- no unrelated workflow is touched.

The update dry-run makes this visible.

Document the removal clearly because an existing repository may currently depend on that workflow.

---

## 10.7 Phase E2 — Generate CI only after vcp gate exists

Once vcp gate exists, VCP can optionally generate a provider-specific thin workflow such as:

~~~text
checkout
setup runtime needed for VCP CLI
install/run VCP
vcp gate ...
~~~

The workflow should not duplicate every application test command if vcp gate already executes/validates the project-owned contract.

This reduces drift.

Do not overwrite existing CI.

Add a separate VCP workflow only when explicitly requested or when smart init has enough evidence and the user selected automatic CI integration.

---

## 10.8 Definition of done

- fresh Python/Go/unsupported project never receives npm-specific VCP CI;
- existing workflows are untouched by init;
- Doctor detects CI through a provider-neutral inspector;
- includeGitHub no longer implies npm CI;
- old managed validate.yml has a deliberate migration path;
- generated future CI delegates to deterministic VCP gate rather than duplicating project logic.

---

# 11. Workstream F — Auto and Manual workflow modes

## 11.1 Current code involved

There is currently no persisted workflowMode implementation.

Behavior is mostly defined by:

- AGENTS.md section 15;
- lib/adapters.mjs;
- prompts;
- Quickstart/Operating Model.

Current AGENTS.md is already strongly agent-first and says feature/change requests should flow through task/readiness/context/verify/review.

Therefore the current behavior is semantically closer to Auto than Manual, but it is instruction-driven rather than enforced.

---

## 11.2 Recommended state location

For the initial mode implementation, store workflowMode in manifest install metadata.

Reasons:

- mode is an operational VCP setting;
- update apply already preserves unknown install fields through spread;
- it belongs to the selected project lifecycle;
- no new user-edited config parser is required immediately.

Example:

~~~json
{
  "install": {
    "agent": "all",
    "workflowMode": "auto"
  }
}
~~~

Update buildManifest so it owns this field explicitly.

Do not append it ad hoc after manifest construction.

---

## 11.3 Backward compatibility

For manifests without workflowMode, treat current historical behavior as Auto for compatibility, because existing managed AGENTS.md already describes agent-first routing.

However:

- merely interpreting old state as Auto must not instantly impose new CI merge enforcement;
- mechanical gate enforcement is a separate opt-in/integration step;
- update dry-run must show any changed managed instruction content.

Manual mode should be an explicit user choice.

---

## 11.4 CLI design

Do not overload --mode.

Use:

~~~text
vcp init . --workflow-mode auto
vcp init . --workflow-mode manual
~~~

and add a post-install command such as:

~~~text
vcp workflow-mode auto
vcp workflow-mode manual
~~~

Changing mode must not require re-running init.

Mode change should:

1. acquire lifecycle lock;
2. update persisted mode;
3. update only VCP-owned instruction sections/files;
4. preserve project-owned instruction text;
5. remain idempotent.

---

## 11.5 Adapter rendering

lib/adapters.mjs needs mode-aware content.

Auto section:

~~~text
Route meaningful engineering changes through the appropriate VCP workflow.
Use the lightest allowed workflow level.
Do not bypass readiness/verification/review requirements.
~~~

Manual section:

~~~text
VCP is available.
Use it when explicitly invoked by the developer/Skill.
Ordinary requests do not automatically enter full VCP workflow.
~~~

Keep adapters thin.

Do not paste the whole operating model into CLAUDE.md/Copilot files.

---

## 11.6 Doctor visibility

Doctor should report:

~~~text
Workflow mode: auto
~~~

or manual.

If manifest missing/corrupt, do not infer an authoritative project mode from chat or current agent.

---

## 11.7 Definition of done

- mode persists;
- mode can change without reinstall;
- existing managed projects have deterministic backward behavior;
- mode-specific adapter changes preserve user text;
- Doctor reports mode;
- Auto and Manual behavioral tests exist;
- context --mode semantics remain completely separate.

---


# 12. Workstream F1 — Workflow levels require changes below the prompt layer

## 12.1 Current limitation

Current renderTaskPack() creates a full material-work artifact with sections for Source of Truth, acceptance criteria, scope, affected boundaries, domain invariants, security/privacy, failure modes, observability, unit/integration/E2E/security tests, rollout/migration/recovery, implementation plan, verification, independent review, and finalization.

Current runTaskReadiness(... stage=implement) turns many of those into blocking implementation requirements.

That is strong for material work and too heavy for many everyday bug fixes/refactors.

A system with only L0 trivial or L2 full Task Pack has a product-dangerous gap.

## 12.2 Initial level architecture

### L0 — no durable Task Pack

For tightly bounded mechanically eligible changes. Gate uses actual changed surface plus relevant checks.

### L1 — compact bounded engineering record

Add a compact task/change artifact rather than the full Task Pack.

Minimum enforceable content should be driven by what a fresh agent/reviewer actually needs:

~~~text
Status / Slug / Level
Outcome or defect
Affected scope
Acceptance evidence
Verification
Risk/escalation flags
Completion/evidence summary
~~~

Do not create empty security/observability/rollout sections merely to say "n/a."

Possible implementation approaches:

1. one Task Pack parser with level-specific required sections; or
2. a compact Task Note format normalized into the same internal task-state model.

Prefer the approach that minimizes parser duplication. Do not invent a separate task database.

### L2 — current full material-work Task Pack

Preserve existing strong readiness/verification/review path.

### L3 — L2 plus relevant high-risk extensions

Add only applicable high-risk context/gates.

## 12.3 Classification architecture

Use three layers:

~~~text
agent/Skill semantic proposal
        ↓
Core deterministic minimum from inspectable facts
        ↓
effective level
~~~

Before implementation, inspect likely affected surface. During/finally after implementation, recompute minimum level from the actual Git diff.

Core may always promote. A too-light selected lane must fail at gate with actionable remediation.

Avoid using model confidence as Core authority.

## 12.4 Code impact

#
## lib/task.mjs

Needs:

- workflow-level metadata;
- compact L1 rendering;
- current full template retained for L2;
- L3-compatible extension points;
- shared parser compatibility.

Do not add VCP framework-development Core-ROI questions to the generic consumer Task Pack.

Do not remove durable review/finalization evidence from L2/L3.

---

## lib/git-review.mjs

Mostly reusable.

Gate may use changed-file enumeration for L0 classification and exact-head review linkage.

Avoid duplicating Git parsing.

---



## lib/prompt-eval.mjs

Current strengths:

- v1 behavior records already track question keys/classes;
- discover-before-ask already fails when discoverable facts are asked;
- human-decision/proposal/restartability contracts already exist.

Future needs when Auto/Skills land:

- interaction-round/question-batch observations;
- redundant-confirmation observations;
- Skill/router behavior coverage;
- mutations proving the new properties are non-vacuous.

Avoid:

- replacing the existing evaluator;
- changing schema before the new observable contract is stable;
- full chat transcripts;
- model-as-judge scoring when deterministic structured assertions suffice.

---

## lib/release-check.mjs

Must change when consumer framework assets are removed.

Replace copied consumer validator execution with consumer-facing VCP checks.

Later include conformance of new Skills/package surfaces as release policy requires.

---

## scripts/validate-framework.mjs

Remain VCP source/package validation.

Update required source/package files for:

- new core modules;
- Skills;
- capability definitions;
- new docs/contracts.

Do not copy it into arbitrary consumer projects.

---


## Packaged Skills / Skill source

New surface.

Needs:

- thin cross-agent routing Skills;
- progressive reference loading;
- canonical links into VCP Core rather than duplicated policy;
- package/release inclusion;
- prompt-eval behavior coverage.

Risks:

- Skills growing into a second copy of VCP;
- all references loading eagerly;
- Auto and Manual developing separate workflows.

---

## .github/release-policy.json

Update when new runtime/package assets become required.

Do not add every implementation doc automatically; add files required for released runtime behavior.

---


# 13. Workstream G — Cross-agent Skills as UX, not VCP authority

## 13.1 Current code involved

There is currently no Skills implementation in the repository.

Closest existing surfaces are:

- lib/adapters.mjs;
- prompts/*;
- docs/OPERATING-MODEL.md;
- lib/prompt-eval.mjs;
- evaluations/prompt-behavior/*.

This is good because Skills can be added without migrating existing durable state.

---

## 13.2 What should move into Skills

Good Skill responsibilities:

- discovery/grill conversation;
- route request to proper VCP command sequence;
- explain readiness failures;
- planning interaction;
- implementation interaction;
- review interaction;
- retro analysis;
- PR prose;
- friendly summaries.

Bad Skill responsibilities:

- deciding that failed tests passed;
- becoming the only store of approved decisions;
- replacing manifest/update state;
- implementing its own lifecycle safety;
- duplicating every VCP rule.

---

## 13.3 Reuse prompt-eval

The existing provider-independent prompt evaluation system already tests properties that matter to Skills:

- discover-before-ask;
- human decision boundaries;
- proposal is not approval;
- negative decisions preserved;
- bounded vertical planning;
- blockers/readiness respected;
- verification reporting accuracy;
- follow-ups recorded;
- restartability.

That is an unusually useful foundation.

Skills should produce the same normalized observable behavior expected by this evaluator where applicable.

Add skill-specific scenarios only for behavior not already covered.

Do not build a second Skill-specific model grader.

---

## 13.4 Canonical Skill packaging

Add a package-owned Skills area rather than copying Skills into each consumer repo by default.

Conceptually:

~~~text
skills/
  vcp/
    SKILL.md
  vcp-discovery/
    SKILL.md
  vcp-review/
    SKILL.md
  vcp-retro/
    SKILL.md
~~~

The exact packaging should follow the cross-agent skill installer chosen for distribution, but the source of behavioral truth should still point back to VCP Core and canonical prompts.

Update:

- package.json files surface;
- scripts/validate-framework.mjs source checks;
- release policy required package files where appropriate;
- prompt-eval scenarios/provenance if Skill content is evaluated.

---

## 13.5 Avoid policy duplication

A Skill should not contain a second 800-line version of AGENTS.md.

Prefer:

~~~text
inspect VCP state
      ↓
run/read canonical VCP context
      ↓
call deterministic VCP commands
      ↓
interpret results for developer
~~~

This keeps future changes in one authority.

---

## 13.6 Auto/Manual relationship

Manual:

~~~text
user invokes /vcp
→ Skill routes explicitly
~~~

Auto:

~~~text
normal request
→ agent adapter says use VCP when level/policy requires it
→ same canonical Skill/router logic may be used internally
~~~

Do not create two different workflows for Auto vs Manual.

Only the trigger differs.

---

## 13.7 Definition of done

- Skill source exists and is package/release tested;
- Skills remain thin;
- Skill behavior can be evaluated through prompt-eval-style observable records;
- repository truth is unchanged when the user switches coding agents;
- Manual mode can use VCP without CLI memorization;
- Auto mode can reuse the same router behavior.

---

# 14. Workstream H — Mechanical vcp gate

## 14.1 Existing components to reuse

Do not create a parallel validation framework.

Reuse:

### readiness

lib/readiness.mjs already proves structural plan/implementation readiness.

### verification

lib/verify.mjs already executes the task's approved commands.

### Git provenance

inspectVerificationScope already records Git HEAD and dirty state safely.

### review snapshot

lib/git-review.mjs resolves exact base/head commits and changed surface.

### Task Pack

lib/task.mjs already defines review/finalization semantics.

The missing feature is an aggregator/enforcer.

---

## 14.2 Current gaps gate must close

The current code does not mechanically prove:

- Status is Done;
- acceptance criteria are all checked;
- finalization checklist is complete;
- independent-review table has no unresolved must-fix item;
- verification evidence is current;
- final HEAD still matches accepted evidence;
- workflow level requirements were satisfied.

---

## 14.3 Add a canonical task-state parser

Do not scatter Markdown regexes across gate/readiness/context.

Create a shared parser for the canonical Task Pack structure.

Suggested module:

~~~text
lib/task-state.mjs
~~~

It should parse, at minimum:

- top-level status;
- slug;
- workflow level if added;
- acceptance criteria and checked state;
- independent review rows;
- dispositions;
- finalization checklist;
- completion report presence;
- verification command set.

Readiness should progressively adopt shared parsing so gate and readiness do not disagree.

---

## 14.4 Structured task metadata may now be justified

VCP previously avoided machine-readable task graph/state because prose contracts were enough.

A deterministic completion gate is a legitimate enforcement reason to add a small amount of structured metadata.

Prefer minimal metadata, not a full task database.

Possible top section:

~~~text
Status: Done
Slug: accept-invite
Workflow-Level: L2
~~~

Keep human-readable Markdown as the primary artifact.

Do not introduce hidden external state that makes the Task Pack misleading.

---

## 14.5 Verification evidence freshness

Saved evidence cannot simply be trusted forever.

Gate must compare:

~~~text
evidence.task
evidence.mode == run
evidence.success == true
evidence.readiness.fail == 0
evidence.revision.headSha
current HEAD
current dirty state
~~~

Important nuance:

verification provenance is captured before commands run.

Therefore final gate should re-inspect Git after verification/evidence loading.

For strongest behavior, gate run mode can execute verification itself and then inspect final repository state before reporting success.

---

## 14.6 Evidence output dirty-state issue

.vcp/.gitignore currently ignores update runtime directories/files, but not .vcp/evidence.

Therefore writing evidence inside the project may itself make a previously clean Git worktree dirty.

Gate design must explicitly handle this rather than comparing dirty=false naively.

Possible approaches:

### Option A — gate executes verification and emits final report to stdout/outside tracked state

Best for CI exact-head proof.

### Option B — permit only the known evidence-output path as post-verification dirty state

More complex and easier to get wrong.

### Option C — change evidence retention policy

Potentially ignore ephemeral evidence while allowing explicitly versioned evidence elsewhere.

Do not choose this casually because prompt-eval/restartability currently treats .vcp/evidence paths as durable artifacts.

Recommended first implementation:

> vcp gate --run should execute verification in-process and perform final Git inspection before optional report persistence. CI should rely on the gate result, not an old JSON file.

Saved verify evidence remains useful for handoff/audit but is not by itself final merge authorization.

---

## 14.7 Proposed command shape

Conceptually:

~~~text
vcp gate <task>
vcp gate <task> --run
vcp gate <task> --base main
vcp gate <task> --json
~~~

Preview can explain missing requirements without executing commands.

Run performs required executable verification.

For L0, a separate path may accept changed-surface/base information without a Task Pack.

---

## 14.8 Gate result must be explicit

Machine-readable report should distinguish:

~~~text
pass
fail
blocked
not-applicable
~~~

and enumerate why.

Do not compress everything into a magic readiness score.

---

## 14.9 Definition of done

- gate uses readiness rather than reimplementing it;
- gate uses verification machinery rather than shelling out to duplicated commands;
- current HEAD is checked after executable work;
- stale verification cannot pass;
- unresolved must-fix review evidence cannot pass;
- incomplete finalization cannot pass L2/L3;
- L0 cannot be used for protected changed surfaces;
- JSON/human output have stable contracts;
- gate works locally without GitHub.

---

# 15. Workstream E2 dependency — CI should call gate, not recreate it

Once gate exists, generated CI becomes thin.

Preferred:

~~~text
CI
 ↓
install/use VCP
 ↓
vcp gate <task or policy> --run
 ↓
exit code
~~~

Do not separately maintain:

- one set of verification commands in Task Pack;
- another set in VCP;
- another handwritten set in generated YAML.

That would reintroduce drift.

---

# 16. Workstream I — Compatibility/conformance matrix integrated with existing tests

## 16.1 Current strengths

The repository already contains unusually strong focused test surfaces:

- update planning;
- rollback;
- update transaction/concurrency;
- selected project root;
- workspace source truth;
- verification scope/provenance;
- Git-aware review;
- security profiles;
- community plugin trust;
- prompt evaluation;
- architecture fitness;
- release portability/release-check.

Do not replace these with a single giant E2E suite.

Add an adoption/conformance layer on top.

---

## 16.2 New fixtures needed

Add fixtures for:

### existing agent configuration

- custom AGENTS.md;
- custom CLAUDE.md;
- custom Copilot instructions;
- all together.

### existing CI

- GitHub Actions with unrelated workflow name;
- several workflows;
- GitLab/custom CI marker;
- no CI.

### ecosystem

- unsupported Rust;
- unsupported Java;
- polyglot Go + TypeScript;
- existing Python;
- existing Node;
- custom verification command.

### repository maturity

- empty;
- established;
- already VCP-managed;
- nested selected project;
- dirty Git worktree.

---

## 16.3 Public CLI testing matters

Many current tests call initProject directly, which is useful for unit coverage.

Adaptive adoption must also have public CLI tests because important behavior lives in:

- option parsing;
- help text;
- command-specific flag validation;
- interactive/non-interactive defaults.

For every important init behavior, include at least one real bin/vibe-coding-production.mjs test.

---

## 16.4 Golden negative fixtures

Required failure cases:

- malformed VCP section markers;
- duplicate marker blocks;
- conflicting agent-file integration;
- selected plugin with bad digest;
- capability profile with invalid detector;
- symlinked evidence/config;
- unsupported destructive verification proposal;
- stale verification at old HEAD;
- L0 requested for source/security/build changes.

Each failure must prove no unsafe mutation.

---

## 16.5 Definition of done

The matrix is complete when release gates prove properties, not merely framework names:

- no unrelated deletion;
- no silent agent instruction overwrite;
- no silent CI overwrite;
- no command invention;
- selected-root isolation;
- safe unsupported fallback;
- capability provenance;
- init plan/apply consistency;
- update after adoption remains safe;
- gate rejects stale/bypassed work;
- rollback/recovery remains valid.

---

# 17. Workstream J — Reduce framework tax using the real package boundaries

## 17.1 Current situation

VCP now contains substantial deterministic infrastructure.

That is not inherently bad.

The problem would be continuing to add infrastructure for behavior that a portable Skill can do just as well.

The code review reinforces a practical split.

---

## 17.2 Strong Core candidates already justified

Keep in VCP Core:

- state.mjs lifecycle persistence;
- update plan/apply;
- merge;
- migrations;
- readiness;
- verification;
- Git provenance;
- Context Pack construction;
- security profile resolution;
- plugin trust;
- architecture fitness;
- release-check;
- future gate.

These provide deterministic value.

---

## 17.3 Skill/UX candidates

Prefer Skills for:

- discovery conversation;
- grill interaction;
- explaining options;
- choosing which deterministic command to call;
- plan presentation;
- retro discussion;
- PR drafting;
- conversational handoff.

Do not add a CLI subcommand merely because a conversational step has a name.

A command is justified when there is deterministic state/action to perform.

---

## 17.4 Asset reduction is part of reducing framework tax

Moving canonical prompts/reference docs back into the package rather than copying them to every consumer improves:

- install surface;
- update complexity;
- conflict rate;
- repository readability;
- context discipline.

This is not just cosmetic cleanup.

---

# 18. File-by-file change map

This section summarizes likely ownership of implementation work.

## lib/cli.mjs

Needs:

- init-specific force removal;
- workflow-mode option/command;
- capability-aware reporting/options later;
- vcp gate command;
- updated help text;
- no collision with context --mode.

Risks:

- global parser currently shares flags across commands;
- many CLI help tests pin exact surfaces.

---


## lib/repository-inspection.mjs / lib/init-plan.mjs

New Stage 12 surfaces.

Responsibilities:

- read-only NEW / EXISTING / MANAGED classification;
- minimal adoption-surface selection;
- deterministic action planning;
- public content-free plan reporting;
- no persistent plan state.

The planner becomes the single decision source for dry-run and Stage 13 fresh apply.

---


## lib/init.mjs

Stage 12:

- becomes an orchestration wrapper around repository inspection + planning;
- NEW may keep the current safe greenfield writer temporarily;
- EXISTING dry-run returns the plan;
- EXISTING non-dry-run blocks until Stage 13 apply exists;
- MANAGED returns lifecycle redirect/status;
- init-specific `--force` is removed.

Stage 13:

- calls the transactional init-apply path;
- never blindly applies an earlier preview.

---


## lib/template.mjs

Current responsibilities are too mixed:

- package asset walking;
- consumer asset choice;
- ownership policy;
- adapters;
- stack rendering.

Stage 12 needs an adoption-aware surface so brownfield planning does not blindly use all current CORE/GITHUB roots.

Possible implementation:

- add explicit asset metadata such as brownfield eligibility / framework-reference classification; or
- provide a dedicated brownfield desired-surface builder backed by the same canonical asset definitions.

Avoid duplicating template content or creating two unrelated ownership systems.

Phase 2 later unifies greenfield/managed consumer assets and performs explicit removals/migrations.

---

## AGENTS.md / generated standing instructions

Current root file is approximately 13 KB / 253 lines and includes many phase-specific engineering rules.

Needs:

- audit every rule as always-on vs task/phase-specific;
- keep only routing, authority, human-decision boundary, truthfulness, verification configuration, and genuinely universal invariants always-on;
- move detailed planning/security/testing/review guidance behind Skills/prompts/Context Packs;
- preserve project-owned surrounding content under section ownership for brownfield adoption;
- measure instruction footprint and agent behavior before/after.

Do not optimize for an arbitrary byte target; optimize for less standing context without behavioral regression.

---


## lib/adapters.mjs

Needs:

- mode-aware thin routing content;
- integration block generation;
- additive existing-file semantics;
- removal of the current broad instruction to read product + architecture + security + testing + delivery documents before every implementation;
- routing to the relevant VCP Skill/Context instead;
- user-visible decisions/evidence while hiding command choreography.

Current risk:

The adapters are thin in file size, but their wording defeats progressive disclosure by encouraging broad document loading.

---


## lib/managed-sections.mjs

New Stage 12 surface.

Responsibilities:

- marker validation;
- section extraction;
- deterministic composition/reconstruction;
- section-local merge inputs;
- no surrounding-file normalization.

Keep the implementation narrow: one explicitly named VCP section per managed integration file until dogfood proves a need for a generic multi-segment framework.

---


## lib/state.mjs

Needs:

- manifest schema v2 support;
- migration/normalization of v1 managed entries to `ownership.kind=file`;
- per-entry ownership validation;
- section-baseline support;
- generalized lifecycle backup metadata for absent prior manifest/baselines;
- rollback that removes lifecycle state that did not exist before initial adoption;
- lifecycle transaction reuse for Smart Init.

Do not leave section ownership as an unversioned optional v1 field.

Do not weaken current path/symlink protections.

Keep existing on-disk lock/transaction locations unless a separate migration is justified.

---

## lib/update-plan.mjs

Needs:

- section ownership action planning;
- capability-set lifecycle comparison;
- new consumer asset surface;
- migration-aware removals;
- new desired-builder inputs.

Preserve action transparency.

---


## lib/update-apply.mjs

Useful precedent:

Current `applyUpdate()` acquires the lifecycle lock and only then calls `planUpdate()`.

Smart Init Apply should preserve this ordering.

Needs:

- reusable transaction/apply primitives for initial adoption;
- section-replacement actions;
- first-install backup semantics where no prior manifest exists;
- rollback-safe state cleanup;
- final manifest schema/ownership preservation.

Do not create a parallel weaker transaction engine.

---

## lib/update-apply-helpers.mjs

Needs:

- ownership-aware baseline generation;
- section baseline content rather than whole-file content for section-owned entries;
- ownership metadata preserved in final manifest entries;
- post-apply staging/verification compatibility with reconstructed whole-file output.

---

## lib/manage.mjs

Needs:

- understand new desired-builder/capability inputs;
- clear semantics for ignore/track of section-owned paths;
- not reconstruct state only from legacy stack forever.

---

## lib/migrations.mjs

Needs next-release migration for:

- asset removals;
- possibly ownership transition;
- new install metadata defaults if required.

Do not rewrite released historical migrations.

---

## lib/stacks.mjs

Transition from primary model to compatibility layer.

Extract:

- raw detectors;
- command evidence helpers that remain useful.

Eventually compose through capabilities.

---

## lib/stack-provenance.mjs

Needs capability-era equivalent.

Keep legacy stack provenance during transition.

Do not lose explicit-vs-auto historical intent.

---

## lib/doctor.mjs

Needs several changes:

- capability reporting;
- workflow mode;
- provider-neutral CI inspection;
- package prompt resolver;
- removal of local framework validator requirement;
- new gate status where appropriate.

Preserve explicit coverage boundaries.

---


## lib/context.mjs

Needs:

- package prompt fallback;
- project override identity;
- workflow-level awareness for L1/L2/L3 where contexts apply;
- compact inclusion-reason/type metadata;
- later Skill/context interoperability;
- no hidden parent fallback;
- negative tests proving irrelevant content is absent.

Current strengths to preserve:

- phase modes;
- explicit source references;
- selected-root confinement;
- hard byte budget;
- security profiles only in security mode;
- bounded Git review.

Important refactor:

Separate plugin/profile validation from rendered transport so selected but irrelevant plugin metadata/proposals do not automatically enter every pack.

---

## lib/community-plugins.mjs

Needs schema-versioned v2 support rather than permissive v1 mutation.

Keep all current trust/resource/path constraints.

---

## lib/verify.mjs

Mostly reuse.

Potential changes:

- expose reusable execution/provenance helpers to gate;
- avoid duplicating command execution;
- possibly capture/reinspect post-run Git state for gate integration.

Do not change ordinary verify semantics merely to satisfy final gate.

---


## lib/readiness.mjs

Keep current plan/implement readiness as the L2 baseline.

Needs:

- shared canonical parser;
- compact L1 readiness contract;
- L3 extensions driven by applicable risk;
- no L0 Task Pack requirement;
- diagnostics that tell an agent when work must be promoted to a higher level.

Do not weaken current L2 correctness merely to create a lighter lane.

---


## lib/task.mjs

Needs:

- workflow-level metadata;
- compact L1 rendering;
- current full template retained for L2;
- L3-compatible extension points;
- shared parser compatibility.

Do not add VCP framework-development Core-ROI questions to the generic consumer Task Pack.

Do not remove durable review/finalization evidence from L2/L3.

---

## lib/git-review.mjs

Mostly reusable.

Gate may use changed-file enumeration for L0 classification and exact-head review linkage.

Avoid duplicating Git parsing.

---



## lib/prompt-eval.mjs

Current strengths:

- v1 behavior records already track question keys/classes;
- discover-before-ask already fails when discoverable facts are asked;
- human-decision/proposal/restartability contracts already exist.

Future needs when Auto/Skills land:

- interaction-round/question-batch observations;
- redundant-confirmation observations;
- Skill/router behavior coverage;
- mutations proving the new properties are non-vacuous.

Avoid:

- replacing the existing evaluator;
- changing schema before the new observable contract is stable;
- full chat transcripts;
- model-as-judge scoring when deterministic structured assertions suffice.

---

## lib/release-check.mjs

Must change when consumer framework assets are removed.

Replace copied consumer validator execution with consumer-facing VCP checks.

Later include conformance of new Skills/package surfaces as release policy requires.

---

## scripts/validate-framework.mjs

Remain VCP source/package validation.

Update required source/package files for:

- new core modules;
- Skills;
- capability definitions;
- new docs/contracts.

Do not copy it into arbitrary consumer projects.

---


## Packaged Skills / Skill source

New surface.

Needs:

- thin cross-agent routing Skills;
- progressive reference loading;
- canonical links into VCP Core rather than duplicated policy;
- package/release inclusion;
- prompt-eval behavior coverage.

Risks:

- Skills growing into a second copy of VCP;
- all references loading eagerly;
- Auto and Manual developing separate workflows.

---

## .github/release-policy.json

Update when new runtime/package assets become required.

Do not add every implementation doc automatically; add files required for released runtime behavior.

---



# 19. Revised implementation order with product validation gates

The Adaptive VCP documents are umbrella design. The next numbered stages should be narrower than the full phases.

## Precondition — complete Stage 11

Before Stage 12 product-code work:

1. finish Stage 11 exact-head gate/review/finalization;
2. merge;
3. re-baseline Roadmap/README/current source state;
4. create Stage 12 Task Pack from current main.

---

## Stage 12 — Safe Adoption Planning

Stage 12 combines the minimum enabling refactors required to make a trustworthy **read-only** brownfield adoption plan.

Implement:

1. centralized install/manifest metadata construction;
2. canonical package/local prompt resolver;
3. schema-v2 ownership foundation: file vs section;
4. managed-section parsing/composition/baseline primitives;
5. repository inspection: NEW / EXISTING / MANAGED;
6. minimal brownfield adoption-surface selection;
7. deterministic init action planner;
8. public `vcp init --dry-run [--json]`;
9. init-specific destructive force removal;
10. plan/CLI/negative tests.

Do **not** mutate EXISTING repositories through Smart Init in Stage 12.

Stage-12 runtime behavior:

```text
NEW
→ greenfield apply remains supported

EXISTING
→ preview supported
→ brownfield mutation blocked

MANAGED
→ update/status redirect
```

**Exit criterion:** the same repository snapshot always produces the same bounded action plan, no project/durable VCP state is changed by preview, and unsafe/ambiguous composition is visible as CONFLICT.

---

## Stage 13 — Smart Init Apply

Implement mutation using the Stage 12 planner.

Sequence:

```text
acquire lifecycle lock
→ inspect current state again
→ recompute fresh plan
→ block conflicts
→ create complete recovery point
→ stage/apply
→ write section-aware baselines + manifest
→ verify
→ clear transaction
```

Additional required work:

- generalize backup metadata for an unmanaged prior state;
- rollback deletes newly-created manifest/baselines when those did not previously exist;
- full-file backups protect composed project files;
- apply never trusts a stale Stage-12 preview object;
- subsequent `vcp update` works;
- repeated init reports MANAGED and does not rewrite;
- idempotence and failure rollback are proven.

---

### Checkpoint A — adoption safety and usability

Run the Stage 12/13 flow on varied brownfield fixtures and selected real repositories.

Measure:

- deterministic preview;
- preview/apply agreement on unchanged state;
- safe re-plan when state changes between preview/apply;
- section preservation;
- true rollback to unmanaged state;
- CI/project-doc preservation;
- repository noise;
- avoidable setup questions;
- time/steps to first productive VCP work.

Do not continue into broad asset/capability/profile machinery if this checkpoint fails.

---

## Phase 2 — Consumer asset + standing-context reduction

After Checkpoint A:

1. unify the explicit consumer asset catalog across greenfield and managed lifecycle paths;
2. migrate/remove old framework/reference assets explicitly;
3. shrink full generated AGENTS standing context;
4. update Doctor prompt/reference behavior;
5. remove source-framework validator from consumers;
6. rewrite release-check consumer smoke;
7. preserve local prompt overrides.

## Phase 3 — CI safety, detection only

1. stop fresh hardcoded npm workflow installation;
2. provider-neutral CI inspector;
3. Doctor CI reporting;
4. migration of old managed validate.yml.

## Phase 4 — Capability foundation

1. deterministic capability records;
2. independent detectors;
3. legacy stack compatibility adapter;
4. capability-aware rendering/discovery;
5. applied-capability provenance;
6. Doctor/update/manage integration;
7. polyglot tests.

### Checkpoint B — adaptation + context cost

Measure correctness and context-footprint changes. Do not proceed to broad profile machinery if detection creates false certainty or context bloat.

## Phase 5 — Declarative profiles

1. normalized profile model;
2. strict v2 plugin schema;
3. bounded detector DSL;
4. first-party definitions;
5. community grants;
6. React Native Stage 11 reframed onto capabilities;
7. separate plugin validation from context transport.

## Phase 6 — Workflow mode + minimal router UX

1. persist workflowMode;
2. --workflow-mode and post-install change;
3. mode-aware VCP standing sections/adapters;
4. ship/prototype one thin primary VCP router Skill;
5. preserve Auto/Manual shared workflow logic;
6. extend prompt-eval only as needed for router/human-attention behavior.

## Phase 7 — Workflow levels + gate

1. shared task-state parser;
2. L0 changed-surface contract;
3. compact L1 task/readiness contract;
4. retain L2 current Task Pack;
5. L3 relevant high-risk additions;
6. provisional classifier after inspection;
7. gate preview/run using verification engine;
8. final-diff minimum-level reclassification;
9. post-run Git freshness check.

### Checkpoint C — ceremony vs prevented failure

Dogfood L0/L1/L2/L3. If ordinary small fixes keep landing in full L2 or gate/classification produces frequent false positives, simplify before CI enforcement.

## Phase 8 — CI gate integration

1. optional thin provider-specific gate workflow;
2. detect equivalent existing integration;
3. keep application verification authority in VCP/task state.

## Phase 9 — Skill UX expansion

After the primary router/Core contracts are stable:

1. discovery/grill Skill;
2. review/retro UX where justified;
3. progressive Skill references;
4. cross-agent packaging;
5. prompt-eval coverage.

### Checkpoint D — invisible UX

Users should understand decisions/evidence without knowing Core commands.

## Phase 10 — Conformance/release hardening

Run full compatibility/public CLI/package smoke and preserve bounded checkpoint evidence.

### Checkpoint E — model/tool capability audit

Before major release, explicitly ask what VCP can remove because modern agents/platforms now do it well natively. A valid result is deprecation/deletion rather than new features.

# 20. High-risk implementation mistakes to avoid

## 20.1 "Append to AGENTS and call it solved"

Unsafe across later updates unless VCP owns only the inserted section.

## 20.2 "Remove prompts from templates first"

Breaks context creation because current context reads project-local prompt paths.

Add package fallback first.

## 20.3 "Delete --force parser"

Breaks unrelated command overwrite controls.

Remove init use specifically.

## 20.4 "Rename --mode for workflow mode"

Breaks context CLI semantics.

Use workflow-mode.

## 20.5 "Return an array from detectStack"

Breaks Doctor, stack provenance, update planning, manage, templates and tests.

Add capability model alongside compatibility layer.

## 20.6 "Let plugins run detection scripts"

Undermines the strongest existing plugin security property.

Use a bounded declarative DSL.

## 20.7 "Generate smart CI before gate exists"

Creates another duplicated workflow definition.

First inspect/preserve CI; generate thin gate workflow later.

## 20.8 "Gate trusts old evidence JSON"

Evidence may be from an old HEAD or from pre-command Git state.

Reinspect current state.

## 20.9 "Auto mode means full Task Pack for typo fixes"

Makes the product unusable.

Mechanically define a safe trivial lane.

## 20.10 "Implement Stage 11 single-stack React Native first"

Likely produces near-term lifecycle code that the capability model immediately replaces.

Reconcile Stage 11 with capabilities first.

---


## 20.11 "Passing tests means the product is validated"

False.

Tests prove implementation contracts.

They do not prove:

- invisible UX;
- low human interruption;
- useful workflow classification;
- acceptable false-positive rate;
- worthwhile complexity.

Use the product validation checkpoints.

## 20.12 "Load all helpful context just in case"

This defeats Context Pack discipline and progressive disclosure.

Every source must earn inclusion for the current workflow.

## 20.13 "Every useful idea belongs in Core"

This recreates framework bloat.

Apply the Complexity ROI contract first.


## 20.14 "Keep the full AGENTS because more guidance is safer"

Current AGENTS is valuable but large and phase-heavy. Standing context should route and enforce universal invariants; phase detail belongs behind progressive disclosure.

## 20.15 "L0 plus full L2 is enough"

This leaves ordinary bug fixes/refactors with no right-sized lane. Implement a compact L1 contract and prove it remains restartable.

## 20.16 "Auto means prompt interception is guaranteed"

VCP has no embedded LLM and agent platforms differ. Use Skill/adapter routing plus deterministic gate enforcement; hooks are optional accelerators.


## 20.17 "Treat the dry-run plan as a saved executable plan"

A preview can become stale.

Stage 13 must re-plan under the lifecycle lock. Do not add saved-plan semantics without explicit repository/file/version preconditions.

## 20.18 "Put section ownership into manifest schema v1"

Older CLIs can accept schema v1 and ignore unknown per-entry semantics.

Section ownership changes baseline meaning, so it requires a new schema version that old CLIs reject.

## 20.19 "Use the full current template roots as the brownfield plan"

That would propose framework docs, prompts, source validators, and npm-specific CI into established projects.

Brownfield adoption needs a minimal surface.

## 20.20 "Reuse update backup without modeling absent prior lifecycle state"

Current restore semantics do not remove a manifest/baselines that did not exist before the transaction.

Initial-adoption rollback must restore **absence** as well as content.

# 21. Acceptance evidence for the overall redesign

The adaptive redesign should not be considered complete because all new unit tests are green.

It is complete when the following real scenarios pass.

## Scenario A — mature Claude project

Initial state:

~~~text
custom CLAUDE.md
custom AGENTS.md
existing GitHub Actions
TypeScript + custom test script
no VCP
~~~

After vcp init:

- all user instruction text preserved;
- exactly one VCP integration section added;
- existing CI untouched;
- capabilities discovered from evidence;
- VCP lifecycle state created;
- next VCP update changes only VCP-owned section/content.

---

## Scenario B — unsupported Rust project

After init:

- no invented cargo command unless accepted/profile-backed policy provides it appropriately;
- project is still usable in generic VCP lifecycle;
- Doctor explains unsupported/unknown pieces;
- no npm workflow appears.

---

## Scenario C — polyglot root

Project contains Go and TypeScript evidence.

Result:

- both capabilities visible;
- selected project root remains authority;
- VCP does not silently pick Go and forget TypeScript;
- verification commands come from actual repository evidence.

---

## Scenario D — Auto trivial change

Only an eligible documentation typo changes.

Result:

- L0 path succeeds;
- no full Task Pack ceremony;
- protected files would make the same lane fail.

---

## Scenario E — Auto material feature

Result:

- Task Pack/readiness required;
- verification executes;
- fresh review evidence required;
- stale old-head evidence fails;
- exact final state can be gated.

---

## Scenario F — Manual mode

Normal coding request does not automatically enter full VCP flow.

Explicit /vcp-equivalent invocation does.

Repository truth and deterministic commands are the same as Auto.

---

## Scenario G — update from pre-adaptive VCP

Result:

- explicit migration plan;
- no unexplained disappeared-file conflicts;
- customized old prompts preserved as overrides;
- obsolete unmodified framework assets removed/detached as specified;
- old VCP workflow handled deliberately;
- rollback restores old project state.

---


## Scenario H — invisible Auto UX

A developer unfamiliar with VCP asks for a normal material feature.

Result:

- user does not manually invoke task/readiness/context/verify/gate;
- agent/Skill routes internally;
- only genuine human decisions interrupt;
- final response gives outcome, evidence, risks and any unresolved decision;
- deterministic CLI state remains inspectable afterward.

---

## Scenario I — human-attention discipline

A discovery case contains a mixture of repository facts, safe proposals and true product decisions.

Result:

- discoverable items are resolved without questions;
- proposals are labeled as proposals;
- true human decisions are grouped;
- no repeated question asks for already durable project truth.

---

## Scenario J — progressive disclosure

An L0 documentation correction and an L3 authentication change are run in the same installed project.

Result:

- L0 context excludes unrelated security/profile/deep reference material;
- L3 loads only the additional security/recovery material relevant to the change;
- Context Pack manifests make the inclusion difference inspectable.

---

## Scenario K — Complexity ROI rejection

A proposed new Core command duplicates behavior already handled reliably by a thin Skill or existing repository tooling.

Result:

- Task/design review can reject or redirect the feature without treating non-implementation as failure;
- no unnecessary persistent state/migration surface is added.

# 22. Final architectural judgment after inspecting the code

The existing implementation is not a throwaway prototype.

The strongest parts of VCP are already deterministic and worth preserving:

- lifecycle state;
- update safety;
- bounded context;
- readiness;
- verification evidence;
- Git provenance;
- security/profile trust;
- architecture/release checks.

The largest weaknesses are at the boundaries between that strong core and real-world adoption:

~~~text
initial install
asset composition
project diversity
agent UX
CI integration
workflow enforcement
~~~

That means the right strategy is not to rewrite VCP as a Skill.

It is also not to keep adding more core machinery indiscriminately.

The right strategy is:

> Keep the deterministic control plane, make initial adoption as safe as the update engine, make project adaptation composable, move conversational UX into Skills, and let mechanical gates enforce only the things software can actually prove.

The most important technical principle for implementation is:

> Every new adaptive feature must integrate with the existing lifecycle model so that the first install, the tenth update, a fresh agent, and CI all interpret the same repository state consistently.
