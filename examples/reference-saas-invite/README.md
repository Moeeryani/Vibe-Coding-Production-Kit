# Reference Vertical Slice — Multi-tenant SaaS Invitations

This example shows what the Vibe Coding Production Kit looks like when the templates become real engineering decisions.

It deliberately uses a narrow but security-sensitive feature: **an organization administrator invites a person to join one tenant, and the invite may be accepted exactly once by an authenticated user whose verified email matches the invitation**.

The implementation is intentionally small and dependency-free so the engineering workflow is visible. It is **not** a complete deployable SaaS application and does not replace a real database, HTTP layer, authentication system, email provider, rate limiter, or production observability stack.

## What to inspect

Read in this order:

1. [`docs/product/PRODUCT-BRIEF.md`](docs/product/PRODUCT-BRIEF.md)
2. [`docs/product/PRD.md`](docs/product/PRD.md)
3. [`docs/architecture/DOMAIN.md`](docs/architecture/DOMAIN.md)
4. [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)
5. [`docs/architecture/adr/ADR-001-invite-token-storage.md`](docs/architecture/adr/ADR-001-invite-token-storage.md)
6. [`docs/security/THREAT-MODEL.md`](docs/security/THREAT-MODEL.md)
7. [`docs/security/SECURITY-PROFILE.md`](docs/security/SECURITY-PROFILE.md)
8. [`docs/testing/TEST-STRATEGY.md`](docs/testing/TEST-STRATEGY.md)
9. [`docs/tasks/accept-invite.md`](docs/tasks/accept-invite.md)
10. [`src/`](src/) and [`test/`](test/)

That order is intentional: **why -> behavior -> domain -> architecture -> decision -> risk -> verification -> bounded task -> code**.

The reference project uses the same current Task Pack convention as `vcp task`: machine-readable work lives at `docs/tasks/<slug>.md`. The older hand-authored `docs/delivery/TASK-*` example convention is not a second task namespace.

## Run the reference tests

```bash
npm test
npm run check
```

The tests include happy paths and negative paths for authorization, tenant isolation, token replay, expiry, revocation, and verified-email matching.

## VCP context dogfood

This fixture contains a local [`prompts/`](prompts/) snapshot so `vcp context --dir examples/reference-saas-invite` can resolve its phase prompts entirely from the selected project root. There is no fallback to the repository-root or global prompt content.

The prompt copies are intentionally canonical rather than example-specific. [`test/reference-context.test.mjs`](../../test/reference-context.test.mjs) enforces byte-for-byte parity with the root `prompts/` directory and proves that a clean fixture copy can build `plan`, `implement`, and `review` context packs from the checked-in canonical `docs/tasks/accept-invite.md` Task Pack without manual prompt or task scaffolding.

The Task Pack, Source-of-Truth references, context paths, and verification commands are all owned by this selected project root. The fixture-local prompt snapshot is conformance data, not a second lifecycle installation, and intentionally does not add a nested `.vcp/manifest.json`.

## Production gaps left on purpose

A real deployment still needs at least:

- persistent storage with a unique/atomic active-invite constraint;
- transactional acceptance and membership creation;
- real authentication and permission resolution;
- rate limits and abuse controls;
- email delivery with no token leakage in logs;
- HTTP/API input validation and error mapping;
- structured audit events, metrics, tracing, and alerts;
- retention/deletion rules;
- integration, contract, and E2E tests against real infrastructure.

Those gaps are explicit because “production-minded” means **knowing what is not proven**, not pretending a demo is production-ready.
