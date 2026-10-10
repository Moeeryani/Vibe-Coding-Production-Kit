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

## 2026-10-11 construction pass — source authored, NOT fully accepted

The Stage13 branch now includes a substantial but **not yet fully
implementable/accepted** Smart Init Apply candidate:

- `lib/stage13-brownfield-preflight.mjs`: explicit root/intent/action
  fingerprint, cross-platform name/ancestor collisions and unresolved
  polyglot choice refusal. A past preview never carries write authority.
- `lib/stage13-materialize.mjs`: in-memory conservative brownfield
  materialization, exact original document bytes for section candidates,
  minimal `assetSet`, section-body-only baseline hashes, recorded
  template/adapter intent, preserved original user-document mode.
- `lib/lifecycle-lock-v2.mjs`, `lib/adoption-inspect.mjs` and
  `lib/adoption-plan.mjs`: exact same-process owned `adopt` lock branding
  and narrowly scoped reinspection after lock bootstrap; the existing
  reader refuses all foreign and unknown `.vcp` state.
- `lib/stage13-transaction.mjs`: independent adopt-format-v3 WAL, phase
  transitions, root and consent hashes, immutable ledger with staged
  device/inode proof. Not silently decoded as versioned greenfield init.
- `lib/stage13-apply.mjs`: gated preflight → owned lock → fresh plan →
  exact preimages → staged/inode-proven files → durable recovery metadata →
  journal → kernel `renameat2(NOREPLACE)` claims → baselines / v2 manifest
  → commit proof → owned staging cleanup. New file claims are moved from
  the staged inode instead of creating a second identical file by path.
- `lib/stage13-recovery-contract.mjs`,
  `lib/stage13-recovery-plan.mjs`,
  `lib/stage13-recovery-apply.mjs`,
  `lib/stage13-finalize.mjs`: read-only rollback classification and
  gated restoration of identity-proven root-level claims; modified or
  foreign entries BLOCK. Completed recovery can retain whole `.vcp`
  evidence by native no-replace in-root rename, instead of clearing
  the journal before the lock. Committed finalization removes only
  exact staging bytes and clears the journal last.
- `lib/init.mjs` routes EXISTING init through Stage13's D-01-gated
  transaction candidate. `lib/cli.mjs` gives read-only Stage13 v3
  recovery-plan visibility.
- New negative/source acceptance tests were **authored but not run**:
  `test/stage13-materialize.test.mjs`,
  `test/stage13-transaction-recovery.test.mjs`,
  `test/stage13-init-gate.test.mjs`. Existing Stage12 init-gate
  expectations were aligned with the preserved G-FENCE behavior.

### Remaining engineering items before BUILD COMPLETE

1. **Owned existing-file section replacement** is still blocked by
   `E_STAGE13_SECTION_ATOMIC_CAS_UNAVAILABLE`. Existing documents with
   `PROPOSE_SECTION` must not be overwritten by a racy
   read-hash-then-rename operation. Require a real OS-enforced exclusive
   writer/identity-proof contract, backed by new D-01 authorization and
   independent Linux/Windows tests; no silent downgrade.
2. **General nested claim rollback** is deliberately blocked without
   original-parent/created-directory ownership evidence. A non-root
   project directory must never be silently removed on a hash-only
   guess. Author the complete directory ownership ledger and restart
   proof before enabling nested rollback.
3. Stage13 commit/recovery is **source-only and unexecuted**; all
   linkages, import cycles, integration contracts, manifest and native
   durability behavior need the final frozen-head computer-agent
   campaign after construction is completed.
4. Native Windows/NTFS remains fail-closed, and current package version
   remains `0.9.3` (cannot advertise v2 reader support).
5. There is no approved CLI adoption-approval receipt ingestion and
   review workflow yet; `--yes` alone must never authorize brownfield
   writes. The existing preview supports inspection while the
   mutating path requires a root/intent-bound approval object.
6. No full Stage13 acceptance, Adaptive Validation Checkpoint A, main
   merge, tag, release, or publication occurred.

**Hard invariant:** `D-01=DEFERRED`,
`G-FENCE=NO-GO`, `managedV2MutationAuthorized:false`.
No testing or check commands were executed during this construction pass.
