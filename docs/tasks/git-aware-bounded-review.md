# Task — Add Git-aware bounded review context

Status: Review
Slug: `git-aware-bounded-review`

## Outcome

A fresh reviewer can build one bounded review Context Pack that combines the canonical Task Pack and current Source of Truth with an explicit local Git base/head changed surface, without trusting implementation narration or hiding unrelated changed files.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Context Pack contract | `docs/CONTEXT-PACKS.md` |
| Review protocol | `prompts/04-code-review.md` |

## Requirement restatement

Extend existing review context additively. When the caller supplies `--base <ref>` in `review` mode, resolve base/head to exact local Git commits, compare with merge-base semantics, include the complete changed-file list, current working-tree status, and bounded textual diff, and keep that evidence inside the existing Context Pack byte budget. The comparison runs from the enclosing Git worktree root so nested VCP projects cannot hide changed root/workspace files. Git evidence identifies what changed; it does not authorize or prove correctness.

## Acceptance criteria

- [x] AC-001 — Review context accepts explicit Git base and optional head refs and records their exact commit SHAs.
- [x] AC-002 — `--head` defaults to `HEAD` when a base is supplied and is rejected without an explicit base.
- [x] AC-003 — Git comparison flags are rejected outside review context and outside the context command instead of being silently ignored.
- [x] AC-004 — Review context includes the whole merge-base changed-file list and textual diff for the selected comparison.
- [x] AC-005 — Nested VCP project review runs Git comparison from the enclosing worktree root, keeping changed files outside the nested project visible.
- [x] AC-006 — Dirty working-tree state is shown separately and is not misrepresented as part of the committed base/head comparison.
- [x] AC-007 — Binary changes remain explicitly identified by Git rather than being represented as complete text content.
- [x] AC-008 — Git evidence counts against the existing Context Pack byte budget; oversize packs fail instead of silently truncating changed surface.
- [x] AC-009 — Existing review context without `--base` and all non-review modes remain backward compatible.
- [ ] AC-010 — Focused tests, readiness/context/verification, and the full repository validation pass on the pre-final exact head before finalization.

## Scope

### In scope
- local Git worktree discovery;
- safe explicit ref resolution;
- merge-base changed-file and diff collection;
- working-tree status visibility;
- review Context Pack rendering and manifest metadata;
- additive CLI `--base` / `--head` options;
- focused nested-project/CLI/failure/budget/binary tests;
- review prompt and Context Pack documentation.

### Out of scope
- hosted GitHub/GitLab/Bitbucket API integration;
- automatic PR discovery or remote fetching;
- automated reviewer/LLM runtime;
- automatic approval or merge;
- persisted review database;
- dependency graph/scheduler;
- correctness inference from Git status or diff;
- filtering changed files based on guessed task relevance;
- automatic base-branch selection.

## Affected boundaries

- Modules/files likely affected: `lib/git-review.mjs`, `lib/context.mjs`, `lib/cli.mjs`, `test/git-review-context.test.mjs`, `docs/CONTEXT-PACKS.md`, `prompts/04-code-review.md`.
- Public API/contract impact: additive `vcp context <task> --mode review --base <ref> [--head <ref>]`; existing command names and existing calls remain valid.
- Data/schema/migration impact: n/a — no persisted schema or manifest change.
- External integration impact: n/a — local `git` process only; no hosting-provider network integration.

## Domain invariants

- Task Pack and current Source of Truth remain the requirements authority; Git only supplies changed-surface evidence.
- A review Context Pack does not become implementation authorization.
- No changed file in the explicit comparison is silently removed merely because it appears unrelated.
- Uncommitted working-tree state is visibly separate from the committed base/head comparison.
- Source-of-Truth freshness enforcement remains unchanged.
- Legacy review context without Git flags remains valid.

## Security and privacy

- Authentication impact: n/a — no authentication surface.
- Authorization/resource ownership: n/a — local developer tooling only.
- Tenant isolation: n/a — no application tenant behavior changes.
- Input/trust boundaries: user-supplied local Git refs are validated and passed as process arguments, never through a shell; option-like refs beginning with `-` are rejected.
- Secrets/PII/logging: Git diff/context may contain repository content already selected by the explicit comparison; VCP does not upload it or add remote transport.
- Abuse/rate/replay considerations: context byte budget bounds normal output; local Git process output has a finite buffer and errors visibly.
- Relevant threat IDs: n/a — this is repository-local workflow tooling, not a new application trust boundary.

## Failure modes and edge cases

- project directory is not inside a Git worktree → deterministic actionable failure;
- base/head ref is missing or invalid → deterministic actionable failure;
- ref begins with `-` → rejected before Git invocation;
- `--head` without `--base` → rejected;
- Git flags used outside review mode → rejected;
- Git flags used on a non-context command → rejected;
- no committed changes → explicit zero-file / empty-diff review surface;
- nested project with root-level change → root-level change remains visible;
- dirty working tree → separately displayed, not folded into comparison;
- binary file → Git binary marker retained;
- comparison makes pack exceed `--max-bytes` → fail; do not truncate and pretend review is complete.

## Observability

The Context Pack itself records exact base/head SHAs, comparison semantics, changed-file count, diff byte count, and dirty/clean working-tree state. No long-running metrics or tracing are applicable.

## Test plan

### Unit
- ref validation and changed-file parsing are exercised through focused Git fixtures.

### Integration / contract
- nested project + enclosing worktree comparison;
- exact base/head SHA rendering;
- changed implementation file plus unrelated root-level file visibility;
- dirty worktree separation;
- invalid base failure;
- review-only option enforcement;
- Git evidence tipping an otherwise-valid pack over the byte budget;
- CLI forwarding of `--base` / `--head`.

### E2E / regression
- build a real review pack for this repository branch against its base and confirm a fresh reviewer can reconstruct intended scope from Task Pack + current truth + actual diff without implementation narration.

### Negative/security paths
- option-like Git refs rejected;
- binary change identified, not decoded as complete text;
- non-Git project fails visibly;
- no silent changed-file filtering or diff truncation.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive flags; local `git` is required only when Git-aware review flags are used.
- Migration/backfill: n/a — no migration and no change to legacy Context Packs.
- Rollback or recovery: revert helper/context/CLI/docs/tests; existing review mode remains the fallback behavior.

## Implementation plan

1. Add a local Git review snapshot helper that finds the enclosing worktree, validates refs, resolves exact commits, and collects changed files/diff/status.
2. Extend review Context Pack rendering with explicit Git evidence while keeping existing Source-of-Truth and context-budget semantics.
3. Add additive CLI `--base` / `--head` flags with strict command/mode validation.
4. Add nested-project, dirty-state, invalid-ref, budget, binary, and CLI tests.
5. Update review prompt and Context Pack docs so agents use the Git snapshot as changed-surface evidence rather than author narration.
6. Run a pre-final exact-head gate; then finalize this Task Pack to `Done` and rerun the exact-head gate before merge per #48.

## Verification commands

Run the relevant configured commands below before completion:

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `npm test`

Do not claim a command passed unless it was actually executed.

## Independent review checklist

- [x] Git refs are process arguments, not shell interpolation.
- [x] Review sees the enclosing worktree comparison rather than only the nested project directory.
- [x] Changed files are not filtered by guessed relevance.
- [x] Working-tree dirt is explicitly separated from committed comparison evidence.
- [x] Existing Source-of-Truth freshness and legacy review behavior remain intact.
- [x] No hosted reviewer, database, scheduler, automatic approval, or embedded AI runtime was introduced.
- [ ] Executable pre-final validation confirms behavior on the exact branch head.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Static design review keeps Git responsible only for changed-surface evidence and preserves Task Pack/Source-of-Truth authority, explicit byte budgeting, nested-project visibility, and durable review findings. | No design correction required before executable validation. | Local Git/version/platform behavior remains gated on exact-head executable tests. |

## Finalization

Prepare the finalization edit only after the pre-final implementation/review gate passes.

- [ ] Acceptance criteria satisfied.
- [ ] Pre-final implementation/review gate passed before the finalization edit.
- [x] Independent review evidence is current and no `must fix in this task` finding remains unresolved.
- [ ] Completion report reflects the intended final accepted gate; earlier failures are marked superseded if retained.
- [ ] Top-level `Status` changed to `Done`.

After the finalization edit, rerun the required exact-head gate. Do not edit this Task Pack solely to record that rerun; merge only if it passes.

## Completion report

- What changed and why: added explicit local Git changed-surface evidence to review Context Packs so fresh review is bounded by requirements and the actual comparison rather than implementation narration.
- Final accepted verification: pending pre-final executable validation; replace during finalization, then prove the unchanged finalization head with a second exact-head gate.
- Superseded failed evidence (if material): n/a.
- Independent review evidence updated: yes; static review found no blocking design issue before executable validation.
- Migration/operational impact: none; additive review flags, no schema/backfill.
- Remaining risks/limitations: VCP does not discover remote PR metadata or choose the correct base automatically; caller supplies the intended local base ref.
