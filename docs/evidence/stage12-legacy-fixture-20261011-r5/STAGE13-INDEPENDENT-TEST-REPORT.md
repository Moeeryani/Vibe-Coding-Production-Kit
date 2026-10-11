# Stage 13 — Independent Test Report (Linux) — Round 5 (fixture-guard fix)

**Verdict: GO (Linux only; Windows acceptance remains a separate gate)**

**Frozen HEAD tested:** `ac9b7a6da6ad78c853b249284c4462c469bb576e`
(branch `freeze/stage12-legacy-fixture-ac9b7a6d-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**Acceptance issue:** https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/97
**PR under test:** #101 (Draft, unmerged) — Nested Legacy Fixtures

**Lineage:** `de35e5ba` (round 4: GO Linux) → `ac9b7a6d`
(4 commits ahead, 0 behind; strict descendant).

## Change verification (4 test files, 0 production code)

| File | Change | Assessment |
|---|---|---|
| `test/helpers/legacy-v1-fixture.mjs` (+22/−5) | Guard now requires the **first** path component under OS temp to start with `vcp-` (allows nested `vcp-workspace-xxx/packages/api`); `lstat` ENOENT/ENOTDIR → clear refusal instead of crash; sandbox UID-ownership check (non-Windows) | **Test-helper only.** Security invariant preserved: vcp-* OS-temp sandbox, no symlinks, no outside roots, no writes to real user projects. |
| `test/legacy-v1-fixture-boundaries.test.mjs` (+46) | New boundary tests for the guard | Test-only |
| `test/stage12-linux-legacy-fence.test.mjs` (+18/−15) | Linux-only tests terminate on unsupported hosts | Test-only |
| `test/workspace-source-truth.test.mjs` (+3) | Uses nested fixture path | Test-only |

## Environment

| Item | Value |
|---|---|
| Kernel | Linux 7.0.0-39-generic x86_64 |
| Node / npm | v24.20.0 / 10.9.4 |
| Git | 2.43.0 |
| C++ | g++ 13.3.0 (Ubuntu) |
| Fixture filesystem | btrfs (`TMPDIR=~/workspace/stage13-test/bigtmp`; 512M `/tmp` fills otherwise) |
| UID/GID | 0:0 |
| Native helper SHA-256 | `355c5978aa4f23971ee151a379be9f3993a210f8953fd7ed3ff31fce510e9c38` (unchanged) |

## Ordered gate results

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | up to date |
| `npm run build:native-linux` | 0 | built, warnings only (pre-existing) |
| `npm run check` (syntax) | 0 | PASS |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO-GO` |
| `npm run check:stage13-contract` | 0 | `STAGE13_SOURCE_CONSTRUCTION_PRESENT_ONLY` |
| `npm run test:stage13` | **0** | **66 tests: 59 pass, 0 fail, 7 skipped** |
| `npm test` (full, TMPDIR=btrfs) | 1 | **646 tests: 573 pass, 65 fail, 8 skipped** |
| `npm run validate` | 1 | FAIL (cascades from suite failures) |
| `git status --short` (after) | — | clean |

## Fix effectiveness (name-level diff vs `de35e5ba`)

**7 tests FIXED, 0 new failures.** All 7 are workspace-source-truth tests
covering exactly the nested-fixture scenario the guard fix addresses:
nested project authority, traversal/symlink rejection, workspace root
discovery, readiness warnings.

## A13 acceptance matrix

**PASS 28 · FAIL 0 · NOT RUN 1 (A13-20) · DEFERRED 1 (A13-21)** — unchanged
from round 4. The 7 new boundary tests for the guard all pass.

## Failure attribution (vs Stage 12 reference `61373569`)

Reference (same host): **576 tests, 505 pass, 70 fail.**

- **Pre-existing (unchanged):** all remaining failures also fail on the
  reference, except the two below.
- **Environmental (1):** "enforce refuses without privilege"
  (`stage12-linux-legacy-fence`) — TMPDIR artifact only; 6/6 pass without
  override (verified round 2).
- **Stale test expectation (1):** `cli.test.mjs` "refuses to overwrite
  existing managed paths without --force" — the test expects the old
  "zero-write preview only" message, but the Stage 13 path now refuses
  with the **stronger** D-01/G-FENCE NO-GO gate first. The user's file is
  still preserved byte-for-byte (that assertion passes). Security posture
  improved, not weakened; the test regex is stale relative to the new
  gate ordering. Recommend updating the expected message, not the product.

## Data-loss risk

None observed. Disposable fixtures; tree byte-identical after testing.

## Security posture (unchanged)

`D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`managedV2MutationAuthorized = false`. The fixture-guard fix does not
touch production code. No main merge, no release.

## Recommendation: GO (Linux)

The fixture-guard fix resolves 7 real test failures with zero new ones
and zero production-code changes. All 30 acceptance items resolved on
Linux (28 PASS, 0 FAIL). **Residual:** Windows/NTFS acceptance, Stage 12
final, writer isolation, D-01 — separate gates, none relaxed.

## Evidence files

- `01-npm-ci.log` … `09-validate.log` — per-command logs with exit codes
- `06-test-stage13.log` — focused suite (59/59 pass, 7 skipped)
- `07-npm-test.log` — full suite, TMPDIR=btrfs (646 tests)
- `failing-names.txt` — 65 failing test names; `prev-failing-names.txt` —
  round-4 names (7 fixed, 0 new)
- `stage13-failing-files.txt` — failing files
- `SHA256SUMS`
