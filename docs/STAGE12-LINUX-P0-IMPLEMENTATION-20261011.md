# Stage 12 P0 — Linux implementation pass (2026-10-11)

**Branch:** `integration/stage12-build-candidate-20261009`
**Status:** implementation complete, tests run once at freeze (Phase D).
**Non-negotiables kept:** `D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`managedV2MutationAuthorized = false`. No `main` changes, no releases,
no npm publish, no secret env/CLI bypasses. Windows remains UNVERIFIED.

This pass converts the three P0 construction candidates from
`docs/STAGE12-P0-THREE-BLOCKERS-ENGINEERING.md` into real, tested Linux
implementations. Where a guarantee is impossible under the current
privilege model, the code proves the boundary instead of pretending.

## 1. D-01 — Linux legacy-writer fence (OS-enforced)

**New code:**
- `scripts/native/vcp-linux-fsops.cpp` — audited native helper: dirfd-pinned
  `renameat2(RENAME_NOREPLACE)`, `O_NOFOLLOW` chains, directory fsync,
  `FS_IOC_SETFLAGS` immutable-bit management, `stat-id`, `list-names`.
  Build: `npm run build:native-linux`. Source-only in git; fail-closed
  (`E_NATIVE_HELPER_MISSING`) when not built.
- `lib/linux-fs-provider.mjs` — `LinuxFsProvider`: uniform durability
  receipts distinguishing *operation completed* from *operation synced*;
  fail-closed on unsupported filesystems and on `EXDEV` (never silently
  copies); never traverses symlinks.
- `lib/linux-legacy-fence.mjs` — `planLegacyFence` (read-only),
  `enforceLegacyFence` (privileged ownership transfer to a distinct writer
  UID:GID + `0750`/`0640` + optional immutable bit),
  `verifyLegacyFence` (detects ownership/mode/flag changes and the
  parent-rename hole via pinned root identity), `releaseLegacyFence`
  (receipt-bound, privileged).
- `scripts/poc-old-cli-fence-linux.mjs` — 19-scenario proof harness vs the
  independently authenticated published 0.9.3 tarball: the 13 historical
  cases plus corrupt-manifest variants, old/new concurrency, crash+restart,
  symlink and parent-swap attacks; `baseline` vs `fenced` modes with
  per-file SHA-256 before/after and kernel-denial capture.
- `policies/linux/vcp-legacy-fence.apparmor`, `policies/linux/vcp-legacy-fence.te`
  — MAC candidate artifacts for the privileged-old-binary residual risk.
  Shipped as reviewable source; NOT installed or proven here (no LSM).

**Honest boundaries (proven, not claimed):**
- Same-UID DAC separation is impossible: no JS check can stop 0.9.3 under
  the same effective UID. The fence therefore requires a privileged
  one-time ownership transfer (contract change — see
  `docs/decisions/D-01-LINUX-FENCE-CONTRACT-CHANGE-PROPOSAL.md`).
- `CAP_LINUX_IMMUTABLE` is absent in the sandbox: the immutable backend is
  implemented but its enforcement is UNVERIFIED here; uid-separation is
  proven (kernel `EACCES` on every protected write/unlink/rename-inside).
- The old CLI executed *as* the writer principal (or root) bypasses DAC —
  needs MAC; UNPROVEN here. This is exactly why D-01 stays DEFERRED.

## 2. Linux filesystem durability provider

**New code:** `lib/linux-fs-provider.mjs` (+ the native helper above).

**Guarantees, per operation** (`docs/STAGE12-LINUX-DURABILITY-BOUNDARIES.md`):
- Process crash: fsync'd data + synced parent directories are visible
  after restart (proven by kill -9 injection tests).
- OS crash: same, provided the filesystem honors `fsync` (btrfs/ext4 do;
  the provider probes and fails closed where directory sync is
  unsupported — e.g. it refuses instead of pretending on odd filesystems).
- Power loss: UNVERIFIED without a real power-loss rig. `fsync` success is
  reported as a kernel acknowledgement, never as a power-loss attestation.

**Wired into Stage 12:** `lib/native-no-replace.mjs#moveDirectoryNoReplace`
now delegates to the provider on Linux (strict scope validation kept;
`win32`/`darwin` and missing-helper stay `E_NATIVE_NOREPLACE_UNAVAILABLE`).
Terminal detach, archive manifests, and retention pruning all go through
the provider. The pre-existing journal/backup modules keep their sound
staging patterns; they remain G-FENCE-blocked until D-01 approval.

## 3. Terminal recovery — no-replace detach + retention

**New/changed code:**
- `lib/terminal-detach-protocol.mjs` — resumable steps
  (`verifyDetachPreconditions` → `performDetachMove` → `acknowledgeDetach`)
  with idempotent crash resume: crash-before-move restarts clean;
  crash-after-move detects the detached-evidence state without re-moving;
  crash-after-ack is a no-op. Lock is re-verified immediately before the
  move; foreign root content aborts; destination collision is refused both
  advisory and atomically (`EEXIST` inside `renameat2`).
- `lib/terminal-retirement-v2.mjs` — archive defaults to an **in-root**
  reserved name (stays inside the authorized selected-root write scope);
  sibling archives require an explicit `siblingScopeApproval` object
  (proposed contract change, pending owner approval). Writes a forensic
  manifest into the archive; root must contain only retired archives
  afterwards. G-FENCE gate remains the first effect; all contract-check
  tripwires preserved.
- `lib/terminal-archive-retention.mjs` — retention policy: **never
  auto-delete**; explicit `planArchivePrune` (read-only) +
  `executeArchivePrune` (approval object + manifest re-verification +
  minimum age + symlink refusal).
- `lib/greenfield-recovery-plan.mjs` — recognizes `ALREADY_RETIRED`
  (read-only terminal state) so recovery re-runs are idempotent no-ops.
- `lib/terminal-orphan-inspect.mjs` — recognizes `RETIRED_EVIDENCE_PRESENT`.

**Scope decision:** `docs/STAGE12-TERMINAL-RECOVERY-SCOPE-DECISION.md`.

## Tests (all on disposable fixtures; first run at Phase D freeze)

- `test/stage12-linux-fs-provider.test.mjs` — capability matrix, exclusive
  synced writes, atomic replace, no-replace move + collision, symlink and
  hardlink attacks, EXDEV fail-closed, durable delete/rmdir, staging reap,
  interrupted-replace recovery, SIGKILL burst, path validation.
- `test/stage12-linux-legacy-fence.test.mjs` — read-only plan, privilege
  refusal, kernel `EACCES` on 5 write shapes with bytes unchanged,
  violation detection (mode/ownership/parent-rename), symlink refusal,
  immutable-backend honesty.
- `test/stage12-terminal-detach-linux.test.mjs` — happy path, crash at all
  three boundaries, advisory+atomic collision, symlink destination,
  lock-change mid-flight, journal failures, foreign content, sibling
  approval, double detach, retention plan/execute/tamper/symlink.
- `scripts/poc-old-cli-fence-linux.mjs` — 19 scenarios × baseline/fenced
  vs the real published 0.9.3 (needs root + tarball + registry integrity).

## What remains for the owner

1. **D-01 independent approval** — the fence is provable on Linux but its
   deployment is a contract change (isolated space + ownership transfer);
   see the approval request in
   `docs/decisions/D-01-LINUX-FENCE-CONTRACT-CHANGE-PROPOSAL.md`.
   Windows proof is entirely outstanding.
2. **Terminal scope approval** — in-root archives need no new scope;
   sibling archives do (explicit approval object exists; not granted).
3. **Power-loss rig** — durability beyond OS crash stays UNVERIFIED.
4. Nothing here opens G-FENCE, merges to main, or publishes anything.
