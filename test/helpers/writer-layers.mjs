// Enforcement layers of the production writer transaction, in the order
// runWriterTransaction executes them (lib/production-writer.mjs). A test that
// claims to prove a later layer is INCONCLUSIVE when an earlier guard raises
// first — see test/helpers/layer-assertion.mjs.
export const LAYER = Object.freeze({
  // step 1 — namespace containment; resolves the root, does not prove the principal
  BOUNDARY: 'E_WRITER_BOUNDARY',
  // step 2 — controlled test-lane authorization (test/helpers/controlled-writer-capability.mjs)
  CAPABILITY: 'E_TEST_CAPABILITY_IDENTITY',
  // step 2 — production authorization hook; always refuses while D-01/G-FENCE is NO-GO
  G_FENCE: 'E_G_FENCE_NO_GO',
  // step 3 — v2 lifecycle lock acquisition, which refuses unproven namespace durability
  DURABILITY: 'E_DIRECTORY_SYNC_UNPROVEN',
  // step 4 — principal re-verification between authorization and mutation
  PRINCIPAL: 'E_WRITER_PRINCIPAL_UNPROVEN',
  // step 4b — B-9 root identity pin/verify (writer-identity.mjs pinPathIdentity)
  WRITER_IDENTITY: 'E_WRITER_IDENTITY_CHANGED',
});

export const LAYER_ORDER = Object.freeze([
  LAYER.BOUNDARY,
  LAYER.CAPABILITY,
  LAYER.G_FENCE,
  LAYER.DURABILITY,
  LAYER.PRINCIPAL,
  LAYER.WRITER_IDENTITY,
]);
