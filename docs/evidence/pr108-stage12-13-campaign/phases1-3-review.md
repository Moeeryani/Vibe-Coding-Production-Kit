# Phases 1–3 Security Review — VCP Stage12/13 Build Completion Campaign

**Repo:** `Moeeryani/Vibe-Coding-Production-Kit`
**Branch:** `integration/stage12-stage13-native-windows-foundation-20261011` (PR #108, Draft)
**Frozen HEAD reviewed:** `f4b6832b8c732c2f544322d0615690021db800df` · **Base:** `de8faa19c6959c4188632e2e908909db485c3ef3`
**Gates (standing, untouched):** D-01 = DEFERRED, G-FENCE = NO-GO. No merge/release/push implications drawn.
**Method:** read-only static review in a Linux sandbox. **No Windows host exists here**, so every platform-specific behavioral claim (handle pinning actually preventing rename races, `FILE_FLAG_OPEN_REPARSE_POINT` nofollow behavior, SDDL stability on real NTFS, flush semantics, MSVC `/Brepro` reproducibility, exit-code paths on Windows) is marked **UNVERIFIED** — code-level reasoning only, never asserted as passing. The Windows-specific tests in `test/` are, for the native binaries, source-pattern assertions and pure-JS validator tests; they do not execute the C++ on Windows.

---

## PHASE 1 — Native Windows foundation (scratch-only helper)

### 1.1 Path/root rejection — checks present

| Requirement | Location | Verdict |
|---|---|---|
| UNC paths rejected | `scripts/native/vcp-windows-fsops.cpp:143-146` (`checkedRoot` requires drive-letter `X:\` form: `input.find(L':') != 1 \|\| input[2] != L'\\'` → reject) | Present |
| Parent traversal (`..`) rejected in root | `:143` (`input.find(L"..")` → reject) | Present |
| `/` separators rejected in root | `:144` | Present |
| Leaf names cannot traverse | `:80-92` (`allowedName` — `vcp-stage12-` prefix, char class `[a-z0-9._-]`, no `\`, `/`, `:`, trailing-dot/space refused) | Present |
| JS adapter stricter than native on names | `lib/windows-fs-provider-candidate.mjs:28-34` (`safeName` additionally rejects any `..`, `\\`, `/`, `:`) | Present |
| Unknown roots rejected | `:93-119` (`scratchRootUnderTemp` — direct child of OS TEMP, `vcp-win-native-scratch-` prefix, ≥6 alnum suffix, no separators) + `wmain` requires `checkedRoot && ntfsVolume` (`:480`) | Present |
| Non-NTFS volumes rejected | `:215-220` (`ntfsVolume` — `GetVolumeInformationW` must report `NTFS`) | Present |
| Reparse points rejected (symlinks, junctions, mount points) | ancestors: `:136` (`pinAncestorsNoRename`), `:162` (`checkedRoot` ancestor loop); root object: `:168-172` (`rootIdentity`); opened objects: `:228-231` (`normalOwnedOpen`); inventory sweep: `:205-206` (`safeInventory`); marker: `:187-188` (`readMarker`); all opens use `FILE_FLAG_OPEN_REPARSE_POINT` | Present |
| Unknown/marker-less roots refused | `:196-211` (`safeInventory` — exact marker file required, re-read via `readMarker`; any extra/non-allowlist entry fails) | Present |
| Ancestor handles pinned no-delete during op | `:117-139` (`pinAncestorsNoRename` — every ancestor opened without `FILE_SHARE_DELETE`, verified directory + non-reparse) | Present (UNVERIFIED behaviorally) |

### 1.2 Handle-identity verification — checks present

| Requirement | Location | Verdict |
|---|---|---|
| Identity primitive = volume serial + file index | `:173-177` (`sameIdentity`: `dwVolumeSerialNumber`, `nFileIndexHigh`, `nFileIndexLow`) | Present |
| Root identity pinned before AND after every op | `wmain :560-567`: `first` (pre-op) vs `last` (held handle post-op) vs `fresh` (re-opened root path post-op — the comments at `:555-559` explicitly reject "comparing only the held handle with itself" as meaningless) + post-op `safeInventory` | Present |
| Rename verifies same-object identity | `:286-297` (`verifyRenamedFileIdentity` — reopens new name, `normalOwnedOpen`, `sameIdentity` against pre-rename source handle, and old name must be gone) | Present |
| Rename enforces no-replace at kernel level | `:263-267` (`ReplaceIfExists=FALSE`; comment: never lstat+remove+retry) | Present |
| Rename re-validates target leaf + root at call site | `:254` (`allowedName(targetLeaf) && scratchRootUnderTemp(verifiedScratchRoot)`) before the absolute-path fallback | Present |
| Unlink/rmdir act on held handles, never re-lookup | `:517-532`, `:533-549` (open `DELETE`-capable handle → `normalOwnedOpen` → `disposeOwnedHandle` on the handle); post: `verifyRemovedName` `:299-304` | Present |
| Object type verified on open | `:228-231` (`normalOwnedOpen` checks directory-ness matches expectation, plus reparse + `nNumberOfLinks==1`) | Present |
| Write is create-new-only | `:381-401` (`CREATE_NEW`; write failure after create keeps `mayHaveMutated=true`, "partial file is deliberately retained") | Present |
| Directory flush is identity-gated | `:405-414` (`flushRoot` — re-verifies `rootIdentity` before `FlushFileBuffers`) | Present |

### 1.3 Phase 1 findings

**[MEDIUM] F-1.1 — Receipts carry no timestamp.** `printResult` (`:416-442`) emits `kind`, `protocolVersion`, `operation`, `completed`, flush flags, `mayHaveMutated`, `lastWin32Error`, the three hardcoded `false` durability flags, and (inspect-only) an entry observation — but no timestamp, and the JS adapter (`windows-fs-provider-candidate.mjs:121`) adds `nativeExitCode` without adding one either. Forensic correlation of scratch receipts against external timelines is impossible from the receipt alone. Concrete missing proof: a `timestamp`/`observedAt` field. (Same gap exists in the Phase-2 inventory receipt.)

**[LOW] F-1.2 — Mutating-op receipts do not publish the object's identity.** Only `inspect-entry` receipts include an `entry.identity` (`:432-440`, and only when `entry.known`). `write-exclusive`, `rename-no-replace` (which *does* verify identity internally at `:286-297` but doesn't emit it), `unlink`, `mkdir-exclusive`, `rmdir-empty` receipts contain no volume-serial/file-index of the affected object. A forensic analyst correlating receipts to later observations has the operation name but not the handle identity. Concrete missing proof: `identity` (24-hex, as used by `inspectScratchEntry`) on mutating-op receipts.

**[LOW] F-1.3 — `mkdir-exclusive` / `write-exclusive` verify the root post-op but not the created object's identity.** `rename` verifies pre/post identity; `write`/`mkdir` rely on `CREATE_NEW` semantics + post-op root identity + `safeInventory` (`:560-567`). There is no post-creation handle-identity capture of the new object in the C++ flow (recoverable via a subsequent `inspect-entry`, which the adapter does not force). Code-level reasoning only; UNVERIFIED on Windows.

**[LOW / documented] F-1.4 — Old-name absence checks are path-based.** `verifyRenamedFileIdentity` (`:294-297`) and `verifyRemovedName` (`:299-304`) use `GetFileAttributesW` on the old path (TOCTOU-able in principle). This is acknowledged in comments as post-verification forensics rather than an atomic guarantee; severity is low *only* because the whole helper is disposable-scratch research, never a production writer. Must not be carried into any production design.

**[INFO] F-1.5 — Absolute-path rename fallback is explicitly fenced and disclaimed.** `renameOwnedFileNoReplace` (`:234-284`) uses `RootDirectory=NULL` + absolute target as a documented Windows 11 build-26200 compatibility workaround, with a long comment stating it is NOT approved for managed writes and that a descriptor-bound design + D-01 approval would be needed. The defense-in-depth (leaf re-validation at `:254`, pinned no-delete ancestors, post-op identity verification) is present at code level. Acceptable in scratch scope; the risk is *future reuse* of this pattern — it should stay fenced behind this binary.

**[UNVERIFIED] F-1.6 — No-delete ancestor pinning vs NTFS sharing rules.** The claim that holding ancestors without `FILE_SHARE_DELETE` "narrows rename/swap windows" (`:113-116`) is plausible Win32 behavior but has no runtime proof artifact on the frozen HEAD in this sandbox. Treat as code-level reasoning only.

---

## PHASE 2 — NTFS namespace inventory V2

### 2.1 Identity (root/project/child) — checks present

| Requirement | Location | Verdict |
|---|---|---|
| Root ≠ project enforced natively | `scripts/native/vcp-windows-d01-namespace-inventory.cpp:399-436` (`wmain` requires both hex24 IDs, `identityMatches(root,…,rootId)` and `identityMatches(project,…,projectId)`; handles held open across `walk`; re-checked pre/post with `id(rootHandle.h)!=ascii(rootId)` failing) | Present (UNVERIFIED) |
| Root/project handles identity-pinned across walk | `:425-436` (before/after attribute + security + identity re-checks; test pins this ordering at `test/windows-d01-namespace-inventory.test.mjs:362-376`) | Present (code-level) |
| Duplicate identities rejected in receipts | `lib/windows-d01-namespace-inventory-evidence.mjs:52` (`rootIdentity===projectIdentity` → refuse), `:94-97` (single `identities` set seeded with root+project; any child identity collision → `E_D01_WINDOWS_INVENTORY_DUPLICATE`) | Present |
| Aliased root/project/child identities rejected | `:94-97` + test `test/windows-d01-namespace-inventory.test.mjs:378-395` (three aliasing variants) | Present |
| Case-insensitive aliasing rejected | `:98-101` (lowercased-path dedup set) | Present |
| Orphan entries rejected | `:103-108` (parent must be a known directory) | Present |
| Per-file identity re-verified after hashing | `:261-266` (pre/post `before`/`after` `GetFileInformationByHandle`: volume serial, file index, size, mtime must match) | Present (UNVERIFIED) |
| Unknown roots rejected | `:94-145` (`trustedRoot`: `vcp-win-d01-isolation-` + 32 lowercase-hex leaf directly under ProgramData, full-path normalization equality `root!=normalized` blocks 8.3/case aliasing, ancestor reparse scan, NTFS check) | Present |

### 2.2 ADS — checks present

| Requirement | Location | Verdict |
|---|---|---|
| Named ADS fail the scan | `:154-173` (`unnamedStreamOnly`): files must present exactly one stream named `::$DATA` with `NextEntryOffset==0`; anything else → `metadata()` fails (`:211-214`) → whole scan fails | Present (UNVERIFIED) |
| Enumeration failure never treated as success | `:159-165` — `GetFileInformationByHandleEx(FileStreamInfo)` failure returns `false` for files; for directories only the documented `ERROR_HANDLE_EOF` (no streams) is accepted. `walk`'s `FindFirstFileW` (`:308-311`) accepts only `ERROR_FILE_NOT_FOUND` as empty; `FindNextFileW` loop (`:352-356`) requires `ERROR_NO_MORE_FILES`. | Present |
| Unknown state never converted to clean state | every `unnamedStreamOnly`/`metadata`/`hashFile`/`walk` failure path returns `false` and aborts the run; receipt field `alternateDataStreamsRejected:true` is emitted only on the success path (`:468`) | Present |
| Directory empty-stream semantics distinguished from file ADS evidence | `:162-165` + commit `8e4e1d4` ("distinguish empty directory stream enumeration from file ADS evidence"); source-pattern test at `test/windows-d01-namespace-inventory.test.mjs:345-358` | Present |

### 2.3 Security descriptor — checks present

| Requirement | Location | Verdict |
|---|---|---|
| Canonical representation used (not raw pointers) | `:174-205` (`securityDigest`): `GetSecurityInfo(OWNER|GROUP|DACL)` → `ConvertSecurityDescriptorToStringSecurityDescriptorW` (SDDL, pointer-free) → BCrypt SHA-256. The comment at `:180-182` explicitly rejects hashing the raw descriptor buffer. | Present |
| Raw-descriptor hashing negatively tested | `test/windows-d01-namespace-inventory.test.mjs:333-343` asserts SDDL conversion is present and `reinterpret_cast<PUCHAR>(descriptor)` is absent | Present (source-pattern) |
| Security fingerprint re-measured pre/post per object | `:241`, `:269-273` (file: `originalSecurity` vs `finalSecurity`); `:413-436` (root/project) | Present |

### 2.4 Phase 2 findings

**[LOW] F-2.1 — No runtime fingerprint-stability test exists.** The only "stability" evidence is the source-pattern test at `test/windows-d01-namespace-inventory.test.mjs:333-343` (asserts the SDDL API is *called*, not that `securityDigest(h)` is deterministic across two calls on the same object, nor that it changes when the DACL changes). A genuine stability/discriminating test requires executing the native binary on Windows — UNVERIFIED here by environment, not by omission alone. Concrete missing proof: a Windows-run test hashing one object's SDDL twice (equal) and after a DACL mutation (different), with the digest recorded as evidence.

**[LOW] F-2.2 — SDDL fingerprints are principal/machine-specific.** `securityDigest` hashes the SDDL string including owner/group SIDs. Within one fixture this is a correct identity check, but any *cross-host* receipt comparison of `securitySha256` would false-positive on divergence (domain SIDs, well-known-SID textualization). `compareWindowsD01NamespaceInventories` compares `securitySha256` across before/after on the same fixture — fine — but receipts must never be treated as portable across machines. Recommend a comment/note on the receipt schema; no code defect.

**[LOW] F-2.3 — `walk` treats `ERROR_FILE_NOT_FOUND` from `FindFirstFileW` as "empty directory" (`:308-311`).** The comment restricts this to the single permitted status, and the directory handle is held open so the directory itself cannot vanish; a racing full-child-deletion would legitimately produce this. Acceptable, but it is the one place where an OS "not found" is interpreted rather than failed — worth keeping the comment's explicitness if this code is ever reused.

**[INFO] F-2.4 — Native binary exits 3 on success (`:474`).** This is the same deliberate NO-GO-by-design convention as the Stage-12 work (a successful observation must never look like a certified result). `scripts/inspect-windows-d01-namespace-inventory.mjs:83` requires `run.status===3` exactly. Consistent and fail-closed; noted for readers who expect exit 0.

---

## PHASE 3 — Receipts & evidence

### 3.1 Receipt schema and validation — checks present

| Requirement | Location | Verdict |
|---|---|---|
| Operation field | scratch: `printResult` `:421-424` (allowlisted op names `:448-458`); JS `checkReceipt` requires operation ∈ closed allowlist (`windows-fs-provider-candidate.mjs:43-45`) | Present |
| Outcome field | `completed` boolean (`:425`); JS requires `typeof completed==='boolean'` (`:46`) | Present |
| Failure state | `lastWin32Error` (`:430`), range-checked 0–0xffffffff (`:48`); JS maps exit 7 + completed to `E_DIRECTORY_SYNC_UNPROVEN` (`:112-117`) | Present |
| Forensic info | `mayHaveMutated` (`:428`); JS refuses to let a failed/mutating helper be read as a no-op (`:22-26`: `nativeOutcomeUnknown`, `requiresForensicInspection`) | Present |
| Identity | inspect-entry only (`:432-440` entry block); D01 inventory: per-entry `identity` + root/project identities | Partial (see F-1.2) |
| Timestamp | — | **MISSING** (see F-3.1) |
| Incomplete receipts rejected | JS `checkReceipt` (`:37-68`): exact kind, `protocolVersion===3`, all booleans typed, error range; D01: `FIXED` closed key set (`windows-d01-namespace-inventory-evidence.mjs:15-24`), every key required (`:27-28`), `entryCount===entries.length` (`:57`), `total===fileBytesHashed` (`:108-109`) | Present |
| Contradictory receipts rejected | `interpretWindowsScratchResult` (`:96-111`): op/receipt mismatch, mutating+completed without `mayHaveMutated`, exit-0 without completed, exit-0 without `directoryFlushReturned` (mutating ops), `inspect-entry` with `directoryFlushReturned` → all `E_WINDOWS_SCRATCH_HELPER_PROTOCOL` | Present |
| Impossible receipts rejected | D01: directory entries must have `sha256===null && size===0`, files must have 64-hex sha256 (`:72-75`); attribute bit 0x400 (reparse) refused at root/project (`:56-57`) and per entry (`:67`); directory bit must match type (`:68`) | Present |
| Unknown extra fields rejected | `onlyKnown` pattern in recovery decoders (`managed-recovery-v2.mjs:20-24`); `Object.keys(value).some(x=>!FIXED.has(x))` in D01 validator (`:26`) | Present |

### 3.2 No SUCCESS without proven durability — checks present

| Check | Location | Verdict |
|---|---|---|
| Exit 0 requires completed + directory flush | `wmain :583-588`: `if (!completed) return 6; if (op=="capabilities") return 0; return directoryFlush ? 0 : 7;` | Present |
| Flush failure is a hard nonzero with state preserved | exit 7 + comment at `:33-35` ("must retain state for forensic inspection"); JS throws `E_DIRECTORY_SYNC_UNPROVEN` with the receipt attached (`:113-117`) | Present |
| Durability flags hardcoded false in every receipt | `:430-431` (`directoryDurabilityProven:false`, `powerLossAttested:false`); JS re-asserts `!==false` → protocol violation (`:49-51`) and re-freezes them on output (`:121-122`) | Present |
| `capabilities` exit 0 is not durability evidence | comment at `:573-574` | Present |
| Comments disclaim Win32 completion/flush as durability proof | `:31-35`, `:37-40` | Present |

### 3.3 Migration gate & recovery — checks present

| Check | Location | Verdict |
|---|---|---|
| G-FENCE unconditionally blocks managed writes | `lib/managed-migration.mjs:47-51` (`assertManagedMigrationGate` always throws `E_G_FENCE_NO_GO`); gate constant frozen `NO_GO` (`:12-16`); called before writes in `cli.mjs:508`, `init.mjs:34,53`, `greenfield-apply-v2.mjs:27`, `managed-schema-migrator.mjs:45,103`, etc. | Present |
| Recovery decoders fail closed | `lib/managed-recovery-v2.mjs`: unknown fields refused (`:86`,`:118`), ID regex (`:19`), NFC+lowercase dedup against Windows case-aliasing (`:27`,`:128-131`), ancestor rejection (`:28-36`), backup/transaction identity cross-checks (`:148-149`,`:186-191`) | Present |
| Crash-before-commit vs crash-after-commit distinguished | `decideManagedRecovery` (`:330-348`): uncommitted → `restore-required` (write still unauthorized); committed → `committed-state-recognized` only with manifest-hash proof, cleanup never authorized by classification alone | Present |
| Committed state requires hash proof before cleanup | `inspectManagedRecovery` (`:240-258`): manifest bytes must hash to `committedManifestHash` AND `assertCommittedAdaptiveState` must pass (a hash-matching but malformed manifest is refused — comment at `:249-251`) | Present |
| Recovery planner is read-only | `lib/managed-recovery-plan.mjs`: returns classifications (`BLOCKED`/`COMMITTED`/`RECOVERABLE_CANDIDATE`) with `writeAuthorized:false` throughout; `planManagedSchemaRecovery` blocks on `BACKUP_BYTES_CHANGED`, `CONCURRENT_OR_USER_MANIFEST_EDIT`, schema-not-v1 | Present |
| Windows durability boundary explicit | `lib/file-durability.mjs:14-22`: `win32` → `supported:false, WINDOWS_NAMESPACE_DURABILITY_UNPROVEN`; `syncContainingDirectory` blocks on unsupported platforms and verifies directory identity before/after sync (`:50-66`) | Present |

### 3.4 Phase 3 findings

**[MEDIUM] F-3.1 — No timestamp on any native receipt.** Neither the scratch receipts (`printResult`, `:416-442`) nor the D01 inventory receipt (`vcp-windows-d01-namespace-inventory.cpp:439-475`) nor the JS envelope layers (`inspect-windows-d01-namespace-inventory.mjs:86-99`, `windows-fs-provider-candidate.mjs:121`) emit an observation time. The task checklist (operation, timestamp, identity, outcome, failure state, forensic info) is therefore 5/6 at best. Concrete missing proof: an `observedAt`/timestamp field emitted by the native binary (preferred, so the JS layer cannot backfill a misleading time).

**[LOW] F-3.2 — `interpretWindowsScratchResult` trusts stdout framing.** The receipt is `JSON.parse(run.stdout.trim())` (`windows-fs-provider-candidate.mjs:80`). Any stray stdout (none exists today — all diagnostics go through `printResult` or exit codes) breaks parsing, which fails closed to `E_WINDOWS_SCRATCH_HELPER_PROTOCOL`. This is safe as-is; the finding is only that there is no length-prefix or stderr/stdout separation contract if the binary ever gains logging — a future-proofing note, not a defect.

**[LOW] F-3.3 — `observation()` in `windows-scratch-recovery-assessment.mjs` accepts `sizeBytes` up to 2^64-1 (`:32-33`) while the native `inspectScratchEntry` emits real sizes; no defect, but the assessment layer's `DIGITS` regex permits values the native side can never produce, which weakens the "exact schema" posture slightly.** Minor.

**[INFO] F-3.4 — Envelope correlation is strict but unsigned.** `compareWindowsD01NamespaceInventoryEnvelopes` requires the JS review to be byte-identical (`JSON.stringify` equality) to the validated native receipt (`windows-d01-namespace-inventory-comparison.mjs:54-56`) and pins executable hashes — but explicitly records `nativeBinaryActuallyPinnedDuringScanProven:false` and `externalObservationSignaturesVerified:false`. Honest labeling; no defect.

---

## DONE WELL (defensive strengths)

1. **Identity-first, path-second.** The rename/unlink/rmdir flows open the object, verify its handle identity/type, operate on the handle, then re-verify — never "check one pathname, act on another" (`:234-284`, `:517-549`). The inventory holds root/project handles across the whole walk and rejects aliasing at both the native and receipt-validation layers.
2. **`mayHaveMutated` discipline.** Every mutating attempt sets the flag *before* the OS call; the JS adapter treats unknown outcomes as "may have mutated, inspect forensically, never roll back blindly" (`:22-26`, `:89-95`). The classic "failed = no-op" fallacy is structurally excluded.
3. **Enumeration failure is never success.** `FindNextFileW`/`GetFileInformationByHandleEx`/`FindFirstFileW` error paths are enumerated explicitly and fail the run; the one permitted empty-enumeration status is named and justified (`fsops.cpp:207-210`, inventory `:159-165`, `:308-311`).
4. **Receipt protocol strictness.** Closed op allowlists, closed key sets, type/range checks, cross-field coherence (exit code ↔ completed ↔ flush flags ↔ mutation flags), and hardcoded `false` on every authority/durability/approval claim. Impossible receipts are refused, not normalized.
5. **Durability honesty.** No code path emits success-as-durability: exit 7 on flush failure, `E_DIRECTORY_SYNC_UNPROVEN`, hardcoded `directoryDurabilityProven:false` / `powerLossAttested:false`, and comments that say plainly that Win32 completion and `FlushFileBuffers` prove nothing about power loss.
6. **SDDL canonicalization.** The inventory hashes the SDDL serialization rather than the raw `GetSecurityInfo` buffer, with a comment explaining exactly why the raw buffer is unstable (`:180-182`) — the right call, borrowed from the "canonical form before hashing" playbook.
7. **Fences stay fences.** `assertManagedMigrationGate` is unconditional; `file-durability.mjs` reports Windows unsupported rather than attempting a fake implementation; the candidate provider's `windowsNativeCandidateStatus()` and every receipt repeat `managedMutationAuthorized:false`, `d01Approved:false`. Nothing in this diff moves D-01 or G-FENCE.
8. **Case/Unicode aliasing awareness in recovery.** NFC+lowercase dedup and ancestor rejection in `managed-recovery-v2.mjs` show the Windows threat model (case-insensitive, Unicode-normalizing hosts) was carried into the Linux-side decoders too.

---

## Residual risks / open items (not defects in this diff)

- **All Windows behavioral proofs UNVERIFIED** in this sandbox: ancestor pinning efficacy, `FILE_FLAG_OPEN_REPARSE_POINT` nofollow, SDDL digest stability/discrimination at runtime, NTFS flush semantics, MSVC `/Brepro` reproducibility, and the exit-code paths of both native binaries. These need a real Windows host before any claim beyond code-level reasoning.
- **F-1.1/F-3.1 (timestamps) and F-1.2 (identity on mutating receipts)** are the two concrete receipt-schema gaps against the runbook's checklist; both are small, additive, and safe to fix without touching any gate.
- **F-2.1**: the SDDL stability test should be a runtime test on Windows, not only a source-pattern assertion.
- No findings in this review warrant changing D-01 (stays DEFERRED) or G-FENCE (stays NO-GO).
