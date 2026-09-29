# Data Model — Invitation Slice

## invitations

| Field | Type | Notes |
|---|---|---|
| id | UUID/string | Primary identifier |
| org_id | tenant ID | Required; immutable |
| email_normalized | string | Lowercased/trimmed canonical comparison value |
| token_hash | 64-char hex | SHA-256 of bearer token; raw token never stored |
| status | enum | pending / accepted / revoked |
| issued_by_user_id | user ID | Audit attribution |
| expires_at | timestamp | Acceptance invalid at or after this time |
| accepted_by_user_id | nullable user ID | Set only on acceptance |
| accepted_at | nullable timestamp | Set only on acceptance |

## Production constraints

- unique token hash;
- at most one active/pending invite for `(org_id, email_normalized)`;
- accepted fields are null unless status is accepted;
- tenant ID is never rewritten;
- pending->accepted compare-and-set/locking occurs transactionally;
- pending->revoked compare-and-set/locking occurs transactionally and is mutually exclusive with acceptance.

## Indexes

- unique index on `token_hash`;
- lookup/constraint index on `(org_id, email_normalized, status)` as supported by chosen database.

Exact DDL belongs in an implementation-specific migration ADR/task because partial unique-index support differs by database.
