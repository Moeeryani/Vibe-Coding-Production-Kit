# VCP Adaptive — Phase 3 construction and Phase 4 discovery foundation

**Baseline:** `9f9202d205e1704c3d05d844e48f41b962036928` / tree `45f00d57faa8c391ed0260050a40849ff5920a22`.

## Source constructed

- Phase 3: `ci-inspection.mjs` provider-neutral read-only CI inspection; `legacy-ci-transition-plan.mjs` uses existing Stage14 retirement-plan provenance to propose `DELETE_CANDIDATE` for unchanged managed legacy workflow, `DETACH_CANDIDATE` (preserve bytes) for edited managed workflow, or `BLOCKED` for uncertain ownership/baselines. Both are read-only; no CI generated or executed.
- Doctor integration: `ciCoverage` no longer blindly `unassessed` for provider presence, while all actual execution/required-check/semantic coverage remain `unassessed` and Doctor health classification is not made conditional on CI presence.
- Read-only commands: `vcp ci-plan [directory] [--json]` and `vcp capabilities [directory] [--json]` (strictly reject write flags).
- Phase 4 foundation: `capability-discovery.mjs` first-party bounded deterministic evidence for Go/Python/Rust/TypeScript/React Native/Node; all remain `NOT_APPLIED`, no command or manifest authority is granted.
- Tests: CI inspection, migration policy, capability discovery. No production writes, network, or arbitrary plugin execution.

## Not yet source-complete / not accepted

- Phase 3 full CLI/Doctor integration has to be executed in the real exact-base source checkout; legacy detach is **inspection-only**, never an apply path. Broader CI provider fixtures and native Windows checks remain.
- Phase 4 manifest applied-capability provenance, bounded runtime integration with Context/Task/update/manage, legacy stack reconciliation, community profile bridge, polyglot conformance and Checkpoint B are not delivered by this first read-only slice.
- Adaptive Phases 5–10 are untouched. Checkpoint A remains PENDING/NO-GO. Stage14 remains unmerged.
- The new source and fixtures have local syntax and 16/16 sandbox tests, with the real frozen Git blob versions of `safe-read.mjs` and `safe-path.mjs` used for 12 CI/capability tests; legacy planner policy used isolated dependency stand-ins. No complete GitHub exact-head regression or independent Linux/Windows acceptance exists for this artifact.

**Gates:** D-01 DEFERRED; G-FENCE NO-GO; B-2 NOT_PROVEN; Windows principal provider null; production writers disabled. No GitHub push, main merge, tag or npm publish is authorized.
