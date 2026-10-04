# Security Profiles

VCP security profiles make `vcp context <task> --mode security` project-sensitive without turning VCP into a remote scanner, compliance engine, or risk-acceptance authority.

## Core contract

Security profile selection is explicit repository state.

The project-owned declaration is:

`docs/security/SECURITY-PROFILE.md`

Example:

```markdown
# Security Profile

Authority: ACCEPTED

## Active profiles

- `web-api`
- `multi-tenant`
- `sensitive-data`
- `stateful-data`
```

The `baseline` profile always applies, whether or not it is listed. It cannot be disabled by omission.

Supported profiles:

- `baseline` — universal trust-boundary, secrets, dependency, abuse/replay, and negative-test discipline;
- `web-api` — authentication/session, request validation, browser/API boundaries, injection, SSRF, upload, CSRF/XSS, and rate-limit concerns;
- `multi-tenant` — tenant-scoped authorization/resource ownership, cross-tenant isolation, privileged paths, caches/jobs/events, and cross-tenant negative tests;
- `sensitive-data` — PII/secrets minimization, logging/redaction, retention/deletion, exports, encryption/key ownership, and data-exposure tests;
- `stateful-data` — migrations/backfills, destructive changes, transactional integrity, idempotency, rollback/recovery, races, and data-safety negative tests.

Profiles compose in declaration order after the mandatory baseline. Unknown or duplicate declarations fail visibly.

## Backward compatibility

An existing project with no `SECURITY-PROFILE.md` still receives the built-in baseline guidance in security mode. It does not fail merely because it predates Stage 6.

Updated/initialized projects receive the declaration and canonical profile documents. The declaration is project-owned/preserved. Canonical profile guidance is VCP-managed and updateable through the lifecycle merge contract.

## Context behavior

Only `--mode security` auto-loads security profile guidance.

Plan, implement, review, and release modes do not gain hidden profile context. Security context includes:

1. the normal bounded task, repository instructions, prompt, and governing Source of Truth;
2. the explicit project security-profile declaration when present;
3. baseline guidance;
4. each explicitly selected additional profile;
5. any explicit project-local `--include` files.

The Context manifest records the exact security profile identities used.

## Human decision boundary

Profiles describe questions, controls, evidence, and negative tests. They do **not**:

- declare a system compliant with a regulation or standard;
- decide that a risk is acceptable;
- infer legal/data classification intent that repository evidence cannot establish;
- invent authentication, tenant, retention, or destructive-migration policy.

When the correct security posture depends on human intent, the reviewer records that as a HUMAN DECISION / unresolved risk rather than silently choosing it.

## Review output

Security findings should distinguish:

- verified findings backed by repository/code/evidence;
- hypotheses that still require validation;
- HUMAN DECISION boundaries such as risk acceptance or policy choices.

For material findings, preserve severity, attack/failure preconditions, affected asset/boundary, evidence, recommended mitigation, required negative tests, and current-task/follow-up disposition.
