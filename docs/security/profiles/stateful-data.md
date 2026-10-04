# Security Profile — Stateful data

SECURITY-PROFILE: stateful-data

Use for persistent schema/state changes, migrations, backfills, destructive operations, balances/inventory/permissions, or consistency-sensitive workflows.

## Review focus

- migration/backfill compatibility with current and rollback versions;
- constraints, validation, transaction boundaries, partial-failure behavior, and retry safety;
- destructive change approval, backup/recovery, and rollback feasibility;
- idempotency and duplicate execution for write operations;
- race conditions affecting permissions, money, inventory, ownership, or state transitions;
- safe ordering for schema/application deploys and background backfills;
- integrity when external calls and local state changes span different failure domains;
- observability sufficient to detect partial or inconsistent state.

## Negative tests

Exercise retry/duplicate execution, partial failure, concurrent conflicting operations, invalid legacy data, migration rollback/recovery, destructive-operation guards, and state-transition authorization where applicable.
