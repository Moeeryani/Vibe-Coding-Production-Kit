# Adaptive VCP — Implementation Plan

**Status:** Proposed execution plan  
**Purpose:** Make VCP safe, adaptive, low-friction, and useful across new and existing repositories without weakening its deterministic control-plane philosophy.  
**Scope:** Smart initialization, project adaptation, capability detection, profile extensibility, CI integration, operating modes, Skills UX, mechanical enforcement, and conformance testing.

**Technical companion:** `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md` is the code-level dependency and integration authority for this plan. When implementation sequencing or a concrete integration detail is more specific there, this strategic plan follows that analysis.

---

## Final pre-implementation audit status

The current post-amendment design has a durable consolidated audit record:

- `docs/ADAPTIVE-VCP-FINAL-PREIMPLEMENTATION-AUDIT.md`

That audit re-inspected the real code integration surfaces, authoritative repository contracts, external ecosystem evidence, and both Adaptive documents after the amendments were applied.

Result:

~~~text
41/41 load-bearing cross-document contracts
→ mutually compatible at the design level

Stage-12 architecture/code contract
→ ready to implement after the Roadmap's current-main executable re-baseline precondition

whole Adaptive roadmap
→ NOT authorized as one mega-implementation
~~~

The consolidated audit also records the current executable-evidence limitation: this documentation/code audit does not substitute for the required exact-head executable gate before Stage-12 product-code work.

---

## Interpretation rule — current behavior vs target behavior

This is a **future execution/design authority**, not documentation of already released CLI behavior.

- README/CLI/OPERATING-MODEL/TASK/CONTEXT/UPDATES docs remain authoritative for behavior that exists on current main/released versions until the corresponding Adaptive stage lands.
- A deliberate current-vs-target difference (for example current init --force versus planned Stage-12 removal) is not itself a contradiction.
- When an Adaptive stage is implemented, its Task Pack/PR must update affected current-behavior docs in the same accepted change so the repository does not retain two active contracts.
- The Roadmap owns stage/status sequencing; this document owns the intended strategic target; the technical companion owns more-specific integration mechanics.


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

3. **Separate VCP framework/reference assets from consumer project artifacts.**  
   A target repository should never receive the full internal VCP documentation tree. It receives runtime-required integration plus only the greenfield starter/optional project assets appropriate to its install profile and explicit choices.

4. **Evolve from one-stack classification to composable project capabilities.**  
   Projects are often polyglot and multi-tool; VCP should model what is proven rather than force a single stack identity.

5. **Extend profiles/plugins declaratively and safely.**  
   Profiles may contribute detection rules, bounded guidance, and verification proposals without arbitrary executable plugin code.

6. **Make CI/project automation project-aware.**  
   VCP must inspect existing CI and project verification instead of installing VCP's own npm-centric workflow into arbitrary repositories.

7. **Add Auto and Manual operating modes.**  
   Auto mode asks the installed agent/Skill UX to route meaningful work through VCP automatically; because VCP has no embedded LLM or universal prompt interceptor, this routing is best-effort and later deterministic gate enforcement protects outcomes. Manual mode exposes VCP through explicit Skills/commands such as `/vcp` or equivalent agent UX.

8. **Use Skills as the UX/orchestration layer, not as the replacement for VCP core.**  
   Skills may be portable across agents. Portability is therefore not a reason by itself to prefer VCP. VCP earns its existence through deterministic state, gates, verification, evidence, lifecycle safety, and executable controls.

9. **Do not run the maximum VCP workflow for every change.**  
   Auto mode must classify work into workflow levels so trivial changes remain lightweight.

10. **If VCP says an agent “must” use the workflow, back that requirement with mechanical enforcement where feasible.**  
    Instruction text alone is not a guarantee.

11. **Create a cross-project compatibility/conformance matrix.**  
    The success target is universal safe adoption and graceful fallback, not magical perfect detection of every ecosystem.


12. **Split brownfield Smart Init into a planning-only Stage 12 and a mutating Stage 13.**  
    After the merged Stage 11 closeout gap is reconciled and current main is re-baselined, Stage 12 is the first Adaptive VCP execution slice: it proves repository inspection, section-ownership foundations, prompt fallback, and a trustworthy `vcp init --dry-run` plan without performing Smart Init writes into unmanaged EXISTING repositories. Normal transactional `vcp update` may still migrate already-MANAGED lifecycle state. Stage 13 consumes the same planning model to perform transactional brownfield Smart Init apply.

13. **Treat init previews as speculative, not executable authority.**  
    A Stage 12 dry-run is evidence of what VCP would do at that moment. Stage 13 must acquire the lifecycle lock and recompute a fresh plan from the current repository before mutation. Do not persist or blindly apply a stale preview.

14. **Version section-ownership state explicitly.**  
    Section ownership changes the meaning of a managed-file baseline. It must be represented by a manifest schema that older CLIs reject rather than silently interpreting section-owned entries as whole-file ownership.

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

The external ecosystem points in the opposite direction: successful structured systems increasingly keep the user in chat while a CLI/runtime manages durable state underneath.

### Principle

> **Hide mechanics, not meaning. A developer should not need to learn VCP internals in order to benefit from VCP, but decisions, risk, evidence, and blockers must remain visible.**

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

### Architectural limitation and enforcement model

VCP intentionally does not embed an LLM and therefore cannot universally intercept every natural-language request across every coding agent.

Auto mode must therefore be defined as:

~~~text
best-effort automatic routing
  through Skills / minimal agent instructions
+
deterministic enforcement
  through VCP Core / gate
~~~

On platforms that support lifecycle hooks, VCP may offer optional tighter integration, but hooks must not become a portability requirement.

If an agent skips an expected VCP step, the important guarantee comes from the final deterministic gate—not from pretending prompt routing is infallible.

### Required behavior

- Auto mode routes meaningful work through VCP without requiring command memorization.
- Human-facing responses emphasize what changed, why, decisions, evidence, blockers, residual risk, and outcome.
- Internal command chatter should normally remain implementation detail.
- Internal VCP state remains inspectable for users who want it.
- Error states explain what is blocked and why without forcing users to understand lifecycle internals first.
- Smart init should minimize setup questions: discover repository/stack/CI facts instead of asking for them, and ask only when an actual user choice remains.

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

Also do not make "invisible" mean opaque. A user should never receive only "done" without understanding the material decisions, verification, and remaining risk.

### Definition of done

- a new Auto-mode user can complete representative L1/L2 work without manually sequencing VCP CLI commands;
- the same workflow remains inspectable through CLI/JSON for advanced users and CI;
- onboarding documentation explains the normal experience before internals;
- a skipped agent-side step is caught by deterministic completion policy where mechanically provable;
- usability testing shows users can benefit from VCP without first understanding its internal vocabulary while still understanding what was decided and verified.


## 2A.2 Human-attention budget

### Current situation

This principle is not starting from zero.

VCP already has a strong uncertainty vocabulary across \`AGENTS.md\`, discovery/planning/implementation prompts, the operating model, Task Pack guidance, and prompt behavioral evaluation:

~~~text
DISCOVERABLE
PROPOSABLE
HUMAN DECISION
~~~

The current prompt evaluator already proves an important part of the contract: known discoverable facts must not be asked as questions.

The remaining gap is measuring **interruptions as interaction behavior**, not merely classifying individual question keys.

### Principle

> **Human attention is a constrained resource. VCP should interrupt the developer only when the answer materially requires human intent, policy, risk acceptance, authorization, or another non-discoverable decision.**

### Required behavior

For every uncertainty:

~~~text
DISCOVERABLE
→ inspect repository / durable project state
→ resolve without interrupting the developer

PROPOSABLE
→ propose the smallest reversible/default approach where policy allows
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

Do not ask for redundant confirmation before deterministic, reversible actions that the user has already authorized through project policy/workflow.

### Human-decision examples

Human input is appropriate for:

- intended product behavior;
- risk acceptance;
- destructive migration policy;
- security/privacy posture;
- compatibility policy;
- architecture direction when multiple material choices remain;
- data ownership;
- rollout decisions with business impact;
- sensitive or irreversible side effects not already authorized.

### Evaluation strategy

Extend the existing prompt-evaluation system rather than creating another behavioral framework.

The future evaluator should be able to prove properties equivalent to:

~~~text
discoverable-question-not-asked
human-decisions-grouped
redundant-confirmation-avoided
proposal-not-silently-approved
~~~

Do not add telemetry that records normal users' full conversations.

For canonical tests, external adapters can emit bounded structured behavior records. Real dogfood can record aggregate interruption counts and corrections without storing transcripts.

Do not rush a prompt-eval schema migration before Auto/Skills implementation needs it; preserve the existing strict v1 evaluator until the additional observation contract is stable.

### Measurement

Dogfood should track, where practical:

- number of human interruption rounds per representative workflow;
- number of questions later found to have been discoverable;
- repeated questions that should have become project truth or deterministic discovery;
- developer corrections/overrides of agent proposals;
- unnecessary confirmations for already-authorized reversible actions.

### Definition of done

- existing \`discover-before-ask\` behavior remains green;
- new Auto/Skill scenarios prove question grouping and no redundant confirmation where applicable;
- human decisions are still explicitly visible and never manufactured;
- repeated unnecessary questions are treated as system defects and drive Source-of-Truth/context/discovery improvements;
- no VCP feature requires privacy-invasive conversation telemetry to prove the attention contract.


## 2A.3 Progressive disclosure and context discipline

### Current situation

VCP already has good progressive-disclosure foundations:

- phase-specific Context Packs;
- explicit Source-of-Truth references;
- a hard context byte budget;
- security profiles loaded only for security mode;
- plugin guidance filtered by declared modes.

But the code audit found two important current contradictions:

1. root \`AGENTS.md\` is a large always-on instruction file containing planning, architecture, data, API, security, observability, testing, review, communication, and the full VCP workflow;
2. current Claude/Copilot adapters tell the agent to read broad categories of project documentation before changing code.

Those patterns fight the goal of bounded, task-specific context.

### Principle

> **Nothing should be loaded merely because it exists. Always-on instructions should route; task context should teach.**

### Required loading model

~~~text
Tier 0 — minimal always-on routing + invariants
        ↓
Tier 1 — workflow-level guidance
        ↓
Tier 2 — task-specific Context Pack
        ↓
Tier 3 — relevant risk/profile material
        ↓
Tier 4 — deeper references only when demanded
~~~

### Always-on instruction redesign

The adaptive redesign should deliberately shrink generated VCP-owned \`AGENTS.md\` content toward:

- Source-of-Truth authority rules;
- DISCOVERABLE / PROPOSABLE / HUMAN DECISION boundary;
- Auto/Manual routing rule;
- truthfulness about verification;
- configured verification-command contract;
- the smallest cross-cutting safety invariants that genuinely apply to almost every task.

Move detailed phase-specific material into:

- Skills;
- canonical prompts;
- Context Packs;
- relevant Source-of-Truth documents;
- path/profile-specific guidance where the agent platform supports it.

Claude/Copilot adapters must stop instructing the model to broadly read product + architecture + security + testing + delivery documents before every change. They should route the agent toward the VCP Skill/Context Pack and relevant evidence only.

Do not impose an arbitrary permanent byte target before benchmarking, but record the always-on instruction footprint and require it to justify growth.

### Workflow-level context

~~~text
L0
→ minimal standing rules + directly relevant changed surface

L1
→ compact task/change contract + relevant implementation/verification context

L2
→ full material Task Pack + relevant Source of Truth + architecture + affected files

L3
→ L2 plus only relevant security / migration / recovery / high-risk guidance
~~~

### Plugin/profile transport

Validation and context transport are different responsibilities.

A selected plugin/profile may need to be validated every time for trust integrity. That does **not** mean the bytes used for validation belong in the model's Context Pack.

Use three concepts:

~~~text
validated inputs
  selection config + manifests + digests + compatibility/grants
  → Core trust decision
  → not automatically rendered

transported context
  only guidance/proposal material relevant to this contextMode/workflow
  → counts against Context Pack bytes
  → appears in rendered context manifest

structured validation summary
  plugin IDs / trust success / relevant contribution IDs as needed
  → inspectable machine/human metadata
  → not disguised as model context
~~~

For current schema-v1 plugins:

- validate the whole selected set on every context build;
- transport only guidance whose declared modes include the current contextMode;
- verification proposals have no v1 mode field, so the initial progressive-disclosure rule is **plan-mode only**; other modes can inspect proposals through `vcp plugins` when deliberately requested;
- render a plugin identity/trust note only for plugins that actually contribute transported material to that pack;
- do not insert `PLUGINS.json` or `plugin.json` bytes merely to prove validation occurred.

A future strict plugin schema may add more explicit contribution relevance, but it must not restore eager transport.

The Context Pack byte budget applies to transported bytes, not internal validation reads.

### Context manifest

Keep the manifest compact but make inclusion provenance inspectable.

The system should be able to tell whether an item entered context as:

~~~text
prompt
repository-instruction
task
source-of-truth
explicit-include
security-profile
plugin-guidance
git-review
~~~

and, where useful, why that class applies.

### Skills

Skills should follow the same principle, but VCP must not assume every agent runtime loads Skills the same way.

Current ecosystems differ:

- some runtimes expose only Skill metadata initially and load the full Skill when selected;
- some custom-agent/session configurations can eagerly preload selected Skills;
- subagent inheritance/loading rules also vary by platform.

Therefore progressive disclosure must be **inside VCP's packaging design**, not a correctness assumption about the host.

Skills should follow these rules:

- short discovery metadata;
- minimal router body;
- deeper reference documents/scripts loaded only when the workflow needs them;
- no second full copy of VCP policy inside every Skill.

### Definition of done

- generated always-on VCP instruction content is materially smaller and routing-focused;
- Claude/Copilot adapters no longer mandate broad documentation reads for every code change;
- Context Pack manifests prove the category/reason for included sources;
- negative tests prove irrelevant security/profile/plugin guidance is absent;
- installed but irrelevant Skills/profiles do not inflate every context;
- token/context budgets remain bounded and measured by workflow level;
- package prompt fallback does not inject all packaged references.


## 2A.4 Validation checkpoints and model-capability audits

### Current risk

A long roadmap can become self-justifying: Phase N gets built because Phase N exists, even if dogfood shows the earlier design is too heavy or newer coding agents already solve the problem adequately.

Agent frameworks have already removed previously useful orchestration/verification machinery as frontier models improved. VCP must be designed to do the same when evidence changes.

### Principle

> **Do not continue the roadmap merely because the next phase is planned. Each layer must prove value, and major model/tool improvements must trigger a review of whether existing VCP scaffolding is still earning its cost.**

Each implementation checkpoint can result in:

~~~text
GO
→ evidence supports continuing

SIMPLIFY
→ reduce/alter the design before continuing

STOP / DEFER
→ do not build the next machinery yet
~~~

### Evidence hierarchy

Use the least expensive evidence capable of answering the question:

~~~text
deterministic fixtures / negative tests
        ↓
canonical agent behavior evals
        ↓
structured repository dogfood
        ↓
small real-user workflow tests
        ↓
broader adoption evidence
~~~

Do not create invasive product telemetry merely to satisfy checkpoints.

### Model-capability audit

Before a major VCP release—and when a materially stronger coding-agent generation changes normal capabilities—review:

- which always-on instructions are now redundant;
- which Skills can be simplified;
- whether orchestration responsibilities can be returned to the agent;
- whether any Core rule still prevents a real deterministic failure;
- whether workflow levels can become lighter;
- whether old compatibility shims can be migrated away safely.

The expected outcome may be deletion.

### Definition of done

- each roadmap checkpoint has explicit evidence requirements;
- failed checkpoints can simplify or halt later phases without being treated as schedule failure;
- checkpoint results are durable but bounded;
- roadmap decisions cite observed friction/benefit;
- major capability changes trigger an explicit "what can we remove?" audit before VCP adds more scaffolding.


## 2A.5 Complexity ROI rule

### Current risk

VCP already contains substantial deterministic machinery.

That machinery is justified only when it provides stronger guarantees or removes more user complexity than it adds.

### Principle

> **A VCP Core feature must justify its deterministic complexity. If the agent, a Skill, or existing project tooling can solve the problem reliably enough, Core should not own it.**

Before adding a meaningful new Core command/module/state field, answer:

~~~text
What failure does this prevent?

What evidence shows the failure is real/repeated?

Can a modern coding agent solve it reliably?

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

Persistent state deserves an especially high bar because every durable field creates compatibility, migration, update, rollback, and documentation cost.

Decision rule:

~~~text
deterministic value clearly exceeds framework tax
→ Core candidate

primarily conversational/orchestration value
→ Skill

already solved adequately elsewhere
→ integrate / document / do not build
~~~

### Scope of the rule

This is a governance rule for **developing VCP Core itself**.

Do not add a "Why this belongs in VCP Core" section to every Task Pack generated for consumer projects. That would export VCP's internal framework governance burden to users and increase ceremony.

VCP's own repository may require the justification for tasks that expand durable Core surface—for example new long-lived CLI commands, manifest state, migration classes, mandatory gates, or managed asset families.

### Definition of done

- significant VCP-Core expansion work records why deterministic machinery is necessary;
- ordinary consumer Task Packs do not inherit framework-governance paperwork;
- code review can reject Core expansion whose deterministic value is unclear;
- features that become unnecessary as models improve can move out of Core or be deprecated;
- default posture for new permanent state is "not yet" until enforcement/dogfood demonstrates need;
- VCP's user-facing complexity does not grow automatically with internal capability count.


## 2A.6 Terminology and orthogonality

Adaptive VCP introduces several concepts that must not be collapsed into one overloaded word such as "mode".

Use these terms consistently:

~~~text
workflowMode
  auto | manual
  → how VCP is triggered for a developer request

workflowLevel
  L0 | L1 | L2 | L3
  → how much durable contract / verification / review ceremony the change requires

executionMode
  AFK | HITL
  → who can execute the work; existing Operating Model concept

contextMode
  plan | implement | review | security | release
  → what bounded Context Pack is being built

dependency / readiness state
  blocked | ready | ...
  → whether the work is eligible to proceed
~~~

These dimensions are orthogonal.

Also keep similarly named `auto` concepts distinct:

- workflowMode=auto → agent routing preference;
- requestedStack=auto → legacy stack selector provenance;
- automatic capability application → a lifecycle decision derived from trusted capability evidence/provenance, not workflowMode.

Changing one must not silently change the others.

In particular:

- workflowLevel does not imply AFK or HITL;
- Auto mode does not make blocked work executable;
- Manual mode does not weaken readiness, Source-of-Truth, verification, or gate semantics when VCP is invoked;
- dependencies/readiness still determine eligibility before execution-mode scheduling;
- contextMode remains the existing vcp context --mode contract and must never be reused for Auto/Manual state.

This preserves the existing rule:

~~~text
dependencies first
then execution mode
~~~

while adding right-sized workflow ceremony as a separate concern.


# 3. Workstream A — Smart vcp init for new, existing, and managed repositories

## 3.1 Current situation

Today vcp init:

- builds the full current desired VCP file set;
- treats every existing desired path as a collision;
- refuses collisions unless init --force is supplied;
- writes desired files directly;
- creates .vcp/manifest.json and whole-file baselines.

The later vcp update lifecycle is substantially safer: it already has ownership policies, baselines, three-way merge, conflict blocking, locks, backup, rollback, transactions, and post-apply verification.

The adoption problem is therefore not "VCP has no lifecycle safety." It is that **initial adoption does not yet use the mature lifecycle model**.

## 3.2 Problem

The highest-risk moment—bringing VCP into an established repository—is currently less sophisticated than later updates.

A mature repository may already have:

- AGENTS.md, CLAUDE.md, or Copilot instructions;
- its own product/architecture/security docs;
- CI and GitHub repository hygiene;
- verification-command conventions;
- a .vcp/ path owned by something else;
- more than one language/tool family at the selected root.

The user must never have to choose between:

~~~text
abort
or
--force and overwrite
~~~

## 3.3 Target behavior and staged rollout

The public entry remains:

~~~text
vcp init .
~~~

Inspection classifies the selected root:

~~~text
                 vcp init .
                      │
                      ▼
               inspect safely
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
       NEW         EXISTING      MANAGED
         │            │            │
         ▼            ▼            ▼
   greenfield      safe plan      status /
   lifecycle       then adopt     update
~~~

Classification affects planning/UX, not trust. Every path still receives normal confinement/collision checks.

These subsections summarize public behavior only. The canonical Stage 12/13 implementation scope, dependency ordering, and exit criteria are defined in the execution-order section later in this document.

### Stage-12 public behavior summary

For EXISTING repositories:

- vcp init . --dry-run produces the complete bounded adoption plan;
- ordinary non-dry-run brownfield mutation is intentionally blocked;
- no destructive init --force exists;
- preview writes neither project files nor durable VCP state.

For NEW repositories, the existing greenfield lifecycle may remain temporarily **except for the known-unsafe source-repository CI workflow**. A fresh Adaptive-era install must not copy `.github/workflows/validate.yml` into arbitrary consumers. Greenfield preview/apply tests must prove that safety floor.

For MANAGED repositories, init performs no re-initialization and reports lifecycle/update status.

### Stage-13 mutation behavior summary

Brownfield mutation is added only after Stage 12 proves the planner.

Apply must:

1. acquire the lifecycle lock using first-adoption-aware lock bootstrap;
2. inspect the repository again;
3. recompute a **fresh** plan under the lock;
4. block conflicts/unsafe preconditions;
5. create a rollback-complete recovery point;
6. stage/apply atomically;
7. write the correct ownership-aware baselines/manifest;
8. verify the result;
9. clear transaction state;
10. prove rollback and idempotence.

A Stage 12 preview is speculative evidence, not an executable saved plan.

If the repository changes after preview, the Stage 13 plan is allowed—and required—to differ or block.

## 3.3A Inspect before prompting or applying defaults

Current CLI flow resolves interactive/default init options before `initProject()` sees the repository.

Smart Init must invert that order.

Use a two-phase request model:

~~~text
phase 1 — parse raw request
  target path
  explicit --agent / --stack / GitHub preference
  --yes / --dry-run / --json
  whether each preference was actually supplied
        ↓
read-only repository + VCP-state inspection
        ↓
phase 2 — resolve only the choices that remain
~~~

Rules:

- MANAGED or VCP_STATE_CONFLICT/recovery state returns the appropriate lifecycle result **before** asking greenfield/adoption questions;
- NEW may keep historical defaults temporarily (generic agent, auto stack, legacy GitHub preference) where compatibility requires it;
- EXISTING uses repository evidence/conservative brownfield defaults first and asks only real unresolved choices;
- omitted agent/GitHub options stay unspecified until this phase;
- mixed-stack ambiguity is surfaced rather than silently resolved by precedence;
- `--yes` means non-interactive acceptance of safe documented defaults, not permission to fabricate missing human intent;
- `--dry-run --json` is non-interactive: unresolved choices appear in the machine-readable plan as decisions/blockers rather than causing prompts;
- human interactive dry-run may ask a focused real choice when needed, but the plan remains read-only.

This sequencing is required for the existing VCP principle: **discover before asking**.

> [EXTERNAL RE-AUDIT 2026-10-06] Preview answers may be reused, but they
> are not timeless authority. The no-saved-plan rule still stands: repository
> state is always re-inspected and the plan is recomputed under lock. To avoid
> unnecessary repeated questions without replaying stale intent, a non-executable
> **answers record** may contain only stable decision IDs/versions and the user's
> chosen value (no file contents, repository plan, or executable mutations).
> During Stage-13 fresh planning:
> - same decision still exists + recorded value is still valid → reuse silently;
> - decision disappeared → ignore the stale answer and report that it was unused;
> - option/value is no longer valid or the decision contract changed → ask/block
>   again as a genuine HUMAN DECISION;
> - a new decision appeared → ask/block normally.
> The answers record reduces attention cost; it never constrains the fresh plan or
> bypasses validation.

Answers-record safety rules:

- version the answers-record schema independently from the init plan JSON;
- each reusable answer carries a stable decision ID + decision-contract version;
- only explicitly persistable decisions may be written;
- credentials, tokens, secrets, raw file contents, or arbitrary environment values
  are never persisted in an answers record;
- sensitive/non-persistable decisions can still be asked interactively at apply;
- default output should not silently create a tracked project file; writing the record
  is explicit and the user controls its destination.

## 3.4 Remove destructive --force from init only

The shared CLI currently uses --force for other explicit output-overwrite cases.

The accepted change is specifically:

~~~text
init --force
→ removed/rejected

task/context/evidence output force controls
→ preserved where their command contract still needs them
~~~

For an init collision:

~~~text
safe composition/adoption possible
→ COMPOSE / CLAIM / NOOP

not safely resolvable
→ CONFLICT
→ explain why
→ zero adoption mutation
~~~

## 3.5 Managed-section ownership for existing agent files

Existing AGENTS.md, CLAUDE.md, and Copilot instructions are project-owned documents. Smart Init must not take whole-file ownership merely because VCP needs one integration block.

Example:

~~~markdown
existing user instructions

<!-- VCP:BEGIN:agent-routing -->
VCP-owned integration block
<!-- VCP:END:agent-routing -->

more user instructions
~~~

For an adopted existing file:

- only the marked VCP section is managed;
- surrounding text remains project-owned;
- the baseline represents the VCP-owned section;
- lifecycle update compares only the owned section;
- malformed, missing, duplicate, nested, or reversed markers fail safely.

**Stage-12 Markdown marker grammar (proposed for D-05 approval):** VCP owns only exact full-line `<!-- VCP:BEGIN:<id> -->` / `<!-- VCP:END:<id> -->` pairs, where `<id>` matches `[a-z0-9-]{1,64}`. Parse Markdown code fences (backticks and tildes, variable lengths) before recognizing markers; marker-looking lines inside fences are project prose. Duplicate, nested, mismatched, reversed, or incomplete pairs are CONFLICT, never implicit whole-file ownership. Authorship additionally requires a compatible manifest ownership record, not marker presence alone. Store per-section baselines and restore whole-file transaction snapshots; outside-region bytes (BOM, mixed line endings and Unicode included) MUST remain byte-identical on update. No shell/YAML marker language is promised by Stage 12 without a declared consumer.

When a brownfield repository has no AGENTS.md, Smart Init should still create the **thin brownfield routing/invariant form**, not today's full always-on manual. Brownfield integration files use the marked section-ownership form even when VCP creates the file from scratch; the file may contain only the managed block initially. This keeps later user-added surrounding text outside VCP ownership and makes detach/re-track ownership recoverable. Greenfield legacy/full-file behavior may remain temporarily until the later consumer/standing-context migration.

### Ownership is separate from update policy

Keep two axes:

~~~text
ownership.kind
  file | section

policy
  managed | merge | generated | preserve
~~~

Do not invent policy=section.

### Manage ignore/track for section-owned integration

Section ownership must remain safe through `vcp manage ignore/track`.

Initial contract:

- `manage ignore <integration-path>` detaches VCP management and removes its baseline/managed entry, but leaves the complete project file and marked VCP block untouched;
- ignored content becomes project-owned until explicitly tracked again;
- for brownfield-minimal section-capable integration paths, `manage track` reattaches **section ownership only**;
- if the file exists, track requires exactly one valid recognized VCP marker pair; malformed/missing/duplicate markers block rather than causing whole-file takeover;
- if the ignored file was deleted, track may recreate the thin marked integration block and track that section;
- track uses the current package's desired VCP section as the baseline target while preserving current local section text as a local customization under the declared update policy;
- legacy-full whole-file installs keep their existing whole-file track semantics until an explicit migration changes their ownership.

Never let an ignored brownfield agent file re-enter lifecycle state as whole-file ownership merely because its previous managed entry was removed.

### Manifest schema safety

Section ownership changes baseline meaning. Current schema-v1 readers do not validate all per-entry semantics, so adding section fields to v1 would let an older CLI silently misinterpret a section baseline.

Therefore section ownership requires a new manifest schema.

Migration:

~~~text
schema-v1 managed entry
→ ownership.kind = file
~~~

Older CLIs must reject the newer schema rather than guessing.

### Forward-reader compatibility inside a schema

A schema number alone is not sufficient once later Adaptive phases add behavior-bearing fields to the same structural schema.

Later releases may persist applied capability state/provenance, workflowMode, explicit CI/gate integration state, or other fields that change desired managed content or lifecycle behavior. An older schema-v2 CLI must not accept those fields as harmless unknown metadata and then rewrite the repository using older semantics.

Therefore manifests need a fail-closed semantic reader guard, conceptually:

~~~json
{
  "schemaVersion": 2,
  "minimumReaderVersion": "<first VCP version that understands all behavior-bearing semantics in this manifest>"
}
~~~

Rules:

- Stage 12 writes the minimum reader version required for section ownership and assetSet semantics;
- whenever a later release adds or changes persisted state that affects lifecycle or desired content, it raises minimumReaderVersion to the first compatible CLI version;
- lifecycle entrypoints compare the running CLI version before planning or mutation;
- an older CLI may inspect enough metadata to explain incompatibility, but it must not update/manage/rollback through semantics it does not understand;
- all manifest writers, migrations, manage operations, backups, and restores preserve or deliberately raise the guard;
- merely spreading unknown install fields forward is data preservation, not semantic compatibility.

**Normative reader/field discipline (C-08, review proposed):** `readManifest()` is the fail-closed semantic compatibility choke point for all normal lifecycle readers. Every newly persisted behavior-bearing field (including `install.*`) raises `minimumReaderVersion` to the first compatible writer unless it is individually justified in `INERT_MANIFEST_FIELDS`; when in doubt raise. A Stage-12 field-enumeration test covers every persisted manifest field and fails for unlisted fields, before any additional behavior-bearing fields land. Names/meanings are not recycled. Backups and transaction journals have independently versioned validated envelopes; recovery from a corrupt active manifest may use a verified compatible backup without semantically interpreting an unsupported active schema. An explicit byte-copy-only recovery exception must never permit normal mutation under unknown semantics.

Use a schema bump when the structural representation itself changes incompatibly. The reader-version guard avoids unnecessary schema churn for additive but behavior-bearing semantics.

### Published-old-CLI compatibility: D-01 remains UNPROVEN

**This replaces the former ordinary-file `.vcp/update.lock` sentinel promise.** Published 0.9.3 `acquireUpdateLock` can stale-delete a dead-PID/aged regular-file lock, and old `rollbackProject` restores backups without validating the active manifest first. A persistent normal file is NOT a proven mutation fence, and future reader checks do not protect old binaries.

**G-FENCE is a hard stop before any actual managed v1→v2 schema write.** Record the intended guarantee and use the actual released 0.9.3 package in cross-platform tests of `update`, `manage`, `rollback`, `init`, concurrent old/new commands, stale/malformed/foreign locks, stale transaction targeting, interrupted migration, and subsequent user edits. Compare complete protected file-tree bytes, not merely `schemaVersion`.

Candidate A is a **directory** at `.vcp/update.lock`: its interaction with the published binary's exclusive file creation and nonrecursive stale reaper is only a hypothesis until the transition from a held file lock is proven gap-free on Windows and POSIX. Candidate B is lock-path separation plus a newest post-migration v2 backup; this is **risk reduction, not a zero-write fence**, because old rollback can restore older v2 bytes, overwrite post-backup edits, and select a stale transaction backup. Neither candidate is selected without explicit maintainer D-01 approval and execution receipts.

The fail-safe default is **defer live schema-v2 migration** while allowing reader/planner/test work. No automatic migration, safe-rollback, or old-version compatibility claim may be shipped if G-FENCE remains unproven. Managed migration recovery (validated backup and journal schema, committed-state detection, stale-journal disposition) belongs to Stage 12, not deferred to Stage-13 first-adoption recovery.

**Compatibility scope:** only the specific legacy commands and transitions actually covered by released-binary tests may be claimed protected. Old `init` with a deleted manifest, old-CLI rollback to a retained backup, foreign lock states, and concurrent writers require explicit observed outcomes. The schema-v2-capable CLI must itself fail closed on incompatible manifest/transaction/backup and section-state regression rather than silently treating downgrade residue as schema v1.

## 3.6 Verification-command authority in brownfield AGENTS.md

Current Task/Doctor command discovery scans AGENTS.md for command slots such as:

~~~text
UNIT_TEST_COMMAND=...
BUILD_COMMAND=...
~~~

A mature repository may already contain one or more of these keys outside the VCP section. Blindly inserting another set creates duplicate authority and first-match ambiguity.

Stage 12 must introduce one shared authority resolver used by Smart Init planning, Task creation, Doctor, and later gate/readiness logic.

Per command key, classify:

~~~text
missing
unique
duplicate-equivalent
duplicate-conflicting
~~~

Required behavior:

~~~text
missing
→ VCP section may contribute an evidence-backed value/placeholder
→ otherwise remain unresolved

unique
→ preserve/use the effective value
→ record source/provenance

duplicate-equivalent
→ if every configured value is byte-equivalent after only the parser's normal
   outer-whitespace/line-ending normalization:
   - effective value is unambiguous
   - retain every source location/provenance
   - report duplicate as informational cleanup debt
   - do NOT rewrite project-owned text
   - do NOT interrupt the user merely to choose between identical values

duplicate-conflicting
→ CONFLICT / HUMAN DECISION
→ never silently choose the first match
~~~

Do not attempt shell-semantic equivalence. `npm test`, aliases, quoting variants, pipelines, or wrappers are not assumed equivalent merely because they may behave similarly.

### Execution authority and destructive-command approval

Adopting a project command makes it executable VCP authority.

Every effective command must therefore expose provenance such as:

~~~text
project-adopted
vcp-suggested
project-configured
~~~

A command matching a versioned sensitive/destructive-pattern policy—for example fetch-and-execute, recursive destructive deletion, or another explicitly classified dangerous shell effect—requires an explicit HUMAN DECISION before VCP may execute it, even when the value is otherwise unique.

Approval identity is bound to the concrete command, not to a file or slot name:

~~~text
command key
+
normalized command fingerprint
+
source/provenance identity
+
approval-policy/decision version
~~~

If the effective command later changes, disappears, moves to a conflicting authority source, or produces a different fingerprint, the old approval is stale and must not authorize the new command.

### Durable owner of approval receipts

The optional Stage-13 answers record may **transport/reuse** the human decision during a fresh apply, but it is not the durable lifecycle authority after adoption.

After a successful adoption/update, approval-required command receipts belong in supported VCP lifecycle state (exact field name is an implementation detail), storing only bounded metadata such as:

~~~text
command key
normalized-command digest
source/provenance identity
approval-policy version
decision identity/version
~~~

Do not store secrets, command output, or unrelated file content in the receipt.

Rules:

- Stage 12 preview may report the required decision but writes no receipt;
- Stage 13 fresh planning validates any answers-record decision against the current exact command/fingerprint;
- only successful apply/update persists or replaces the receipt;
- a stale receipt may remain as historical lifecycle metadata, but resolver/Doctor report it as stale and it grants no execution authority;
- behavior-bearing approval receipts participate in `minimumReaderVersion` compatibility;
- rollback restores the exact prior receipt state.

### Migration re-screening and bounded enforcement (C-03 / D-12)

During a managed v1→v2 migration, re-screen all adopted executable verification commands for explicitly enumerated destructive patterns. A legacy approval cannot be silently promoted to current authority: mark any provisional receipt `grandfathered: true` with versioned identity, and require explicit confirmation before first later VCP-controlled execution. Bind an allowlist decision to exact command bytes/fingerprint, command key and provenance with a recorded rationale; a changed fingerprint invalidates it. A change only to policy version must trigger compatible re-evaluation, not automatic mass reapproval. `--yes` cannot bypass HUMAN DECISION. Preserved project text or commands run by external agents are **outside VCP enforcement**; Doctor may report patterns there as non-install-health governance information.

### Task snapshot and command-contract freshness

Task Packs remain the executable verification contract.

For new provenance-aware tasks:

- Task creation snapshots the effective command string plus key, normalized fingerprint, source/provenance, and approval status/receipt identity where required;
- `vcp verify` executes the task-approved snapshot, not a fresh first-match read from AGENTS.md;
- before merge-authoritative verification/gate, VCP resolves current command authority again and compares it with the Task Pack snapshot;
- a changed/missing/conflicting effective command makes the task verification contract stale and requires an explicit task refresh/re-plan before gate can pass;
- approval-required commands must still match a current valid receipt;
- legacy Task Packs without command-provenance metadata retain historical metadata for backward compatibility, but this MUST NOT be portrayed as pre-authorized execution. Stage 12 must place a deterministic authority/approval check at the actual `vcp verify --run` execution boundary, including manually edited task strings; if the command cannot be matched to accepted authority or explicit HUMAN DECISION, it blocks with actionable guidance. Phase 7 adds merge-authoritative freshness and gate evidence, not the first protection against uncontrolled shell execution.

This prevents a Task Pack from silently verifying against an obsolete project command policy while also preventing a later AGENTS edit from swapping in a new dangerous command under an old approval.

Moving verification configuration to another structured file remains a separate future migration.
## 3.7 Init action semantics

**Init planner vocabulary is distinct from update-planner vocabulary.** The new init action `CLAIM` establishes ownership of explicitly permissible existing content; the existing update-plan `ADOPT` continues to mean identical-template reconciliation. These meanings MUST NOT share the same action identifier.

~~~text
ADD
→ create content; establish declared file/section ownership

CLAIM
→ establish ownership only when the ownership boundary is already explicit and safe:
   - an exact whole-file canonical artifact whose catalog/asset policy permits whole-file adoption, or
   - an already well-formed marked VCP section whose content is empty or byte-identical to the canonical VCP section for the current package version [AUDIT 2026-10-06: marker presence alone is not authorship — a project-authored marker block, including one inside a fenced code example, must never be silently adopted as VCP-owned; anything else → HUMAN DECISION; marker scanning must be code-fence-aware]
→ brownfield AGENTS/CLAUDE/Copilot integration paths remain section-owned; an exact unmarked canonical match does not grant whole-file ownership
→ never claim arbitrary unmarked project prose as a VCP-owned section

COMPOSE
→ create/reconcile the marked VCP-owned section while preserving surrounding project content

Equivalent unmarked routing/instructions
→ NOOP if no VCP-owned section is needed
→ or COMPOSE if VCP requires a durable managed section

PRESERVE
→ leave project-owned content untouched; ownershipAfter = none

NOOP
→ no mutation and no ownership change

CONFLICT
→ block atomic apply
~~~

Paths outside the selected adoption surface are reported only in `skippedPaths` with a reason: **SKIP is not an init action, not an ownership transition, and cannot execute.**

Public `--json` reports carry `planVersion: 1`, `planKind: "init"`, ordered actions, reason, ownershipBefore/ownershipAfter, separate `skippedPaths`, conflicts and decisions. Reports remain content-free, nonexecutable and version-rejected by consumers on unknown major version. Preview is speculative; apply must re-inspect/replan under the approved lock. This public shape remains PROPOSED until D-04 is accepted.

## 3.8 Persist the adopted asset surface

A brownfield Smart Init deliberately installs less than the current legacy greenfield template, and fresh Adaptive greenfield installs must also stop inheriting source-repository-only CI.

That choice must survive the very next `vcp update`.

Do not represent install identity by filling `ignoredFiles`; ignored paths are user lifecycle choices, not product-surface identity.

Persist an explicit install-surface identifier, conceptually:

~~~text
legacy-full-v1
  → migrated pre-Adaptive managed installs
  → preserves their historical desired surface until explicit migration

greenfield-safe-v1
  → fresh Adaptive-era NEW installs
  → may temporarily keep current starter docs/prompts
  → does NOT include the VCP source-repository npm validation workflow

brownfield-minimal-v1
  → Stage-13 adoption into established repositories
  → minimal integration only
~~~

Exact names may change, but the contract is required.

Rules:

- migrated schema-v1 projects map to `legacy-full-v1` and do not experience an unexplained workflow deletion during the Stage-12 schema migration;
- fresh NEW projects use the safe greenfield surface, not the exact legacy source-repository surface;
- Stage 13 brownfield adoption records the minimal surface;
- `includeGitHub` on new Adaptive surfaces means optional GitHub hygiene/scaffolding, **not** automatic VCP npm CI;
- update/manage/Doctor desired-state logic respects the stored surface;
- Phase 2 may migrate these install profiles onto a newer classified catalog version while preserving greenfield/brownfield asset-selection semantics;
- Phase 3 owns provider-neutral CI inspection and the deliberate migration/detach decision for old `legacy-full-v1` managed `.github/workflows/validate.yml`.

**Fail-closed state (C-07):** In schema-v2 any missing, malformed or unknown `install.assetSet` raises `E_ASSETSET_UNKNOWN` before lifecycle mutation; never infer `legacy-full-v1` from current paths or auto-repair it. Every manifest writer preserves this identity (writer-audit test). Desired-file builders must filter by assetSet **before** comparison so subsequent update/manage never silently re-add deliberately omitted assets; `ignoredFiles` is not asset identity and `manage ignore` cannot accept never-managed paths.

Without this state, Smart Init would be non-destructive on day one and the next update could expand or mutate the installed surface unexpectedly.

## 3.8A Brownfield agent-selector provenance

Current CLI behavior collapses an important distinction:

~~~text
no --agent supplied
!= developer explicitly selected --agent generic
~~~

Today non-interactive `--yes` resolves missing agent selection to `generic` before repository classification. Smart Init must preserve request provenance until after it knows whether the repository is NEW or EXISTING.

Planning input should distinguish:

~~~text
agentPreference:
  unspecified
  explicit: generic | codex | cursor | claude | copilot | all
~~~

For EXISTING repositories:

- unspecified → always establish the bounded AGENTS integration, inspect existing supported vendor instruction files, and compose VCP routing only where needed;
- unspecified → do **not** create absent CLAUDE/Copilot adapter files merely because VCP supports them;
- explicit generic/codex/cursor → AGENTS integration only; preserve vendor files without adding VCP ownership unless separately requested;
- explicit claude/copilot → ensure that requested compatibility exists through safe NOOP/COMPOSE/ADD behavior;
- explicit all → ensure all currently supported adapter compatibilities requested by the user, subject to collision/section rules.

For NEW repositories, historical default generic may remain during the compatibility transition.

Do not collapse three different facts into one adapter list:

~~~text
requested adapter intent
  → explicit durable developer preference

managed adapter surface
  → VCP-owned file/section + why it became managed

observed compatible adapters
  → current derived repository fact
  → never ownership by itself
~~~

Examples:

~~~text
existing CLAUDE.md already contains @AGENTS.md
+ agentPreference=unspecified
→ CLAUDE.md = NOOP
→ project-owned
→ compatibility observed, not persisted as desired ownership

existing CLAUDE.md lacks AGENTS routing
+ agentPreference=unspecified
→ COMPOSE one marked VCP section
→ section becomes managed
→ managed entry records origin/adoption reason = observed-existing (or equivalent)
→ absent Copilot file is not created

explicit claude
+ existing compatible project-owned CLAUDE.md
→ persist explicit Claude intent
→ file may remain NOOP/project-owned while compatible
→ if compatibility later disappears, update can safely propose/perform the explicit requested integration
~~~

Lifecycle representation should therefore use:

- explicit requested-adapter intent in install metadata only when durable user intent exists;
- normal managed-file/section entries for what VCP actually owns;
- per-managed-adapter provenance sufficient to distinguish explicit-request ownership from observed-existing composition;
- derived inspection for compatible unowned vendor files.

Schema-v1 migration:

- legacy `install.agent=claude|copilot|all` preserves the corresponding historical requested compatibility intent;
- generic/codex/cursor require no dedicated adapter intent;
- existing managed CLAUDE/Copilot entries remain managed according to migrated ownership metadata.

Deletion semantics matter:

- an adapter section managed only because an existing vendor file was observed must not cause VCP to silently recreate the whole vendor file after the project deletes it;
- an explicitly requested adapter may remain a durable desired compatibility condition and can be re-established through normal safe planning;
- project-owned compatible adapters are never rewritten merely because they were observed.

All behavior-bearing adapter intent/origin semantics participate in minimumReaderVersion compatibility.

Do not infer Codex vs Cursor from AGENTS.md; the current product has no dedicated adapter surface proving that choice.

## 3.9 Brownfield GitHub-option provenance

Current CLI defaults includeGitHub=true, which conflates:

~~~text
user explicitly requested GitHub assets
with
user supplied no preference
~~~

For a mature repository, unspecified must not cause optional GitHub mutation.

Planning therefore needs request provenance, conceptually:

~~~text
githubPreference:
  unspecified
  include
  exclude
~~~

The public CLI must be able to express all three states. Keep `--no-github` for explicit exclusion and add an explicit positive flag such as `--github` (final spelling may be `--include-github`, but one positive form is required). Parser defaults alone cannot represent "explicit include" once omission becomes `unspecified`.

Compatibility:

- no flag → unspecified for EXISTING; historical/default behavior may still resolve later for NEW;
- `--github` → explicit include;
- `--no-github` → explicit exclude;
- passing both → CLI error before repository mutation.

For EXISTING repositories:

- unspecified → preserve/skip optional GitHub hygiene;
- explicitly include → only allowed non-CI hygiene may be planned;
- explicitly exclude → skip;
- existing CI is preserved in all cases.

NEW repositories may retain the historical default temporarily for compatibility until Phase 2/3 changes the greenfield surface.

Persist the actual installed decision needed by lifecycle state; do not persist parser trivia unless lifecycle behavior requires it.

## 3.10 Repository classification, reserved state, and stack ambiguity

### VCP lifecycle readability is evaluated before ordinary repository classification

NEW / EXISTING / MANAGED describes repository/adoption state only after the VCP namespace has been inspected safely.

Use this precedence:

~~~text
.vcp/manifest.json absent
  + no conflicting reserved VCP state
  → classify repository maturity as NEW or EXISTING

manifest parses
  + schema supported
  + minimumReaderVersion supported
  → MANAGED
  → if baselines/transaction/integrity checks later show the install is unhealthy,
     classify lifecycle health as MANAGED_RECOVERY_REQUIRED
  → report the recovery/health blocker; never re-init over it

manifest malformed / structurally invalid
or schema newer/unsupported
or minimumReaderVersion newer than running CLI
or unknown reserved .vcp state prevents safe interpretation
  → VCP_STATE_CONFLICT
  → neither NEW/EXISTING nor safely MANAGED
  → explain remediation/upgrade requirement
  → zero init mutation
~~~

An active lifecycle lock or transaction owned by **another/unknown operation** also blocks init/apply. If the manifest is recognized, report it as managed lifecycle recovery state rather than treating the project as unmanaged.

Stage 13's own post-lock reinspection is the deliberate exception: the inspector receives the lock handle/payload returned by the successful acquisition and treats that exact lock as operation-owned temporary state. Any different/replaced/malformed lock still blocks.

Smart Init must never become a way to overwrite or 'repair' lifecycle state it cannot understand.

Rollback must remove only VCP-created internal state when the true prior state was no VCP lifecycle state; pre-existing unknown .vcp content is never deleted as part of adoption rollback.

### Brownfield stack ambiguity before capabilities

Stage 12 intentionally does not implement the full capability model.

However, it must not overstate certainty from legacy single-stack precedence.

If --stack auto on an EXISTING root contains materially competing major stack-family evidence, Smart Init should surface the ambiguity and require a project-root/stack decision or conservative fallback rather than silently treating precedence as proof of one project identity.

This is a narrow adoption-safety check, not capability persistence.

> [AUDIT 2026-10-06 — PRE-IMPLEMENTATION] Specified polyglot fallback (closes
> scenario-E gap). For a genuine polyglot monorepo root where no single stack
> family dominates, Smart Init must NOT silently pick by precedence and must NOT
> block `--yes` adoption outright. Required behavior: classify `stack: generic`,
> record the competing evidence list in the (non-persisted) plan output for human
> visibility, install only stack-neutral assets, and require an explicit
> HUMAN DECISION (interactive or an explicit Stage-12-supported `--stack`
> / selected-project-root choice) before installing any stack-specific assets.
> Capability-specific CLI/configuration does not exist until Phase 4 and must not
> be referenced as a Stage-12 escape hatch. Capability
> composition itself stays in Phase 4; this fallback only guarantees the flagship
> capabilities case never dead-ends adoption.

## 3.11 Minimal brownfield adoption surface and Doctor compatibility

The brownfield planner must not expand today's full CORE_ASSET_ROOTS / GITHUB_ASSET_ROOTS.

By default it should:

- add minimal lifecycle state;
- add thin VCP agent routing/invariants;
- make that brownfield VCP instruction block **asset-set aware**: it must not instruct the agent to read canonical Product/PRD/Architecture/Security/Testing starter paths that brownfield-minimal intentionally did not install;
- route detailed work through the Task Pack's explicit governing references and bounded Context Pack instead of hard-coded starter-document paths;
- expose only verification slots whose authority was resolved safely during adoption;
- use project prompt overrides when present and packaged prompt fallback otherwise;
- preserve project docs;
- preserve CI;
- skip VCP framework roadmap/release/task-history/source-validation assets;
- skip the npm-specific VCP workflow;
- skip optional GitHub hygiene unless explicitly requested.

Because packaged prompt fallback becomes a valid source, Doctor's plan/review availability check must use the same resolver in Stage 12/13. A correctly adopted project must not immediately warn that valid packaged prompts are "missing."

Doctor must also understand the stored install surface well enough not to call intentionally absent assets a broken install.

The init/apply success message and onboarding handoff must be asset-set-aware as well. Current `printInitResult()` tells every project to "draft Source of Truth", which is appropriate for the legacy greenfield flow but can contradict brownfield-minimal preservation. Required messaging:

- greenfield-safe may invite the agent to draft/fill the installed starter truth;
- brownfield-minimal must tell the agent to inspect existing project authority, preserve it, and link the real accepted references in Task Packs rather than creating canonical starter docs automatically;
- MANAGED/status paths must never print first-install setup instructions;
- human and JSON result surfaces expose repository class, assetSet, next required action, blockers/decisions, and whether mutation actually occurred.

Invisible UX cannot instruct the agent to undo the adoption policy VCP just applied.

For `brownfield-minimal`, Doctor must separate:

~~~text
VCP install health
→ lifecycle state, owned integration, prompt resolution, command authority, etc.

project-governance coverage
→ whether Product/Architecture/Security/Testing Source of Truth exists or is configured
~~~

Missing VCP starter documents that were never part of the adopted asset set are **not install corruption**.

Doctor reports `installHealth.checks` separately from `governance`. Every install-health check declares applicable assetSet(s); intentionally absent starter files are NOT_APPLICABLE/INFO, not WARN/FAIL. **Proposed D-02 strict truth table:** default Doctor fails only on applicable install-health FAIL; `doctor --strict` fails on applicable installation FAIL or WARN, but never on informational/unknown governance. Missing governing truth becomes blocking only under a separate actual task/readiness/policy/verification contract, not by creating fake Doctor installation failures. This proposal requires D-02 acceptance and a synthetic brownfield-minimal exit-0 fixture; legacy-full behavior remains tested.

Broader provider-neutral CI cleanup remains Phase 3.

### First-adoption lock bootstrap must be reversible before backup

Current update locking creates `.vcp/update.lock` and may create `.vcp/` itself. That is harmless for an already-managed update but is observable mutation in a previously unmanaged repository.

Stage 13 must make lock acquisition lifecycle-aware:

- lock acquisition returns an operation-scoped handle containing enough identity to prove which lock this operation owns, plus whether `.vcp/` existed before this operation;
- if VCP creates `.vcp/` solely to hold the lock, that directory is temporary lifecycle scaffolding until the adoption transaction/recovery point exists;
- after the lock is acquired, Smart Init re-inspects the namespace **with that owned-lock handle**;
- the exact owned lock is allowed during this reinspection; a replaced/different/malformed lock, new transaction, manifest, or other unexpected/incompatible VCP state blocks;
- if planning blocks/fails **before** a backup/transaction is created, release the lock and remove only the empty `.vcp/` directory that this operation created;
- never recursively delete the directory during this cleanup; if any unexpected content exists, preserve it and report the conflict;
- once backup/transaction state exists, the normal generalized recovery metadata owns rollback;
- the pre-lock lifecycle snapshot is passed into backup metadata; backup code must not infer "VCP already existed" merely because lock acquisition created `.vcp/`;
- if the repository was truly unmanaged before the operation, a **successful rollback** removes the operation-created backup itself, baselines, manifest, transaction/stage/lock files, operation-created `.vcp/.gitignore`, and then removes `.vcp/` only if empty;
- cleanup is path-specific/non-recursive at the final namespace boundary: unexpected concurrently created content is preserved and reported, never erased;
- if restore/rollback itself fails, retain the recovery backup rather than deleting the only recovery evidence.

The invariant is:

~~~text
unmanaged before apply
+ conflict/failure before project mutation
→ unmanaged afterward
~~~

Acquiring the lock is allowed to create temporary internal state, but that state must not leak after an aborted first-adoption attempt.

### Task creation must respect the adopted asset surface

Smart Init is not truly usable if the first `vcp task` after brownfield adoption generates references to starter documents VCP intentionally did not install.

Current full Task Pack generation pre-populates canonical VCP paths such as:

~~~text
docs/product/PRD.md
docs/product/USER-FLOWS.md
docs/architecture/ARCHITECTURE.md
docs/security/THREAT-MODEL.md
docs/testing/TEST-STRATEGY.md
~~~

For `brownfield-minimal`, Stage 13 must make Task Pack creation asset-set-aware.

Required behavior:

- do not auto-create the missing starter documents merely to satisfy the task template;
- do not silently map arbitrary existing files to authoritative VCP roles;
- render a neutral governing-reference scaffold that tells the agent to inspect the repository and link the **actual accepted project authority**;
- keep project-root/workspace reference rules unchanged;
- readiness continues to require real accepted Source-of-Truth where the task contract requires it;
- a Draft Task Pack may contain neutral placeholders, but they must be clearly placeholders rather than fabricated canonical paths;
- greenfield/legacy-full may retain the current starter-oriented source table until Phase 2 deliberately unifies catalog/template behavior.

Conceptually, a brownfield L2 Source-of-Truth scaffold can start as:

~~~text
| Authority / decision | Reference |
|---|---|
| Governing requirement | <project-relative path#section or workspace:path#section> |
| Architecture/domain decision (if applicable) | <path#section> |
| Security/testing/operational authority (if applicable) | <path#section> |
~~~

The agent must replace/remove placeholder rows from repository evidence before readiness can pass.

This same rule later applies to L1/L3 renderers: workflow level changes ceremony, not the repository's governing-document namespace.

### Recovery must remain possible when the current manifest is corrupt

Fail-closed compatibility must not make recovery impossible.

A current compatible CLI may need to roll back precisely because the active manifest
is malformed or partially written. Therefore the new rollback design validates the
**recovery artifact** itself before mutation:

- backup metadata has its own version/reader contract;
- a backed-up manifest, when present, is validated for compatibility before restore;
- an initial-adoption backup explicitly represents "no prior manifest";
- an interrupted transaction record also has a version/reader contract;
- if the active manifest is readable, its schema/minimumReaderVersion is checked;
- if the active manifest is malformed/missing, explicit recovery may proceed only
  from a compatible, validated backup/transaction target.

Do not require successful parsing of the damaged current manifest as an unconditional
precondition for recovery.

**No published-old-CLI recovery fence has yet been proven.** Until D-01 passes on the real released binary, new reader/recovery code cannot prevent v0.9.3 rollback from mutating restored state; do not enable live v2 migration or claim old-version recovery safety.

---

## 3.12 Definition of done

Smart adoption is complete only when:

- destructive init --force is gone while unrelated force controls remain;
- raw init preferences remain explicit/unspecified through read-only inspection; NEW/EXISTING/MANAGED classification occurs before interactive/default resolution; explicit GitHub include/exclude is representable from the public CLI;
- NEW / EXISTING / MANAGED classification is deterministic only after VCP-state readability checks;
- malformed/newer/minimum-reader-incompatible manifests and unknown reserved .vcp state fail safely without being reclassified as ordinary EXISTING;
- recognized-but-unhealthy MANAGED lifecycle state blocks re-init and reports recovery/health status;
- brownfield dry-run is zero-write;
- preview and apply use the same planner;
- unchanged repository snapshot produces semantically equivalent planned actions;
- changed repository state causes fresh re-plan/difference/block rather than stale-plan execution;
- existing agent/CI/project docs are never silently replaced;
- omitted brownfield agent choice is not collapsed to explicit generic; observed compatibility remains distinct from VCP ownership; managed/explicit adapter intent survives lifecycle updates correctly;
- section-owned content survives subsequent updates while surrounding text is preserved;
- ignore/track cannot convert a brownfield section-owned integration file into whole-file ownership;
- verification command authority cannot be made ambiguous by duplicate inserted slots; equivalent duplicates do not create fake human decisions; approval-required commands have lifecycle-owned exact-command receipts that stale on change; provenance-aware Task Pack command snapshots must be current before merge-authoritative gate;
- brownfield auto-stack ambiguity is surfaced conservatively;
- the persisted asset surface, including actual adapter selection, prevents the next update from expanding adoption accidentally;
- packaged prompt fallback, Context, and Doctor agree without widening project authority;
- brownfield standing instructions, init success messaging, and generated Task Packs never require/fabricate starter paths absent from the adopted assetSet;
- schema migration makes legacy entries explicit whole-file ownership;
- no schema-v2 migration is enabled until D-01 proves the accepted legacy-CLI safety guarantee on the actual previous release and supported platforms; if G-FENCE fails, migration is BLOCKED rather than declared protected;
- lock bootstrap leaves no stray VCP state when Stage 13 blocks before backup;
- rollback restores both prior content **and prior absence of lifecycle state**, including removal of operation-created first-adoption backup/internal scaffolding after successful restore;
- first post-adoption `vcp task` produces an assetSet-appropriate Source-of-Truth scaffold rather than nonexistent canonical starter paths;
- rerunning init after successful adoption reports MANAGED and does not rewrite lifecycle state;
- documentation contains no instruction to use init --force after review.

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

A **unified consumer asset catalog does not mean every repository receives the same files**.

Classify catalog entries, conceptually, as:

~~~text
runtime-required
  lifecycle/integration artifacts VCP actually needs

greenfield-starter
  Product/Architecture/Security/Testing starter templates useful for a new project

optional-hygiene
  issue/PR/repository convenience assets

package-only
  VCP framework/reference/source assets
~~~

For an established repository:

- do not add greenfield-starter documents merely to match canonical VCP paths;
- existing project documentation remains project-owned;
- VCP may discover candidate equivalent docs, but must not silently declare them authoritative Source of Truth;
- Task Packs may reference the project's real existing paths directly;
- a later explicit project decision may adopt/create VCP starter docs if useful.

Phase 2 "unifies the catalog and lifecycle rules", not the installed path set across greenfield and brownfield repositories.


## 4.4 Implementation approach

Replace broad template roots such as `docs` and `prompts` with an explicit consumer asset manifest.

Before removing project-local prompt copies, first add a **canonical prompt resolver**. **Stage-12 API requirement (C-09):** it takes the persisted `install.assetSet` as a required input, and cannot reference starter paths not installed by that assetSet; a per-surface fixture must prove this. AssetSet creation precedes the resolver in implementation order.

Sequencing note: the resolver itself, project-override precedence, and the minimum Doctor prompt-source compatibility land in Stage 12 because brownfield adoption already relies on packaged fallback. The broader consumer-asset removal, framework-validator cleanup, and remaining Doctor asset/CI cleanup stay in Phase 2/3.

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

Prompt trust/path rules:

- project prompt overrides remain selected-project-root files and must use the same confinement/symlink-safety discipline as other project context inputs;
- packaged fallback is resolved only from VCP's fixed canonical mode-prompt allowlist, not from an arbitrary user-supplied `vcp:` path;
- packaged prompt content is **execution guidance**, not project Source of Truth, and cannot satisfy a Task Pack Source-of-Truth reference;
- packaged prompt bytes still count against the Context Pack budget and their `vcp:` identity remains inspectable;
- the resolver exposes prompt provenance (`project-override` vs `packaged`) and packaged fallback reports the VCP package/CLI version that supplied it;
- the rendered Context Pack remains self-contained by embedding the actual prompt bytes, so version metadata supplements rather than replaces the content;
- package fallback does not widen project/workspace filesystem authority.

This should follow the same general pattern already used by packaged security-profile fallback.

After prompt fallback exists, the consumer asset set can become explicit and small.

Important security split:

~~~text
docs/security/THREAT-MODEL.md
→ greenfield-starter / project-owned Source of Truth

docs/security/SECURITY-PROFILE.md
→ optional greenfield-starter / project-owned profile declaration
→ absence is valid; security mode still gets built-in baseline

docs/security/profiles/*.md
→ canonical VCP guidance belongs in the package
→ project-local same-path files remain explicit overrides when deliberately customized
~~~

Consumer-facing classes then include:

```text
AGENTS integration
project product truth
project architecture truth
project security truth / optional profile declaration
project testing strategy
Definition of Ready / Done
project task support
optional issue / PR hygiene
VCP lifecycle state
```

VCP's own roadmap, release history, source-validation scripts, framework task history, evaluations, and canonical reference documentation remain package/source assets rather than consumer project assets.

Community-plugin state is a separate **project-owned/external input class**, not a VCP consumer-install asset:

~~~text
docs/plugins/PLUGINS.json
→ explicit project-owned selection/grant state
→ VCP does not create it merely because plugin support exists

community-plugins/**
→ project/vendor-owned local bundles selected by the project
→ validated by VCP when referenced, but never framework cleanup material
~~~

Phase 2 must not start managing, deleting, relocating, or auto-selecting those paths. Context/Doctor may validate them when present. A future plugin schema migration evolves the plugin contract, not VCP lifecycle ownership of the project's plugin files.

Do not copy `scripts/validate-framework.*` into arbitrary projects. Those scripts validate the VCP source/package, not a universal application.


## 4.5 Migration for existing VCP projects

Do not simply make old managed assets disappear from the desired set.

The current update planner intentionally treats an unexpectedly disappeared managed file as a conflict. Use explicit lifecycle migrations.

Migration rules:

- unmodified VCP-only framework docs/scripts may be removed;
- locally modified former framework files are detached/preserved;
- project-owned docs remain tracked according to policy;
- project-owned `docs/plugins/PLUGINS.json` and `community-plugins/**` are untouched by framework-asset removal; they are not former VCP template assets;
- release/task history created by the project is never confused with VCP framework history;
- unmodified old prompt copies may be removed so packaged fallback becomes active;
- locally modified old prompts remain as project overrides;
- unmodified old `docs/security/profiles/*.md` copies may be removed so the existing package fallback becomes active;
- locally modified security-profile guidance is detached/preserved at the same safe local override path;
- `docs/security/SECURITY-PROFILE.md` remains project-owned when present and is never confused with package guidance.

There is also a release-automation dependency:

Current `release-check` lifecycle smoke validates an updated consumer by executing that consumer's copied `scripts/validate-framework.mjs`.

When consumer installs stop receiving that file, release-check must switch to public lifecycle contracts and also prove the new manifest-reader boundary.

Stage-12/Phase-2 lifecycle smoke should become:

```text
previous CLI init
→ capture/hash previous managed project state
→ candidate update preview
→ candidate update apply (v1 → v2)
→ candidate Doctor
→ candidate idempotent update preview
→ expected assetSet/ownership surface checks
→ invoke previous CLI against upgraded project
     → must fail closed on unsupported schema/reader semantics
     → project bytes/state must remain unchanged
→ candidate rollback using the update backup
→ prove prior v1 manifest/baselines/project bytes restored
→ previous CLI Doctor/status can read the restored project again
→ candidate update can be applied again successfully
```

The Stage-12 release also needs a focused same-schema fixture for `minimumReaderVersion` because a v0.9 schema-v1 CLI will already fail on schema v2 and therefore cannot by itself prove the later same-schema guard.

Rollback evidence is essential: a migration is not safe merely because forward apply succeeds.

Source/package validation still runs separately inside the VCP repository. Later, canonical `vcp gate` may be added to an appropriate consumer fixture, but it does not replace lifecycle migration proof.


## 4.6 Definition of done

- fresh init no longer installs the full VCP framework docs tree;
- target repositories contain only project-relevant VCP artifacts;
- `vcp context` works even when no project-local canonical prompt copy exists;
- explicit project prompt overrides still work and are identifiable;
- customized legacy prompts survive upgrade as overrides;
- customized local security-profile guidance survives as an override while unmodified canonical copies can move to package fallback;
- consumer projects no longer receive VCP's source-framework validator;
- Doctor no longer requires copied framework scripts/prompts when packaged equivalents are valid;
- release-check consumer lifecycle smoke no longer depends on copied `validate-framework` and proves forward migration, old-reader fail-closed behavior, rollback to the prior readable schema, and re-apply;
- explicit migrations prevent unexplained disappeared-file conflicts;
- project-selected community-plugin declaration/bundles survive asset migration byte-for-byte unless the project itself changes them;
- package tests explicitly assert both package surface and consumer-install surface.

# 5. Workstream C — Replace single-stack identity with composable capabilities

## 5.1 Current situation

Current stack detection is exclusive and, after merged Stage 11, resolves in this order:

```text
Go marker                → go
Python marker            → python
React Native evidence    → react-native
tsconfig.json            → typescript
package.json             → javascript
otherwise                → generic
```

React Native is already current runtime behavior on main; it is not future Adaptive work.

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
  "state": "proven",
  "source": "tsconfig.json",
  "sourceKind": "core",
  "detector": "core.typescript.v1"
}
```

Avoid fuzzy model-generated confidence.

Separate **evidence state** from **application state/authority**.

Conceptually:

~~~text
evidenceState
  proven | unknown

applicationState
  applied | proposed | unapplied

applicationProvenance (when applied)
  auto-core | explicit-project | community-adopted | ...

sourceKind
  core | first-party-profile | community-profile:<id> | project-config
~~~

Examples:

- deterministic detector match + no adoption → evidenceState=proven, applicationState=unapplied/proposed;
- explicit project capability with detector no longer present → evidenceState=unknown, applicationState=applied, applicationProvenance=explicit-project;
- auto core capability currently matched → evidenceState=proven, applicationState=applied, applicationProvenance=auto-core.

A capability can therefore be deterministically proven yet unapplied, or explicitly applied while current detector evidence is absent.

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
collect detected capability evidence + provenance
      ↓
apply trust/authority policy
      ↓
derive applied/configured capability set
      ↓
compose guidance + verification discovery
```

Multiple non-conflicting capabilities can coexist.

### Core detector filesystem trust

Do not carry forward the current single-stack detector's weaker filesystem assumptions into capability authority.

Today some legacy stack markers are tested with `access()`, which can follow symlinks. That is acceptable only as current compatibility behavior; a new capability detector whose result can alter lifecycle-managed guidance/state must use the stronger trust boundary:

- selected-project-root confinement;
- explicit regular-file/directory checks;
- no authority from symlinked markers that escape or alias another location;
- bounded reads/parsing;
- deterministic case/path handling where required;
- evidence records the exact detector/path that matched.

Use the same underlying safe evidence primitives for core/first-party detectors and community DSL where practical so the trust model does not vary by provenance.

**Common path trust primitive (C-11):** Stage 12 introduces one leaf resolver for selected-project-root reads and writes, with separate read-existing/write-new/managed-state policies. Validate canonical parent path components with no-follow checks; do not trust `path.resolve().startsWith(root)` to exclude symlink/junction escapes. For untrusted evidence, default to rejecting symlinks (including in-root links) pending D-03 approval; purpose-specific exceptions require explicit provenance and tests. Replace duplicated `safePath` copies in Context, Readiness and Verify. Re-inspect before mutation under the actual lock; no impossible TOCTOU-free guarantee is implied.

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

Because applied capability state affects desired managed content, the first release that persists those semantics must also raise minimumReaderVersion to a CLI that understands them.

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


## 5.6A Capability lifecycle provenance

Detected capability evidence is derived current-repository fact. Applied capability state is lifecycle state and therefore needs **application provenance**.

Do not persist only a flat list of IDs.

Conceptually retain enough information to distinguish:

~~~text
auto-core
  deterministically detected core/first-party capability
  automatically applied under VCP lifecycle rules

explicit-project
  developer/project explicitly configured capability

community-adopted
  community-profile capability explicitly adopted by project policy
  after selection/digest/grant validation
~~~

Exact field names may differ.

Lifecycle rules:

- current detected evidence is recomputed from the selected project root; it is not authoritative merely because an old snapshot said it once existed;
- an `auto-core` capability may become **eligible for automatic ADD** only when its core/first-party detector reaches the deterministic proven state required by that capability contract; the transition is visible in status/update dry-run and still cannot invent verification commands;
- disappearance of evidence for an already-applied `auto-core` capability is **never an automatic REMOVE**. Report a pending removal/mismatch and require explicit project approval or an explicit VCP capability action before changing applied state;
- after an approved removal, normal desired-state merge/conflict rules protect local managed-section edits;
- temporary detector wobble, migrations, or intermediate repository states must not silently delete capability-driven guidance;
- `explicit-project` capabilities are sticky until explicitly changed; missing detector evidence becomes a Doctor/status mismatch, not silent removal;
- `community-adopted` capabilities are also sticky project decisions; disappearance/tampering/incompatibility of their required selected profile blocks dependent lifecycle mutation rather than silently dropping behavior;
- conflicting capability evidence or an application change that crosses a human policy boundary becomes CONFLICT/HUMAN DECISION rather than precedence guessing;
- detected-but-unapplied community evidence remains proposed/reportable only;
- removal of auto-applied capability effects requires explicit project approval first, then goes through normal desired-state merge/conflict semantics so local managed-section edits are not silently destroyed.

Migration from the legacy stack model must translate historical intent:

~~~text
requestedStack=auto
→ corresponding core stack-derived capabilities may become auto-core

explicit requestedStack=<value>
→ corresponding capability intent is explicit-project

missing/unknown requestedStack provenance
→ preserve conservatively; do not invent auto provenance
~~~

Doctor/status should report at least:

~~~text
detected now
applied now
application provenance
evidence missing/mismatch
pending add/remove transition
~~~

This preserves the proven Stage-11 rule: explicit human selection is not overridden by later detection.

### React Native / Stage 11 migration bridge

Stage 11 React Native support is already merged and is current behavior.

Do not re-run Stage 11 as though it were pending, and do not discard its lifecycle provenance merely because capabilities are a better future representation.

The capability transition must preserve and reinterpret:

- explicit requestedStack=react-native intent;
- auto-selected react-native provenance;
- the existing bounded generic|javascript|typescript → react-native specialization rule;
- selected-project-root authority;
- repository-script verification evidence;
- mobile sensitive-effect / HUMAN DECISION boundaries;
- Stage 10 community-plugin coexistence.

A future normalized capability representation may include:

~~~text
runtime.node
language.javascript | language.typescript
framework.react-native
mobile.react-native-app
~~~

but legacy stack fields remain a compatibility summary during migration.

React Native should be a migration/conformance fixture for capabilities, not a throwaway Stage-11 reimplementation.

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
- Doctor reports detected capability evidence separately from applied/project-approved capability state, application provenance, mismatches, pending ADD transitions, and approval-required REMOVE transitions;
- no capability detector silently broadens the selected project root;
- core/first-party capability evidence is regular-file/directory checked and symlink-safe rather than inheriting legacy `access()` semantics.

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

Use explicit schema dispatch for the **community profile/plugin manifest** (this is separate from the `.vcp/manifest.json` lifecycle schema):


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
- the plugin can contribute **detected evidence** to the normalized capability model, but cannot make itself authoritative;
- community-detected capabilities remain unapplied/proposed unless a separate project-owned configuration/adoption step authorizes application;
- first-party/core deterministic capabilities may be eligible for automatic application only under the normal lifecycle/provenance rules;
- automatic composition must never treat `proven` alone as sufficient authority without considering provenance/application state.

## 6.4 Trust model

Preserve current invariants:

- community profile/plugin schema v1 behavior remains exactly backward-compatible;
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

The detector DSL must inherit or strengthen today's community-plugin confinement/resource rules:

- detector paths are normalized selected-project-root-relative paths; traversal/absolute/URL/workspace escape is rejected;
- symlinked detector targets do not grant evidence across the selected-root trust boundary;
- file/JSON/text reads use bounded byte/entry limits and deterministic UTF-8/error handling;
- exact-path/case portability rules remain explicit where authority depends on a path;
- predicates return only bounded evidence facts (matched/not matched + declared path/predicate identity), not raw matched file contents or secret values;
- no predicate may read from VCP internal state, Git internals, environment variables, credentials, network services, or arbitrary parent/sibling paths merely because a community bundle requests it;
- invalid/over-budget detector definitions fail validation before capability composition.

A selected/digest-pinned community profile is still not a license to weaken project-root privacy/safety boundaries.


## 6.6 Definition of done

- existing schema-v1 community plugins continue to load unchanged;
- community profile/plugin schema v2 is strict rather than a permissive extension of plugin schema v1;
- a new ecosystem profile can be added without arbitrary executable plugin code;
- detector DSL evaluation remains deterministic, selected-project-root bounded, symlink-safe, resource-bounded, and content-nonleaking;
- community detection contributions require explicit selection/digest/grant;
- first-party and community profile data normalize into the same deterministic evidence model while retaining different trust provenance and application authority;
- profile-proposed commands remain proposals until project adoption;
- tampered/incompatible profile state fails before lifecycle mutation;
- community profile support cannot weaken core VCP invariants.

# 7. Workstream E — Project-aware CI integration

## 7.1 Current situation

Current GitHub asset installation groups issue/PR hygiene together with `.github/workflows/validate.yml`.

Doctor also treats that exact workflow path as the CI-validation signal.

This couples VCP's source-repository npm workflow to arbitrary consumer projects.

## 7.2 Phase E1 — remove the unsafe assumption first (Stage-12 safety floor)

Before generating any new VCP CI:

1. stop installing the hard-coded npm validation workflow into arbitrary **fresh** consumers;
2. split GitHub issue/PR scaffolding from CI integration on new Adaptive install surfaces;
3. inspect and preserve existing project CI as project-owned state without claiming semantic coverage;
4. make the Stage-12/13 planner treat CI as preserved project state, not a template target;
5. make Stage-12 Doctor/install-health logic assetSet-aware so absence of `.github/workflows/validate.yml` is expected for `greenfield-safe-v1` and `brownfield-minimal-v1`;
6. keep existing `legacy-full-v1` managed `validate.yml` stable until the explicit Phase-3 migration path evaluates it;
7. keep the canonical old workflow **inside the VCP package as a legacy lifecycle/migration asset** until that migration is complete, even though fresh greenfield/brownfield desired surfaces no longer install it.

Stage 12 does **not** need the full provider-neutral CI inspector. Until Phase 3, Doctor may report CI coverage as unassessed/unknown for the new safe asset sets; it simply must not diagnose the intentionally absent legacy workflow as a broken VCP install.

Do not wait for full Auto mode to stop the harmful fresh-install behavior. Do not create surprise deletion in the same schema-migration step used merely to introduce Adaptive lifecycle state.

## 7.3 Preserve `includeGitHub` compatibility

Existing manifests and lifecycle code already store `install.includeGitHub`.

Its transition semantics are install-surface-aware:

~~~text
legacy-full-v1
→ preserve the historical meaning until the old managed validate.yml migration runs

greenfield-safe-v1 / brownfield-minimal-v1
→ includeGitHub means optional GitHub hygiene/scaffolding such as issue/PR templates
→ it does not imply VCP CI
~~~

Future CI integration becomes separate state/policy.

After legacy workflow migration compatibility is no longer needed, a future major version may rename or retire the historical field.

## 7.4 CI inspection — Phase 3

After the Stage-12 safety floor, add one provider-neutral CI inspection layer in Phase 3.

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

When the old managed `.github/workflows/validate.yml` leaves the legacy desired consumer set, remove it only through an explicit lifecycle migration.

Packaging and consumer installation are separate concerns during the bridge:

~~~text
Stage 12 package
→ still contains canonical legacy validate.yml
→ legacy-full-v1 desired-state/update can reproduce/merge it
→ greenfield-safe-v1 and brownfield-minimal-v1 do not install it

Phase 3 migration
→ old managed workflow explicitly DELETE/DETACH/PRESERVE according to lifecycle rules

after migration compatibility is no longer needed
→ package may stop shipping the legacy workflow asset
~~~

Do not use "not installed on fresh projects" as a reason to remove bytes that a supported old-install lifecycle still needs.

Existing update semantics should decide:

- unmodified VCP workflow → removable;
- locally modified workflow → detach/preserve;
- unrelated workflows → untouched.

The update dry-run must make this visible.

## 7.6 Phase E2 — integrate CI only after `vcp gate` exists

Once the mechanical gate exists, CI may delegate the final VCP decision, but VCP must not pretend that running the CLI is the whole project CI environment.

The authority boundary is:

~~~text
project-owned CI bootstrap / toolchain / dependency / service setup
        ↓
VCP gate
        ↓
deterministic pass/fail/block
~~~

> **VCP owns the gate contract; the project owns the execution environment unless a supported profile proves that environment deterministically.**

Preferred integration order:

1. inspect existing CI and identify a safe explicit integration point;
2. when requested, add/propose the smallest gate invocation **after** the project's existing setup;
3. otherwise provide a provider-specific snippet/instructions rather than rewriting unrelated workflows;
4. generate a standalone workflow only when deterministic first-party/profile evidence plus explicit project policy provides every prerequisite needed by the approved gate verification commands.

VCP must not invent:

- dependency-install/bootstrap commands;
- application runtime/toolchain versions beyond what VCP itself requires;
- databases, queues, caches, or service containers;
- browser/native/mobile SDK setup;
- secrets/credentials;
- migration/seed/bootstrap commands;
- project-specific environment variables.

For material task-bound work:

~~~text
<project-owned setup>
vcp gate <explicit-task-slug> --run
~~~

Task selection is repository/CI configuration. Gate validates the task it is given; it does not scan prose and guess which Task Pack owns a PR.

For L0:

~~~text
<checkout with explicit base/head refs available>
vcp gate --level l0 --base <base> --head <head>
~~~

A shallow checkout or unavailable base/head must block clearly rather than substituting a guessed comparison.

Do not maintain one application verification-command list in Task Packs and another independent list in generated YAML. CI may contain environment/bootstrap steps, but the actual verification authority remains VCP/task state.

Branch protection remains platform/repository policy. VCP may expose a check result but must not claim control over merge policy it does not own.

## 7.6A When CI is actually merge-authoritative

A VCP gate workflow/check is deterministic evidence, but it is **not automatically
a merge-enforcement boundary** merely because it ran.

For GitHub, it becomes merge-enforcing only when repository/platform policy actually
requires the relevant check for the protected/ruleset-governed branch (or merge
queue), with bypass rules understood.

Phase 8 must therefore distinguish:

~~~text
gatePolicy
→ VCP/project intent: disabled | advisory | required

platformEnforcement
→ detected-required | detected-not-required | unverified | unsupported
~~~

If VCP cannot inspect or configure the platform rule, Doctor/status must say so.
`gatePolicy=required` must not be reported as "enforced" unless the platform check
requirement is verified or the user explicitly records that enforcement is managed
outside VCP.

Merge queues also require the CI trigger/check to run on the platform's merge-queue
event where applicable.

VCP does not own branch protection/rulesets and must not imply otherwise.

---

## 7.7 Definition of done

- fresh Python/Go/unsupported projects never receive npm-specific VCP CI;
- existing CI is untouched by init;
- Doctor detects CI through a provider-neutral inspector;
- `includeGitHub` no longer implies npm CI;
- old managed `validate.yml` has an explicit migration path;
- no generated VCP CI is introduced before the gate contract exists;
- later CI integration delegates to deterministic VCP gate rather than duplicating project verification logic;
- standalone workflow generation never fabricates project bootstrap/toolchain/services;
- missing Git refs or unsupported environment prerequisites block instead of being guessed.

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


## 8.1A Routing mode and enforcement policy are separate

`workflowMode` answers:

~~~text
How does a developer request enter VCP?
auto   → agent/Skill routes automatically when appropriate
manual → only explicit VCP invocation enters the workflow
~~~

It does **not** answer:

~~~text
Must this repository produce a green VCP gate before merge?
~~~

That is a separate repository/CI enforcement policy.

Initial model, conceptually:

~~~text
workflowMode
  auto | manual

gatePolicy
  disabled | advisory | required
~~~

Exact persisted naming can be finalized in Phase 8, but these dimensions must not be collapsed.

Compatibility/defaults:

- enabling Auto does not silently enable gatePolicy=required;
- new/legacy projects do not become mechanically merge-blocked merely because workflowMode defaults to Auto;
- changing workflowMode never changes gatePolicy;
- mandatory CI/gate enforcement is a separate explicit project decision/integration;
- behavior-bearing persisted gatePolicy state must participate in minimumReaderVersion compatibility.

Manual + required is valid only as an explicit configuration. Its meaning is:

~~~text
ordinary coding request
→ agent does not auto-enter VCP

before merge of a gate-covered change
→ developer must explicitly invoke/prepare the required VCP task/evidence
→ otherwise CI/gate blocks
~~~

Therefore Manual mode means **no automatic routing**, not an unconditional exemption from a separately enabled repository merge policy.

UX/Doctor must surface this combination clearly so users are not surprised at merge time.

## 8.2 Store operating mode as project state

Persist the operating mode in VCP lifecycle state.

For the initial implementation, manifest install metadata is sufficient. Because workflowMode changes generated/managed routing instructions, the release that persists it as behavior-bearing state must also raise minimumReaderVersion:

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

Workflow mode is a user-experience preference, not a repository fact to "detect".

When the feature ships:

- new installs default to `auto` unless the developer explicitly selects `manual`;
- `--workflow-mode manual` is the explicit opt-out from automatic routing;
- old manifests without `workflowMode` normalize to Auto-compatible behavior because current VCP already uses agent-first routing;
- defaulting/interpreting Auto changes routing instructions only; it does **not** silently enable new CI/gate/merge enforcement. Those enforcement integrations remain separately explicit/configured.

## 8.2A Nested/path-specific agent instructions are an Auto-routing limitation

Modern coding agents can apply repository instructions hierarchically. A nested
`AGENTS.md`, override file, or path-specific instruction may take precedence over
or combine with the repository-root VCP routing block for files under that path.

Therefore:

- root VCP standing instructions are **best-effort routing**, not a universal
  deterministic interception boundary;
- Smart Init must not recursively rewrite nested/path-specific project instructions;
- repository inspection may inventory supported nested instruction surfaces, but
  observation never creates VCP ownership;
- Doctor/status should surface potentially shadowing/overriding instruction scopes
  when Auto mode relies on the root integration;
- Auto correctness must still be enforced by Core/gate for gate-covered work;
- if a future feature wants VCP path-specific routing, it requires an explicit
  ownership/design contract rather than copying the root block into subdirectories.

Conformance must include a repository with a nested `AGENTS.md` whose local rules
differ from root routing and prove that VCP does not overwrite it or falsely claim
universal Auto interception.

---

## 8.3 Auto-mode agent instruction

The final Auto-mode adapter policy should be concise:

> For meaningful repository changes, route work through the VCP workflow appropriate to the change. Do not bypass deterministic readiness, authority, verification, or review gates. Use the lightest workflow level that safely fits the change.

But stage the wording with the implementation:

### Phase 6

Workflow levels/gate do not exist yet.

Render only the truthful routing foundation, conceptually:

> Route meaningful engineering work through the currently supported VCP workflow. Respect current readiness, Source-of-Truth, verification, and review requirements.

Do **not** mention L0/L1/L2/L3, `vcp gate`, or "lightest level" in installed instructions before Phase 7 actually ships those contracts.

Phase-6 Auto is therefore a routing/UX foundation and dogfood surface, **not the completed adaptive ceremony experience**.

### Phase 7

Once level-aware Task Packs/readiness/context/review/gate exist, update the owned VCP instruction section/router to the final "lightest safe workflow level" policy.

Checkpoint C evaluates Auto only after this Phase-7 transition.

Avoid embedding the full VCP manual in `AGENTS.md`.

## 8.4 Manual-mode instruction

Manual mode should be lightweight:

> VCP is available in this repository. Use the VCP workflow when the developer explicitly requests it or invokes the installed VCP Skill/command.



## 8.5 Auto mode must not mean maximum ceremony

Workflow levels require VCP Core support, not prompt labels alone.

The code audit confirms that today's generated Task Pack and implementation readiness contract are intentionally comprehensive: security/privacy, observability, multiple test layers, rollout/recovery, review evidence, and finalization all participate. That is appropriate for material work, but it creates too large a jump between a trivial L0 change and ordinary small engineering work.

The first workflow-level implementation should therefore support all four conceptual levels, while keeping L1 deliberately compact.

### L0 — trivial

Examples:

- spelling/wording corrections in non-governing docs;
- comments;
- formatting-only changes;
- mechanically obvious metadata changes proven low-risk by policy.

Requirements:

- no durable Task Pack;
- relevant deterministic checks only;
- actual changed surface must remain eligible;
- final gate/review path can reject L0 if the diff crosses a protected surface;
- **no universal extension/path heuristic may make L0 eligible by itself**;
- initial L0 is disabled unless the selected project has an explicit, inspectable deterministic trivial-surface policy; absent policy → minimum L1.

The initial policy should combine:

~~~text
project-approved trivial path/surface allowlist
        +
VCP built-in never-L0 protected classes
        ↓
eligible L0 surface
~~~

Built-in protected classes include VCP lifecycle/task/instruction state, CI/build/dependency/config authority, migrations/data, security-sensitive policy, and other mechanically recognized material contracts. Project policy is still needed because VCP cannot know every custom governing document by filename.

Do not infer `*.md = L0`. A Markdown file may be authoritative product, architecture, security, migration, or operational truth.

### L1 — bounded engineering

Examples:

- narrow bug fix;
- regression test;
- small internal refactor;
- localized configuration/code correction with no material product/API/data/security decision.

Use a compact durable change contract rather than the full L2 Task Pack.

Minimum content should be small and enforcement-driven, for example:

~~~text
Outcome / problem
Governing authority state (reference(s) or task-local authority)
Affected scope
Acceptance evidence
Verification
Lightweight review outcome / current findings
Risk/escalation flags
Completion/evidence summary
~~~

L1 does not require empty security/observability/rollout sections, but it also does not bypass authority or fresh-review invariants.

### L1 governing-authority rule

`Governing reference(s), when applicable` is not permission to omit authority casually.

For L1, use this order:

~~~text
existing governing repository/workspace document applies
→ reference it

no separate governing document applies
+ task is a bounded defect/internal-maintenance request
+ intended result is fully captured by explicit task outcome/acceptance
+ no unresolved HUMAN DECISION exists
→ the durable L1 Task Pack may itself preserve the accepted task-local intent

material product/API/data/security/architecture/compatibility/migration/rollout decision appears
or expected behavior cannot be established safely
→ L1 is insufficient
→ promote to L2/L3 and resolve/reference governing authority
~~~

Do not create a fake PRD merely to satisfy L1. Do not mark authority 'not applicable' when a real governing document or unresolved human choice exists.

This is consistent with the current Task Pack rule that an approved bounded decision may be recorded in the task itself while material durable policy belongs in governing Source of Truth.

If a material product/API/data/security/architecture decision is discovered, promote to L2/L3.

Do not require empty security/observability/rollout sections merely to prove they were considered.

If investigation reveals material product behavior, public contract change, migration/data impact, security-sensitive behavior, or another protected condition, promote the work to L2/L3 before continuing.

### L2 — material product/behavior change

Keep the existing full Task Pack + readiness + bounded context + verification + review lifecycle as the main path for material changes.

### L3 — high-risk change

Extend L2 with stronger relevant controls based on deterministic/project-declared evidence such as:

- active security profiles;
- migration/data impact;
- protected surfaces;
- explicit workflow policy;
- human-selected risk requirements.

L3 does **not** silently inject security-profile files into plan/implement context. When security profiles are applicable, require a dedicated security Context Pack/review so the existing Stage 6 context contract remains intact. Governing security Source of Truth may still be referenced normally by other modes.

Security-profile presence alone is not the trigger: the mandatory `baseline` profile exists whenever security mode is used. The trigger is the deterministic L3 risk policy; once triggered, the active profile set scopes the review.

A gate-authoritative L3 security review also needs **exact changed-surface provenance**.

Current code only allows Git `--base/--head` comparison in `contextMode=review`. Phase 7 must deliberately extend the same bounded Git review snapshot to `contextMode=security` when explicit base/head is supplied:

~~~text
vcp context <task> --mode security --base <base> [--head <implementation-head>]
~~~

This does not make security profiles load in plan/implement mode. It only lets the dedicated security pack include:

- exact resolved base/head SHAs;
- bounded changed-file/diff evidence;
- active security profiles;
- governing security Source of Truth;
- the canonical security-review prompt.

When security review is required, L3 must persist a distinct bounded **security review evidence** record in the same Task Pack. It must be distinguishable from ordinary independent code-review evidence and retain at least:

- reviewed base/head provenance;
- active profile IDs/source provenance relevant to the review;
- a compact resolved-security-guidance identity: the canonical **content digest**
  of the resolved guidance (package version recorded as metadata only, NOT part of
  the fingerprint — [AUDIT 2026-10-06] including the version in the fingerprint
  invalidates every pending security review on routine CLI patch upgrades, creating
  upgrade aversion → version pinning → fleet fragmentation → stale guidance, the
  exact loop the fingerprint was meant to prevent) so unchanged profile names
  cannot hide changed guidance;
- material security findings with severity and current-task disposition;
- resolution/follow-up;
- unresolved HUMAN DECISION / risk-acceptance boundaries.

At gate time, recompute the required active security profile/guidance identity. If the required profile set or resolved packaged/project profile content changed since security review, that review is stale and must be repeated.

The ordinary L2 independent review is still required. “Security review” is an additional focused control, not a replacement.

For finalization authority, required ordinary review and required security review should both bind to the same final implementation head. Any non-finalization implementation/config change after either review makes the affected review stale; the existing bounded Task-record-only finalization exception may apply afterward.

Potential requirements also include rollback/recovery evidence, sensitive-effect authorization, and stricter exact-head gating.

The L3 extension must remain relevant: do not make every high-risk category load every possible security/operations document.


## 8.5A One Task Pack family, level-aware contracts

Do not create a second L1 task database or directory.

All durable engineering tasks remain repository-native Task Packs under the existing task path model.

New level-aware tasks persist:

~~~text
Workflow-Level: L1 | L2 | L3
~~~

Compatibility rules:

- existing Task Packs with no `Workflow-Level` normalize to **L2**;
- current full Task Packs therefore keep current readiness/review/finalization semantics without migration churn;
- once Phase 7 ships, ordinary `vcp task <slug>` without an explicit level remains L2-compatible for manual/legacy callers;
- Auto/router flows may explicitly create L1/L2/L3 after inspection/classification;
- L0 has no Task Pack and therefore no level field.

Readiness remains one command family but becomes level-aware:

~~~text
L1 plan readiness
→ compact outcome / explicit governing-authority state / scope / acceptance / human-decision checks

L1 implement readiness
→ above + compact implementation approach + approved verification contract

L2
→ current full plan + implementation readiness contract

L3
→ L2 + only relevant high-risk prerequisites
~~~

L1 keeps a compact durable implementation approach so VCP preserves plan-before-code and restartability without forcing the full L2 template.

L1 also requires an **explicit governing-authority state** rather than optional omission:

~~~text
governing references
→ one or more actual project/workspace Source-of-Truth references

or

task-local authority
→ this accepted bounded L1 task outcome + acceptance criteria are the applicable lower-tier requirement authority
~~~

There is no passing "no authority" state.

The parser/readiness engine distinguishes:

~~~text
references
task-local
missing
invalid
~~~

`missing` and `invalid` block readiness.

`task-local` is allowed only for bounded defect/internal-maintenance work where:

- no higher governing repository/workspace document applies;
- intended behavior is fully established by the developer request + repository evidence + accepted task outcome/acceptance;
- no material HUMAN DECISION remains;
- Core protected-surface/risk evidence does not require stronger governing authority.

This follows the existing Source-of-Truth hierarchy, where approved task scope/decisions are already durable authority below product/security/architecture/API/data contracts.

Do not allow a blank section or "not applicable" to mean authority is absent. If Core/review later discovers a governing contract or material product/security/data/architecture/compatibility/migration decision, require references and/or promote to L2/L3.

`Lightweight review` in L1 means less review surface/ceremony, **not weaker provenance**:

- use the same finding classes/dispositions as the current review model;
- gate-authoritative L1 review is fresh and bound to an exact Git review surface/head just like L2/L3;
- persist only the material findings/current disposition and resolved reviewed-head provenance needed for restartability/gate;
- do not create a separate low-trust "quick review" state that gate accepts.

Context construction becomes level-aware as well: L1 plan/implement contexts stay compact; L2/L3 retain current bounded context behavior plus only relevant L3 dedicated review/security/release evidence.

## 8.5B Promotion and downgrade semantics

Workflow level is a minimum safety contract, not a cosmetic label.

- Core may always promote when new repository/diff evidence requires a higher level;
- L0 → L1/L2/L3 creates the durable Task Pack before further material implementation;
- L1 → L2/L3 expands the **same** Task Pack deterministically and preserves existing evidence/history;
- L2 → L3 adds only relevant high-risk sections/evidence; it does not replace the task;
- promotion invalidates lower-level review/finalization evidence that is no longer sufficient and readiness is recomputed;
- Core never auto-downgrades;
- an explicit downgrade may be allowed only before material implementation/review/finalization evidence exists, only when the recomputed deterministic minimum permits it, and must be visible in task/reporting history;
- final gate recomputes the minimum from the actual diff, so a lower stale label cannot pass an under-classified change.

Late promotion must preserve historical truth:

~~~text
promotion discovered before implementation
→ expand task
→ satisfy higher-level readiness
→ continue normally

promotion discovered after implementation has started or at final diff
→ stop the lower-level completion path
→ expand the same task
→ record that escalation occurred after implementation began
→ reconstruct the stronger current-state contract from repository evidence
→ resolve any newly exposed HUMAN DECISION before further risky work
→ correct implementation as needed
→ perform full higher-level verification/review/final gate
~~~

Do **not** fill a higher-level plan afterward and describe it as if it existed before the code. A recovered late promotion may become acceptable current-state evidence, but it is not evidence that the original implementation followed the stronger workflow from the start.

The completion report should retain a bounded escalation note when that distinction materially affects auditability.

Do not implement promotion by `--force`-rewriting a Task Pack. Use a bounded level migration/expansion primitive with idempotence tests.

## 8.6 Classification must happen after inspection and remain promotable

Do not lock the workflow level from the user's first sentence alone.

Use a two-stage model:

~~~text
user intent
   ↓
provisional route
   ↓
inspect repository + likely affected surface
   ↓
determine effective workflow level
   ↓
implement
   ↓
re-evaluate against actual diff at gate
~~~

The agent/Skill may recommend a level from semantic intent.

VCP Core should compute deterministic minimum requirements from facts it can prove, such as:

- actual/proposed changed paths;
- project capability/profile state;
- migrations/data markers;
- protected-path policy;
- public contract/config changes;
- security-sensitive surfaces;
- final Git diff characteristics.

Conceptually:

~~~text
agent proposed level
        +
VCP deterministic minimum
        ↓
effective level = highest required
~~~

Work may automatically **escalate** when new evidence appears.

A lower level must never remain valid merely because it was chosen before the risky surface became visible.

At final gate, VCP recomputes minimum eligibility from the actual changed surface and fails with an actionable promotion requirement if the selected workflow was too light.

Human intent remains necessary for decisions such as accepted risk, architecture direction, compatibility policy, destructive migration approval, and product behavior.

Avoid fuzzy model-confidence scores as the Core authority. Use explicit evidence and policy where software can decide, and HUMAN DECISION where it cannot.


## 8.7 Definition of done

- project mode is persisted and inspectable;
- mode can be changed deliberately without reinstalling VCP;
- Auto mode requires no user knowledge of VCP CLI for normal work;
- Manual mode does not hijack ordinary coding requests; if separate required gate policy is enabled, that requirement is reported explicitly rather than hidden behind the mode;
- L0 handles only explicitly policy-eligible trivial work without durable ceremony and otherwise promotes conservatively;
- L1 gives ordinary small engineering work a compact contract inside the same Task Pack family instead of forcing the full L2 template;
- L2 preserves the current strong material-work lifecycle;
- L3 adds only relevant high-risk controls;
- classification occurs after repository inspection, can escalate during work, and is revalidated against the final diff;
- material/high-risk changes cannot pass through a lower lane because of an early agent guess;
- mode behavior remains agent-agnostic.

# 9. Workstream G — Cross-agent Skills as the UX layer

## 9.1 Current situation

VCP already contains prompts for discovery, planning, implementation, review, and security.

They describe strong behavior, but invoking the workflow can still feel like operating a CLI/framework.

Modern agent environments can install portable Skills across multiple coding agents.

Therefore portability alone is not a reason to prefer VCP over Skills.

## 9.1A Problem and affected surfaces

Without a Skill/UX layer, VCP risks exposing deterministic machinery as the product experience: developers must remember commands, phases, and bookkeeping even when the underlying Core already knows the state.

The opposite failure is equally dangerous: putting durable policy/state into Skills creates a second source of truth whose behavior varies by host loading semantics.

This Workstream therefore affects:

- Auto/Manual routing UX;
- standing AGENTS/CLAUDE/Copilot instruction size;
- packaged prompt/Skill distribution;
- prompt-eval behavior coverage;
- human-attention budget;
- Context Pack invocation;
- cross-agent portability;
- gate/readiness result presentation.

It does **not** migrate repository truth out of VCP Core. Task Packs, manifest state, readiness, verification, review provenance, and gate remain Core-owned.

There is no data migration in the normal sense. Existing prompts remain canonical behavioral inputs until a Skill references/routes through them; Skill rollout is package/UX migration with behavior-eval compatibility, not lifecycle-state migration.

## 9.2 Target and staged surface

Ship thin Skills that make VCP pleasant to use, but stage them deliberately.

Phase 6 ships the one package-owned primary `/vcp`-style router required by Auto/Manual UX.

Phase 9 may add specialized Skills/references only after the underlying workflow-level/gate contracts stabilize.

Potential eventual user surfaces:

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

## 9.2A Task Packs are not Skills

Do not serialize Task Packs as `SKILL.md`.

The two artifacts have different ownership and lifecycle:

~~~text
Skill
→ reusable procedure / interaction capability
→ may be discovered/lazy-loaded **or eagerly preloaded**, depending on the agent runtime
→ portable UX/instructions/scripts/resources
→ may invoke VCP Core

Task Pack
→ one change/task's durable repository state
→ accepted requirement/authority references
→ readiness + implementation contract
→ verification/review/finalization evidence
→ inspected mechanically by Core/gate
~~~

A Skill may create, explain, read, or update a Task Pack through VCP commands.
It must not become the authoritative storage format for that task's lifecycle state.

This preserves the Core/Skills boundary and avoids coupling task durability to any
one agent platform's Skill discovery/loading semantics.

---

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

For the full Workstream-G / Phase-9 outcome:

- the Phase-6 primary router remains the default entry point;
- at least the primary supported agents can install/use equivalent VCP Skills;
- the Skills contain little duplicated policy;
- switching agents does not change repository truth;
- Manual mode can be operated entirely through explicit Skill invocation;
- Auto mode can use the same Skills internally without requiring users to invoke them;
- discovery/grill behavior is clearly available through UX, not hidden only in documentation.

---


# 10. Workstream H — Mechanical `vcp gate` and deterministic enforcement

## 10.1 Problem

Agent routing instructions—Auto or explicit Manual invocation—are still not merge authority by themselves.

The repository already has much of the deterministic machinery needed for a real gate, but those facts are not yet joined into one completion decision.

The gate is independent of `workflowMode`:

- Auto may use it as deterministic outcome protection;
- Manual may use it explicitly/advisorially;
- a separately configured `gatePolicy=required` may require it for merge-covered work in either routing mode.

## 10.2 Reuse existing deterministic components

`vcp gate` should aggregate rather than replace:

- `readiness.mjs` for Task Pack structural readiness;
- `verify.mjs` for approved command execution/results;
- verification Git provenance for selected-project/current revision facts;
- `git-review.mjs` for bounded changed-surface/base/head review;
- Task Pack finalization/review evidence.

Do not create a second verification engine.


## 10.3 Add a canonical task-state parser

Current readiness/review/finalization requirements are partly prose contracts.

Before gate grows, add one shared parser/state model for L1/L2/L3 that exposes at least:

- top-level task status;
- slug;
- workflowLevel;
- normalized governing-authority state where the level requires it;
- acceptance state;
- verification-command declarations;
- independent review findings/dispositions;
- **review provenance** sufficient to identify the reviewed Git surface/head;
- finalization/completion state appropriate to the workflow level.

Readiness, context, review tooling, and gate should progressively share this parser so they cannot disagree about the same durable task artifact.

Do not create a separate hidden task database.

## 10.4 Gate contracts by workflow level

The gate must not pretend every level has the same artifact shape.

### L0 — changed-surface gate only

Initial L0 should be intentionally narrow and non-executing.

Command shape:

~~~text
vcp gate --level l0 --base <ref> [--head <ref>] [--json]
~~~

Rules:

- no Task Pack is required;
- --base is required; --head defaults to HEAD;
- only surfaces allowed by the explicit selected-project L0 policy may pass;
- if no L0 policy is configured, return an actionable promotion to L1 rather than guessing;
- VCP built-in protected classes override/deny an unsafe trivial allowlist entry;
- protected source/config/security/build/migration/public-contract/VCP-lifecycle surfaces force promotion;
- dirty/unbounded state that prevents trustworthy changed-surface inspection blocks;
- **if project-specific executable verification is required, the work is not L0 and must promote to at least L1**.

This keeps L0 genuinely trivial rather than creating a second ad-hoc verification model.

### L1 — compact durable engineering gate

Command shape:

~~~text
vcp gate <task>
vcp gate <task> --run
~~~

L1 gate requires the compact durable record and checks:

- governing-authority state is explicit: valid reference(s) or allowed task-local authority; missing/invalid authority never passes, and Core risk/protected-surface evidence can invalidate task-local authority and require references/promotion;
- outcome/scope/acceptance evidence is complete;
- unresolved HUMAN DECISION/blockers are absent;
- required configured verification runs successfully in --run mode;
- lightweight fresh review outcome has no unresolved must-fix finding;
- review provenance still corresponds to the implementation surface, allowing only the bounded finalization edit described below;
- current final status/completion evidence is structurally complete for L1.

L1 does **not** require the full L2 plan/readiness/security/rollout template.

### L2 — current material-work gate

L2 preserves the current full lifecycle:

- plan readiness;
- implementation readiness;
- acceptance criteria;
- configured verification;
- fresh independent review;
- full finalization/completion contract;
- exact-head executable rerun.

### L3 — L2 plus relevant high-risk gates

L3 adds only applicable high-risk requirements, for example:

- distinct Git-bound security-mode review evidence when active security profiles/risk policy require it;
- proof that required ordinary and security reviews cover the same final implementation head before finalization;
- migration/recovery/destructive-effect authorization;
- stronger release/deployment/data-safety evidence.

Gate validates that required human approvals/reviews exist; it does not manufacture approvals or perform AI review itself.

## 10.5 Preserve the existing review → finalization → rerun protocol

The future gate must enforce, not replace, the current Task Pack completion rule.

**Normative precision (C-10):** Technical document T §14.9 is authoritative for the byte-exact *relevant worktree* definition (allowing only declared `verification.outputs`), append-only evidence semantics and the versioned CI-consumable gate receipt. This strategic section states policy/rationale and must not create a second inconsistent gate-receipt specification.

For L1/L2/L3:

~~~text
implementation head
→ executable verification
→ fresh review on explicit Git surface/head
→ persist review outcome + review provenance
→ Task-record-only finalization edit
→ finalization head
→ vcp gate <task> --run on that unchanged finalization head
→ pass permits merge
~~~

The gate must distinguish:

1. the head/surface that was independently reviewed;
2. the finalization head on which executable verification is rerun.

A review head does not have to equal the finalization head **only** when every intervening commit/change is confined to the same task record and the changed task sections are semantically allowlisted review/finalization evidence.

Allowed post-review task-record changes may include:

- ordinary independent-review findings/dispositions/resolution/follow-up/residual-risk evidence;
- required L3 security-review findings/dispositions/provenance when that review is bound to the same unchanged implementation head;
- Status transition into Review/Done;
- Finalization checklist state;
- Completion report / verification-evidence summary.

They must **not** change after the recorded review without invalidating it:

- outcome/requirement restatement;
- governing Source-of-Truth references;
- acceptance criteria;
- scope/boundaries/invariants;
- security/data/API/migration requirements;
- verification command declarations;
- approved implementation plan.

Path-only checking is insufficient.

The reviewed implementation head must be an exact committed Git head. Gate verifies that it is an ancestor of the current finalization head and that the intervening task-record diff stays inside the semantic allowlist.

If any implementation/config/other docs change after review, or if protected task semantics change:

- review provenance becomes stale;
- gate fails/blocks;
- fresh affected review(s) are required before finalization/gate can pass again.

This requires minimal durable review Git provenance and parser-visible section boundaries. Exact Markdown field names can be chosen during Phase 7, but the information cannot remain chat-only.

L0 has no task finalization sequence.

### Git requirement for a merge-authoritative pass

`vcp gate` does not require GitHub, but the initial merge-authoritative gate **does require a local Git worktree**.

- L0 requires explicit base/head Git comparison;
- L1/L2/L3 review provenance must resolve to exact commit SHAs;
- final gate pass requires the reviewed head and current finalization head to be committed/inspectable;
- `--run` merge-authoritative pass requires a clean relevant worktree before execution and the same clean HEAD after verification commands;
- a dirty/non-Git environment may still use readiness/verify/preview mechanics, but gate returns blocked/non-authoritative rather than claiming merge readiness.

This distinguishes `works without GitHub` from `works without Git provenance`.

Gate-eligible review should use Git-aware review context with explicit base and a resolved implementation head; legacy unbound review context remains usable outside gate authority.

## 10.6 Evidence freshness must be current-state aware

Do not trust an old JSON evidence file solely because it once passed.

Verification provenance is captured before command execution, and writing retained evidence can itself affect worktree state.

For L1/L2/L3 --run:

~~~text
vcp gate <task> --run
   ↓
reuse readiness/task-state logic for the selected level
   ↓
execute verification through the existing verify engine
   ↓
validate durable review/finalization requirements
   ↓
reinspect current HEAD + dirty state
   ↓
return explicit gate result
~~~

Saved verification evidence remains useful for audit/handoff, but it is not by itself merge authorization.

The gate itself performs deterministic checks/execution only. It never claims to have carried out an independent AI review.

## 10.7 Local and CI enforcement

The same deterministic gate contract must work locally and in CI.

Later CI integration delegates to:

~~~text
L0:
vcp gate --level l0 --base <ref>

L1/L2/L3:
vcp gate <task> --run
~~~

Branch protection, task selection for a CI job, and merge policy remain explicit repository/platform policy.

## 10.8 Definition of done

- gate reuses readiness/task-state and verification machinery;
- L0 has one explicit no-Task-Pack changed-surface contract;
- L1 has a compact but restartable verification/review gate;
- L2 retains current full guarantees;
- L3 adds only applicable high-risk requirements;
- stale old-head verification cannot pass;
- stale review provenance cannot pass after implementation-surface or protected task-contract changes;
- post-review task-file edits are checked by allowed semantic sections, not path alone;
- merge-authoritative pass requires local Git provenance and a clean committed final head;
- the canonical Task-record-only finalization head transition is supported;
- post-run current Git state is inspected;
- unresolved must-fix review evidence cannot pass;
- gate never substitutes deterministic checks for HUMAN DECISION or independent AI review;
- human/JSON output exposes exact pass/fail/block reasons;
- gate works without GitHub;
- CI can invoke the same contract without reimplementing it.

# 11. Workstream I — Compatibility and conformance matrix

## 11.1 Goal

Do not claim “works on every project” based only on framework unit tests.

Prove adoption properties across deliberately difficult repository shapes.

## 11.2 Required fixture matrix

At minimum:

### Repository maturity

- truly empty/new repository;
- freshly git-initialized but otherwise empty repository;
- ambiguous root with one unfamiliar project-owned file;
- small existing repository;
- large established repository;
- already VCP-managed repository;
- pre-Adaptive/schema-v1 managed repository;
- readable managed repository with damaged/missing lifecycle support state;
- lifecycle manifest requiring a newer minimumReaderVersion than the running CLI.

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
- all of the above with local custom text;
- brownfield `--yes` / no explicit `--agent` with only one existing vendor adapter;
- ignored then re-tracked brownfield section-owned integration;
- nested/path-specific `AGENTS.md` under a subtree that changes instruction precedence without giving VCP ownership of that file.

### CI

- no CI;
- existing GitHub Actions;
- multiple GitHub workflows;
- unknown/custom CI;
- CI with commands that differ from VCP defaults;
- GitHub required-check configuration detected vs not-required vs unverified;
- merge-queue repository requiring `merge_group`;
- required VCP gate job with no path filters that can silently skip it;
- material PR with one valid task selector, no selector, invalid selector, and multiple selectors.

### Repository complexity

- symlinks;
- dirty worktree;
- pre-existing docs paths;
- unusual line endings;
- case-sensitive/case-insensitive filename scenarios;
- malformed manifests/config files;
- missing tools;
- brownfield-minimal repository with no VCP starter Product/Architecture/Security/Testing documents;
- custom governing Markdown located in a path that must never become globally L0 merely because it is `.md`;
- valid decisions-only answers record whose decision remains valid at apply;
- stale answers record whose decision disappeared or whose allowed value changed;
- duplicate-equivalent verification commands in multiple project-owned locations;
- auto-core capability whose detector evidence disappears after it was applied.

## 11.2A Platform evidence is separate from fixture coverage

A repository fixture can prove path/manifest/planner semantics without proving that the released CLI has executed successfully on every operating system/runner.

Keep two evidence classes separate:

~~~text
semantic fixture coverage
→ deterministic logic across repository shapes

platform execution evidence
→ actual CLI/release gate executed on the named OS/runner/toolchain
~~~

Rules:

- do not claim Linux/macOS/hosted support from Windows-only fixture success;
- do not claim GitHub Actions support merely because workflow generation/tests pass;
- Phase 10 release evidence records exactly which OS/runtime/Git channels actually executed;
- unresolved platform channels remain explicit compatibility follow-ups rather than being hidden by a green generic matrix;
- current #69 Linux/hosted boundary remains authoritative until real evidence closes it;
- portable path/case/newline fixtures are still valuable but are semantic tests, not a substitute for native/hosted execution.

Checkpoint/release wording must say `tested on <channels>` rather than `cross-platform` unless all claimed channels have executable evidence.

## 11.3 Success properties

The matrix should assert properties, not marketing claims.

For every fixture:

- no unrelated file is deleted;
- no existing agent instruction is silently overwritten;
- no unproven verification command is executed;
- for an unchanged repository snapshot, dry-run and fresh apply planning are semantically equivalent;
- if the repository changes before apply, the apply path re-plans and may differ or block safely;
- omitted brownfield agent selection is not misread as explicit generic, and the next update reproduces explicit adapter intent and VCP-owned sections without taking ownership of merely observed-compatible project files;
- intentionally absent brownfield starter docs do not become install-health/strict failures by themselves;
- packaged prompt fallback reports source/package provenance while remaining self-contained in the Context Pack;
- unsupported ecosystem degrades safely;
- discovered capabilities are evidence-backed and applied capability transitions preserve provenance;
- project-root boundaries remain intact;
- existing CI is preserved;
- a newer same-schema CLI enforces minimumReaderVersion;
- the actual previous released CLI's lifecycle mutators fail before mutation on schema-v2 through the legacy compatibility fence, rather than relying on code the old binary does not have;
- lifecycle state is restartable;
- update after init is idempotent;
- rollback/recovery behavior is correct where applicable, including recovery from a corrupt/missing active manifest using a compatible validated backup;
- valid preview decisions can be reused without constraining fresh planning, while stale/incompatible answers are ignored or re-asked;
- equivalent duplicate command values do not create a fake HUMAN DECISION, while conflicting values still block;
- disappearing auto-core evidence never silently removes the applied capability;
- nested/path-specific agent instructions never cause VCP to claim universal Auto interception.

## 11.4 Golden failure tests

Some fixtures should intentionally fail.

Examples:

- ambiguous agent-file composition;
- conflicting VCP/user block;
- malformed/unreadable reserved VCP lifecycle state;
- minimumReaderVersion newer than the running CLI;
- invalid plugin digest or invalid/over-budget capability detector;
- unsafe symlink/path escape;
- conflicting verification-command authority;
- previous released CLI attempting update/manage/rollback against schema-v2 lifecycle state;
- corrupted active manifest with incompatible/invalid recovery artifact;
- stale/incompatible answers-file replay;
- auto-core evidence disappearance incorrectly causing automatic capability removal;
- nested instruction file incorrectly overwritten or treated as VCP-owned;
- unsupported destructive command proposal;
- L0 requested with no explicit trivial-surface policy or against a custom governing document;
- stale ordinary/security review after the implementation surface moves;
- post-review Task Pack edit that changes protected requirements/acceptance/scope rather than only allowlisted finalization evidence;
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
- documentation claims match exactly what the matrix proves;
- platform-support claims are backed by actual per-platform executable evidence and do not infer Linux/macOS/hosted support from semantic fixtures.

---


### Dependency Graph Engine remains explicitly deferred

The Adaptive roadmap does not authorize persisted dependency-graph/scheduler state.

Workflow levels, gate metadata, review provenance, and task promotion must not become a backdoor for adding:

- persisted dependency edges;
- ready-queue scheduling;
- multi-agent work dispatch;
- graph recomputation state.

Keep the existing protocol-first rule: only revisit the Dependency Graph Engine if new dogfood demonstrates a failure that current Task Pack dependency prose cannot enforce safely.

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

For substantial work **inside the VCP repository that expands VCP Core**, the design/Task Pack should record:

~~~text
## Why this belongs in VCP Core

Failure prevented:
Evidence that the failure is real/repeated:
Why the coding agent alone is insufficient:
Why a Skill alone is insufficient:
Why existing project tooling is insufficient:
Deterministic requirement:
New persistent state:
Migration/lifecycle burden:
User-visible complexity added:
User-visible complexity removed:
Evidence we will collect after dogfood:
~~~

Examples that normally require this review:

- new long-lived CLI command;
- new manifest/persistent state with behavior;
- new migration class;
- new mandatory deterministic gate;
- new managed consumer asset family;
- new background/orchestration machinery.

Tiny refactors, bug fixes, tests, and documentation changes that preserve existing product contracts do not need the ceremony.

**Do not add this section to the generic Task Pack template shipped to VCP consumers.** It is framework-development governance, not application-development paperwork.

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

The Adaptive VCP plan is the umbrella roadmap. The numbered implementation stages are bounded execution slices of that roadmap.

## Interim exact-HEAD verification when GitHub Actions is unavailable (D-06 proposal)

GitHub Actions currently cannot be relied on as an execution gate for this account. Until an independently controlled remote gate is installed and protected, **do not report CI PASS or mechanically enforced merges**. The immediate, reviewable procedure is `node scripts/run-adaptive-local-gates.mjs --expected-sha <exact-PR-head-SHA> --evidence-dir <fresh-absolute-path-outside-repo>`. It performs `scripts/check-adaptive-contracts.mjs` (canonical D-01–D-12 uniqueness, accepted-ID records and 14 focused S/T regression anchors), `npm ci`, `npm run validate` and `npm run pack:check`, with complete raw logs, exit codes, before/after Git state and a versioned local receipt.

Maintainer must review every **final PR HEAD** and local receipt before merge, then repeat at a changed finalization head. The receipt is cooperative evidence, **not** cryptographically independent attestation; pre-push hooks are optional UX only and can be bypassed. A release/phase requiring trusted remote enforcement remains BLOCKED until an actual independent protected gate is deployed (Phase 8). No reduced guarantee or acceptance of D-01/D-06 follows from a green local receipt. See `docs/ADAPTIVE-VCP-LOCAL-GATES.md`.

## Precondition — reconcile merged Stage 11 closeout and re-baseline current main

Stage 11 React Native implementation is already merged on PR #85 and present on current main.

The canonical Stage 11 Task Pack was marked Done at merge, but its required post-finalization exact-head rerun remained unchecked. This consistency audit corrected the Task Pack to Review and found no durable record proving that rerun before merge.

Do not invent historical evidence.

Before Stage 12 product-code implementation:

1. record the Stage 11 closeout evidence gap explicitly in Roadmap/Task Pack status;
2. run and record the appropriate current-main re-baseline verification without pretending it is the missing historical run;
3. re-baseline Roadmap/README/current-source assumptions;
4. create the Stage 12 Task Pack from the reconciled current main.

## Stage 12 — Safe Adoption Planning

Stage 12 spans the enabling parts of Phase 0 plus the adoption-planning portion of
smart adoption.

> [AUDIT 2026-10-06 — PRE-IMPLEMENTATION] Precise boundary (replaces the
> "read-only" shorthand, which is misleading): Stage 12 performs **no Smart Init
> mutation into unmanaged EXISTING repositories**. It DOES migrate already-MANAGED
> schema-v1 repositories to schema v2 through the existing transactional
> `vcp update` path (preview/conflict/backup/rollback/idempotence) — the most
> battle-tested machinery in the codebase, and the only vehicle that can carry the
> first real (non-identity) migration. The adjudicated audit position: the
> migration stays in Stage 12 (moving it to Stage 13 buys nothing — Stage 13's
> generalized rollback handles *absent* prior state, which never occurs in a
> v1→v2 migration), but the stage must not be described or tested as "read-only":
> its exit criteria cover both the adoption planner AND the managed migration,
> including the same-schema `minimumReaderVersion` fixture test and the old-CLI
> rollback release-smoke case.

**Dependency order is normative (C-09/C-12):** semver + common selected-root path helper → centralized manifest metadata → schema-v2 reader guard + INERT field-enumeration test → versioned managed backup/journal recovery → G-FENCE proof → (only if proven) managed v1→v2 migration → sections → assetSet/asset catalog → inspection and raw CLI provenance → command authority + `verify --run` execution boundary → assetSet-aware packaged prompt resolver → safe consumer CI filters → Doctor minimum → init planner → release smoke. The numbered inventory below is a scope list, NOT permission to implement consumers before their dependencies. Prompt resolution explicitly takes assetSet and may never refer to starter files absent from the selected surface.

Implement:

1. centralized install/manifest metadata construction;
2. packaged canonical prompt resolver with project-override precedence and structured source provenance;
3. lifecycle manifest schema/versioned ownership foundation for whole-file vs section ownership;
4. minimumReaderVersion fail-closed semantics for behavior-bearing same-schema state;
5. section extraction/composition/baseline/update primitives and tests;
6. VCP-state readability inspection before NEW / EXISTING / MANAGED maturity classification;
7. reserved `.vcp` collision/recovery inspection;
8. brownfield stack-ambiguity safety while retaining the Stage-11-compatible stack API;
9. minimal brownfield adoption-surface selection;
10. persisted install-surface identity for legacy-full, greenfield-safe, and brownfield-minimal lifecycle behavior;
11. preserved agent request provenance plus persisted explicit adapter intent plus VCP-managed adapter surface;
12. tri-state GitHub request provenance for brownfield planning;
13. verification-command authority inspection shared by Task/Doctor;
14. Doctor prompt-source/install-surface awareness for valid greenfield-safe/brownfield-minimal shapes, including no false failure for the intentionally absent legacy validate.yml;
15. deterministic content-free `init` planning actions;
16. useful `vcp init . --dry-run [--json]` for existing projects;
17. schema-v1 → schema-v2 migration through normal managed `vcp update`, plus previous-release lifecycle/release smoke proving old/new reader behavior;
18. removal of destructive init `--force` behavior.

Stage 12 must **not** perform Smart Init mutation into unmanaged EXISTING repositories.

The no-mutation boundary above applies to the **init/adoption path**, not to already-managed lifecycle updates (see the audit note at the top of this section for why the "read-only" shorthand was retired). The Stage-12 release MAY migrate a MANAGED schema-v1 repository through `vcp update` **only after the actual published-v0.9.3 G-FENCE and managed-recovery contract pass and D-01 is accepted**. Until then, schema-v2 mutations remain disabled and the Stage-12 managed-migration exit is BLOCKED, even if read-only planning work passes.

`vcp init` on that MANAGED repository still performs no migration itself; it redirects to lifecycle update/status.

Transitional behavior:

```text
NEW
→ greenfield initialization remains available
→ uses the greenfield-safe asset surface
→ never installs the VCP source npm validation workflow

EXISTING
→ dry-run plan available
→ non-dry-run brownfield apply safely blocked

MANAGED
→ status/redirect to update
```

**Stage 12 exit test:** VCP can inspect an arbitrary representative repository and produce a trustworthy, bounded, non-destructive adoption plan.

## Stage 13 — Smart Init Apply

Stage 13 adds mutation using the Stage 12 planner.

Implement:

1. acquire a **first-adoption-aware lifecycle lock handle** and record both lock identity and whether bootstrap created temporary `.vcp` state;
2. re-inspect the repository/VCP namespace with the owned-lock handle and recompute a fresh plan under lock;
3. block on conflicts/precondition changes;
4. if blocking/failure occurs before backup creation, release the lock and remove only empty operation-created lock bootstrap state;
5. backup every path that may change plus explicit prior lifecycle-state presence/absence;
6. transactional COMPOSE/ADD/CLAIM behavior;
7. write section-aware baselines and manifest, including the adopted asset set, explicit adapter intent, and VCP-managed adapter surface;
8. make `vcp task` / Task Pack Source-of-Truth scaffolding respect the persisted assetSet so brownfield-minimal never generates absent canonical starter paths;
9. post-apply verification;
10. automatic rollback on failure;
11. idempotent managed-project re-run behavior;
12. subsequent `vcp update` proof.

The apply path must generalize existing backup/rollback semantics for first adoption: when the pre-lock lifecycle state was truly unmanaged, a successful rollback restores project files and removes **all operation-created VCP lifecycle scaffolding**, including the selected adoption backup and generated internal files, then removes `.vcp/` only if empty. If rollback cannot complete, preserve recovery artifacts for manual recovery rather than pretending the repository is clean.

Do not rename on-disk lifecycle state merely for aesthetics. Existing lock/backup/transaction locations may remain compatibility-preserving while helper APIs are generalized.

### Validation Checkpoint A — Is adoption actually easier?

Run Stage 12/13 primarily against deliberately varied **mature brownfield repositories**, because that is the behavior these stages are adding.

Also include NEW and already-MANAGED fixtures as regression coverage so the adoption work does not break greenfield init or normal lifecycle update.

Checkpoint A does **not** require the later Phase-2 full consumer/framework asset cleanup to be complete for legacy/greenfield surfaces. It does require the new brownfield-minimal surface to be genuinely minimal and the Stage-12 greenfield CI safety floor to hold.

Collect at least:

- plan/apply agreement on unchanged repositories;
- correct re-plan behavior when the repository changes between preview and apply;
- files added/changed/removed;
- section-preservation behavior;
- rollback to truly unmanaged prior state;
- existing instruction/CI preservation;
- questions later classified as discoverable;
- repository noise added;
- steps from install to first productive feature.

**GO:** adoption is safe, minimal, and materially simpler than the current experience.

**SIMPLIFY:** plans are noisy, brownfield surface is too large, or users must understand too much VCP.

**STOP/DEFER:** do not proceed into broad asset/capability/profile machinery while first-use trust is poor.

> [AUDIT 2026-10-06 — PRE-IMPLEMENTATION] Checkpoint DONE signals must be
> mechanical, not vibes. Unit-test greenness alone must never declare a
> checkpoint passed — several checkpoints (notably B/C/D/E) currently have no
> automated DONE signal, which risks declaring phases complete on test counts.
> Required: every checkpoint's Task Pack defines its DONE signal as a
> checkable artifact (conformance-matrix run, dogfood adoption log, user-study
> notes, gate-receipt sample), and the GO/SIMPLIFY/STOP-DEFER decision is
> recorded against that artifact. Checkpoint E (model/tool capability audit)
> must additionally record deletions made, not just additions considered.

## Phase 2 — consumer asset and standing-context separation

After Checkpoint A:

1. unify one classified consumer asset catalog across greenfield and managed lifecycle paths without forcing identical installed files;
2. migrate old framework/reference assets explicitly;
3. complete AGENTS standing-context reduction beyond the brownfield section;
4. finish Doctor source-validator/asset expectations beyond the Stage-12 prompt/install-health minimum;
5. remove copied framework validators/source docs;
6. rewrite release-check consumer lifecycle validation;
7. preserve customized legacy prompts as overrides.

## Phase 3 — provider-neutral CI detection + legacy workflow migration

Stage 12 has already stopped the harmful workflow on fresh safe install surfaces and separated its desired-state meaning from GitHub hygiene.

Phase 3 now owns:

1. provider-neutral CI inspection;
2. Doctor CI/gate reporting with explicit coverage limits;
3. explicit lifecycle migration/detach of old `legacy-full-v1` managed `.github/workflows/validate.yml`;
4. preservation of GitHub issue/PR hygiene as a separate optional surface;
5. keeping newly generated CI deferred until Phase 8 after gate stabilization.

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
6. migrate/re-express already-merged Stage 11 React Native provenance through the capability compatibility bridge.


## Phase 6 — workflow mode + minimal packaged router UX

1. persist workflowMode;
2. add explicit --workflow-mode and a post-install mode change;
3. render mode-aware thin VCP instruction sections/adapters;
4. expose mode in Doctor/status;
5. ship one package-owned primary VCP router Skill (`skills/vcp/SKILL.md` or equivalent) so Auto and Manual exercise one real shared routing path;
6. add the minimum package/release/source-validation inclusion needed for that router;
7. keep the router progressive and free of duplicated Core policy;
8. add/extend prompt-eval coverage for router + human-attention behavior only where existing observables are insufficient.

The Phase-6 router is the minimal installed UX contract, not a throwaway prototype and not Core authority. It must route only through contracts that actually exist in Phase 6; it must not simulate future workflow levels in prose. Adaptive Auto level selection and deterministic gate protection become product-complete only in Phase 7.

## Phase 7 — mechanical gate and workflow levels

1. shared task-state parser;
2. gate preview;
3. gate run using verification engine;
4. post-run Git freshness check;
5. mechanically bounded L0;
6. compact L1 task/readiness/review contract;
7. current full L2 contract;
8. L3 relevant high-risk additions;
9. final-diff minimum-level reclassification.

### Validation Checkpoint C — Does Auto/gate help more than it interrupts?

Dogfood representative L0/L1/L2/L3 changes.

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

1. persist/configure explicit gatePolicy;
2. detect existing compatible integration points;
3. prefer a thin gate step/snippet after project-owned CI setup;
4. generate a standalone provider workflow only when all required bootstrap/toolchain prerequisites are deterministically supported and explicitly accepted;
5. keep project verification authority in VCP/task state;
6. require explicit task selection for material work and explicit base/head refs for L0;
7. prove missing/shallow refs or unsupported environment prerequisites fail closed.

> [EXTERNAL RE-AUDIT 2026-10-06] Initial Phase-8 PR↔task selection
> contract is now specified:
>
> ~~~text
> explicit material-task selector present
> → run vcp gate <task> --run
>
> no task selector present
> → attempt L0 gate using explicit PR base/head
> → L0 passes: check passes
> → L0 says material/promotion required: check blocks and instructs the author to
>   provide one VCP task selector
> ~~~
>
> Initial provider integrations support **one primary Task Pack per PR**. Multiple
> task selectors block with an actionable message: split the PR or create/use one
> bounded primary task whose accepted scope covers the PR. This is an intentional
> first-release constraint, not a hidden assumption.
>
> Core gate does not parse PR prose. Provider adapters map platform metadata to the
> task slug. For GitHub, the initial adapter may use a strict PR-body trailer such
> as `VCP-Task: <slug>` (exact syntax finalized with Phase-8 CLI docs); other CI
> providers pass an explicit environment/input value.
>
> Required CI properties:
> - full Git history/base refs available (no shallow guessed provenance);
> - stable unique VCP check/job name;
> - gate job is not hidden behind path filters that can skip the required check;
> - `pull_request` is supported, and `merge_group` is included when merge queues
>   are part of the repository policy;
> - missing/invalid/multiple task selection fails closed for material work.

> [AUDIT 2026-10-06 — PRE-IMPLEMENTATION] Until Phase 8 lands, document honestly
> that local gates are cooperative, not enforcement: any local lifecycle command
> can be skipped by a non-cooperating agent. A CI gate becomes a **merge**
> enforcement boundary only when the platform actually requires that check through
> branch protection/ruleset/merge-queue policy; otherwise it remains evidence.

## Phase 9 — Skill UX expansion

The primary router is already packaged in Phase 6. Phase 9 expands the UX only after workflow-level/gate contracts stabilize.

1. add discovery/grill, review, retro, and other justified specialized Skills/references;
2. preserve the primary router as the default entry point;
3. route every Skill to deterministic VCP commands/canonical prompts rather than duplicating policy;
4. reuse prompt-eval observable behavior;
5. keep Skills thin and replaceable;
6. enforce progressive disclosure in Skill/reference loading;
7. broaden cross-agent installer/packaging conformance beyond the minimum Phase-6 router surface.

> [EXTERNAL RE-AUDIT 2026-10-06] Resolved: Task Packs do **not** become
> SKILL.md. §9.2A is authoritative. Skills remain reusable procedural UX packages;
> Task Packs remain per-change durable Core state parsed by readiness/context/gate.
> Phase 9 only decides packaging/reference details for reusable Skills.

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


### Validation Checkpoint E — Model/tool capability audit

Before a major VCP release, and after a meaningful jump in mainstream coding-agent capability, review the scaffolding itself.

Ask:

- which always-on instructions can be removed?
- which prompts/Skills can become smaller?
- which orchestration steps are now native agent behavior?
- which deterministic Core checks still catch real failures?
- which compatibility/state surfaces no longer justify their migration burden?

A valid checkpoint result is deleting or deprecating VCP functionality.

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

~~~text
vcp init . --dry-run
~~~

inside a five-year-old repository and receive a safe, content-free plan that:

- preserves current agent instructions and CI;
- discovers what it can prove;
- identifies unknowns/ambiguity;
- proposes only the minimal brownfield VCP surface;
- shows exact ownership actions/conflicts without writing.

After Stage 13, normal apply on an unchanged snapshot re-plans under the lifecycle lock and then:

- adds only necessary VCP artifacts/sections;
- creates restartable lifecycle state with the correct adopted asset surface;
- preserves surrounding project text;
- leaves subsequent vcp update on the same adopted surface.

If the repository changes between preview and apply, the fresh plan may differ or block. That is expected safety behavior.

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

---

# Appendix Z — Pre-implementation audit amendments (2026-10-06)

Independent adversarial audit of this plan and its companion technical analysis
(`ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md`), conducted against the real
codebase at HEAD `6bb23d6fbd0a3b06a57db933ac3c97fabdc8f5e0` (v0.9.3) with fresh
2025–2026 external research. Six parallel workstreams: codebase reality mapping,
authoritative-docs cross-check + consistency matrix (38 contracts × 6 columns),
external ecosystem research, per-point 23-element audits (33 points), interaction
/ second-order / scenario analysis (23 scenarios A–W), and test design
(255 tests). Product code was not modified.

**Historical 2026-10-06 audit verdict: READY WITH MINOR CONDITIONS.** Background source: `docs/ADAPTIVE-VCP-FINAL-PREIMPLEMENTATION-AUDIT.md`. This historical statement does **not** accept current D-01 migration safety, Stage12 design repairs or live product implementation.
The conditions are discharged by the amendments below, which are now part of
this document. Inline amendments are tagged `[AUDIT 2026-10-06 —
PRE-IMPLEMENTATION]` at their sections.

## Z.1 Amendments register (strategic)

**Historical register — do not enforce byte-identical row sets against T Z.1.** Proposed canonical `docs/ADAPTIVE-VCP-DECISIONS.md` (D-01–D-12) records new decisions/owners/statuses/affected locations. After maintainer acceptance, every correction is applied at ALL S/T/roadmap/CLI/Task anchors, and CI validates accepted-ID reference coverage; this historical appendix stays as an audit trail, not a second normative decision database (C-13).

| # | Section | Change |
|---|---------|--------|
| 1 | §3.6 | duplicate-equivalent command values do not trigger fake ambiguity: keep every source/provenance and execute the one identical value without rewriting project text; conflicting values → HUMAN DECISION; destructive-pattern adoption still requires explicit HUMAN DECISION |
| 2 | §3.3A | dry-run may emit a non-authoritative answers record; apply accepts `--answers-file`; plan always recomputed fresh under lock (resolves §2A.2 contradiction) |
| 3 | §3.10 | Specified polyglot fallback: `stack: generic`, evidence listed, stack-neutral assets only, HUMAN DECISION before stack-specific assets |
| 4 | §3.5 (ADOPT) | Marker presence ≠ authorship: ADOPT requires empty-or-canonical section content; code-fence-aware marker scanning |
| 5 | §8.5 (L3) | Security-review fingerprint = content digest only; package version is metadata, not fingerprint input (breaks the upgrade-aversion loop) |
| 6 | §7/Phase 8 | PR↔task selection resolved for first release: one explicit material Task Pack per PR; absent selector attempts L0 then blocks on material work; full-history refs, non-skippable stable gate job, and merge-group support where applicable |
| 7 | §9/Phase 9 | Resolved: Task Packs remain durable Core artifacts; SKILL.md is only for reusable Skill UX/procedure packaging |
| 8 | §13 (Stage 12) | Retired the misleading "read-only" shorthand; precise boundary stated; v1→v2 migration stays in Stage 12 via the existing transactional update path (adjudicated historically against a proposed stage split; current G-FENCE is a separate unresolved blocker) with tightened exit criteria |
| 9 | §13 (checkpoints) | Every checkpoint needs a mechanical DONE signal (checkable artifact); Checkpoint E must record deletions |

## Z.2 Ownership analysis (§9 of the audit brief)

Where each major feature belongs:

- **VCP Core (deterministic):** manifest schema v2 + minimumReaderVersion; section
  ownership + markers + baselines; assetSet; detector DSL + evidence model;
  community-profile trust (digests); verification-command authority; review
  provenance + finalization; gate mechanical checks; gate receipt emission;
  workflow-level classification floor (deterministic rules); workflowMode state;
  migrations; Doctor; release-check; gate evidence binding (normalized protected
  Task-contract identity/digest where useful, reviewed/finalization commit SHAs,
  verification outcomes). This is **not** a Smart-Init preview-plan hash.
- **Skill / agent behavior:** Auto-mode interception/routing (best-effort; gate is
  the backstop); thin UX Skills (router, grill, retro); invisible-by-default UX;
  prompt-eval and attention-budget measurement (dogfood, not unit tests).
- **Existing project/CI tooling (integrate, don't duplicate):** secret scanning
  (hook point for gitleaks-like tools, not a VCP reimplementation); general CI
  logic (VCP emits the receipt; CI enforces).
- **CI/platform:** gate enforcement (Phase 8); provider workflows.
- **Project configuration:** PR↔task mapping; L0 trivial-surface policy content;
  security-profile content selection.
- **Not implemented:** multi-agent orchestration/fleets (evidence-backed rejection);
  schedulers; a second task database (already rejected by ROADMAP Slice C).

## Z.3 Remaining unresolved questions (not blocking Stage 12)

1. Exact answers-record format — Stage-13 design detail.
2. Windows/macOS native runners for the cross-platform conformance matrix.
3. Detector-DSL fuzzer (no real v2 community profiles exist yet to test against).
4. npm download-count telemetry for 0.9.3 (unavailable at audit time; not required).

Resolved by this external re-audit: **Task Packs remain durable VCP Core artifacts;
they do not become SKILL.md.** Skills are reusable procedural UX/instruction
packages whose host loading may be relevant/on-demand or eager, while a Task Pack is per-change durable state,
requirements, readiness, evidence, review, and finalization. Skills may create/read/
update Task Packs through VCP, but they do not replace the Task Pack serialization.

## Z.4 What the audit confirmed

- Zero real contradictions between the Adaptive docs' current-behavior claims and
  the authoritative docs/code (40+ spot checks).
- Stage 11 React Native is genuinely implemented on main.
- The Core/Skills boundary (§2) is correctly drawn and consistently applied.
- The plan's own phasing already defers speculation; no feature earned REMOVE.
- External evidence validates the deterministic-control-plane model and the
  workflows-over-agents stance, while reinforcing: deterministic (not prompt-based)
  approval boundaries, progressive disclosure, and state-bound plan/apply integrity.
  For Smart Init, VCP deliberately uses the **speculative-preview + fresh re-plan**
  model: preview is not executable authority, and Stage 13 recomputes under the
  lifecycle lock. A future saved executable plan would be a separate feature and
  would require explicit state/precondition binding. CI becomes a merge-enforcement
  boundary only when the repository/platform actually requires the VCP check.


## Z.5 Post-amendment revalidation

The original external audit snapshot was followed by a second full consistency/code-integration pass after the amendments landed.

The durable consolidated result is:

- `docs/ADAPTIVE-VCP-FINAL-PREIMPLEMENTATION-AUDIT.md`

That final pass rechecked the current code couplings, both Adaptive documents, Roadmap/current contracts, the test/release seams, and current external ecosystem guidance.

Additional findings integrated after the original audit snapshot include:

- capability-grade core detectors must not inherit legacy symlink-following marker semantics;
- Skill correctness/progressive disclosure must not depend on universal lazy loading;
- semantic conformance fixtures and native/hosted platform evidence are separate;
- legacy CI may remain packaged as a migration asset even when fresh consumer surfaces stop selecting it;
- Stage-12 mutation boundaries distinguish unmanaged brownfield init from managed schema migration;
- routing mode and merge-enforcement policy remain orthogonal;
- L0 fails conservative without explicit project policy;
- L1/L2/L3 remain one Task Pack family;
- reviewed-head/finalization-head exceptions require semantic task-section validation, not path-only checks.

If this appendix and the consolidated report ever diverge, the main strategic/technical sections plus the consolidated report are the pre-implementation authority; historical audit counts remain evidence of the earlier snapshot rather than a substitute for current verification.
