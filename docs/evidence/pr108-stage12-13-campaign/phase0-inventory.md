# Phase 0 — Deep Inventory: VCP Stage 12/13 build-completion campaign (PR #108)

- Repo: `Moeeryani/Vibe-Coding-Production-Kit`
- Branch: `integration/stage12-stage13-native-windows-foundation-20261011`
- PR: #108 (Draft, WIP "native NTFS scratch operation foundation")
- Frozen HEAD: `f4b6832b8c732c2f544322d0615690021db800df` ("test(d01): reject aliased NTFS IDs in source receipts")
- PR base: `de8faa19c6959c4188632e2e908909db485c3ef3`
- Diff scope: **63 files changed, 9139 insertions(+), 1 deletion(-)** — 223 commits in `de8faa19..HEAD`
- Standing: **D-01 = DEFERRED, G-FENCE = NO-GO** (never changed, never relitigated)
- Clone analyzed: `~/workspace/vcp-stage12-13-campaign/repo` (read-only; nothing pushed or modified)
- Method: `git diff` classification, full reads of files < 300 lines, skim of larger files, marker grep over added lines, execution of the PR's new portable test files on this Linux sandbox.

The single deletion is in `package.json`: a trailing comma on the `check:stage14-contract` line (benign — new scripts appended after it). **No existing product code was modified by this diff** — everything is new harness/evidence code.

---

## (a) Per-area change summary

### 1. Native C++ — `scripts/native/` (6 new files, ~2,090 added lines)

- **`vcp-windows-fsops.cpp` (589 lines)** — Disposable-root-only NTFS namespace helper. Ops: `capabilities`, `sync-root`, `inspect-entry`, `write-exclusive`, `rename-no-replace`, `unlink`, `mkdir-exclusive`, `rmdir-empty`. Enforces flat `vcp-stage12-*` leaf names only; scratch root must be a direct `vcp-win-native-scratch-*` child of the OS temp dir with an exact `VCP-STAGE12-DISPOSABLE-ONLY.marker`; refuses non-NTFS volumes, UNC, reparse ancestors, linked contents. Ancestor handles are pinned without `FILE_SHARE_DELETE` until completion. Emits versioned protocol receipts (v3) with hard `directoryDurabilityProven:false`, `managedMutationAuthorized:false`. A completed operation with a failed directory flush exits nonzero *after* the operation and must retain state for forensics. Extensive source comments state: Win32 completion / `FlushFileBuffers` / directory flush ≠ power-loss durability.
- **`vcp-windows-d01-fixture.cpp` (338 lines)** — New-only *elevated* two-principal fixture provisioner. Explicit env opt-in `VCP_D01_WINDOWS_DISPOSABLE=I_ACCEPT_NEW_PROGRAMDATA_FIXTURE_ONLY`; takes `--old-sid`/`--writer-sid` (must be distinct real user accounts, neither the provisioner's own); locates OS-known `FOLDERID_ProgramData` (never a caller path); creates one cryptographically-random `vcp-win-d01-isolation-<128-bit>` leaf; applies a protected DACL *at creation* via `SECURITY_ATTRIBUTES` (SYSTEM+Administrators full, writer full, old SID file-read/traverse); mints only marker + two project dirs + `AGENTS.md` + `.vcp` + manifest. Returns exit 3 / `NO_GO` receipt; never deletes, even partially created fixtures.
- **`vcp-windows-d01-token-inspect.cpp` (322 lines)** — Read-only AccessCheck diagnostic. Reads running process `TokenUser` SID, derives an impersonation token, observes each dangerous NTFS right separately (`DELETE`, `FILE_DELETE_CHILD`, write data/new files/new dirs, `WRITE_DAC`, `WRITE_OWNER`); checks root/project NTFS IDs; refuses elevated/Administrators tokens and sensitive privileges. Exit 3, never mutates, never executes old binaries. (Also the source built by `build-windows-d01-readonly.mjs` as the "readonly" helper.)
- **`vcp-windows-d01-kernel-denial.cpp` (297 lines)** — Bounded old-token kernel-denial witness. Requires marker, direct OS-known ProgramData child, exact NTFS IDs, and the actual unprivileged old `TokenUser` SID plus a second in-binary env opt-in. Requests ten discrete kernel access rights (`OPEN_EXISTING`); only if all fail with `ERROR_ACCESS_DENIED` does it attempt two bounded mutations: `CreateFileW(CREATE_NEW)` of a fixed probe leaf and, if creation is denied, `MoveFileExW` of `AGENTS.md` to `AGENTS.md.vcp-d01-old-moved` (same project, no replace). Afterwards verifies exact original bytes, file identities, absence of witness names. Any success or ambiguity → NO_GO; no cleanup/rollback allowed. Exit 3.
- **`vcp-windows-d01-protected-snapshot.cpp` (248 lines)** — Read-only forensic snapshot of `AGENTS.md` + optional `.vcp/manifest.json`: CNG SHA-256 + `volumeSerial:indexHigh:indexLow` identity, exact marker + root/project ID checks, reparse/hardlink refusal, **128 KiB per-file read cap (fail closed)**. All handles allow `FILE_SHARE_DELETE` deliberately so the observer cannot itself cause a rename-sharing violation — making it explicitly non-atomic.
- **`vcp-windows-d01-namespace-inventory.cpp` (475 lines)** — Full bounded recursive project-tree inventory emitting `D01_WINDOWS_NATIVE_NAMESPACE_INVENTORY_V2` (V1 receipts deliberately refused). Per object: NTFS identity, attributes, CNG SHA-256, canonical owner/group/DACL security-descriptor fingerprint (SDDL) via `GetSecurityInfo` from `READ_CONTROL` handles; `GetFileInformationByHandleEx(FileStreamInfo)` on every object — **refuses any named NTFS alternate data stream** (only unnamed `::$DATA` allowed), fails closed on inconclusive stream enumeration. Limits: depth ≤10, ≤512 entries, ≤128 KiB/file, ≤2 MiB aggregate — fail-closed, explicitly not product limits. Read-only, exit 3, always `NO_GO`.

### 2. Node lib — `lib/` (16 new files, ~2,330 added lines)

- **`windows-fs-provider-candidate.mjs` (207)** — JS interface for the scratch helper: `WindowsNamespaceScratchCandidate` (win32-only constructor, strict scratch-root shape, marker verification, name safelist), `interpretWindowsScratchResult` strict v3 receipt validator (fails closed on any inconsistency; a failed helper is never treated as a no-op — `mayHaveMutated`/`requiresForensicInspection` semantics), `windowsNativeCandidateStatus()` reporting `productionBackendConnected:false`, `mutationAuthorized:false`, `d01ApprovalRequired:true`. Explicitly NOT connected to managed lifecycle or Stage 13 apply.
- **`d01-linux-isolation-fixture.mjs` (498)** — Linux-only, root-provisioned disposable OS-principal fixture: opt-in env `VCP_D01_DISPOSABLE_ISOLATION`, `WeakSet` capability binding (untrusted objects can never invoke probes), two child projects differing only in `.vcp/manifest.json`, 5 fixed probes (overwrite, unlink, rename, create-inside, replace-project) + writer-positive control, kernel-DAC denial observation via a worker subprocess; `decodeVerifiedLegacyArchiveBytes` staging of the real 0.9.3 tarball for a *future* bounded kernel experiment (never runs in tests).
- **`d01-principal-boundary.mjs` (204)** — Read-only two-principal boundary preflight: POSIX mode analysis (owner/chmod-escalation, hardlink-alias, group-writability) and Windows SID-shape checks; issues fail-closed codes (`E_D01_SAME_OS_PRINCIPAL`, `E_D01_LEGACY_OWNS_PROTECTED_NAMESPACE`, `E_D01_LEGACY_CAN_MODIFY_PROTECTED_OBJECT`, `E_D01_HARDLINK_ALIAS_UNPROVEN`, `E_D01_NATIVE_OS_ACCESS_CHECK_REQUIRED`, `E_D01_LEGACY_GROUPS_UNVERIFIED`, `E_D01_PRIVILEGED_PRINCIPAL_UNPROVEN`); always returns `status:'NO_GO'`. Also exports `inspectLegacyPrincipalBoundary` (actual fs walk of root + ancestors + protected paths). **DEFECT FOUND (Phase-0 finding, §c row 10):** overlapping `--protected .vcp` + `--protected .vcp/manifest.json` causes `E_D01_DUPLICATE_PATH` — `pathsFromRoot()` lists `.vcp` both as a parent-ancestor and as a protected item, and `assessLegacyPrincipalBoundary` refuses duplicate paths. Both the lib and the failing test are PR-new.
- **`d01-published-legacy-artifact.mjs` (217)** — Authenticated offline inspection of the published npm 0.9.3 tarball: SHA-512, tar-header checksums, member paths/types, name/version/entrypoint. Never runs npm, extracts, or installs.
- **Windows D-01 evidence validators (8 files)** — `windows-d01-fixture-evidence.mjs` (65), `windows-d01-fixture-matrix.mjs` (61), `windows-d01-token-evidence.mjs` (131), `windows-d01-kernel-denial-evidence.mjs` (78), `windows-d01-protected-snapshot-evidence.mjs` (99), `windows-d01-namespace-inventory-evidence.mjs` (200), `windows-d01-namespace-inventory-comparison.mjs` (80), `windows-d01-fixture-matrix.mjs`: strict receipt validators for the native helpers' JSON — refuse forged fields, claimed `d01Approved`, detached/mismatched reviews, legacy V1 receipts; all return `NO_GO`.
- **`d01-windows-published-cli-plan.mjs` (127)** — Builds the 10-scenario adversary matrix (5 lifecycle commands × 2 manifest states) against the independently pinned tarball SHA-512; pure read-only, exit 3, always `NO_GO`. Explicit: SHA-512 must be corroborated from independent publication evidence, not copied from the local download.
- **`d01-windows-published-cli-evidence.mjs` (188)** — Ingests externally preserved operator-reported observations; rejects unexpected approval fields, SID/ID mismatches, missing byte hashes, contradictory process status, duplicate scenario IDs; Win32 error 32 (`ERROR_SHARING_VIOLATION`) is never counted as error 5 (`ERROR_ACCESS_DENIED`); byte-identical replacement of an existing user file is NOT preservation. Always `NO_GO`.
- **`d01-windows-published-snapshot-correlation.mjs` (134)** — Correlates plan + observation + before/after snapshots (three independently-captured but still untrusted sources). Rollback has an extra precondition: pre-rollback `AGENTS.md` must differ from the minted baseline (necessary check, explicitly NOT proof of authorized chronology).
- **`d01-windows-published-dual-inventory.mjs` (88)** — Dual-project guard: requires before/after native inventory envelopes for **both** variants per scenario (an old CLI may mutate the sibling project); reports sibling mutation explicitly; forged plan/fixture rejected; always NO_GO. Note: portable JS contract was smoke-exercised in a standalone V8 harness only — not under `npm test`/VS2019/NTFS (docs state this).

### 3. `scripts/` — Node CLI/build wrappers (18 new files)

- **6 MSVC build scripts** (`build-native-windows.mjs`, `build-windows-d01-readonly.mjs` [token-inspect], `build-windows-d01-fixture.mjs`, `build-windows-d01-kernel-denial.mjs`, `build-windows-d01-protected-snapshot.mjs`, `build-windows-d01-namespace-inventory.mjs`), each with a `--verify-repro` variant doing two independent links; all refuse non-win32; emit `build-receipt.json` with source/EXE SHA-256 under `build/native-windows/` (git-ignored). Never bundle into the npm package or enable writers.
- **6 inspect/probe CLIs** (`inspect-d01-boundary.mjs`, `run-d01-linux-isolation-fixture.mjs`, `inspect-windows-d01-fixture.mjs`, `inspect-windows-d01-protected-snapshot.mjs`, `inspect-windows-d01-namespace-inventory.mjs`, `probe-windows-d01-kernel-denial.mjs`) — all read-only, exit 3, verify the native source/EXE SHA-256 against the build receipt before delegating, bind the running token SID to the fixture.
- **2 review CLIs** (`review-windows-d01-fixture.mjs`, `review-windows-d01-published-cli.mjs`), **2 compare CLIs** (`compare-windows-d01-namespace-inventory.mjs`, `compare-windows-d01-published-dual-inventory.mjs`), `correlate-windows-d01-published-snapshots.mjs`, `plan-windows-d01-published-cli.mjs` — all offline, no mutation, always exit 3 / NO_GO.
- **`run-native-windows-candidate-tests.mjs`** — opt-in native acceptance runner (`VCP_TEST_REQUIRE_NATIVE_WINDOWS_SCRATCH`); refuses non-win32 and missing helper; re-verifies source/EXE hash match immediately before execution. (Opt-in means `test/stage12-windows-native-scratch.test.mjs` skips in the ordinary suite.)

### 4. `test/` — 18 new test files (~2,460 added lines)

- Portable protocol/receipt/contract suites (run on Linux): `windows-scratch-protocol.test.mjs` (7/7 pass here), `windows-scratch-recovery-assessment.test.mjs`, `d01-linux-isolation-fixture.test.mjs` (4/4 — test mode never provisions as root), `d01-principal-boundary.test.mjs` (10/10), `d01-published-cli-matrix.test.mjs`, `d01-published-legacy-artifact.test.mjs`, `d01-windows-published-cli-evidence.test.mjs`, `d01-windows-published-cli-plan.test.mjs`, `d01-windows-published-dual-inventory.test.mjs`, `windows-d01-fixture-evidence.test.mjs`, `windows-d01-fixture-matrix.test.mjs`, `windows-d01-kernel-denial.test.mjs`, `windows-d01-namespace-inventory.test.mjs` (incl. V2 ADS/SDDL source-contract assertions), `windows-d01-protected-snapshot.test.mjs`, `windows-d01-token-evidence.test.mjs`, `windows-d01-readonly-source.test.mjs` (source-contract tests asserting fail-closed C++ markers).
- `stage12-windows-native-scratch.test.mjs` — skips on Linux (requires win32 + explicit opt-in); **this is the only skip in the batch run**.
- **One real failure:** `d01-inspect-command.test.mjs` — "D-01 inspection CLI never exits 0 and does not mutate protected fixture" fails: `JSON.parse(run.stdout)` at line 29 throws `SyntaxError: Unexpected end of JSON input`. Root cause verified manually: `scripts/inspect-d01-boundary.mjs` exits 3 with the JSON on *stderr* because `lib/d01-principal-boundary.mjs` raises `E_D01_DUPLICATE_PATH` for the test's overlapping protected paths (`--protected .vcp` + `--protected .vcp/manifest.json`). Defect is PR-new (lib + test both added here). The file's second test passes.

### 5. `docs/` — 1 file

- `docs/STAGE12-D01-WINDOWS-PRINCIPAL-FIXTURE.md` (205 lines) — Construction-only design doc for the D-01 Windows campaign: trust model (two different Windows security principals, not two executable names under one SID), fixture provisioner semantics, kernel-denial witness, published-0.9.3 adversary plan, protected snapshot + inventory V2, dual-project scope, "do not run as final acceptance campaign yet" workflow for a future independent Windows operator. Explicitly: **Status Draft / NO-GO**; D-01=DEFERRED, G-FENCE=NO-GO, `managedV2MutationAuthorized=false`, `WINDOWS_NAMESPACE_DURABILITY_UNPROVEN`. Names the gaps honestly: C++ source "authored but not yet proven by MSVC or actual NTFS execution on this exact HEAD"; actual helper build, native NTFS behavior, and independent Windows crash/recovery evidence "still unverified"; dual-inventory portable contracts only V8-harness smoke-tested.

### 6. Root files

- `package.json` — 26 new npm scripts: `build:native-windows(:verify-repro)`, `test:native-windows-candidate`, `inspect:d01-boundary`, `probe:d01-linux-isolation`, `build:native-windows-d01-{readonly,fixture,kernel-denial,snapshot,inventory}(:verify-repro)`, `inspect:d01-windows-{fixture,protected-snapshot,namespace-inventory}`, `probe:d01-windows-kernel-denial`, `plan:d01-windows-published-cli`, `review:d01-windows-{fixture,published-cli}`, `correlate:d01-windows-published-snapshots`, `compare:d01-windows-{namespace-inventory,published-dual-inventory}`.
- `.gitignore` — `build/`, `scripts/native/vcp-windows-fsops.exe`, `scripts/native/vcp-windows-fsops.obj` (helpers stay unshipped).

---

## (b) Marker table — exact text + assessment

No `TODO`, `FIXME`, `XXX`, `HACK`, `not implemented`, or `unimplemented` strings exist anywhere in the added lines. Markers found are `DEFERRED` / `NO_GO` / `UNPROVEN` / `UNVERIFIED` and opt-in gates. Assessment: **deliberate gate** = intentional fail-closed refusal/status, never relaxable by accident; **real gap** = missing evidence explicitly owed.

### Deliberate gates (not gaps)

| File:line | Marker | Exact text (trimmed) | Assessment |
|---|---|---|---|
| `docs/STAGE12-D01-WINDOWS-PRINCIPAL-FIXTURE.md`:23 | NO-GO | `**Status: Draft / NO-GO.** No code here enables production managed v2 writes, D-01 approval, deployment, or selected-project changes. This is not Windows durability acceptance.` | Deliberate gate — states the PR's non-authorizing scope |
| docs:40,67,96,141 + 12 more `D-01=DEFERRED`/`G-FENCE=NO-GO`/`managedV2MutationAuthorized=false`/`WINDOWS_NAMESPACE_DURABILITY_UNPROVEN` restatements | DEFERRED/NO-GO | e.g. `D-01=DEFERRED; G-FENCE=NO-GO; managedV2MutationAuthorized=false` | Deliberate — standing guardrails repeated at each mechanism |
| `lib/windows-fs-provider-candidate.mjs`:2624-2625 | disabled by default | `this.mutationAuthorized=false; this.directoryDurabilityProven=false;` | Deliberate — frozen at construction, re-asserted in every receipt validator |
| `lib/windows-fs-provider-candidate.mjs`:2689 | disabled by default | `productionBackendConnected:false, directoryDurabilityProven:false, mutationAuthorized:false` | Deliberate |
| `lib/windows-fs-provider-candidate.mjs`:115 | UNPROVEN code | `fail('E_DIRECTORY_SYNC_UNPROVEN', 'Win32 operation completed; scratch state must be inspected', receipt);` | Deliberate — completed-op-with-failed-dir-flush is a distinct fail-closed code, not a pass |
| `lib/windows-scratch-recovery-assessment.mjs`:70 | UNVERIFIED classification | `return 'OBSERVED_NEW_ENTRY_CONTENT_UNVERIFIED';` | Deliberate — a new entry after partial write never proves bytes |
| `lib/d01-principal-boundary.mjs`:83,87,113 | UNVERIFIED/UNPROVEN codes | `add(issues,'E_D01_LEGACY_GROUPS_UNVERIFIED','.');` / `E_D01_PRIVILEGED_PRINCIPAL_UNPROVEN` / `E_D01_HARDLINK_ALIAS_UNPROVEN` | Deliberate — unverifiable conditions reported as issues, never silently accepted |
| `lib/d01-linux-isolation-fixture.mjs`:137 | UNVERIFIED code | `refuse('E_D01_FIXTURE_CHILD_UNVERIFIED', ...)` | Deliberate — non-provisioned object cannot run probes |
| `scripts/run-d01-linux-isolation-fixture.mjs`:92 | UNPROVEN code | `console.error('E_D01_KERNEL_DENIAL_UNPROVEN');` | Deliberate — real kernel denial requires a root+opt-in run, never claimed by tests |
| `scripts/run-native-windows-candidate-tests.mjs`:12 | UNVERIFIED code | `console.error('E_WINDOWS_SCRATCH_BUILD_UNVERIFIED: '+reason);` | Deliberate — acceptance runner refuses unless source/EXE hashes match a receipt |
| `scripts/native/vcp-windows-d01-kernel-denial.cpp`:296 + fixture/token/snapshot/inventory sources | UNPROVEN fields | `L"\"oldPrincipalActualMutationDenialUnproven\":true}` | Deliberate — schema-level truth-in-evidence |
| all `scripts/native/*.cpp` + all `lib/*` receipts/tests | NO-GO status | e.g. `<<\"\\\"status\\\":\\\"NO_GO\\\", ...` and `process.exitCode=3` | Deliberate — every D-01 helper exits 3 / emits NO_GO even on a "complete observation" |
| env gates (`VCP_D01_WINDOWS_DISPOSABLE=...`, `VCP_D01_WINDOWS_OLD_DENIAL=...`, `VCP_TEST_REQUIRE_NATIVE_WINDOWS_SCRATCH`, `VCP_D01_DISPOSABLE_ISOLATION`) | explicit opt-in | e.g. `VCP_D01_WINDOWS_DISPOSABLE=I_ACCEPT_NEW_PROGRAMDATA_FIXTURE_ONLY` | Deliberate — no native helper runs without an explicit two-keyword opt-in; direct EXE invocation re-checks |

### Real gaps (markers + findings)

| File:line | Marker | Exact text (trimmed) | Assessment |
|---|---|---|---|
| `docs/STAGE12-D01-WINDOWS-PRINCIPAL-FIXTURE.md`:179 | UNPROVEN | `The new C++ source and JS receipt tests are **authored but not yet proven by MSVC or actual NTFS execution** on this exact HEAD.` | **Real gap** — no Windows host in this sandbox; MSVC build + NTFS runtime on `f4b6832b` is owed to the independent Windows agent |
| docs:~196 (dual-project section) | not-proven | `These portable contracts were additionally smoke-exercised in a standalone V8 harness ... That is **not** a native npm test or VS2019/NTFS acceptance run; the independent Windows agent remains responsible for final source-frozen native acceptance.` | **Real gap** — dual-inventory contract validated only in a standalone harness |
| docs:225-area | UNVERIFIED | `Actual helper build, native NTFS behavior, and independent Windows crash/recovery evidence are still unverified.` | **Real gap** — build receipts must be *observed* on a real toolchain, not just wired |
| docs:141 | not-proven | `Do not run old v0.9.3 through this code: none of these CLIs executes a published binary.` | **Real gap** — zero execution of published `vibe-coding-production@0.9.3` anywhere; the ten-scenario adversary matrix is plan-only |
| docs:25-30 area | UNPROVEN | A root in `ProgramData` may be replaceable by an old token with rights on `ProgramData` itself ... Root and ancestor `FILE_DELETE_CHILD` rights must be independently verified. | **Real gap** — parent-namespace confinement not established; SACL excluded from SD fingerprints by design |
| `test/d01-inspect-command.test.mjs`:29 (lib: `lib/d01-principal-boundary.mjs` `pathsFromRoot`/`assessLegacyPrincipalBoundary`) | failing test (finding, not a text marker) | `SyntaxError: Unexpected end of JSON input` → root cause: `E_D01_DUPLICATE_PATH` when protected paths overlap (`.vcp` + `.vcp/manifest.json`) | **Real defect, PR-new** — overlapping protected paths raise `E_D01_DUPLICATE_PATH` because `.vcp` is listed both as parent-ancestor and protected item. Reproducible 3/3 on Linux |

---

## (c) Phase-0 status table

Statuses are evidence-based. I ran the PR's new portable tests on this Linux sandbox (results: `windows-scratch-protocol` 7/7, `d01-principal-boundary` 10/10, `d01-linux-isolation-fixture` 4/4, 15-file batch 75 pass / 0 fail / 1 skip; `d01-inspect-command` 1/2 with the defect above). Anything needing a Windows host, root, or a power-loss rig is DEFERRED/UNVERIFIED — I did not run those.

| Component | Status | Missing Proof | Action |
|---|---|---|---|
| Native scratch helper C++ (`vcp-windows-fsops.cpp`, 589 lines) | IN-PROGRESS | MSVC build + actual NTFS execution on frozen `f4b6832b` | Windows host: `build:native-windows:verify-repro`, then `test:native-windows-candidate` with explicit opt-in |
| JS scratch-candidate wrapper (`windows-fs-provider-candidate.mjs`) | READY (per evidence) | none | Portable protocol/receipt tests already green on Linux |
| D-01 fixture provisioner C++ + receipt validators | DEFERRED | MSVC build receipt observed on real toolchain; execution under two real Windows principals | Independent Windows agent campaign per `docs/STAGE12-D01-WINDOWS-PRINCIPAL-FIXTURE.md` |
| Read-only token-inspect helper C++ | DEFERRED | same class of proof as above | same |
| Kernel-denial witness C++ | DEFERRED | same; note success ≠ published-0.9.3 denial (docs) | same |
| Protected-snapshot + namespace-inventory V2 C++ | DEFERRED | same; source-contract tests assert V2/ADS/SDDL markers in source only | same |
| Published-0.9.3 adversary plan (10 scenarios) | READY (plan construction only) | independent plan JSON + pinned tarball SHA-512 from publication evidence | operator-side |
| Evidence ingestion / review / correlation / dual-inventory CLIs | READY (per evidence) | native observation data (operator-side) | none until observations exist |
| Linux D-01 isolation fixture (`d01-linux-isolation-fixture.mjs`) | READY (per evidence; contract tests 4/4) | real kernel-DAC experiment needs root + `VCP_D01_DISPOSABLE_ISOLATION` opt-in | separate root-rig campaign; not executed here |
| `d01-principal-boundary.mjs` + `inspect-d01-boundary.mjs` | IN-PROGRESS | **defect**: `E_D01_DUPLICATE_PATH` on overlapping protected paths; `test/d01-inspect-command.test.mjs:29` fails 3/3 | fix in Phase 1 (dedupe ancestor/protected roles or reject-and-document), re-run the file |
| Native scratch acceptance test (`stage12-windows-native-scratch.test.mjs`) | DEFERRED | win32 + explicit opt-in run | covered by Windows host campaign |
| D-01 gate | DEFERRED (standing) | real old-CLI lifecycle under real Windows tokens; concurrency; crash/power-loss; owner approval | unchanged; never to be opened by this campaign |
| G-FENCE | NO-GO (standing) | managed-v2 writer authorization never granted; all new helpers hard-fail-closed | unchanged |
| Windows power-loss durability | DEFERRED / UNVERIFIED (standing) | power-loss rig; source comments explicitly deny `FlushFileBuffers` as proof | unchanged |
| Existing product code (Stage 12/13/14) | READY (untouched) | none — diff is 9139+/1-, all additions are harness/evidence code | none |

### Cross-cutting notes for later phases

- **No product-code drift**: the entire 9139-line diff is new evidence/scratch/D-01 harness; nothing in `lib/` production writers, migrations, or Stage 13/14 logic was modified. Phase-8 (full test campaign) should re-run `npm test` to confirm no regressions from the added files (e.g. accidental global hooks), plus the new suites.
- **One flake observed**: `d01-principal-boundary.test.mjs` failed once in a parallel batch run (`actual: 1, expected: 2` at file level) but passes 3/3 alone — likely resource contention under parallel subprocess spawning; Phase-8 should note it and re-run.
- **Reproducibility wiring exists but is unobserved**: every native helper has a `:verify-repro` build path and hash-pinned receipts, but no MSVC run on this HEAD has been seen — the receipts are construction contracts, not evidence yet.
- **Language check**: one minor English-wording artifact in source comments ("R3's scratch-only absolute rename workaround") references PR/round terminology; cosmetic only.
