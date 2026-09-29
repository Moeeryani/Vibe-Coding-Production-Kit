# Architecture — Invitation Vertical Slice

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

Domain has no dependency on application or infrastructure. Application depends on the domain and repository contract behavior. Infrastructure implements persistence behavior.

## Boundaries

- Authentication resolves the current actor before calling the application layer.
- Authorization to issue is enforced by the application service using actor organization + permission evidence.
- Acceptance never accepts `orgId` from the caller; tenant comes from the invitation record.
- Token hashing occurs before persistence lookup/storage.

## Production persistence contract

A real repository must make these operations atomic:

- replace previous pending invite for `(orgId, normalizedEmail)` when issuing;
- transition `pending -> accepted` exactly once;
- transition `pending -> revoked` exactly once, mutually exclusive with acceptance under the same compare-and-set discipline (manual revoke, PRD FR-003);
- create membership consistently with acceptance (transaction or durable workflow, depending on architecture).

The in-memory repository demonstrates semantics but is not a concurrency substitute for a database constraint/transaction.

## Observability contract

Production adapters should emit structured audit/domain events without raw token data:
- `invitation.issued`
- `invitation.revoked`
- `invitation.accepted`
- rejected acceptance counters by coarse reason category

Do not include invitation token or unnecessary PII in logs.
