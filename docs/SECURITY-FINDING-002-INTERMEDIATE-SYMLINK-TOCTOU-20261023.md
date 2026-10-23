# SEC-FINDING-002 — intermediate-component symlink TOCTOU in the path-based writer primitives

Status: **OPEN — production hardening required, not fixed in this branch**
Date: 2026-10-23
Candidate reviewed: `67ce9bc9148e0844a1342876fb835b83f639f678`
Origin: Linux Phase M-L R2, FINDING-002 (NRC-04 mis-assertion led here)
Classification: **production security finding, not test-only**

## Summary

`O_NOFOLLOW` is applied by the Linux kernel to the **final** path component
only. `lib/writer-atomic.mjs` validates the whole target path with an
`lstat()` walk (`verifyNamespaceContained`) and then performs **path-based**
`open()` and `rename()` calls. Between the walk and the use, any existing
intermediate directory can be renamed away and replaced by a symlink to a
directory outside the root. The final-component flag does not observe that
symlink, because the symlink is not the last component.

The window is a classic check-then-use (TOCTOU) window. It is not exercised
concurrently by the tests (that needs a second process winning a sub-millisecond
race); the tests demonstrate the ordering gap deterministically in an owned
fixture.

## Mechanism, measured

| Case | Call | Measured result |
|---|---|---|
| intermediate symlink, flag set | `open("holder/link/secret.txt", O_RDONLY\|O_NOFOLLOW)` | **succeeds**; `link` is followed (NRC-04a) |
| final-component symlink, flag set | `open("holder/filelink", O_RDONLY\|O_NOFOLLOW)` | **fails with `ELOOP`** (NRC-04b) |
| no flag | both paths | **succeed**; normal traversal (NRC-04c) |
| pre-check then swap then open | `verifyNamespaceContained` passes, `plain` becomes a symlink, `open(plain/victim.txt, O_NOFOLLOW)` | **reads `OUTSIDE-ROOT`** (NRC-06) |

The capability report now states this scope explicitly:

- `atomicScope: 'final-component'` on POSIX (was implicit),
- `intermediateComponentsAtomic: false` on every current platform,
- `residualRisk` names the intermediate-component gap instead of `null`.

NRC-06's old skip ("open-time no-follow is atomic on linux") was therefore
**wrong**: it relied on a guarantee wider than the mechanism. The skip is
removed; the scenario now runs on Linux and on Windows.

## Affected production code

Primary: `lib/writer-atomic.mjs` — `atomicWriteFile()`:

1. `verifyNamespaceContained(rootDir, target)` walks the existing components
   with `lstat()`.
2. `open(tmp, O_CREAT|O_EXCL|O_NOFOLLOW)` creates the staging file through the
   **full path**. `O_NOFOLLOW` protects `tmp` (the last component), not the
   intermediate `dir`.
3. `rename(tmp, target)` resolves the full path again; `rename` follows
   intermediate symlinks.
4. `syncContainingDirectory()` has its own `lstat` + identity re-checks and
   fails closed on a visible swap, but it observes the path at a different
   time; it cannot close the gap between its own check and the `rename`.

Class-wide: the same pattern (lstat/first-stat, then path-based `open` with
`O_NOFOLLOW`) appears in `lib/safe-read.mjs`, `lib/safe-replace.mjs`,
`lib/lifecycle-lock-v2.mjs`, and the other `O_NOFOLLOW ?? 0` open sites.
`safe-read.mjs` already documents the absence of a dirfd race guarantee;
`writer-atomic.mjs` now does too. This finding does not assert that every
site is exploitable; it identifies the shared mechanism and the write path
with the highest impact.

Not affected: `lib/linux-fs-provider.mjs` and
`scripts/native/vcp-linux-fsops.cpp`. The helper resolves every intermediate
component with `openat(O_RDONLY|O_DIRECTORY|O_NOFOLLOW)`, pins the root fd,
and performs `renameat2` relative to pinned directory fds. Its documented
"O_NOFOLLOW at every component" claim is accurate. The JS writer does not use
this helper.

## Attack scenario and preconditions

Preconditions: the attacker can create/rename entries in a directory that is
an ancestor of the write target (or in the root itself), on the same
filesystem, and can win the race between the pre-check and the open/rename.

Impact: a write intended for `root/.../target` can be redirected outside the
root (namespace escape / integrity violation). The post-rename content check
may detect a substituted payload and throw, but only **after** the outside
entry has been replaced. Where the attacker can hard-link the writer's staging
inode into the outside directory under the same unpredictable name before the
rename, the content check can also pass.

Severity: **Medium** — requires local write access to an ancestor component
and a race, but violates the containment property the writer claims. It is
not a remote vector and does not by itself enable production writers
(`PRODUCTION_WRITERS = DISABLED`, G-FENCE = NO-GO).

## Reproducer

`test/no-replace-capability.test.mjs`:

- `NRC-04a` — intermediate symlink is followed with `O_NOFOLLOW` set.
- `NRC-04b` — final-component symlink is refused with `ELOOP`.
- `NRC-06` — pre-check passes, the component is swapped, and the subsequent
  open reads a file outside the root. The fixture is created and removed by
  the test under `os.tmpdir()`; no project tree is touched.

The reproducer demonstrates the ordering gap sequentially. It does not claim
a concurrent race was won.

## Remediation (not implemented here)

Replace the path-based sequence with a dirfd-relative chain:

1. `open(root, O_RDONLY|O_DIRECTORY|O_NOFOLLOW)`;
2. walk each component with `openat(dirfd, part, O_RDONLY|O_DIRECTORY|O_NOFOLLOW)`;
3. create the staging file with `openat(parentfd, tmpname, O_CREAT|O_EXCL|O_NOFOLLOW)`;
4. commit with `renameat(parentfd, tmpname, parentfd, targetname)`;
5. `fsync` the pinned directory fd.

The native helper already implements this pattern; wiring `writer-atomic` to
it (or porting the chain to JS with `fs.open` + `/proc/self/fd` fallbacks) is
an architecture change that needs an independent decision. It is deliberately
**not** done in this remediation branch.

## Scope discipline

- Frozen candidate `67ce9bc` and PR #108 are untouched.
- No production writer is enabled; D-01 stays DEFERRED; G-FENCE stays NO_GO.
- The only production-file change in this branch is a comment in
  `lib/writer-atomic.mjs` recording this finding; no behaviour changed.
- `lib/no-replace-capability.mjs` is a read-only capability report; its new
  fields make an existing guarantee narrower and more precise, and are not
  consulted by any authorization path.
