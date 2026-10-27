# Adaptive Phase 3 — Provider-Neutral CI / Legacy Workflow Transition

**Status: SOURCE CONSTRUCTION, INTEGRATION UNVERIFIED, NOT ACCEPTED.**

Baseline: `9f9202d205e1704c3d05d844e48f41b962036928`.

This bundle contains read-only provider-neutral CI inspection and a specialized legacy `.github/workflows/validate.yml` decision preview. The latter delegates to the Stage14 retirement planner for manifest ownership, baseline integrity, and user-edit preservation.

New behavior:

- `vcp ci-plan [directory] --json` gives a *proposal*, never an apply authorization.
- Unmodified, baseline-proven, VCP-managed legacy workflow → DELETE_CANDIDATE; edited managed workflow → DETACH_CANDIDATE **without changing bytes**; unknown/unsafe provenance → BLOCKED; unowned or absent → preserve.
- `vcp doctor` shows observed CI provider(s) while keeping execution, required checks and verification coverage explicitly unassessed.
- GitHub issue/PR scaffolding remains independent of CI; no CI code execution or new workflows.

Read-only action proposals depend on D-01 approval, G-FENCE authorization, native durable writers, old-published-CLI isolation, a recoverable backup/journal, lock ownership, exact current-byte verification, and explicit human decision. None are satisfied or inferred by a preview.

See `ADAPTIVE-PHASE3-4-BUILD-STATUS.md` for Phase 4 first-party detection and the incomplete future portions. Native Windows/NTFS and full original runtime acceptance have not run. No GitHub push, merge, release or npm publish.
