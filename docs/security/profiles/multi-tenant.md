# Security Profile — Multi-tenant

SECURITY-PROFILE: multi-tenant

Use when multiple customers/organizations/tenants share application or infrastructure boundaries.

## Review focus

- derive tenant/resource ownership server-side; do not trust client-supplied tenant identity alone;
- scope reads, writes, searches, counts, exports, background jobs, caches, events, and logs to the correct tenant;
- inspect direct-object references and lookup-before-authorization patterns;
- separate tenant-admin, platform-admin, support/operator, and ordinary-user authority;
- check shared caches, queues, object storage keys, analytics, search indexes, and async consumers for tenant context loss;
- inspect bulk operations and error behavior for cross-tenant isolation leaks, including existence leaks;
- preserve tenant context across retries, callbacks, scheduled/background work, and idempotency keys.

## Negative tests

Require tenant A attempting to read/mutate tenant B data, guessed identifiers, stale memberships, privilege downgrade/revocation, cross-tenant bulk/export/search access, and asynchronous context-loss scenarios where applicable.
