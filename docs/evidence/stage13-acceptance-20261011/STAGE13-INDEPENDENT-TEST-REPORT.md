# Stage 13 — Independent Test Report (Linux)

**Verdict: NO-GO**

**Frozen HEAD tested:** `0915868a1450fa446574021f2aeabf3c12b452f1`
(branch `freeze/stage13-acceptance-0915868a-20261011`, detached checkout,
working tree clean before and after all tests)
**Test date (UTC):** 2026-10-11
**Acceptance issue:** https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/97
**Handoff doc:** `docs/STAGE13-INDEPENDENT-TEST-HANDOFF.md` (frozen tree)

## Environment

| Item | Value |
|---|---|
| Kernel | Linux 7.0.0-39-generic x86_64 |
| Node / npm | v24.20.0 / 10.9.4 |
| Git | 2.43.0 |
| C++ | g++ 13.3.0 (Ubuntu) |
| Fixture filesystem | btrfs (`~/workspace`) |
| Temp filesystem | tmpfs 512M (`/tmp`) |
| UID/GID | 0:0 |
| Native helper SHA-256 | `355c5978aa4f23971ee151a379be9f3993a210f8953fd7ed3ff31fce510e9c38` (built from frozen source via `npm run build:native-linux`) |

## Ordered gate results

| Command | Exit | Result |
|---|---|---|
| `npm ci --no-audit --no-fund` | 0 | up to date |
| `npm run build:native-linux` | 0 | built, warnings only (pre-existing `write` unused-result) |
| `npm run check` (syntax) | **1** | **FAIL — `lib/stage13-transaction.mjs:69`: `SyntaxError: Unexpected identifier 'refuse'`** |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO-GO` |
| `npm run check:stage13-contract` | 0 | `STAGE13_SOURCE_CONSTRUCTION_PRESENT_ONLY` |
| `npm run test:stage13` | **1** | **25 tests: 15 pass, 10 fail** (all 10 fail at file load: same SyntaxError) |
| `npm test` (full) | **1** | **582 tests: 454 pass, 127 fail, 1 skipped** |
| `npm run validate` | **1** | FAIL (cascades from syntax + test failures) |
| `git status --short` (after) | — | clean — tests wrote nothing to the frozen tree |

## The blocking defect

**One syntax error disables the entire Stage 13 CLI and most of its tests.**

`lib/stage13-transaction.mjs:69`:
```js
         !/^[0-9]{1,22}$/.test(item.originalIno??'')))
      refuse('E_STAGE13_TRANSACTION_ITEM');
```
The `if(` opened at line 49 is never closed: the line must read
`)refuse('E_STAGE13_TRANSACTION_ITEM');` (one additional `)`), matching the
identical pattern at line 46 (`...)refuse('E_STAGE13_TRANSACTION_FORMAT');`).
Verified: a copy with this single-character fix passes `node --check`.

**Blast radius (all verified by actual execution):**
- Every CLI invocation crashes: `doctor`, `init --dry-run`, `--help`,
  `fitness`, `ready`, `update` — **all exit 1** with the SyntaxError.
  The CLI is 100% non-functional on the frozen HEAD.
- 10 of 14 `test:stage13` files cannot load (directly or transitively).
- 8 lib modules import the broken module, including `stage13-apply.mjs`
  and `stage13-finalize.mjs` (the core apply path).
- 22 test files fail in Stage 13 that pass on the Stage 12 reference
  `61373569fd50a5a3a153e39bfcd721a94b4f22d2` — **every one** traces to
  this single defect (verified per-file; see `failure-attribution.md`).
- A full-tree `node --check` sweep finds no other broken module.

Per instructions the frozen tree was **not** modified. Proposed fix above
is for maintainer review only.

## A13 acceptance matrix

| ID | Status | Evidence / note |
|---|---|---|
| A13-01 | **FAIL** | `init --dry-run --json` exits 1 (SyntaxError). Zero writes hold vacuously (verified: disposable tree byte-identical after crash), but no rooted intent / proposed actions are produced. |
| A13-02 | NOT RUN | `test/stage13-init-gate.test.mjs` cannot load (SyntaxError) |
| A13-03 | NOT RUN | same file blocked |
| A13-04 | NOT RUN | `test/stage13-bootstrap-crash.test.mjs` cannot load |
| A13-05 | PASS (partial) | 2/2 `test:stage13-replan-contract.test.mjs` pass: stale preview never becomes writer authority; post-lock drift refused |
| A13-06 | NOT RUN | recovery tests cannot load |
| A13-07 | PASS | `stage13 CLAIM never overwrites a pre-existing path` passes (kernel RENAME_NOREPLACE) |
| A13-08 | PASS | 4/4 `test:stage13-directory-ownership.test.mjs` pass: staged ancestors, inode verification, symlink-ancestor refusal |
| A13-09 | PASS (partial) | `materializes section while retaining exact user preimage bytes` passes |
| A13-10 | PASS (primitive) | 3/3 `test:stage13-native-exchange.test.mjs` pass: RENAME_EXCHANGE retains both inodes; never fabricates. Product application remains unauthorized without writer-isolation proof (policy, unchanged). |
| A13-11 | NOT RUN | `test/stage13-transaction-recovery.test.mjs` cannot load |
| A13-12 | NOT RUN | blocked |
| A13-13 | NOT RUN | blocked |
| A13-14 | NOT RUN | blocked |
| A13-15 | NOT RUN | blocked |
| A13-16 | NOT RUN | blocked |
| A13-17 | NOT RUN | `test/stage13-section-exchange.test.mjs` cannot load |
| A13-18 | NOT RUN | `test/stage13-nested-recovery.test.mjs` cannot load |
| A13-19 | PASS | `Linux native staged file and directory modes are exact under umask` passes; EXDEV fail-closed covered by Stage 12 suite |
| A13-20 | NOT RUN | No Windows host in this environment; Linux results are not Windows acceptance |
| A13-21 | DEFERRED | Policy: D-01=DEFERRED, G-FENCE=NO-GO; no old-CLI proof attempted here |
| A13-22 | PASS | No side effects observed: frozen tree clean after full run; no GitHub/package/tag/main actions taken |
| A13-23 | NOT RUN | `test/stage13-recovery-provenance.test.mjs` cannot load |
| A13-24 | NOT RUN | blocked |
| A13-25 | NOT RUN | blocked |
| A13-26 | NOT RUN | blocked |
| A13-27 | NOT RUN | blocked |
| A13-28 | NOT RUN | blocked |
| A13-29 | NOT RUN | blocked |
| A13-30 | NOT RUN | blocked (`adoption-recover` CLI inoperative by policy in any case) |

**Tallies:** PASS 6 (4 partial/primitive) · FAIL 1 · NOT RUN 22 · DEFERRED 1.

Note on injected faults: SIGKILL/fault-injection runs were not executed
beyond the unit-level crash tests that pass, because the apply/recovery
code paths under test cannot load. No power-loss claims are made.

## Failure attribution (Stage 13 vs Stage 12 reference)

Reference: clean checkout of `61373569fd50a5a3a153e39bfcd721a94b4f22d2`
(same host, same procedure, native helper built): **576 tests, 505 pass,
70 fail, 1 skipped.**

- **New Stage 13 defect:** 1 root cause → 22 newly-failing test files
  (10 stage13 files unloadable + 12 CLI-invoking files crashing). All
  verified per-file to terminate in the `stage13-transaction.mjs`
  SyntaxError. List: `evidence/stage13-new-failures.txt`.
- **Pre-existing Stage 12:** 17 files / 70 tests fail identically on both
  trees (incl. known `E_TEST_FIXTURE_UNSAFE` helper drift and
  D-01/G-FENCE NO-GO refusals, which are correct gate behavior).
  Nothing previously passing regressed except via the syntax defect.
- **Test environment:** `/tmp` (512M tmpfs) filled during a reference
  re-run; cleaned; Stage 13 results were captured before and are unaffected.

## Data-loss risk assessment

- **Direct risk on the frozen HEAD: none observable**, because the CLI
  cannot execute any write path at all — every invocation dies at module
  load. Disposable fixtures were used throughout; no real user repositories
  were touched; the frozen tree is byte-identical after testing.
- **Indirect risk if the syntax error were fixed without further review:**
  the fix is a single `)` restoring the intended validation branch. The
  surrounding validation logic (64-item / 128-directory caps, digest and
  uint64-string formats) is then enforced as written. No deeper logic
  defect was found in the affected function by inspection, but the
  acceptance matrix above must be re-run after any fix — most A13 items
  are currently NOT RUN, not proven.

## Security blockers for DONE

1. `D-01 = DEFERRED`, `G-FENCE = NO-GO`, `managedV2MutationAuthorized = false`
   — unchanged, none opened by this testing.
2. `adoption-recover` remains policy-inoperative (hard D-01 gate).
3. Section `RENAME_EXCHANGE` product application requires independently
   verified writer-isolation proof (not present).
4. Windows native durability: no evidence, no GO.
5. Power-loss durability: UNVERIFIED by construction.

## Recommendation: NO-GO

Stage 13 cannot be accepted on `0915868a`: the CLI is entirely
non-functional and 22 of 30 acceptance items cannot be executed due to a
single syntax defect in `lib/stage13-transaction.mjs:69`. The proposed
one-character fix is documented above for maintainer review; after any
source fix, the full ordered gate sequence and the A13 matrix must be
re-run on the new frozen SHA. No D-01/G-FENCE change is recommended or
opened by this report.

## Evidence files (this directory)

- `01-npm-ci.log` … `09-validate.log` — per-command logs with exit codes
- `06-test-stage13.log` — focused suite (25 tests)
- `07-npm-test.log` — full suite (582 tests)
- `08-npm-test-stage12ref.log` — Stage 12 reference (576 tests)
- `stage13-failing-files.txt`, `stage12ref-failing-files.txt`,
  `stage13-new-failures.txt` — failure attribution
- `SHA256SUMS` — hashes of all evidence files
