# Reference workspace monorepo

This fixture is the realistic Stage 5 monorepo/workspace conformance surface.

It deliberately separates three scopes:

- `docs/platform/SHARED-ORDER-POLICY.md` is accepted **workspace-root** authority.
- `packages/orders-api/` is the selected nested VCP project and owns its local PRD, Task Pack, prompts, code, tests, verification cwd, and evidence output.
- `packages/billing-worker/` and `docs/UNRELATED-ROOT.md` are unrelated authority and must never be inherited automatically.

The nested task explicitly opts into the shared root document with:

```text
workspace:docs/platform/SHARED-ORDER-POLICY.md
```

No package discovery, parent search, sibling inheritance, scheduler, or package-manager orchestration is involved.

## Restartability proof

`test/stage5-workspace-conformance.test.mjs` copies this directory to a fresh temporary checkout, initializes Git, and drives the public CLI from repository state only:

```text
ready
→ plan context
→ implement context
→ verify + persisted evidence
→ Git-aware review context
```

The same conformance coverage also proves that unrelated root/sibling documents remain absent and that project-local include/planned/output paths cannot escape to a sibling or workspace root.

The fixture is intentionally dependency-free so its package verification can execute in local or CI environments with the same commands and evidence shape.
