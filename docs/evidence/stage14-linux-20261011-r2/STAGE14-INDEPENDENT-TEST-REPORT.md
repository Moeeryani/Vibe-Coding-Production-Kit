# Stage 14 — Independent Test Report (Linux) — Round 2 (syntax fix)

**Verdict: GO (Linux build acceptance; product acceptance remains gated)**

**Frozen HEAD tested:** `3f3781001e033b503e40fd3e8eca5cefc2690d29`
(branch `freeze/stage14-syntax-3f378100-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**PR:** #105 (Draft, unmerged) · **Issue:** #103
**Reference SHA:** `98cb12e9a68129ba35f551195241ce426d6af802`

## Fix verification

Commit `3f37810`: exactly **1 file** (`lib/asset-catalog.mjs`), 1 line
(`...has(path))))` → `...has(path)))))`). No test, security, or logic
changes. `node --check` passes; full-tree sweep confirms no other broken
module. Frozen tree **not** modified by testing.

## Environment

| Item | Value |
|---|---|
| Kernel | Linux 7.0.0-39-generic x86_64 |
| Node / npm | v24.20.0 / 10.9.4 |
| Git | 2.43.0 |
| C++ | g++ 13.3.0 |
| Fixtures | btrfs (`TMPDIR=~/workspace/stage13-test/bigtmp`) |
| UID/GID | 0:0 |
| Native helper SHA-256 | `355c5978…` (unchanged) |

## Ordered gate results

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | up to date |
| `npm run build:native-linux` | 0 | built |
| `node scripts/validate-framework.mjs` | 0 | PASS |
| `npm run check` | 0 | **PASS** (was 1) |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO-GO` |
| `npm run check:stage13-contract` | 0 | PASS |
| `npm run check:stage14-contract` | 0 | **PASS** (was 1) |
| `npm run test:stage13` | 0 | **66 tests: 59 pass, 0 fail, 7 skipped** |
| `npm run test:stage14` | 0 | **24 tests: 24 pass, 0 fail** |
| `npm test` (full) | 1 | **670 tests: 597 pass, 65 fail, 8 skipped** |
| `npm run validate` | 1 | FAIL (cascades) |
| `npm run pack:check` | 0 | PASS (318 files) |

## A14 acceptance matrix

| ID | Status | Evidence |
|---|---|---|
| A14-01 | **PASS** | 4-class catalog tests pass; dangerous paths rejected |
| A14-02 | **PASS** | Legacy/safe/minimal surface semantics hold |
| A14-03 | **PASS** | Brownfield minimal never invents authority |
| A14-04 | **PASS** | Legacy prompts/validators/CI in npm package (pack:check) |
| A14-05 | **PASS** | Safe surfaces exclude framework validators/source workflow |
| A14-06 | **PASS** | Prompt override priority + packaged fallback; symlink refused |
| A14-07 | **PASS** | Concise routing; no user-file clobber |
| A14-08 | **PASS** | Doctor asset health agrees with manifest; no false "missing" |
| A14-09 | **PASS** | `asset-plan` verified directly: `readOnly:true`, `executionAuthorized:false`; refuses force/run/yes |
| A14-10 | **PASS** | No apply function; D-01 gate intact and blocking |
| A14-11 | **PASS** | `validate-framework.mjs` passes; release package retains legacy |
| A14-12 | **PASS** | Negative portable path/security/provenance fixtures pass |
| A14-13 | PARTIAL | Dogfood preview built; real adoption pending (per matrix) |
| A14-14 | REVIEW PENDING | Docs aligned (per matrix) |
| A14-15 | PARTIAL | Linux exact-SHA execution: this report. Windows/NTFS: separate. |
| A14-16 | **NO-GO** | Checkpoint A, Stage 12/13 final, D-01, Windows durability outstanding |

## Failure attribution (name-level vs `98cb12e9`)

Reference: **646 tests, 574 pass, 64 fail.** This SHA: **670 tests
(+24 new Stage 14), 597 pass, 65 fail.**

- **93 syntax-error failures FIXED** by the one-paren fix.
- **1 new failure**: `cli.test.mjs` "historical v1 fixture includes the
  original core framework" — **DEFECT (test/validator contract
  mismatch)**: `validate-framework.mjs` (hardened in Stage 14 commits
  `9b9fbed`/`212e373`) now requires `docs/CONSUMER-ASSET-SEPARATION.md`
  and `docs/STAGE14-ACCEPTANCE-MATRIX.md`, but the historical v1 fixture
  predates them. Not a security issue; recommend either fixture update or
  a historical mode in the validator. Does not weaken any gate.
- All other failures pre-existing (D-01/G-FENCE refusals = correct;
  fixture-guard; etc.) or the known TMPDIR artifact.

## Security

`D-01=DEFERRED`, `G-FENCE=NO-GO`, `managedV2MutationAuthorized=false`,
npm 0.9.3, PR #105 Draft unmerged, main unchanged. `asset-plan` probed
directly: strictly read-only, refuses mutation flags. No user repos
touched; tree byte-identical after testing.

## Recommendation

**GO for Linux build acceptance** of Stage 14 on `3f37810`: the syntax
blocker is fixed, all Stage 14 unit tests pass (24/24), the CLI is
functional, and the A14 matrix is verifiable. **Product acceptance
remains NO-GO** pending Checkpoint A (brownfield apply + recovery proof),
Windows/NTFS, Stage 12 final, and D-01 — none relaxed by this report.

## Evidence files

- `01-npm-ci.log` … `12-pack-check.log` — per-command logs with exit codes
- `08-test-stage13.log`, `09-test-stage14.log`, `10-npm-test.log`
- `failing-names.txt` — 65 failing names (name-level diff vs reference)
- `SHA256SUMS`
