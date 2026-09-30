import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationError, InvitationService } from '../src/application/invitation-service.mjs';
import { MemoryInvitationRepository } from '../src/infrastructure/memory-invitation-repository.mjs';

const adminA = { userId: 'admin-a', orgId: 'org-a', permissions: ['members.invite'] };
const adminB = { userId: 'admin-b', orgId: 'org-b', permissions: ['members.invite'] };
const memberA = { userId: 'member-a', orgId: 'org-a', permissions: [] };

function harness(start = '2026-09-30T12:00:00Z') {
  const repository = new MemoryInvitationRepository();
  let current = new Date(start);
  let idNumber = 0;
  let tokenNumber = 0;
  const service = new InvitationService({
    repository,
    now: () => new Date(current),
    idFactory: () => `list-invite-${++idNumber}`,
    tokenFactory: () => `list-token-${String(++tokenNumber).padStart(32, '0')}`
  });

  return {
    repository,
    service,
    setNow(value) {
      current = new Date(value);
    },
    async issue(actor, email, ttlMs = 60 * 60 * 1000) {
      return service.issue({ actor, orgId: actor.orgId, email, ttlMs });
    }
  };
}

test('active listing requires an authenticated actor with members.invite', async () => {
  const h = harness();
  await assert.rejects(h.service.listActive({ actor: null }), AuthorizationError);
  await assert.rejects(h.service.listActive({ actor: memberA }), AuthorizationError);
  await assert.rejects(
    h.service.listActive({ actor: { userId: 'admin-no-org', permissions: ['members.invite'] } }),
    AuthorizationError
  );
});

test('active listing is tenant-scoped, excludes terminal records, and returns only administration-safe fields', async () => {
  const h = harness();
  const future = await h.issue(adminA, 'future@example.com', 60 * 60 * 1000);
  const expired = await h.issue(adminA, 'expired@example.com', 60 * 1000);
  const accepted = await h.issue(adminA, 'accepted@example.com', 60 * 60 * 1000);
  const revoked = await h.issue(adminA, 'revoked@example.com', 60 * 60 * 1000);
  await h.issue(adminB, 'foreign@example.com', 60 * 60 * 1000);

  await h.service.accept({
    token: accepted.deliveryToken,
    authenticatedUser: { userId: 'accepted-user', verifiedEmail: 'accepted@example.com' }
  });
  await h.service.revoke({ actor: adminA, invitationId: revoked.invitation.id });
  h.setNow('2026-09-30T12:02:00Z');

  const listed = await h.service.listActive({ actor: adminA });
  assert.equal(listed.length, 2);
  const byEmail = new Map(listed.map((item) => [item.email, item]));
  assert.equal(byEmail.get('future@example.com').state, 'pending');
  assert.equal(byEmail.get('expired@example.com').state, 'expired');
  assert.equal(byEmail.has('accepted@example.com'), false);
  assert.equal(byEmail.has('revoked@example.com'), false);
  assert.equal(byEmail.has('foreign@example.com'), false);

  for (const item of listed) {
    assert.deepEqual(Object.keys(item).sort(), ['email', 'expiresAt', 'invitationId', 'state']);
    assert.ok(item.expiresAt instanceof Date);
    assert.equal('tokenHash' in item, false);
    assert.equal('orgId' in item, false);
    assert.equal('issuedByUserId' in item, false);
    assert.equal('acceptedByUserId' in item, false);
  }

  const storedExpired = await h.repository.findById(expired.invitation.id);
  assert.equal(storedExpired.status, 'pending');
  assert.equal(storedExpired.email, 'expired@example.com');

  const listedFuture = byEmail.get('future@example.com');
  listedFuture.email = 'mutated@example.com';
  listedFuture.expiresAt.setUTCFullYear(2035);
  const storedFuture = await h.repository.findById(future.invitation.id);
  assert.equal(storedFuture.email, 'future@example.com');
  assert.equal(storedFuture.expiresAt.toISOString(), future.invitation.expiresAt.toISOString());
});

test('expiry at exactly now remains visible and is projected as expired', async () => {
  const h = harness();
  const issued = await h.issue(adminA, 'boundary@example.com', 60 * 1000);
  h.setNow(issued.invitation.expiresAt);

  const listed = await h.service.listActive({ actor: adminA });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].state, 'expired');
  assert.equal(listed[0].invitationId, issued.invitation.id);

  const stored = await h.repository.findById(issued.invitation.id);
  assert.equal(stored.status, 'pending');
});

test('active listing returns an empty list for an organization with no invitations', async () => {
  const h = harness();
  assert.deepEqual(await h.service.listActive({ actor: adminA }), []);
});
