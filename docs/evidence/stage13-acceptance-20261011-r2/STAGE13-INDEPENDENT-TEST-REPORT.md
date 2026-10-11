# Stage 13 — Independent Test Report (Linux) — Round 2

**Verdict: GO (Linux only; see residual items)**

**Frozen HEAD tested:** `f24248b31fb854cdf7e7bb0961fbcdd60d6243cb`
(branch `freeze/stage13-acceptance-f24248b3-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**Acceptance issue:** https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/97
**Handoff doc:** `docs/STAGE13-INDEPENDENT-TEST-HANDOFF.md` (unchanged from round 1)
**Round 1:** NO-GO on `0915868a` — single syntax defect
(`lib/stage13-transaction.mjs:69`) disabled the entire CLI.

## Fix verification

GitHub commit `f24248b3`: exactly **1 file** changed
(`lib/stage13-transaction.mjs`), **1 line** (`refuse(` → `)refuse(`).
Diff `0915868a..f24248b3` confirms no test or security-rule changes.
`node --check` passes on the frozen tree.

## Environment

| Item | Value |
|---|---|
| Kernel | Linux 7.0.0-39-generic x86_64 |
| Node / npm | v24.20.0 / 10.9.4 |
| Git | 2.43.0 |
| C++ | g++ 13.3.0 (Ubuntu) |
| Fixture filesystem | btrfs (`~/workspace`; `TMPDIR` redirected here — see note) |
| Temp filesystem | tmpfs 512M (`/tmp`) |
| UID/GID | 0:0 |
| Native helper SHA-256 | `355c5978aa4f23971ee151a379be9f3993a210f8953fd7ed3ff31fce510e9c38` (unchanged — fix touched JS only) |

**TMPDIR note:** the 512M `/tmp` tmpfs fills during the full suite
(verified twice), contaminating results. The authoritative full-suite run
used `TMPDIR=~/workspace/stage13-test/bigtmp` (btrfs, 92G free). One test
(`stage12-linux-legacy-fence` "enforce refuses without privilege") fails
under TMPDIR because the unprivileged legacy UID cannot traverse
`/home/hatch`; it passes 6/6 without the override (verified in isolation).
Classified as test-environment artifact, not a product defect.

## Ordered gate results

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | up to date |
| `npm run build:native-linux` | 0 | built, warnings only (pre-existing) |
| `npm run check` (syntax) | 0 | **PASS** (was 1 in round 1) |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO-GO` |
| `npm run check:stage13-contract` | 0 | `STAGE13_SOURCE_CONSTRUCTION_PRESENT_ONLY` |
| `npm run test:stage13` | 1 | **59 tests: 58 pass, 1 fail** (was 15/25) |
| `npm test` (full, TMPDIR=btrfs) | 1 | **635 tests: 561 pass, 73 fail, 1 skipped** |
| `npm run validate` | 1 | FAIL (cascades from suite failures) |
| `git status --short` (after) | — | clean |

## A13 acceptance matrix

| ID | Status | Evidence |
|---|---|---|
| A13-01 | **PASS** | Direct CLI probe: `init --dry-run --json` exit 0, disposable tree byte-identical (zero writes verified), JSON carries rooted intent, exact CLAIM actions (`executionAuthorized:false`), `zeroWrite:true`, `humanDecisionRequired:true` |
| A13-02 | **PASS** | `--adopt` w/o `--yes`, `--yes` alone, stale `--confirm-adoption` → all exit 1, zero writes; unit tests pass |
| A13-03 | **PASS** | Symlink/junction/alias tests pass (never follows symlinked ancestor) |
| A13-04 | **PASS** | Bootstrap-crash tests pass (cleanup vs forensic BLOCKED) |
| A13-05 | **PASS** | Replan-contract 2/2: stale preview never becomes writer authority |
| A13-06 | **PASS** | Committed-orphan tests pass |
| A13-07 | **PASS** | CLAIM never overwrites (kernel RENAME_NOREPLACE) |
| A13-08 | **PASS** | Directory-ownership 4/4: staged ancestors, inode verification |
| A13-09 | **PASS** | Section materialization retains exact user preimage bytes |
| A13-10 | **PASS** (primitive) | Native RENAME_EXCHANGE 3/3 retains both inodes; product application remains policy-gated (no writer-isolation proof) |
| A13-11 | **PASS** | Journal accepts only authenticated ledger/phases |
| A13-12 | **PASS** | Interrupted apply: refuses destructive rollback |
| A13-13 | **PASS** | Interrupted rollback idempotent; refuses inode impostors |
| A13-14 | **PASS** | Recovery-lock: dead-owner proof required |
| A13-15 | **PASS** | Commit-then-crash: manifest + inode proof, no lock stealing |
| A13-16 | **PASS** | Prejournal staging: operation-ID-only scan, foreign BLOCK |
| A13-17 | **PASS** | Section exchange preview preserves both inode IDs |
| A13-18 | **PASS** | uint64 identities lossless beyond JS safe integers |
| A13-19 | **PASS** | Modes exact under umask; fsync both parents; EXDEV fail-closed |
| A13-20 | NOT RUN | No Windows host; Linux results are not Windows acceptance |
| A13-21 | DEFERRED | Policy: D-01=DEFERRED, G-FENCE=NO-GO (unchanged) |
| A13-22 | **PASS** | Frozen tree clean after full run; no GitHub/package/tag/main actions |
| A13-23 | **PASS** | Missing claim without staging → BLOCKED |
| A13-24 | **FAIL** | 1 test (see below) |
| A13-25 | **PASS** | `lstat({bigint:true})` lossless; namespace change rejected |
| A13-26 | **PASS** | Pre-WAL failure keeps adopt lock, refuses takeover |
| A13-27 | **PASS** | Empty plan refused, no mutable state |
| A13-28 | **PASS** | Journal cleanup verifies ledger before clearing WAL |
| A13-29 | **PASS** | Archived residue blocks `inspect` and re-`init --adopt` |
| A13-30 | **PASS** | `adoption-recover` requires exact journal consent; hard-fenced by D-01 |

**Tallies:** PASS 28 · FAIL 1 · NOT RUN 1 · DEFERRED 1.

## The single FAIL: A13-24 test-fixture defect (not a product defect)

`test/stage13-recovery-provenance.test.mjs:73`
"directory proof never treats absent namespace as safely removed":
the fixture declares created-directory `.github` with **no transaction
file under it**. `validateStage13Transaction` (line 87-88) correctly throws
`E_STAGE13_UNCLAIMED_DIRECTORY` — the fail-closed rule that a created
directory must be claimed by a file. The test expects the inspector to
return BLOCKED, but validation (correctly) rejects the impossible fixture
first. The sibling test with a valid fixture (`.github/owned.md`) passes.
**Recommendation:** fix the test fixture (add a file under `.github/`);
no product change indicated. The validator's strictness is the safe
behavior.

## Failure attribution (vs Stage 12 reference `61373569`)

Reference (same host, helper built): **576 tests, 505 pass, 70 fail.**

- **Pre-existing (17 files):** identical failure sets on both trees
  (`E_TEST_FIXTURE_UNSAFE` helper drift, D-01/G-FENCE NO-GO refusals which
  are correct gate behavior). No regressions.
- **New, environmental (1):** `stage12-linux-legacy-fence` — TMPDIR
  artifact only; 6/6 pass without override.
- **New, test defect (1):** `stage13-recovery-provenance` A13-24 fixture
  (above). No product safety gap.

## Data-loss risk

None observed. All probes used disposable fixtures; the frozen tree is
byte-identical after testing; no real user repositories touched. The CLI
now executes write paths, but every destructive path tested refused
correctly (foreign content preserved, unknown inodes blocked, no
auto-deletion).

## Security posture (unchanged)

`D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`managedV2MutationAuthorized = false`. `adoption-recover` remains
policy-inoperative. Section exchange product application still requires
independently verified writer-isolation proof. Windows durability: no
evidence, no GO. Power-loss: UNVERIFIED by construction (SIGKILL ≠
power-loss).

## Recommendation: GO (Linux)

The round-1 blocker is fixed and verified (1-line diff, syntax passes,
CLI fully functional, 58/59 stage13 tests green). The single FAIL is a
test-fixture bug with the validator behaving correctly fail-closed.
**Residual items (not blockers for Linux acceptance):** fix the A13-24
test fixture; Windows acceptance remains a separate gate; D-01 stays
DEFERRED per standing approval.

## Evidence files

- `01-npm-ci.log` … `09-validate.log` — per-command logs with exit codes
- `06-test-stage13.log` — focused suite (59 tests)
- `07-npm-test.log` — full suite, TMPDIR=btrfs (635 tests)
- `a1301-dryrun.json` — A13-01 dry-run output; `a1301-dryrun.err`
- `stage13-failing-files.txt` — 19 files (17 pre-existing + 2 new)
- `SHA256SUMS`
