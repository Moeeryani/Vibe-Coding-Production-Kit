# Task — Stage 12 Safe Adoption Planning (DRAFT / BLOCKED)

Status: Plan
Readiness: BLOCKED for implementation until documentation contract decisions, exact-head baseline and published-old-CLI safety evidence are accepted.
Slug: `stage12-safe-adoption-planning`
Audited baseline: `8ccb276545fdb3cc301ce7ce324812eb4c314586`

## Outcome

Enable trustworthy, bounded, zero-write adoption *planning* for unmanaged existing repositories, while keeping v1 lifecycle compatibility and implementing managed schema-v2 migration ONLY after real previous-release CLI mutation-safety proof. First mutating unmanaged brownfield adoption and rollback-to-absence belong to Stage 13.

## Source of truth

- `docs/ADAPTIVE-VCP-IMPLEMENTATION-PLAN.md` (strategic S; current text must be reconciled)
- `docs/ADAPTIVE-VCP-CODE-INTEGRATION-ANALYSIS.md` (technical T; current text must be reconciled)
- `docs/ADAPTIVE-VCP-DECISIONS.md` (all choices currently **PROPOSED**, none accepted)
- `docs/UPDATES.md`, `docs/CLI.md`, `docs/DOCTOR.md`, `docs/TASK-PACKS.md`, `docs/TASK-READINESS.md`, `docs/ROADMAP.md`
- `lib/state.mjs`, `lib/update-apply.mjs`, `lib/update-plan.mjs`, `lib/init.mjs`, `lib/verify.mjs`, `lib/doctor.mjs`
- `docs/tasks/stage11-mobile-profiles-implementation.md` (historic Windows finalization rerun gap remains historical, not backfilled)

**Important:** This Task Pack is a planning artifact, not approved Source-of-Truth migration instructions. G-ENTRY and D-01 remain blocking.

## Requirement restatement

Inspect existing repositories without writing to them, distinguish new/unmanaged/managed/conflict, preserve project-authored content and adapter prose, use a single versioned lifecycle engine for managed state, avoid invented verification commands, provide truthful Doctor/task/ready/context/verify behavior, and never claim old CLI is safe unless the actual published binary proves the exact guarantee.

## Acceptance criteria

- [ ] AC-001: Fresh current-main full SHA, clean checkout, Node/npm/Git/OS and distinct validation/pack exit logs recorded; historical Stage11 Windows rerun not fabricated.
- [ ] AC-002: Normative S/T amendments C-01–C-14 reconciled with canonical accepted decision records and reviewed register references.
- [ ] AC-003: v2 manifest reader/writer schema, minimumReaderVersion, default-raise/INERT enumerator, unknown assetSet fail-closed and writer audits.
- [ ] AC-004: Real v0.9.3 package test proves D-01 safety invariant before any live v1→v2 mutation (old update/manage/rollback/init; POSIX/Windows; dead/aged/foreign lock; concurrency; no changed user edits).
- [ ] AC-005: Versioned managed backup/journal, stale journal quarantine and crash recovery available **in Stage12**, independent of Stage13 first-adoption recovery.
- [ ] AC-006: Guarded v1→v2 migration retains old installed surface as legacy-full-v1, whole-file ownership and all project changes; idempotent and recoverable.
- [ ] AC-007: Markdown section parser with owned-region authorship, malformed-marker conflict and byte-identical outside text, including BOM/CRLF/mixed endings.
- [ ] AC-008: assetSet values legacy-full-v1 / greenfield-safe-v1 / brownfield-minimal-v1 retained by every writer; update never re-adds intentionally omitted assets.
- [ ] AC-009: Selected-root and VCP-state classification before guessing maturity; explicit agent/GitHub/stack provenance; nested and polyglot cases covered.
- [ ] AC-010: Common purpose-aware path policy refuses traversal/symlink escape and handles Windows junctions; no false race-freedom promise.
- [ ] AC-011: Command authority handles duplicate/conflicting commands, migrated destructive-command reconfirmation and execution-time `verify --run` guard; `--yes` cannot waive HUMAN DECISION.
- [ ] AC-012: assetSet-aware prompt resolver and packaged fallback do not reference omitted starter paths; generated Task Pack does not invent governance docs.
- [ ] AC-013: Doctor install-health and governance separated, approved D-02 `--strict` truth table, green synthetic minimal fixture and legacy fixture regressions.
- [ ] AC-014: Greenfield-safe consumer surface excludes source-only npm validation CI while legacy-full compatibility remains intact.
- [ ] AC-015: Init planner JSON planVersion=1, planKind=init, CLAIM, separate skippedPaths, no file contents, determinism and zero writes for EXISTING unmanaged; non-dry-run apply refuses in Stage12.
- [ ] AC-016: Golden negative fixtures, `npm run validate` / `npm run pack:check`, package smoke, review/finalization exact-head rerun, supported-platform evidence; Stage12 exit is not adoption Checkpoint A.

## Scope

### In scope

- Managed lifecycle: state, migration, update plan/apply/restore, transaction and backup, managed recovery, source/destination reader compatibility.
- Sections, asset catalog, project inspection, CLI option provenance, command authority, prompt/task/context/verify/Doctor integration.
- Nonmutating brownfield init preview and greenfield-safe init compatibility.
- Tests, documentation changes and real published-0.9.3 release smoke.

### Out of scope

- Stage13 first mutating unmanaged brownfield adoption, rollback to true absence, public first-adoption recovery and answers-file reuse.
- Phases 2–10 (capabilities, DSL, Skills, workflow levels, gate, CI enforcement, broad conformance).
- New independent `vcp adopt` verb, saved executable plans, cryptographic signing, speculative dependency graph and released v0.9.3 rewrites.

## Security, privacy, ownership and human authority

- No claim that visible markers prove authorship; manifest + ownership context controls writes.
- No `--yes` for HUMAN DECISION; conflicting command authority blocks VCP-controlled execution.
- `verify --run` executes Task Pack shell strings today; block any universal protection claim until actual execution path guarded.
- Never infer that a newer backup prevents an old CLI from erasing later user edits.
- Do not read or follow paths escaping selected root. Never include source files/secrets in content-free init JSON.

## Failure modes and recovery

- Too-new reader/schema, unknown assetSet, malformed `.vcp`, corrupt markers, conflict/approval → fail closed, do not rewrite project files.
- Crash after managed migration lock, after journal/backup/manifest transition → deterministic validated managed recovery in Stage12.
- Old-CLI rollback mutating schema-v2 user data, stale journal selecting v1 backup, or old/new interleaving → **NO-GO**.
- Unmanaged EXISTING dry-run changing any file or `.vcp` state → **NO-GO**.

## Implementation plan

1. PR-00: accept S/T fixes, canonical decision registration, exact baseline and this Task Pack.
2. POC-FENCE: actual published v0.9.3 cross-platform safety experiments; no enabled migration.
3. PR12.1a: semver/path helpers and centrally validated v2 manifest/field-enumeration rules.
4. PR12.1b: managed journal/backup/recovery with proven lock safety.
5. PR12.1c: enable guarded managed v1→v2 migration only on passing D-01 evidence.
6. PR12.2: Markdown section ownership and merge/track/ignore.
7. PR12.3: asset catalog, classifier and option provenance.
8. PR12.4: commands, prompt fallback, task/ready/context/verify/Doctor and CI floor.
9. PR12.5: public zero-write init plan JSON, full integration and release smoke.
10. Independent review → Task-only finalization → exact-final-HEAD rerun; no merge on unverified high-severity claims.

## Verification commands

These are planned and have NOT been run on this branch:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`
- `INTEGRATION_TEST_COMMAND`: `npm run validate`
- `BUILD_COMMAND`: `npm run pack:check`

Published-old-CLI, Windows native, process-kill and recovery fixtures require new named runnable tests and separate receipts; their existence is not assumed.

## Review and finalization

- No merge or stage "ready" flag without D-01 actual released-package safety evidence and accepted contracts.
- Compare changed user-owned file-tree bytes and not only manifest schema.
- Separate stage12 synthetic minimal-fixture results from Stage13 actual adoption Checkpoint A.
- Treat unavailable platform results as UNVERIFIED, not green.
- Record exact HEAD before/after review and finalization-head rerun; Stage11 historic gap remains acknowledged.

## Current readiness and decisions

**PLAN / BLOCKED.** This document deliberately does not claim Stage12 product-code implementation readiness.
