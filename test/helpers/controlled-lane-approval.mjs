// Controlled-lane execution approval — ONE source of truth.
//
// The controlled lane performs gate-bypassed mutations against disposable
// fixtures, so running it requires an explicit owner approval. The approval
// and its date live here, not in a test file, because more than one suite now
// exercises the lane and a duplicated security constant is a constant that can
// be set in one place and forgotten in the other.
//
// SECURITY GATE: true ONLY after explicit owner approval.
// OWNER AUTHORIZATION GRANTED 2026-10-14: B-4/B-5 controlled validation execution.
// NOTE (Windows): that approval authorizes the CONTROLLED LANE, not production
// mutation. It cannot carry a Windows result past the fail-closed guards in
// lifecycle-lock-v2.mjs / file-durability.mjs, which is why the
// mutation-dependent cases report INCONCLUSIVE on Windows rather than PASS or
// FAIL.
export const CONTROLLED_LANE_APPROVED_FOR_EXECUTION = true;
