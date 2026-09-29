# User Flows — Organization Invitation

## Flow A — Admin issues invite

1. Admin opens organization member management.
2. System authenticates admin and resolves org-scoped permissions.
3. Admin enters invitee email.
4. API validates input and calls invitation application service with admin identity and target org.
5. Service verifies tenant + `members.invite`, normalizes email, replaces any prior pending invite, stores token hash, and emits delivery token to the email boundary.
6. UI shows a generic success state.

### Failure states
- admin lost permission;
- target org does not match actor org;
- invalid email;
- rate/quota exceeded;
- email provider unavailable after invite creation (production workflow must define retry/recovery).

## Flow B — Invitee accepts

1. Invitee follows emailed link containing bearer token.
2. If not authenticated, system completes authentication first.
3. System requires a verified email.
4. API submits token plus authenticated identity; it does not submit target org.
5. Service resolves invite from token hash, validates pending state, expiry, and email binding.
6. Production persistence atomically accepts invite and creates membership.
7. User enters the organization.

### Failure states
- unknown/expired/revoked/replayed token;
- authenticated user's verified email differs;
- membership already exists;
- transaction/workflow failure.

User-facing errors should avoid exposing unnecessary invite/account state.

## Flow C — Admin manually revokes a pending invite

1. Admin selects a pending invitation in organization member management (identified by invitation id).
2. System authenticates admin and resolves org-scoped permissions.
3. API calls the invitation service with the admin identity and invitation id; it does not submit a target org or the raw token.
4. Service requires `members.invite`, derives the organization from the stored invitation, and transitions `pending -> revoked` exactly once.
5. The invitee can no longer accept with the original link.

### Failure states
- unknown id or invitation from another organization (identical coarse response, no existence leak);
- invitation already accepted or revoked;
- admin lost `members.invite` permission.

Manual revocation attribution is not persisted on the invitation record in this slice; production audit events are the attribution mechanism.
