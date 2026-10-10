# Stage 12 Linux durability — guarantee boundaries

Provider: `lib/linux-fs-provider.mjs` + `scripts/native/vcp-linux-fsops.cpp`.
Measured on: Linux 7.0.0 x86_64, btrfs (see probe receipt at test time).
`fsync` success is a **kernel acknowledgement**, never a power-loss proof.

## What each primitive guarantees

| Operation | Process crash | OS crash | Power loss |
|---|---|---|---|
| `writeFileSynced` (O_EXCL create + data fsync + parent fsync) | file present with exact bytes, or absent (never torn at a committed name) | same, if the fs honors fsync | UNVERIFIED |
| `replaceFileAtomic` (temp + fsync + rename + parent fsync) | old or new content, never torn; staging temp may remain (reapable) | same | UNVERIFIED |
| `moveNoReplace` (renameat2 NOREPLACE + both parents fsync) | source at old name or new name, never both, never neither; destination never replaced | same | UNVERIFIED |
| `deleteFile` / `removeEmptyDirectory` (+ parent fsync) | name gone or still present; never half-removed | same | UNVERIFIED |
| `syncDirectory` | n/a (acknowledgement only) | n/a | UNVERIFIED |

"UNVERIFIED" is not a weasel word: no power-loss rig exists in this
environment, so the provider reports `dataSynced:true` /
`directorySynced:true` as *what the kernel acknowledged*. Callers must
treat `{completed:true, synced:false}` as **detached evidence**, never as
durable — the provider makes this state explicit instead of hiding it.

## Fail-closed matrix

- Filesystem without directory-fsync support → `E_DIRECTORY_SYNC_UNSUPPORTED`
  (probed per operation; no silent success).
- Kernel/filesystem without `renameat2(RENAME_NOREPLACE)` →
  `E_FS_NOREPLACE_UNSUPPORTED`. No fallback to `lstat`+`rename` (TOCTOU).
- Cross-filesystem rename → `E_CROSS_FILESYSTEM`. The provider never
  silently copies: copy-and-delete changes atomicity semantics and the
  caller must choose explicitly.
- Symlink anywhere in the resolved chain → operation refused
  (`O_NOFOLLOW` / `AT_SYMLINK_NOFOLLOW` at every component, pinned root fd).
- Destination exists on a no-replace move → `E_FS_DESTINATION_EXISTS`
  (from the kernel's `EEXIST` *inside* the atomic operation).
- Helper binary absent → `E_NATIVE_HELPER_MISSING` with the build command.
- Non-Linux platform → `E_NATIVE_NOREPLACE_UNAVAILABLE` (unchanged).

## Crash-injection coverage (tests, disposable fixtures)

- Kill -9 between staging-write and rename: original intact, temp reapable.
- Kill -9 during a write burst: committed files never torn.
- Detach protocol: crash before move / after move / after ack — resume is
  idempotent and never re-moves, never deletes, never duplicates archives.
- Lock/journal/foreign-content races: verified before the move, re-verified
  at the move; any change aborts.

## What fsync does NOT prove (recorded honestly)

- Power-loss persistence (needs a power-loss rig or a filesystem with an
  explicit persistence contract under test).
- Ordering across *different* files beyond the parent-directory syncs the
  provider performs.
- Protection against a hostile administrator, kernel bugs, or storage
  devices that lie about flushes.
- Anything on Windows/NTFS: `WINDOWS_NAMESPACE_DURABILITY_UNPROVEN`
  still fails closed before any write.
