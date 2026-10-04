# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

## [0.9.3] - 2026-10-04

### Added
- Git-aware bounded review context, Source-of-Truth freshness checks, verification provenance, and realistic workspace/monorepo conformance coverage.
- Project-sensitive security profiles with deterministic baseline composition plus web/API, multi-tenant, sensitive-data, and stateful-data guidance.
- Provider-independent prompt behavioral evaluation with canonical reproducible scenarios, exact suite/prompt provenance, red mutation lanes, and human/JSON reports.
- Explicit project-owned architecture fitness functions for module ownership, dependency direction, narrow public entrypoints, realized cycles, local import failures, and governing architecture/ADR contracts.
- Release-candidate automation that validates version/changelog consistency, immutable historical tags, package/publish dry-runs, local tarball install/update smoke, migration continuity, and retained exact-revision evidence without performing publication or tag creation.
- Stack-selection provenance in `.vcp/manifest.json`, safe evidence-based generic-to-concrete lifecycle transitions, and repository-level `CHECK_COMMAND` verification support.

### Changed
- Release/source evidence now follows exact-head Windows maintainer validation when hosted Actions cannot execute; Linux/hosted compatibility remains a separate non-blocking follow-up rather than an implied claim.
- Auto-selected generic installs with recorded provenance may adopt a deterministically detected supported stack through the transactional update path, while explicit generic and legacy unknown-provenance installs remain conservative.
- JavaScript/TypeScript stack profiles keep general package `check` scripts distinct from lint semantics.

### Fixed
- Workspace Source-of-Truth handling, review-scope provenance, release-adjacent package/install boundaries, and multiple false-green/false-red paths discovered by non-vacuous Stage 5–8 dogfood gates are covered by durable regressions.

## [0.9.2] - 2026-09-25

### Added
- Explicit `vcp context --planned <path>` support for greenfield implementation paths that do not exist yet, without weakening strict `--include` behavior for existing files.
- Doctor coverage metadata in human-readable and JSON reports, including which core documents receive starter-template marker checks and which installed decision documents remain outside that completeness check.
- Explicit lifecycle migration from `0.9.1` to `0.9.2`, preserving composition from older `0.9.0` and `0.8.0` projects.

### Changed
- Agent-first workflow guidance now distinguishes existing implementation context (`--include`) from approved future paths (`--planned`).
- `doctor --strict` documentation now states that green means all declared doctor checks are green, not that every VCP-installed template has been customized.

### Fixed
- Greenfield tasks no longer need to create source/test files before rendering their implementation context pack.
- The documented implement-context phase loop now matches the CLI contract for files that do not exist yet.
- Doctor output no longer leaves its starter-template coverage boundary implicit.

## [0.9.1] - 2026-09-25

### Added
- Evidence-based JavaScript/Node.js stack detection for repositories with `package.json` but no TypeScript marker, including existing `check`, `test`, build, integration, and E2E scripts where present.
- Shared verification-command parsing used by task generation and verification planning.
- Task-readiness detection for duplicated level-two sections that would make Markdown parsing ambiguous.
- Readiness warnings when referenced Source of Truth files still contain known starter-template signals.
- AI-first repository workflow guidance in `AGENTS.md`, Quickstart, CLI docs, and English/Arabic README files: agents inspect/draft/run VCP while developers make human-intent decisions.
- Explicit lifecycle migration from `0.9.0` to `0.9.1`, preserving the ordered migration chain from older `0.8.0` projects.

### Changed
- `ready --stage implement` now requires an executable task verification plan so a task cannot report implementation-ready when `vcp verify` cannot build commands.
- JavaScript and TypeScript profiles may use an existing general `check` package script as the static-check/lint slot when no dedicated `lint` script exists.
- Documentation now treats Source of Truth templates as agent-drafted engineering artifacts rather than manual form-filling requirements for developers.

### Fixed
- Reasoned non-applicable verification values such as `n/a — no E2E surface` and `n/a - no build step` are no longer copied into task packs or parsed from existing task packs as executable shell commands.
- GitHub repository references now use the current `Moeeryani` username in package metadata and updated documentation.
- The dogfood gap where `ready --stage implement` could pass but `vcp verify` immediately failed with no concrete commands is covered by regression tests.

## [0.9.0] - 2026-09-24

### Added
- Repository-native lifecycle state via `.vcp/manifest.json` plus persistent baseline snapshots.
- Safe `vcp update --check`, `vcp update --dry-run`, and transactional update application.
- Version-pinned delegated update commands when a newer npm CLI is required.
- Explicit ownership policies for `managed`, `generated`, and `preserve` files.
- Bounded three-way merge for independent local/upstream changes with conflict blocking for overlapping edits.
- Versioned migration registry with explicit rename/removal declarations and multi-step migration composition.
- Transaction backups, lifecycle locking, interrupted-update state, post-apply verification, and automatic rollback on apply failures.
- Conservative `vcp rollback` recovery limited to the newest safe recovery point or the backup tied to an interrupted transaction.
- `vcp manage ignore|track` for detaching/re-attaching managed files without deleting local content.
- Lifecycle-aware `doctor` checks for manifest compatibility, baseline integrity, and interrupted/corrupt transactions.
- Path traversal and symlink protections for both managed repository paths and `.vcp` internal state.
- SemVer-aware update comparison including prerelease precedence and build-metadata handling.
- End-to-end `docs/QUICKSTART.md` covering bootstrap, task creation, readiness, bounded context, verification evidence, review, and repository audit.
- `docs/UPDATES.md` documenting the update/ownership/merge/rollback contract.
- Ready-to-paste release-note infrastructure and GitHub generated-release-notes configuration.
- Regression coverage for update planning, conflicts, explicit removals, migrations, locking, concurrency, rollback guards, SemVer, CLI flows, init lifecycle guards, and manage-state transitions.

### Changed
- `vcp init` now creates versioned VCP lifecycle state and refuses to replace an already initialized VCP project even with `--force`; lifecycle changes use `vcp update` instead.
- Update planning now occurs only after acquiring the lifecycle lock, preventing stale concurrent plans.
- `manage` mutations share the update/rollback lifecycle lock and tracking an already managed path is a no-op.
- `npm run check` syntax-checks every `lib/*.mjs` module.
- Framework validation includes the lifecycle update guide while remaining valid inside projects bootstrapped by the CLI.

### Fixed
- Managed files that disappear from a target package without an explicit migration removal now become `CONFLICT` instead of being silently detached/deleted.
- Three-way merge preserves final-newline changes instead of resolving them with a blanket boolean OR.
- `update --check` delegates to the actual project path that was checked instead of always suggesting `.`.
- Dead same-host locks can be reclaimed while fresh foreign-host locks remain protected by the stale interval.
- Backup IDs and newest-backup selection are safe when recovery points are created very close together.
- Historical partial backups can no longer be restored as if they represented a complete arbitrary-version rollback.
- `ignore` commits manifest detachment before baseline cleanup, preventing a failed cleanup from leaving the manifest pointing at a removed baseline.

## [0.8.0] - 2026-09-22

### Added
- Safe-by-default `vcp verify <task>` verification plan/evidence workflow.
- Explicit `--run` consent before repository-controlled shell commands can execute.
- Implementation-readiness enforcement before verification execution.
- Sequential command execution with stop-on-first-failure and skipped downstream checks.
- Optional repository-local JSON evidence with command, timing, exit, signal, timeout, and status metadata without persisted stdout/stderr.
- Repeatable `--only` command selection and per-command `--timeout-ms`.
- Preflight output-path and overwrite protection before any command execution.
- Verification tests covering preview safety, successful evidence, failure stopping, JSON CLI output, output conflicts, and unready-task refusal.

### Changed
- `vcp verify <task> --run` requires the task to pass implementation readiness before executing project commands.

## [0.7.0] - 2026-09-22

### Added
- Read-only `vcp ready <task>` task-readiness gate with separate `plan` and `implement` stages.
- Planning gate for outcome, resolvable Source of Truth, concrete acceptance criteria, and explicit scope.
- Implementation gate for affected boundaries, domain invariants, security/privacy, failure modes, observability, testing, rollout/recovery, and a concrete implementation plan.
- Human-readable and `--json` reports plus `--strict` warning enforcement for CI/team policy.
- Repository-root validation for Source of Truth references and detection of unresolved template references.
- Regression coverage for blank task templates, plan-vs-implement semantics, unsafe references, and CLI JSON output.

### Fixed
- Readiness parsing now uses horizontal whitespace where required, preventing empty fields or acceptance criteria from accidentally consuming the next Markdown line.

## [0.6.0] - 2026-09-22

### Added
- `vcp context <task>` phase-specific context pack builder for plan, implement, review, security, and release work.
- Automatic inclusion of repository instructions, task definition, phase prompt, and existing Source of Truth references from the task pack.
- Repeatable `--include` for narrowly scoped implementation/test context and `--output` for reusable repository-local packs.
- Repository-root path protections and a default 120 KB context budget to prevent accidental local-file leakage or unbounded context dumps.
- Context pack tests covering source selection, explicit includes, safe output, overwrite protection, path traversal, size budgets, and the public CLI path.

## [0.5.0] - 2026-09-22

### Added
- Context-aware `vcp task <slug>` generator for bounded implementation task packs.
- Task packs include source-of-truth references, acceptance criteria, scope, domain/security/observability/test/rollout sections, plan-before-code, independent review, and completion reporting.
- Verification commands are imported from concrete `AGENTS.md` configuration instead of guessed from the stack.
- Safe `--dry-run`, `--force`, `--title`, and `--dir` task controls.
- Task generator tests for command discovery, overwrite protection, dry-run behavior, and slug validation.

## [0.4.0] - 2026-09-22

### Added
- Worked multi-tenant SaaS invitation reference vertical slice.
- Completed product, domain, architecture, data, ADR, threat-model, testing, and delivery artifacts for the reference.
- Layered dependency-free Node.js implementation with negative-path tests for authorization, tenant boundaries, token hashing, expiry, replay, and email binding.
- Reference-project AGENTS rules and explicit production-gap documentation.

## [0.3.0] - 2026-09-22

### Added
- Read-only `doctor` command with `PASS / WARN / FAIL` findings.
- JSON output for automation and `--strict` mode for CI enforcement.
- Detection of unresolved AGENTS verification commands and untouched starter-template signals.
- Doctor guidance that deliberately avoids a misleading single readiness score.

## [0.2.0] - 2026-09-22

### Added
- Zero-runtime-dependency Node.js CLI for bootstrapping the framework into new or existing repositories.
- Interactive and non-interactive initialization modes.
- `--dry-run`, `--force`, and `--no-github` safety controls.
- Thin agent adapters for Claude Code and GitHub Copilot; Codex and Cursor use `AGENTS.md` directly.
- CLI tests covering installation, conflicts, directory merging, adapters, dry-run, installed-framework validation, and stack detection.
- Evidence-based stack profiles for TypeScript, Python, and Go.
- Automatic package-manager/script discovery for TypeScript and tooling discovery for Python.
- Direct execution from the GitHub repository through `npx` package specs.

### Changed
- CI now validates the framework, CLI tests, syntax, and npm package contents on Node.js 24 LTS.
- Framework validation now works both in this repository and in projects bootstrapped by the CLI.

## [0.1.0] - 2026-09-22

### Added
- Initial Vibe Engineering operating model.
- Product, architecture, data, security, testing, and delivery templates.
- Repository-wide `AGENTS.md`.
- Agent prompts for discovery, planning, implementation, review, security, refactoring, release readiness.
- GitHub contribution and CI scaffolding.
- English and Arabic README files.
