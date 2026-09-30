export class MemoryInvitationRepository {
  #byId = new Map();
  #idByTokenHash = new Map();

  async replacePending(invitation) {
    for (const existing of this.#byId.values()) {
      if (existing.orgId === invitation.orgId && existing.email === invitation.email && existing.status === 'pending') {
        const revoked = { ...existing, status: 'revoked' };
        this.#byId.set(existing.id, revoked);
      }
    }
    this.#byId.set(invitation.id, structuredClone(invitation));
    this.#idByTokenHash.set(invitation.tokenHash, invitation.id);
  }

  async findByTokenHash(tokenHash) {
    const id = this.#idByTokenHash.get(tokenHash);
    if (!id) return null;
    const value = this.#byId.get(id);
    return value ? structuredClone(value) : null;
  }

  async listByOrganization(orgId) {
    const invitations = [];
    for (const invitation of this.#byId.values()) {
      if (invitation.orgId === orgId) invitations.push(structuredClone(invitation));
    }
    return invitations;
  }

  async acceptIfPending(accepted) {
    const current = this.#byId.get(accepted.id);
    if (!current || current.status !== 'pending') return false;
    this.#byId.set(accepted.id, structuredClone(accepted));
    return true;
  }

  async revokeIfPending(revoked) {
    const current = this.#byId.get(revoked.id);
    if (!current || current.status !== 'pending') return false;
    this.#byId.set(revoked.id, structuredClone(revoked));
    return true;
  }

  async findById(id) {
    const value = this.#byId.get(id);
    return value ? structuredClone(value) : null;
  }
}
