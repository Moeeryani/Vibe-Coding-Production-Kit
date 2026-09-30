import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryInvitationRepository } from '../src/infrastructure/memory-invitation-repository.mjs';

function invitation({ id, orgId, status = 'pending', email = `${id}@example.com` }) {
  return {
    id,
    orgId,
    email,
    tokenHash: id.padEnd(64, '0').slice(0, 64),
    issuedByUserId: `issuer-${orgId}`,
    expiresAt: new Date('2026-10-01T00:00:00Z'),
    status,
    acceptedByUserId: status === 'accepted' ? `user-${id}` : null,
    acceptedAt: status === 'accepted' ? new Date('2026-09-30T00:00:00Z') : null
  };
}

test('organization query returns only records owned by that organization across statuses', async () => {
  const repository = new MemoryInvitationRepository();
  await repository.replacePending(invitation({ id: 'invite-a-pending', orgId: 'org-a' }));
  await repository.replacePending(invitation({ id: 'invite-b-pending', orgId: 'org-b' }));

  const accepted = invitation({ id: 'invite-a-accepted', orgId: 'org-a' });
  await repository.replacePending(accepted);
  await repository.acceptIfPending({
    ...accepted,
    status: 'accepted',
    acceptedByUserId: 'user-a',
    acceptedAt: new Date('2026-09-30T00:00:00Z')
  });

  const ids = (await repository.listByOrganization('org-a')).map((item) => item.id).sort();
  assert.deepEqual(ids, ['invite-a-accepted', 'invite-a-pending']);
});

test('organization query returns detached copies instead of mutable repository state', async () => {
  const repository = new MemoryInvitationRepository();
  const original = invitation({ id: 'invite-a', orgId: 'org-a' });
  await repository.replacePending(original);

  const [listed] = await repository.listByOrganization('org-a');
  listed.status = 'revoked';
  listed.email = 'mutated@example.com';

  const stored = await repository.findById('invite-a');
  assert.equal(stored.status, 'pending');
  assert.equal(stored.email, original.email);
});

test('organization query is status-neutral and does not define active-list expiry policy', async () => {
  const repository = new MemoryInvitationRepository();
  await repository.replacePending({
    ...invitation({ id: 'invite-expired', orgId: 'org-a' }),
    expiresAt: new Date('2026-09-01T00:00:00Z')
  });

  const listed = await repository.listByOrganization('org-a');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].status, 'pending');
  assert.equal(listed[0].id, 'invite-expired');
});
