# Stage 14 — Windows/NTFS independent acceptance, frozen HEAD `d6be7420`

Run 2026-10-11 on native Windows (no WSL, no container) as the Windows counterpart to the Linux
round-3 evidence at `docs/evidence/stage14-linux-20261011-r3/` (branch
`evidence/stage14-linux-d6be7420` = `e481be4c`).

**Verdict: GO for the tested Windows build scope. Product acceptance remains NO-GO.**
`D-01 = DEFERRED`, `G-FENCE = NO-GO` — both unchanged and both still the root of every red gate.
No merge, no publish, no GitHub-side action taken by this run.

## 1. Subject identity

| Field | Value |
| --- | --- |
| Frozen HEAD | `d6be7420b21484ca33c9c9837fbcd781ebaa01df` |
| Tree | `aa0b04125850b1d1d1518ce3f6a55260a85415cc` |
| Tracked files | 420 |
| `package.json` version | `0.9.3` (unchanged) |
| Checkout | `D:\vcp-stage14-d6be7420-win`, fresh clone from the GitHub URL |
| `git status --porcelain` before | 0 lines |
| `git status --porcelain` after all gates | 0 lines, HEAD unmoved |

The workspace `D:\Vibe-coding-kit` was **not** used as a clone source (content-filter partial clone,
pre-existing uncommitted changes). Line endings verified at byte level: `.gitattributes` sets
`* text=auto eol=lf`, and a scan found **no CR byte in any file under `bin/` or `scripts/`**;
`scripts/validate-framework.sh` begins `#!/usr/bin/env bash\n`. So the historical CRLF packaging
footgun does not apply to this tree.

## 2. Environment (recorded, not assumed)

| Item | Windows (this run) | Linux (r3 reference) |
| --- | --- | --- |
| OS | win32 x64, Windows 10.0.26200 | Linux 7.0.0-39-generic x86_64 |
| Node | **v24.5.0** | **v24.20.0** |
| npm | 11.5.2 | 10.9.4 |
| Git | 2.49.0.windows.1 | 2.43.0 |
| `os.tmpdir()` as seen by Node | `D:\vcp-stage14-tmp` | (default) |

`TEMP`, `TMP` and `npm_config_cache` were redirected to `D:` because `C:` is at 100% (2.4 GB free)
and `D:` at 99% (3.4 GB free). The repository has **zero runtime and zero dev dependencies**, so
`npm ci` is a no-op (exit 0, 1 s). Parity caveat: the Node minor version differs from the Linux lane
(24.5.0 vs 24.20.0); nothing observed is attributable to it, but it is a real environment delta.

## 3. Gate results

| Gate | Exit | Result |
| --- | --- | --- |
| `git rev-parse HEAD` (integrity) | 0 | exact frozen SHA |
| `npm ci` | 0 | up to date, 0 dependencies |
| `node scripts/validate-framework.mjs` | **0** | `Framework validation passed.` |
| `npm run check` | 0 | PASS |
| `npm run check:stage12-contract` | 0 | `PASS_READ_ONLY_BOUNDARIES`, `gFence: NO_GO`, `stage12FullAccepted: false` |
| `npm run check:stage13-contract` | 0 | PASS |
| `npm run check:stage14-contract` | 0 | PASS |
| `npm run doctor` | 0 | `10 pass, 7 warn, 0 fail` (the 7 WARNs are the known repo-root expectations) |
| `npm run test:cli` | 1 | 16 tests: 13 pass, **3 fail**, 0 skip |
| `npm run test:stage13` | 0 | 66 tests: **61 pass, 0 fail**, 5 skip |
| `npm run test:stage14` | 0 | 25 tests: **25 pass, 0 fail**, 0 skip |
| `npm test` (full) | 1 | 671 tests: **566 pass, 62 fail, 43 skip** |
| `npm run pack:check` | 1 → **0** | see §5 harness deviation; clean re-run PASS, 316 files |
| `npm run validate` (composite) | 1 | fails only at its last constituent `npm test`, as on Linux |
| `npm run build:native-linux` | not run | impossible on Windows; no Windows equivalent script exists |

The three `test:cli` failures are all the same root: `E_G_FENCE_NO_GO` thrown from
`lib/managed-migration.mjs:48` → `lib/safe-create.mjs:15` → `lib/task.mjs:89`. All three names also
fail on Linux, so this is the pre-existing fence, not a Windows regression.

**The specific question this campaign existed to answer is answered:** on native Windows/NTFS the
provider validator passes (exit 0) *and* the new regression test passes by name —
`✔ Stage14 validator keeps provider docs mandatory only for provider source (599.717ms)` inside
`npm run test:stage14` (25/25). The fix at `d6be7420` reproduces on Windows.

## 4. Name-level comparison against Linux r3

Both lanes ran the identical suite composition: **671 tests** on each.

| Set | Count |
| --- | --- |
| Failures common to Windows and Linux (identical names) | **62** |
| Failures on Windows only | **0** |
| Failures on Linux only | **2** |

Linux r3: 671 tests / 599 pass / 64 fail / 8 skip.
Windows: 671 tests / 566 pass / 62 fail / 43 skip.
Arithmetic reconciles exactly: the 2 Linux-only failures plus 35 additional Windows skips account
for the 33-test pass delta.

**Zero Windows-only failures** — no Windows-specific regression exists at this SHA.

### The 2 Linux-only failures, classified

1. `enforce refuses without privilege` — on Windows this is **skipped** (`SKIP reason: linux-only`),
   not passed. It is a Linux fence test. No Windows claim either way.
2. `preflight refuses blocked ancestor before writing any template or vcp state` — **fails on Linux,
   passes on Windows.** Linux assertion diff:
   ```
   + actual   code: 'ENOTDIR'
   - expected code: 'E_VCP_PATH'
   ```
   at `test/legacy-v1-fixture-boundaries.test.mjs:46`. Both platforms refuse and write nothing; only
   the *typed error code* differs, because the POSIX kernel surfaces `ENOTDIR` before the product's
   own path guard can raise `E_VCP_PATH`. Classification: **test-only defect on the Linux side, with
   an underlying product-contract question** — a typed refusal code should not be platform-dependent.
   Reported, not fixed.

### The 43 Windows skips, by stated reason

| Reason | Count | Assessment |
| --- | --- | --- |
| `native helper not built (npm run build:native-linux)` | 26 | Environment. No native Windows provider exists (B-1). |
| `linux-only` | 6 | By design; fence/privilege/kernel paths. |
| `Native Linux-only preservation proof` | 3 | `RENAME_EXCHANGE` inode preservation, Linux kernel feature. |
| delegate named: `is exercised by test/stage13-windows-ntfs.test.mjs` | 4 | Justified — that suite exists, ran, and passed (7 native NTFS tests). |
| `... conformance pending` / `junction test pending`, **no delegate named** | 4 | See finding W-6. |

## 5. Harness deviation, disclosed (gate 12 → 12b)

My first `pack:check` invocation prefixed `PATH` with `C:\Windows\System32` to force bsdtar over
Git's GNU tar (a known trap on this host). That backfired: `System32\bash.exe` is the **WSL**
launcher, so it shadowed Git Bash and npm's child process died before doing any work —

```
wsl: Unknown key 'wsl2.localharddriveaccess' in C:\Users\<REDACTED_USER>\.wslconfig:4
<3>WSL (10 - Relay) ERROR: CreateProcessCommon:798: execvpe(/bin/bash) failed: No such file or directory
```

Exit 1 in 4 s with **no npm output at all**. This is a harness failure, not a product result. The
substitution was unnecessary: `npm pack` in npm 11 packs internally and never shells out to `tar`.
Re-run without any PATH change: `12b-pack-check-nopathsub.log`, **exit 0**.

The broken run is retained as superseded evidence, not deleted.

| | Windows (12b) | Linux r3 |
| --- | --- | --- |
| Result | PASS | PASS |
| Total files | **316** | **317** |
| Package size | 727.3 kB | 751.2 kB |
| shasum | `29468176af4931d9086a00ee93380b6be52b4b9b` | `f34fccd89017a1ae71941641aaa7434ab1d554e2` |

The file-count delta is **fully explained**: the single extra entry in the Linux tarball is
`scripts/native/vcp-linux-fsops` (55.4 kB), the compiled artifact of `npm run build:native-linux`,
which the Linux lane ran and Windows cannot. No other entry differs in either direction. The
differing shasum follows from that one file.

## 6. Findings (reported, not fixed — the frozen tree was not modified)

- **W-5 / DEFECT (test-only, Linux side) + RISK (product contract).** Typed refusal code is
  platform-dependent: `ENOTDIR` on Linux vs `E_VCP_PATH` on Windows for the blocked-ancestor
  preflight. Refusal itself is correct and write-free on both. Either the test must accept both
  codes or the guard must classify before the kernel does. This is currently a **red Linux test**,
  i.e. it is part of the 64 that keep `npm run validate` red on Linux.
  **Maintainer classification (2026-10-11): this is NOT treated as a security bypass**, because the
  refusal and the preservation of user bytes are both proven on each platform; it requires an
  **independent fix** to either the error contract or the test expectation, on its own branch.
- **W-6 / FOLLOW-UP (traceability, not proven coverage gap).** Four Windows skips say
  `Native Windows reparse/junction conformance pending` (and variants) **without naming a delegate**,
  while the sibling suite `test/stage13-windows-ntfs.test.mjs` contains tests that look semantically
  equivalent (`native Windows linked VCP state never becomes a trusted manifest`,
  `native Windows junction cannot be followed by project read or write`,
  `native Windows path aliases, reserved names and escapes fail closed`,
  `native Windows file symlink cannot become a legacy fixture claim`). Whether these are *the same*
  assertion is a maintainer mapping decision — I am not claiming coverage, and I am not claiming a
  hole. The four skip reasons should name their delegate the way the other four already do.
  **Maintainer ruling (2026-10-11): these four `pending` tests are NOT to be counted as covered
  until an explicit mapping to corresponding native Windows tests is proven.** Until then they stand
  as uncovered Windows link/reparse assertions.
- **W-7 / DEFECT (evidence, Linux r3 report).** `STAGE14-INDEPENDENT-TEST-REPORT.md` states
  `npm run pack:check | 0 | PASS (318 files)`, but its own `12-pack-check.log` says
  `npm notice total files: 317`. **Maintainer-confirmed correction (2026-10-11): the authoritative
  Linux figure is 317, not 318.** Windows packs 316; the one-file difference is
  `scripts/native/vcp-linux-fsops`, the Linux native-helper build artifact.
- **B-1 unchanged (root blocker).** 26 skips exist solely because no native Windows write provider
  is built. The Stage 12 contract's own `win32` receipt reports `scenarios: 13, unsafe: 8,
  conclusion: NO_GO__LEGACY_USER_EDIT_LOSS_WITNESSES` (Linux receipt: 12 / 7 / same conclusion).
  This is why `G-FENCE` stays `NO-GO` and why Windows *durability capability* remains unproven even
  though Windows *safety* is again demonstrated. **Maintainer ruling (2026-10-11): Windows native
  writer and durability coverage remain incomplete; the GO in this report is scoped to the build
  acceptance actually executed and extends no further.**

## 7. What this run did not do

No merge, no publish, no tag, no release, no PR review and no change to PR #106 or to the freeze
branch `freeze/stage14-validator-d6be7420-20261011`. `main` verified unchanged at
`8ccb276545fdb3cc301ce7ce324812eb4c314586` before and after the run; PR #106 verified still
`OPEN`/`isDraft=true` with head `d6be7420`. The frozen acceptance checkout
`D:\vcp-stage14-d6be7420-win` is pristine (§1) and the evidence commit was authored in a **separate**
clone so that tree never moved. The two review findings already logged by the maintainer
(RISK-01 fail-open sentinel, COVERAGE-02 missing negative control) were **not** addressed here and
remain open; per maintainer decision this evidence is published **now**, independently of those
fixes, so the before/after comparison stays possible.

Publication of this evidence branch was explicitly authorized by the maintainer on 2026-10-11.
Merging it into `main` and any release were **not** authorized and were not done.

## 8. Verdicts after the Windows campaign (maintainer-adopted)

| Scope | Verdict |
| --- | --- |
| Stage 14 — Linux (`d6be7420`) | GO for build scope |
| Stage 14 — Windows (`d6be7420`) | GO for build scope |
| Windows-only regressions | **zero**, by name-level test comparison |
| RISK-01 / COVERAGE-02 | open |
| Windows native durability | NO-GO |
| `D-01` / `G-FENCE` | DEFERRED / NO-GO |
| Final product acceptance | **NO-GO** |

## 9. Publication redaction

Scanned before push for credentials and private keys (`ghp_`, `npm_`, `_authToken`, `Bearer`,
`sk-`, `AKIA`, `BEGIN … PRIVATE KEY`): **no matches in any published file**. One log required
redaction; the unredacted original is retained locally and is **not** published.

| Published file | Redaction | Reason |
| --- | --- | --- |
| `logs-d6be7420/12-pack-check.log` | the full `PATH` value in the `BEGIN` header replaced with `<REDACTED host PATH prefixed with C:/Windows/System32>`; the host user profile segment in the WSL `.wslconfig` message replaced with `<REDACTED_USER>`; NUL bytes from the WSL UTF-16 error stream stripped so the file is reviewable text | the harness-broken run dumped the entire host `PATH`, exposing the local user profile and unrelated personal directory names; none of it is evidence |
| `STAGE14-WINDOWS-NTFS-REPORT.md` | the same `.wslconfig` path user segment replaced with `<REDACTED_USER>` in the §5 quotation | same |

Unredacted local originals are retained at `D:\vcp-stage14-evidence\` and are **not** published.
Their pre-redaction SHA-256 values are recorded once, in `REDACTION.md` in this directory, which is
the single source for them.

The redaction removes no exit code, no assertion, no test name and no measurement; the WSL failure
text that proves the harness diagnosis is preserved verbatim apart from the user-profile segment.
`SHA256SUMS` in this directory is computed over the **published** (redacted) bytes, so it differs
from the pre-redaction hashes for exactly those two files.

Also excluded from publication: the local `linux-r3/` extracts (the Linux r3 report, its
`failing-names.txt`, `10-npm-test.log`, `12-pack-check.log` and `SHA256SUMS`). They are already
published on branch `evidence/stage14-linux-d6be7420` under
`docs/evidence/stage14-linux-20261011-r3/`, and the raw Linux suite log embeds that lane's host home
directory in every stack trace. The derived comparison outputs that the name-level diff actually
needs (`linux-failing-names-sorted.txt`, `linux-pack-files.txt`, `linux-only.txt`) are included, and
contain test names only.

