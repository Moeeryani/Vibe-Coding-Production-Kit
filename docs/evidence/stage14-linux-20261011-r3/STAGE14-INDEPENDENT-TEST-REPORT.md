# Stage 14 — Independent Test Report (Linux) — Round 3 (validator fix)

**Verdict: GO (Linux build acceptance; product acceptance remains gated)**

**Frozen HEAD tested:** `d6be7420b21484ca33c9c9837fbcd781ebaa01df`
(branch `freeze/stage14-validator-d6be7420-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**PR:** #106 (Draft, unmerged) · **Issue:** #103
**Reference SHA:** `3f3781001e033b503e40fd3e8eca5cefc2690d29`

## Fix verification

PR #106 = exactly **3 files**:
1. `scripts/validate-framework.mjs` (4+/2-) — Stage 14 docs moved from
   general `requiredFiles` to provider-only `providerStage14RequiredFiles`.
   Provider source stays strict; historical fixtures not forced.
2. `test/stage14-legacy-validator.test.mjs` (new, 24 lines) — seeds a
   legacy v1 fixture, asserts the new docs are absent, runs the validator
   in-fixture, expects "Framework validation passed".
3. `package.json` (1/1) — new test added to `test:stage14`; version stays
   `0.9.3`.

Fix reviewed as sound: no validator weakening for provider source.
Frozen tree **not** modified by testing.

## Environment

Linux 7.0.0-39-generic x86_64 · Node v24.20.0 · npm 10.9.4 · Git 2.43.0 ·
btrfs fixtures · native helper SHA-256 `355c5978…` (unchanged).

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
| `npm run test:stage13` | 0 | **66 tests: 59 pass, 0 fail, 7 skipped** |
| `npm run test:stage14` | 0 | **25 tests: 25 pass, 0 fail** (incl. new legacy-validator) |
| `npm test` (full) | 1 | **671 tests: 599 pass, 64 fail, 8 skipped** |
| `npm run validate` | 1 | FAIL (cascades) |
| `npm run pack:check` | 0 | PASS (318 files) |

## A14 acceptance matrix

| ID | Status | Evidence |
|---|---|---|
| A14-01 – A14-12 | **PASS** | All focused tests pass; CLI functional |
| A14-13 | PARTIAL | Dogfood preview built; real adoption pending |
| A14-14 | REVIEW PENDING | Docs aligned |
| A14-15 | PARTIAL | Linux exact-SHA: this report. Windows/NTFS: separate. |
| A14-16 | **NO-GO** | Checkpoint A, Stage 12 final, D-01, Windows durability outstanding |

## Failure attribution (name-level vs `3f378100`)

- **0 new failures.**
- **1 fixed:** "historical v1 fixture includes the original core framework
  and GitHub assets" — the validator DEFECT from round 2 is resolved.
- All 64 remaining failures pre-existing (D-01/G-FENCE refusals = correct
  gate behavior; fixture-guard; known TMPDIR artifact; etc.).

## Security

`D-01=DEFERRED`, `G-FENCE=NO-GO`, `managedV2MutationAuthorized=false`,
npm 0.9.3, PR #106 Draft unmerged, main unchanged. No user repos touched;
tree byte-identical after testing.

## Recommendation

**GO for Linux build acceptance** of Stage 14 on `d6be7420`: the validator
compatibility defect is fixed with a sound regression test, all focused
suites pass, zero new failures. **Product acceptance remains NO-GO**
pending Checkpoint A (brownfield apply + recovery proof), Windows/NTFS,
Stage 12 final, and D-01.

## Evidence files

- `01-npm-ci.log` … `12-pack-check.log` — per-command logs with exit codes
- `08-test-stage13.log`, `09-test-stage14.log`, `10-npm-test.log`
- `failing-names.txt` — 64 failing names
- `SHA256SUMS`
