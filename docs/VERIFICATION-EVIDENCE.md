# Verification Evidence

`vcp verify` closes a common AI-coding failure mode: **claiming that checks passed without durable evidence of what actually ran**.

The command uses the verification commands embedded in a task pack and has two deliberately different modes:

- preview: show the verification contract without executing code;
- run: execute only after explicit `--run` consent and only when the task passes implementation readiness.

## Preview first

```bash
vcp verify accept-invite
```

Preview is the default. It does not execute repository commands.

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

## Evidence output

Write machine-readable evidence inside the repository:

```bash
vcp verify accept-invite \
  --run \
  --output .vcp/evidence/accept-invite.json
```

The evidence contains:

- schema version;
- task path;
- target repository;
- preview/run mode;
- creation timestamp;
- implementation-readiness summary;
- exact command key and command string;
- pass/fail/skipped state;
- exit code and signal when available;
- duration;
- timeout state.

If a Task Pack contains both `CHECK_COMMAND` and `UNIT_TEST_COMMAND`, both appear independently in human-readable and JSON evidence and both must pass for the verification run to succeed.

Raw stdout/stderr are **not persisted by default**. This reduces the risk of storing tokens, credentials, PII, or noisy build logs in a versioned evidence file. Normal non-JSON runs still show command output in the terminal.

Existing evidence files are protected. Use `--force` only after reviewing the existing artifact.

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
