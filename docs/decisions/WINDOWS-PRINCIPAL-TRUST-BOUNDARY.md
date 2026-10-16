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
| Impersonation token | `:128-132 DuplicateToken(SecurityImpersonation)` | relevant, see §5 |
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
