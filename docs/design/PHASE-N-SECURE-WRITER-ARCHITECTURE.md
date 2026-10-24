# Phase N — Secure Native Writer Architecture

Status: implemented on the Phase N development branch; SEC-FINDING-002
stays **OPEN** until independent validation passes on the frozen
Phase N candidate. Gates unchanged: D-01 = DEFERRED, G-FENCE = NO-GO,
B-2 = NOT_PROVEN, WINDOWS_PRINCIPAL_PROVIDER = null,
PRODUCTION_WRITERS = DISABLED.

## 1. Requirement restatement

Resolve the production namespace TOCTOU in
`docs/SECURITY-FINDING-002-INTERMEDIATE-SYMLINK-TOCTOU-20261023.md`:
`lib/writer-atomic.mjs` verified the target path with an `lstat()`
walk and then mutated through path-based `open()`/`rename()`. Linux
applies `O_NOFOLLOW` to the final component only, so an intermediate
directory swapped for a symlink between the check and the use
redirected the write outside the root. The remediation must be
descriptor-relative end to end, must not weaken authorization,
durability, identity, journal or recovery guarantees, must keep
Windows fail-closed, and must not become a caller-controlled bypass.

Planning classification (repo AGENTS.md §2): every material question
was DISCOVERABLE from repository evidence (the finding document
prescribes the dirfd pattern and names the existing native helper as
already implementing it) or PROPOSABLE as a reversible engineering
default (error-code mapping, destination-symlink refusal). No HUMAN
DECISION boundary was crossed: no gate changed, no writer was
enabled, no platform was newly authorized.

## 2. Architecture

```
production-writer.mjs  (authorization: gate OR verified test capability)
        |  mutate({ atomic: { writeFile } })
        v
writer-atomic.mjs      (validation, namespace pre-check, receipt check)
        |  selectSecureWriterProvider()   <- lib/secure-fs-provider.mjs
        v
LinuxFsProvider        (receipt contract, sync + identity verification)
        |  spawnSync, JSON protocol
        v
scripts/native/vcp-linux-fsops
  open(root, O_RDONLY|O_DIRECTORY|O_NOFOLLOW)          -- pinned root fd
  openat(dirfd, part, O_RDONLY|O_DIRECTORY|O_NOFOLLOW) -- every component
  openat(parentfd, tmp, O_CREAT|O_EXCL|O_NOFOLLOW)     -- staging
  renameat(srcParentFd, tmp, dstParentFd, name)        -- commit
  fsync(file) / fsync(parentfd)                        -- acknowledgment
```

Security contracts, one per anchor named in the mission:

- **Root anchor.** The helper opens the root once with
  `O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC` and `fstat`-verifies a
  directory. A symlinked root is refused. The pin authenticates
  everything *below* the root from the moment of the open; it does
  not authenticate the root path's own ancestors (see §6, residual
  risks) — the writer boundary's root identity pinning covers the
  transaction-level root.
- **Intermediate components.** Each is opened with
  `openat(O_RDONLY|O_DIRECTORY|O_NOFOLLOW)` from the previous pinned
  descriptor. A symlink, a non-directory, or a vanished component
  aborts the operation with the OS errno preserved (Phase N helper
  change: resolution failures now propagate `errno` instead of
  collapsing to a usage error, so ELOOP is classifiable).
- **Destination parent.** The parent whose descriptor is used for
  staging, rename and fsync is the pinned descriptor itself; renaming
  the parent *path* mid-operation cannot redirect the commit, which
  is bound to the descriptor, not the name.
- **Staging file.** Unique provider-pattern name in the pinned
  parent, `O_CREAT|O_EXCL|O_NOFOLLOW`, exact mode via `fchmod` on
  the pinned descriptor, payload fsync, parent fsync — all before the
  rename. A pre-existing staging name is an exclusive-create refusal.
- **Rename.** `renameat()` between pinned parents (replace
  semantics). The kernel never follows a destination symlink in a
  rename; it replaces the directory entry. On top of that, the
  provider refuses a non-regular-file destination up front
  (policy, §4). `renameat2(RENAME_NOREPLACE)` remains the contract
  for the no-replace operations.
- **Receipt.** Issued only when staging reported data+directory
  sync, the rename reported both parents synced, and a post-rename
  `stat` through the pinned chain shows the destination is the same
  object (dev, ino) as the staged file with exact size and mode.
  Any deviation fails closed; no receipt is produced.

## 3. Provider boundary (lib/secure-fs-provider.mjs)

- Selection reads `process.platform` inside the module. There is no
  parameter for provider, helper path or platform, and no fallback:
  the same anti-injection reasoning that removed the `authorize`
  parameter from `runWriterTransaction` and keeps
  `WINDOWS_PRINCIPAL_PROVIDER` a module constant.
- Linux → `LinuxFsProvider` over the in-repo helper. The helper must
  be a regular, non-symlink, executable file (verified by `lstat` at
  selection); a missing helper refuses with build instructions.
- Windows → no provider (`E_SECURE_PROVIDER_UNAVAILABLE`). Wiring a
  Windows provider requires an independently reviewed native
  implementation with equivalent guarantees, and this module is
  where that visible edit would land.
- macOS / other → no provider. The `/proc/self/fd` emulation was
  considered and **rejected**: it is an unreviewed security-sensitive
  path mechanism, magic-link semantics differ per filesystem, and a
  path re-resolution is not a descriptor-relative rename.
- `secureWriterProviderStatus()` is descriptive only (mirrors
  `principalProofStatus()`); it authorizes nothing.

## 4. atomicWriteFile() vs LinuxFsProvider.replaceFileAtomic()

The two were NOT interchangeable in the baseline. Every difference
found, and its disposition:

| Aspect | atomicWriteFile (baseline) | replaceFileAtomic (baseline) | Phase N disposition |
|---|---|---|---|
| Containment | lstat walk + path open/rename (TOCTOU, SEC-FINDING-002) | pinned openat/renameat chain | Adopted the pinned chain for the writer |
| Size limit | 8 MiB (`E_ATOMIC_BYTES`) | helper cap 64 MiB | Writer keeps its 8 MiB pre-limit |
| Default mode | 0o644 | 0o600 | Writer always passes its mode explicitly; provider default untouched (stage13 compat) |
| Mode range | 0..0o777 (`E_ATOMIC_MODE`) | helper accepts up to 0o7777 | Writer pre-validates 0..0o777 |
| Component charset | any except `.`/`..`/empty | `[A-Za-z0-9._-]{1,128}`, depth ≤ 32 | **Accepted restriction, fail-closed**: provider-refused names map to `E_ATOMIC_PATH`. All in-repo writer callers inventoried (§5) use compatible names. Recorded as a compatibility limitation, not hidden |
| Staging name | `.vcp-tmp-<pid>-<rand>` in target dir | `.<base>.vcp-<rand>.tmp` in target dir | Provider pattern adopted; it is the pattern `reapStaging()` sweeps |
| Directory sync | `syncContainingDirectory()` (path-based, throws `E_DIRECTORY_SYNC_UNPROVEN`) | helper returns sync booleans, exits 0 even when false | Provider now fails closed: `E_FS_SYNC_UNPROVEN`, no receipt |
| Post-rename verify | re-read by path + SHA-256 compare | none | Replaced by stronger identity verify through the pinned chain (dev, ino, size, mode of the staged object). The staged object's content is known: it was written to that inode and fsynced before the rename, under an exclusive name in the pinned parent |
| Destination symlink | rename replaces the link entry; post-check passes | same, unchecked | **Policy tightening in both layers**: refuse `E_FS_DESTINATION_UNSAFE` (writer pre-check may refuse earlier with `E_WRITER_NAMESPACE_UNSAFE`) |
| Destination directory | raw OS error from rename | unchecked | Refused as `E_FS_DESTINATION_UNSAFE` |
| Error taxonomy | raw errno + `E_ATOMIC_*` | `E_FS_*` | Writer pre-validations keep `E_ATOMIC_*`; provider failures keep `E_FS_*`; `E_FS_PROVIDER_PATH` maps to `E_ATOMIC_PATH` |
| Return value | `{path, sha256}` | `{operation, path, completed, dataSynced, directorySynced, bytes}` | Writer keeps `{path, sha256}` and adds `dataSynced, directorySynced, identityVerified, provider`; provider adds `identityVerified, dev, ino` |
| Platforms | any POSIX (unsafely on some) | Linux only | Writer is Linux-only and fail-closed elsewhere — intentional; writers are gate-disabled on Windows regardless |

## 5. Filesystem-operation inventory and check-then-use gaps

Scope: authorization, locking, staging, writing, renaming, manifest
replacement, journaling, recovery, cleanup. "Gap class" = the
SEC-FINDING-002 mechanism (lstat/stat pre-check, then a path-based
use where an intermediate component is not pinned).

| Site | Operations | Gap class present | Phase N disposition |
|---|---|---|---|
| `lib/writer-atomic.mjs` | staging open, rename, dir sync, verify | **Yes — the finding** | **REMEDIATED**: provider chain (§2) |
| `lib/linux-fs-provider.mjs` `replaceFileAtomic` | helper staging/rename | No (pinned), but receipts could claim unsynced/unverified outcomes | **HARDENED**: destination-type refusal, sync fail-closed, identity verify |
| `scripts/native/vcp-linux-fsops.cpp` | all provider ops | No; resolution errors collapsed to usage errors (ELOOP unclassifiable) | **FIXED**: errno propagation from `resolve_parent` |
| `lib/production-writer.mjs` `recordWriterEvidence` | append open of `.vcp/writer-audit.log` | Yes (appendix path) | Residual (R-3): no append op exists in the provider; `.vcp` is lock-held during transactions. Follow-up: native append op |
| `lib/lifecycle-lock-v2.mjs` | mkdir, lock create `O_EXCL`, release unlink, bootstrap rmdir | Yes for intermediate `.vcp` (final component pinned; inode + payload re-verified before/after) | Residual (R-2): entangled with stage13 recovery semantics; provider has the needed ops (mkdir/write/unlink) but lock migration is its own phase |
| `lib/versioned-journal.mjs` | staging open `O_EXCL`, rename, unlink, dir sync | Yes for the rename's intermediate components; content substitution closed by digest re-reads | Residual (R-2): same follow-up as the lock (journal + lock migrate together) |
| `lib/file-durability.mjs` `syncContainingDirectory` | lstat + open(dir) + fsync + re-lstat | Partial (the directory itself is final-component-pinned and identity-checked; its ancestors are path-resolved) | Residual (R-4): durability primitive, not a mutation; provider `syncDirectory` is the pinned alternative where a provider root exists |
| `lib/writer-identity.mjs` | lstat walks, identity pins | By design check-only (no use) | Kept as defense in depth; no longer load-bearing for the write path |
| `lib/safe-read.mjs` + read sites (`approval-receipts`, `command-authority`, `context`, `lock-inspect-v2`, `ownership-health`, `prompt-resolver`, `section-adoption`, `task-read`, `adoption-inspect`, `terminal-detach-protocol`) | lstat + open `O_NOFOLLOW` (final) + identity re-checks | Yes for reads (a swapped intermediate can redirect a read; header of safe-read already disclaims a dirfd guarantee) | Residual (R-5): read-path migration needs a native read op in the helper; separate phase |
| `lib/safe-replace.mjs` | staging open, rename, unlink | Yes; content substitution closed by preimage hash re-checks before/after | Residual (R-5): non-lifecycle, user-approved output path; same follow-up as reads |
| `lib/safe-create.mjs`, `lib/versioned-backup.mjs`, `lib/managed-schema-migrator.mjs` | mkdir/open/rename path-based | Yes | Residual (R-5): migrator is gate-refused before writes; others follow the journal/lock phase |
| `lib/stage13-apply.mjs`, `lib/stage13-recovery-apply.mjs` | provider ops | No (already pinned) | Unchanged; they inherit the `replaceFileAtomic` hardening |
| `lib/greenfield-recovery-apply.mjs` | lstat/unlink/rmdir cleanup with identity checks | Partial | Residual (R-5) |
| Legacy v1 paths (`update-apply`, `manage`, `state`, `init`, `template`, `verify`, `context` writes), `stale-journal-apply` | assorted path-based writes | Yes, class-wide | Out of Phase N scope by the B-1 design decision (legacy semantics frozen); they do not claim the production writer's containment contract |

No site outside the writer core was silently rewritten: broadening
the change to the lock/journal/read class in the same phase would
have multiplied the regression surface against the stage13 recovery
contracts. The residuals are named, not hidden.

## 6. Native helper review

Reviewed `scripts/native/vcp-linux-fsops.cpp` (689 lines at baseline)
operation by operation:

- **Root acquisition / ancestor trust.** `open_pinned_root`:
  absolute path, rejects any `..` substring (conservative: a root
  whose name merely *contains* `..`, e.g. `/srv/a..b`, is refused —
  fail-closed false refusal, accepted), `O_RDONLY|O_DIRECTORY|
  O_NOFOLLOW|O_CLOEXEC`, `fstat` directory check. Ancestors of the
  root are resolved by the kernel at open time and are NOT verified
  by the helper; callers must pass a root they have already pinned
  (the transaction does, via B-9 identity pinning).
- **openat traversal.** `resolve_parent` pins every intermediate
  with `O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC` and `fstat`;
  the returned parent is a real descriptor (never `O_PATH`, which
  could not be fsynced or listed).
- **rename contracts.** Replace uses `renameat` between pinned
  parents (atomic entry replacement; never follows a destination
  symlink). NOREPLACE/EXCHANGE use `renameat2` via raw syscall;
  `EINVAL`/`ENOSYS` classify to exit 12 → provider
  `E_FS_NOREPLACE_UNSUPPORTED` / `E_FS_EXCHANGE_UNSUPPORTED` —
  never emulated by a check-then-rename.
- **Descriptor lifetime.** Single-component paths dup the root fd so
  every caller closes uniformly; intermediates are closed as the
  chain advances; all ops close their descriptors on success and
  error paths (audited per op). Helper processes are short-lived
  `spawnSync` children with a 30 s timeout; a killed parent cannot
  leave a helper holding a namespace open indefinitely.
- **Cross-filesystem.** A rename that would cross devices returns
  `EXDEV` → exit 11 → `E_CROSS_FILESYSTEM`; never a silent copy.
  Mount points *inside* the root (e.g. a bind mount) are part of the
  pinned namespace by design: containment is namespace-relative,
  not device-relative.
- **Directory fsync results.** `write-file-sync` and the rename ops
  report sync booleans with exit 0 even when an fsync fails — a
  protocol trap the Phase N provider hardening closes for
  `replaceFileAtomic` (`E_FS_SYNC_UNPROVEN`). `mkdir-sync`,
  `unlink-sync`, `rmdir-sync`, `fsync-dir` convert fsync failure to
  an OS error inside the helper.
- **Helper integrity / executable identity.** The binary is built
  from in-repo source (`npm run build:native-linux`); it is not
  signed and no hash is pinned in code (a build hash cannot be
  pinned to itself). Selection verifies the file is regular,
  non-symlink and executable; the validation evidence records the
  SHA-256 of the binary actually used so an independent run can
  compare its own build. An attacker who can replace the helper
  can already replace `lib/` — same trust domain, out of scope.
- **Filesystem compatibility.** The `probe` op verifies
  renameat2-NOREPLACE and directory fsync in a disposable directory
  on the target filesystem before those guarantees are claimed;
  the replace path needs only `renameat` + fsync and fails closed
  per-operation when fsync is unacknowledged.
- **Crash and recovery receipts.** A crash before the rename leaves
  the original file and a reapable staging entry; a crash after the
  rename but before the receipt leaves an *unknown* outcome for the
  caller — receipts are never reconstructed after the fact, and
  journal phases reconcile by re-reading state.
- **Kernel acknowledgment vs power loss.** fsync success is the
  kernel's acknowledgment. Power-loss persistence depends on the
  storage stack honoring flush/barrier semantics and is **not**
  claimed anywhere in this architecture. B-2 remains NOT_PROVEN.

## 7. Compatibility guarantees preserved

- Atomic replacement and exclusive-create (no-replace) semantics,
  including `E_FS_DESTINATION_EXISTS` from inside the atomic op.
- File modes: requested mode is set exactly on the staged inode
  (`fchmod`), verified after the rename.
- File fsync before rename; parent-directory fsync after staging
  and after rename.
- SHA-256 of the written bytes returned by `atomicWriteFile`;
  manifest hash pre-check in `atomicWriteManifest` unchanged, and
  manifest-last transaction ordering is a caller property the writer
  does not reorder.
- Journal and recovery invariants: journal/lock modules untouched.
- Capability authorization and principal verification: untouched —
  the provider boundary sits *below* authorization and cannot be
  reached by callers who fail it; provider selection accepts no
  caller input at all.
- Lock ownership and release: untouched.
- Error classifications: §4 table. One deliberate tightening
  (destination symlink/dir refusal) and one deliberate reclassification
  (provider-refused names → `E_ATOMIC_PATH`).

## 8. Tests

`test/writer-secure-provider.test.mjs` (PN-01…PN-11) proves, with
disposable owned fixtures: intermediate-symlink refusal at the
writer layer and at the provider layer alone; final-component
symlink refusal; symlinked-root refusal; the no-escape invariant
under a live parent-swap loop; no-replace preservation; the atomic
replacement contract (content, mode, verified receipt, no staging
left); unsynced/garbage native outcomes failing closed with no
receipt; cleanup unlink never following a symlink; off-Linux
fail-closed selection; and staging reap provenance. Mutation runs
(protection removed in disposable copies) are recorded in the
Phase N engineering report — the tests fail when the protections
are removed, which is what makes them evidence.
