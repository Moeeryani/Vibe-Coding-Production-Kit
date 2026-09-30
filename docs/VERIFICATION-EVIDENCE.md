# Verification Evidence

`vcp verify` closes a common AI-coding failure mode: **claiming that checks passed without durable evidence of what actually ran**.

The command uses the verification commands embedded in a task pack and has two deliberately different modes:

- preview: show the verification contract without executing code;
- run: execute only after explicit `--run` consent and only when the task passes implementation readiness.

## Preview first

```bash
vcp verify accept-invite
```

Preview is the default. It does not execute repository verification commands.

The report shows the exact command keys and command strings that would run. `INSTALL_COMMAND` is excluded from the default verification set because dependency installation is setup, not proof that the task is correct.

A repository-defined general validation command that does not accurately fit format, lint, typecheck, test, build, or E2E belongs in `CHECK_COMMAND`. VCP records and executes it as its own verification step rather than relabeling it as lint.

Select only specific configured checks when useful:

```bash
vcp verify accept-invite \
  --only CHECK_COMMAND \
  --only UNIT_TEST_COMMAND
```

Existing Task Packs that use older configured keys such as `LINT_COMMAND` remain valid; adding `CHECK_COMMAND` does not reinterpret historical task evidence.

## Execute explicitly

```bash
vcp verify accept-invite --run
```

`--run` is an explicit trust decision. Verification commands are repository-controlled shell commands and can execute arbitrary code with the current user's permissions.

Before running anything, VCP checks that the task passes:

```bash
vcp ready accept-invite --stage implement
```

If implementation readiness has blocking failures, verification execution is refused.

Commands run sequentially. After the first failure, later commands are marked `skipped` instead of pretending the verification set completed.

## Project root and workspace root

Verification keeps two scopes distinct:

- **project root** — the VCP root selected by `--dir`; owns the Task Pack, Source-of-Truth references, readiness, verification commands, command working directory, and evidence-output path safety;
- **workspace root** — the enclosing Git worktree root when one exists; used only to describe repository provenance.

Workspace discovery never expands project authority. A nested project cannot use the enclosing workspace to read a Source-of-Truth file or write an evidence file outside its selected project root.

For a monorepo package such as `packages/api`, run VCP against that package root when it is its own VCP project:

```bash
vcp verify my-task --dir packages/api --run
```

The configured commands still execute from `packages/api`. Evidence can then identify the portable workspace-relative project path as `packages/api` while retaining the existing absolute `target` field for backward compatibility.

Symlinked checkout/project paths are canonicalized only for workspace-provenance containment and `scope.projectPath`. The selected project `target` itself remains the caller's resolved project path so the existing VCP project-root contract does not change.

## Evidence output

Write machine-readable evidence inside the selected project root:

```bash
vcp verify accept-invite \
  --run \
  --output .vcp/evidence/accept-invite.json
```

Current evidence uses schema version 2. Historical schema-v1 evidence remains valid history and does not require migration or rewriting.

The evidence contains:

- schema version;
- task path;
- legacy absolute `target` project path;
- portable scope metadata:
  - `scope.kind = "git-worktree"` when the selected project is inside Git, otherwise `"project"`;
  - `scope.projectPath`, relative to the Git workspace root when available, or `.` for project-only scope;
- Git revision metadata when available:
  - `revision.system = "git"`;
  - exact `revision.headSha`, or `null` for an unborn repository;
  - `revision.dirty`, captured before verification commands execute;
- preview/run mode;
- creation timestamp;
- implementation-readiness summary;
- exact command key and command string;
- pass/fail/skipped state;
- exit code and signal when available;
- duration;
- timeout state.

The absolute `target` value is retained so existing consumers do not break, but it is host-specific. To compare local and CI evidence for the same nested project, use the portable `scope.projectPath` plus Git `revision.headSha`; do not expect absolute checkout paths to match across machines.

If a project is not inside a Git worktree, verification still works. Evidence reports project-only scope and `revision: null` instead of inventing a commit identity.

A dirty worktree does not automatically block verification because developers may intentionally verify uncommitted implementation work. The dirty flag is evidence, not approval. Release/merge policy may separately require a clean exact-head run.

### Safe Git provenance inspection

Git provenance inspection is automatic in both preview and run modes, so VCP treats it as metadata inspection rather than permission to execute repository-controlled functionality.

For provenance commands VCP:

- invokes Git directly without a shell;
- forces the `C` locale so expected Git failure classes are deterministic across developer/CI locales;
- disables `core.fsmonitor` and optional Git locks/index refresh writes;
- canonicalizes filesystem paths before checking workspace/project containment;
- explicitly uses `--ignore-submodules=none` so repository/submodule ignore settings cannot hide dirty submodule state;
- checks initialized submodules recursively before dirty-state inspection;
- refuses dirty-state inspection when a tracked path activates a configured external Git `clean` or `process` filter that could execute code.

The last rule is intentionally conservative. If accurate dirty-state inspection would require executing an active external content filter, verification fails with an actionable provenance error instead of running that filter during preview or silently recording incomplete/false cleanliness. Merely having an unused filter driver installed globally does not trigger this refusal; the driver must be active for tracked repository content.

If a Task Pack contains both `CHECK_COMMAND` and `UNIT_TEST_COMMAND`, both appear independently in human-readable and JSON evidence and both must pass for the verification run to succeed.

Raw stdout/stderr are **not persisted by default**. This reduces the risk of storing tokens, credentials, PII, or noisy build logs in a versioned evidence file. Normal non-JSON runs still show command output in the terminal.

Existing evidence files are protected. Use `--force` only after reviewing the existing artifact.

## Local and CI compatibility

VCP uses the same evidence shape whether `vcp verify` is executed by a developer or by CI. The core contract is provider-agnostic: project scope, Git revision when available, repository-controlled commands, results, and timestamps.

Provider-specific run IDs, URLs, runner names, or remote workflow APIs are not required for mechanical verification evidence. They may be retained separately by the CI system. This keeps local fallback evidence and CI evidence comparable without claiming that one execution environment is equivalent to another in every operational detail.

## JSON output without an evidence file

```bash
vcp verify accept-invite --run --json
```

In JSON mode command stdout/stderr are suppressed so the final stdout remains valid JSON.

## Per-command timeout

The default timeout is 15 minutes per command:

```bash
vcp verify accept-invite --run --timeout-ms 900000
```

Use `--timeout-ms 0` only when you deliberately want no timeout.

A timeout is a verification failure.

## Failure semantics

A run exits non-zero when any command fails. The first failed command blocks later commands:

```text
PASS    project check
PASS    lint
PASS    typecheck
FAIL    unit tests
SKIPPED integration tests
SKIPPED build
```

This preserves causal evidence and avoids running expensive downstream checks on a known-broken state.

## Recommended task lifecycle

```text
vcp task <slug>
      ↓
vcp ready <slug> --stage plan
      ↓
vcp context <slug> --mode plan
      ↓
Approve plan
      ↓
vcp ready <slug> --stage implement
      ↓
vcp context <slug> --mode implement --include <affected files>
      ↓
Implement
      ↓
vcp verify <slug>                 # preview exact checks
      ↓
vcp verify <slug> --run --output .vcp/evidence/<slug>.json
      ↓
vcp context <slug> --mode review --include <changed files/tests>
      ↓
vcp doctor .
      ↓
Merge / release
```

Verification evidence proves mechanical checks. It does not replace code review, security review, staging validation, migration review, or production observability.
