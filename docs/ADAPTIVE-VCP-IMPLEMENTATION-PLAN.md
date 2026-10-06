# Adaptive VCP — Implementation Plan

**Status:** Proposed execution plan  
**Purpose:** Make VCP safe, adaptive, low-friction, and useful across new and existing repositories without weakening its deterministic control-plane philosophy.  
**Scope:** Smart initialization, project adaptation, capability detection, profile extensibility, CI integration, operating modes, Skills UX, mechanical enforcement, and conformance testing.

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

## 3.4 Remove `--force` from init

Destructive initialization `--force` should be removed.

Preferred behavior for collisions:

```text
Can VCP safely compose or merge?
├─ yes → compose/merge
└─ no  → CONFLICT
         explain exact path/reason
         make no destructive change
```

If a user truly wants to replace a file, that should be an explicit manual file operation outside `vcp init`, followed by a new init preview.

Do not retain a generic “I know what I'm doing” overwrite flag.

## 3.5 Existing agent-file integration

### Existing `AGENTS.md`

Do not replace it.

The init planner should distinguish:

1. no `AGENTS.md`;
2. existing VCP-compatible `AGENTS.md`;
3. existing non-VCP `AGENTS.md`.

For case 3, preferred strategies in order:

- add a bounded clearly delimited VCP section if safe;
- preserve all existing text;
- avoid changing project-specific instructions;
- record the adopted baseline after composition;
- if automatic composition is ambiguous, produce a conflict requiring review.

Recommended managed markers:

```markdown
<!-- VCP:BEGIN -->
... VCP-owned integration block ...
<!-- VCP:END -->
```

Do not require this marker for legacy files, but use it for new additive integration where possible.

### Existing `CLAUDE.md`

The ideal change is additive:

```text
existing project instructions
+
@AGENTS.md
```

Do not replace existing Claude instructions.

If `@AGENTS.md` already exists, do nothing.

### Existing Copilot instructions

Likewise:

- preserve existing instructions;
- add a concise VCP reference only if missing;
- do not create contradictory duplicate policy.

### Codex / Cursor

Continue using repository `AGENTS.md` directly where supported.

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
- `--force` is no longer accepted for initialization;
- existing `AGENTS.md`, `CLAUDE.md`, Copilot instructions, and CI are never silently replaced;
- dry-run accurately predicts all init mutations;
- init conflicts result in zero destructive project changes;
- a successful init produces lifecycle baselines representing the actual post-integration files;
- rerunning `vcp init` on a managed project performs no lifecycle rewrite and directs the user to update;
- tests prove adoption with pre-existing user modifications;
- rollback/recovery is available if init becomes transactional;
- documentation contains no path telling users to “use --force after review.”

---

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

Replace broad template roots such as `docs` with an explicit asset manifest.

For example:

```js
PROJECT_ASSETS = [
  'AGENTS.md',
  'docs/product/PRODUCT-BRIEF.md',
  'docs/product/PRD.md',
  'docs/product/USER-FLOWS.md',
  'docs/architecture/ARCHITECTURE.md',
  'docs/architecture/DOMAIN.md',
  'docs/architecture/DATA-MODEL.md',
  'docs/security/THREAT-MODEL.md',
  'docs/security/SECURITY-PROFILE.md',
  'docs/testing/TEST-STRATEGY.md',
  'docs/delivery/DEFINITION-OF-READY.md',
  'docs/delivery/DEFINITION-OF-DONE.md',
  'prompts/... only if project-local prompts remain intentional'
]
```

Then decide which prompts should remain copied versus loaded from the package.

Long term, prefer package-owned canonical prompts plus project override points rather than duplicating every prompt into every repository, unless offline/restartability requirements justify project-local copies.

## 4.5 Migration for existing VCP projects

Do not simply delete old framework docs from user repositories.

Use explicit lifecycle migration rules:

- unmodified VCP-only framework docs may be removed;
- locally modified docs are detached/preserved;
- project-owned docs remain tracked according to policy;
- release/task history created by the project must never be confused with VCP framework history.

## 4.6 Definition of done

- fresh init no longer installs the full VCP framework docs tree;
- target repository contains only project-relevant VCP artifacts;
- package/reference docs remain accessible to agents/tools without being copied unnecessarily;
- update migration preserves locally modified former framework docs instead of deleting them;
- context packs do not accidentally include framework roadmap/release history;
- package tests explicitly assert the target install file surface.

---

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

## 5.6 Backward compatibility

Do not break current manifests immediately.

Possible migration:

```json
{
  "install": {
    "stack": "typescript",
    "requestedStack": "auto",
    "capabilities": [...]
  }
}
```

Treat `stack` as a compatibility summary for a transition period.

Eventually, `stack` may become:

- a legacy compatibility field;
- a primary profile label computed from capabilities;
- or removable in a future major version.

Do not remove it until downstream code no longer depends on it.

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

Expand the declarative profile model without adding arbitrary plugin execution.

A profile may eventually declare:

- deterministic evidence markers;
- capability IDs contributed when all required evidence matches;
- bounded guidance files;
- verification proposals;
- optional config schema hints;
- compatibility range.

Example conceptual manifest:

```json
{
  "id": "profile.rust",
  "version": "1.0.0",
  "detect": {
    "all": [
      { "fileExists": "Cargo.toml" }
    ]
  },
  "contributes": [
    "language.rust",
    "build.cargo"
  ],
  "verificationProposals": [
    {
      "key": "FORMAT_CHECK_COMMAND",
      "command": "cargo fmt --check"
    },
    {
      "key": "UNIT_TEST_COMMAND",
      "command": "cargo test"
    }
  ]
}
```

Important: proposed commands are not automatically approved merely because the profile exists.

## 6.4 Trust model

Preserve current invariants:

- plugin cannot grant itself capabilities;
- unknown fields fail;
- bundle is digest-pinned;
- no executable hook;
- no network fetch during normal operation;
- no arbitrary filesystem access;
- profile cannot override core readiness/security/lifecycle rules;
- project explicitly selects community profiles;
- first-party profiles are versioned with VCP itself.

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

- a new ecosystem profile can be added without modifying core detection source code for every case;
- profile behavior remains deterministic and inspectable;
- profiles cannot execute code during loading/detection;
- profile-proposed commands remain proposals until project adoption;
- tampered/incompatible profile state fails visibly;
- community profile support cannot weaken core VCP invariants.

---

# 7. Workstream E — Project-aware CI integration

## 7.1 Current situation

Current VCP GitHub assets can include a `.github/workflows/validate.yml` that runs VCP repository-specific Node/npm commands.

That workflow is appropriate for VCP itself, not for arbitrary Python, Go, Rust, Java, mixed, or custom repositories.

## 7.2 Problem

Default installation can create CI that is technically valid YAML but semantically wrong for the target project.

That damages trust in “automatic” setup.

It also risks colliding with mature repositories that already have CI.

## 7.3 Target behavior

Smart init must inspect CI before deciding anything.

### Existing CI present

VCP should:

- preserve existing workflows;
- detect known verification commands where possible;
- report whether accepted VCP verification is represented in CI;
- optionally propose a VCP gate workflow if needed;
- never replace an existing workflow automatically.

### No CI present

VCP may generate project-specific CI only from approved/repository-backed commands.

Example:

```text
Accepted project verification:
  ruff check .
  mypy .
  python -m pytest

          ↓

Generated GitHub workflow
runs those commands
```

Do not generate npm commands unless npm/Node evidence supports them.

## 7.4 Prefer a VCP gate over duplicating project build logic

Where practical, generated CI can call VCP itself:

```text
vcp doctor --strict
vcp gate ...
```

while the actual project commands remain defined in project-owned VCP verification state.

This avoids maintaining two independent definitions of required checks.

## 7.5 CI provider scope

Initial implementation may support GitHub Actions first, but VCP must not equate “CI” with GitHub Actions.

Model capability as:

```text
ci.github-actions
ci.gitlab
ci.circle
ci.azure
ci.custom
```

Unsupported CI should degrade to inspection/reporting rather than deletion/replacement.

## 7.6 Definition of done

- Python/Go/non-Node init never receives npm-specific CI without Node evidence;
- existing workflows survive init byte-for-byte unless explicit additive integration is accepted;
- generated CI commands trace back to accepted project verification state;
- Doctor distinguishes “CI unknown/unassessed” from “CI missing/broken”;
- fixtures cover no-CI, GitHub Actions, and unknown/custom CI cases.

---

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

Add a project-owned setting, likely in VCP lifecycle/config state.

Example:

```json
{
  "workflowMode": "auto"
}
```

Supported initial values:

- `auto`
- `manual`

Do not infer mode from which agent is installed.

Mode should survive changing Claude/Codex/Cursor/etc.

## 8.3 Auto-mode agent instruction

Auto-mode adapters should communicate the policy concisely:

> For meaningful repository changes, route work through the VCP workflow appropriate to the change. Do not bypass deterministic readiness, authority, verification, or review gates. Use the lightest workflow level that safely fits the change.

Avoid embedding the full VCP manual in `AGENTS.md`.

## 8.4 Manual-mode instruction

Manual mode should be lightweight:

> VCP is available in this repository. Use the VCP workflow when the developer explicitly requests it or invokes the installed VCP Skill/command.

## 8.5 Auto mode must not mean maximum ceremony

Introduce workflow levels.

A conceptual model:

### L0 — trivial

Examples:

- spelling fix;
- comment;
- formatting-only;
- low-risk docs correction.

Requirements:

- no full Task Pack;
- run directly relevant deterministic checks if needed;
- preserve authority rules;
- no fake evidence.

### L1 — bounded engineering

Examples:

- small internal bug fix;
- narrow refactor;
- regression test;
- non-user-visible implementation correction.

Possible requirements:

- lightweight task record or compact task metadata;
- focused context;
- implementation verification;
- review depending on risk.

### L2 — material product/behavior change

Examples:

- new product behavior;
- API change;
- data behavior;
- meaningful UX flow.

Use normal full VCP lifecycle:

- discovery as needed;
- Source of Truth;
- Task Pack;
- readiness;
- implementation;
- verification;
- fresh review.

### L3 — high-risk change

Examples:

- auth;
- billing;
- destructive migrations;
- permissions;
- sensitive data;
- release/deployment policy.

Add enhanced controls:

- explicit HUMAN DECISION boundaries;
- security profile/review;
- migration/recovery evidence;
- stronger review/approval requirements.

## 8.6 Classification

Do not rely entirely on free-form LLM judgment.

Use a combination of:

- path/config rules;
- task declarations;
- active security profiles;
- changed-surface signals;
- explicit user override;
- agent recommendation.

Initial version may allow the agent to recommend a level, but VCP should mechanically enforce the requirements of whichever level is selected.

Never allow an agent to silently downgrade a configured minimum-risk class for protected areas.

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

An instruction such as:

> “The agent must use VCP.”

is still only an instruction.

LLMs can:

- forget;
- misunderstand;
- skip steps;
- claim completion prematurely.

If Auto mode uses the word “must,” the important gates should be independently checkable.

## 10.2 Target

Introduce a deterministic gate surface.

Conceptual command:

```bash
vcp gate
```

or a set of phase-specific gates.

For a material change it may check:

- project is VCP-managed;
- required Task Pack exists;
- task authority is current;
- task was implementation-ready;
- required verification exists;
- verification evidence corresponds to the current relevant revision;
- no unresolved must-fix review findings remain;
- required security/release gates were run;
- completion metadata is finalized.

## 10.3 Git-aware enforcement

Where Git is available, evidence should be tied to exact commit/revision semantics.

Avoid a false green caused by:

```text
tests passed
↓
code changed afterward
↓
merge anyway
```

VCP already has exact-head ideas in its lifecycle. Reuse them.

## 10.4 CI enforcement

Auto mode should optionally install/configure a VCP gate in CI.

Example:

```text
PR opened
   ↓
vcp gate --ci
   ↓
required state/evidence missing?
   ├─ yes → fail
   └─ no  → pass
```

Branch protection remains repository/platform policy; VCP should not claim it can enforce merge policy when it only reports a check.

## 10.5 Local enforcement

Do not require GitHub/hosted CI.

Provide a local deterministic command that can be run by:

- agents;
- developers;
- pre-commit/pre-push integrations if explicitly chosen;
- other CI providers.

## 10.6 Definition of done

- Auto mode has at least one deterministic command that detects bypass of required workflow state;
- evidence freshness is revision-aware;
- a material change cannot receive a green gate merely because an agent says it passed;
- the gate is useful locally and in CI;
- protected/high-risk workflow levels have stronger requirements than trivial levels.

---

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

# 12. Workstream J — Reduce framework tax

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

This is justified only if the machinery gives users stronger guarantees than a good portable Skill.

## 12.2 Action

Audit existing features using the Core-vs-Skill decision test.

For every feature, record:

- what user problem it solves;
- whether deterministic enforcement is required;
- whether the same value could be delivered more simply through a Skill;
- runtime/lifecycle complexity it introduces;
- whether real dogfood has demonstrated the need.

Do not delete proven core capabilities merely to become “simpler.”  
Do stop adding deterministic infrastructure for problems that are primarily conversational.

## 12.3 Candidate responsibilities to move toward Skills

Likely Skill-owned over time:

- interactive discovery;
- explanation-heavy planning UX;
- PR description generation;
- retro conversation;
- implementation narration.

Likely VCP-owned:

- readiness;
- authority;
- verification;
- evidence;
- lifecycle;
- path safety;
- merge/update behavior;
- architecture/security gates.

## 12.4 Definition of done

- architecture docs describe the boundary clearly;
- no duplicated “second VCP” lives inside Skills;
- new feature reviews explicitly state why the feature belongs in Core or Skill;
- install surface becomes smaller, not larger, as UX moves to Skills.

---

# 13. Sequencing

Do not attempt every workstream simultaneously.

Recommended order:

## Phase 1 — Adoption safety

1. smart `vcp init`;
2. remove init `--force`;
3. additive agent-file integration;
4. project-vs-framework asset separation;
5. preserve existing CI instead of installing generic VCP CI.

**Exit criterion:** VCP can be installed into an established repository without fear of destructive replacement or obvious repository pollution.

## Phase 2 — Adaptation model

1. capability schema;
2. capability detectors;
3. stack compatibility bridge;
4. Doctor capability reporting;
5. composable verification discovery.

**Exit criterion:** polyglot and unsupported projects degrade coherently instead of being forced into one stack label.

## Phase 3 — Declarative extensibility

1. profile detection DSL;
2. first-party profile migration;
3. community profile capability contributions;
4. trust/digest tests.

**Exit criterion:** new ecosystems can be integrated without arbitrary executable plugin code.

## Phase 4 — UX modes + Skills

1. persist `auto|manual`;
2. generate mode-aware adapters;
3. implement cross-agent `/vcp` Skills;
4. expose discovery/grill UX;
5. add workflow-level classification.

**Exit criterion:** a developer can use VCP without knowing the CLI in Auto mode, or invoke it intentionally in Manual mode.

## Phase 5 — Mechanical workflow enforcement

1. `vcp gate`;
2. revision-aware evidence freshness;
3. workflow-level requirements;
4. CI integration.

**Exit criterion:** important Auto-mode requirements are mechanically checkable rather than only requested in prompt text.

## Phase 6 — Conformance hardening

1. full compatibility matrix;
2. negative/golden failure cases;
3. update/rollback migration fixtures;
4. documentation claim audit.

**Exit criterion:** VCP can credibly claim safe adoption across the tested project classes.

---

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
