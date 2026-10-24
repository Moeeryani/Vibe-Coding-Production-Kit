# Phase N+1 — Secure Transaction Continuity

Status: ENGINEERING DESIGN (Phase N+1 implementation branch,
`feat/phase-n1-transaction-continuity`, based on the frozen Phase N
candidate `54e14c7`). Independent validation is a separate step and is
NOT performed by the engineering agent.

Phase N resolved SEC-FINDING-002 for the `atomicWriteFile` scope:
every mutation goes through the native helper's pinned openat /
renameat chain, so no single helper invocation can be redirected by a
symlink swap. Independent Linux validation of `54e14c7` then proved
two residual weaknesses that Phase N's per-invocation pinning does not
cover. Phase N+1 addresses exactly those, plus the transaction-adjacent
surfaces where they interact.

## Findings addressed

### X-02 — no transaction-wide identity continuity (validator, proven)

`replaceFileAtomic` runs ~4 helper processes (destination `stat-id`,
staging `write-file-sync`, `rename-replace`, post-rename `stat-id`).
Each process pins whatever the root/parent PATHS resolve to at its own
start. The validator swapped a real intermediate directory for another
real directory between the staging and rename spawns and relocated the
staged file into the replacement directory: the rename spawn resolved
the path into the NEW namespace, the staged inode moved with it (so the
post-rename dev/ino comparison still matched), and the write completed
outside the authorized namespace with a full success receipt.

Root cause: the transaction never captures the identities of the
objects it was authorized to mutate (root directory, destination
parent). Inode continuity of the payload file alone cannot detect a
namespace substitution, because relocation preserves the inode.

### X-05 — native helper is unauthenticated (validator, proven)

A fake helper emitting protocol-perfect JSON (injected through the
`LinuxFsProvider` constructor seam) made `replaceFileAtomic` return
`completed:true, dataSynced:true, directorySynced:true,
identityVerified:true` while creating no file. Selection-time checks
were type-only (regular, non-symlink, executable); helper content was
never measured, and the provider trusted helper-reported receipts
without any independent verification of the outcome.

Exploitation requires write access to the package install tree, which
is outside SEC-FINDING-002's namespace-actor model — but the receipt
forgery also caps every containment claim the writer makes, so the
trust model is hardened and, just as importantly, made explicit.

## Design — transaction identity continuity (X-02)

1. **Anchor capture.** Before any mutation, the provider captures the
   transaction anchor through the pinned chain: `stat-id` of the root
   (`.`) and of the destination parent, yielding `(dev, ino)` for
   both. The anchor is frozen and recorded in the receipt.
2. **In-helper expectation checks.** The helper accepts
   `--expect-root DEV:INO`, `--expect-parent DEV:INO` and
   `--expect-file DEV:INO`. Enforcement happens INSIDE the helper,
   against descriptors it already pins:
   - the root fd is `fstat`-verified immediately after opening;
   - for every mutating op, the resolved parent dirfd is `fstat`-
     verified after the pinned walk and BEFORE the mutation syscall;
     renames verify both parents;
   - renames and unlinks additionally `fstatat`-verify the source /
     target object's identity before acting (staging substitution and
     cleanup-target substitution are refused, not acted on).
   A mismatch emits `{"ok":false,"identityMismatch":true,...}` with
   exit code 13; the provider maps it to `E_FS_IDENTITY_CHANGED` and
   issues NO success receipt.
3. **End-to-end binding.** Every spawn of the transaction carries the
   anchor expectations (destination stat, staging write, rename,
   post-rename stat, failure-cleanup unlink — the unlink also carries
   the staged file's identity, so cleanup can never delete a
   substituted object). After the rename, the provider re-stats root
   and parent and compares them to the anchor in addition to Phase N's
   destination-identity check.
4. **Same discipline for composed provider ops.** `writeFileSynced`
   (journal staging, backup data) anchors its parent and binds its
   staging write and no-replace rename the same way. `reapStaging`
   stats each candidate and unlinks with `--expect-file`, so a staging
   name substituted between listing and deletion is skipped, never
   deleted through.
5. **Semantics preserved.** Same-directory renames only for the
   anchored parent check (the writer's staging always lives beside its
   destination — Phase N contract). Error taxonomy gains exactly one
   code: `E_FS_IDENTITY_CHANGED`. All Phase N refusals, sync-proof
   requirements and receipt fields are unchanged; receipts gain
   `anchor` and `helper` evidence blocks.

Rejected alternative: collapsing the transaction into ONE helper
invocation. It would also work, but it replaces a reviewed op-by-op
protocol with a new monolithic one, concentrates stdin payload +
rename + verify logic in a single new code path, and invalidates the
Phase N evidence base for the individual ops. Expectation-checking
keeps every Phase N op byte-compatible in behavior while removing the
cross-spawn gap.

## Design — native helper trust model (X-05)

Layered, with the residual stated rather than hidden:

1. **Build manifest.** `npm run build:native-linux` now runs
   `scripts/native/build-linux-fsops.mjs`, which compiles with the
   same flags as before and writes
   `scripts/native/vcp-linux-fsops.manifest.json` (a build artifact,
   gitignored like the binary) recording the SHA-256 of the helper
   SOURCE and of the produced BINARY.
2. **Runtime measurement.** On first use, `LinuxFsProvider` measures
   the helper: lstat (regular file, non-symlink, executable),
   permission hygiene (a world-writable helper, or one owned by
   neither root nor the process euid, is refused; the measured mode
   is recorded — deployments that can should also refuse group-write,
   but the reference environments build group-writable trees, so that
   remains a deployment policy, not a provider refusal), SHA-256 of
   the binary, and SHA-256 of the in-tree source. It refuses with
   `E_NATIVE_HELPER_UNTRUSTED` unless binary hash == manifest binary
   hash AND source hash == manifest source hash. The measured identity
   `{path, dev, ino, sha256}` is recorded in every receipt, so an
   external verifier can compare it against a fresh trusted build —
   the same method the Phase N validator used (byte-identical rebuild).
   The binary is re-measured if its `(dev, ino, size, mtime)` changes.
3. **Independent outcome verification.** After the rename, the
   provider verifies the destination WITHOUT trusting helper JSON: it
   reads the destination bytes through a separate channel and compares
   the SHA-256 to the payload's. A no-op or lying helper therefore
   fails with `E_FS_REPLACE_UNVERIFIED` and no receipt — forging a
   success now requires actually writing the correct bytes into the
   correct namespace, i.e. doing the operation.
4. **Honest seam.** The constructor's helper-path override remains for
   tests, but trust verification is ON by default for every instance;
   bypassing it requires the explicit, greppable option
   `allowUnverifiedHelper: true`, which production code never passes
   (`selectSecureWriterProvider` constructs the provider with no
   options). Tests that exercise the seam must say so in code.
5. **Residual (documented, not claimed away).** An actor who can write
   BOTH the binary and the manifest (or the provider sources) inside
   the install tree can still forge trust — that is full install-tree
   compromise, the same privilege that replaces the `.mjs` sources
   themselves, and it stays outside the threat model. What changed:
   forgery now needs consistent multi-artifact replacement, is
   detectable from receipts by external comparison, and can no longer
   be achieved by a JSON-speaking impostor at the provider seam.

## Priority-3 inventory — locks, journal, evidence, recovery

Scoped to what touches the atomic-write transaction's guarantees:

- **Journal persistence.** Versioned-journal entries and backups are
  written through the provider's composed ops (`stageJournal`,
  `writeBackupData`, both on `writeFileSynced`) and committed through
  `replaceFileAtomic` / `moveNoReplace`. The composed staging op is
  anchored by this phase (above), so the journal's staging step gains
  the same continuity as the commit step. Journal REPLAY and rollback
  read paths remain as in Phase N.
- **Recovery / cleanup.** `reapStaging` gains identity-bound deletion
  (above). The failure-cleanup unlink inside `replaceFileAtomic`
  carries root, parent AND staged-file expectations.
- **Evidence recording.** Receipts now carry the transaction anchor
  and the measured helper identity — the two facts an independent
  validator needs to re-verify a completed write after the fact.
- **Lifecycle locks (carried residual, unchanged claim).**
  `lifecycle-lock-v2` still resolves its lock directory with path-based
  intermediates (Phase N residual R-2). The lock is an advisory
  coordination primitive, not part of the `atomicWriteFile` mutation
  path, and lock acquisition does not authorize mutation (the writer's
  capability + gate do). Rebuilding the lock on the provider is a
  separate, larger change; Phase N+1 does not claim it. The writer's
  audit append (R-3) and the safe-read / safe-replace / safe-create
  class (R-5) likewise remain documented residuals, untouched.

## Verification plan (engineering side)

- New adversarial suite `test/writer-transaction-continuity.test.mjs`
  (PN1 series). Deterministic interposition: a proxy helper that
  delegates to the real helper but performs the X-02 swap at the
  rename boundary, driven through the provider's test seam with
  `allowUnverifiedHelper` — the swap must now produce
  `E_FS_IDENTITY_CHANGED`, no success receipt, and no payload bytes
  outside the authorized namespace. X-05 reproducers: a JSON-only fake
  helper is refused WITHOUT the seam flag (trust), and with the flag
  its "success" is caught by independent content verification.
- Mutation testing: (a) drop `--expect-parent` from the rename spawn
  → the X-02 test must fail; (b) drop the independent content
  verification → the X-05 seam test must fail; (c) corrupt the
  manifest digest → trust refusal test must fail.
- Full-suite regression in the same environment as the Phase N
  comparison, with failing-name sets compared against candidate
  `54e14c7`: zero new failures is the acceptance bar for the
  engineering handoff.
- Gates unchanged: D-01 DEFERRED, G-FENCE NO-GO, writers DISABLED,
  B-2 power-loss NOT_PROVEN, `WINDOWS_PRINCIPAL_PROVIDER = null`.
  Nothing is pushed; the frozen N+1 candidate is handed to the
  independent Linux validator, which remains a separate step.
