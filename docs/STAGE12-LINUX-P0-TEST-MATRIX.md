# Stage 12 P0 — Linux test matrix (frozen-head run, 2026-10-11)

Frozen integration HEAD: `<recorded at freeze>`
Each row records: command, exit code, stdout/stderr digests, environment
(kernel/filesystem), fixture steps, per-file hashes before/after, and
PASS / FAIL / BLOCKED / UNVERIFIED. Evidence lands on the dedicated
evidence branch (see `docs/evidence/stage12-linux-p0-20261011/README.md`).

## 0. Environment probe (informational)

| # | Check | Command |
|---|---|---|
| E1 | kernel/arch/filesystem | `uname -a`, `stat -f -c %T` on the fixture volume |
| E2 | native helper capabilities | helper `--probe-dir` on a disposable dir |
| E3 | privilege model | `id`, capability probe (`chown` ok / `chattr +i` EPERM), `setpriv` presence |
| E4 | published 0.9.3 integrity | `npm view vibe-coding-production@0.9.3 dist.integrity` vs tarball sha512 |

## 1. Blocker 1 — D-01 Linux fence

| # | Test | Expectation |
|---|---|---|
| F1 | `node scripts/poc-old-cli-fence-linux.mjs --self-test` | harness self-test PASS |
| F2 | PoC `--mode baseline` (19 scenarios, real 0.9.3) | protected-byte loss reproduced (NO-GO baseline) |
| F3 | PoC `--mode fenced` (19 scenarios) | kernel EACCES/EPERM denials, zero protected-byte changes, fence intact |
| F4 | `test/stage12-linux-legacy-fence.test.mjs` | all PASS (immutable-backend case records UNVERIFIED where capability absent) |
| F5 | same-UID control (in F3 report) | documents impossibility, no fake separation |

New scenarios beyond the historical 13: corrupt-manifest old-init,
corrupt-manifest old-rollback, old/new concurrency, crash+restart,
symlink-vcp, parent-swap-mid-transaction.

## 2. Blocker 2 — durability provider

| # | Test | Expectation |
|---|---|---|
| D1 | `test/stage12-linux-fs-provider.test.mjs` | all PASS on btrfs |
| D2 | power-loss attestation | UNVERIFIED (no rig) — recorded, never claimed |
| D3 | EXDEV cross-filesystem | `E_CROSS_FILESYSTEM`, no silent copy |
| D4 | SIGKILL burst | committed files never torn |

## 3. Blocker 3 — terminal recovery

| # | Test | Expectation |
|---|---|---|
| T1 | `test/stage12-terminal-detach-linux.test.mjs` | all PASS |
| T2 | crash before move / after move / after ack | idempotent resume, single archive, no deletes |
| T3 | destination collision (advisory + atomic) | refused, source untouched |
| T4 | retention tamper/symlink | prune aborts, archive survives |

## 4. Regression

| # | Test | Expectation |
|---|---|---|
| R1 | `npm run check` (syntax) | exit 0 |
| R2 | `npm run check:stage12-contract` | PASS_READ_ONLY_BOUNDARIES |
| R3 | `npm test` (full suite) | recorded per-file; pre-existing failures reported as-is, never relabeled |
| R4 | `npm run pack:check` | exit 0 |

## Verdict rules

- Any F3 breach → D-01 fence FAIL, D-01 stays DEFERRED regardless of the rest.
- Any T2 non-idempotence → terminal recovery FAIL.
- D2 is UNVERIFIED by construction; it blocks power-loss claims, not the pass.
- Windows: no row here counts for Windows. All Windows claims stay UNVERIFIED.
