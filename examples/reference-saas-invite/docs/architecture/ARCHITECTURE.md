# Architecture — Invitation Vertical Slice

ARCHITECTURE-CONTRACT: invitation-layering-v1

## Style

Layered modular slice:

```text
Delivery/API (not implemented here)
        |
Application service
        |
Domain entity + rules
        |
Repository / token / clock adapters
```

## Dependency direction

Domain has no dependency on application or infrastructure. Application depends on the domain only through `src/domain/index.mjs`. Infrastructure implements persistence behavior and remains independent of application/domain implementation imports in this reference.

## Boundaries

- Authentication resolves the current actor before calling the application layer.
- Authorization to issue/revoke/list is enforced by the application service using actor organization + permission evidence.
- Acceptance never accepts `orgId` from the caller; tenant comes from the invitation record.
- Manual revocation accepts an invitation id, then derives organization context from the stored invitation rather than client input.
- Admin listing accepts no caller-selected organization id; it enumerates only `actor.orgId` through the status-neutral repository query.
- Admin listing includes stored `pending` records only, projects `expiresAt <= now` as view state `expired`, and never rewrites persisted invitation status.
- Admin listing returns only invitation id, email, expiry, and derived view state; token material/hash and persistence-only attribution stay outside the response.
- Token hashing occurs before persistence lookup/storage.

## Production persistence contract

A real repository must make these operations atomic:

- replace previous pending invite for `(orgId, normalizedEmail)` when issuing;
- transition `pending -> accepted` exactly once;
- transition `pending -> revoked` exactly once, mutually exclusive with acceptance under the same compare-and-set discipline (manual revoke, PRD FR-003);
- create membership consistently with acceptance (transaction or durable workflow, depending on architecture).

Organization-scoped listing is read-only. Persistent implementations should support tenant-scoped enumeration without turning expiry projection into a stored-status mutation.

The in-memory repository demonstrates semantics but is not a concurrency substitute for a database constraint/transaction.

## Observability contract

Production adapters should emit structured audit/domain events without raw token data:
- `invitation.issued`
- `invitation.revoked`
- `invitation.accepted`
- rejected acceptance counters by coarse reason category

Do not include invitation token or unnecessary PII in logs.
