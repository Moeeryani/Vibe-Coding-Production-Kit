# Stage 13 — Independent Test Report (Linux) — Round 3

**Verdict: GO (Linux only; see residual items)**

**Frozen HEAD tested:** `2126ab82935f0f228581db8e18b8fc9629e8af04`
(branch `freeze/stage13-acceptance-2126ab82-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**Acceptance issue:** https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/97
**Handoff doc:** `docs/STAGE13-INDEPENDENT-TEST-HANDOFF.md`

**Lineage:** `0915868a` (round 1: NO-GO, syntax defect) →
`f24248b3` (round 2: GO Linux, 1 test-fixture FAIL) →
`2126ab82` (this round: fixture fix only).

## Change verification

Diff `f24248b3..2126ab82`: exactly **1 file**
(`test/stage13-recovery-provenance.test.mjs`, +4/−1). The A13-24 fixture
ledger path changes `AGENTS.md` → `.github/owned.md` (making the immutable
WAL valid: a created directory must own a declared descendant), keeping the
missing directory and the expected `BLOCKED` result. No production code,
no validator, no security rule touched. Freeze branch points at the SHA.

## Environment

| Item | Value |
|---|---|
| Kernel | Linux 7.0.0-39-generic x86_64 |
| Node / npm | v24.20.0 / 10.9.4 |
| Git | 2.43.0 |
| C++ | g++ 13.3.0 (Ubuntu) |
| Fixture filesystem | btrfs (`TMPDIR=~/workspace/stage13-test/bigtmp`; see note) |
| UID/GID | 0:0 |
| Native helper SHA-256 | `355c5978aa4f23971ee151a379be9f3993a210f8953fd7ed3ff31fce510e9c38` (unchanged) |

**TMPDIR note (as in round 2):** the 512M `/tmp` tmpfs fills during the
full suite; the authoritative run used btrfs TMPDIR. One test
(`stage12-linux-legacy-fence` "enforce refuses without privilege") fails
only under TMPDIR (unprivileged legacy UID cannot traverse `/home/hatch`);
it passes 6/6 without the override. Environmental artifact, not product.

## Ordered gate results

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | up to date |
| `npm run build:native-linux` | 0 | built, warnings only (pre-existing) |
| `npm run check` (syntax) | 0 | PASS |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO-GO` |
| `npm run check:stage13-contract` | 0 | `STAGE13_SOURCE_CONSTRUCTION_PRESENT_ONLY` |
| `npm run test:stage13` | **0** | **59/59 PASS** (was 58/59) |
| `npm test` (full, TMPDIR=btrfs) | 1 | **635 tests: 562 pass, 72 fail, 1 skipped** |
| `npm run validate` | 1 | FAIL (cascades from suite failures) |
| `git status --short` (after) | — | clean |

## A13 acceptance matrix

| ID | Status | Evidence |
|---|---|---|
| A13-01 | **PASS** | `init --dry-run --json` exit 0; disposable tree byte-identical (zero writes); JSON with rooted intent, exact CLAIM actions (`executionAuthorized:false`), `humanDecisionRequired:true` |
| A13-02 | **PASS** | `--adopt` w/o `--yes`, `--yes` alone, stale fingerprint → all exit 1, zero writes |
| A13-03 | **PASS** | Symlink/junction/alias blocked before mutation |
| A13-04 | **PASS** | Adopt-lock bootstrap crash: cleanup vs forensic BLOCKED |
| A13-05 | **PASS** | Stale preview never becomes writer authority; post-lock drift refused |
| A13-06 | **PASS** | Backup/ledger proves old `.vcp` absence |
| A13-07 | **PASS** | CLAIM exact bytes/mode/dev-inode; kernel RENAME_NOREPLACE; racing contender cannot overwrite |
| A13-08 | **PASS** | Missing subtree staged atomically; every created directory inode verified |
| A13-09 | **PASS** | AGENTS.md preimage byte-for-byte; delimited ownership; no wholesale replacement |
| A13-10 | **PASS** (primitive) | RENAME_EXCHANGE retains both inodes; product application still policy-gated |
| A13-11 | **PASS** | v3 journal: immutable operation/root/consent ledger, correct phases |
| A13-12 | **PASS** | Interrupted apply: refuses destructive rollback; unknown replacements retained |
| A13-13 | **PASS** | Interrupted rollback idempotent; refuses inode impostors |
| A13-14 | **PASS** | Dead-owner proof + explicit approval required |
| A13-15 | **PASS** | Manifest + backup/inode proof; no guess-based lock stealing |
| A13-16 | **PASS** | Prejournal: operation-ID-only scan; foreign BLOCK; no auto-delete |
| A13-17 | **PASS** | Section rollback restores exact inode by exchange (primitive) |
| A13-18 | **PASS** | uint64 dev/ino lossless; rounded JSON integers rejected |
| A13-19 | **PASS** | Modes exact under umask; fsync files + both parents; EXDEV fail-closed |
| A13-20 | NOT RUN | No Windows host; Linux results are not Windows acceptance |
| A13-21 | DEFERRED | Policy: D-01=DEFERRED, G-FENCE=NO-GO (unchanged) |
| A13-22 | **PASS** | Tree clean; no GitHub/package/tag/main side effects |
| A13-23 | **PASS** | Missing claim without staging → BLOCKED |
| A13-24 | **PASS** | Fixture now valid; absent directory without staged/archive proof → BLOCKED |
| A13-25 | **PASS** | `lstat({bigint:true})` lossless; namespace change rejected |
| A13-26 | **PASS** | Pre-WAL failure keeps adopt lock; refuses takeover |
| A13-27 | **PASS** | Empty plan refused; no mutable state |
| A13-28 | **PASS** | Journal cleanup verifies ledger before clearing WAL |
| A13-29 | **PASS** | Archived residue blocks `inspect` and re-`init --adopt` |
| A13-30 | **PASS** | `adoption-recover` requires exact journal consent; hard-fenced by D-01 |

**Tallies:** PASS 28 · FAIL 0 · NOT RUN 1 · DEFERRED 1.
(Correction noted: round-2 base was 27 PASS, not 28; A13-24 now passes → 28.)

## Failure attribution (vs Stage 12 reference `61373569`)

Reference (same host): **576 tests, 505 pass, 70 fail.**

- **Pre-existing (17 files):** identical on both trees
  (`E_TEST_FIXTURE_UNSAFE` helper drift; D-01/G-FENCE NO-GO refusals =
  correct gate behavior). No regressions.
- **Environmental (1):** `stage12-linux-legacy-fence` — TMPDIR artifact
  only (6/6 pass without override).

**Zero new product failures.** The round-2 A13-24 fixture FAIL is resolved.

## Data-loss risk

None observed. Disposable fixtures throughout; frozen tree byte-identical
after testing; no real user repositories touched. Every destructive path
probed refused correctly (foreign content preserved, unknown inodes
blocked, no auto-deletion, crash-before-ack states forensic).

## Security posture (unchanged)

`D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`managedV2MutationAuthorized = false`. `adoption-recover`
policy-inoperative. Section-exchange product application still requires
independently verified writer-isolation proof. Windows durability: no
evidence. Power-loss: UNVERIFIED by construction (SIGKILL ≠ power-loss).

## Recommendation: GO (Linux)

All 30 acceptance items resolved on Linux: 28 PASS, 0 FAIL, 1 NOT RUN
(Windows — separate gate), 1 DEFERRED (D-01 — standing approval). The
round-1 syntax blocker and round-2 fixture defect are both fixed and
verified with zero production-code changes beyond the 1-line syntax fix.
**Residual:** Windows/NTFS independent acceptance; Stage 12 final;
writer isolation; D-01 — none relaxed by this report.

## Evidence files

- `01-npm-ci.log` … `09-validate.log` — per-command logs with exit codes
- `06-test-stage13.log` — focused suite (**59/59**)
- `07-npm-test.log` — full suite, TMPDIR=btrfs (635 tests)
- `stage13-failing-files.txt` — 18 files (17 pre-existing + 1 environmental)
- `SHA256SUMS`
