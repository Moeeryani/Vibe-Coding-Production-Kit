# CLI

The CLI bootstraps the Vibe Coding Production Kit into a new or existing repository, manages its lifecycle state, and provides task/readiness/context/verification workflows without replacing unrelated files.

The preferred human experience is agent-first: let the coding agent inspect the repository, draft VCP artifacts, run these commands, and ask the developer only for unresolved decisions that require human intent.

## Run from npm

The published package is the primary installation path:

```bash
npx vibe-coding-production init . --agent all
```

The installed executable is also available as `vcp`.

To run the current GitHub source instead of the published package, use:

```bash
npx --yes github:Moeeryani/Vibe-Coding-Production-Kit init . --agent all
```

## Initialize once, then update

Initialization creates the framework plus `.vcp/manifest.json` and baseline snapshots used by the safe update engine.

```bash
vcp init . --agent all --stack auto --yes
```

Once a project has `.vcp/manifest.json`, `init` refuses to replace that lifecycle state even with `--force`. Use `vcp update` instead.

New installs preserve both the resolved stack profile and the original stack selector in lifecycle state. For example, `--stack auto` can resolve to `generic` today while retaining `requestedStack: "auto"`; an explicit `--stack generic` records `requestedStack: "generic"`. That provenance is what allows later lifecycle decisions to respect explicit human choices.

Preview initialization before writing:

```bash
vcp init . --agent all --dry-run
```

## Safe lifecycle updates

Check whether the project, running CLI, or an eligible auto-selected stack profile has lifecycle work available:

```bash
vcp update . --check
vcp update . --check --json
```

Use `--offline` to avoid registry access and compare only with the running CLI:

```bash
vcp update . --check --offline
```

If a stored profile is `generic` and lifecycle provenance records `requestedStack: "auto"`, VCP may re-run the same deterministic stack detection used by fresh init. When current repository evidence now resolves to a supported concrete stack, `--check`, `--dry-run`, and JSON output expose a `stackProfileChange` such as `generic -> javascript` before apply.

Explicit `requestedStack: "generic"` selections are never silently re-profiled. Older manifests that predate stack-selection provenance also remain `generic` because VCP cannot safely reconstruct whether that historical value was automatic fallback or a human choice.

Preview the exact migration plan without changing files:

```bash
vcp update . --dry-run
vcp update . --dry-run --json
```

Apply an update only after reviewing the plan:

```bash
vcp update .
```

The updater uses persistent baselines, ownership policies, explicit migrations, bounded three-way merge, conflict blocking, path/symlink validation, a lifecycle lock, transaction state, backups, post-apply verification, and automatic rollback after apply failures. An eligible stack profile transition goes through the same safeguards; it does not bypass project-owned `preserve` content.

A newer npm version is never applied by an older CLI. `--check` returns a version-pinned `npx` command targeting the same project path so the migration code and templates come from the version being installed.

See [`UPDATES.md`](UPDATES.md) for the full lifecycle contract.

## Roll back the newest recovery point

```bash
vcp rollback .
```

You may name the newest backup explicitly:

```bash
vcp rollback . --backup <id>
```

VCP v0.9 intentionally refuses arbitrary historical rollback because an older partial backup cannot safely prove that files introduced by later updates are restored consistently. Older backups remain available for inspection.

If an interrupted transaction exists, rollback requires the backup tied to that transaction.

## Ignore or re-track a managed file

Detach a path from VCP management without deleting its local content:

```bash
vcp manage ignore AGENTS.md
```

Re-track a path that belongs to the current VCP package:

```bash
vcp manage track AGENTS.md
```

`manage` mutations share the same lifecycle lock as updates and rollback, so they cannot race a live updater. Tracking an already managed path is a no-op rather than redefining its baseline.

## Audit an existing repository

`doctor` is read-only:

```bash
vcp doctor .
```

In addition to engineering-system checks, v0.9 validates lifecycle state, manifest compatibility, baseline integrity, and interrupted/corrupt update transactions.

See [`DOCTOR.md`](DOCTOR.md) for JSON output, strict CI behavior, and the exact coverage boundary of starter-template checks.

## Interactive setup

```bash
npx vibe-coding-production init
```

The CLI asks for:

1. target directory;
2. AI coding tool;
3. stack profile (auto/generic/javascript/typescript/python/go);
4. whether GitHub issue/PR/validation files should be installed.

## Non-interactive examples

```bash
# Codex — AGENTS.md is used directly
npx vibe-coding-production init . --agent codex --yes

# Cursor — AGENTS.md is used directly
npx vibe-coding-production init . --agent cursor --yes

# Claude Code — adds a thin CLAUDE.md adapter
npx vibe-coding-production init . --agent claude --yes

# GitHub Copilot — adds .github/copilot-instructions.md
npx vibe-coding-production init . --agent copilot --yes

# Multi-tool repository with stack auto-detection
npx vibe-coding-production init . --agent all --stack auto --yes
```

## Create a bounded task pack

```bash
npx vibe-coding-production task accept-invite --title "Accept invitation"
```

The task generator writes `docs/tasks/<slug>.md`, refuses overwrite unless `--force` is used, supports `--dry-run`, and imports concrete verification commands from `AGENTS.md`. Reasoned non-applicable values such as `n/a — no E2E surface` are treated as decisions, not executable shell commands.

The coding agent should populate and maintain the task from repository evidence instead of asking the developer to fill every section manually. See [`TASK-PACKS.md`](TASK-PACKS.md).

### Task workflow project root

`task`, `ready`, `context`, and `verify` share one project-root contract. Pass `--dir <project>` to target a nested or different project; otherwise the current directory is the project root.

```bash
vcp task accept-invite --dir packages/app
vcp ready accept-invite --dir packages/app --stage implement
vcp context accept-invite --dir packages/app --mode implement
vcp verify accept-invite --dir packages/app --run
```

Task slugs, Source-of-Truth references, context include/planned/output paths, verification evidence paths, and verification command working directories are all interpreted from that selected root. `--dir` does not rebase a Task Pack authored for another project, and VCP does not fall back to parent-repository files when a reference is missing in the selected root.

## Gate task readiness

A task can be ready to plan before it is ready to implement. Check those stages separately:

```bash
vcp ready accept-invite --stage plan
vcp ready accept-invite --stage implement
```

The planning gate blocks missing outcome, Source of Truth, acceptance criteria, scope, or ambiguous duplicate task sections. Referenced Source of Truth files that still contain known starter-template signals are reported as warnings.

The implementation gate additionally requires resolved architecture/data/integration boundaries, domain invariants, security/privacy, failure modes, observability, test coverage, rollout/recovery, an implementation plan, and at least one executable task verification command so `vcp verify` can build a plan. Use `--json` for automation and `--strict` to make warnings non-zero. See [`TASK-READINESS.md`](TASK-READINESS.md).

## Build a bounded AI context pack

```bash
npx vibe-coding-production context accept-invite --mode plan
```

`context` combines the task, `AGENTS.md`, the phase-specific operating prompt, and existing files referenced in the task's Source of Truth. Add existing implementation files explicitly with repeatable `--include` flags. For greenfield files that do not exist yet, use repeatable `--planned` flags in `implement` mode so their approved paths appear in the pack without pretending contents exist. Print to stdout or use `--output` to save a pack inside the selected project root. See [`CONTEXT-PACKS.md`](CONTEXT-PACKS.md).

Example greenfield implement pack:

```bash
vcp context accept-invite --mode implement \
  --include src/invitations/repository.ts \
  --planned src/invitations/service.ts \
  --planned test/invitations/service.test.ts
```

## Turn verification into evidence

Preview configured verification commands without executing them:

```bash
vcp verify accept-invite
```

Target a nested/different project with the same task root used by `task`, `ready`, and `context`:

```bash
vcp verify accept-invite --dir packages/app
```

Execution requires explicit consent and implementation readiness. Commands execute with the selected project root as their working directory, and any evidence `--output` path is resolved inside that same root:

```bash
vcp verify accept-invite --run --output .vcp/evidence/accept-invite.json
```

See [`VERIFICATION-EVIDENCE.md`](VERIFICATION-EVIDENCE.md).

## Evaluate prompt behavior without embedding a model

Stage 7 adds deterministic evaluation of normalized external-agent behavior records.

```bash
vcp prompt-eval list
vcp prompt-eval discovery-boundaries \
  --response .vcp/prompt-eval/discovery-boundaries.json
vcp prompt-eval all \
  --responses .vcp/prompt-eval \
  --json
```

The running VCP package owns the canonical scenarios. An external agent/adapter executes the relevant prompt and records observable events using the versioned behavior-record contract. VCP evaluates those events; it does not call a model provider or grade exact prose.

The suite covers discover-before-ask, HUMAN DECISION boundaries, proposal-vs-approval, negative decisions, bounded vertical planning, blocker/readiness discipline, verification-report accuracy, follow-up scope, and restartability.

Response paths are resolved inside the selected `--dir` project root and reject traversal/symlink escapes. Missing or invalid records fail rather than defaulting to pass.

See [`PROMPT-EVALUATION.md`](PROMPT-EVALUATION.md).

## Enforce explicit architecture fitness functions

Stage 8 executes project-owned architecture boundaries without inferring a dependency graph:

```bash
vcp fitness --dir .
vcp fitness --dir . --json
vcp fitness --dir . --config docs/architecture/FITNESS.json
```

The default configuration path is `docs/architecture/FITNESS.json`. A project must create that file deliberately; a missing config is an error rather than an inferred architecture.

The initial `javascript-static-imports` analyzer checks explicitly configured JavaScript-family source roots for module ownership, dependency direction, narrow public entrypoints, realized module cycles, unresolved/out-of-root local imports, unsupported dynamic dependency expressions, and durable architecture/ADR contract markers.

A passing report proves only the configured executable boundaries. Non-relative specifiers are outside the Stage 8 module graph, so package imports, Node builtins, and unresolved project aliases are not scored as module edges. It does not claim universal architecture correctness.

See [`ARCHITECTURE-FITNESS.md`](ARCHITECTURE-FITNESS.md).

## Build release-candidate evidence without publishing

Stage 9 automates repeatable release mechanics while keeping release approval and irreversible actions human-controlled.

Preview static release contracts:

```bash
vcp release-check 0.9.3 --dir .
vcp release-check 0.9.3 --dir . --json
```

Execute candidate mechanics explicitly:

```bash
vcp release-check 0.9.3 --dir . --run --json
```

Run mode may perform local package inspection, `npm publish --dry-run`, local tarball install smoke, and local lifecycle update smoke from the retained previous release. It **never** performs actual `npm publish`, tag creation/movement/deletion, GitHub release creation, or deployment.

A missing candidate tag is reported as `HUMAN_DECISION`; an existing candidate tag that does not resolve to the exact candidate revision is a failure and is never moved automatically.

Retain machine-readable evidence if desired:

```bash
vcp release-check 0.9.3 \
  --dir . \
  --run \
  --output .vcp/evidence/releases/0.9.3.json
```

Evidence output is preflighted before executable mechanics, stays inside the selected repository, refuses symlink traversal/overwrite by default, and does not persist command stdout/stderr.

See [`RELEASE-AUTOMATION.md`](RELEASE-AUTOMATION.md).

## Inspect explicitly selected community plugins

Stage 10 is local and declarative. VCP never auto-discovers or downloads plugins.

Inspect selected/pinned bundles:

```bash
vcp plugins --dir .
vcp plugins --dir . --json
```

Compute the canonical digest while authoring or reviewing a local bundle:

```bash
vcp plugins --dir . --digest community-plugins/example
vcp plugins --dir . --digest community-plugins/example --json
```

Digest computation is read-only. It does not select the plugin, update `docs/plugins/PLUGINS.json`, or grant capabilities.

Selected plugin guidance may appear additively in bounded context packs. Verification commands remain labeled proposals and are never copied into `AGENTS.md` or executed automatically.

See [`COMMUNITY-PLUGINS.md`](COMMUNITY-PLUGINS.md).

## Safety behavior

The CLI is intentionally conservative:

- it merges into existing directories instead of deleting unrelated files;
- initial bootstrap refuses framework-file overwrite unless `--force` is explicit;
- initialized VCP projects cannot be re-initialized over existing lifecycle state;
- `update --dry-run` computes the full plan without writing project files;
- any update conflict blocks apply before project-file writes;
- removals must be explicitly declared by migrations;
- customized `preserve` documents are not overwritten;
- explicit or provenance-unknown `generic` stack profiles are not silently re-profiled;
- update/rollback/manage mutations share one lifecycle lock;
- update reports omit project/template file contents from public JSON;
- repository and `.vcp` paths reject traversal and symlink escapes;
- `--no-github` skips GitHub-specific templates and workflow files during initialization.

Before using bootstrap `--force`, inspect the reported conflicts. The CLI never treats an overwrite as implicit approval.

## Common options

```text
--agent <name>     generic | codex | cursor | claude | copilot | all
--stack <name>     auto | generic | javascript | typescript | python | go
--yes, -y          non-interactive initialization
--force            explicit overwrite where that command supports it
--no-github        skip GitHub issue/PR/workflow files during init
--dry-run          preview without writing; update computes the full plan
--check            update: check version/profile lifecycle state
--offline          update --check/apply: do not query npm
--to <version>     update: require the target bundled in the running CLI
--backup <id>      rollback: name the newest/transaction recovery point
--json             machine-readable output where supported
--strict           doctor/ready: make warnings non-zero
--run              verify/release-check: explicitly execute configured local mechanics
--only <key>       verify: select one configured verification command; repeatable
--timeout-ms <n>   verify/release-check: command timeout
--title <text>     task title
--stage <name>     readiness stage: plan | implement
--dir <path>       task/ready/context/verify/manage/prompt-eval/fitness/release-check/plugins project root
--mode <name>      context mode: plan | implement | review | security | release
                    security mode also loads baseline + explicit docs/security/SECURITY-PROFILE.md profiles
--include <path>   add an existing explicit context file; repeatable
--planned <path>   implement context: declare a future repository-local path; repeatable
--output <path>    write context/verification/release evidence inside the selected project root
--max-bytes <n>    maximum context pack bytes; 0 disables the limit
--response <path>   prompt-eval: one behavior-record JSON inside the project
--responses <dir>  prompt-eval all: directory containing <scenario-id>.json files
--config <path>    fitness: project-relative config (default: docs/architecture/FITNESS.json)
--policy <path>    release-check: repository-relative release policy (default: .github/release-policy.json)\n--digest <path>    plugins: compute canonical SHA-256 for one local declarative bundle
--help, -h         show help
--version, -v      show version
```

## Requirements

Node.js 22 or newer. The CLI has no runtime dependencies.

See [`STACK-PROFILES.md`](STACK-PROFILES.md) for evidence-based JavaScript/Node.js, TypeScript, Python, and Go adaptation.
