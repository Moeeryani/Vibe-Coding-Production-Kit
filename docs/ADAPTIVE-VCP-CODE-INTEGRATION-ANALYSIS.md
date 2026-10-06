# Adaptive VCP — Code Integration and Impact Analysis

**Status:** Code-level implementation analysis  
**Runtime/code baseline inspected:** current main after merged Stage 11 / PR #85; detailed consistency pass performed on main at 68dca7d6e172c3ca4c12b190eeaefb372edfafd4. Later documentation-only consistency commits do not change the runtime observations below.  
**Companion design document:** docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md  
**Purpose:** Trace every agreed adaptive-VCP change through the real implementation, persisted lifecycle state, tests, release mechanics, and downstream contracts before any feature work is split into issues.

---

## Interpretation rule — observed code vs proposed integration

Sections labeled as current/observed describe current main at the inspected runtime baseline. Workstream recommendations describe future Adaptive behavior.

- Current public docs remain authoritative until the corresponding Adaptive stage is implemented.
- A current-vs-proposed difference is intentional when explicitly labeled; it is not permission to claim the proposed CLI/state already exists.
- Each implementation stage must synchronize current-behavior docs/tests with the newly landed contract.
- `.vcp/manifest.json` lifecycle schema versions and community profile/plugin manifest schema versions are independent version domains; never infer compatibility between them because both may use the number 2.


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

The update apply path spreads existing install metadata when rebuilding the manifest. That is useful for data preservation, but it is not semantic forward compatibility: a CLI can preserve an unknown field and still be unsafe to mutate state governed by that field. The Adaptive manifest therefore also needs the minimum-reader guard defined in Workstream A.

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

Smart init should remove questions that repository evidence can answer, without pretending later capability work already exists:

- Stage 12/13 stack evidence → use the current deterministic Stage-11-compatible detector, while surfacing material mixed-stack ambiguity rather than guessing;
- Phase 4+ capabilities → detect compositionally once that model lands;
- CI → detect/preserve;
- existing agent integration → detect/compose.

Only real choices should remain. Repository ambiguity that affects authority/profile selection is a real decision until deterministic capability semantics can resolve it.

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

Current code validates correctly but transports too broadly.

Today:

~~~text
loadCommunityPluginContext(mode)
→ validates selection + every selected bundle
→ returns full config + plugin manifests
→ filters guidance by mode
→ keeps every verification proposal
        ↓
renderContextPack()
→ renders every selected plugin identity
→ renders every verification proposal in every mode
→ includes PLUGINS.json + every plugin.json in Context manifest/files
~~~

Target split:

~~~text
validateCommunityPluginSelection(root)
→ full selection/bundle/digest/grant/compatibility validation
→ trusted Core inspection result
→ no model-context bytes implied

deriveCommunityPluginTransport(validated, contextMode)
→ mode-relevant guidance only
→ schema-v1 verification proposals only for plan mode
→ only identities needed to attribute transported contributions

renderContextPack(transport)
→ renders transported contributions only
~~~

The exact function names may differ.

Structured output must distinguish:

~~~text
transportedFiles
  bytes actually rendered / counted in Context Pack

validatedPluginInputs
  config/manifest identities read for trust validation
  not model context

validatedCommunityPlugins
  IDs/versions/digests/grants summary as needed
~~~

Do not keep one ambiguous files collection that implies every validated file was injected into the model context. Preserve a backward-compatible alias only if its semantics are clearly versioned/documented.

For schema-v1 verification proposals, plan-only transport is the conservative first rule because v1 proposals have no mode field. `vcp plugins` remains the explicit inspection surface in every phase.

Negative tests must prove:

- a selected plugin with review-only guidance adds no plugin bytes to an implement pack;
- a selected plugin with no current-mode guidance/proposals is validated but contributes zero rendered plugin bytes;
- PLUGINS.json/plugin.json are not rendered merely for trust validation;
- v1 verification proposals appear in plan context but not implement/review/security/release context;
- tampered plugin state still fails context creation even when that plugin would contribute zero transported bytes.

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


## 4.4A Split raw CLI parsing from post-inspection option resolution

Current flow is:

~~~text
parseArgs
→ promptForOptions
→ validate resolved agent/stack
→ initProject
~~~

That ordering is incompatible with evidence-first brownfield adoption.

Refactor conceptually to:

~~~text
parseInitRequest
  → preserve target + explicitness/provenance of each flag
        ↓
inspectRepository(target)
        ↓
resolveInitPreferences(request, inspection)
        ↓
planInit(...)
~~~

`resolveInitPreferences` may be CLI/UI-specific; the deterministic planner receives normalized intent plus explicit unresolved-decision records.

Important behavior:

- do not call the current greenfield `promptForOptions()` unchanged for EXISTING repositories;
- MANAGED/VCP_STATE_CONFLICT paths short-circuit before adoption prompts;
- `--yes` on EXISTING keeps omitted agent/GitHub intent unspecified and applies only documented conservative defaults;
- `--dry-run --json` never reads stdin; unresolved human choices are structured plan items;
- public human dry-run may prompt only after inspection and only for an actual choice that affects the plan;
- option validation distinguishes syntax validity from semantic repository applicability;
- NEW may use a compatibility resolver that reproduces current defaults until the greenfield UX is migrated.

This can be implemented by splitting the existing helper rather than forcing repository inspection into `lib/cli.mjs`; the dependency direction should remain CLI → inspection/planning, not planner → terminal prompting.

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

- inspect the reserved .vcp namespace before ordinary repository classification;
- distinguish absent manifest, recognized managed manifest, unsupported/newer reader state, malformed lifecycle state, and active recovery/transaction state;
- classify NEW / EXISTING / MANAGED only when lifecycle readability permits it;
- emit VCP_STATE_CONFLICT/recovery-required state instead of reclassifying unreadable lifecycle data as ordinary EXISTING;
- identify existing agent instruction files;
- identify CI/config/project markers needed for safe planning;
- detect current stack using the existing Stage 11-compatible stack model;
- never mutate.

Classification affects planning/UX, not path-safety trust.

Maturity rule after VCP-state inspection:

~~~text
NEW
→ bounded inspection proves there is no meaningful project-owned content

EXISTING
→ meaningful project-owned content exists
→ or inspection is ambiguous
~~~

Implementation notes:

- ignore VCS internals such as `.git/` for the NEW/EXISTING content test; a freshly git-initialized empty root can still be NEW;
- use a small explicit set of harmless metadata exclusions rather than a giant framework-specific ignore list;
- source/manifests/docs/CI/agent/config/migration files are meaningful;
- unknown non-ignorable entries and symlinks conservatively imply EXISTING/ambiguous;
- avoid walking dependency/vendor/build caches recursively;
- deterministic ordering/reporting is required;
- do not classify an established root as NEW merely because its ecosystem is unsupported.

### init-plan

One deterministic planner is shared by preview and later apply.

Inputs include:

- selected root;
- repository inspection result;
- agent request provenance plus resolved managed/observed adapter state;
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

Action ownership rules:

```text
ADD
→ create content and establish declared ownership

ADOPT
→ establish ownership only where the ownership boundary already exists safely:
   an exact canonical whole-file artifact whose asset policy permits whole-file adoption,
   or an already valid marked VCP section
→ brownfield AGENTS/CLAUDE/Copilot paths stay section-owned; exact unmarked content does not authorize whole-file takeover
→ never claim arbitrary unmarked project prose as a section baseline

COMPOSE
→ create/reconcile the marked VCP section and preserve surrounding project text

equivalent unmarked integration
→ NOOP when no managed block is required
→ otherwise COMPOSE explicitly
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
- an assetSet-aware integration block that references explicit Task Pack/Context authority rather than assuming canonical starter docs exist;
- only verification-command slots whose effective authority is unambiguous;
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

### Same-schema forward compatibility

Stage 12 schema v2 will not be the last lifecycle feature. Later phases may add behavior-bearing state such as capabilities, workflowMode, or explicit CI/gate integration. A Stage-12 schema-v2 CLI must still fail closed when it encounters semantics introduced by a newer release.

Add a top-level semantic reader guard, conceptually:

~~~json
{
  "schemaVersion": 2,
  "minimumReaderVersion": "X.Y.Z"
}
~~~

Manifest loading validates this before lifecycle plan/apply/manage/rollback:

~~~text
running CLI version < minimumReaderVersion
→ readable incompatibility report
→ no lifecycle mutation
~~~

Rules:

- schema-v1 migration sets the Stage-12 minimum reader version;
- later behavior-bearing persisted fields raise the guard;
- writers preserve max(existing guard, version required by semantics being written);
- rollback restores the previous guard exactly;
- unknown descriptive fields may be forward-preserved only when they cannot affect desired state, safety, authorization, or lifecycle behavior;
- spreading unknown install fields is data preservation, not proof the older CLI understands them;
- structurally incompatible changes still require a schema bump.

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

### Lock bootstrap occurs before backup and needs its own cleanup contract

Current acquireUpdateLock() calls mkdir(.vcp, recursive) before creating `.vcp/update.lock` with exclusive `wx` semantics. For an unmanaged repository, the lock itself can therefore create the first `.vcp/` path before createBackup() runs.

Generalize lock acquisition (or wrap it for init apply) so it returns/retains whether this operation created the VCP directory solely for locking.

After lock acquisition:

1. run the fresh repository/VCP-state inspection;
2. if the plan blocks before backup creation, release the lock;
3. attempt only a non-recursive removal of the operation-created `.vcp/` directory;
4. if anything else exists in that directory, do not delete it—preserve and report;
5. once backup/transaction state exists, normal adoption recovery semantics take over.

Tests must cover conflict/no-op/error exits that occur between lock acquisition and backup creation.

### Required backup metadata

Generalize recovery metadata so it records the **pre-lock** lifecycle state explicitly, for example:

```text
operation: init | update
priorVcpDirectoryExisted: true | false
priorManifestExisted: true | false
priorBaselinesExisted: true | false
priorInstalledVersion: <version> | null
lockBootstrapCreatedVcpDirectory: true | false
```

Exact names are implementation choices.

The pre-lock values must be captured by repository inspection / lock bootstrap **before** `acquireUpdateLock()` creates `.vcp/`. Do not recompute them inside `createBackup()` from the post-lock filesystem.

This operation snapshot should be passed into generalized backup creation so recovery metadata reflects reality rather than the lock's side effects.

### Required rollback behavior

For initial adoption:

- restore every pre-existing project file that was composed/changed;
- delete paths that were newly added;
- remove new manifest if none existed before;
- remove new baselines if none existed before;
- clear transaction/lock/stage state;
- when `priorVcpDirectoryExisted=false`, remove operation-created `.vcp/.gitignore` if applicable;
- after a **successful** restore, remove the selected operation-created adoption backup itself and any now-empty operation-created `.vcp/backups` container;
- finally attempt a non-recursive removal of `.vcp/` so unexpected external/concurrent content is preserved rather than erased.

Do not delete the recovery backup before restore verification succeeds. If rollback fails or leaves an unexpected path, retain the backup/recovery state and report that the repository is not fully restored instead of claiming unmanaged success.

A manually requested rollback of a successful first adoption follows the same rule: successful restore returns the repository to its true prior unmanaged shape, which means no VCP-owned backup residue remains.

Current `createBackup()` / `restoreBackup()` primitives should be generalized rather than duplicating backup logic in `init-apply`.

### Rollback result must represent unmanaged state

Current `rollbackProject()` returns `restoredVersion: restored.installedVersion`, which assumes every successful restore returns to another managed VCP version.

Initial-adoption rollback requires a result model that can represent absence of management, conceptually:

~~~json
{
  "restoredState": "managed | unmanaged",
  "restoredVersion": "0.x.y | null",
  "restoredFromBackupId": "...",
  "recoveredInterruptedOperation": true
}
~~~

Exact names are implementation choices.

Compatibility rules:

- managed update rollback continues to report the restored VCP version;
- first-adoption rollback reports unmanaged state and must not invent a version;
- success is returned only after the prior-state shape is verified, including absence of VCP lifecycle state when expected;
- if unexpected residual `.vcp` content prevents full unmanaged restoration, return/report partial recovery failure rather than `restoredState=unmanaged`;
- if the first-adoption backup is removed as part of successful unmanaged cleanup, its ID may still be returned as historical operation provenance even though it is no longer listable.

A successful manual rollback of first adoption here means the adoption backup is the currently valid rollback target under the normal rollback guard. This is not a general uninstall-to-any-historical-backup feature.

Do not rename the on-disk `.vcp/update.lock` merely for aesthetics in this stage. Helper APIs may become lifecycle-generic while preserving compatible state paths.

---

## 4.9 Stage 12/13 testing contract

### Stage 12 tests

Must prove:

- NEW / EXISTING / MANAGED classification after lifecycle-readability inspection;
- empty root and git-only-empty root classify NEW;
- one unknown meaningful file/symlink classifies EXISTING/ambiguous rather than NEW;
- malformed JSON manifest → VCP_STATE_CONFLICT, zero writes;
- unsupported/newer schema → VCP_STATE_CONFLICT, zero writes;
- minimumReaderVersion newer than running CLI → fail closed, zero writes;
- readable managed manifest with missing/corrupt baseline or active transaction → MANAGED recovery/health blocker, never brownfield re-init;
- unknown pre-existing .vcp content is preserved and blocks unsafe adoption;
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
- if lock bootstrap creates .vcp and planning blocks before backup, lock cleanup returns the repository to no VCP state;
- unexpected content appearing in the lock-created .vcp directory is preserved and reported rather than recursively deleted;
- a repository change between preview and apply changes/rejects the fresh plan safely;
- apply never trusts a stale preview object;
- all conflicts block before project-file mutation;
- section compose preserves surrounding bytes;
- rollback restores an unmanaged repository to truly unmanaged lifecycle state, including removal of the successful first-adoption recovery backup/internal scaffolding;
- re-running init after success redirects as MANAGED;
- normal `vcp update` works immediately after adoption;
- apply is idempotent.


## 4.10 Persisted asset-surface identity

A minimal brownfield adoption cannot be correct if the next `vcp update` immediately rebuilds the full legacy template surface.

The same state also lets fresh greenfield installs stop inheriting source-repository-only CI without forcing an unrelated migration onto existing managed projects.

Persist install-surface identity as lifecycle state.

Conceptually:

~~~text
legacy-full-v1
  migrated schema-v1 installs
  preserves current historical desired surface temporarily

greenfield-safe-v1
  fresh Adaptive-era NEW installs
  excludes source-repository .github/workflows/validate.yml

brownfield-minimal-v1
  established-repository Smart Init surface
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

Stage-12 migration behavior:

~~~text
existing schema-v1 managed project
→ legacy-full-v1
→ no surprise validate.yml deletion merely because schema migrated

fresh NEW install
→ greenfield-safe-v1
→ GitHub hygiene may be included according to preference
→ npm-specific VCP source workflow is not installed

Stage-13 brownfield adoption
→ brownfield-minimal-v1
~~~

Phase 2 can move all three onto a later classified catalog version while preserving profile-specific selection. Phase 3 owns provider-neutral CI inspection plus explicit migration/detach of the old legacy managed workflow.

---

## 4.10A Agent request provenance

Current CLI parsing keeps `agent=null` initially, but `promptForOptions()` and especially `--yes` convert omission to `generic` before init sees repository maturity.

That is acceptable for historical greenfield behavior and unsafe as brownfield intent provenance.

Stage 12 planner input must preserve:

~~~text
agentPreference = unspecified
or
agentPreference = explicit(<supported selector>)
~~~

Repository inspection separately records:

~~~text
AGENTS.md present
CLAUDE.md present + whether it already routes to AGENTS
.github/copilot-instructions.md present + whether it already routes compatibly
~~~

Do not infer Codex vs Cursor from AGENTS.md.

Normalize three lifecycle concepts:

~~~text
requestedAdapterIntent
  explicit developer intent, or absent

managedAdapterSurface
  VCP-owned whole files/sections
  + ownership/adoption provenance
    explicit-request | observed-existing | legacy-managed (or equivalent)

observedCompatibleAdapters
  derived repository inspection
  never ownership by itself
~~~

Brownfield rules:

~~~text
unspecified + already-compatible vendor file
→ NOOP
→ keep project-owned

unspecified + existing vendor file missing routing
→ COMPOSE section
→ manage section with observed-existing provenance

unspecified + absent vendor file
→ do not create

explicit vendor + already-compatible project-owned file
→ persist requested intent
→ file may remain NOOP while compatible

explicit vendor + missing/incompatible surface
→ ADD/COMPOSE safely
~~~

Deletion/update rules:

- project-owned compatible adapter is recomputed, not rewritten;
- observed-existing managed section updates while its host file exists, but deletion of the host file does not silently create a new vendor adapter file;
- explicit requested intent is durable and may cause the safe planner to re-establish missing compatibility;
- legacy managed adapters migrate without losing ownership.

Possible persistence:

- `install.requestedAdapters` (or equivalent) only for explicit/historical durable intent;
- managed entry metadata carries adapter origin/adoption reason for VCP-owned sections/files;
- no persisted desired ownership solely because a compatible project-owned file was observed.

Current `install.agent` may remain as a compatibility/display summary during transition, but desired-state generation must not treat that scalar as the complete brownfield authority.

CLI implications:

- retain whether `--agent` was explicitly supplied;
- `-y` may apply generic only after classification for NEW; EXISTING remains unspecified for planning;
- interactive init asks only when an actual adapter intent choice remains unresolved.

Lifecycle implications:

- buildDesiredFiles/successor, update, manage, Doctor, rollback, and migration consume explicit intent + managed surface provenance;
- behavior-bearing adapter intent/origin semantics raise minimumReaderVersion;
- section ownership applies to brownfield adapter integrations;
- public tests cover unspecified `--yes`, already-compatible NOOP, observed-existing COMPOSE, deletion semantics, and explicit requested re-establishment.

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

### Reserved .vcp path and lifecycle-readability precedence

Repository maturity classification runs only after VCP state is inspected.

Required states:

~~~text
NO_VCP_STATE
  → eligible for NEW/EXISTING maturity classification

MANAGED_READABLE
  → supported schema + supported minimumReaderVersion
  → init redirects/blocks re-init

MANAGED_RECOVERY_REQUIRED
  → readable manifest, but integrity/baseline/transaction/lock health blocks normal lifecycle work
  → still managed; never re-init over it

VCP_STATE_CONFLICT
  → malformed manifest, unsupported/newer schema, minimumReaderVersion too new,
    or unknown reserved .vcp content that cannot be interpreted safely
  → no adoption mutation
~~~

An active transaction or lock must be surfaced before Smart Init apply. Recovery semantics remain the lifecycle authority.

First-adoption recovery metadata must know which .vcp paths existed beforehand. Rollback may remove only state created by the adoption transaction; it must never erase unrelated pre-existing reserved content.

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

For brownfield adoption, integration files use section ownership whether they pre-exist or VCP creates them:

```text
brownfield existing AGENTS.md
→ compose marked section

brownfield missing AGENTS.md
→ create a thin file containing the marked section
→ ownership remains section
```

Greenfield legacy initialization may retain whole-file ownership temporarily.

The manifest entry decides active ownership while managed; the brownfield asset profile plus valid markers provide the safe re-track contract after an explicit detach.

`policyForPath()` can remain a source of default update policy, but it is no longer sufficient to describe ownership.

Schema-v2 migration maps all legacy v1 entries to whole-file ownership.

`update-plan`, baseline handling, apply verification, Doctor, and manage ignore/track must use the manifest ownership record.

### Section-owned manage ignore/track contract

Current manage ignore deletes the managed entry and baseline but preserves local content. Current track rebuilds ownership from the package desired file.

With section ownership, track must not accidentally re-adopt the whole composed file.

Required behavior for brownfield-minimal integration paths:

~~~text
manage ignore
→ remove managed section entry/baseline
→ retain full file + marker block unchanged
→ add path to ignored set

manage track, file exists
→ require exactly one valid recognized marker pair
→ compute current desired VCP section
→ write section baseline/ownership metadata
→ preserve surrounding project text
→ never whole-file adopt

manage track, file absent
→ recreate thin marked integration file
→ section ownership

missing/malformed/duplicate marker on existing ignored file
→ refuse track with actionable conflict
~~~

Legacy-full whole-file entries keep current track semantics until explicitly migrated.

This allows the existing ignoredFiles path list to remain viable initially because the persisted assetSet/catalog class determines that a brownfield integration path is section-capable; no hidden historical ownership guess is allowed.

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


## 5.6A Task Pack Source-of-Truth scaffold must be install-profile aware

`lib/task.mjs` currently hardcodes VCP greenfield starter paths into every generated full Task Pack.

That conflicts with brownfield-minimal adoption, which intentionally preserves project docs and may install none of those paths.

Stage 13 must update task creation before brownfield Smart Init is considered usable.

Implementation direction:

~~~text
createTaskPack(root)
  ↓
read supported manifest/lifecycle state when present
  ↓
resolve install.assetSet
  ↓
choose Source-of-Truth scaffold
~~~

### legacy-full / current greenfield

Retain current starter-oriented table for compatibility until the later consumer-template migration.

### brownfield-minimal

Render neutral reference placeholders only:

~~~text
| Authority / decision | Reference |
|---|---|
| Governing requirement | <project-relative path#section or workspace:path#section> |
| Architecture/domain decision (if applicable) | <path#section> |
| Security/testing/operational authority (if applicable) | <path#section> |
~~~

Do not inspect filenames and auto-declare a random README/design/security document authoritative. Discovery may report candidates to the agent, but Task Pack authority is established by explicit accepted references.

Readiness already rejects placeholder/missing/non-authoritative references; preserve that behavior.

Fallback compatibility:

- if no VCP manifest exists, keep current legacy task behavior unless a separately designed unmanaged-task mode is introduced;
- if manifest is unreadable/too new, fail closed rather than rendering from guessed lifecycle semantics;
- use the same manifest reader/minimumReaderVersion contract as other lifecycle-aware commands.

Later Phase 7 L1/L2/L3 renderers all call one Source-of-Truth scaffold helper so assetSet logic is not duplicated per workflow level.

Tests:

- brownfield-minimal task contains no canonical absent starter paths;
- legacy-full task remains backward compatible;
- brownfield task placeholders fail readiness until replaced by real accepted references;
- explicit workspace:<path> remains supported;
- unreadable/newer manifest blocks lifecycle-aware rendering safely.

---

## 5.7 Parsing verification commands

Today parseAgentVerificationCommands reads command slots directly from the whole AGENTS.md and returns the first matching line per key. Doctor has parallel first-match logic.

That behavior becomes unsafe once an existing project-owned AGENTS.md can contain its own command slots alongside a VCP-owned section.

Stage 12 must therefore add a shared command-authority inspection path before composition.

Per command key, distinguish:

~~~text
missing
unique
duplicate-equivalent
duplicate-conflicting
~~~

Rules:

- a unique existing project-owned configured value remains effective;
- VCP must not add a second conflicting value merely to keep commands inside its section;
- a missing value may be contributed by the VCP section from deterministic repository evidence or remain unresolved;
- duplicate-conflicting values block adoption until authority is clarified;
- Task generation, Doctor, and any future gate use the same resolver.

The VCP-owned integration section should expose only the slots VCP actually owns after this authority decision.

Do not mix this work with a migration to a new structured verification-config file. That may be valuable later, but safe brownfield adoption can preserve the current command contract once authority is explicit.

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

Use one explicit **classified catalog**, not one identical install list.

Recommended classes:

~~~text
runtime-required
greenfield-starter
optional-hygiene
package-only
~~~

Examples:

- AGENTS/VCP lifecycle integration → runtime-required;
- Product Brief / PRD / Architecture starter templates → greenfield-starter;
- issue/PR templates → optional-hygiene;
- Roadmap/CLI/release history/framework validation → package-only.

For brownfield-minimal installs, absence of a greenfield starter is intentional unless the developer explicitly adopts/creates it.

Existing project docs may be referenced directly by Task Packs; Smart Init must not silently re-label arbitrary docs as accepted Source of Truth.

---

## 7.1A Security-profile assets already demonstrate the package-fallback pattern

`lib/security-profiles.mjs` already separates project declaration from canonical guidance:

~~~text
docs/security/SECURITY-PROFILE.md
→ optional project-local declaration
→ if absent, baseline still applies

docs/security/profiles/<name>.md
→ local file wins when present
→ otherwise packaged canonical profile is loaded as vcp:<path>
~~~

Phase 2 should preserve this model explicitly.

Catalog classification:

- THREAT-MODEL.md → greenfield-starter/project truth;
- SECURITY-PROFILE.md → optional greenfield-starter/project-owned config;
- canonical docs/security/profiles/*.md → package-only canonical guidance with supported project-local override precedence.

Migration:

- old unmodified managed profile guidance → explicit removal, packaged fallback becomes active;
- old locally modified profile guidance → detach/preserve as project override at the same selected-root path;
- profile declaration → preserve/project-owned;
- no declaration on brownfield-minimal → valid baseline-only security context, not install failure.

Tests must prove local override precedence survives removal of managed canonical copies and Doctor/Context still report the active source identity correctly.

---

## 7.1B Community-plugin selection and bundles are project-owned external state

Stage 10 already establishes a distinct ownership boundary:

~~~text
docs/plugins/PLUGINS.json
→ explicit project-owned opt-in selection/grant state
→ init does not create it

community-plugins/**
→ local project/vendor bundle content
→ selected/digest-pinned by project state
~~~

These are **not** consumer-install catalog entries.

Phase-2 asset cleanup rules:

- do not classify either path family as runtime-required, greenfield-starter, optional-hygiene, or package-only desired files;
- do not start managing them merely because the old installer previously copied the broad `docs/` directory;
- do not delete/rename/relocate them as part of framework-doc removal;
- Context and Doctor continue read-only validation when a declaration exists;
- plugin schema v2 evolves validation/contribution semantics in project-owned state; it does not transfer file ownership to VCP lifecycle management.

Migration regression:

~~~text
legacy managed framework docs + project-owned selected plugin state
→ remove/detach only declared VCP framework paths
→ PLUGINS.json and selected community-plugins bundle bytes unchanged
~~~

## 7.2 Prompt resolution must change first

Before prompts are removed from consumer assets, lib/context.mjs must support package fallback.

The **resolver itself lands in Stage 12**, because minimal brownfield Smart Init already uses packaged prompts when no project override exists. Phase 2 consumes that resolver to remove legacy prompt copies from the broader consumer asset set.

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

Resolver safety contract:

- a project override is still a selected-root project file; resolve it through the same confinement and symlink-safety rules used for trusted project context;
- package fallback is chosen only from the fixed MODE_PROMPTS/canonical prompt allowlist for the requested contextMode;
- do not expose a generic "read any vcp:<path>" escape hatch;
- the packaged prompt is typed as execution-prompt context, never Source of Truth;
- a Task Pack cannot cite a packaged prompt to satisfy product/architecture/security authority;
- package prompt bytes count toward the existing context budget;
- vcp: identity is rendered in the Context Pack/manifest so a reviewer can distinguish package guidance from project-owned truth;
- the resolver returns typed provenance, for example `sourceKind: project-override | packaged`, and packaged results include the supplying VCP package version;
- `createContextPack()` exposes that prompt provenance in its structured return/JSON contract instead of making callers infer it from a path prefix;
- the full prompt content remains embedded in the Context Pack, so a saved pack is self-contained even after a VCP upgrade.

This mirrors security-profile behavior without widening repository authority.

---

## 7.3 Existing project prompt customization migration

This pattern gives us a clean migration:

- old unmodified VCP prompt → explicit migration removes it; package fallback becomes active;
- old locally modified prompt → update removal detaches/preserves it; resolver sees it and continues using it as the project override.

That means existing custom prompt behavior survives without forcing prompt files to remain VCP-managed forever.

Tests must prove both cases.

---

## 7.4 Doctor changes

Split Doctor work by dependency rather than by file ownership.

### Stage 12 minimum

Doctor must stop treating project-local prompt copies as mandatory as soon as packaged fallback is valid.

It must call the same prompt resolver used by context so a correctly adopted brownfield project is not immediately reported unhealthy.

### Phase 2/3 broader cleanup

Later consumer-asset/CI work removes the copied source-framework validator expectation and replaces exact-workflow CI assumptions.

Prompt-source correctness does not wait for that broader cleanup.

Report examples:

~~~text
PASS Plan prompt: packaged VCP prompt
PASS Review prompt: project override
~~~

Doctor must also make asset-set-aware distinctions for starter project truth.

For brownfield-minimal:

- missing VCP Product/PRD/Architecture/Threat-Model/Test-Strategy starter paths are not installation failures if those assets were never installed/owned;
- existing arbitrary docs are not silently promoted to authoritative equivalents;
- project-governance coverage may be reported as configured / absent / unknown separately from install health;
- absent/unknown governance is informational by default for brownfield-minimal and must not make doctor --strict fail merely because VCP starter paths were never installed;
- it becomes blocking only when a concrete readiness/task/policy contract requires missing governing truth;
- Task Pack Source-of-Truth references remain the execution-time authority.

Similarly, Doctor should stop requiring scripts/validate-framework.sh inside every consumer.

The source repository's validate-framework script is not a universal application validation command.

Project validation is represented by accepted verification commands plus Doctor/readiness/gate.

---

## 7.5 Release-check changes

This is a hard dependency.

Current `runLifecycleSmoke()` proves previous-release init → candidate preview/apply → Doctor → copied `validate-framework.mjs` → idempotence. It does **not** currently exercise rollback or an older reader against upgraded state.

Once Adaptive manifest/schema behavior lands, lifecycle smoke must validate the consumer through public lifecycle contracts:

~~~text
previous CLI init temporary consumer
      ↓
snapshot/hash previous manifest + baselines + relevant managed bytes
      ↓
candidate update --dry-run
      ↓
candidate update apply
      ↓
candidate doctor --json
      ↓
candidate update --dry-run  (idempotent)
      ↓
inspect schemaVersion / minimumReaderVersion / assetSet / ownership surface
      ↓
run previous CLI against upgraded project
      ↓
expect explicit incompatibility + non-zero
      ↓
prove no filesystem/lifecycle mutation from the failed old-reader attempt
      ↓
candidate rollback --backup <apply backup>
      ↓
compare restored v1 manifest/baselines/relevant project bytes with pre-update snapshot
      ↓
previous CLI can read/doctor the restored project
      ↓
candidate preview/apply succeeds again
~~~

Implementation consequences:

- extend release lifecycle evidence with rollback/reader-compatibility fields rather than treating `validateLifecycleEvidence()`'s current four inputs as sufficient;
- do not execute the consumer's copied `scripts/validate-framework.mjs` after that asset leaves the consumer surface;
- use the candidate CLI to perform rollback, because the old CLI is intentionally not allowed to understand the upgraded manifest;
- verify old-reader failure itself is read-only by snapshot comparison, not merely by exit code;
- verify rollback restores the prior schema/version and baseline semantics, not just visible project files;
- after rollback, old-reader success proves the prior lifecycle really became readable again.

Stage-12 also needs an independent public-CLI fixture that constructs a **supported schema v2 with a future `minimumReaderVersion`** and proves the current candidate fails closed. The previous v0.9 CLI only proves the schema-version boundary because it cannot read schema v2 at all.

If a canonical consumer verification/gate fixture is available later, it may also run that. Gate does not replace migration/rollback proof.

The VCP source package still runs npm validation/package/release checks separately.

---

## 7.6 Migration mechanics

When removing previously managed files:

- declare explicit migration removals;
- unmodified managed files may be deleted;
- locally modified files must be detached/preserved according to current update semantics;
- preserve files remain project-owned;
- do not manipulate project task history that was created by the user;
- never sweep project-owned `docs/plugins/PLUGINS.json` or `community-plugins/**` into framework removal.

For old framework docs that share the same directory as project docs, removal must be path-specific.

Never remove the entire docs directory.

---

## 7.7 Definition of done

- fresh consumer install no longer receives VCP source roadmap/release/task history;
- fresh consumer install no longer receives source-framework validation scripts;
- context works with no project-local prompts;
- packaged prompt resolution cannot escape its fixed package allowlist or widen project path authority;
- packaged prompts are never mistaken for project Source of Truth;
- project prompt overrides still work and remain selected-root confined;
- old modified prompts survive upgrade as overrides;
- old modified local security-profile guidance survives as an override, while unmodified canonical profile copies can use package fallback;
- Doctor is green/accurate without copied framework scripts;
- release-check consumer lifecycle smoke no longer depends on copied validate-framework;
- explicit migration removals prevent disappeared-file conflicts;
- security profile declaration vs packaged guidance ownership remains distinct;
- project community-plugin selection and bundle bytes remain outside VCP consumer-asset ownership;
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

Use deterministic states, not probabilistic confidence scores, and do not overload one field with both evidence and authority.

The internal model must preserve at least:

~~~text
evidenceState:
  proven | unknown

applicationState:
  applied | proposed | unapplied

applicationProvenance when applied:
  auto-core | explicit-project | community-adopted | ...

sourceKind:
  core | first-party-profile | community-profile:<id> | project-config
~~~

A proven capability is not necessarily applied, and an explicitly applied capability can remain applied while current detector evidence is absent.

Initial automatic composition may use:

- core/first-party capabilities that are deterministically proven and lifecycle-eligible;
- explicitly project-configured capabilities.

A community-profile detector may produce proven evidence after selection/digest/grant validation, but that evidence remains unapplied/proposed unless separate project-owned configuration authorizes application.

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

Add an installed applied-capability snapshot with per-capability application provenance; current detected evidence stays derived.

Conceptually:

~~~json
{
  "install": {
    "stack": "typescript",
    "requestedStack": "auto",
    "appliedCapabilities": [
      {
        "id": "language.typescript",
        "applicationProvenance": "auto-core"
      },
      {
        "id": "runtime.node",
        "applicationProvenance": "auto-core"
      },
      {
        "id": "package-manager.pnpm",
        "applicationProvenance": "auto-core"
      }
    ]
  }
}
~~~

The exact schema can differ; do not introduce another generic `capabilityMode=auto` control that can be confused with workflowMode or requestedStack. The key separation is:

- current repository detection;
- capabilities currently applied to VCP-managed content;
- per-capability application provenance (auto-core / explicit-project / community-adopted or equivalent);
- user/profile selection provenance.

Doctor must report these separately just as it currently distinguishes detected stack vs installed stack.

---

## 8.5A Applied-capability lifecycle state

`appliedCapabilities` must contain provenance-bearing records (or an equivalent map), not bare IDs, because removal/re-detection semantics depend on why each capability was applied.

Persist an applied record/snapshot with provenance, conceptually:

~~~json
{
  "id": "framework.react-native",
  "applicationProvenance": "auto-core",
  "sourceKind": "core",
  "detector": "core.react-native.v1"
}
~~~

or:

~~~json
{
  "id": "language.rust",
  "applicationProvenance": "community-adopted",
  "sourceKind": "community-profile:rust-profile",
  "profileDigest": "sha256:..."
}
~~~

Derived current detection and persisted applied state remain separate.

Update transition rules:

~~~text
auto-core + evidence appears
→ eligible ADD transition

auto-core + evidence disappears
→ eligible REMOVE transition
→ visible in dry-run
→ desired-content merge/conflict semantics still apply

explicit-project + evidence disappears
→ keep applied
→ Doctor mismatch/warn
→ explicit project change required to remove

community-adopted + profile/evidence becomes invalid unexpectedly
→ block dependent lifecycle mutation
→ never silently remove capability-driven behavior

detected community evidence without project adoption
→ report/propose only
~~~

Do not use lexical capability priority to resolve incompatible applied states. Emit conflict/decision with the conflicting evidence/provenance.

Legacy migration:

- requestedStack=auto may map stack-derived applied capability provenance to auto-core;
- explicit requestedStack maps corresponding intent to explicit-project;
- missing requestedStack provenance remains conservative/unknown and cannot be promoted to auto-core merely to simplify migration.

Every capability add/remove/reconfigure transition must appear in update/status/Doctor JSON and human reports before apply.

Capability transitions that change desired managed content must raise/retain the manifest minimumReaderVersion appropriate to the capability-era semantics.

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

Current buildNextManifest spreads migrated install metadata, which is favorable for preservation but insufficient for compatibility. Capability-era writes must also raise minimumReaderVersion to the first CLI version that understands the applied capability semantics.

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

For polyglot roots, define a conservative compatibility summary while the real internal behavior uses capabilities.

In the first transition release, prefer an already-supported summary such as `generic` when no single legacy profile truthfully represents the root.

Do **not** invent a new legacy stack value such as `mixed` unless every stack consumer, manifest validator, CLI selector/report, migration, Doctor path, update/manage path, and compatibility test is migrated together.

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


## 8.11 Stage 11 React Native migration impact

Stage 11 React Native is already merged on main.

Current runtime facts include:

- react-native is an explicit STACK_CHOICES value;
- auto detection resolves go → python → react-native → typescript → javascript → generic;
- exact selected-root dependency + application-marker evidence is required;
- auto-selected generic/javascript/typescript may specialize to react-native under existing provenance rules;
- explicit selectors and legacy unknown provenance remain conservative;
- mobile sensitive-effect commands remain outside ordinary verification discovery.

The capability architecture must therefore **migrate/re-express**, not pre-empt, Stage 11.

Required bridge:

~~~text
existing install.stack / requestedStack
        +
existing React Native specialization provenance
        ↓
normalized capabilities
        +
legacy stack summary retained for compatibility
~~~

React Native should map into capabilities such as:

~~~text
runtime.node
language.javascript | language.typescript
framework.react-native
mobile.react-native-app
~~~

while preserving:

- explicit requestedStack=react-native as human configuration provenance;
- auto-selected React Native as detector/lifecycle provenance;
- selected-root confinement;
- existing verification command semantics;
- security/HUMAN DECISION boundaries;
- Stage 10 plugin coexistence.

Do not remove the current specialization transition until the capability-era lifecycle has an explicitly tested equivalent migration path.

## 8.12 Definition of done

- JS/TS/Python/Go/React-Native simple projects retain equivalent behavior;
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

Prefer a versioned **community profile/plugin manifest schema**, independent of the VCP lifecycle manifest schema.

For example:

~~~text
community profile schemaVersion 1
→ current guidance/proposal behavior unchanged

community profile schemaVersion 2
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

## 9.4A Detector DSL resource and path contract

The v2 detector evaluator must reuse the security posture already proven by the v1 bundle loader rather than introducing a looser path reader.

Required detector-evaluation invariants:

- every declared evidence path is portable, selected-project-root-relative, and passed through root-confinement/symlink protections;
- parent/sibling/workspace/URL/absolute path escape is rejected;
- symlink targets cannot confer capability evidence outside the selected root;
- JSON/text predicates have per-file and aggregate byte limits; directory/predicate counts have deterministic limits;
- decoding/parsing failure is explicit and cannot silently become a positive match;
- exact path/case semantics are deterministic across supported platforms where a predicate depends on a concrete path;
- output reports predicate identity/path/result only; never raw matched file contents, secret-looking values, environment data, or arbitrary JSON field values;
- .vcp/, .git/, environment/process state, credentials, and network state are not detector evidence surfaces for community profiles;
- invalid/tampered/over-budget selected detector state blocks before desired-content composition.

Negative tests must cover traversal, symlink escape, oversized metadata, malformed JSON/text, case variants, prohibited internal paths, and content-nonleak assertions.

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

Then one deterministic engine can evaluate normalized profile evidence, but application policy remains provenance-aware.

Trust/application rules:

- first-party definitions are part of the VCP release and may become lifecycle-eligible when deterministic evidence matches;
- community definitions require explicit project selection/digest/grant merely to contribute their allowed evidence/proposals;
- community detector matches do **not** automatically enter installed/applied capabilities;
- project-owned adoption/configuration is required before community-detected capability state can drive VCP-managed guidance/behavior beyond the already-granted bounded contribution type.

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
- detector DSL cannot execute code/network, escape selected-root path confinement, follow authority-granting symlinks, exceed resource budgets, or leak matched content;
- capability detection requires explicit selection/grant for community bundles;
- first-party/community profiles normalize into deterministic internal data;
- invalid/tampered/incompatible profile state fails before lifecycle mutation;
- detected community capability evidence and proposals are reportable without being mistaken for applied/approved capability state.

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

## 10.2 Phase E1 — Stop doing the harmful part first (Stage-12 fresh-install safety)

Before generating any new workflow, and as a Stage-12 requirement for fresh NEW installs:

1. stop installing VCP's source-repository npm workflow into arbitrary fresh consumers;
2. split GitHub issue/PR scaffolding from CI desired-state ownership;
3. preserve existing CI as project-owned state;
4. make Doctor/install-health assetSet-aware so greenfield-safe/brownfield-minimal do not require the legacy `.github/workflows/validate.yml`;
5. preserve legacy-full expectation/state until its explicit migration.

Stage 12 does **not** implement the full provider-neutral CI inspector. For the safe new asset sets, Doctor may report project CI coverage as unknown/unassessed until Phase 3. The required Stage-12 fix is that intentional absence of the legacy VCP workflow is not treated as install corruption.

Do not wait for full vcp gate to stop fresh npm-workflow installation.

---

## 10.3 includeGitHub compatibility

Do not immediately remove install.includeGitHub because existing manifests and update/manage code use it.

Interpret it through install.assetSet during the transition:

~~~text
legacy-full-v1
→ retain historical desired-state behavior until the explicit old-workflow migration

greenfield-safe-v1 / brownfield-minimal-v1
→ GitHub hygiene/scaffolding only
→ issue templates / PR template
→ no implied VCP CI
~~~

CI integration becomes a separate decision/state.

A future major version may rename/retire the field after legacy compatibility is removed.

---

## 10.4 Add CI inspection module — Phase 3

After the Stage-12 install-health safety floor, add the provider-neutral inspector.

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

### Stage 12 minimum

Make the hardcoded validate.yml expectation conditional on install.assetSet:

- legacy-full-v1 may still expect/report the historical managed workflow until migration;
- greenfield-safe-v1 / brownfield-minimal-v1 treat its absence as expected;
- project CI coverage is informational unknown/unassessed unless deterministically known.

### Phase 3

Replace the remaining one-path CI reporting with the provider-neutral inspector.

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

## 10.7 Phase E2 — Integrate CI only after vcp gate exists

`vcp gate --run` reuses project-approved verification commands, but those commands still require a project execution environment.

Do not confuse:

~~~text
CI environment/bootstrap
with
verification authority
~~~

The project (or an explicitly trusted supported profile) owns runtime/dependency/service setup. VCP owns the deterministic gate decision.

Preferred implementation order:

1. inspect existing CI provider/configuration;
2. identify a safe explicit integration point after the project's existing setup;
3. add/propose a minimal VCP gate step only when requested/compatible;
4. otherwise emit provider-specific snippet/instructions;
5. generate a standalone workflow only if deterministic capability/profile state plus explicit project policy proves every bootstrap prerequisite needed by the gate.

Never infer or synthesize arbitrary:

- package/dependency installation;
- Python/Go/Java/Node application runtime setup beyond VCP's own CLI runtime;
- databases/queues/caches/service containers;
- browsers/native/mobile SDKs;
- secrets or environment configuration;
- migration/seed/bootstrap commands.

Task-bound material work:

~~~text
<existing/project-approved setup>
vcp gate <explicit-task-slug> --run
~~~

PR/branch → Task Pack mapping is explicit repository/CI configuration unless a later separately designed deterministic selector is justified.

L0:

~~~text
<checkout with required refs>
vcp gate --level l0 --base <base> --head <head>
~~~

Shallow/missing refs cause a clear blocked result; do not guess a base.

Do not overwrite unrelated CI. Do not duplicate application verification commands in YAML. Environment/bootstrap configuration is separate from verification authority.

## 10.8 Definition of done

- fresh Python/Go/unsupported project never receives npm-specific VCP CI;
- existing workflows are untouched by init;
- Doctor detects CI through a provider-neutral inspector;
- includeGitHub no longer implies npm CI;
- old managed validate.yml has a deliberate migration path;
- generated/integrated future CI delegates to deterministic VCP gate rather than duplicating project logic;
- standalone generation occurs only with proven bootstrap/toolchain support;
- shallow/missing Git refs and unsupported environment prerequisites fail closed.

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

## 11.1A Do not overload workflowMode with enforcement

`workflowMode` is routing UX only.

A later CI/gate integration needs separate explicit lifecycle state, conceptually:

~~~text
gatePolicy:
  disabled
  advisory
  required
~~~

Do not make the exact field part of Phase 6 if Phase 8 enforcement is not shipping yet, but reserve the semantic boundary now.

Rules:

- Auto-compatible legacy normalization changes routing only;
- changing workflowMode never mutates gatePolicy;
- gatePolicy=required is never inferred from Auto;
- required enforcement is enabled only by an explicit project/CI integration step;
- persisted enforcement semantics raise minimumReaderVersion;
- Doctor/status report workflowMode and gate policy separately.

Manual + required is not an error, but it changes the practical merge workflow: the agent will not auto-route, while CI still requires explicit VCP evidence for covered changes. The enabling UX must make that consequence explicit.

Test matrix must include:

- auto + disabled;
- auto + advisory;
- auto + required;
- manual + disabled;
- manual + advisory;
- manual + required with clear block until explicit VCP preparation.

---

## 11.2 Recommended state location

For the initial mode implementation, store workflowMode in manifest install metadata.

Reasons:

- mode is an operational VCP setting;
- update apply can preserve the field through install-metadata spread;
- the release that makes workflowMode behavior-bearing must also raise minimumReaderVersion so an older same-schema CLI cannot silently rewrite mode-governed managed instructions;
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

## 11.3 Default and backward compatibility

workflowMode is a user preference, not an inferred repository capability.

When this feature ships:

- new installs default to auto unless the developer explicitly selects manual;
- Manual is an explicit user choice, for example --workflow-mode manual;
- manifests without workflowMode normalize to Auto-compatible behavior because current managed instructions already describe agent-first routing;
- normalization/defaulting affects routing instructions only;
- it must not instantly impose CI merge enforcement or mandatory gate integration;
- mechanical enforcement remains a separate explicit integration step;
- update dry-run must show any changed managed instruction content.

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

The current Task Pack + implementation-readiness contract is intentionally full-strength material-work machinery.

It covers Source of Truth, acceptance criteria, scope, boundaries, security/privacy, failure modes, observability, multiple test layers, rollout/recovery, implementation plan, verification, independent review, and finalization.

That is appropriate for L2 material work and too heavy for many ordinary engineering fixes.

The adaptive model therefore needs four workflow levels without weakening existing truth/readiness/review semantics.

## 12.2 Workflow levels are not execution modes

Workflow level and AFK/HITL answer different questions.

~~~text
workflowLevel
  L0/L1/L2/L3
  → how much durable engineering contract/gate ceremony applies

executionMode
  AFK/HITL
  → who may execute

dependency/readiness
  → whether the work is eligible at all
~~~

A small L1 task may still be HITL. A high-risk L3 task may have AFK implementation slices after all human decisions are resolved.

Preserve the existing Operating Model rule:

~~~text
dependencies first
then execution mode
~~~

## 12.3 Initial level architecture

### L0 — mechanically trivial

No durable Task Pack.

Use only for explicitly eligible low-risk changed surfaces.

**Default is not eligible.** The first release requires explicit selected-project L0 policy state before Core can authorize this lane.

Do not derive eligibility from an extension such as `.md`, `.txt`, or `.json` alone. Custom repositories may use any of those as governing contracts.

Policy model:

~~~text
explicit project trivial-surface allowlist
+ built-in VCP protected-surface deny rules
+ exact final Git diff
→ L0 pass or promote
~~~

The exact persisted surface (lifecycle metadata vs a later dedicated config) can be chosen in Phase 7, but it must be deterministic, inspectable, version-compatible, and must raise minimumReaderVersion if it changes lifecycle/gate semantics.

No configured policy → Core minimum is L1.

The final diff/gate remains authoritative. If protected/material surface appears, promote before completion.

### L1 — compact bounded engineering

Use a compact durable record rather than the full L2 Task Pack.

Minimum content:

~~~text
Status / Slug / Level
Outcome or defect
Governing authority state
Affected scope
Acceptance evidence
Verification
Lightweight review outcome / current findings
Risk/escalation flags
Completion/evidence summary
~~~

Do not add empty security/observability/rollout sections just to write "n/a."

L1 still preserves deterministic authority, verification, restartability, and fresh review.

Governing-authority state must be one of two valid cases:

~~~text
external-reference
→ one or more project/workspace governing references
→ validate with the existing Source-of-Truth authority helpers

bounded-task-local
→ no separate governing document applies
→ bounded defect/internal-maintenance intent is fully captured by task outcome + acceptance
→ no unresolved HUMAN DECISION
→ no material product/API/data/security/architecture/compatibility/migration/rollout decision
~~~

Do not model this as casual "explicit none." The parser/readiness engine must prove which valid authority case applies.

If a real governing document applies, reference it. If expected behavior or material policy cannot be established safely, promote to L2/L3 rather than manufacturing authority.

### L2 — current material-work contract

Keep the existing full Task Pack, plan/implementation readiness, verification, independent review, and finalization path as the baseline.

### L3 — L2 plus relevant high-risk controls

Add only controls relevant to the proven risk.

Important Stage 6 compatibility rule:

> L3 does not automatically inject security-profile documents into plan/implement Context Packs.

When the deterministic L3 classifier/project risk policy requires a security review, L3 requires a dedicated security Context Pack/review. The existing rule that only contextMode=security auto-loads security profiles remains authoritative.

Security-profile presence alone is not the trigger: the mandatory baseline profile exists whenever security mode is used. The deterministic L3 risk policy decides whether security review is required; active profiles then scope that review.

### Required Stage-7 extension: Git-bound security context

Current createContextPack rejects --base/--head outside review mode.

For gate-authoritative L3 security review, extend the existing git-review snapshot support to:

~~~text
contextMode=review
contextMode=security
~~~

with the same explicit base requirement, optional head default, selected-project/worktree confinement, diff bounds, and exact resolved SHAs.

Do **not** broaden Git comparison into plan/implement merely for convenience.

The security Context Pack then contains both:

- Stage-6 active security profile context;
- exact changed-surface evidence from git-review.mjs.

### Durable security review evidence

Add a distinct parser-visible Task Pack section only when L3 policy requires security review, for example:

~~~text
## Security review evidence

Reviewed-Base: <sha>
Reviewed-Head: <sha>
Profiles: baseline, multi-tenant, ...
...
~~~

Exact field/table syntax can differ.

Persist:

- exact reviewed base/head;
- active profile IDs and source/provenance identity;
- a deterministic resolved-security-guidance fingerprint covering the profile texts actually supplied to the review, with VCP package version for packaged fallback and project-relative identity for project overrides;
- severity;
- current-task disposition;
- concise evidence;
- resolution/follow-up;
- residual risk / unresolved HUMAN DECISION.

Do not use profile names alone as freshness identity. The mandatory `baseline` ID can remain the same across a package upgrade while the packaged guidance changes.

At gate time:

1. resolve the currently required active profile set under the current L3 policy;
2. recompute the same guidance fingerprint;
3. compare it with the security-review record;
4. stale/mismatched profile set or guidance fingerprint → fresh security review required.

The security-review prompt should emit data compatible with the gate's existing finding/disposition model rather than inventing an unrelated unparseable result shape. Severity remains security-specific metadata.

Ordinary independent review remains required separately.

Before finalization, all required L3 review kinds should cover the same final implementation head. A code/config change after either review invalidates that review; Task-record-only finalization may then move HEAD under the same semantic finalization exception already defined for gate.

Other L3 additions may include migration/recovery evidence, destructive-effect authorization, sensitive deployment/release boundaries, or stronger exact-head gates.

## 12.3A Task template/readiness compatibility

Current `renderTaskPack()` emits one full template and `readiness.mjs` directly checks those full-template headings.

Phase 7 must make both level-aware instead of adding a parallel L1 file type.

Canonical normalization:

~~~text
Task Pack has Workflow-Level: L1/L2/L3
→ use that contract

Task Pack has no Workflow-Level
→ legacy L2

L0
→ no Task Pack
~~~

Creation compatibility:

- keep the existing full renderer as the L2 template;
- add a compact L1 renderer using the same top-level identity/status conventions;
- model L3 as L2 plus bounded relevant-risk extensions rather than a wholly separate template;
- new manual `vcp task <slug>` with no level remains L2-compatible;
- Auto/router may pass an explicit classified level.

Suggested compact L1 durable shape:

~~~text
Status
Slug
Workflow-Level: L1

Outcome / defect
Governing authority state (references or task-local)
Scope
Acceptance criteria/evidence
Risk / escalation flags
Implementation approach
Verification commands
Independent review evidence
Finalization
Completion report
~~~

Readiness branches on normalized level while sharing helpers for Source-of-Truth authority, HUMAN DECISION detection, command authority, duplicate headings, acceptance state, review evidence, and finalization.

For L1, governing authority must normalize into one of:

~~~text
references([...])
task-local
missing
invalid
~~~

Rules:

- `missing` / `invalid` are readiness failures;
- references use the existing Source-of-Truth path/authority/freshness rules;
- `task-local` means the accepted L1 outcome + acceptance criteria are the applicable lower-tier task authority, consistent with the existing Source-of-Truth hierarchy;
- task-local is allowed only when no higher governing document applies, no HUMAN DECISION remains, and Core risk/protected-surface evidence does not require stronger authority;
- known governing/protected surfaces can invalidate task-local and require references/promotion;
- review must be able to challenge an incorrect task-local classification.

Do not make absent L2-only headings fail L1 readiness, but do not treat absent authority as a valid compact shortcut.

## 12.3B Promotion mechanics

Add one deterministic Task Pack level-expansion primitive rather than asking agents to copy/paste templates manually.

Required behavior:

- L0 → material lane: create one Task Pack at the promoted level before continuing;
- L1 → L2: preserve compact evidence, insert missing full-contract sections exactly once, set Workflow-Level=L2, then require full readiness;
- L1/L2 → L3: preserve task body and add only the specific required high-risk evidence sections/flags;
- promotion never deletes lower-level evidence;
- lower-level review/finalization evidence is not automatically sufficient after promotion;
- Core never auto-downgrades;
- explicit downgrade, if supported, is permitted only before material implementation/review/finalization state and only when deterministic minimum allows it;
- no promotion path uses task `--force` overwrite.

Promotion timing matters.

### Pre-implementation promotion

Expand the task, recompute readiness, and continue under the stronger level.

### Late promotion after implementation has begun

Do not manufacture historical compliance.

The promotion helper/state should make the escalation visible, for example with bounded task evidence such as:

~~~text
Workflow escalation:
  from: L1
  to: L2
  discovered: post-implementation | final-diff
  reason: public contract surface detected
~~~

Exact syntax may differ.

Required recovery:

1. move the task out of any final state;
2. expand to the stronger contract;
3. reconstruct requirements/scope/risks from current repository evidence without claiming that reconstruction predated the code;
4. resolve newly exposed HUMAN DECISION items;
5. run stronger readiness on the current task/state;
6. make corrective implementation changes if needed;
7. perform fresh stronger-level Git-bound review;
8. finalize and gate at the stronger level.

The gate may accept a correctly recovered current state, but reports the late escalation when material. It must never emit evidence implying the original implementation had a pre-code L2/L3 plan when it did not.

Parser/state tests must prove legacy no-level Task Packs remain L2 and promotion is idempotent/non-destructive.

---

## 12.4 Classification architecture

Use:

~~~text
agent/Skill semantic proposal
        +
Core deterministic minimum
        ↓
effective workflowLevel
~~~

Classification happens after repository inspection, not solely from the user's first sentence.

Core deterministic evidence may include:

- changed/planned paths;
- protected-path policy;
- migrations/data markers;
- public contracts/config;
- security-sensitive surfaces;
- installed capability/profile state;
- final Git diff.

Core may always promote.

After implementation, recompute the minimum from the actual final diff. A too-light lane fails with actionable promotion requirements.

Do not use fuzzy model confidence as Core authority.

## 12.5 Shared task-state parser

Do not create separate Markdown interpretations in task, readiness, context, review, and gate.

Extract one canonical parser/state model that can represent both:

- compact L1 records;
- current full L2/L3 Task Packs.

The parser should expose durable facts, not policy decisions that belong elsewhere.

Likely facts:

~~~text
slug
status
workflowLevel (absent legacy field normalizes to L2)
governing-authority state
acceptance state
verification declarations
review findings/dispositions
review base/head provenance when present
required review kinds
security-review findings/severity/dispositions + base/head/profile/guidance-fingerprint provenance when applicable
finalization state
completion evidence
~~~

L0 has no Task Pack and therefore bypasses this parser by design.

## 12.6 lib/task.mjs

Needs:

- explicit `Workflow-Level` metadata for new level-aware tasks;
- L1 compact renderer;
- current full renderer retained as L2;
- L3 extension hooks without cloning the whole template;
- deterministic same-file promotion/expansion helper;
- shared parser compatibility;
- omitted level remains L2-compatible.

Do not add VCP-Core ROI governance questions to consumer Task Packs.

## 12.7 lib/readiness.mjs

Keep current readiness as the L2 baseline.

Add level-aware policy:

~~~text
L0
→ no task readiness

L1
→ outcome/scope/acceptance/verification/explicit-governing-authority/
   unresolved-human-decision checks

L2
→ current plan + implementation readiness

L3
→ L2 + applicable high-risk readiness
~~~

Readiness must emit promotion diagnostics when a lower level is no longer sufficient.

Do not weaken current L2 checks to make L1 easier.

## 12.8 lib/context.mjs

Context construction must stay mode-specific and progressively disclosed.

Level affects which durable task material exists, but does not rewrite contextMode semantics.

Examples:

~~~text
L1 implement
→ compact task + governing refs + relevant files + verification

L3 security review
→ dedicated security context
→ active security profiles + relevant security Source of Truth
→ explicit Git base/head snapshot for gate-authoritative changed-surface evidence
~~~

Negative tests must prove irrelevant profile/plugin material remains absent.

For L1, progressive disclosure is achieved primarily through the compact task and bounded selected files/references. Reuse canonical mode-prompt behavior unless measurement proves a separate prompt is justified; do not fork policy casually.

## 12.9 lib/git-review.mjs

Reuse changed-file enumeration for:

- provisional/final workflow-level minimum;
- protected-surface detection;
- review context;
- exact changed-surface evidence.

Do not create a second Git parser for the gate.

## 12.10 lib/verify.mjs and future gate

Reuse the existing verification execution/provenance engine.

Gate adds orchestration over existing deterministic facts; it does not implement a second command runner.

Final gate must re-inspect Git state after verification and compare current state with the evidence it relies on.

## 12.11 Review contract

L0 may omit a durable independent-review artifact only when mechanical eligibility proves the change is truly trivial and unprotected.

L1 requires a compact fresh review outcome/current-findings record, but not a weaker review authority.

For gate-authoritative L1/L2/L3 review:

- use one canonical finding/disposition vocabulary;
- build review context from an explicit Git base and resolved implementation head;
- persist the exact reviewed base/head provenance required by the gate;
- a smaller L1 Task Pack/context reduces review cost, but stale/unbound review is never accepted as merge evidence;
- the existing review prompt may become level-aware; do not create a second low-trust reviewer contract merely to make L1 shorter.

L2/L3 retain the full existing independent-review evidence expectations.

Any material finding that expands product/security/data/architecture scope may force promotion.

## 12.12 Documentation impact

When workflow levels ship, update coherently:

- OPERATING-MODEL.md — workflowLevel vs executionMode/readiness;
- TASK-PACKS.md — L1 vs L2/L3 durable contract;
- TASK-READINESS.md — level-specific gates;
- CONTEXT-PACKS.md — level does not change contextMode/security-profile rules;
- AGENTS.md / Skills — routing only;
- README/CLI — user-visible workflow semantics.

Do not change current canonical docs ahead of implementation in a way that falsely claims released support.

## 12.13 Definition of done

- L0 remains mechanically narrow, policy-explicit, and disabled by default when no safe trivial-surface policy exists;
- common small engineering fixtures use compact L1 rather than full L2;
- L1 preserves applicable Source of Truth, verification, restartability, and fresh review;
- L2 current guarantees remain intact;
- L3 adds only applicable high-risk controls;
- security profiles still auto-load only in security Context Pack mode;
- workflowLevel remains orthogonal to AFK/HITL and readiness;
- final-diff classification catches risk/scope growth;
- all task-aware consumers use one parser/state interpretation;
- gate reuses verify/Git/readiness mechanics rather than duplicating them.

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

Do not scatter Markdown regexes across task/readiness/context/gate.

Suggested module:

~~~text
lib/task-state.mjs
~~~

It should normalize L1/L2/L3 durable artifacts into one internal state model.

Parse at least:

- status;
- slug;
- workflowLevel, normalized so absent legacy metadata = L2;
- normalized governing-authority state (references / task-local / missing / invalid);
- acceptance state;
- verification command declarations;
- review findings/dispositions;
- **review Git provenance**;
- level-appropriate finalization/completion state.

Readiness should progressively adopt the same parser.

L0 deliberately has no Task Pack and is represented by changed-surface input instead.

## 14.4 Minimal structured metadata is justified by enforcement

VCP previously avoided machine-readable task graph/state because prose was enough.

A deterministic gate is a legitimate reason for a **small** amount of structured task metadata.

Possible fields:

~~~text
Status: Review
Slug: accept-invite
Workflow-Level: L2
~~~

The exact review-provenance representation may be a bounded section rather than top-level fields, but it must deterministically retain at least the reviewed base/head identity or equivalent exact changed-surface identity.

Do not add dependency graph state merely because gate adds workflow/review metadata.

Do not introduce hidden external state that makes the Markdown artifact misleading.

## 14.5 Level-specific gate command contract

### L0

~~~text
vcp gate --level l0 --base <ref> [--head <ref>] [--json]
~~~

Initial L0 is intentionally **non-executing**.

Implementation:

1. resolve explicit base/head;
2. enumerate exact changed surface using existing Git helpers;
3. load/validate the explicit selected-project L0 policy;
4. if policy is absent, block/promote to L1;
5. apply project allowlist plus built-in protected-surface deny rules;
6. block if the worktree/ref state prevents a trustworthy comparison;
7. promote if executable project verification is required.

Do not add a second shell-command resolver for L0.

Policy tests must include a custom Markdown governing document to prove `.md` is not globally trivial, plus a configured non-governing documentation path that can pass.

### L1/L2/L3

~~~text
vcp gate <task>
vcp gate <task> --run
vcp gate <task> --json
~~~

Preview reports missing requirements without running commands.

--run reuses verify.mjs for task-approved commands.

The task's Workflow-Level selects the level contract; an optional CLI level override should not be allowed to downgrade below the task/Core-computed minimum.

## 14.6 Level-specific gate policy

### L1

Require:

- compact task readiness;
- explicit governing-authority state, with valid/current reference(s) or permitted task-local authority; missing/invalid state fails and Core evidence may invalidate task-local authority;
- acceptance evidence;
- no unresolved human blocker;
- successful required verification in run mode;
- compact fresh review outcome;
- review provenance;
- compact completion/final status.

### L2

Require current plan/implementation readiness, acceptance criteria, verification, independent review, and full finalization semantics.

### L3

Require L2 plus applicable high-risk checks. Where the L3 classifier/project risk policy requires dedicated security review, gate must prove:

- parser-visible security-review evidence exists;
- exact reviewed security head is current for the final implementation surface;
- ordinary independent review and required security review bind to the same final implementation head before finalization;
- no unresolved must-fix security finding or HUMAN DECISION/risk-acceptance boundary remains;
- active-profile provenance and resolved security-guidance fingerprint required by the review record are coherent/current.

Security review remains additional to ordinary L2 review.

The gate **validates** durable review/approval evidence. It does not call an LLM reviewer, accept risk, approve destructive actions, or decide product intent.

## 14.7 Review provenance and the finalization-head exception

Current VCP completion deliberately has two relevant heads:

~~~text
reviewed implementation head
        ↓
Task-Pack-only finalization edit
        ↓
finalization head
        ↓
exact-head executable rerun
~~~

A naive rule:

~~~text
reviewHead must equal current HEAD
~~~

would contradict the existing protocol.

Instead, gate needs durable review Git provenance and must allow reviewHead != current HEAD only when:

- the intervening Git diff is limited to the canonical task-record finalization artifact for this task;
- no implementation/config/other docs changed;
- finalization structure is valid;
- the final --run verification executes on the current finalization head.

The exception is semantic, not merely path-based.

Between the recorded reviewed implementation head and the final gate head, the task record may change only in parser-recognized evidence/finalization regions such as:

- independent-review findings/dispositions/resolution/follow-up/residual risk;
- Status transition;
- Finalization checklist;
- Completion report / accepted verification summary.

Changing requirements, Source-of-Truth references, acceptance criteria, scope, boundaries/invariants, security/data/API/migration requirements, verification command declarations, or the approved implementation plan invalidates the old review even if the only changed file is the Task Pack.

Gate should:

1. require the reviewed head to be an ancestor of current HEAD;
2. compute the exact reviewed-head → current-head diff;
3. reject any non-task-record path;
4. parse the task-record diff/section ranges and reject changes outside the allowed evidence/finalization regions;
5. require a fresh review if that semantic check fails.

This is the minimum deterministic state needed to make the existing finalization rule enforceable without creating a path-only bypass.

## 14.8A Git-bound gate authority

The first merge-authoritative gate requires local Git provenance even though it does not require GitHub.

Gate-eligible review flow:

~~~text
clean committed implementation head
→ vcp context <task> --mode review --base <base-ref> --head <implementation-head>
→ context resolves exact base/head SHAs
→ fresh reviewer evaluates that surface
→ durable review record stores the resolved reviewed head/base
~~~

Legacy review context without --base remains backward compatible for advisory review, but it is not sufficient gate evidence.

For final L1/L2/L3 --run authority:

- worktree must be clean before execution;
- current HEAD must equal the committed finalization head being gated;
- verification commands execute;
- post-run HEAD must be unchanged;
- post-run relevant worktree must remain clean before optional gate-report persistence.

If Git is unavailable or dirty state prevents exact provenance, return blocked/non-authoritative rather than pass.

L0 likewise requires explicit Git base/head and clean merge-authoritative state.

---

## 14.8 Verification evidence freshness

Saved evidence cannot simply be trusted forever.

For L1/L2/L3 run mode, gate must check/produce evidence equivalent to:

~~~text
task identity
run mode
readiness state
command outcomes
revision before execution
revision after execution
current dirty state
~~~

Because verify provenance is currently captured before commands run, gate must re-inspect Git after verification.

Saved verify evidence is useful for audit/handoff but is not final merge authority.

## 14.9 Evidence-output dirty-state issue

.vcp/.gitignore currently does not make retained .vcp/evidence automatically invisible to Git status.

Gate must not naively require pre-run dirty=false == post-run dirty=false when the gate/report itself writes a known evidence path.

Recommended initial implementation:

- run verification in-process;
- perform final Git inspection **before optional gate-report persistence**;
- CI relies on the process result/JSON stdout;
- do not silently redefine all retained evidence as ignored/ephemeral.

If later persistent gate evidence is added, model its own path/provenance explicitly.

## 14.10 Explicit result model

Human and JSON output should distinguish:

~~~text
pass
fail
blocked
not-applicable
~~~

and enumerate reasons.

Examples:

- fail — configured test command returned non-zero;
- blocked — unresolved HUMAN DECISION;
- blocked — L0 changed protected source file; promote to L1/L2;
- fail — review head stale because implementation changed after review;
- pass — review head differs only by canonical task finalization edit and current-head verification is green.

No magic score.

## 14.11 Definition of done

- task/readiness/gate share one state parser;
- L0 uses Git changed-surface logic only and cannot execute arbitrary commands;
- L1 compact task/review semantics are enforced;
- L2 current guarantees are preserved;
- L3 security/high-risk checks remain relevant and mode-correct;
- verify engine is reused;
- review provenance makes stale review mechanically detectable;
- reviewed-head/current-head difference is permitted only for parser-allowlisted review/finalization task-record changes;
- changing protected task contract sections after review invalidates that review even when the path is unchanged;
- merge-authoritative pass requires local Git, exact committed heads, and clean pre/post verification state;
- current HEAD/dirty state is inspected after executable work;
- gate never claims to perform AI review or HUMAN DECISION;
- JSON/human result contracts are stable;
- gate works locally without GitHub.

---

# 15. Workstream E2 dependency — CI should call gate, not recreate it

Once gate exists, generated CI becomes thin.

Preferred first implementation:

~~~text
task-bound material workflow
  → CI receives an explicit task slug from repository workflow/configuration
  → vcp gate <task> --run

mechanically trivial L0 workflow
  → CI supplies explicit base/head refs
  → vcp gate --level l0 --base <base> --head <head>
~~~

Do not invent an undefined generic `policy` gate mode in the first release.

Mapping a pull request/branch to one material Task Pack is repository/CI configuration unless a later separately designed deterministic task-selection contract is justified. The gate validates the task it is given; it does not scan prose and guess which task owns a change.

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
- all together;
- `--yes` with no explicit `--agent` and only one existing vendor adapter, proving omission remains unspecified;
- ignored/re-tracked brownfield marked integration.

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
- git-initialized but otherwise empty;
- one unfamiliar meaningful file;
- established;
- already VCP-managed;
- pre-Adaptive/schema-v1 managed install;
- schema-v2 manifest whose minimumReaderVersion is newer than the running CLI;
- readable managed install requiring recovery/health repair;
- nested selected project;
- dirty Git worktree;
- brownfield-minimal install with intentionally absent greenfield starter docs.

---

## 16.3 Public CLI testing matters

Many current tests call initProject directly, which is useful for unit coverage.

Adaptive adoption must also have public CLI tests because important behavior lives in:

- option parsing;
- help text;
- command-specific flag validation;
- interactive/non-interactive defaults.

For every important init behavior, include at least one real bin/vibe-coding-production.mjs test.

Mandatory public-CLI regressions include:

- brownfield `--yes` with omitted `--agent` preserves unspecified provenance;
- `--dry-run --json` on a brownfield ambiguity does not prompt and returns a structured unresolved decision;
- MANAGED/unreadable VCP state does not trigger agent/stack/GitHub adoption prompts;
- omitted GitHub preference remains distinct from explicit include/exclude;
- init `--force` is rejected while unrelated force flags retain their own contracts;
- unsupported/newer lifecycle reader state fails closed before mutation.

---

## 16.4 Golden negative fixtures

Required failure cases:

- malformed VCP section markers;
- duplicate marker blocks;
- conflicting agent-file integration;
- malformed/unreadable reserved `.vcp` lifecycle state;
- lifecycle schema/minimumReaderVersion newer than the running CLI;
- selected plugin with bad digest;
- capability profile with invalid, path-escaping, symlinked, content-leaking, or over-budget detector;
- symlinked evidence/config;
- conflicting duplicate verification-command authority;
- unsupported destructive verification proposal;
- stale verification at old HEAD;
- L0 with no explicit project trivial-surface policy;
- L0 against source/security/build state or a custom governing Markdown document;
- legacy Task Pack without Workflow-Level failing to normalize to L2;
- lower-level review/finalization evidence incorrectly surviving a required promotion;
- late promotion represented as though the stronger plan existed before implementation;
- ordinary review or required L3 security review bound to a stale/different implementation head;
- reviewed-head → final-head Task Pack-only diff that modifies protected requirement/acceptance/scope/verification sections;
- manual + required gate policy incorrectly auto-routing work or incorrectly bypassing the required gate.

Each failure must prove the relevant operation fails closed and, where mutation is in scope, performs no unsafe mutation.

---

## 16.5 Definition of done

The matrix is complete when release gates prove properties, not merely framework names:

- no unrelated deletion;
- no silent agent instruction overwrite;
- no silent CI overwrite;
- no command invention;
- selected-root isolation;
- safe unsupported fallback;
- lifecycle reader compatibility fails closed;
- brownfield explicit adapter intent and VCP-managed adapter provenance are reproducible without claiming observed-compatible project files;
- capability add/remove/sticky provenance is preserved;
- init plan/apply consistency;
- update after adoption remains safe;
- L0 cannot become globally permissive by extension/name heuristics;
- gate rejects stale/bypassed work and protected post-review task-contract mutation;
- required ordinary/security review provenance is exact and coherent;
- late workflow escalation remains historically truthful;
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


Stage 12 also needs:

- raw init-request parsing separate from post-inspection preference resolution;
- explicit presence/provenance bits for agent/GitHub (and any future behavior-bearing choice);
- no stdin prompts in `--json` machine mode;
- MANAGED/conflict short-circuit before interactive adoption questions.
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


CLI/init option work also needs to retain explicit-vs-unspecified agent provenance through repository inspection. Non-interactive `-y` may keep legacy generic behavior for NEW repositories, but must not pre-resolve EXISTING repositories to explicit generic before Smart Init planning.
---


## lib/template.mjs

Current responsibilities are too mixed:

- package asset walking;
- consumer asset choice;
- ownership policy;
- adapters;
- stack rendering.

Stage 12 needs an adoption-aware surface so brownfield planning does not blindly use all current CORE/GITHUB roots.

Desired-state construction must use the classified catalog plus persisted install.assetSet (or equivalent) so the next update reproduces the surface that was actually adopted.

"Unified catalog" must not mean "same installed paths":

- greenfield-safe may receive starter truth templates but not source-repository-only npm CI;
- brownfield-minimal must not receive those templates automatically;
- optional hygiene remains preference-driven;
- package-only assets never become consumer desired state.

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
- render brownfield-minimal standing instructions without hard-coded requirements to read VCP starter Product/Architecture/Security/Testing paths that were never installed;
- point the agent to explicit Task Pack Source-of-Truth references and the current bounded Context Pack instead;
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
- top-level minimumReaderVersion validation before lifecycle mutation;
- running CLI version lookup through the existing version helper;
- shared semantic-version comparison from a low-level utility rather than making state depend conceptually on migration policy;
- migration/normalization of v1 managed entries to ownership.kind=file;
- install assetSet validation/preservation;
- per-entry ownership validation;
- section-baseline support;
- generalized lifecycle backup metadata sourced from **pre-lock** prior VCP/manifest/baseline state;
- rollback that removes lifecycle state, adoption backup residue, and internal scaffolding that did not exist before initial adoption;
- lifecycle transaction reuse for Smart Init.

Do not leave section ownership as an unversioned optional v1 field.

Do not weaken current path/symlink protections.

Keep existing on-disk lock/transaction locations unless a separate migration is justified.

---

## lib/semver.mjs (or equivalent low-level helper)

Current semantic-version parsing/comparison lives in lib/migrations.mjs and is also consumed by update/report/plugin/release code.

minimumReaderVersion makes semantic-version comparison a manifest-reader primitive as well.

Prefer extracting the pure parse/compare functions into a dependency-light helper used by:

- state manifest reader compatibility;
- migrations;
- Doctor/update reporting;
- community plugin compatibility;
- release checks.

Do not make low-level manifest readability depend on migration-path construction merely to compare versions.

Regression tests for prerelease/build metadata ordering move with the helper.

---

## lib/update-plan.mjs

Needs:

- section ownership action planning;
- capability-set lifecycle comparison;
- install assetSet-aware desired surface;
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

- first-adoption-aware lock bootstrap metadata/cleanup before backup exists;
- reusable transaction/apply primitives for initial adoption;
- section-replacement actions;
- first-install backup semantics where no prior manifest exists;
- rollback-safe state cleanup;
- final manifest schema/ownership preservation;
- rollback result/reporting that distinguishes restored managed version from restored unmanaged state and verifies that claim before success.

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

- understand new desired-builder/capability/assetSet inputs;
- ignore section-owned paths without deleting/reformatting their file/block;
- re-track brownfield integration paths only from a valid marker boundary (or recreate a missing thin marked file);
- never infer whole-file ownership for a brownfield composed agent file merely because the prior managed entry was ignored;
- not reconstruct state only from legacy stack forever.

---

## lib/migrations.mjs

Needs next-release migration for:

- schema-v1 entries → explicit whole-file ownership;
- schema-v1 installs → legacy-full assetSet;
- later explicit asset removals/migrations;
- new install metadata defaults if required.

The previous released version → Stage 12 candidate path must be executable in release-check/lifecycle smoke.

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

- Stage 12 shared prompt resolver so packaged prompts count as available;
- Stage 12 install assetSet awareness so intentionally absent source-framework assets, greenfield starter docs, optional hygiene, and legacy validate.yml are not misdiagnosed;
- separation of VCP install health from project-governance coverage;
- shared verification-command authority resolver;
- capability reporting including detected/applied/provenance/mismatch/pending-transition state;
- workflow mode;
- Phase-3 provider-neutral CI inspection;
- removal of local framework validator requirement;
- new gate status where appropriate.

Preserve explicit coverage boundaries.

---



## lib/verification-commands.mjs

Stage 12 needs to evolve first-match AGENTS parsing into authority inspection.

Add a shared helper that can detect:

- missing slot;
- unique configured value;
- duplicate-equivalent values;
- duplicate-conflicting values;
- source/ownership of the effective value where needed.

Task creation and Doctor should use the same effective-command resolution.

Do not silently resolve conflicting duplicates by line order.

---

## lib/context.mjs

Needs:

- package prompt fallback;
- typed prompt provenance in structured output (`project-override` vs `packaged`), including package version for fallback;
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

`createContextPack()` should expose transported-context provenance separately from validated-plugin provenance; the rendered Context manifest contains only transported files.

---

## lib/community-plugins.mjs

Phase 2 needs a refactor that preserves v1 validation behavior while separating:

- full selected-plugin validation/inspection;
- mode-relevant context transport;
- plan-only v1 verification-proposal transport;
- structured validation summary from rendered bytes.

Phase 5 then adds strict schema-versioned v2 support rather than permissive v1 mutation.

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


Stage 13 prerequisite:

- read supported lifecycle/install.assetSet when the project is managed;
- use one assetSet-aware Source-of-Truth scaffold helper;
- brownfield-minimal renderer must not hardcode absent VCP starter paths;
- preserve current legacy/full behavior for compatibility until later migration.
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

Must change for Adaptive lifecycle migration, not only asset removal.

Replace copied consumer-validator execution with consumer-facing lifecycle checks and add:

- pre-update lifecycle snapshot/hash;
- old-reader fail-closed + no-mutation smoke;
- candidate rollback of the applied migration;
- exact prior schema/baseline restoration checks;
- old-reader readability after rollback;
- candidate re-apply/idempotence proof.

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

The Adaptive documents are umbrella design. Numbered implementation stages are bounded slices, and each validation checkpoint may simplify or stop later work.

## Precondition — reconcile merged Stage 11 closeout

PR #85 is merged and React Native runtime support is present on main.

The canonical Stage 11 implementation Task Pack was marked Done at merge even though the required post-finalization exact-head rerun remained unchecked. This consistency audit corrected its status to Review and found no durable record proving that historical run before merge.

Before Stage 12 product-code work:

1. record the Stage 11 closeout gap honestly;
2. perform and record an appropriate current-main re-baseline gate without claiming it is the missing historical run;
3. synchronize Roadmap/README/current source status;
4. create Stage 12 Task Pack from that reconciled baseline.

## Stage 12 — Safe Adoption Planning

Implement the minimum foundations for trustworthy **read-only brownfield init planning**:

1. centralized install/manifest metadata construction;
2. canonical project-override/package-fallback prompt resolver with typed source/package provenance;
3. lifecycle manifest schema-v2 file-vs-section ownership and schema-v1 migration;
4. minimumReaderVersion fail-closed semantics using the shared low-level semver comparator;
5. managed-section parsing/composition/baseline primitives;
6. VCP-state readability inspection plus NEW / EXISTING / MANAGED maturity classification;
7. reserved `.vcp` collision/recovery inspection;
8. brownfield stack-ambiguity inspection while retaining the current Stage-11-compatible stack API;
9. minimal brownfield adoption-surface planner;
10. persisted assetSet design: legacy-full vs greenfield-safe vs brownfield-minimal;
11. agent request provenance plus persisted explicit adapter intent / managed adapter surface;
12. tri-state GitHub request provenance;
13. shared verification-command authority inspection;
14. Doctor prompt-source / install-surface awareness required for the new valid brownfield shape;
15. deterministic content-free init action plan;
16. public `vcp init --dry-run [--json]`;
17. init-specific destructive force removal;
18. assetSet-aware Task Pack Source-of-Truth scaffold design for immediate post-adoption usability;
19. previous-release → schema-v2 lifecycle/release smoke, including old-reader fail-closed coverage.

The read-only boundary applies specifically to **unmanaged EXISTING repositories through vcp init**.

Already MANAGED schema-v1 repositories may be transactionally migrated to schema v2 by the normal vcp update path in the Stage-12 release. That migration remains subject to update preview/conflict/backup/rollback/idempotence. vcp init does not perform the managed migration; it redirects to update/status.

Runtime behavior:

~~~text
NEW
→ greenfield apply may remain structurally compatible
→ but uses the safe Adaptive greenfield asset surface
→ never installs the VCP source npm validation workflow

EXISTING
→ preview supported
→ brownfield init mutation blocked

MANAGED
→ init redirects to lifecycle status/update
→ normal vcp update may perform the Stage-12 schema migration

VCP_STATE_CONFLICT / MANAGED_RECOVERY_REQUIRED
→ no init mutation
→ explain upgrade/recovery/health blocker
~~~

Stage 12 exit criterion:

- same readable repository snapshot → same bounded init plan;
- brownfield preview performs zero project/durable VCP mutation;
- unsafe/ambiguous authority is visible as CONFLICT/decision rather than silently resolved;
- previous managed installs migrate only through the existing transactional update lifecycle.

## Stage 13 — Smart Init Apply

Mutation uses the same planner but always re-runs it under the lifecycle lock.

Sequence:

~~~text
first-adoption-aware lock
→ record whether lock bootstrap created temporary .vcp state
→ inspect VCP/repository state again
→ fresh plan
→ conflict/precondition check
→ pre-backup cleanup if blocked
→ complete recovery point
→ stage/apply
→ ownership-aware baselines + manifest
→ verify
→ clear transaction
~~~

Required details:

- apply never trusts a stale preview object;
- if lock bootstrap created `.vcp` and planning blocks before backup, release the lock and remove only the empty operation-created directory;
- unexpected content in that directory is preserved/reported, never recursively deleted;
- backup metadata records prior absence/presence of manifest, baselines, and VCP state;
- rollback restores prior absence as well as prior content;
- section composition preserves surrounding bytes;
- brownfield install persists brownfield-minimal assetSet, explicit adapter intent, and VCP-managed adapter ownership/provenance;
- Task Pack generation consumes the persisted assetSet before Smart Init is considered complete;
- update/manage/Doctor reproduce that adopted surface;
- repeated init reports MANAGED and does not rewrite;
- immediate subsequent `vcp update` is safe/idempotent;
- immediate `vcp task` on brownfield-minimal renders neutral real-project authority placeholders rather than absent canonical VCP starter paths.

### Checkpoint A — adoption safety and usability

Exercise representative mature repositories.

Measure:

- preview determinism;
- preview/fresh-plan agreement on unchanged snapshots;
- safe divergence/block after intervening changes;
- section and command-authority preservation;
- true rollback to unmanaged prior state;
- existing CI/docs preservation;
- asset surface/noise;
- setup questions and discoverable-question defects;
- path from install to productive work.

Do not continue into broad adaptation work if this is not safe and low-friction.

## Phase 2 — Consumer asset + standing-context reduction

After Checkpoint A:

1. unify one classified consumer asset catalog across greenfield/managed paths while preserving install-profile-specific selection;
2. migrate/remove legacy framework/reference assets;
3. finish standing AGENTS reduction;
4. finish Doctor source-validator/asset expectations;
5. remove copied source-framework validators;
6. rewrite release-check consumer smoke;
7. preserve local prompt/security-profile overrides and add package-fallback fixture coverage;
8. separate schema-v1 plugin validation from Context transport and add negative no-transport fixtures.

## Phase 3 — provider-neutral CI detection + legacy workflow migration

1. provider-neutral CI inspector;
2. Doctor CI/gate reporting with explicit coverage limits;
3. explicit lifecycle migration/detach of old legacy-managed validate.yml;
4. preserve GitHub hygiene as a separate surface;
5. keep generated CI deferred to Phase 8 after gate stabilization.

## Phase 4 — Capability foundation

1. deterministic capability records;
2. independent detectors;
3. legacy stack compatibility summary;
4. applied capability provenance;
5. Doctor/update/manage integration;
6. polyglot fixtures;
7. preserve Stage 11 React Native provenance through the bridge.

### Checkpoint B — adaptation + context cost

Do not continue if capability detection creates false certainty, command invention, or material context bloat.

## Phase 5 — Declarative profiles

1. normalized profile model;
2. strict versioned plugin schema;
3. bounded detector DSL;
4. first-party definitions;
5. explicit community grants;
6. re-express already-merged React Native through capability/profile provenance;
7. extend the Phase-2 validation/transport separation to v2 detector/capability contributions.

## Phase 6 — Workflow mode + minimal router UX

1. persist workflowMode;
2. explicit --workflow-mode and post-install change;
3. mode-aware thin standing sections/adapters;
4. one thin primary router Skill shared by Auto/Manual;
5. Doctor visibility;
6. prompt-eval changes only where new observable behavior requires them.

The router is best-effort UX. It is not deterministic enforcement.

## Phase 7 — Workflow levels + gate

1. shared task-state parser;
2. L0 changed-surface contract;
3. compact L1 task/readiness/review contract;
4. current L2 Task Pack/readiness contract;
5. L3 relevant high-risk extensions with dedicated security mode where applicable;
6. provisional classification after inspection;
7. gate preview/run reusing readiness/verify/Git;
8. final-diff minimum-level reclassification;
9. post-run Git freshness check.

### Checkpoint C — ceremony vs prevented failure

Dogfood L0/L1/L2/L3 and Auto/Manual routing.

Do not wire mandatory CI enforcement while local classification/gate behavior is noisy.

## Phase 8 — CI gate integration

Phase 8 owns explicit gatePolicy persistence/configuration and provider integration.

Prefer a thin gate invocation after project-owned CI setup. Generate a standalone workflow only when every required bootstrap/toolchain prerequisite is deterministically supported and explicitly accepted.

Do not repurpose workflowMode, invent project environment setup, guess task ownership/base refs, or duplicate application verification commands.

## Phase 9 — Skill UX expansion

After the router/Core contracts stabilize:

1. discovery/grill;
2. review/retro;
3. progressive references;
4. cross-agent packaging;
5. behavior-eval coverage.

### Checkpoint D — invisible UX

Users should understand decisions/evidence without needing to operate VCP internals manually.

### Checkpoint E — model/tool capability audit

Before final conformance/release hardening, explicitly ask what standing instructions, Skills, orchestration, or Core state can now be removed because current agents/platforms reliably own that work.

Apply any justified simplification/deprecation first so final hardening validates the surface we actually intend to ship.

## Phase 10 — Conformance/release hardening

Run full compatibility, negative, migration, package, and documentation-claim audits against the post-audit final surface.

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

## 20.10 "Treat Stage 11 React Native as still pending or throw it away"

Stage 11 React Native is already merged current behavior.

The capability model must migrate/re-express its requested-stack provenance, selected-root detection, specialization, verification, and mobile safety boundaries rather than pretending the implementation does not exist.

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


## 20.21 "Do not persist the brownfield asset surface"

If Smart Init skips legacy framework assets but lifecycle state does not remember that choice, the next update will try to add them.

Persist install-surface identity; do not fake it with ignoredFiles.

## 20.22 "Insert VCP verification slots even when AGENTS already has them"

This can create duplicate/conflicting first-match command authority.

Inspect all occurrences and block ambiguity before composition.

## 20.23 "Package prompt fallback can wait until Doctor cleanup"

A brownfield project using valid packaged prompts would immediately receive a misleading Doctor warning.

Context and Doctor must share the prompt resolver when fallback ships.

## 20.24 "Single-stack precedence is enough evidence for brownfield project intent"

Current detectStack precedence is a compatibility mechanism, not proof that a mixed established root has one intended stack.

Surface material ambiguity until the capability model exists.

## 20.25 "Schema v2 means every future field is safe"

False. A Stage-12 schema-v2 reader can still be too old to understand later behavior-bearing fields.

Use minimumReaderVersion (or the equivalent final contract) so same-schema older CLIs fail closed before mutation. Preserving unknown JSON is not the same as understanding its semantics.

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

Stage 12 preview result:

- no files are written;
- existing instruction/CI content is preserved in the plan;
- command authority is unambiguous or explicitly blocked;
- optional GitHub hygiene is skipped unless requested;
- only the brownfield-minimal asset surface is proposed.

Stage 13 apply result on an unchanged snapshot:

- a fresh plan is recomputed under lock;
- user instruction text survives outside one VCP-owned section;
- existing CI remains untouched;
- lifecycle state records section ownership and brownfield-minimal assetSet;
- next VCP update stays on that adopted surface.

If the repository changes after preview, fresh apply may differ or block safely.

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

Only a documentation typo inside an explicitly configured trivial-surface allowlist changes; a custom governing Markdown document is outside that allowlist.

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
- L3 plan/implement context remains bounded and does not silently inherit security profiles;
- the authentication change receives a separate Git-bound security-mode Context Pack/review when the deterministic L3 risk policy requires it;
- only relevant recovery/high-risk material enters the appropriate workflow surface;
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
