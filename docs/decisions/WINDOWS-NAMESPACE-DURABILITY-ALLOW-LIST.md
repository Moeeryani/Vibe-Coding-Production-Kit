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
choosing a friendlier directory), `DUR-02` (no caller-supplied authorization),
`DUR-03` (frozen value object).

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

Proven by `test/windows-durability-proof.test.mjs` (7/7 PASS) against the real
receipt contract, not assumed:

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
