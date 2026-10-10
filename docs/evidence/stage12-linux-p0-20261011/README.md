# Stage 12 P0 — Linux evidence (2026-10-11)

Frozen integration HEAD tested:
`61373569fd50a5a3a153e39bfcd721a94b4f22d2`
(branch `integration/stage12-build-candidate-20261009`).
`main` untouched (`8ccb276545fdb3cc301ce7ce324812eb4c314586`).

This receipt covers the three Linux P0 blockers only. It is NOT a
Stage 12 completion claim, NOT a migration approval, and NOT Windows
acceptance. `D-01` stays `DEFERRED`, `G-FENCE` stays `NO-GO`,
`managedV2MutationAuthorized` stays `false`.

## Environment

See `environment.json`. Headlines: Linux 7.0.0-39-generic x86_64,
Node v24.20.0, fixtures on btrfs, helper `scripts/native/vcp-linux-fsops`
built from frozen source (`npm run build:native-linux`).
No SELinux/AppArmor enforcement provable here (`/sys/kernel/security/lsm`
absent); `chattr +i` → EPERM (no `CAP_LINUX_IMMUTABLE`).

Published old CLI: `vibe-coding-production@0.9.3`, tarball sha512 verified
against the npm registry (`tarball-integrity.json`; sha256
`4b78fd41…6ac9130`).

## Blocker 1 — D-01 Linux legacy fence

PoC: `scripts/poc-old-cli-fence-linux.mjs`, 19 scenarios (13 historical +
6 new: corrupt-manifest old-init / old-rollback, old/new concurrency,
crash+restart, symlink-.vcp, parent-swap-mid-transaction), each run as an
unprivileged legacy UID (60001) against the real published 0.9.3 tarball.

- Baseline (no fence): **13/19 scenarios mutated protected bytes.**
  The 6 non-mutating cases exited 1 (old CLI refused: directory-sentinel
  lock, malformed lock, intact-v2 `--force` init refused, corrupt manifest)
  — fail-closed errors, not protection.
- Fenced (uid-separated, 0750/0640, writer UID 60002): **0/19 breached**.
  18/18 sealed fixtures report `fenceIntactAfter: true`; the symlink-`.vcp`
  fixture was correctly refused at seal time (`E_FENCE_SYMLINK_REFUSED`).
- Combined gate: `FENCE_HELD_ON_LINUX__REQUIRES_OWNER_APPROVAL_AND_WINDOWS_PROOF`
  (receipt: `d01-linux-fence-receipt.json`; per-mode logs: `poc-baseline.log`,
  `poc-fenced.log`, `poc-both.log`).

What this does NOT prove (explicit non-goals, by design):

- **Same-UID bypass (control experiment, documents impossibility):**
  Unix DAC cannot distinguish the published 0.9.3 binary from the new CLI
  when both run as the writer UID. Running old-CLI-as-writer-UID bypasses
  uid-separation unconditionally. No code can fix this under DAC; it needs
  MAC (SELinux/AppArmor) enforcement or a genuinely isolated principal.
  The candidate policies under `policies/linux/` are unproven here.
- **MAC-backed immutability:** `chattr +i` unavailable in this sandbox.
- **Windows:** nothing here transfers. Windows D-01 remains UNVERIFIED.

Verdict: the Linux DAC fence holds against the legacy-UID threat model
(0/19 breaches, kernel EACCES denials). **D-01 stays DEFERRED** pending
owner approval of the isolated-space/ownership-transfer contract and/or
MAC proof.

## Blocker 2 — durability provider

`test/stage12-linux-fs-provider.test.mjs`: **12/12 pass** (`unit-tests.log`).

- renameat2(RENAME_NOREPLACE) fresh-ok + collision-denied; no plain-rename
  fallback anywhere in the provider.
- `writeFileSynced` = temp + data fsync + rename-noreplace: SIGKILL burst
  test confirms no torn file ever appears at a final name (only reapable
  staging files); second create → `E_FS_DESTINATION_EXISTS` from inside the
  atomic op (no lstat+create race).
- EXDEV across btrfs→tmpfs fails closed (`E_CROSS_FILESYSTEM`), never
  silently copies.
- Symlink/hardlink destination and symlink-parent attacks refused.
- Durable delete/rmdir with parent sync; `reapStaging` removes only
  provider-pattern staging files.
- Capability probe fails closed where primitives are absent.

Boundary: **power-loss is UNVERIFIED** (no rig). Claim = process/OS-crash
durability on Linux/btrfs only.

## Blocker 3 — terminal recovery

`test/stage12-terminal-detach-linux.test.mjs`: **14/14 pass**.
`test/stage12-terminal-retirement.test.mjs`: **5/5 pass**.

- Crash before move / after move (pre-ack) / after ack: idempotent resume,
  exactly one archive, forensic manifest written idempotently by ack,
  `planGreenfieldRecovery` → `ALREADY_RETIRED` (not BLOCKED) after ack.
- Destination collision refused by advisory check AND the atomic OS check;
  symlink at destination never replaced.
- Lock-token change between verify and move aborts (`E_TERMINAL_LOCK_CHANGED`).
- Sibling archive requires a valid explicit approval object; the primitive
  itself refuses without one (defense in depth).
- Retention: never auto-deletes; prune needs approval + manifest re-verify;
  manifest tamper or symlink inside archive aborts prune, archive survives.

Production path (`lib/terminal-retirement-v2.mjs`) now runs the resumable
protocol (verify → `performDetachMove` → `acknowledgeDetach`).

## Regression

- `npm run check` (syntax): 93 modules pass.
- `npm run check:stage12-contract`: `PASS_READ_ONLY_BOUNDARIES`,
  `gFence: NO-GO`. (Two stale tripwires repaired: the scope doc uses
  `STAGE12_FULL` terminology — pre-existing drift, intent preserved; one
  tripwire referenced a string that never existed in source.)
- `npm test` (full suite): 504 pass / 71 fail — all 71 are pre-existing
  `E_TEST_FIXTURE_UNSAFE` failures (test-helper requires `vcp-*` fixture
  names; callers use other names), verified identical on the pristine
  import commit `614c86e`. One failure WAS caused by this work
  (`stage12-terminal-retirement`: asserted the old always-refuse stub);
  fixed by enforcing sibling-scope approval in the primitive and updating
  the test to the implemented behavior. See `npm-test-full-suite.log`.
- `npm run pack:check`: pass.

## Files

- `d01-linux-fence-receipt.json` — combined 38-scenario receipt (definitive)
- `baseline-receipt.json`, `fenced-receipt.json` — per-mode receipts
- `poc-*.log` — raw PoC stdout
- `unit-tests.log` — 37/37 new + retirement tests
- `contract-check.log`, `environment.json`, `tarball-integrity.json`
- `npm-test-full-suite.log` — full suite with pre-existing failures

## Open owner decisions

1. D-01 contract: approve the isolated-space/ownership-transfer model (or
   require MAC proof) — until then D-01 stays DEFERRED.
2. Sibling forensic archive writes outside the selected root — approve as a
   contract change or keep in-root only.
3. Windows: no Linux result counts. Windows PoC still required.
4. Power-loss: UNVERIFIED by construction; needs a rig or stays a
   documented boundary.
