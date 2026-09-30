import assert from 'node:assert/strict';
import test from 'node:test';
import { InvitationService, InvalidInviteError } from '../src/application/invitation-service.mjs';
import { MemoryInvitationRepository } from '../src/infrastructure/memory-invitation-repository.mjs';

const admin = { userId: 'admin-a', orgId: 'org-a', permissions: ['members.invite'] };
const invitee = { userId: 'user-1', verifiedEmail: 'person@example.com' };

function createReadBarrierRepository(storage) {
  let reads = 0;
  let release;
  const bothReadsComplete = new Promise((resolve) => {
    release = resolve;
  });

  async function rendezvous(read) {
    const value = await read();
    reads += 1;
    if (reads === 2) release();
    await bothReadsComplete;
    return value;
  }

  return {
    replacePending: (...args) => storage.replacePending(...args),
    findByTokenHash: (...args) => rendezvous(() => storage.findByTokenHash(...args)),
    findById: (...args) => rendezvous(() => storage.findById(...args)),
    acceptIfPending: (...args) => storage.acceptIfPending(...args),
    revokeIfPending: (...args) => storage.revokeIfPending(...args)
  };
}

test('accept and revoke racing from the same pending snapshot allow exactly one terminal transition', async () => {
  const storage = new MemoryInvitationRepository();
  const repository = createReadBarrierRepository(storage);
  let tokenNumber = 0;
  let idNumber = 0;
  const service = new InvitationService({
    repository,
    now: () => new Date('2026-09-22T12:00:00Z'),
    tokenFactory: () => `race-token-${String(++tokenNumber).padStart(40, '0')}`,
    idFactory: () => `invite-${++idNumber}`
  });

  const { invitation, deliveryToken } = await service.issue({
    actor: admin,
    orgId: 'org-a',
    email: 'person@example.com'
  });

  const [acceptResult, revokeResult] = await Promise.allSettled([
    service.accept({ token: deliveryToken, authenticatedUser: invitee }),
    service.revoke({ actor: admin, invitationId: invitation.id })
  ]);

  const fulfilled = [acceptResult, revokeResult].filter((result) => result.status === 'fulfilled');
  const rejected = [acceptResult, revokeResult].filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof InvalidInviteError);
  assert.equal(rejected[0].reason.message, 'Invitation is invalid or unavailable.');

  const stored = await storage.findById(invitation.id);
  assert.ok(stored);
  assert.ok(stored.status === 'accepted' || stored.status === 'revoked');

  if (acceptResult.status === 'fulfilled') {
    assert.equal(revokeResult.status, 'rejected');
    assert.equal(stored.status, 'accepted');
    assert.equal(acceptResult.value.invitationId, invitation.id);
    assert.equal(acceptResult.value.acceptedByUserId, invitee.userId);
  } else {
    assert.equal(revokeResult.status, 'fulfilled');
    assert.equal(stored.status, 'revoked');
    assert.deepEqual(revokeResult.value, { invitationId: invitation.id, status: 'revoked' });
  }
});
