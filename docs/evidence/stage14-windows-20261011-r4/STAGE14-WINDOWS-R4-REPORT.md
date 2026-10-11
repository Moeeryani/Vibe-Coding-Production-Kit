# Stage 14 Round 4 — Independent Native Windows/NTFS Acceptance Report

- Candidate: `de8faa19c6959c4188632e2e908909db485c3ef3` (tree `c3a13c051d9b87972efb9ba3c4c8f428d7631114`), branch `freeze/stage14-review-de8faa19-20261011`
- Previous candidate: `d6be7420b21484ca33c9c9837fbcd781ebaa01df` (evidence `evidence/stage14-windows-d6be7420`, tip 62a4018d)
- Host: native Windows 10.0.26200 x64, NTFS (C: and D: DriveFormat=NTFS proven), Node v24.5.0, npm 11.5.2, git 2.49.0.windows.1, Git Bash; no WSL; PATH unmodified; TMP/TEMP/npm_config_cache on D:.
- Clone: fresh full clone from GitHub to `D:\vcp-stage14-r4`; old workspace `D:\Vibe-coding-kit` not used; previous evidence stores untouched.
- Campaign date: 2026-10-11. Evidence folder: `docs/evidence/stage14-windows-20261011-r4/`.

## 1. Gate results (exit codes; full logs in `logs/`, summary in `GATE-SUMMARY.txt`)

| # | Gate | Exit | Duration | Result |
|---|---|---|---|---|
| 01 | `npm ci` | 0 | 1s | PASS (zero-dependency package, 0 vulnerabilities) |
| 02 | `node scripts/validate-framework.mjs` | 0 | 1s | PASS "Framework validation passed" |
| 03 | `npm run check` | 0 | 13s | PASS |
| 04 | `npm run check:stage12-contract` | 0 | 2s | PASS |
| 05 | `npm run check:stage13-contract` | 0 | 1s | PASS |
| 06 | `npm run check:stage14-contract` | 0 | 1s | PASS |
| 07 | `npm run doctor` | 0 | 0s | PASS (10 pass / 7 warn / 0 fail; warnings are expected starter-template/command-slot notices) |
| 08 | `npm run test:cli` | 1 | 17s | 3 failures, all `E_G_FENCE_NO_GO` (known D-01/G-FENCE class) |
| 09 | `npm run test:stage13` | 0 | 1s | **66 pass / 0 fail / 5 skip** |
| 10 | `npm run test:stage14` | 0 | 5s | **26 pass / 0 fail / 0 skip** |
| 11 | `node --test test/stage13-windows-ntfs.test.mjs` | 0 | 1s | **12 pass / 0 fail / 0 skip** |
| 12 | `node --test test/stage14-legacy-validator.test.mjs` | 0 | 5s | **2 pass / 0 fail** |
| 13 | `node --test test/legacy-v1-fixture-boundaries.test.mjs` | 0 | 1s | **8 pass / 0 fail / 1 skip** (Windows-delegated) |
| 14 | `npm test` | 1 | 47s | **677 total: 572 pass / 62 fail / 43 skip** — failures identical by name to previous campaign (see FAILURE-CLASSIFICATION.md) |
| 15 | `npm run validate` | 1 | 64s | validator+checks+contracts all pass; nonzero only via embedded `npm test` G-FENCE class |
| 16 | `npm run pack:check` | 0 | 3s | PASS, 316 files, version 0.9.3 |
| 17 | RISK-01 independent deletion | 0/1/0 | — | positive pass → deletion refused → restore pass (logs/17-risk01.log) |
| 18 | Independent hash/reparse demo | 0 | — | refusals + SHA-256 preservation (logs/18-hash-reparse-demo.log) |

`npm run build:native-linux` was **not** run on Windows, per instructions.

## 2. The five new W-6 native tests — all PASS by exact name, zero skips, real NTFS reparse points

1. `native Windows linked selected root and in-root alias are rejected` — PASS
2. `native Windows provider inspection rejects a junction-selected root` — PASS
3. `native Windows inspection refuses symlinked manifest without reading its target` — PASS
4. `native Windows path guard rejects internal and external file symlinks` — PASS
5. `native Windows adoption plan refuses symlinked external source evidence` — PASS

Source audit confirms each test: runs only on `win32` (skip on other platforms, never here —
file ran 12/12 with 0 skipped); creates real junctions/file symlinks via `fs.symlink` and
asserts `lstat().isSymbolicLink()` (privilege absence would fail visibly — file symlinks were
created successfully, so this host holds the privilege; no blocker); asserts specific refusal
codes/reasons (`E_VCP_PATH`, `ROOT_LINK_REFUSED`, `MANIFEST_NOT_REGULAR`, `UNSAFE_PROJECT_PATH`,
`zeroWrite`, `executionAuthorized:false`); and re-reads the external target proving original
bytes preserved (`foreignUnchanged`). tmpdir resolved to `D:\vcp-r4-tmp`, DriveFormat=NTFS.

## 3. Objective verdicts

- **RISK-01: PASS.** Independently (outside the automated suite): isolated copy of the real
  source at D:\vcp-r4-tmp\risk01-copy — validator passed whole (exit 0); deleting
  `lib/asset-catalog.mjs` → exit 1 `ERROR: required file missing or empty: lib/asset-catalog.mjs`;
  restoring → exit 0; deleting `docs/STAGE14-ACCEPTANCE-MATRIX.md` → exit 1 with matching
  explicit error. The validator does not depend on the checked-out repo or on the presence of
  files it verifies; absence produces explicit rejection. Isolated copy removed afterwards.
- **COVERAGE-02: PASS.** `Stage14 provider validator refuses missing required docs and
  self-sentinel module` passes on Windows (gate 12). Source audit: builds isolated provider
  snapshot in mkdtemp (never modifies the real repository), positive control exit 0, then for
  each of 4 required files (2 provider docs + `lib/consumer-asset-retirement-plan.mjs` +
  `lib/asset-catalog.mjs`): delete → exit 1 with explicit diagnostic → restore → exit 0.
- **W-5: PASS on Windows.** Fixture descendant whose ancestor is a regular file (ENOTDIR case)
  is now routed through the typed guard (`resolveProjectPath`) and refuses consistently with
  `E_VCP_PATH`; original test `preflight refuses blocked ancestor before writing any template
  or vcp state` passes on Windows and asserts the original file bytes and directory listing
  unchanged. The historical Linux-lane ENOTDIR inconsistency is fixed in shared helper code
  (commit 8aef069); Linux-lane re-execution is out of this campaign's scope.
- **W-6: PASS (closed for the four delegated pairs).** Full assertion-level mapping in
  W6-DELEGATE-MATRIX.md. All four formerly-`pending` skips now name concrete native delegates;
  every delegate executed and passed on real NTFS. Two minor notes (in-root target
  non-mutation asserted indirectly; reason-substring granularity) — the granularity note was
  closed by this campaign's independent demo showing `LINK_REFUSED`/`ROOT_LINK_REFUSED`
  reasons on native junctions/symlinks with SHA-256 preservation. No coverage gap remains.
  Boundary honored: this is **not** a native durable-writer proof.

## 4. Comparison vs previous Windows campaign (details: COMPARISON.md)

- test:stage13 61→66 pass (+5 = new W-6 tests), 5 skip unchanged; test:stage14 25→26 (+1 = COVERAGE-02).
- npm test 671→677 total; 566→572 pass; 62 fail with **byte-identical names**; 43 skips, no new skip.
- The 62 are a proven subset (comm: 0 outside) of the previous Linux 64; the 2 Linux-only extras pass on Windows.
- No old test changed result. No Windows regression appeared.

## 5. Package and runtime (details: COMPARISON.md, windows-pack-files.txt)

- 316 files, identical path list to previous Windows pack; vs Linux pack the only difference is
  `scripts/native/vcp-linux-fsops` (compiled binary) — proven by list diff, not assumed.
- Runtime `bin/vibe-coding-production.mjs` and canonical prompts `prompts/01..07` present.
- New provider docs `docs/CONSUMER-ASSET-SEPARATION.md`, `docs/STAGE14-ACCEPTANCE-MATRIX.md` present in provider package.
- Version 0.9.3 unchanged.
- No provider-only leakage into consumer installations: passing test proves seeded consumer
  fixture has ENOENT for provider docs; safe surfaces exclude them.

## 6. Safety and no-write assessment

- All 420 tracked files of the tested clone: SHA-256 identical BEFORE vs AFTER all gates
  (`repo-tracked-sha256-BEFORE.txt` / `-AFTER.txt`, diff empty); `git status --porcelain`
  empty before and after; HEAD unchanged. No source or test was modified during the campaign.
- Independent demo (logs/18): external file SHA-256
  `f2ba4c7f531cdf05ede6dc9e95af32f40b206af3fcb2dd61239903f5637ce7b6` identical before/after
  junction read/write attempts, file-symlink attempt, and junction-selected-root inspection;
  all refused (`LINK_REFUSED`, `ROOT_LINK_REFUSED`).
- Suite-level protections passed: manifest integrity, source-truth isolation, nested project
  boundaries (`fixture never creates an unproved nested project directory` etc.), read-only
  `vcp asset-plan` (`emits only read-only inspection JSON`, `refuses force/run/yes`), no
  schema-v2 writer authorization (`real init writer stays gated`, `original D-01 migration gate
  remains unmodified and blocking`, `exact fingerprint still cannot bypass G-FENCE`).
- Prohibitions honored: no source/test edits, no PR merge, no main change, no npm publish, no
  version change, no release/tag, D-01 unopened, G-FENCE unchanged, schema-v2 writer not
  activated, no Linux-substitution claims.

## 7. Verdicts

### Stage 14 build scope on native Windows: **GO (build)**

All required focused gates pass; the new Stage 14 validator test passes; the five new native
Windows tests pass by name on proven NTFS with real reparse points; W-6 is proven for every
required delegate pair; no new Windows regression; user bytes and the tested tree are provably
unchanged; residual failures are the documented G-FENCE/native-helper/pre-existing classes.

### Final product acceptance: **NO-GO** (unchanged, independent judgment)

D-01/G-FENCE remains closed by design (42 fence failures observed), Checkpoint A, Stage 12
full gates, the Linux native helper lane, and a Windows **durable writer** proof remain
unmet. Junction/symlink refusal conformance does not establish Windows native durability.
Publication, merge, tag, and release decisions remain with the maintainer.

## 8. Evidence index

- ENVIRONMENT-RECEIPT.md, SHA-RECEIPT.md, REDACTION.md
- GATE-SUMMARY.txt; logs/01..18 (exit codes, stdout+stderr, durations, test names)
- windows-failing-names.txt (62), windows-skip-names.txt (43, with reasons), windows-passing-names.txt (572)
- FAILURE-CLASSIFICATION.md, COMPARISON.md, W6-DELEGATE-MATRIX.md
- windows-pack-files.txt (316, sizes+paths), package-inventory-paths.txt
- repo-tracked-sha256-BEFORE.txt / -AFTER.txt (420 files each, diff empty)
- independent-hash-reparse-demo.mjs + logs/18-hash-reparse-demo.log; run-gate.sh; fs-probe.mjs
- SHA256SUMS (this folder; re-verified after fresh clone of the published branch)
