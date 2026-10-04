import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { acceptInvitationEntity, createInvitationEntity, normalizeEmail, revokeInvitation } from '../domain/index.mjs';

export class AuthorizationError extends Error {
  constructor(message = 'Not authorized.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class InvalidInviteError extends Error {
  constructor(message = 'Invitation is invalid or unavailable.') {
    super(message);
    this.name = 'InvalidInviteError';
  }
}

export function hashInviteToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class InvitationService {
  constructor({ repository, now = () => new Date(), tokenFactory = () => randomBytes(32).toString('base64url'), idFactory = randomUUID }) {
    this.repository = repository;
    this.now = now;
    this.tokenFactory = tokenFactory;
    this.idFactory = idFactory;
  }

  async issue({ actor, orgId, email, ttlMs = 48 * 60 * 60 * 1000 }) {
    if (!actor || actor.orgId !== orgId || !actor.permissions?.includes('members.invite')) {
      throw new AuthorizationError();
    }
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError('ttlMs must be positive.');

    const rawToken = this.tokenFactory();
    const issuedAt = this.now();
    const invitation = createInvitationEntity({
      id: this.idFactory(),
      orgId,
      email: normalizeEmail(email),
      tokenHash: hashInviteToken(rawToken),
      issuedByUserId: actor.userId,
      expiresAt: new Date(issuedAt.getTime() + ttlMs)
    });

    await this.repository.replacePending(invitation);
    return { invitation, deliveryToken: rawToken };
  }

  async listActive({ actor }) {
    if (!actor?.userId || !actor.orgId || !actor.permissions?.includes('members.invite')) {
      throw new AuthorizationError();
    }

    const invitations = await this.repository.listByOrganization(actor.orgId);
    const now = this.now();

    return invitations
      .filter((invitation) => invitation.status === 'pending')
      .map((invitation) => ({
        invitationId: invitation.id,
        email: invitation.email,
        expiresAt: new Date(invitation.expiresAt),
        state: new Date(invitation.expiresAt).getTime() <= now.getTime() ? 'expired' : 'pending'
      }));
  }

  async revoke({ actor, invitationId }) {
    if (!actor || !actor.userId || !actor.permissions?.includes('members.invite')) {
      throw new AuthorizationError();
    }
    if (typeof invitationId !== 'string' || !invitationId) throw new InvalidInviteError();

    const invitation = await this.repository.findById(invitationId);
    if (!invitation || invitation.orgId !== actor.orgId) throw new InvalidInviteError();

    let revoked;
    try {
      revoked = revokeInvitation(invitation);
    } catch {
      throw new InvalidInviteError();
    }

    const committed = await this.repository.revokeIfPending(revoked);
    if (!committed) throw new InvalidInviteError();

    return { invitationId: revoked.id, status: revoked.status };
  }

  async accept({ token, authenticatedUser }) {
    if (!authenticatedUser?.userId || !authenticatedUser?.verifiedEmail) {
      throw new AuthorizationError('Authenticated user with verified email is required.');
    }
    if (typeof token !== 'string' || token.length < 16) throw new InvalidInviteError();

    const tokenHash = hashInviteToken(token);
    const invitation = await this.repository.findByTokenHash(tokenHash);
    if (!invitation) throw new InvalidInviteError();

    let accepted;
    try {
      accepted = acceptInvitationEntity(invitation, {
        userId: authenticatedUser.userId,
        verifiedEmail: authenticatedUser.verifiedEmail,
        now: this.now()
      });
    } catch {
      throw new InvalidInviteError();
    }

    const committed = await this.repository.acceptIfPending(accepted);
    if (!committed) throw new InvalidInviteError();

    return {
      invitationId: accepted.id,
      orgId: accepted.orgId,
      email: accepted.email,
      acceptedByUserId: accepted.acceptedByUserId
    };
  }
}
