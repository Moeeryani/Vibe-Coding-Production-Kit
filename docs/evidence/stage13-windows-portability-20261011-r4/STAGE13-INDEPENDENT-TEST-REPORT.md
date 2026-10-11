# Stage 13 — Independent Test Report (Linux) — Round 4 (Windows conformance candidate)

**Verdict: GO (Linux only; Windows acceptance remains a separate gate)**

**Frozen HEAD tested:** `de35e5ba9917ffcfaec64fb83768b2a090b2f642`
(branch `freeze/stage13-windows-portability-de35e5ba-20261011`, detached
checkout, working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**Acceptance issue:** https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/97
**PR under test:** #100 (Draft, unmerged) — Windows conformance

**Lineage:** `2126ab82` (round 3: GO Linux, 28/30) → `de35e5ba`
(9 commits ahead, 0 behind; strict descendant).

## Change verification (9 files)

| File | Change | Safety assessment |
|---|---|---|
| `lib/stage13-recovery-lock.mjs` (+8/−0) | **Production change:** early return on `process.platform==='win32'` in `planStage13RecoveryLock` → frozen `BLOCKED` with `E_STAGE13_NATIVE_PROVIDER_UNAVAILABLE`, `readOnly:true`, `writeAuthorized:false` | **Fail-closed diagnostic.** Never grants authority; Linux path untouched (platform-gated). Strengthens refusal explicitness. |
| `package.json` (+1/−1) | Adds `test/stage13-windows-ntfs.test.mjs` to `test:stage13` | Build config only |
| `test/stage13-windows-ntfs.test.mjs` (+130, new) | 7 native Windows tests (junctions, reparse points, NTFS volume check) | Skip cleanly on Linux with explicit "no Windows acceptance" message |
| 5 test files (W-2 etc.) | Portable `os.tmpdir()` paths; win32 BLOCKED-diagnostic branches | Test-only; Linux assertions unchanged |
| `test/stage13-recovery-lock.test.mjs` (+21) | win32 branches assert BLOCKED + `writeAuthorized:false` | Test-only |

The A13-24 fixture fix from `2126ab82` is preserved (verified in tree).

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
| `npm run test:stage13` | **0** | **66 tests: 59 pass, 0 fail, 7 skipped** (7 = new Windows tests, correct skip) |
| `npm test` (full, TMPDIR=btrfs) | 1 | **642 tests: 562 pass, 72 fail, 8 skipped** |
| `npm run validate` | 1 | FAIL (cascades from suite failures) |
| `git status --short` (after) | — | clean |

## A13 acceptance matrix

**PASS 28 · FAIL 0 · NOT RUN 1 (A13-20) · DEFERRED 1 (A13-21)** — identical
to round 3, with A13-24 now confirmed in both focused and full suite runs.
The 7 new W-4 Windows tests skip on Linux by design; they assert nothing
about Windows and must not be read as Windows evidence.

## Failure attribution (vs Stage 12 reference `61373569`)

Reference (same host): **576 tests, 505 pass, 70 fail.**

- **Pre-existing (17 files):** identical on both trees. No regressions.
- **Environmental (1):** `stage12-linux-legacy-fence` — TMPDIR artifact
  only (6/6 pass without override, verified round 2).

**Zero new product failures.** The production diagnostic change introduces
no Linux behavior change (verified: platform-gated, additive-only).

## Windows-specific notes (from Linux)

- W-1: A13-24 fix retained; validator **not** weakened (confirmed in diff).
- W-2: hardcoded `/tmp` path → `os.tmpdir()` (portable).
- W-3(a): on win32, `planStage13RecoveryLock` now returns explicit
  `BLOCKED/E_STAGE13_NATIVE_PROVIDER_UNAVAILABLE` instead of attempting
  Linux-native operations. On Linux this branch is dead code.
- W-3(b): left open per maintainer (insufficient repro) — not evaluated here.
- B-1: **unsolved** — no native Windows provider for safe writes exists;
  Windows acceptance cannot be GO on this SHA regardless of Linux results.

## Data-loss risk

None observed. Disposable fixtures; tree byte-identical after testing.

## Security posture (unchanged)

`D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`managedV2MutationAuthorized = false`. No main merge, no release, no
published package change.

## Recommendation: GO (Linux)

The Windows-conformance candidate passes Linux acceptance with zero new
failures; the single production change is a fail-closed diagnostic that
cannot weaken Linux behavior. **Windows acceptance remains NO-GO**
(B-1 unsolved; W-4 tests require a native Windows host; this Linux run
proves nothing about NTFS). Stage 13 final, Stage 12 final, writer
isolation, and D-01 remain separate gates.

## Evidence files

- `01-npm-ci.log` … `09-validate.log` — per-command logs with exit codes
- `06-test-stage13.log` — focused suite (**59/59 pass, 7 skipped**)
- `07-npm-test.log` — full suite, TMPDIR=btrfs (642 tests)
- `stage13-failing-files.txt` — 18 files (17 pre-existing + 1 environmental)
- `SHA256SUMS`
