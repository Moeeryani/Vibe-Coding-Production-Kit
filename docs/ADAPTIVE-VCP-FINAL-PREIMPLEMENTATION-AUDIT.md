# Adaptive VCP — Final Pre-Implementation Audit

**Audit date:** 2026-10-06  
**Adaptive document blobs re-audited in the final consistency pass:** strategic `768d6be97f257106cda8f5d5c99399c78b27cef6`; technical `3032f5f48904376f98b02890cb1718d4d3639784`. This audit-record update itself is documentation-only.  
**Scope:** architecture, real-code integration, lifecycle compatibility, external ecosystem research, cross-document consistency, and implementation-readiness review for the Adaptive VCP roadmap.  
**Product code changed by this audit:** none. Documentation and status/evidence records only.

---

## 1. Final verdict

### Architecture verdict

**READY TO BEGIN THE STAGE-12 IMPLEMENTATION CONTRACT, WITH THE PRECONDITIONS BELOW.**

The audit did not find a foundational contradiction that requires abandoning the Adaptive VCP direction.

The strongest conclusion is still:

> VCP earns its complexity only as a deterministic engineering control plane around external coding agents. Conversational orchestration belongs in Skills/adapters; durable truth, lifecycle safety, readiness, verification, provenance, and enforceable gates belong in Core.

The implementation must **not** begin as one large “Adaptive VCP” rewrite.

The accepted sequence remains:

~~~text
reconcile current-main / Stage-11 closeout evidence
        ↓
Stage 12 — safe adoption planning + lifecycle foundations
        ↓
Stage 13 — transactional brownfield Smart Init apply
        ↓
Checkpoint A
        ↓
consumer/context cleanup
        ↓
CI inspection/migration
        ↓
capabilities/profiles
        ↓
workflow mode/router
        ↓
workflow levels/gate
        ↓
CI enforcement
        ↓
Skill expansion
        ↓
final conformance / model-capability audit
~~~

### Preconditions before product-code implementation

1. Keep released `v0.9.3` immutable.
2. Do not fabricate the missing historical Stage-11 post-finalization Windows rerun.
3. Record/run the appropriate **current-main** re-baseline gate and label it new evidence.
4. Create the Stage-12 Task Pack from that reconciled current-main baseline.
5. Stage 12 must remain bounded to its accepted contract; do not pull Phase-4/6/7 features forward merely because this audit specifies their future interfaces.

### Non-blocking residuals

These are deliberately not Stage-12 blockers:

- Linux/hosted execution compatibility follow-up #69;
- concurrent local-filesystem replacement/TOCTOU follow-up #73;
- exact Stage-13 answers-record serialization;
- Windows/macOS native runner expansion for the future cross-platform matrix;
- a detector-DSL fuzzer before real v2 community detector profiles exist;
- Dependency Graph Engine / scheduler machinery.

---


## 1A. Executable-evidence status of this audit

This audit must not be mistaken for a green executable release gate.

The final documentation/code-inspection pass attempted to create a fresh checkout in the available execution environment and run:

~~~text
npm run validate
npm run pack:check
~~~

The environment failed **before repository checkout** because DNS/network access to GitHub was unavailable:

~~~text
fatal: unable to access 'https://github.com/Moeeryani/Vibe-Coding-Production-Kit.git/':
Could not resolve host: github.com
~~~

The hosted GitHub Actions signal on audited documentation HEAD
`1d66656072ca69ca91a351b91c158e0fe38eef50` was also not source-test evidence:

- workflow: `Framework Validation`;
- run: `37457132363`;
- job: `112247378491`;
- conclusion: failure;
- runner_id: `0`;
- steps: `[]`.

No repository step executed.

Therefore:

~~~text
architecture / code / contract audit
→ PASS for Stage-12 design readiness

fresh executable current-main gate
→ NOT ESTABLISHED BY THIS AUDIT
→ remains a precondition before product-code Stage-12 work
~~~

This is consistent with the existing Roadmap evidence policy and open Linux/hosted compatibility follow-up #69.

Do not convert either the local DNS failure or the zero-step hosted failure into a source-code failure. Equally, do not claim a green executable gate that did not run.

## 2. Audit method

This was not a document-only review.

The audit cross-checked:

### Runtime/lifecycle code

- `lib/cli.mjs`
- `lib/init.mjs`
- `lib/template.mjs`
- `lib/state.mjs`
- `lib/update-plan.mjs`
- `lib/update-apply.mjs`
- `lib/update-apply-helpers.mjs`
- `lib/manage.mjs`
- `lib/migrations.mjs`

### Adaptation/context/assurance code

- `lib/stacks.mjs`
- `lib/stack-provenance.mjs`
- `lib/community-plugins.mjs`
- `lib/context.mjs`
- `lib/security-profiles.mjs`
- `lib/doctor.mjs`
- `lib/verification-commands.mjs`
- `lib/verify.mjs`
- `lib/task.mjs`
- `lib/readiness.mjs`
- `lib/git-review.mjs`
- `lib/prompt-eval.mjs`
- `lib/release-check.mjs`
- `lib/adapters.mjs`

### Canonical repository contracts

- `docs/ROADMAP.md`
- `docs/OPERATING-MODEL.md`
- `docs/TASK-PACKS.md`
- `docs/TASK-READINESS.md`
- `docs/CONTEXT-PACKS.md`
- `docs/UPDATES.md`
- `docs/CLI.md`
- `docs/DOCTOR.md`
- `docs/STACK-PROFILES.md`
- `docs/MOBILE-PROFILES.md`
- `docs/COMMUNITY-PLUGINS.md`
- root `AGENTS.md`
- current README/public claims
- Stage-11 design and implementation Task Packs

### Test/release surface

The existing test suite already has strong focused coverage for:

- CLI behavior;
- update planning/apply/rollback/concurrency;
- lifecycle migrations;
- manage ignore/track;
- selected project roots/workspaces;
- Context Packs;
- verification commands and Git provenance;
- readiness;
- Git-aware review;
- security profiles;
- community plugin trust;
- prompt evaluation;
- React Native detection;
- architecture fitness;
- release/package smoke.

The Adaptive design therefore extends these test seams rather than replacing them with one giant end-to-end harness.

---

## 3. External research cross-check

The architecture was compared against current ecosystem behavior rather than assuming older 2025 agent patterns still apply.

### Plan/apply freshness

HashiCorp Terraform explicitly distinguishes a speculative unsaved plan from an executable saved plan and warns that intervening changes can make an earlier speculative result differ from the final effect. This validates VCP's deliberate design:

~~~text
preview
→ informative/speculative

apply
→ lock
→ inspect again
→ fresh plan
→ mutate current state
~~~

Source: https://developer.hashicorp.com/terraform/cli/commands/plan

VCP is **not** implementing saved-plan execution in Stage 12/13. A future saved-plan feature would need explicit repository/file/version preconditions.

### Sensitive action approval belongs at the side-effect boundary

OpenAI's current agent guardrail guidance separates automatic validation from human approval and specifically recommends pausing before sensitive side effects such as edits, shell commands, cancellations, or sensitive MCP actions.

Source:

- https://developers.openai.com/api/docs/guides/agents/guardrails-approvals

This supports VCP's command-authority refinement: a project file being trusted as context is not sufficient authorization to execute every command string it contains. Approval-required verification commands are bound to the exact normalized command identity/fingerprint and source provenance. A changed command invalidates the old approval.

### Workflow and shell inputs must be treated as untrusted

GitHub's current Actions security guidance explicitly warns that attacker-controlled context values can become executable script input when interpolated into shell/workflow code.

Source:

- https://docs.github.com/en/actions/concepts/security/script-injections

This reinforces two VCP boundaries:

- task/PR/branch/context strings are never assumed safe shell fragments;
- future CI integration delegates to fixed VCP CLI arguments/contracts rather than constructing arbitrary verification shell from untrusted platform text.


### Standing instructions vs task workflows

GitHub's current guidance distinguishes always-on repository/path instructions from task-specific Skills. That supports shrinking VCP standing instructions and routing detailed workflow behavior through Skills/Context Packs instead of making `AGENTS.md` a permanent full engineering manual.

Sources:

- https://docs.github.com/en/copilot/reference/custom-instructions-support
- https://docs.github.com/en/copilot/concepts/agents/code-review
- https://docs.github.com/en/copilot/reference/customization-cheat-sheet
- https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/skills

The host-loading semantics are **not uniform**. VCP therefore keeps its top-level Skill small even if a host eagerly injects it and never makes correctness depend on lazy loading.

### CI enforcement

GitHub required checks are only merge-authoritative when branch/ruleset policy actually requires them. Merge queues need `merge_group` support for GitHub Actions checks.

Sources:

- https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue

This validates the VCP separation:

~~~text
gatePolicy
  = VCP/project intent

platformEnforcement
  = observed platform requirement
~~~

A green VCP job is evidence. It is not automatically merge enforcement.

**Current repository observation (2026-10-06):** the GitHub branch API reported `main` as `protected=false` with required status-check enforcement off. This is a time-bounded audit observation, not a permanent architectural assumption. It demonstrates why VCP must report `gatePolicy` separately from observed `platformEnforcement`.

### Right-sized workflow / framework tax

OpenSpec's default flow is chat-driven and intentionally compact. Spec Kit now has both fuller and Lean workflows and explicit existing-project adoption guidance. BMAD v6.12 decides ceremony after investigation and avoids Build for trivial chores. Agent OS v3 retired its own implementation/orchestration phases because frontier agents now own that responsibility better.

Sources:

- https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md
- https://github.com/github/spec-kit/blob/main/docs/quickstart.md
- https://github.com/github/spec-kit/blob/main/presets/lean/README.md
- https://github.com/bmad-code-org/BMAD-METHOD/blob/main/CHANGELOG.md
- https://github.com/buildermethods/agent-os/blob/main/CHANGELOG.md

These findings reinforce VCP's L0/L1/L2/L3 design, progressive disclosure, and Complexity ROI rule. They argue **against** adding a general multi-agent orchestrator now.

---

# 4. Workstream-by-workstream implementation audit

## A. Smart Init + lifecycle safety

### Current code reality

Current init:

~~~text
parse/default CLI options
→ build full desired VCP surface
→ any existing desired path = collision
→ abort or init --force
→ write desired files
→ build manifest
→ whole-file baselines
~~~

Important real-code couplings:

- `--yes` collapses an omitted agent selector to `generic` before repository maturity is known.
- `includeGitHub` defaults true before repository maturity is known.
- current init `--dry-run` can hit collision handling before producing a useful brownfield adoption plan.
- `buildManifest()` does not own all install metadata consistently; some metadata is added afterward.
- current lifecycle schema is v1 and whole-file oriented.
- current update is safer than init: planning, conflict blocking, lock, backup, transaction, staged apply, baselines, rollback.
- current update lock creates `.vcp/` before backup exists.
- current backup/restore assumes a managed manifest and does not naturally represent “manifest/baselines did not exist.”
- current `manage ignore` drops the managed entry/baseline, and `manage track` reconstructs from current desired files.

### Problem

Initial adoption—the highest-risk lifecycle event—is less safe than subsequent updates.

A mature repository can already own:

- agent instructions;
- verification commands;
- docs/Source-of-Truth paths;
- CI;
- GitHub hygiene;
- a `.vcp/` path;
- local prompt/profile overrides;
- several stack families.

The current `--force` model cannot safely express partial/section ownership or additive adoption.

### What it affects

Smart Init changes or is changed by:

- CLI option provenance;
- manifest schema/reader compatibility;
- ownership and baseline semantics;
- update planner/apply;
- backup/rollback/transactions;
- manage ignore/track;
- Doctor;
- task command authority;
- package/consumer asset selection;
- old-CLI compatibility;
- future workflow/capability fields.

### Accepted fix

Stage 12 introduces the **planner and lifecycle primitives**, but no Smart Init mutation into unmanaged EXISTING repositories.

~~~text
VCP-state readability
→ NEW / EXISTING / MANAGED or conflict/recovery state
→ bounded adoption surface
→ deterministic actions
   ADD / ADOPT / COMPOSE / PRESERVE / NOOP / SKIP / CONFLICT
→ content-free preview
~~~

Stage 13 applies only a **fresh** plan recomputed under the lifecycle lock.

### Ownership

Future manifest has independent dimensions:

~~~text
ownership.kind
  file | section

policy
  managed | merge | generated | preserve
~~~

Brownfield integration files use VCP-marked section ownership, including a newly created thin brownfield `AGENTS.md`.

Marker presence alone does not prove VCP authorship. Adoption must validate marker structure and content.

### Reader compatibility

Section ownership requires lifecycle manifest schema v2.

Schema number alone is not enough for future same-schema behavior-bearing fields. The manifest therefore needs a fail-closed semantic reader floor such as:

~~~text
minimumReaderVersion
~~~

A new behavior-bearing persisted field must raise that floor unless explicitly classified inert.

Published-old-CLI safety cannot rely on code added after the old binary shipped; the schema-v2 migration therefore also needs the legacy mutation fence/recovery contract already documented in the technical analysis.

### First-adoption lock/rollback

Lock bootstrap must remember whether it created `.vcp/`.

If planning blocks before backup:

~~~text
release owned lock
→ remove only empty operation-created .vcp
→ preserve unexpected content
~~~

Once recovery metadata exists, rollback represents **prior absence** as well as prior content.

### Verification-command authority

Do not first-match parse a brownfield `AGENTS.md`.

Per command key:

~~~text
missing
unique
duplicate-equivalent
duplicate-conflicting
~~~

Equivalent duplicates are one unambiguous effective value after only ordinary outer-whitespace/line-ending normalization; every source location is retained, project text is not rewritten, and no fake human decision is created. Conflicting values require resolution.

Approval-required commands use a durable lifecycle receipt bound to the exact command key + normalized-command fingerprint + source/provenance + approval-policy/decision version. The optional answers record may transport the human decision during fresh apply, but it is not the durable post-adoption authority.

New provenance-aware Task Packs snapshot the executable command contract. Merge-authoritative gate re-resolves current repository command authority; if the current identity differs, the task is stale and must be refreshed/re-planned before it can pass.

### Agent and GitHub option provenance

Do not turn omission into explicit preference.

~~~text
agentPreference
  unspecified | explicit(selector)

githubPreference
  unspecified | include | exclude
~~~

For brownfield `--yes`, omission stays omission.

The CLI must represent GitHub request provenance explicitly:

~~~text
no GitHub flag → unspecified on EXISTING
--github (or final positive equivalent) → include
--no-github → exclude
both positive + negative → syntax error
~~~

This prevents the current `includeGitHub=true` parser default from being mistaken for explicit user intent.

### Acceptance

Stage-12/13 tests must prove:

- zero-write brownfield preview;
- no `init --force` bypass;
- malformed/newer/unreadable VCP state fails closed;
- managed schema-v1 migrates only through normal update lifecycle;
- old readers cannot mutate incompatible state;
- unchanged snapshot gives equivalent fresh plan;
- changed snapshot re-plans/differs/blocks;
- section surrounding bytes survive;
- command authority is unambiguous and duplicate-equivalent values do not cause needless HUMAN DECISION;
- approval-required command receipts are persisted only after successful apply/update and become stale on command/source change;
- provenance-aware task command snapshots are rejected as stale when current repository command authority changes;
- init preview/success messaging is repository-class/assetSet aware and never tells brownfield-minimal to create starter truth it deliberately preserved;
- public CLI can express GitHub `unspecified | include | exclude` without collapsing omission;
- first-adoption rollback returns to true unmanaged shape;
- immediate post-adoption update is safe/idempotent.

**Audit result:** coherent and implementation-ready after the documented preconditions.

---

## B. Consumer asset surface + Context/Doctor

### Current code reality

`CORE_ASSET_ROOTS` currently includes the full `docs/`, all `prompts/`, examples, and framework validation scripts. `GITHUB_ASSET_ROOTS` includes issue/PR assets plus VCP's own npm-centric `validate.yml`.

Current Context Pack construction reads project-local mode prompts. Current Doctor/release/source validation assumes several local framework assets exist.

Security profiles already demonstrate a better pattern:

~~~text
project-local override
→ else packaged canonical profile
~~~

### Problem

The target repository receives too much VCP framework/source material, increasing:

- repository noise;
- collisions;
- update complexity;
- standing context;
- brownfield adoption risk.

But simply deleting copied assets first would break Context, Doctor, release/migrations, and legacy managed installs.

### What it affects

- `template.mjs`
- Context resolver
- Doctor
- security-profile parity
- release/package files
- lifecycle desired-state generation
- legacy migration
- Task Pack Source-of-Truth scaffolding
- standing agent instructions

### Accepted fix

Use one **classified catalog**, not one identical install list:

~~~text
runtime-required
greenfield-starter
optional-hygiene
package-only
~~~

Install profile is persisted:

~~~text
legacy-full-v1
greenfield-safe-v1
brownfield-minimal-v1
~~~

Missing/invalid schema-v2 assetSet fails closed rather than guessing.

### Prompt resolver

Stage 12 must land project-override → fixed packaged prompt fallback.

Packaged prompt rules:

- fixed allowlist only;
- selected-root-safe local overrides;
- package prompt is execution guidance, never project Source of Truth;
- bytes count against Context budget;
- source identity remains visible.

Doctor uses the same resolver immediately.

### Brownfield docs

Brownfield-minimal does not create VCP starter Product/Architecture/Security/Testing files merely to satisfy canonical paths.

Doctor distinguishes:

~~~text
VCP install health
vs
project governance coverage
~~~

Absent starter docs are not install corruption.

### Legacy CI package bridge

Fresh installs stop **selecting** `.github/workflows/validate.yml`, but Stage 12 must keep the old canonical workflow **inside the package** while `legacy-full-v1` update/migration still needs it.

~~~text
packaged legacy asset
!=
fresh consumer desired asset
~~~

Phase 3 performs explicit removal/detach/preserve migration, after which a later package may remove the legacy asset once upgrade/recovery support no longer needs it.

### Acceptance

- package surface and consumer surface tested separately;
- Context works with no project-local canonical prompts;
- local overrides remain authoritative;
- Doctor does not diagnose intentional brownfield absence;
- legacy workflow remains reproducible until migration;
- framework validator remains source/package tooling, not arbitrary consumer tooling.

**Audit result:** coherent after the legacy-package bridge was made explicit.

---

## C. Composable capabilities

### Current code reality

Current `detectStack()` returns one stack using priority:

~~~text
Go
Python
React Native
TypeScript
JavaScript
generic
~~~

Stage 11 React Native is already real current behavior and has important requested/resolved provenance rules.

Some current legacy marker checks use `access()`, which can treat symlinked markers as present.

### Problem

One stack cannot represent a polyglot/layered repository, but replacing `detectStack()` directly would break:

- templates;
- Doctor;
- update/manage;
- stack provenance;
- React Native specialization;
- tests and persisted manifests.

### Accepted fix

Add a normalized capability model **alongside** the legacy stack compatibility summary.

Keep separate:

~~~text
detected evidence
applied/configured state
application provenance
~~~

`proven` does not automatically mean `applied`.

Core/first-party deterministic evidence may be auto-eligible under lifecycle rules. Community evidence remains proposal/unapplied until project-owned adoption.

Capability disappearance never silently auto-removes previously applied behavior.

### Filesystem trust

New capability-grade detectors—core, first-party, or community—must use:

- selected-root confinement;
- expected regular-file/directory type;
- symlink-safe evidence;
- bounded reads;
- deterministic path/case handling;
- explicit detector/path provenance.

Do not simply split the current legacy `exists()/access()` checks into multiple detectors.

### React Native migration bridge

Preserve Stage-11:

- explicit `requestedStack=react-native`;
- auto-specialization provenance;
- selected-root evidence;
- verification discovery;
- mobile HUMAN DECISION boundaries;
- plugin coexistence.

Legacy stack summary remains until every consumer migrates safely.

### Acceptance

- JS/TS/Python/Go/React-Native simple fixtures retain equivalent behavior;
- polyglot root no longer pretends priority = project intent;
- unsupported ecosystem degrades to safe/generic behavior;
- detector disappearance does not delete managed guidance;
- Doctor distinguishes detected/applied/mismatch/pending transition.

**Audit result:** direction is justified; do not pull into Stage 12.

---

## D. Declarative profiles/plugins

### Current code reality

The v1 community plugin loader is one of VCP's strongest trust boundaries:

- local;
- text-only;
- digest-pinned;
- explicit selection/grants;
- size/count limits;
- symlink/traversal protection;
- no code/network;
- guidance + verification proposals only.

### Problem

Profiles cannot scale to every ecosystem if VCP must hand-code all evidence, but executable plugins would weaken the exact determinism that differentiates VCP from a Skill-only framework.

### Accepted fix

Add a separate, strict community profile/plugin schema v2 with bounded declarative detection and explicit `capability-detection` grant.

Do not make v1 permissive.

Detector DSL may support bounded predicates such as:

- file/directory exists;
- JSON field equals;
- package dependency exists;
- exact text marker.

The evaluator inherits/strengthens v1 security:

- selected-root confinement;
- no symlink authority;
- resource budgets;
- deterministic parse failure;
- no raw matched content leakage;
- no environment/credentials/network/internal-state probes.

Community detector success yields evidence, not automatic applied authority.

### Acceptance

Negative tests include traversal, symlink, malformed/oversized metadata, prohibited paths, content leakage, bad digest, missing grants, and tampered selected bundles.

**Audit result:** justified as a later adaptation layer; no arbitrary executable plugin system.

---

## E. Project-aware CI

### Current code reality

Current installer couples GitHub hygiene and one exact npm-centric source workflow. Doctor also uses that exact path as the CI signal.

The repository's own hosted CI evidence remains limited: current accepted evidence policy is fresh-clone Windows exact-head, while Linux/hosted compatibility stays #69.

### Problem

VCP cannot safely install its own Node/npm source CI into Python/Go/unknown repositories, and the presence of a workflow file does not prove verification coverage or merge enforcement.

### Accepted fix

Stage 12 safety floor:

- fresh safe installs do not install VCP source `validate.yml`;
- existing CI remains project-owned;
- absence of legacy workflow is valid for safe asset sets.

Phase 3:

- provider-neutral detection/reporting;
- explicit migration of old VCP-managed workflow.

Phase 8:

- CI delegates to `vcp gate`;
- project owns bootstrap/toolchain/services;
- VCP does not invent environment setup;
- one material Task Pack selector per PR in first release;
- missing/invalid/multiple selector fails closed for material work;
- L0 can use explicit base/head path.

Keep these distinct:

~~~text
gatePolicy
  disabled | advisory | required

platformEnforcement
  detected-required | detected-not-required | unverified | unsupported
~~~

GitHub merge queues require the appropriate merge-group trigger/check path.

### Acceptance

- no CI overwrite on init;
- no npm workflow on fresh unsupported projects;
- old local edits detach/preserve;
- gate job cannot silently skip required PRs due to path filters;
- platform enforcement is never claimed without platform evidence;
- merge queue fixture covers `merge_group`;
- current #69 remains explicit until real hosted/Linux evidence exists.

**Audit result:** coherent; CI generation correctly waits for a stable gate.

---

## F. Auto/Manual + workflow levels

### Current code reality

Current root `AGENTS.md` already describes an agent-first VCP workflow, but it is instruction-driven and large. There is no persisted workflowMode and no deterministic gate.

### Problem

Users need two different triggers:

~~~text
Auto
→ agent routes meaningful work into VCP

Manual
→ VCP workflow only on explicit invocation
~~~

But routing preference is not merge enforcement, and Auto cannot guarantee interception across all agent platforms.

### Accepted fix

Persist:

~~~text
workflowMode
  auto | manual
~~~

separately from later:

~~~text
gatePolicy
  disabled | advisory | required
~~~

New installs default Auto unless explicitly Manual. Legacy state normalizes Auto-compatible because current behavior is already agent-first, but that normalization never silently enables gate/CI enforcement.

Nested/path-specific instructions may shadow root routing; Doctor/status reports the limitation rather than recursively claiming ownership.

### Workflow levels

Keep the dimensions orthogonal:

~~~text
workflowMode  = auto/manual
workflowLevel = L0/L1/L2/L3
executionMode = AFK/HITL
contextMode   = plan/implement/review/security/release
readiness     = blocked/ready/etc.
~~~

L0:
- no Task Pack;
- explicit project trivial-surface allowlist required;
- no extension/name heuristic;
- missing policy → at least L1.

L1:
- compact durable Task Pack;
- same task family;
- task-local authority allowed only for bounded defect/internal-maintenance intent;
- compact implementation approach;
- deterministic verification;
- fresh exact-surface review provenance.

L2:
- current full Task Pack/readiness/review.

L3:
- L2 + only relevant high-risk controls;
- dedicated security-mode review when required;
- no security-profile leakage into ordinary plan/implement context.

Legacy Task Packs with no Workflow-Level normalize to L2.

Promotion expands the same Task Pack and invalidates insufficient lower-level review/finalization evidence. Core does not auto-downgrade.

### Acceptance

Dogfood must measure classification false positives/false negatives and human interruption, not only test correctness.

**Audit result:** the L1 lane is necessary and should ship with the gate in Phase 7, not be deferred indefinitely.

---

## G. Skills UX

### Current code reality

VCP currently has prompts and agent instructions, but no canonical packaged primary cross-agent VCP Skill.

### Problem

Without a thin UX layer, users must know VCP commands; with an oversized Skill, VCP simply recreates the same context bloat elsewhere.

### Accepted fix

Phase 6 ships one real package-owned primary router Skill.

Skills:

- inspect project/VCP state;
- call existing deterministic commands;
- consume Context Packs;
- explain blockers/evidence;
- ask only true human decisions.

They do **not** store Task Pack lifecycle truth or duplicate readiness/gate policy.

Host Skill loading varies. The top-level Skill must be small enough even for eager-loading hosts; deeper references remain separate and progressive where the platform supports that behavior.

Phase 9 can add specialized grill/review/retro UX only after Core contracts stabilize.

### Acceptance

- no second VCP policy copy in Skills;
- Task Packs remain Core artifacts;
- Auto and Manual share router logic;
- behavior evals cover observable UX;
- context footprint measured per host configuration rather than promising generic Skill token savings.

**Audit result:** strong and consistent with current agent ecosystems.

---

## H. Mechanical gate

### Current code reality

VCP already has most primitives:

- readiness;
- task artifacts;
- verification command execution;
- exact Git provenance;
- bounded review snapshots;
- independent review findings;
- finalization protocol.

What it lacks is one deterministic final decision surface.

### Accepted fix

Do not build another verifier.

Gate reuses existing components.

L0:

~~~text
vcp gate --level l0 --base <ref> [--head <ref>]
~~~

No Task Pack; changed-surface policy only.

L1/L2/L3:

~~~text
vcp gate <task>
vcp gate <task> --run
~~~

### Review/finalization compatibility

Current VCP deliberately has two heads:

~~~text
reviewed implementation head
→ Task-record finalization edit
→ finalization head
→ exact-head executable rerun
~~~

Therefore a naive `reviewHead == currentHead` rule is wrong.

The exception is **semantic**, not merely “same Task Pack path.”

After review, only parser-allowlisted review/finalization evidence may change. Requirements, acceptance, scope, SoT, verification declarations, architecture/data/security/migration contract changes invalidate the old review.

Merge-authoritative gate requires local Git exact committed heads and clean relevant worktree. GitHub itself is optional; Git provenance is not.

Saved old evidence is audit history, not automatic current merge authority.

### Gate receipt

Phase 7/8 should expose a versioned machine-readable receipt binding:

- task identity/workflow level;
- protected task-contract identity where useful;
- reviewed/final heads;
- verification outcomes;
- deterministic pass/fail/block reasons.

This is **not** a Smart Init saved-plan hash.

### Acceptance

- stale verification fails;
- stale review fails;
- allowed finalization diff passes;
- protected task-contract mutation after review fails;
- gate never manufactures HUMAN DECISION approval or claims to run an AI review itself;
- CI calls the same gate rather than recreating it.

**Audit result:** justified Core machinery because it enforces current VCP contracts mechanically.

---

## I. Conformance matrix

### Current code reality

VCP has many strong focused test seams but does not yet have the Adaptive cross-product matrix.

### Required matrix

Cover at least:

- NEW / EXISTING / MANAGED / corrupt/newer lifecycle;
- greenfield-safe / brownfield-minimal / legacy-full;
- agent adapter combinations;
- existing CI and unknown CI;
- JS/TS/Python/Go/React-Native/unsupported/polyglot;
- monorepo/nested roots;
- symlinks/case/line endings/dirty worktree;
- prompt local/package fallback;
- command authority duplicates/conflicts;
- section ownership + ignore/retrack;
- old CLI vs schema v2;
- L0/L1/L2/L3;
- Auto/Manual × gate policy;
- ordinary/security review freshness;
- merge-queue/task-selection cases.

### Platform evidence rule

Keep distinct:

~~~text
semantic fixture coverage
public CLI tests on current host
native/hosted executable evidence
~~~

A green fixture matrix does not prove Linux/macOS/hosted execution. Platform claims require exact executable evidence from that channel.

### Acceptance

Every supported safety invariant needs a negative fixture, and release documentation may claim only what the matrix plus actual platform evidence proves.

**Audit result:** strong; current #69 remains explicit rather than being hidden by a generic “cross-platform” PASS.

---

## J. Complexity ROI

### Current reality

VCP already carries meaningful framework tax.

The existence test is:

> If prompts/Markdown UX disappeared, would the deterministic runtime still deliver substantial value?

Today the answer is yes: lifecycle, merge/conflict behavior, path safety, bounded context construction, readiness, verification, provenance, trust, and recovery are executable value.

### Rule for new Core work

A new persistent subsystem must answer:

~~~text
failure prevented
real/repeated evidence
why agent/Skill is insufficient
why existing tooling is insufficient
deterministic requirement
persistent state/migration burden
user complexity added/removed
dogfood evidence
~~~

### Audit classification of planned machinery

**Core justified:**

- manifest schema/reader guard;
- section ownership;
- assetSet;
- safe init planner/apply;
- command authority;
- hardened capability evidence;
- lifecycle provenance;
- gate;
- CI gate receipt;
- migrations/Doctor/release checks.

**Skills/config/platform instead:**

- conversational routing;
- grill/retro/PR narration;
- L0 policy content;
- task-to-PR mapping;
- branch/ruleset enforcement;
- project CI bootstrap.

**Still deferred/rejected:**

- embedded LLM runtime;
- multi-agent fleet/orchestrator;
- generic scheduler;
- persisted dependency graph without new evidence;
- arbitrary executable plugins;
- second task database;
- saved Smart Init plan execution;
- universal framework inference.

External changes such as Agent OS v3 retiring its own orchestration reinforce this restraint.

**Audit result:** no new large Core subsystem was justified by this final audit beyond the already documented safety primitives.

---

# 5. Cross-workstream consistency results

The final post-amendment consistency matrix rechecked **41 load-bearing contracts** across both Adaptive documents.

The contracts include:

1. Stage-12 unmanaged brownfield mutation boundary;
2. managed schema migration through update;
3. Stage-13 fresh re-plan;
4. section ownership + schema versioning;
5. minimum reader compatibility;
6. old-CLI mutation fence;
7. install asset sets + assetSet-aware adoption/task/onboarding behavior;
8. agent preference provenance;
9. GitHub preference provenance + explicit CLI representability of unspecified/include/exclude;
10. verification-command authority + lifecycle-owned approval receipts + Task Pack command-contract freshness;
11. reserved VCP state;
12. prompt fallback authority;
13. Doctor/install-result assetSet behavior;
14. classified consumer catalog;
15. capability evidence vs applied state;
16. approval-required capability removal;
17. core detector filesystem trust;
18. community detector trust;
19. React Native migration provenance;
20. fresh-install CI safety;
21. gate vs platform enforcement;
22. merge-queue handling;
23. orthogonal workflow terms;
24. workflowMode vs gatePolicy;
25. L0 fail-conservative semantics;
26. one Task Pack family;
27. legacy Task Pack = L2;
28. promotion in same Task Pack;
29. L3 security-mode isolation;
30. gate reuse of deterministic machinery;
31. semantic post-review allowlist;
32. Git-bound merge gate;
33. runtime-agnostic Skill loading;
34. Task Packs != Skills;
35. human-attention evaluation;
36. Complexity ROI;
37. deferred dependency graph;
38. negative conformance fixtures;
39. platform evidence separation;
40. Checkpoint A sequencing after Stage 13;
41. compatible recovery from a malformed/missing active manifest using validated version-compatible backup/transaction state.

All **41/41** contracts were present and mutually compatible after correcting search-term false positives and the additional amendments in this final pass. No architectural contradiction remained among these contracts.

This does **not** mean implementation bugs are impossible. It means the intended contracts no longer prescribe mutually incompatible behavior.

---

## 5A. Per-workstream analysis coverage audit

The consistency pass also checked **analysis completeness**, not only absence of contradictions.

The two Adaptive documents have intentionally different jobs:

~~~text
strategic plan
→ current situation / product problem / target rules / sequencing / success

technical analysis
→ real code surfaces / downstream coupling / migration / failure modes / tests
~~~

Requiring both files to repeat the same file map would add framework tax, so completeness is judged across the pair while each document remains sufficient for its role.

| Architectural point | Strategic current/problem/target/DoD | Technical code/coupling/migration/tests | Result |
|---|---|---|---|
| A — Smart Init/lifecycle | Yes | Yes, including CLI/init/state/update/manage/Doctor/task/command authority | Complete |
| B — consumer vs package assets | Yes | Yes, including Context/Doctor/release/migration downstreams | Complete |
| C — composable capabilities | Yes | Yes, including stack compatibility, provenance, Doctor/update/manage | Complete |
| D — declarative profiles/plugins | Yes | Yes, including trust, grants, detector DSL, path/resource safety | Complete |
| E — CI integration | Yes | Yes, including fresh-install safety, inspection, migration, gate delegation, platform enforcement | Complete |
| F — Auto/Manual + workflow levels | Yes | Yes, including manifest state, adapters, L0–L3 task/readiness/context/review effects | Complete |
| G — Skills UX | Yes; problem/affected surfaces now explicit | Yes, including packaging, prompt-eval, host loading semantics | Complete; no lifecycle data migration invented |
| H — deterministic gate | Yes | Yes, including parser/readiness/verify/Git/review/finalization/receipt interactions | Complete |
| I — compatibility/conformance | Yes | Yes, including fixtures, public CLI, negative cases, platform evidence separation | Complete |
| J — Complexity ROI | Yes | Yes, including Core-vs-Skill ownership and explicit dependency-graph deferral | Complete; migration not applicable as a generic requirement |
| Product invariants 2A / code contracts 3A | Yes | Yes | Complete |

Additional completeness checks passed:

- every behavior-bearing persisted field has a writer/reader/migration/rollback/reader-compatibility story;
- every brownfield-owned text surface has ownership + update + ignore/track semantics;
- every future executable boundary has provenance/freshness/fail-closed behavior;
- every staged feature that changes public behavior has negative tests/DoD and a sequencing owner;
- current-vs-target differences are explicitly labeled rather than silently mixing released and future behavior;
- conscious deferrals are named rather than left as implicit holes.

**Coverage verdict:** no load-bearing point is missing its current-state analysis, impact/coupling analysis, target fix, and validation path at the level appropriate to the two-document authority split.

---

# 6. Important second-order effects resolved during the final pass

The final post-audit review found and incorporated additional issues that were not sufficiently explicit in the earlier external audit snapshot:

1. **Core capability detector symlink authority**  
   New core detectors must not inherit the legacy stack detector's weaker `access()` semantics.

2. **Skill host-loading variance**  
   Correctness/progressive disclosure cannot depend on universal lazy loading.

3. **Cross-platform proof boundary**  
   Fixtures are not native/hosted execution evidence.

4. **Legacy CI package bridge**  
   A file can remain packaged for legacy migration while being absent from fresh consumer desired state.

5. **Stage-12 wording**  
   “Read-only Stage 12” was too broad; the restriction is unmanaged brownfield Smart Init, while managed update migration is still allowed.

6. **Section re-track ownership**  
   Ignoring/retracking a brownfield adapter must never promote it to whole-file ownership.

7. **Post-review semantic mutation**  
   Task-Pack-only path checks are insufficient; protected contract sections cannot change after review without invalidating review provenance.

8. **Routing vs merge enforcement**  
   workflowMode and gatePolicy are orthogonal.

9. **L0 policy**  
   VCP cannot universally treat docs/extensions as trivial; no explicit project policy means minimum L1.

10. **One Task Pack family**  
    L1/L2/L3 share durable repository artifacts; legacy no-level Task Packs normalize L2.

11. **Command approval is value-bound, not source-file-bound**  
    Sensitive verification approval persists as a bounded lifecycle receipt; command/source changes stale it, and Task Pack command snapshots must still match current authority for merge-authoritative gate.

12. **GitHub preference needs a positive CLI form**  
    Once omission means `unspecified`, current `--no-github` alone is insufficient. The public CLI needs one explicit positive include flag and must reject contradictory positive+negative flags.

13. **Init handoff must match the adopted asset surface**  
    Current greenfield `printInitResult()` cannot be reused unchanged for brownfield-minimal because it would instruct the agent to create Source-of-Truth starters VCP deliberately did not install.

These amendments are now integrated into the main Adaptive documents rather than living only in an audit note.

---

# 7. Remaining conscious deferrals

These are deliberate, not forgotten dependencies:

- exact answers-record file shape for Stage 13;
- optional future `vcp manage repair-markers`;
- detector-DSL fuzzing before useful real v2 detector profiles exist;
- wider native/hosted runner coverage;
- future saved executable Smart Init plan;
- universal task selector discovery for CI;
- dependency graph persistence/scheduling;
- full orchestration/fleets.

Each requires evidence before becoming Core.

---

# 8. Implementation handoff — Stage 12

The next implementation Task Pack should **not** say “implement Adaptive VCP.”

It should be bounded to Stage 12.

A safe implementation decomposition is:

### Slice 12.1 — lifecycle compatibility foundation

- shared semver comparison;
- lifecycle manifest schema v2;
- ownership kind;
- assetSet;
- minimumReaderVersion;
- schema-v1 migration;
- published-old-reader compatibility fence;
- previous-release smoke.

### Slice 12.2 — managed-section primitives

- marker parser;
- code-fence-aware scanning;
- authorship/adoption rules;
- section baseline/merge/reconstruction;
- manage ignore/retrack semantics;
- tests only; no brownfield apply.

### Slice 12.3 — repository inspection and raw option provenance

- VCP state readability;
- NEW/EXISTING/MANAGED/conflict/recovery;
- reserved `.vcp`;
- raw agent/GitHub/stack request provenance;
- explicit positive+negative GitHub CLI request representation;
- brownfield stack ambiguity;
- no mutation.

### Slice 12.4 — asset/prompt/command planning inputs

- classified catalog;
- assetSet-aware desired surface;
- canonical prompt resolver;
- Doctor prompt-source minimum;
- verification-command authority inspection, command identity/fingerprint/provenance, and approval-needed decision reporting;
- greenfield-safe CI filtering;
- legacy workflow remains packaged.

### Slice 12.5 — init planner / public preview

- ADD/ADOPT/COMPOSE/PRESERVE/NOOP/SKIP/CONFLICT;
- deterministic ordering;
- content-free JSON;
- repository-class/assetSet-aware human + JSON handoff/next-step reporting;
- zero-write brownfield dry-run;
- non-dry-run brownfield apply blocked;
- remove init-specific `--force`;
- public CLI regressions.

### Stage-12 exit

Do not begin Stage 13 merely because unit tests are green.

Require:

- full Stage-12 deterministic suite;
- previous-release lifecycle compatibility smoke;
- representative brownfield preview dogfood;
- review against both Adaptive documents;
- exact-head release/package checks accepted under the current executable evidence policy;
- Checkpoint evidence artifact proving the Stage-12 contract—not future Stage-13 adoption success.

### Stage-13 command-authority carry-forward

Stage 13 must not merely consume the Stage-12 command decision and forget it. Fresh apply revalidates any reusable decision against the exact current command identity, then successful apply persists the bounded lifecycle receipt. Rollback restores prior receipt state. New brownfield Task Packs capture command provenance/fingerprint so later verification/gate can detect stale project command authority.

---

# 9. What must not be implemented in Stage 12

Do not pull in:

- capability persistence/detector engine;
- community detector schema v2 runtime;
- workflowMode;
- L0/L1/L2/L3;
- `vcp gate`;
- gatePolicy;
- generated provider CI;
- broad Skill suite;
- dependency graph/scheduler;
- multi-agent orchestration.

Only minimal package router source preparation may be touched if a Stage-12 packaging dependency absolutely requires it; it must not become a behavior-bearing Phase-6 feature early.

---

# 10. Final implementation-readiness judgment

The Adaptive design is now sufficiently coherent to start **Stage-12 bounded implementation**, not to start the whole roadmap.

The most important reason it is ready is not the number of pages or tests. It is that the design now states explicit ownership and failure behavior at the boundaries where implementation normally becomes dangerous:

- old vs new CLI;
- package vs consumer;
- whole file vs managed section;
- project text vs VCP authority;
- command text vs executable approval receipt/current Task Pack command contract;
- detected evidence vs applied capability;
- prompt guidance vs Source of Truth;
- Auto routing vs merge enforcement;
- review head vs finalization head;
- semantic fixtures vs platform execution;
- Skill UX vs deterministic Core.

If implementation discovers a contradiction with these boundaries, **stop that slice and amend the contract before adding compensating machinery**.

That is preferable to preserving the roadmap at the cost of a second lifecycle engine, hidden state, or more framework tax.

---

## 11. Durable source map

Strategic target:

- `docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md`

Code/integration authority:

- `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md`

Status/sequencing:

- `docs/ROADMAP.md`

Current released/current-main behavior until each stage lands:

- `README.md`
- `docs/CLI.md`
- `docs/OPERATING-MODEL.md`
- `docs/TASK-PACKS.md`
- `docs/TASK-READINESS.md`
- `docs/CONTEXT-PACKS.md`
- `docs/UPDATES.md`

This audit is the consolidated durable record replacing reliance on the earlier auditor-workspace-only path referenced by Appendix Z.
