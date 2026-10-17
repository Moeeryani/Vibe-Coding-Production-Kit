# Namespace Durability Capability: Allow-list, and the Darwin Consequence

**Status:** PROPOSED. The code change is already in this branch and is **fail-closed**;
the *policy* question below is not decided.
`D-01 = DEFERRED`, `G-FENCE = NO-GO`, `Production Writers = DISABLED`,
`B-2 = NOT_PROVEN` — **unchanged by this document.**
**Owner decision required:** Moeeryani.
**Date:** 2026-10-17 · **Base:** `b36b0997` · **Snapshot:** `bfc23a7d…614a24`

## 1. The defect that was fixed

`lib/file-durability.mjs` previously refused only the exact string `'win32'` and
returned `supported: true` for **everything else**:

```js
if(platform==='win32') return {supported:false, ...};
return {supported:true, ...};   // <-- darwin, undefined, 'windows', 'WIN32', typos
```

`assertLifecycleDurabilitySupported()` and `syncContainingDirectory()` both derive
from this, and they are called by `lifecycle-lock-v2.mjs:95` and `safe-replace.mjs:34`.
So any platform string that was not literally `'win32'` silently claimed that
directory-fsync durability was available. An omitted or undefined argument, a
future OS, or a typo was treated as proven.

This was found by writing a negative test first (`DUR-02`), which failed against
the shipped code — it is a real fail-open, not a hypothetical.

## 2. The change now in the branch

An allow-list, with the allow-list tested **first** so that reason strings are
attributed correctly:

```js
const DURABLE_PLATFORMS = Object.freeze(['linux']);
if(DURABLE_PLATFORMS.includes(platform)) → supported:true
if(platform==='win32')                  → WINDOWS_NAMESPACE_DURABILITY_UNPROVEN
else                                    → NAMESPACE_DURABILITY_PROVIDER_UNREVIEWED
```

Verified behaviour on this host (`node`, direct probe):

| input | supported | reason |
|---|---|---|
| `'win32'` | false | WINDOWS_NAMESPACE_DURABILITY_UNPROVEN |
| `'darwin'` | **false** (was true) | NAMESPACE_DURABILITY_PROVIDER_UNREVIEWED |
| `'linux'` | true | DIRECTORY_FSYNC_PROBE_REQUIRED |
| `null`, `''`, `'windows'`, `'WIN32'`, `{}` | false | NAMESPACE_DURABILITY_PROVIDER_UNREVIEWED |

Tests: `DUR-01` (win32 refusal is root-independent, so it cannot be dodged by
choosing a friendlier directory), `DUR-02` (no caller-supplied authorization; the
omitted-argument case is asserted platform-relatively rather than as a fixed
expectation, because it hits the default parameter), `DUR-03` (frozen value object),
`DUR-03b` (an unreviewed platform is refused under its **own** reason, never the
Windows label), `DUR-11` (a platform refusal reason has exactly one source; guard
sites may pass only filesystem failure-mode tokens).

## 3. Why this is the correct reading of existing intent

The repo already treats darwin as unproven elsewhere:

- `lib/native-no-replace.mjs:15` — *"Linux-only production provider. win32/darwin
  stay fail-closed until a reviewed native provider with independent durability
  proof exists."*
- `lib/linux-fs-provider.mjs:6` — the reviewed primitives (`renameat2`,
  `O_NOFOLLOW`-pinned chains, directory fsync) are named as **Linux** mechanisms.

So the old `supported: true` for darwin contradicted the codebase's own documented
position. The allow-list makes two files agree.

## 4. The consequence the owner must decide on

**This silently changes macOS behaviour.** On darwin, `acquireLifecycleLock()` and
`safe-replace` mutations now refuse with `E_DIRECTORY_SYNC_UNPROVEN` where they
previously proceeded. Two call sites are affected:

- `lib/lifecycle-lock-v2.mjs:95` (`assertLifecycleDurabilitySupported`)
- `lib/safe-replace.mjs:34` (same)

There is no darwin CI lane in `.github/workflows/validate.yml` (ubuntu-latest only),
and no darwin evidence in any campaign in this workspace. So we are tightening a
platform we have **never measured** — which is the right direction for a
fail-closed guard, but it is a product-behaviour change for macOS users and should
be a conscious decision rather than a side effect of a Windows campaign.

**Inconsistency also now visible** (pre-existing, not introduced):
`native-no-replace.mjs:40` accepts `'darwin'` in its *plan* allow-list while
`:17` refuses to select any non-linux provider — a darwin caller gets
`E_NATIVE_NOREPLACE_UNAVAILABLE` after a plan that said it was supported. Worth
aligning in the same decision.

## 5. Completion is not durability (Phase F item 6)

Proven by `test/windows-durability-proof.test.mjs` (8/8 PASS on this host, win32) plus
`test/writer-durability-guard.test.mjs` (5/5) against the real receipt contract, not
assumed:

- `checkReceipt()` **rejects** any receipt with
  `directoryDurabilityProven:true`, `managedMutationAuthorized:true`, or
  `powerLossAttested:true` (`windows-fs-provider-candidate.mjs:59-61`). The wire
  protocol cannot express a durability claim at all — this is stronger than a
  policy check, because a compromised helper cannot lie in its schema.
- Native exit 7 with `completed:true` and `directoryFlushReturned:false` maps to
  `E_DIRECTORY_SYNC_UNPROVEN` (`:112-117`): a **successful** operation is still
  refused.
- A well-formed completed receipt still returns
  `directoryDurabilityProven:false, managedMutationAuthorized:false`.
- `windowsNativeCandidateStatus()` reports
  `productionBackendConnected:false`, and is imported only by two scratch tests,
  never by `lib/`.
- `assessWindowsDurabilityEvidence()` returns `NO_GO` when
  `realPowerInterruptionReplayed:false` even with all 9 phases green, and its
  **ceiling** when everything is satisfied is `NATIVE_PROVIDER_REVIEW_CANDIDATE`
  with `mutationAuthorized:false` — the contract can never self-authorize.

## 5.1 What `FlushFileBuffers` does and does not give VCP

`handle.sync()` in Node maps to `uv_fs_fsync`, which on Windows is
`FlushFileBuffers(handle)`. Its guarantees, and the gap VCP depends on:

| claim | true? | consequence for VCP |
|---|---|---|
| Flushes that **file's** dirty data and metadata to the volume | yes | the renamed-into-place file's own bytes are pushed |
| Flushes the **parent directory entry** that names the file | **no** | the namespace mutation this writer performs is exactly the thing left unflushed |
| Works on a directory handle obtained the way VCP opens things | **not established** | `fs.open(dir)` on win32 does not yield a usable directory handle; `constants.O_DIRECTORY` and `constants.O_NOFOLLOW` are `undefined` on win32, so the `?? 0` in VCP's open calls is a **silent no-op** (22 sites measured by `lib/no-replace-capability.mjs`) |
| Reaches the physical medium | **no** | the drive's own volatile write cache can answer success while holding data (ATA `FLUSH CACHE`, SCSI `SYNCHRONIZE CACHE` are below the API) |
| Needs `GENERIC_WRITE` on the handle | yes | a read-only handle cannot flush, so a "verified" flush can be a no-op depending on how the handle was opened |

Directory flush is the entire requirement. A file-level flush after a rename proves
the file exists somewhere; it does not prove the *directory index* survives. That is
why `completed:true` on an operation is refused by this guard, and why exit 7 with
`directoryFlushReturned:false` maps to `E_DIRECTORY_SYNC_UNPROVEN`.

## 5.2 What an NTFS namespace durability provider would have to supply

1. **A real no-replace create/rename.** VCP has none on Windows:
   `lib/native-no-replace.mjs:17` refuses any non-linux provider
   (`E_NATIVE_NOREPLACE_UNAVAILABLE`), because `renameat2(RENAME_NOREPLACE)` is a
   Linux mechanism. `MoveFileEx` without `MOVEFILE_REPLACE_EXISTING` is check-then-act,
   not a kernel-level no-replace guarantee.
2. **Open-time reparse rejection.** `FILE_FLAG_OPEN_REPARSE_POINT` at open, not an
   `lstat` pre-check. Measured on this host: `lstat` reports a reparse point but
   `open()` still traverses it, so today's protection is racy by construction.
3. **Object identity pinning across the mutation** — `(dev,ino)` is meaningful on
   NTFS (Node maps the 128-bit file ID), and VCP already uses it, but a provider must
   re-verify *after* the flush, not only before.
4. **Directory-index flush with a returned status** the receipt can carry truthfully.
5. **Implementation identity pinning.** `publishedImplementationHashVerified:false`
   today, so "the binary that ran is the binary that was reviewed" is unprovable.
6. **No kernel transaction to lean on.** Transactional NTFS was removed in Windows 10
   1709; there is no atomic-namespace facility to substitute for the above.

## 5.3 Failure scenarios, and which ones software can actually reproduce

| scenario | reproducible by a test? | VCP status |
|---|---|---|
| Process killed mid-mutation (`SIGKILL`) | **yes** | covered by `writer-controlled-concurrency` / `writer-child-kill`; currently **INCONCLUSIVE on win32** because the transaction cannot start |
| Lock holder dies, stale lock not auto-reaped | **yes** | `writer-concurrency` test exists; guard-blocked here |
| Torn/partial file content visible after crash | **yes, in principle** | guard-blocked here |
| OS crash / bugcheck | **no** | needs a reboot harness |
| Power loss during write-back | **no** | needs physical switching (PDU/IPMI); this is `realPowerInterruptionReplayed`, and `assessWindowsDurabilityEvidence` returns `NO_GO` without it even with all 9 phases green |
| Drive volatile write cache answered success but lost data | **no** | below the API; only hardware or a cache-flush-capable device can prove it |
| Deferred page write-back after `sync()` returned, then OS crash | **no** | the classic "flush lied" case |

The bottom three are why B-2 stays `NOT_PROVEN` and why no amount of additional
software testing on this host can raise the ceiling above
`NATIVE_PROVIDER_REVIEW_CANDIDATE`.

## 5.4 The darwin case, stated precisely

The allow-list refuses darwin, which also means VCP makes **no claim** about macOS
semantics it has not measured. For the record, the reason darwin could not simply be
added: `fsync()` on macOS does not force a drive's volatile cache to flush —
`F_FULLFSYNC` is the operation that attempts that, and on APFS/SSD it may be
short-circuited when the device reports no cache, while `F_BARRIERFSYNC` orders
writes without persisting them. VCP's guard path calls `handle.sync()`, i.e. plain
`fsync`. So a darwin allow-list entry would rest on a flush primitive whose
durability properties differ from the reviewed Linux provider's, with zero darwin
evidence in any CI lane (`validate.yml` is ubuntu-latest only).

## 5.5 What an independent validator must actually run

- **Linux:** execute the 25 rows currently INCONCLUSIVE on Windows, and confirm the
  capability guard does **not** fire there — `DUR-08b` asserts the opposite branch, so
  an over-broad guard is caught on Linux rather than hidden by a Windows refusal.
- **Windows:** a reviewed native provider must supply §5.2 items 1–5, plus
  `realPowerInterruptionReplayed:true` from hardware switching and a pinned
  implementation hash. Anything less tops out at `NATIVE_PROVIDER_REVIEW_CANDIDATE`
  with `mutationAuthorized:false`.
- **darwin:** either measure a `F_FULLFSYNC`-backed provider, or ratify the refusal in
  §6 option 1/3. No third path is evidence-supported.

## 6. Decision requested

1. **Ratify the darwin tightening** (recommended: it matches documented intent and
   fail-closed posture), and add a `darwin` note to the release/docs surface; or
2. **Add darwin to the allow-list** — but that requires the same evidence standard
   as Linux (a reviewed provider plus a directory-fsync probe), which does not
   exist today; or
3. **Explicitly scope VCP's lifecycle writer to Linux** and document macOS/Windows
   as unsupported for v2 writes, so users get a designed answer instead of a
   guard that looks like a bug.

Also decide whether to align `native-no-replace.mjs:40` with `:17` so darwin is
refused at the plan stage rather than after planning.

## 7. Unchanged

`E_DIRECTORY_SYNC_UNPROVEN` remains. Nothing in this campaign removed, stubbed,
env-var-gated, or inverted a durability guard; B-2 real power-loss durability
remains NOT_PROVEN and is a separate requirement that no software test on this
host can satisfy.
