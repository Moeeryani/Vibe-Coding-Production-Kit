# Stage 13 — Smart Init Apply

**Status:** BUILD IN PROGRESS. Implementation branch:
`feat/stage13-smart-init-apply-20261011`.

**Parent:** Stage12 integration `61373569fd50a5a3a153e39bfcd721a94b4f22d2`.
The Stage12 Linux evidence remains on its separate evidence branch. This
parent choice reuses its read-only Smart Init planner; it does **not**
mean Stage12 passed full acceptance.

## Original Roadmap contract

First adoption into an EXISTING, unmanaged repository:

1. Inspect first; never treat a saved dry-run as write authority.
2. Obtain explicit existing-repository adoption intent.
3. Acquire a first-adoption-aware owned lifecycle lock, inspect again and
   compute a **fresh** plan under the lock.
4. Reject changed intent, conflicts, linked/unknown paths, stale authority
   and missing human decisions before mutating any user file.
5. Create a *complete* first-adoption recovery point (including previous
   absence of `.vcp`) before staging any change.
6. Stage conservative asset-set `brownfield-minimal-v1`, preserve whole
   files and append only explicitly supported owned sections.
7. Write ownership-aware baselines/manifest, verify and commit durable
   transaction evidence.
8. On failure, restore exact prior bytes and truly unmanaged lifecycle
   state; do not remove foreign or concurrently edited files.
9. Retest idempotence and crash recovery on the final frozen build.

No Stage 13 adoption may silently enable managed-v2 migration or override
`D-01 = DEFERRED`, `G-FENCE = NO-GO`. The native Windows backend and
independent gate evidence remain separate. No main merge, release or
publish until acceptance.

## First implementation increment

`lib/stage13-brownfield-preflight.mjs` now provides a **read-only**
adoption-decision boundary. It checks the classification/asset surface and
requires root-bound explicit approval of proposed actions. Its successful
result is `READY_TO_REPLAN_UNDER_OWNED_LOCK`, **never**
`executionAuthorized:true`. It cannot apply a stale preview.

**Next build units:** lock/bootstrap rollback contract, post-lock replan,
complete old-state snapshot, staged claim/section write, manifest ownership
and crash-resumable recovery. **Build all first, test after freeze.**

**This status file is not a test receipt or Stage13 completion.**
