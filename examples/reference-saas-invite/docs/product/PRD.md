# PRD — Organization Invitations

## Document control
- Owner: Membership domain
- Status: Accepted for reference implementation
- Last updated: 2026-09-30
- Related ADRs: ADR-001

## Actors and permissions

| Actor | Goal | Allowed | Forbidden |
|---|---|---|---|
| Org admin with `members.invite` | Invite a person | Issue/revoke invite in own org | Invite into another org |
| Authenticated invitee | Join invited org | Accept invite matching verified email | Accept for another email/user |
| Anonymous caller | Follow link | Reach auth boundary | Create membership |

## FR-001 — Issue invitation

**Preconditions**
- Actor is authenticated.
- Actor belongs to the target organization.
- Actor has `members.invite`.

**Main flow**
1. Normalize the invitee email.
2. Invalidate any previous pending invite for the same organization + normalized email.
3. Generate a cryptographically random bearer token.
4. Persist only a hash of the token with organization, email, issuer, and expiry.
5. Return the raw token only to the delivery boundary.

**Acceptance criteria**
- AC-001: Cross-organization issuance is rejected.
- AC-002: Missing invite permission is rejected.
- AC-003: Stored record contains token hash, never the raw token.
- AC-004: Only one pending invite exists for an organization + email in the repository contract.

## FR-002 — Accept invitation

**Preconditions**
- Caller is authenticated.
- Caller has a verified email.

**Main flow**
1. Hash supplied token and find invitation by token hash.
2. Verify state is pending and not expired/revoked/accepted.
3. Verify caller's normalized verified email equals invited email.
4. Atomically transition invitation from pending to accepted.
5. Production integration creates membership in the invitation's organization in the same transaction/workflow boundary.

**Acceptance criteria**
- AC-101: Unknown tokens do not create membership.
- AC-102: Expired/revoked/accepted invites cannot be accepted.
- AC-103: Verified-email mismatch is rejected.
- AC-104: A token can produce at most one successful acceptance.
- AC-105: Organization is derived from the invitation record, never from client input during acceptance.

## FR-003 — Manually revoke a pending invitation

**Preconditions**
- Actor is authenticated.
- Actor belongs to the invitation's organization.
- Actor has `members.invite`.

**Main flow**
1. Actor identifies the invitation by invitation id.
2. Service loads the invitation; organization is derived from the stored record and matched against the actor.
3. A `pending` invitation transitions to `revoked` exactly once; `accepted` and `revoked` are terminal.
4. The revoked invitation's original token can no longer be accepted (see AC-102).

**Acceptance criteria**
- AC-201: Cross-organization and unknown ids fail with an indistinguishable coarse error; no existence leak.
- AC-202: Missing invite permission is rejected.
- AC-203: Non-pending invitations cannot be revoked; a second revoke does not succeed.
- AC-204: After successful revocation, acceptance with the original token is rejected.
- AC-205: Revocation accepts no organization id and no raw token as input.

**Decision note (2026-09-30)**: revocation is status-only in this reference slice; persisted `revoked_by`/`revoked_at` attribution was explicitly rejected, deferring attribution to the production `invitation.revoked` audit event. This is a known limitation, not an oversight.

## Reliability and security

- Acceptance must be idempotent/safe under retries; duplicate successful transitions are not allowed.
- Acceptance and manual revocation of the same pending invitation must be mutually exclusive; production persistence must enforce each terminal transition atomically.
- Token material must not appear in application logs, analytics, or persistent storage.

## Out of scope

Email rendering/delivery, authentication UX, membership database schema, billing seat rules, SCIM, and bulk invitations.
