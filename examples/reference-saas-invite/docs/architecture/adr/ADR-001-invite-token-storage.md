# ADR-001 — Persist invitation token hashes, not raw tokens

ADR-CONTRACT: invite-token-hash-v1

## Status
Accepted

## Context
Invitation links contain bearer secrets. A database read, backup leak, debug export, or accidental internal query should not immediately expose usable invitation links.

## Decision
Generate at least 256 bits of random token material. Return the raw token only to the delivery boundary. Persist a SHA-256 hash and look up invitations by hashing the presented token.

## Alternatives considered

### Store raw token
Simpler lookup, but database compromise exposes immediately usable bearer credentials. Rejected.

### Encrypt raw token reversibly
Still creates a key-management dependency and retains the ability to recover bearer secrets. No product requirement needs recovery. Rejected.

## Consequences

- Lost raw token cannot be recovered; a resend creates/replaces an invitation.
- Token comparison occurs on a fixed-size hash.
- Logs and telemetry must still avoid raw tokens before hashing.

## Reconsider when
A future protocol requires token recovery rather than one-way validation; that would require a new threat analysis and ADR.
