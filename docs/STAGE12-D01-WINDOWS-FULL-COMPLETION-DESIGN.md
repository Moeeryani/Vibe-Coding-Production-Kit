# Stage12 full-scope engineering — old binary fence and Windows durability

**Status: DESIGN EVALUATION / NOT PROVED / MUST NOT ENABLE WRITES.**
**Owner decision:** original full Stage12 in scope (2026-10-10T19:02:43Z).
**Safety state:** `D-01 = DEFERRED`, `G-FENCE = NO-GO`.
**Proven unsafe binary:** registry-published 0.9.3, independently authenticated.

## Why a passive .vcp lock cannot be the compatibility fence

The published 0.9.3 CLI has already been distributed. The native
Windows witness in evidence commit `9711013177900b4834906069491e5a1c6b2f8f45`
shows an old `init --force` path that, when the manifest is absent,
does not acquire the update lock at all. It overwrites `AGENTS.md` and
recreates schema-v1 while a directory-shaped `.vcp/update.lock` remains.
Legacy rollback can also choose old journal/backups, ignore schema-v2
`minimumReaderVersion` and erase post-backup user changes.

**Consequence:** changing only new-CLI metadata, backups, filesystem
lock shape or new-CLI checks cannot establish a universal zero-write
invariant for a future arbitrary invocation of the unchanged old
binary against the same writable path. Do NOT treat a more elaborate
lock or 3 successful fixture refusals as an alternate fence.

## Candidate design investigation, not an approved implementation

1. **Isolation / controlled cutover:** prepare immutable source snapshots
   and a *different* candidate project root or dedicated namespace;
   old-v1 project remains untouched until a reviewed transfer contract
   protects post-backup changes. The destination can still be targeted
   deliberately by an old CLI; this is an operational boundary, not
   universal old-binary prevention. Requires explicit invariant change
   if isolation instead of in-place migration is selected.
2. **Enforced access separation:** a real OS security boundary would
   need to prevent the published old process from writing user paths
   while allowing a new privileged writer, throughout missing-manifest
   and crash transitions. Merely assigning an ACL to the same user
   identity is insufficient; prove process identity and permissions
   rather than assuming them. Must support Linux and native Windows.
3. **Versioned dual-tree handoff:** if a trustworthy capability boundary
   is found, prove atomic ownership transition, old/new concurrency,
   manifest disappearance, lock swap, rollback and recovery before
   including any user-root mutation in product code.

**Decision gate:** If no complete safety mechanism can stop old init
and rollback across the required threat model, report infeasibility
and request a new explicit D-01 policy decision. Never silently weaken
the original full Stage12 AC-004 to 'document a warning'.

## Windows directory durability workstream

The present `syncContainingDirectory()` calls Node `FileHandle.sync()`
on a directory. On actual NTFS in the Windows report this returned
`EPERM` / `E_DIRECTORY_SYNC_UNPROVEN`; it must continue to fail closed.
Do NOT catch and disregard this exception as a fix.

**Native Windows options to investigate and verify** (not a claim
that they guarantee rename persistence):

- An explicit Windows platform module/helper using authenticated
  supported Win32 APIs for file-handle flush and namespace operations.
  `FlushFileBuffers` requires a suitable open file handle; file-data
  flush does not by itself prove durable parent-directory entry updates.
- `MoveFileExW` with `MOVEFILE_WRITE_THROUGH`, whose documented
  guarantee explicitly mentions flushing a move implemented as copy
  and delete; do not extend that specific statement to arbitrary
  same-volume atomic rename + crash conditions without proof.
- `ReplaceFileW`, which replaces a file and can retain a backup;
  it has platform-specific constraints and is not a universal
  atomic durable transaction protocol by itself.
- Where no supported primitive provides the *required* durability
  proof, keep the Windows writer disabled rather than pretending
  `fsync` on a file suffices.

Microsoft primary documentation:

- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers
- https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
- https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew

## Mandatory independent proof before writer activation

- Genuine npm-published 0.9.3 SHA-256/SHA-512 identity preserved;
  test old init (manifest present/missing/corrupt), update, manage,
  rollback, stale PID/foreign/aged locks, old journal and backup shape.
- Linux and **native Windows/NTFS** with byte-for-byte user tree
  before/after snapshots including BOM, CRLF and post-backup edits.
- Real old/new concurrent processes, PID reuse, lock replacement
  under ownership check, crash at every journal and rename phase,
  restart and recover. Preserve unowned and foreign nested files.
- Power interruption / durability claims require stronger test
  evidence than kill-after-ack; document filesystem/hardware
  boundaries and do not extrapolate from one fixture.
- Failures must be classified NO-GO, not silently skipped. Any
  incomplete mandatory platform or adversarial scope is UNVERIFIED.
- Human maintainer acceptance of an independently verified full
  D-01 result is a **separate future decision**, not supplied by
  the 2026-10-10 policy ratification.

## Execution ownership and separation

Keep exploratory code non-shipping and isolated from existing
`main`, tagged releases and schema-v1 production mutators.
Stage13 remains first *unmanaged existing-repository* adoption;
managed v1→v2 safety and native writer durability remain Stage12.
