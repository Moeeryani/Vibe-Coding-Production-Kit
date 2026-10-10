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
2. **Nested claim rollback construction added:** first missing project
   ancestors are staged as directory trees; the version-3 WAL records
   every created directory's exact native device/inode, and kernel
   NOREPLACE moves the first absent subtree as a unit. Read-only
   recovery rejects modified or foreign directories and plans
   deepest-first empty-directory removal. The independent crash/restart
   and directory-race conformance proof remains PENDING.
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

## Stage 13 public entrypoint and restart hardening

The existing-repository CLI now accepts **explicit** `--adopt` together
with `--yes --confirm-adoption <current-64-hex-fingerprint>`.
`init --dry-run --json` reports the current root/intent/action-bound
Stage13 consent fingerprint and never grants execution. A missing, stale,
malformed, mismatched or unpaired fingerprint is rejected, and `--yes`
alone cannot approve brownfield mutation. Under the still-closed D-01
gate, even an exact fingerprint is rejected before project writes.

The Stage13 transaction now stages new files first in owned VCP state,
records their **device/inode identities in the immutable journal**, and
moves the exact staged inode into a new user-project name using native
Linux `NOREPLACE`. This prevents Recovery from treating a separately
created file with coincidentally identical bytes as VCP-owned. The
committed finalizer also checks inode identity and file mode.

`recovery-plan` can recognize a Stage13 v3 transaction and show a
read-only, exact-preimage rollback classification instead of attempting
to interpret it as a Stage12 init/update journal. A protected rollback
candidate was authored for root-level identity-owned claims and
preserves the whole recovery bundle in an in-root no-replace forensic
archive. It **does not** authorize editing existing user documents or
recursively removing unknown user directories.

New source-only tests:
`test/stage13-cli-adoption.test.mjs`,
`test/stage13-init-gate.test.mjs`,
`test/stage13-materialize.test.mjs`,
`test/stage13-transaction-recovery.test.mjs`.

### No false completion

This remains **BUILD IN PROGRESS** because section-file atomic CAS /
enforced writer isolation, created-directory provenance for general
the initial bootstrap-before-journal crash window, native Windows
durability and final full-head independent testing have not been accepted. The package version remains 0.9.3.
There is no approved D-01, G-FENCE, main merge or publication.

## 2026-10-11 nested-directory ownership and exact native identity

A further source-only build increment adds:
`lib/stage13-directory-ownership.mjs`,
`lib/stage13-identity.mjs`, and tests
`test/stage13-directory-ownership.test.mjs`,
`test/stage13-nested-recovery.test.mjs`.
For a missing project directory (e.g. `.github/ISSUE_TEMPLATE`), Stage13
builds the new subtree under `.vcp/stage/<id>/dirs`, pins every native
directory/file identity **before** serializing the v3 journal, then
installs the subtree with Linux `renameat2(RENAME_NOREPLACE)`. The
rollback classifier matches those exact directory/file IDs and deletes
only owned files followed by empty owned directories in deepest-first
order. Any foreign entry blocks deletion.

The Linux helper now includes **lossless string-encoded uint64 device/inode
fields** (`devExact`, `inoExact`) because JSON numbers round 64-bit inode
identities beyond JavaScript's safe-integer range. Destructive Stage13
ownership checks reject rounded JS numbers. Stage13 intentionally
retains legacy numeric helper fields for Stage12 compatibility.

`scripts/check-stage13-construction-contract.mjs` was authored as an
unexecuted static guard against changing the Stage13 fence, fresh replan,
native no-replace path, directory provenance and identity. It does not
assert filesystem proof or Stage13 completion.

**Outstanding gap:** a crash during initial adopt lock/bootstrap/staging
**before the v3 journal has been persisted** can leave owned control
residue without a complete transaction descriptor. Without exact
provenance a restarted process MUST fail closed; no automatic cleanup of
such residue is authorized. A complete first-adoption bootstrap recovery
protocol and native interruption tests remain required before marking
BUILD COMPLETE. Managed-section replacement still requires demonstrably
enforced writer isolation/atomic concurrency protections. No code/tests
have been executed in this increment.
