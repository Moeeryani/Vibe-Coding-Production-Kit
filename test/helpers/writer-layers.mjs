// Enforcement layers of the production writer transaction, in the order
// runWriterTransaction executes them (lib/production-writer.mjs). A test that
// claims to prove a later layer is INCONCLUSIVE when an earlier guard raises
// first — see test/helpers/layer-assertion.mjs.
//
// FINDING-001 (2026-10-23, Linux review of candidate 690138ee): the layer
// order used to place G_FENCE AFTER CAPABILITY, and B4-03 listed G_FENCE in
// guardsBefore. That is not the real execution path. Step 2 of the writer
// transaction is a CHOICE, not a sequence:
//
//     if (testCapability) verifyTestCapability(...)   // controlled lane
//     else               authorizeV2Operation()        // production lane (G-FENCE)
//
// The controlled lane NEVER runs the G-FENCE gate: a test capability REPLACES
// the production authorization hook, it does not follow it. G_FENCE therefore
// cannot preempt a controlled transaction, and listing it in guardsBefore
// asserts a guard that never executes. It is now declared as step 2's
// production ALTERNATIVE, outside the controlled chain, and the layer harness
// refuses it in guardsBefore.
//
// Step 5b — the post-mutation re-verification — is a separate enforcement SITE
// from the step-2 authorization check, even though both call the same
// verifier. It carries its own code, so a refusal raised by the initial
// capability check can never be reported as a step-5b pass.
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
  // step 5b — post-mutation re-verification of the controlled capability. Runs
  // AFTER the mutation, so it is the last layer of the controlled chain.
  CAPABILITY_REVERIFY: 'E_TEST_CAPABILITY_REVERIFY',
});

// The CONTROLLED lane's linear chain: the order in which a transaction that
// carries a testCapability actually executes its guards. G_FENCE is not in it —
// it is the production alternative at step 2 and never runs in this lane.
export const LAYER_ORDER = Object.freeze([
  LAYER.BOUNDARY,
  // verifyTestCapability checks in this order; earlier entries pre-empt later.
  LAYER.CAPABILITY_INVALID,
  LAYER.CAPABILITY_SCOPE,
  LAYER.CAPABILITY,
  LAYER.DURABILITY,
  LAYER.PRINCIPAL,
  LAYER.WRITER_IDENTITY,
  // step 5b — after the mutation, therefore last.
  LAYER.CAPABILITY_REVERIFY,
]);

// Step 2's production alternative. A PEER of CAPABILITY, not its successor:
// the writer runs exactly one of the two authorization paths, never both, and
// never one after the other.
export const LAYER_PRODUCTION_BRANCH = Object.freeze([LAYER.G_FENCE]);
