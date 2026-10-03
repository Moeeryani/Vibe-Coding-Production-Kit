# AGENTS.md — Reference Workspace Orders API

## Source of truth

Before code changes, read the current Task Pack under `docs/tasks/`, the project-local PRD, and only workspace-root governing documents explicitly declared by that Task Pack.

Do not infer authority from parent directories or sibling packages.

## Scope

This package is a dependency-free Stage 5 conformance fixture. Keep implementation and verification package-local.

## Verification

```text
INSTALL_COMMAND=n/a
FORMAT_CHECK_COMMAND=n/a
LINT_COMMAND=n/a
TYPECHECK_COMMAND=n/a
CHECK_COMMAND=npm run check
UNIT_TEST_COMMAND=npm test
INTEGRATION_TEST_COMMAND=n/a
BUILD_COMMAND=n/a
E2E_COMMAND=n/a
```

## Completion

Run `npm run check` and `npm test` from this package root. Verification evidence belongs inside this selected project root.
