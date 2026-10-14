# Test Summary — PR #108 campaign (2026-10-14)

All runs on Linux (no Windows host in sandbox). Node v24.20.0.
`TMPDIR` was redirected to `/var/tmp/vcp-campaign-{head,base}` (2 GiB tmpfs):
`/tmp` was 93% full (other agents' PostgreSQL work, untouched) and the first
run died on `ENOSPC`. The native Linux helper was built first
(`npm run build:native-linux` → `scripts/native/vcp-linux-fsops`), which the
Stage-13 native-exchange tests require.

PASS evidence never transfers between SHAs — every line below is scoped to
the exact SHA (and local fix set) named.

## Frozen PR HEAD: `f4b6832b8c732c2f544322d0615690021db800df`

### Full suite — final (with local FIX-01 + FIX-02, unpushed)

- Command: `TMPDIR=/var/tmp/vcp-campaign-head npm test`
- Result: **776 tests · 700 pass · 62 fail · 14 skipped · EXIT=1**
- The 62 failures are byte-identical to the failure set on PR base `de8faa19`
  (see comparison below) — **zero branch-introduced failures**.
- The 14 skips are Windows-only tests with explicit skip reasons
  ("Native Windows host required; no Windows acceptance evidence on this
  platform") plus platform-gated cases.

### Targeted suites (same tree)

| Command | Result |
|---|---|
| `npm run check` | PASS — "Syntax check passed for 150 module(s)." (after FIX-01; before: SyntaxError at `lib/d01-principal-boundary.mjs:50`) |
| `npm run check:stage12-contract` | ran, concludes `NO_GO__LEGACY_USER_EDIT_LOSS_WITNESSES` (by design) |
| `npm run check:stage13-contract` | ran, `gFence: NO_GO`, `approvalRequired: true` (by design) |
| `npm run test:stage13` | **59 pass · 0 fail · 12 skipped** (Windows-only) · EXIT=0 |
| `node --test test/stage12-*.test.mjs` (15 files; no `test:stage12` script exists) | **103 pass · 0 fail · 1 skipped** · EXIT=0 |
| `node --test test/windows-scratch-protocol.test.mjs test/stage12-windows-native-scratch.test.mjs test/windows-scratch-recovery-assessment.test.mjs` | 14 pass · 0 fail · 1 skipped |
| `node --test test/d01-inspect-command.test.mjs test/d01-principal-boundary.test.mjs test/d01-linux-isolation-fixture.test.mjs` | **16 pass · 0 fail** (after FIX-02; before: 15/16) |

### Gate verification (live, not just code-read)

- `assertManagedMigrationGate()` throws `E_G_FENCE_NO_GO` unconditionally;
  `MANAGED_SCHEMA_MIGRATION_GATE.managedV2MutationAuthorized === false`.
- `windows-fs-provider-candidate.mjs` is imported only by its two test files —
  no lifecycle writer references it (import-graph check).
- `npm run build:native-windows` on Linux fails closed immediately:
  `E_WINDOWS_NATIVE_BUILD: Requires real Windows with MSVC and the Windows SDK
  (not WSL).` — DEFERRED, never simulated.

## PR base `de8faa19c6959c4188632e2e908909db485c3ef3` (separate worktree, same conditions)

- Command: `TMPDIR=/var/tmp/vcp-campaign-base npm test`
- Result: **677 tests · 602 pass · 62 fail · 13 skipped · EXIT=1**

## Failure-set comparison (evidence the branch introduces no regressions)

- Base failures: 62 unique test names.
- HEAD (+FIX-01, before FIX-02) failures: 63 — the only delta was
  `D-01 inspection CLI never exits 0 and does not mutate protected fixture`
  (branch-new test, fixed by FIX-02).
- HEAD (+FIX-01 + FIX-02) failures: 62 — **identical set to base** (`comm`
  diff empty both directions).
- The 62 pre-existing failures are the known `E_TEST_FIXTURE_UNSAFE`
  helper/caller-drift family (task/context/verify/git-review/doctor tests) plus
  D-03/D-06 contract tests — present on the base, untouched by this branch
  (the branch modifies no existing product code: 9139 insertions, 1 deletion).

## Not run / deferred (environment, not omissions)

- `npm run build:native-windows`, MSVC build, native exe tests, NTFS scratch
  tests: **DEFERRED** — no Windows host. `build:native-windows` refuses Linux
  explicitly (see above).
- `test:native-windows-candidate`: opt-in only, requires win32 — not executed.
- Power-loss durability: no rig — **UNVERIFIED** (source comments explicitly
  deny `FlushFileBuffers` as proof).
- GitHub `validate` workflow on this SHA: **cannot run** — account billing lock
  (see `phase8-ci-diagnosis.md`); zero steps executed, no code signal.
