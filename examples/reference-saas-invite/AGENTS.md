# AGENTS.md — Reference SaaS Invitation Slice

## Source of truth
Before code changes, read the requirement, domain model, architecture, ADR, threat model, test strategy, and the current canonical Task Pack under `docs/tasks/`.

## Scope
This is a reference vertical slice. Do not introduce an HTTP framework, database, authentication library, email provider, or other dependency unless the task explicitly expands the example.

## Architecture
- Business invitation invariants stay in `src/domain`.
- Use-case orchestration and authorization stay in `src/application`.
- Repository mechanics stay in `src/infrastructure`.
- Acceptance must never accept a client-supplied organization ID.
- Raw invitation tokens must never enter persistent entity state.

## Security
- Keep application-facing invitation failure intentionally coarse.
- Add negative tests for every security-sensitive behavior change.
- Never log invitation tokens.

## Verification

```text
INSTALL_COMMAND=npm install
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
Run `npm test` and `npm run check`. Report production gaps honestly; this example is not a deployable SaaS application.
