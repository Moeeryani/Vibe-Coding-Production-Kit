# Adaptive VCP — Implementation Plan

**Status:** Proposed execution plan  
**Purpose:** Make VCP safe, adaptive, low-friction, and useful across new and existing repositories without weakening its deterministic control-plane philosophy.  
**Scope:** Smart initialization, project adaptation, capability detection, profile extensibility, CI integration, operating modes, Skills UX, mechanical enforcement, and conformance testing.

**Technical companion:** `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md` is the code-level dependency and integration authority for this plan. When implementation sequencing or a concrete integration detail is more specific there, this strategic plan follows that analysis.

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


12. **Split safe adoption into a read-only planning stage and a mutating apply stage.**  
    After the merged Stage 11 closeout gap is reconciled and current main is re-baselined, Stage 12 is the first Adaptive VCP execution slice: it proves repository inspection, section-ownership foundations, prompt fallback, and a trustworthy `vcp init --dry-run` plan without performing brownfield adoption writes. Stage 13 consumes the same planning model to perform transactional Smart Init apply.

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

A selected plugin/profile may need to be validated every time for trust integrity, but its manifest, guidance, or verification proposals should enter the rendered Context Pack only when relevant to the current mode/change.

Do not include selected-plugin metadata in every pack merely because the plugin is installed.

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

Skills should follow the same principle:

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

### Stage 12 — Safe Adoption Planning

For EXISTING repositories:

- vcp init . --dry-run produces the complete bounded adoption plan;
- ordinary non-dry-run brownfield mutation is intentionally blocked;
- no destructive init --force exists;
- preview writes neither project files nor durable VCP state.

For NEW repositories, the existing greenfield path may remain temporarily while the new planner is introduced, provided greenfield preview/apply tests remain coherent.

For MANAGED repositories, init performs no re-initialization and reports lifecycle/update status.

### Stage 13 — Smart Init Apply

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
→ COMPOSE / ADOPT / NOOP

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

<!-- VCP:BEGIN -->
VCP-owned integration block
<!-- VCP:END -->

more user instructions
~~~

For an adopted existing file:

- only the marked VCP section is managed;
- surrounding text remains project-owned;
- the baseline represents the VCP-owned section;
- lifecycle update compares only the owned section;
- malformed, missing, duplicate, nested, or reversed markers fail safely.

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

Use a schema bump when the structural representation itself changes incompatibly. The reader-version guard avoids unnecessary schema churn for additive but behavior-bearing semantics.

## 3.6 Verification-command authority in brownfield AGENTS.md

Current Task/Doctor command discovery scans AGENTS.md for command slots such as:

~~~text
UNIT_TEST_COMMAND=...
BUILD_COMMAND=...
~~~

A mature repository may already contain one or more of these keys outside the VCP section. Blindly inserting another set creates duplicate authority and first-match ambiguity.

Stage 12 must inspect all occurrences per command key.

Required behavior:

~~~text
exactly one existing unambiguous project command
→ preserve/adopt it as effective command authority
→ do not insert a conflicting duplicate

no existing command
→ VCP section may contribute an evidence-backed slot/value

duplicate/conflicting occurrences
→ CONFLICT or HUMAN DECISION
→ never silently choose the first match
~~~

Task creation and Doctor must resolve commands through the same authority helper so they cannot disagree.

Moving verification configuration to another structured file remains a separate future migration.

## 3.7 Init action semantics

Use familiar planner action names, but make post-action ownership explicit so init actions cannot be confused with update actions.

~~~text
ADD
→ create content; establish declared file/section ownership

ADOPT
→ establish ownership only when the ownership boundary is already explicit and safe:
   - an exact whole-file canonical artifact that VCP is allowed to own, or
   - an already well-formed marked VCP section
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

SKIP
→ outside the selected adoption surface

CONFLICT
→ block atomic apply
~~~

Public --json reports remain content-free.

## 3.8 Persist the adopted asset surface

A brownfield Smart Init deliberately installs **less** than the current legacy greenfield template.

That choice must survive the very next vcp update.

Do not represent this by filling ignoredFiles with framework assets; ignored paths are user lifecycle choices, not install-profile identity.

Persist an explicit install-surface identifier, conceptually:

~~~json
{
  "install": {
    "assetSet": "legacy-full-v1"
  }
}
~~~

and for new brownfield adoption:

~~~json
{
  "install": {
    "assetSet": "brownfield-minimal-v1"
  }
}
~~~

Exact names may change, but the contract is required.

Rules:

- migrated schema-v1 projects map to the legacy current surface;
- temporary greenfield compatibility may remain on the legacy surface;
- Stage 13 brownfield adoption records the minimal surface;
- update/manage/Doctor desired-state logic respects the stored surface;
- Phase 2 may migrate both legacy install profiles onto a newer **classified catalog version**, while preserving the repository's greenfield/brownfield asset-selection semantics. It must not collapse them into one identical installed path set.

Without this state, Smart Init would be non-destructive on day one and the next update would try to add everything it intentionally skipped.

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

For EXISTING repositories:

- unspecified → preserve/skip optional GitHub hygiene;
- explicitly include → only allowed non-CI hygiene may be planned;
- explicitly exclude → skip;
- existing CI is preserved in all cases.

NEW repositories may retain the historical default temporarily for compatibility until Phase 2/3 changes the greenfield surface.

Persist the actual installed decision needed by lifecycle state; do not persist parser trivia unless lifecycle behavior requires it.

## 3.10 Repository classification, reserved state, and stack ambiguity

Do not classify EXISTING from one arbitrary file.

Use conservative evidence such as:

- Git metadata;
- source files;
- build/package manifests;
- project documentation;
- CI;
- agent instructions;
- non-ignorable file count.

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
  → even if baselines/transaction/integrity checks later show the install is unhealthy
  → report MANAGED + recovery/health blocker; never re-init over it

manifest malformed / structurally invalid
or schema newer/unsupported
or minimumReaderVersion newer than running CLI
or unknown reserved .vcp state prevents safe interpretation
  → VCP_STATE_CONFLICT
  → neither NEW/EXISTING nor safely MANAGED
  → explain remediation/upgrade requirement
  → zero init mutation
~~~

An active lifecycle lock or transaction also blocks init/apply. If the manifest is recognized, report it as managed lifecycle recovery state rather than treating the project as unmanaged.

Smart Init must never become a way to overwrite or 'repair' lifecycle state it cannot understand.

Rollback must remove only VCP-created internal state when the true prior state was no VCP lifecycle state; pre-existing unknown .vcp content is never deleted as part of adoption rollback.

### Brownfield stack ambiguity before capabilities

Stage 12 intentionally does not implement the full capability model.

However, it must not overstate certainty from legacy single-stack precedence.

If --stack auto on an EXISTING root contains materially competing major stack-family evidence, Smart Init should surface the ambiguity and require a project-root/stack decision or conservative fallback rather than silently treating precedence as proof of one project identity.

This is a narrow adoption-safety check, not capability persistence.

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

For `brownfield-minimal`, Doctor must separate:

~~~text
VCP install health
→ lifecycle state, owned integration, prompt resolution, command authority, etc.

project-governance coverage
→ whether Product/Architecture/Security/Testing Source of Truth exists or is configured
~~~

Missing VCP starter documents that were never part of the adopted asset set are **not install corruption**.

Doctor may report governance coverage as informational/unknown when no explicit governing document is configured, but that absence is not a warning/strict failure merely because a brownfield-minimal install lacks VCP starter files. It becomes blocking only when an actual task/readiness/policy contract requires governing truth that is missing. Doctor must not manufacture equivalence between arbitrary existing docs and VCP canonical roles.

Broader provider-neutral CI cleanup remains Phase 3.

### First-adoption lock bootstrap must be reversible before backup

Current update locking creates `.vcp/update.lock` and may create `.vcp/` itself. That is harmless for an already-managed update but is observable mutation in a previously unmanaged repository.

Stage 13 must make lock acquisition lifecycle-aware:

- lock acquisition records whether `.vcp/` existed before this operation, or returns equivalent ownership metadata;
- if VCP creates `.vcp/` solely to hold the lock, that directory is temporary lifecycle scaffolding until the adoption transaction/recovery point exists;
- after the lock is acquired, Smart Init re-inspects the namespace and blocks if any unknown/incompatible VCP state appeared;
- if planning blocks/fails **before** a backup/transaction is created, release the lock and remove only the empty `.vcp/` directory that this operation created;
- never recursively delete the directory during this cleanup; if any unexpected content exists, preserve it and report the conflict;
- once backup/transaction state exists, the normal generalized recovery metadata owns rollback.

The invariant is:

~~~text
unmanaged before apply
+ conflict/failure before project mutation
→ unmanaged afterward
~~~

Acquiring the lock is allowed to create temporary internal state, but that state must not leak after an aborted first-adoption attempt.

## 3.12 Definition of done

Smart adoption is complete only when:

- destructive init --force is gone while unrelated force controls remain;
- NEW / EXISTING / MANAGED classification is deterministic only after VCP-state readability checks;
- malformed/newer/minimum-reader-incompatible manifests and unknown reserved .vcp state fail safely without being reclassified as ordinary EXISTING;
- recognized-but-unhealthy MANAGED lifecycle state blocks re-init and reports recovery/health status;
- brownfield dry-run is zero-write;
- preview and apply use the same planner;
- unchanged repository snapshot produces semantically equivalent planned actions;
- changed repository state causes fresh re-plan/difference/block rather than stale-plan execution;
- existing agent/CI/project docs are never silently replaced;
- section-owned content survives subsequent updates while surrounding text is preserved;
- ignore/track cannot convert a brownfield section-owned integration file into whole-file ownership;
- verification command authority cannot be made ambiguous by duplicate inserted slots;
- brownfield auto-stack ambiguity is surfaced conservatively;
- the persisted asset surface prevents the next update from expanding adoption accidentally;
- packaged prompt fallback, Context, and Doctor agree without widening project authority;
- brownfield standing instructions never require starter paths absent from the adopted assetSet;
- schema migration makes legacy entries explicit whole-file ownership;
- lock bootstrap leaves no stray VCP state when Stage 13 blocks before backup;
- rollback restores both prior content **and prior absence of lifecycle state**;
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

Before removing project-local prompt copies, first add a **canonical prompt resolver**.

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
- package fallback does not widen project/workspace filesystem authority.

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

Separate **evidence state** from **application authority**.

At minimum, the model must distinguish:

- `proven` — deterministic evidence matched;
- `configured` — project/VCP lifecycle state explicitly applies the capability;
- `proposed` — evidence/profile suggests it but VCP must not apply it automatically;
- `unknown` — not established.

Also retain provenance such as `core`, `first-party-profile`, `community-profile:<id>`, or explicit project configuration.

A capability can be deterministically proven yet still be **unapplied**.

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
- Doctor reports detected capability evidence separately from applied/project-approved capability state and provenance;
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


## 6.6 Definition of done

- existing schema-v1 community plugins continue to load unchanged;
- community profile/plugin schema v2 is strict rather than a permissive extension of plugin schema v1;
- a new ecosystem profile can be added without arbitrary executable plugin code;
- detector DSL evaluation remains deterministic and selected-project-root bounded;
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

## 8.3 Auto-mode agent instruction

Auto-mode adapters should communicate the policy concisely:

> For meaningful repository changes, route work through the VCP workflow appropriate to the change. Do not bypass deterministic readiness, authority, verification, or review gates. Use the lightest workflow level that safely fits the change.

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
- final gate/review path can reject L0 if the diff crosses a protected surface.

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
Governing reference(s), when applicable
Affected scope
Acceptance evidence
Verification
Lightweight review outcome / current findings
Risk/escalation flags
Completion/evidence summary
~~~

L1 does not require empty security/observability/rollout sections, but it also does not bypass Source-of-Truth or fresh-review invariants. If a material product/API/data/security/architecture decision is discovered, promote to L2/L3.

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

Potential requirements include security review context, rollback/recovery evidence, sensitive-effect authorization, and stricter exact-head gating.

The L3 extension must remain relevant: do not make every high-risk category load every possible security/operations document.


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
- Manual mode does not hijack ordinary coding requests;
- L0 handles truly trivial work without durable ceremony;
- L1 gives ordinary small engineering work a compact contract instead of forcing the full L2 Task Pack;
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


## 10.3 Add a canonical task-state parser

Current readiness/review/finalization requirements are partly prose contracts.

Before gate grows, add one shared parser/state model for L1/L2/L3 that exposes at least:

- top-level task status;
- slug;
- workflowLevel;
- governing references where the level requires them;
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
- only mechanically allowlisted trivial surfaces/diff characteristics may pass;
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

- applicable governing authority/reference is present;
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

- dedicated security-mode review evidence when active security profiles are relevant;
- migration/recovery/destructive-effect authorization;
- stronger release/deployment/data-safety evidence.

Gate validates that required human approvals/reviews exist; it does not manufacture approvals or perform AI review itself.

## 10.5 Preserve the existing review → finalization → rerun protocol

The future gate must enforce, not replace, the current Task Pack completion rule.

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

A review head does not have to equal the finalization head **only** when the intervening diff is the canonical bounded task-record finalization edit.

If any implementation/config/docs surface other than the allowed finalization artifact changes after review:

- review provenance becomes stale;
- gate fails/blocks;
- fresh review is required before finalization/gate can pass again.

This requires minimal durable review Git provenance. Exact Markdown field names can be chosen during Phase 7, but the information cannot remain chat-only.

L0 has no task finalization sequence.

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
- stale review provenance cannot pass after implementation-surface changes;
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
- for an unchanged repository snapshot, dry-run and fresh apply planning are semantically equivalent;
- if the repository changes before apply, the apply path re-plans and may differ or block safely;
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

Stage 12 spans the enabling parts of Phase 0 plus the **read-only** portion of smart adoption.

Implement:

1. centralized install/manifest metadata construction;
2. packaged canonical prompt resolver while preserving project overrides;
3. manifest schema/versioned ownership foundation for whole-file vs section ownership;
4. section extraction/composition/baseline/update primitives and tests;
5. read-only repository classification: NEW / EXISTING / MANAGED;
6. minimal brownfield adoption-surface selection;
7. deterministic `init` planning actions;
8. useful `vcp init . --dry-run [--json]` for existing projects;
9. persisted install-surface identity for legacy-full vs brownfield-minimal lifecycle behavior;
10. tri-state GitHub request provenance for brownfield planning;
11. verification-command authority inspection shared by Task/Doctor;
12. Doctor prompt-source awareness through the canonical prompt resolver;
13. reserved .vcp and brownfield stack-ambiguity safety;
14. schema-v1 → schema-v2 migration plus minimumReaderVersion fail-closed semantics;
15. previous-release lifecycle/release smoke proving old/new reader behavior;
16. removal of destructive init `--force` behavior.

Stage 12 must **not** perform Smart Init mutation into EXISTING repositories.

Transitional behavior:

```text
NEW
→ existing greenfield initialization remains available

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

1. acquire lifecycle lock;
2. recompute a fresh plan under lock;
3. block on conflicts/precondition changes;
4. backup every path that may change plus explicit prior lifecycle-state presence/absence;
5. transactional COMPOSE/ADD/ADOPT behavior;
6. write section-aware baselines and manifest;
7. post-apply verification;
8. automatic rollback on failure;
9. idempotent managed-project re-run behavior;
10. subsequent `vcp update` proof.

The apply path must generalize existing backup/rollback semantics for first adoption: if no manifest/baselines existed before the transaction, rollback must remove the newly created manifest/baselines rather than leave a false managed state.

Do not rename on-disk lifecycle state merely for aesthetics. Existing lock/backup/transaction locations may remain compatibility-preserving while helper APIs are generalized.

### Validation Checkpoint A — Is adoption actually easier?

Run Stage 12/13 against deliberately varied real or representative repositories before broader Adaptive VCP work.

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

## Phase 2 — consumer asset and standing-context separation

After Checkpoint A:

1. unify one classified consumer asset catalog across greenfield and managed lifecycle paths without forcing identical installed files;
2. migrate old framework/reference assets explicitly;
3. complete AGENTS standing-context reduction beyond the brownfield section;
4. update Doctor prompt/reference expectations;
5. remove copied framework validators/source docs;
6. rewrite release-check consumer lifecycle validation;
7. preserve customized legacy prompts as overrides.

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
6. migrate/re-express already-merged Stage 11 React Native provenance through the capability compatibility bridge.


## Phase 6 — workflow mode + minimal router UX

1. persist workflowMode;
2. add explicit --workflow-mode and a post-install mode change;
3. render mode-aware thin VCP instruction sections/adapters;
4. expose mode in Doctor/status;
5. ship/prototype one thin primary VCP router Skill so Auto and Manual exercise one shared routing path;
6. keep the router progressive and free of duplicated Core policy;
7. extend prompt-eval only for observable routing/human-attention behavior that the existing schema cannot express.

The router is UX, not authority. Auto routing remains best-effort until Phase 7 gate enforcement exists.

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

1. optional thin provider-specific VCP gate workflow;
2. detection of existing equivalent integration;
3. keep project verification authority in VCP/task state.

## Phase 9 — Skill UX expansion

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
