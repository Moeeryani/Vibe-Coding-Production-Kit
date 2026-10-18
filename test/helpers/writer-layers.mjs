// Enforcement layers of the production writer transaction, in the order
// runWriterTransaction executes them (lib/production-writer.mjs). A test that
// claims to prove a later layer is INCONCLUSIVE when an earlier guard raises
// first — see test/helpers/layer-assertion.mjs.
export const LAYER = Object.freeze({
  // step 1 — namespace containment; resolves the root, does not prove the principal
  BOUNDARY: 'E_WRITER_BOUNDARY',
  // step 2 — controlled test-lane authorization (test/helpers/controlled-writer-capability.mjs)
  CAPABILITY: 'E_TEST_CAPABILITY_IDENTITY',
  // step 2 — same lane, first check: capability not minted by this process (forgery/copy)
  CAPABILITY_INVALID: 'E_TEST_CAPABILITY_INVALID',
  // step 2 — same lane, scope assertion: a capability bound to another fixture root
  CAPABILITY_SCOPE: 'E_TEST_CAPABILITY_SCOPE',
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
  // verifyTestCapability checks in this order; earlier entries pre-empt later.
  LAYER.CAPABILITY_INVALID,
  LAYER.CAPABILITY_SCOPE,
  LAYER.CAPABILITY,
  LAYER.G_FENCE,
  LAYER.DURABILITY,
  LAYER.PRINCIPAL,
  LAYER.WRITER_IDENTITY,
]);

// LAYER_ORDER is a total order, but authorization is NOT a sequence:
// runWriterTransaction takes one branch or the other —
//   testCapability ? verifyTestCapability(...) : authorizeV2Operation()
// (lib/production-writer.mjs:81-87). So CAPABILITY* and G_FENCE are
// ALTERNATIVES at position 2, and no capability-lane run can ever be pre-empted
// by E_G_FENCE_NO_GO. Listing both as guards-before-a-layer is a modeling error
// that throws inside requireLayer on any host where the body reaches the check —
// which is exactly what Linux validation reported for B4-03.
export const AUTHORITY_LANE = Object.freeze({
  test: Object.freeze([LAYER.CAPABILITY_INVALID, LAYER.CAPABILITY_SCOPE, LAYER.CAPABILITY]),
  production: Object.freeze([LAYER.G_FENCE]),
});

export function laneOf(code) {
  if (AUTHORITY_LANE.test.includes(code)) return 'test';
  if (AUTHORITY_LANE.production.includes(code)) return 'production';
  return null;
}

// Guards that may legitimately pre-empt a DURABILITY / PRINCIPAL /
// WRITER_IDENTITY assertion, per lane. Pick one: mixing them asserts that a
// single run can take both authorization branches, which the code makes
// impossible.
export const PREEMPTING_TEST_LANE = Object.freeze([
  LAYER.BOUNDARY, LAYER.CAPABILITY_INVALID, LAYER.CAPABILITY_SCOPE,
]);
export const PREEMPTING_PRODUCTION_LANE = Object.freeze([
  LAYER.BOUNDARY, LAYER.G_FENCE,
]);

// STEP 5b LIMITATION: the post-mutation re-verification
// (production-writer.mjs:107-111) raises the SAME codes as step 2 but AFTER
// mutate. This registry identifies sites only by code, so it cannot tell the
// two apart. A test claiming the post-mutation check must prove it by execution
// — the mutation ran, and the pre-transaction verification passed (see B4-03).
// Never treat a matching code alone as evidence of which site raised it.
