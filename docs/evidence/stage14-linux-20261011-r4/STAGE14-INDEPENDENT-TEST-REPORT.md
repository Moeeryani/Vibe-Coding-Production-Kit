# Stage 14 — Independent Test Report (Linux) — Round 4

**Verdict: GO (Linux build acceptance; product acceptance remains gated)**

**Frozen HEAD tested:** `de8faa19c6959c4188632e2e908909db485c3ef3`
(branch `freeze/stage14-review-de8faa19-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**PR:** #107 (Draft, unmerged) · **Issue:** #103
**Reference SHA:** `d6be7420b21484ca33c9c9837fbcd781ebaa01df`
(9 commits behind; strict ancestor)

## Environment

| Item | Value |
|---|---|
| Kernel | Linux 7.0.0-39-generic x86_64 |
| Node / npm | v24.20.0 / 10.9.4 |
| Git | 2.43.0 |
| Disk | /dev/mapper/rv 100G, 91G free |
| Fixtures | btrfs (`TMPDIR=~/workspace/stage13-test/bigtmp`) |
| UID/GID | 0:0 |

Posture: npm 0.9.3 · `managedV2MutationAuthorized=false` ·
`D-01=DEFERRED` · `G-FENCE=NO-GO` · main `8ccb276545fd` unchanged.

## Ordered gate results

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | up to date |
| `npm run build:native-linux` | 0 | built |
| `node scripts/validate-framework.mjs` | 0 | PASS |
| `npm run check` | 0 | PASS |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO-GO` |
| `npm run check:stage13-contract` | 0 | PASS |
| `npm run check:stage14-contract` | 0 | PASS |
| `npm run doctor` | 0 | PASS |
| `npm run test:cli` | 1 | **16 tests: 13 pass, 3 fail** (pre-existing task-generator) |
| `npm run test:stage13` | 0 | **71 tests: 59 pass, 0 fail, 12 skipped** |
| `npm run test:stage14` | 0 | **26 tests: 26 pass, 0 fail** |
| `node --test test/legacy-v1-fixture-boundaries.test.mjs` | 0 | **9/9 pass** |
| `node --test test/stage14-legacy-validator.test.mjs` | 0 | **2/2 pass** |
| `npm test` (full) | 1 | **677 tests: 601 pass, 63 fail, 13 skipped** |
| `npm run validate` | 1 | FAIL (cascades) |
| `npm run pack:check` | 0 | PASS (330 files) |

## Fix verification

### RISK-01 — Provider validator fail-open → **FIXED**

**Before:** `providerStage14Present` derived from
`existsNonEmpty('lib/consumer-asset-retirement-plan.mjs')` — deleting
that file silently disabled Stage 14 requirements.

**After:** identity anchored in `package.json` (`name` +
`bin.vcp`) or `bin/vibe-coding-production.mjs` — independent of the
required inventory.

**Empirical proof:** isolated copy of provider source; deleted
`lib/consumer-asset-retirement-plan.mjs`; validator **still reports**
`ERROR: required file missing or empty: lib/consumer-asset-retirement-plan.mjs`
(fail-closed). Real checkout untouched.

### COVERAGE-02 — Negative controls → **PASS**

New test "Stage14 provider validator refuses missing required docs and
self-sentinel module" (26/26 in focused suite): isolated provider copy,
positive baseline, then deletion of each required file
(2 docs, retirement-plan, asset-catalog) → each refusal verified, then
restored → passes again. Confirmed the test operates on the isolated
copy only.

### W-5 — ENOTDIR → E_VCP_PATH → **FIXED**

`test/helpers/legacy-v1-fixture.mjs`: `lstat` `ENOTDIR` now routes
through `resolveProjectPath` for unified `E_VCP_PATH`. Test
"preflight refuses blocked ancestor before writing any template or vcp
state" expects `{code:'E_VCP_PATH'}` and **passes** (was failing on
d6be7420). Refusal remains real; no test-expectation weakening.

### W-6 — Windows delegates → **JUSTIFIED SKIPS**

5 new Windows-only tests in `test/stage13-windows-ntfs.test.mjs` skip
on Linux via `windowsOnly(t)` with explicit reason. Stage 13 skips:
7 → 12. No Linux regression; full-suite skipped: 8 → 13.

## Failure attribution (name-level vs `d6be7420`)

- **0 new failures.**
- **1 fixed:** "preflight refuses blocked ancestor…" (W-5).
- All 63 remaining failures pre-existing (D-01/G-FENCE refusals =
  correct; fixture-guard; known TMPDIR artifact; 3 task-generator CLI).

## Pack inventory

330 files (was 318). Only `docs/STAGE14-ACCEPTANCE-MATRIX.md` and
`scripts/validate-framework.mjs` grew; integrity hash changed as
expected. No files added/removed.

## Security

`D-01=DEFERRED`, `G-FENCE=NO-GO`, `managedV2MutationAuthorized=false`.
`asset-plan` probed directly: `readOnly:true`,
`executionAuthorized:false`. No user repos touched; tree byte-identical.

## Recommendation

**GO for Linux build acceptance** on `de8faa19`: RISK-01, COVERAGE-02,
W-5, W-6 all verified; zero new failures; one fixed. **Product
acceptance remains NO-GO** pending Checkpoint A, Windows/NTFS,
Stage 12 final, D-01.

## Evidence files

- `01-npm-ci.log` … `16-pack-check.log` — per-command logs with exit codes
- `10-test-stage13.log`, `11-test-stage14.log`, `14-npm-test.log`
- `failing-names.txt` — 63 failing names
- `SHA256SUMS`
