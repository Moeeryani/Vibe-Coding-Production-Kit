# Windows Principal Trust Boundary — Unresolved Design Decision

**Status:** PROPOSED. Not approved, not decided, not implemented.
`D-01 = DEFERRED`, `G-FENCE = NO-GO`, `Production Writers = DISABLED`,
`WINDOWS_PRINCIPAL_PROVIDER = null`, `B-2 = NOT_PROVEN`,
`Windows elevation = NOT AUTHORIZED` — **unchanged by this document.**
**Owner decision required:** Moeeryani.
**Date:** 2026-10-17 · **Base:** branch `b36b0997` · **Snapshot:** `bfc23a7d…614a24`

## 1. The problem

`lib/production-writer.mjs:94` calls `verifyPrincipal(boundary.principal, currentPrincipal())`
between authorization and mutation. On win32 this can never succeed:
`lib/writer-identity.mjs` returns `{kind:'windows', sid:null, proven:false}`
unconditionally, so `verifyPrincipal` throws `E_WRITER_PRINCIPAL_UNPROVEN`.

That fail-closed behaviour is **correct**. The problem is that there is currently
no legitimate way to change it, and the codebase contains a misleading pointer:
the module comment claimed a "native token helper" was required, while the module
imported only `node:fs/promises` and `node:path` and called nothing. Fixed in this
campaign — the reason is now `NO_NATIVE_PROVIDER_CONFIGURED`, and
`principalProofStatus()` reports the seam explicitly.

## 2. What exists, and what it actually proves

`scripts/native/vcp-windows-d01-token-inspect.cpp` (D-01 chain only, consumed by
`lib/windows-d01-token-evidence.mjs` and `lib/windows-d01-fixture-matrix.mjs`):

| Mechanism | Source | Reusable for the writer? |
|---|---|---|
| Real process token | `:268 OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY\|TOKEN_DUPLICATE)` | technique yes |
| Real account SID | `:117-124 GetTokenInformation(TokenUser)` → `ConvertSidToStringSidW` | **yes — this is the missing datum** |
| Impersonation token | `:131 DuplicateToken(primary, SecurityImpersonation, …)` | relevant, see §4.4 |
| D-01 scratch-root gates | `:260-266 safeRoot ∧ noReparseAncestors ∧ ntfs ∧ validMarker`, else exit `3` | **no** |
| Ancestor ACL walk | `:285-300` drive-root + `ancestor-N` | **no**, D-01 evidence |
| Declared posture | `:257-258 accessCheckOnly:true`, `oldPrincipalActualMutationDenialUnproven:true` | read-only by design |

So the technique is proven to exist in-tree, but the binary is a **CLI bound to the
D-01 fixture protocol**, not an in-process identity provider.

## 3. Candidate designs, and why none is free

**A. In-process native addon (N-API).** `OpenProcessToken` on the current process,
no external resolution.
- *Pro:* no executable to swap; the kernel is the only authority.
- *Con:* adds a compiled dependency to a pure-JS npm package, a build matrix
  (MSVC is present on this host via VS 2019 BuildTools), prebuild distribution,
  and a supply-chain surface. Needs `engines`/install-script policy review.

**B. Spawn a helper and read its stdout.**
- **REJECTED.** The executable is resolved through `PATH`; an attacker with write
  access to any `PATH` entry swaps the binary that produces the "proof". The
  proof becomes the thing that needs protecting.

**C. Spawn with an absolute path.**
- **REJECTED as sufficient.** Still racy between path resolution and exec, and the
  helper's *file identity* would itself need pinning — which requires the
  `(dev,ino)` + published-hash machinery that `windows-durability-contract.mjs`
  marks `publishedImplementationHashVerified:false`. Also a helper cannot report
  its *parent's* token unless the parent's handle is passed and trusted, which
  reintroduces the forgery problem.

**D. `whoami /user`, `os.userInfo()`, env vars.**
- **REJECTED.** `whoami` is PATH-resolved (see B). `os.userInfo()` returns a
  *username*, not a SID, and usernames are not security identifiers. Env vars are
  caller-controlled and explicitly forbidden.

**E. Stay null (status quo).** Fail closed, Windows writer unusable.
- *Pro:* zero new attack surface; already the behaviour.
- *Con:* Windows transaction-path acceptance is unreachable by construction.

Only **A** provides real identity without moving the trust problem elsewhere.

## 4. What makes a provider trustworthy — required properties

1. **Non-injectable.** Not a function parameter. The current implementation uses a
   module constant (`WINDOWS_PRINCIPAL_PROVIDER = null`, `writer-identity.mjs`),
   deliberately mirroring why the `authorize` injection parameter was removed
   (`production-writer.mjs:66-69` M-3 fix). Making it a parameter would be a new
   bypass primitive.
2. **Not env-var influenced.** No variable may select, enable, or override it.
3. **Kernel-sourced.** SID from the process's own primary token, never from
   configuration, argv, or stdin.
4. **Primary vs impersonated.** Must distinguish `TOKEN_PRIMARY_TOKEN` from an
   impersonation token, and report `TokenLinkedToken` and restricted-token status.
   Without this, a writer could claim the identity of an impersonated client.
   Note the D-01 helper *deliberately* duplicates an impersonation token
   (`:128-132`) for ACL observation — so the distinction is live, not theoretical.
5. **Fail closed on any ambiguity** — missing addon, short read, version skew,
   non-win32, all → refuse.
6. **Pinned implementation identity.** The binary's hash must be recorded and
   verifiable (`publishedImplementationHashVerified`), or "the helper was not
   swapped" is unprovable.
7. **Auditability.** `recordWriterEvidence` must log the SID it verified
   (`describePrincipal` already emits `windows:sid=…`) so the audit trail records
   *which* principal performed the write.

## 4bis. Evidence forgery risks, and the precedent that already bit this campaign

A principal claim is only worth what its weakest link is worth. Every design above
moves the forgeable artifact around rather than eliminating it, so the risk list has to
be explicit before any provider is accepted.

**This is not hypothetical here.** The same campaign found and fixed a structurally
identical defect in fixture teardown: `removeOwnedFixture` authorized a recursive delete
from a marker file that only restated its own path, so any directory carrying a
well-formed marker could be deleted — reproduced, with data destroyed. The fix was to
require a vouch that the directory **cannot** self-certify: an in-process registry plus a
per-fixture random token minted by the creator, so reading the marker off disk transfers
no authority (`OWN-10`–`OWN-13`, including a cross-process test where the attacker holds
a completely legitimate marker and token). A principal provider that accepts a
caller-supplied SID would repeat exactly this mistake at a higher stakes.

Forged-able today, by anyone with normal user-level access:

| vector | what it buys | status |
|---|---|---|
| PATH-resolved helper (design B) | arbitrary "proof" of any SID | rejected |
| Absolute-path helper, unpinned (design C) | same, if the file is swapped between resolve and exec | rejected as insufficient; needs `publishedImplementationHashVerified`, currently `false` |
| Caller-supplied principal object | writer accepts an identity the caller chose | already refused and tested (`WIN-02`, pinned-principal self-certification) |
| `process.platform` rewritten in-process | spoof the platform branch of any guard | not proof: `mutationTest`'s platform self-report is explicitly labelled spoofable, and the durability guard still fires at the real syscall |
| Env var / CLI flag selecting a provider | switch identity policy at runtime | forbidden; `WINDOWS_PRINCIPAL_PROVIDER` is a module constant, mirroring the M-3 removal of the `authorize` callback (`production-writer.mjs:66-69`) |
| Captured SID string replayed | claim a previously observed principal | a SID string alone is not proof of *being* that principal; §4.3 requires the process's own token |
| Audit log text | make a record *look* verified | `recordWriterEvidence` must emit the SID it actually verified, not a caller-provided label |
| Test capability as an identity backdoor | use the controlled-test path to reach production identity | the test path is fenced separately: `E_TEST_CAPABILITY_REVOKED`, scope checks, identity re-verification, and production entrypoints still hit `E_G_FENCE_NO_GO` without a capability (Tests 2–6) |

Required properties for any accepted provider, restated as anti-forgery rules:
the datum must come from the **kernel about this process**, be **unselectable** by
configuration, carry **implementation identity** that can be pinned, **refuse on
ambiguity**, and be **attributed** in evidence by the mechanism that produced it — not
by a string a caller supplied. A negative test must demonstrate that a forged input is
rejected; a provider whose only evidence is a passing positive test is not accepted.

## 5. Independent requirements not yet met anywhere

- A `windows-fs-provider` equivalent to `LinuxFsProvider` (no Windows no-replace
  directory primitive exists; `native-no-replace.mjs:14-19` refuses win32).
- Namespace durability proof per `windows-durability-contract.mjs`, including
  `realPowerInterruptionReplayed:true`, which **no software test can supply**.
- An open-time reparse refusal (`FILE_FLAG_OPEN_REPARSE_POINT`): `O_NOFOLLOW` is
  `undefined` on win32 and 22 `?? 0` sites are silent no-ops. Measured: `lstat`
  reports reparse points but `open()` still traverses them, so today's protection
  is pre-check-only and racy.

## 6. Decision requested from the owner

1. **Approve design A and accept its supply-chain cost** — signed, pinned,
   prebuilt native addon, or explicitly nothing for Windows?
2. **Or ratify design E permanently** — Windows is out of scope for the v2 writer,
   D-01 stays DEFERRED on Windows, and the fail-closed path becomes the product
   answer rather than a gap to close.
3. **Impersonation policy** — must the writer require a primary token and refuse
   impersonated execution? (Recommended yes, but it is product behaviour.)
4. **Boundary hardening** — should `verifyWriterBoundary` *refuse* an unproven
   principal at step 1 instead of snapshotting it and failing at step 4? This
   changes when failures surface; today the boundary returns `ok` with
   `proven:false`, which is why `writer-identity.test.mjs` previously failed on
   Windows.
5. **Trust anchor** — who builds, signs, and publishes the addon, and how is its
   hash pinned in the package?

## 7. Explicitly out of scope here

This document does not enable production writers, does not lift G-FENCE, does not
change D-01, and does not authorize elevation. No provider is wired. Nothing in
this campaign turned an `INCONCLUSIVE` into a `PASS` by assumption: Windows
principal remains **NOT_IMPLEMENTED / NOT_PROVEN**, fail-closed, by design.
