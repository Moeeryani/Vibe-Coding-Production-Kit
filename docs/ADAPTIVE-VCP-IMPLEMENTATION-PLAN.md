# Adaptive VCP — Implementation Plan

**Status:** Proposed execution plan  
**Purpose:** Make VCP safe, adaptive, low-friction, and useful across new and existing repositories without weakening its deterministic control-plane philosophy.  
**Scope:** Smart initialization, project adaptation, capability detection, profile extensibility, CI integration, operating modes, Skills UX, mechanical enforcement, and conformance testing.

**Technical companion:** `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md` is the code-level dependency and integration authority for this plan. When implementation sequencing or a concrete integration detail is more specific there, this strategic plan follows that analysis.

---

## 1. Executive decision summary

This document records the agreed direction for the next major VCP evolution.

The goal is **not** to turn VCP into an embedded LLM runtime, a universal framework detector, or a generic multi-agent platform.

The goal is:

> **VCP should be the deterministic control plane underneath AI coding workflows, while Skills/adapters provide the conversational UX and orchestration experience.**

The intended architecture is:

```text
┌──────────────────────────────────────────────┐
│ EXPERIENCE LAYER                             │
│                                              │
│ Auto mode                                    │
│ Manual mode                                  │
│ Cross-agent Skills / slash commands          │
│ Discovery / plan / implement / review / retro│
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ VCP CORE                                     │
│                                              │
│ Source of Truth                              │
│ Task Packs                                   │
│ readiness gates                              │
│ bounded context                              │
│ deterministic verification                   │
│ evidence + provenance                        │
│ architecture / policy checks                 │
│ safe lifecycle updates                       │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│ ADAPTATION LAYER                             │
│                                              │
│ smart init                                   │
│ repository discovery                         │
│ capability detection                         │
│ composable profiles                          │
│ CI integration                               │
│ agent adapters                               │
│ declarative plugins                          │
└──────────────────────────────────────────────┘
```

### 1.1 Agreed decisions

The following decisions are considered accepted for this plan:

1. **Do not add a separate `vcp adopt` command.**  
   `vcp init` must detect whether a repository is new, existing, or already VCP-managed and behave safely for that state.

2. **Remove destructive `--force` semantics from initialization.**  
   Initial adoption must never use “overwrite everything” as the escape hatch.

3. **Separate VCP framework/reference assets from project-owned VCP artifacts.**  
   A target repository should receive only the files needed to operate VCP, not the full internal VCP documentation tree.

4. **Evolve from one-stack classification to composable project capabilities.**  
   Projects are often polyglot and multi-tool; VCP should model what is proven rather than force a single stack identity.

5. **Extend profiles/plugins declaratively and safely.**  
   Profiles may contribute detection rules, bounded guidance, and verification proposals without arbitrary executable plugin code.

6. **Make CI/project automation project-aware.**  
   VCP must inspect existing CI and project verification instead of installing VCP's own npm-centric workflow into arbitrary repositories.

7. **Add Auto and Manual operating modes.**  
   Auto mode routes meaningful work through VCP automatically. Manual mode exposes VCP through explicit Skills/commands such as `/vcp` or equivalent agent UX.

8. **Use Skills as the UX/orchestration layer, not as the replacement for VCP core.**  
   Skills may be portable across agents. Portability is therefore not a reason by itself to prefer VCP. VCP earns its existence through deterministic state, gates, verification, evidence, lifecycle safety, and executable controls.

9. **Do not run the maximum VCP workflow for every change.**  
   Auto mode must classify work into workflow levels so trivial changes remain lightweight.

10. **If VCP says an agent “must” use the workflow, back that requirement with mechanical enforcement where feasible.**  
    Instruction text alone is not a guarantee.

11. **Create a cross-project compatibility/conformance matrix.**  
    The success target is universal safe adoption and graceful fallback, not magical perfect detection of every ecosystem.

---

## 2. Product principle: what belongs in VCP and what belongs in Skills

This boundary should guide all future feature decisions.

### 2.1 VCP Core owns deterministic engineering controls

VCP Core should own things whose answer should not depend on model creativity or conversational memory:

- authoritative repository state;
- accepted vs draft vs superseded Source of Truth;
- Task Pack structure and durable task evidence;
- readiness checks;
- approved verification commands;
- command execution and exit-code evidence;
- exact revision / dirty-worktree provenance;
- bounded Context Pack construction;
- lifecycle state and migrations;
- baseline snapshots and safe updates;
- three-way merge/conflict behavior;
- security/profile selection state;
- architecture fitness checks;
- release evidence;
- plugin trust/digest/capability validation;
- future deterministic dependency eligibility, if dogfood later justifies it.

### 2.2 Skills own conversational and reasoning UX

Skills should own behavior that is mainly about how the agent interacts with the developer:

- “grill me” / discovery conversation;
- brainstorming and clarification;
- asking grouped human-decision questions;
- producing an implementation plan from VCP context;
- implementation narration;
- reviewer interaction;
- PR wording;
- retrospective conversation;
- routing among VCP commands;
- user-friendly summaries of deterministic VCP results.

### 2.3 Decision test for every new feature

Before adding a future feature, ask:

```text
Does correctness require deterministic state, executable proof,
or lifecycle enforcement?

YES → VCP Core

NO; primarily agent reasoning / conversation / orchestration?
→ Skill / UX layer
```

### 2.4 Why this boundary matters

VCP already carries significant framework complexity. That complexity is justified only when it buys controls that a good Markdown Skill cannot reliably provide by itself.

A Skill can say:

> “Run tests before claiming success.”

VCP can execute the commands, record exit codes, bind evidence to a revision, and fail a gate when evidence is missing.

A Skill can say:

> “Do not overwrite project decisions.”

VCP can compare baseline/local/target state and return `MERGE`, `PRESERVE`, or `CONFLICT`.

That deterministic difference is the reason VCP should continue to exist.

### 2.5 Definition of done

This boundary is implemented correctly when:

- each user-facing workflow has a clear owner: Skill vs VCP Core;
- no major deterministic rule exists only as prose in a Skill when it can be mechanically checked;
- no major conversational UX requires duplicating large VCP Core policies inside Skills;
- Skills can be replaced or updated without changing durable repository truth;
- VCP Core can still provide meaningful value even if all conversational Skills are temporarily unavailable.

---


# 2A. Product experience invariants

These are cross-cutting product constraints. They are not optional polish and they apply to every workstream below.

The redesign succeeds only if VCP becomes **safer internally while feeling simpler externally**.

## 2A.1 Invisible-by-default UX

### Current risk

VCP exposes many useful primitives:

- task creation;
- readiness;
- Context Packs;
- verification;
- Doctor;
- lifecycle updates;
- profiles;
- future gate behavior.

If normal developers must learn and manually sequence those primitives, VCP becomes a framework they operate rather than infrastructure that helps them.

That would put VCP at a disadvantage against lightweight Skills even if the underlying guarantees are stronger.

### Principle

> **A developer should not need to learn VCP in order to benefit from VCP.**

In Auto mode, the normal developer experience should be:

~~~text
vcp init .

then:

"Build feature X."
~~~

The agent/Skill layer should invoke VCP Core operations internally.

Commands such as:

~~~text
vcp task
vcp ready
vcp context
vcp verify
vcp gate
~~~

remain important for:

- agents;
- advanced users;
- debugging;
- CI;
- Manual mode;
- explicit inspection.

They should not be required knowledge for normal Auto-mode product work.

### Required behavior

- Auto mode routes meaningful work through VCP without requiring command memorization.
- Human-facing responses emphasize decisions, evidence, blockers, and outcomes rather than internal VCP mechanics.
- Internal VCP state remains inspectable for users who want it.
- Error states explain what is blocked and why without forcing users to understand lifecycle internals first.

### What to avoid

Do not make VCP usage resemble:

~~~text
learn VCP
→ understand Task Packs
→ understand Context Packs
→ understand readiness
→ understand Doctor
→ understand profiles
→ then start building
~~~

The safe path should also be the easiest path.

### Definition of done

- a new Auto-mode user can complete a representative L2 feature without manually sequencing VCP CLI commands;
- the same workflow remains inspectable through CLI/JSON for advanced users and CI;
- onboarding documentation can explain the normal experience before explaining internals;
- usability testing shows users can benefit from VCP without first understanding its internal vocabulary.

---

## 2A.2 Human-attention budget

### Current risk

Structured frameworks can save implementation mistakes while still becoming expensive in human interruptions.

VCP already distinguishes:

~~~text
DISCOVERABLE
PROPOSABLE
HUMAN DECISION
~~~

That distinction should become a product contract, not merely prompt advice.

### Principle

> **Human attention is a constrained resource. VCP should interrupt the developer only when the answer materially requires human intent, policy, risk acceptance, or another non-discoverable decision.**

### Required behavior

For every uncertainty:

~~~text
DISCOVERABLE
→ inspect repository / durable project state
→ resolve without interrupting the developer

PROPOSABLE
→ propose a bounded default/recommendation where policy allows
→ explain relevant tradeoff
→ do not silently convert proposal into approval

HUMAN DECISION
→ ask the developer
~~~

Questions should be grouped by decision boundary instead of drip-fed one at a time.

Do not ask the developer to manually provide information already available in:

- repository files;
- package/build configuration;
- Source of Truth;
- accepted Task Packs;
- existing VCP state;
- Git/CI evidence.

### Human-decision examples

Human input is appropriate for:

- intended product behavior;
- risk acceptance;
- destructive migration policy;
- security posture;
- compatibility policy;
- architecture direction when multiple valid choices remain;
- data ownership;
- rollout decisions with business impact.

### Measurement

Dogfood/release validation should track, where practical:

- number of human interruptions per representative workflow;
- number of questions later found to have been discoverable;
- repeated questions that should have become project truth or deterministic discovery;
- developer overrides of agent proposals.

### Definition of done

- prompt/Skill evaluation contains explicit checks that discoverable questions are not asked;
- human decisions are grouped where possible;
- Auto mode does not request confirmation for deterministic actions already authorized by project policy;
- repeated unnecessary questions are treated as system defects and drive Context/Source-of-Truth improvements.

---

## 2A.3 Progressive disclosure and context discipline

### Current risk

Installing more profiles, Skills, prompts, architecture guidance, or project documentation can make every agent turn larger and less focused if VCP loads information merely because it exists.

That increases token cost and can reduce model performance.

### Principle

> **Nothing should be loaded merely because it exists. Load information because the current workflow requires it.**

### Required loading model

~~~text
minimal always-on project integration
        ↓
workflow-level guidance
        ↓
task-specific Context Pack
        ↓
risk/profile-specific material
        ↓
deeper references only when demanded by the task
~~~

Workflow levels should influence context:

~~~text
L0
→ minimal relevant project rules

L2
→ normal task + Source of Truth + architecture + affected files

L3
→ L2 plus relevant security / migration / recovery / high-risk guidance
~~~

Skills should follow the same principle:

- small discoverable metadata;
- load the Skill only when relevant;
- load deep references only when needed;
- do not duplicate all VCP policy in every Skill.

### Definition of done

- Context Pack manifests prove why each included source is present;
- irrelevant security/profile/framework guidance is absent from low-risk contexts;
- installed but unused Skills/profiles do not automatically inflate every context;
- token/context budgets remain bounded and testable;
- prompt/package fallback does not become an excuse to inject all packaged references.

---

## 2A.4 Validation checkpoints between implementation phases

### Current risk

A long roadmap can become self-justifying: Phase N gets built because Phase N exists, even if dogfood shows the earlier design is too heavy or modern coding agents already solve the problem adequately.

### Principle

> **Do not continue the roadmap merely because the next phase is planned. Each major layer must prove value before deeper machinery is added.**

Each checkpoint can result in:

~~~text
GO
→ evidence supports continuing

SIMPLIFY
→ reduce/alter the design before continuing

STOP / DEFER
→ do not build the next machinery yet
~~~

Required checkpoints are defined in the sequencing section below.

### Definition of done

- each checkpoint has explicit evidence requirements;
- a failed checkpoint can change or halt later phases without being treated as schedule failure;
- dogfood results are recorded durably rather than left in chat;
- roadmap decisions cite observed friction/benefit, not only architectural preference.

---

## 2A.5 Complexity ROI rule

### Current risk

VCP already contains substantial deterministic machinery.

That machinery is justified only when it provides stronger guarantees or removes more user complexity than it adds.

### Principle

> **A VCP Core feature must justify its deterministic complexity. If the agent, a Skill, or an existing project tool can solve the problem reliably enough, Core should not own it.**

Before adding a meaningful new Core command/module/state field, answer:

~~~text
What failure does this prevent?

How often and how severely does that failure matter?

Can a modern coding agent already solve it reliably?

Can a Skill solve it?

Can existing project tooling solve it?

Why does this require deterministic VCP machinery?

What complexity does it add:
- files?
- CLI?
- persistent state?
- lifecycle migrations?
- context?
- maintenance?
- human attention?

What complexity does it remove from the user?
~~~

Decision rule:

~~~text
deterministic value clearly exceeds framework tax
→ Core candidate

primarily conversational/orchestration value
→ Skill

already solved adequately elsewhere
→ integrate / document / do not build
~~~

### Definition of done

- significant Core Task Packs include an explicit Core-justification section;
- code review can reject Core expansion whose deterministic value is unclear;
- features that become unnecessary as models improve can move out of Core;
- VCP's user-facing complexity does not grow automatically with internal capability count.

# 3. Workstream A — Smart `vcp init` for new, existing, and managed repositories

## 3.1 Current situation

Today `vcp init`:

- builds a desired VCP file set;
- detects path collisions;
- refuses collisions unless `--force` is supplied;
- writes the desired files;
- creates `.vcp/manifest.json` and baselines.

If a user supplies `--force`, an existing file can be replaced during initial setup.

This is notably less sophisticated than the existing `vcp update` engine, which already understands:

- baselines;
- ownership policies;
- three-way merge;
- preserve semantics;
- conflict blocking;
- backups;
- rollback;
- transactional updates.

## 3.2 Problem

The first five minutes of adoption are currently less safe than later lifecycle updates.

Examples:

- an established repository may already have `AGENTS.md`;
- a Claude project may have a substantial `CLAUDE.md`;
- a Copilot project may already have custom instructions;
- CI workflows may already exist;
- project documentation may use different paths;
- VCP's desired files may collide with project-owned material.

A user should not have to choose between:

```text
abort installation
or
--force and overwrite
```

That contradicts VCP's core preservation philosophy.

## 3.3 Target behavior

The user always runs:

```bash
vcp init .
```

VCP determines repository state:

```text
                 vcp init .
                      │
                      ▼
              inspect repository
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
       NEW         EXISTING      MANAGED
       REPO         REPO          VCP
         │            │            │
         ▼            ▼            ▼
     scaffold      integrate     redirect to
     cleanly       safely        update/status
```

### New repository

A directory is considered effectively new when no meaningful project artifacts exist beyond ignorable setup files.

Behavior:

- create the normal VCP project assets;
- generate the selected agent adapters;
- establish lifecycle state;
- configure only commands supported by evidence;
- leave unresolved values explicit.

### Existing repository

Behavior:

- inspect existing repository artifacts;
- never overwrite project files blindly;
- merge or compose where semantics are known;
- preserve project-owned content;
- report unresolved conflicts;
- generate a detailed dry-run/adoption plan;
- ask the human only when semantics cannot be established safely.

### Already VCP-managed repository

If `.vcp/manifest.json` exists:

- `vcp init` must not mutate the project;
- report installed version/profile/mode;
- direct lifecycle work to `vcp update`;
- optionally provide a concise status summary.


## 3.4 Remove destructive `--force` from init

Destructive initialization `--force` should be removed **from the init contract only**.

The current CLI parser also uses force-style overwrite semantics for other commands such as generated task/context/evidence outputs. Those command-specific overwrite controls remain valid and must not be removed globally.

Preferred init behavior for collisions:

```text
Can VCP safely compose or adopt?
├─ yes → COMPOSE / ADOPT / NOOP
└─ no  → CONFLICT
         explain exact path/reason
         make no destructive change
```

If a user truly wants to replace a project-owned file, that should be an explicit manual repository change followed by a new init preview.

Do not retain a generic init escape hatch that turns adoption into overwrite.


## 3.5 Existing agent-file integration requires section-aware ownership

### Existing `AGENTS.md`

Do not replace it.

A simple "append VCP and baseline the whole resulting file" design is **not safe across later updates**. If VCP snapshots the combined user+VCP file as a whole-file baseline, a future desired VCP-only `AGENTS.md` can cause the update engine to replace user-owned text.

Therefore existing instruction files must use **managed-section ownership**.

Recommended form:

```markdown
existing project-owned instructions

<!-- VCP:BEGIN -->
... VCP-owned integration block ...
<!-- VCP:END -->

more project-owned instructions
```

For an adopted existing file:

- VCP owns only the marked section;
- surrounding user content remains project-owned;
- the lifecycle baseline represents the VCP-owned section, not the whole file;
- updates may replace/merge only the VCP section;
- missing, duplicate, nested, or malformed markers fail safely.

For a new repository where `AGENTS.md` does not exist, VCP may continue to own the complete file.

This means ownership is not determined by path alone. The manifest/update planner must be able to distinguish whole-file ownership from section ownership.

### Existing `CLAUDE.md`

Preserve all existing content.

Add only the smallest required VCP integration, normally a marked block containing `@AGENTS.md` or equivalent thin routing guidance.

If the reference already exists, return `NOOP`.

### Existing Copilot instructions

Use the same additive managed-section strategy.

Do not replace existing organization/project guidance and do not duplicate conflicting repository rules.

### Codex / Cursor

Continue using repository `AGENTS.md` directly where supported.

### Verification-command compatibility

Current verification command parsing reads configured slots from `AGENTS.md`.

Initial smart-adoption work should preserve that contract inside the VCP-owned integration content. Moving verification configuration to a new structured source would be a separate migration and should not be bundled into safe init.

## 3.6 Smart init planning model

Reuse concepts from the update planner instead of inventing a second unsafe path.

An init plan should classify each desired action as:

- `ADD`
- `ADOPT`
- `COMPOSE`
- `PRESERVE`
- `CONFLICT`
- `NOOP`
- `SKIP`

`init --dry-run --json` should expose these without file contents.

No filesystem mutation is allowed when any blocking conflict exists unless the plan explicitly supports independent safe actions and the product chooses atomic all-or-nothing semantics. Prefer atomicity for the initial implementation.

## 3.7 Repository classification rules

Do not classify “existing” from a single arbitrary file.

Use a conservative repository-evidence function such as:

- Git metadata present;
- source files present;
- package/build manifests present;
- existing documentation;
- CI files;
- agent instruction files;
- more than a small number of non-ignorable files.

The exact heuristic must be tested cross-platform.

Classification should affect UX, not trust. Even a repository classified “new” still uses collision/path safety rules.


## 3.8 Definition of done

Smart init is complete when all of these are true:

- `vcp init .` works for both empty and established repositories;
- destructive init `--force` is no longer accepted, while unrelated command-specific overwrite controls still work;
- existing `AGENTS.md`, `CLAUDE.md`, Copilot instructions, and CI are never silently replaced;
- adopted instruction files use explicit section ownership rather than whole-file ownership;
- dry-run accurately predicts all init mutations;
- init conflicts result in zero destructive project changes;
- a successful init creates lifecycle state describing what VCP actually owns;
- a **subsequent VCP update** changes only VCP-owned sections and preserves surrounding user text;
- malformed/missing managed markers fail safely;
- rerunning `vcp init` on a managed project performs no lifecycle rewrite and directs the user to update/status;
- rollback/recovery is available if init becomes transactional;
- documentation contains no path telling users to "use --force after review."

# 4. Workstream B — Separate framework assets from project assets

## 4.1 Current situation

The current template root includes:

```text
AGENTS.md
docs/
prompts/
examples/feature-spec.example.md
scripts/...
```

Using the entire `docs/` directory means installation can copy VCP's own framework documentation into target repositories, including material such as:

- VCP roadmap;
- CLI documentation;
- update internals;
- release documents;
- implementation task history;
- framework-level design documents.

## 4.2 Problem

This causes:

- repository noise;
- path collisions;
- confusion between project truth and VCP framework docs;
- larger managed-file lifecycle surface;
- more update churn;
- harder adoption into mature repositories;
- unnecessary context available to agents.

A target repository should not look like a clone of the VCP development repository.

## 4.3 Target structure

Separate package-owned reference assets from project-owned operational assets.

Example:

```text
npm package / installed VCP runtime
└── reference/
    ├── operating-model.md
    ├── task-contract.md
    ├── context-contract.md
    └── prompts/

target project
├── AGENTS.md
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── security/
│   ├── testing/
│   ├── delivery/
│   └── tasks/
└── .vcp/
    ├── manifest.json
    ├── baselines/
    └── runtime evidence...
```

Project-facing docs should exist only when they are part of durable project truth or project workflow.


## 4.4 Implementation approach

Replace broad template roots such as `docs` and `prompts` with an explicit consumer asset manifest.

Before removing project-local prompt copies, first add a **canonical prompt resolver**.

Required precedence:

```text
project prompt override exists
        ↓
use project override

otherwise
        ↓
use packaged canonical VCP prompt
```

Packaged identity should be explicit in context/evidence, for example `vcp:prompts/02-plan-task.md`.

This should follow the same general pattern already used by packaged security-profile fallback.

After prompt fallback exists, the consumer asset set can become explicit and small:

```text
AGENTS integration
project product truth
project architecture truth
project security declaration/threat model
project testing strategy
Definition of Ready / Done
project task support
optional issue / PR hygiene
VCP lifecycle state
```

VCP's own roadmap, release history, source-validation scripts, framework task history, evaluations, and canonical reference documentation remain package/source assets rather than consumer project assets.

Do not copy `scripts/validate-framework.*` into arbitrary projects. Those scripts validate the VCP source/package, not a universal application.


## 4.5 Migration for existing VCP projects

Do not simply make old managed assets disappear from the desired set.

The current update planner intentionally treats an unexpectedly disappeared managed file as a conflict. Use explicit lifecycle migrations.

Migration rules:

- unmodified VCP-only framework docs/scripts may be removed;
- locally modified former framework files are detached/preserved;
- project-owned docs remain tracked according to policy;
- release/task history created by the project is never confused with VCP framework history;
- unmodified old prompt copies may be removed so packaged fallback becomes active;
- locally modified old prompts remain as project overrides.

There is also a release-automation dependency:

Current `release-check` lifecycle smoke validates an updated consumer by executing that consumer's copied `scripts/validate-framework.mjs`.

When consumer installs stop receiving that file, release-check must switch to public consumer contracts such as:

```text
previous CLI init
→ candidate update preview/apply
→ Doctor
→ idempotent update preview
→ expected consumer surface checks
→ later, canonical vcp gate where appropriate
```

Source/package validation still runs separately inside the VCP repository.


## 4.6 Definition of done

- fresh init no longer installs the full VCP framework docs tree;
- target repositories contain only project-relevant VCP artifacts;
- `vcp context` works even when no project-local canonical prompt copy exists;
- explicit project prompt overrides still work and are identifiable;
- customized legacy prompts survive upgrade as overrides;
- consumer projects no longer receive VCP's source-framework validator;
- Doctor no longer requires copied framework scripts/prompts when packaged equivalents are valid;
- release-check consumer lifecycle smoke no longer depends on copied `validate-framework`;
- explicit migrations prevent unexplained disappeared-file conflicts;
- package tests explicitly assert both package surface and consumer-install surface.

# 5. Workstream C — Replace single-stack identity with composable capabilities

## 5.1 Current situation

Current stack detection is effectively exclusive:

```text
Go marker        → go
Python marker    → python
tsconfig.json    → typescript
package.json     → javascript
otherwise        → generic
```

The install manifest stores a resolved stack/profile.

This works for simple repositories but loses information for polyglot or layered projects.

## 5.2 Problem

Real projects may be:

```text
TypeScript frontend
+
Go backend
+
Postgres
+
Playwright
+
Docker
+
Terraform
```

A single value such as `go` or `typescript` cannot describe the project.

It also creates awkward future specialization logic such as concrete-to-concrete profile transitions.

## 5.3 Target model

Introduce a capability set.

Example:

```json
{
  "capabilities": {
    "language": ["typescript", "go"],
    "runtime": ["node"],
    "framework": ["react"],
    "testing": ["vitest", "playwright"],
    "packageManager": ["pnpm"],
    "ci": ["github-actions"],
    "deployment": ["docker"]
  }
}
```

Do not require every category.

Each capability should include provenance:

```json
{
  "id": "language.typescript",
  "source": "tsconfig.json",
  "confidence": "proven",
  "detector": "core.typescript.v1"
}
```

Avoid fuzzy model-generated confidence. In v1, prefer deterministic states:

- `proven`
- `configured`
- `proposed`
- `unknown`

## 5.4 Detection should be compositional

Instead of:

```text
detect one stack
```

use:

```text
inspect repository
      ↓
run deterministic detectors
      ↓
collect proven capabilities
      ↓
resolve conflicts / precedence
      ↓
compose guidance + verification discovery
```

Multiple non-conflicting capabilities can coexist.

## 5.5 Project-root semantics remain important

Do not turn capability detection into unrestricted recursive repository scanning.

Continue using the selected VCP project root.

For monorepos:

- root VCP project may intentionally describe root-wide capabilities;
- nested VCP project may describe a package/app;
- explicit workspace references may govern shared authority;
- sibling packages must not silently affect a selected package's capability set.


## 5.6 Backward compatibility and migration bridge

Do not replace the current stack contract in one step.

Introduce capabilities alongside the existing stack summary.

During the transition preserve:

```text
install.stack
install.requestedStack
```

and add explicit capability detection/applied-state provenance.

The direction is:

```text
bounded deterministic detectors
        ↓
composable capability set
        ↓
legacy compatibility stack summary
        ↓
existing lifecycle/reporting contracts remain readable
```

All manifest writers must preserve the new fields:

- init/buildManifest;
- update apply;
- migration transforms;
- manage ignore/track;
- rollback/restore paths.

Prefer centralizing install metadata construction rather than continuing to append lifecycle fields after `buildManifest`.

Simple JS/TS/Python/Go projects should retain equivalent current behavior during the transition.

Polyglot repositories should no longer lose evidence merely because old detector precedence finds one language first.

### React Native / Stage 11

Do not first implement React Native as another exclusive concrete stack and then immediately migrate it to capabilities.

Reconcile the pending Stage 11 work with the capability model first.

A React Native project is better represented compositionally, for example:

```text
runtime.node
language.typescript
framework.react-native
mobile.react-native-app
```

while preserving the existing selected-project-root and explicit-evidence constraints.

## 5.7 Verification discovery from capabilities

Commands should be assembled from proven project evidence.

Example:

```text
language.typescript
packageManager.pnpm
testing.vitest
testing.playwright

→ install: pnpm install --frozen-lockfile
→ unit tests: existing package.json test script
→ e2e: existing package.json test:e2e script
```

Do not synthesize commands merely because a framework is detected.

Repository-owned scripts/configuration remain stronger evidence than profile defaults.

## 5.8 Definition of done

- a polyglot fixture can expose multiple capabilities without losing information;
- capability detection is deterministic and provenance-bearing;
- unsupported technologies do not cause false configuration;
- generic fallback still works;
- existing simple JS/TS/Python/Go behavior remains compatible;
- Doctor reports detected capabilities separately from project-approved configuration;
- no capability detector silently broadens the selected project root.

---

# 6. Workstream D — Declarative first-party and community profiles

## 6.1 Current situation

Community plugins are intentionally safe and narrow:

- local;
- text-only;
- digest-pinned;
- no executable code;
- guidance and verification proposals only.

This is a strong trust foundation.

However, community profiles cannot yet fully participate in capability detection or richer project adaptation.

## 6.2 Problem

VCP cannot scale first-party support for every framework/ecosystem centrally.

But allowing arbitrary executable plugins would weaken:

- determinism;
- inspectability;
- security;
- reproducibility.


## 6.3 Target

Expand the declarative profile model without weakening the existing strict v1 community-plugin contract.

Do **not** make the current v1 manifest permissive.

Use explicit schema dispatch:

```text
schemaVersion 1
→ current guidance + verification-proposal contract unchanged

schemaVersion 2
→ may add bounded declarative detection/capability contributions
```

A v2 profile may eventually declare:

- deterministic evidence markers;
- capability IDs contributed when required evidence matches;
- bounded guidance files;
- verification proposals;
- compatibility range.

Example conceptual v2 contribution:

```json
{
  "schemaVersion": 2,
  "id": "profile.rust",
  "capabilities": ["guidance", "verification-proposals", "capability-detection"],
  "detect": {
    "all": [
      { "fileExists": "Cargo.toml" }
    ]
  },
  "contributes": [
    "language.rust",
    "build.cargo"
  ]
}
```

Important:

- proposed commands are not automatically approved merely because the profile exists;
- a detector contribution from a **community** profile requires explicit project selection and an explicit capability grant;
- the plugin can contribute evidence to the normalized capability model, but cannot make itself authoritative.

## 6.4 Trust model

Preserve current invariants:

- schema v1 behavior remains exactly backward-compatible;
- plugin cannot grant itself capabilities;
- community capability detection requires an explicit project grant such as `capability-detection`;
- unknown fields fail within each schema version;
- bundle is digest-pinned;
- no executable hook;
- no network fetch during normal operation;
- no arbitrary filesystem access;
- profile cannot override core readiness/security/lifecycle rules;
- project explicitly selects community profiles;
- first-party profiles are versioned with VCP itself;
- invalid/tampered/incompatible selected profile state blocks lifecycle mutation rather than silently disappearing.

## 6.5 Detection DSL constraints

If a declarative detection DSL is introduced, keep it intentionally small.

Possible predicates:

- file exists;
- directory exists;
- JSON field equals/contains;
- package dependency exists;
- text file contains exact marker;
- lockfile exists.

Avoid:

- arbitrary regex over huge repositories unless bounded;
- shell execution;
- user-supplied JavaScript;
- network checks;
- probabilistic LLM classification.


## 6.6 Definition of done

- existing schema-v1 community plugins continue to load unchanged;
- schema v2 is strict rather than a permissive extension of v1;
- a new ecosystem profile can be added without arbitrary executable plugin code;
- detector DSL evaluation remains deterministic and selected-project-root bounded;
- community detection contributions require explicit selection/digest/grant;
- first-party and community profile data normalize into the same deterministic capability-composition layer while retaining different trust provenance;
- profile-proposed commands remain proposals until project adoption;
- tampered/incompatible profile state fails before lifecycle mutation;
- community profile support cannot weaken core VCP invariants.

# 7. Workstream E — Project-aware CI integration

## 7.1 Current situation

Current GitHub asset installation groups issue/PR hygiene together with `.github/workflows/validate.yml`.

Doctor also treats that exact workflow path as the CI-validation signal.

This couples VCP's source-repository npm workflow to arbitrary consumer projects.

## 7.2 Phase E1 — remove the unsafe assumption first

Before generating any new VCP CI:

1. stop installing the hard-coded npm validation workflow into arbitrary fresh consumers;
2. split GitHub issue/PR scaffolding from CI integration;
3. inspect and preserve existing CI;
4. make Doctor report CI provider/configuration evidence rather than one filename;
5. migrate old managed `validate.yml` deliberately.

Do not wait for full Auto mode to stop the harmful behavior.

## 7.3 Preserve `includeGitHub` compatibility

Existing manifests and lifecycle code already store `install.includeGitHub`.

During the transition, keep that field readable and narrow its meaning to GitHub repository hygiene/scaffolding such as issue and PR templates.

CI integration becomes separate state/policy.

A future major version may rename the historical field after migration compatibility is no longer needed.

## 7.4 CI inspection

Add one provider-neutral CI inspection layer.

Initial evidence can identify:

- GitHub Actions;
- GitLab CI;
- CircleCI;
- Azure Pipelines;
- unknown/custom CI indicators;
- no known CI.

Presence is not proof of semantic coverage.

Doctor should distinguish:

```text
CI provider/config detected
VCP gate integration detected/not detected/unknown
project verification coverage unassessed unless deterministically proven
```

Unknown custom CI is not automatically an error.

## 7.5 Migration of the old VCP workflow

When the old managed `.github/workflows/validate.yml` leaves the desired consumer set, remove it only through an explicit lifecycle migration.

Existing update semantics should decide:

- unmodified VCP workflow → removable;
- locally modified workflow → detach/preserve;
- unrelated workflows → untouched.

The update dry-run must make this visible.

## 7.6 Phase E2 — generate CI only after `vcp gate` exists

Once the mechanical gate exists, VCP may optionally create a thin provider-specific integration:

```text
CI
 ↓
install/use VCP
 ↓
vcp gate ... --run
 ↓
exit code
```

Do not maintain one command list in Task Packs and another independently in generated YAML.

The gate should remain the deterministic enforcement contract; CI is only an execution surface.

Branch protection remains platform/repository policy. VCP may report a check but must not claim control of merge policy it does not own.

## 7.7 Definition of done

- fresh Python/Go/unsupported projects never receive npm-specific VCP CI;
- existing CI is untouched by init;
- Doctor detects CI through a provider-neutral inspector;
- `includeGitHub` no longer implies npm CI;
- old managed `validate.yml` has an explicit migration path;
- no generated VCP CI is introduced before the gate contract exists;
- later generated CI delegates to deterministic VCP gate rather than duplicating project verification logic.

# 8. Workstream F — Auto mode and Manual mode

## 8.1 Goal

Different teams want different levels of workflow ceremony.

VCP should support both:

### Auto mode

The developer states intent normally.

The agent is expected to choose and execute the appropriate VCP workflow automatically.

### Manual mode

The coding agent behaves normally unless the developer explicitly invokes VCP through a Skill/command.

Examples:

```text
/vcp add organization invitations
/vcp review this change
/vcp retro
```

Exact syntax depends on agent capability; VCP should not hard-code one vendor's command syntax.


## 8.2 Store operating mode as project state

Persist the operating mode in VCP lifecycle state.

For the initial implementation, manifest install metadata is sufficient:

```json
{
  "install": {
    "workflowMode": "auto"
  }
}
```

Use an explicit CLI name such as:

```text
--workflow-mode auto
--workflow-mode manual
```

Do **not** reuse `--mode`; that flag already means Context Pack mode (`plan`, `implement`, `review`, etc.).

Also provide a post-install command so changing mode does not require rerunning init.

Mode changes must update only VCP-owned instruction sections/files and preserve project-owned surrounding content.

For old manifests without `workflowMode`, preserve historical behavior deterministically—currently closest to Auto routing—without automatically enabling new merge/CI enforcement until that enforcement is explicitly configured.

## 8.3 Auto-mode agent instruction

Auto-mode adapters should communicate the policy concisely:

> For meaningful repository changes, route work through the VCP workflow appropriate to the change. Do not bypass deterministic readiness, authority, verification, or review gates. Use the lightest workflow level that safely fits the change.

Avoid embedding the full VCP manual in `AGENTS.md`.

## 8.4 Manual-mode instruction

Manual mode should be lightweight:

> VCP is available in this repository. Use the VCP workflow when the developer explicitly requests it or invokes the installed VCP Skill/command.


## 8.5 Auto mode must not mean maximum ceremony

Workflow levels require VCP Core support, not prompt labels alone.

Current Task Pack/readiness behavior is closest to a full L2 workflow, so the first implementation should be staged.

### L0 — trivial

Use only for mechanically eligible surfaces such as bounded non-governing documentation/comment/format-only changes.

Eligibility must come from changed-surface policy, not merely an agent assertion.

Protected paths automatically reject L0, including source/application logic, migrations, security policy, lifecycle/configuration, CI/build/release files, dependency manifests/lockfiles, and agent instructions.

### L2 — material product/behavior change

Keep the existing Task Pack + readiness + bounded context + verification + review path as the main material-work workflow.

Avoid rewriting a proven system unnecessarily.

### L3 — high-risk change

Extend L2 with stronger required controls based on deterministic/project-declared evidence such as:

- active security profiles;
- migration/data impact;
- protected surfaces;
- explicit workflow policy;
- human-selected risk requirements.

Potential requirements include security review context, rollback/recovery evidence, and stricter exact-head gating.

### L1 — bounded engineering

Do not rush a separate compact task schema before dogfood proves what minimal durable state is actually required.

Introduce L1 after L0/L2/L3 behavior demonstrates the missing middle and its enforceable contract is clear.


## 8.6 Classification

Classification should be a hybrid of deterministic facts and explicit human/project policy.

Deterministic inputs may include:

- changed paths;
- project capability/profile state;
- migration/data markers;
- task declarations;
- protected-path policy;
- Git diff characteristics.

Human intent remains necessary for decisions such as accepted risk, architecture direction, compatibility policy, destructive migration approval, and product behavior.

An agent may recommend a level, but VCP must independently reject a level whose mechanical eligibility rules are not satisfied.

## 8.7 Definition of done

- project mode is persisted and inspectable;
- mode can be changed deliberately without reinstalling VCP;
- Auto mode requires no user knowledge of VCP CLI for normal work;
- Manual mode does not hijack ordinary coding requests;
- trivial changes do not trigger full PRD/task ceremony;
- material/high-risk changes cannot use the L0 path;
- mode behavior is agent-agnostic.

---

# 9. Workstream G — Cross-agent Skills as the UX layer

## 9.1 Current situation

VCP already contains prompts for discovery, planning, implementation, review, and security.

They describe strong behavior, but invoking the workflow can still feel like operating a CLI/framework.

Modern agent environments can install portable Skills across multiple coding agents.

Therefore portability alone is not a reason to prefer VCP over Skills.

## 9.2 Target

Ship thin Skills that make VCP pleasant to use.

Potential user surfaces:

```text
/vcp
/vcp-discover
/vcp-plan
/vcp-implement
/vcp-review
/vcp-retro
```

Prefer a small number of user-facing entry points.

A single `/vcp` router may be the best default:

```text
/vcp add team billing
      ↓
inspect durable VCP state
      ↓
route to discovery / planning / implementation / review
```

## 9.3 Skills must remain thin

Do not duplicate the whole VCP operating model in each Skill.

A Skill should approximately:

1. inspect VCP project state;
2. read `AGENTS.md` / canonical VCP guidance;
3. run the correct VCP commands;
4. use generated Context Packs;
5. present deterministic results clearly;
6. ask the developer only for true human decisions.

Bad:

```text
SKILL.md contains another complete copy of VCP policy.
```

Good:

```text
Skill routes the agent into VCP Core and consumes VCP outputs.
```

## 9.4 Grill/discovery

VCP already conceptually includes:

```text
Clarification / Grill
```

and `prompts/01-discovery.md` already performs much of this function.

Turn it into a user-friendly Skill surface.

The discovery Skill should:

- inspect before asking;
- distinguish DISCOVERABLE / PROPOSABLE / HUMAN DECISION;
- group blocking questions;
- challenge assumptions;
- expose conflicts;
- preserve negative decisions;
- recommend experiments only when they reduce material uncertainty.

## 9.5 Retro

A future retro Skill should analyze durable evidence from completed work and propose control-plane improvements.

Examples:

```text
Repeated import-boundary defect
→ candidate fitness rule

Repeated missing verification command
→ improve capability/profile discovery

Repeated discoverable question
→ improve Source of Truth or Context Pack composition

Repeated human correction of same default
→ stop treating it as PROPOSABLE; require explicit decision
```

The Skill proposes improvements; deterministic VCP Core changes remain normal code/config changes.

## 9.6 Definition of done

- at least the primary supported agents can install/use equivalent VCP Skills;
- the Skills contain little duplicated policy;
- switching agents does not change repository truth;
- Manual mode can be operated entirely through explicit Skill invocation;
- Auto mode can use the same Skills internally without requiring users to invoke them;
- discovery/grill behavior is clearly available through UX, not hidden only in documentation.

---


# 10. Workstream H — Mechanical enforcement for Auto mode

## 10.1 Problem

An instruction such as "the agent must use VCP" is still only prose.

The repository already has much of the deterministic machinery needed for a real gate, but those facts are not yet joined into one completion decision.

## 10.2 Reuse existing deterministic components

`vcp gate` should aggregate rather than replace:

- `readiness.mjs` for Task Pack structural readiness;
- `verify.mjs` for approved command execution/results;
- verification Git provenance for selected-project/current revision facts;
- `git-review.mjs` for bounded changed-surface/base/head review;
- Task Pack finalization/review evidence.

Do not create a second verification engine.

## 10.3 Add a canonical Task Pack state parser

Current finalization/review requirements are mostly prose contracts.

Before gate grows, add one shared canonical parser for at least:

- top-level task status;
- workflow level if present;
- acceptance-criteria check state;
- independent review rows/dispositions;
- finalization checklist;
- completion-report presence;
- verification-command declarations.

Readiness and gate should progressively share that parser so they cannot disagree about the same Task Pack.

## 10.4 Gate requirements

For a material L2/L3 task, gate may require:

- project is VCP-managed;
- required Task Pack exists;
- plan/implementation readiness is satisfied;
- acceptance criteria are complete;
- no unresolved current-task must-fix review finding remains;
- required verification actually ran successfully;
- finalization state is structurally complete;
- current Git revision still corresponds to the accepted executable/review state;
- any L3-specific security/recovery requirements are satisfied.

Gate output should enumerate explicit pass/fail/block reasons rather than emit a magic score.

## 10.5 Evidence freshness must be current-state aware

Do not trust an old JSON evidence file solely because it once passed.

Verification provenance is captured before command execution, and writing retained evidence can itself affect worktree state.

Therefore final gate must re-inspect current Git state after executable work.

The preferred first implementation is:

```text
vcp gate --run
   ↓
reuse verification engine
   ↓
perform required review/finalization checks
   ↓
reinspect current HEAD + dirty state
   ↓
return final gate result
```

Saved verification evidence remains useful for audit/handoff, but it is not by itself merge authorization.

## 10.6 Local and CI enforcement

The same deterministic gate must work locally and in CI.

Later CI integration should call the gate rather than recreate its logic.

Branch protection/pre-push integrations remain explicit repository policy.

## 10.7 Definition of done

- gate reuses readiness and verification machinery;
- stale old-head evidence cannot pass;
- post-run current Git state is inspected;
- unresolved must-fix review evidence cannot pass material work;
- incomplete finalization cannot pass L2/L3;
- L0 cannot be used for mechanically protected surfaces;
- human and JSON output expose exact failed requirements;
- the gate works without GitHub;
- CI can invoke the same gate contract.

# 11. Workstream I — Compatibility and conformance matrix

## 11.1 Goal

Do not claim “works on every project” based only on framework unit tests.

Prove adoption properties across deliberately difficult repository shapes.

## 11.2 Required fixture matrix

At minimum:

### Repository maturity

- empty/new repository;
- small existing repository;
- large established repository;
- already VCP-managed repository.

### Languages / ecosystems

- TypeScript;
- JavaScript;
- Python;
- Go;
- unsupported Rust;
- unsupported Java/Maven or Gradle;
- custom/unknown build system.

### Project shape

- single-package;
- monorepo;
- nested selected project;
- polyglot root;
- project with shared workspace Source of Truth.

### Agent files

- no agent files;
- existing `AGENTS.md`;
- existing `CLAUDE.md`;
- existing Copilot instructions;
- all of the above with local custom text.

### CI

- no CI;
- existing GitHub Actions;
- multiple GitHub workflows;
- unknown/custom CI;
- CI with commands that differ from VCP defaults.

### Repository complexity

- symlinks;
- dirty worktree;
- pre-existing docs paths;
- unusual line endings;
- case-sensitive/case-insensitive filename scenarios;
- malformed manifests/config files;
- missing tools.

## 11.3 Success properties

The matrix should assert properties, not marketing claims.

For every fixture:

- no unrelated file is deleted;
- no existing agent instruction is silently overwritten;
- no unproven verification command is executed;
- init dry-run matches actual apply;
- unsupported ecosystem degrades safely;
- discovered capabilities are evidence-backed;
- project-root boundaries remain intact;
- existing CI is preserved;
- lifecycle state is restartable;
- update after init is idempotent;
- rollback/recovery behavior is correct where applicable.

## 11.4 Golden failure tests

Some fixtures should intentionally fail.

Examples:

- ambiguous agent-file composition;
- conflicting VCP/user block;
- invalid plugin digest;
- unsafe symlink;
- unsupported destructive command proposal;
- malformed existing CI where VCP cannot safely integrate.

Expected result:

```text
clear failure
+
no unsafe mutation
+
actionable remediation
```

## 11.5 Definition of done

- conformance fixtures run in automated tests;
- each supported adoption invariant has at least one negative test;
- release criteria require the matrix to remain green;
- documentation claims match exactly what the matrix proves.

---


# 12. Workstream J — Reduce framework tax and enforce Complexity ROI

## 12.1 Current concern

VCP has accumulated sophisticated machinery:

- lifecycle manifests;
- baselines;
- migrations;
- Task Packs;
- Context Packs;
- Doctor;
- verification evidence;
- security profiles;
- architecture fitness;
- prompt evaluation;
- plugins;
- release checks.

This is justified only if the machinery gives users stronger guarantees than a good portable Skill, modern coding agent, or existing project tooling.

## 12.2 Required Core-justification record

For any substantial new VCP Core feature, its Task Pack/design must include:

~~~text
## Why this belongs in VCP Core

Failure prevented:
...

Observed frequency / severity:
...

Why the coding agent alone is insufficient:
...

Why a Skill alone is insufficient:
...

Why existing project tooling is insufficient:
...

Deterministic requirement:
...

New persistent state:
...

Migration/lifecycle burden:
...

User-visible complexity added:
...

User-visible complexity removed:
...

Evidence we will collect after dogfood:
...
~~~

This is not required for tiny refactors that do not expand product behavior.

## 12.3 Candidate responsibilities to move toward Skills

Likely Skill-owned over time:

- interactive discovery;
- explanation-heavy planning UX;
- PR description generation;
- retro conversation;
- implementation narration;
- routing/explanation around VCP commands.

Likely VCP-owned:

- readiness;
- authority;
- verification;
- evidence;
- lifecycle;
- path safety;
- merge/update behavior;
- architecture/security gates;
- current-revision enforcement.

## 12.4 Removal/deprecation is allowed

Framework tax is not one-way.

If future models make a Core behavior reliably unnecessary, VCP should be willing to:

- stop managing it;
- migrate it into Skills;
- integrate with existing ecosystem tooling;
- deprecate commands/state that no longer earn their cost.

Backward-compatible migration still applies.

## 12.5 Definition of done

- architecture docs describe the Core-vs-Skill boundary clearly;
- no duplicated "second VCP" lives inside Skills;
- new Core expansions include Complexity ROI justification;
- install/context/user surfaces become smaller or remain bounded as VCP grows internally;
- validation checkpoints can defer or remove planned Core features when evidence does not support them.


# 13. Sequencing and validation checkpoints

The code-level dependency review determines the safest implementation order. The product-experience invariants above determine whether VCP is allowed to continue to the next layer.

## Phase 0 — enabling refactors

1. centralize manifest install-field construction;
2. introduce prompt resolution while preserving current behavior;
3. add section-ownership primitives and lifecycle tests;
4. begin shared Task Pack parsing where required.

**Exit criterion:** later adoption/asset/gate work can reuse lifecycle-safe primitives instead of temporary hacks.

## Phase 1 — smart adoption safety

1. repository inspection;
2. init planning;
3. remove destructive init force behavior;
4. section-aware AGENTS/CLAUDE/Copilot adoption;
5. conflict-safe/transactional apply;
6. managed-project init redirect/status;
7. prove a subsequent update preserves user-owned text.

## Phase 2 — consumer asset separation

1. packaged canonical prompt fallback;
2. Doctor prompt-source changes;
3. explicit consumer asset manifest;
4. remove copied framework validator/source docs;
5. rewrite release-check consumer lifecycle validation;
6. explicit lifecycle removals/detaches;
7. preserve customized legacy prompts as overrides.

### Validation Checkpoint A — Is adoption actually easier?

Run the new adoption flow against a deliberately varied set of real or representative repositories.

Collect at least:

- files added/changed/removed;
- collisions/conflicts;
- existing instruction/CI preservation;
- developer questions asked;
- questions later classified as discoverable;
- manual remediation required;
- repository noise added;
- steps from install to first productive feature.

**GO:** adoption is safe and materially simpler than the current experience.

**SIMPLIFY:** users need to understand too much VCP, too many files are added, or avoidable questions remain.

**STOP/DEFER:** do not proceed into broader adaptation machinery while first-use trust is poor.

## Phase 3 — CI safety/detection only

1. stop hard-coded npm workflow installation;
2. split CI from GitHub issue/PR hygiene;
3. provider-neutral CI inspection;
4. Doctor reporting;
5. migrate old managed \`validate.yml\`.

## Phase 4 — capability foundation

1. deterministic capability records;
2. independent built-in detectors;
3. legacy stack compatibility summary;
4. capability-aware guidance/command discovery;
5. manifest applied-capability provenance;
6. Doctor/update/manage integration;
7. polyglot regression fixtures.

### Validation Checkpoint B — Is adaptation accurate and low-friction?

Measure:

- correct capability detections;
- false positive detections;
- unresolved unknowns;
- commands proposed vs commands actually accepted;
- human corrections required;
- unsupported-project fallback quality;
- context size changes caused by adaptation.

**GO:** VCP improves project understanding without pretending certainty or increasing setup burden materially.

**SIMPLIFY:** reduce detectors/profiles/context if false positives or context inflation are significant.

**STOP/DEFER:** do not add broader profile machinery if the capability foundation itself is not trustworthy.

## Phase 5 — declarative profiles

1. normalized profile model;
2. strict schema-versioned community profile extension;
3. bounded detector DSL;
4. first-party definitions;
5. explicit community grants;
6. reconcile React Native Stage 11 with capabilities.

## Phase 6 — workflow mode

1. persist \`workflowMode\`;
2. add \`--workflow-mode\`;
3. add post-install mode change;
4. mode-aware VCP sections/adapters;
5. Doctor visibility;
6. behavior/prompt-eval regressions.

## Phase 7 — mechanical gate and first workflow levels

1. shared Task Pack state parser;
2. gate preview;
3. gate run using verification engine;
4. post-run Git freshness check;
5. mechanically bounded L0;
6. existing L2 gate;
7. L3 high-risk additions.

### Validation Checkpoint C — Does Auto/gate help more than it interrupts?

Dogfood representative L0/L2/L3 changes.

Measure:

- workflow-level routing accuracy;
- false high-risk classification;
- unsafe false-trivial classification;
- human interruptions per task;
- redundant/discoverable questions;
- gate false positives;
- real defects/stale evidence/bypasses caught;
- manual overrides/bypasses attempted;
- average context size by level.

**GO:** users receive stronger guarantees with low ceremony and low false-positive friction.

**SIMPLIFY:** relax classification/gate requirements that do not prevent meaningful failures.

**STOP/DEFER:** do not wire mandatory CI enforcement if the local gate is noisy or frequently bypassed.

## Phase 8 — CI gate integration

1. optional thin provider-specific VCP gate workflow;
2. detection of existing equivalent integration;
3. keep project verification authority in VCP/task state.

## Phase 9 — Skills UX

Skills may prototype earlier, but release against stable Core contracts.

1. package canonical Skills;
2. route to deterministic VCP commands;
3. reuse prompt-eval observable behavior;
4. keep Skills thin and replaceable;
5. enforce progressive disclosure in Skill/reference loading.

### Validation Checkpoint D — Is VCP complexity actually hidden?

Test Auto and Manual workflows with users who have not studied VCP internals.

Measure:

- CLI commands users needed to know;
- VCP-specific vocabulary required before productive work;
- manual recovery frequency;
- questions asked;
- time/steps to complete representative work;
- whether users can explain blockers from the human-facing response without reading framework docs.

**GO:** the normal experience feels like "build X" / explicit "/vcp X", while Core remains inspectable underneath.

**SIMPLIFY:** reduce exposed terminology/commands and move explanation into Skills.

**STOP/DEFER:** do not add more public Core surface merely to expose internal sophistication.

## Phase 10 — conformance/release hardening

1. full compatibility matrix;
2. negative/golden failure cases;
3. migration/update/rollback fixtures;
4. package/release surface checks;
5. documentation claim audit;
6. preserve checkpoint metrics as release/dogfood evidence where practical.

**Exit criterion:** public claims match tested adoption, lifecycle behavior, and usability evidence.

# 14. Non-goals

This plan does **not** require:

- embedding an LLM provider inside VCP;
- turning VCP into a multi-agent scheduler now;
- implementing arbitrary executable plugins;
- perfectly detecting every framework;
- automatically deciding human product intent;
- replacing existing CI wholesale;
- recursively scanning monorepos to infer project boundaries;
- forcing full workflow ceremony on trivial changes;
- making agent prompts the authoritative source of engineering truth.

---

# 15. Product success criteria

The redesign succeeds when the following user stories are true.

### Existing project

A developer can run:

```bash
vcp init .
```

inside a five-year-old repository and receive a safe plan that:

- preserves current agent instructions;
- preserves CI;
- detects what it can prove;
- identifies unknowns;
- adds only necessary VCP artifacts;
- creates restartable lifecycle state.

### Unsupported ecosystem

A Rust/Java/custom project can still use VCP's generic lifecycle without VCP inventing commands or pretending full native support.

### Polyglot project

A repository can represent multiple proven capabilities instead of being mislabeled as a single stack.

### Auto mode

A developer can say:

> “Add organization invitations.”

and the agent routes the work through the appropriate VCP workflow without the developer memorizing CLI commands.

### Manual mode

A developer can work normally and explicitly invoke:

```text
/vcp ...
```

when they want the VCP workflow.

### Deterministic enforcement

An agent cannot obtain a green material-work gate merely by narrating that tests/review passed; VCP requires evidence.

### Skills

Skills provide excellent cross-agent UX without becoming the repository's durable source of truth.

---


### Low-friction usability

The redesign is not successful merely because every VCP command is correct.

Representative workflows must also prove:

- Auto users can work without memorizing VCP CLI;
- human interruptions are limited to real decisions;
- relevant context is loaded progressively rather than globally;
- trivial changes stay trivial;
- high-risk changes receive stronger controls;
- the safe path requires less manual engineering discipline from the developer, not more VCP bookkeeping;
- users can inspect the deterministic machinery when they need to without operating it continuously.

The product-level test is:

> **Does VCP make the safe engineering path easier than doing it without VCP?**

# 16. Final architecture target

```text
                        DEVELOPER
                            │
                natural language / /vcp
                            │
                            ▼
                ┌──────────────────────┐
                │  EXTERNAL AI AGENT   │
                │ Claude/Codex/Cursor/ │
                │ compatible future    │
                └──────────┬───────────┘
                           │
                    Skills / adapters
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                        VCP CORE                         │
│                                                         │
│ durable truth                                            │
│ bounded tasks                                            │
│ readiness                                                │
│ context                                                  │
│ deterministic verification                              │
│ evidence / provenance                                    │
│ review state                                             │
│ lifecycle / updates                                      │
│ deterministic gates                                      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  ADAPTATION LAYER                       │
│                                                         │
│ smart init                                               │
│ capability detection                                     │
│ declarative profiles                                     │
│ CI integration                                           │
│ agent adapters                                           │
│ project-root-aware composition                           │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
                       REPOSITORY
```

The durable design principle is:

> **Use AI where judgment is valuable. Use deterministic software where correctness can be checked. Preserve project truth. Never confuse a persuasive agent narrative with executable evidence.**
