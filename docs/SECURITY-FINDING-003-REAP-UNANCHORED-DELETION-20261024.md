# SECURITY FINDING 003 — reapStaging unanchored-deletion fallback

**Date:** 2026-10-24 · **Status:** CONFIRMED, fixed in Phase N+2
**Component:** `lib/linux-fs-provider.mjs` — `LinuxFsProvider.reapStaging`
**Baseline:** `673b96bba95f02804788150bf11d754c6f6b30bc` (Phase N+1)

## Summary

`reapStaging()` deletes leftover staging files with identity-bound
native unlinks (`--expect-root/--expect-parent/--expect-file`). Two
defects combined to break the provenance guarantee:

**Mechanism A — swallowed anchor failure → null expectations.** The
anchor capture was wrapped in `catch {}`, and on failure the loop
proceeded with `expect = null`, calling `deleteFile()` with **no
identity expectations at all**:

```js
let anchor = null;
try { anchor = await this.anchorIdentities(root, dir); } catch {}
...
let expect = null;
if (anchor) { ...build expectations... }
await this.deleteFile(root, rel, expect);   // expect may be null
```

Any anchor failure — including an attacker-induced one (the parent
namespace changing at that moment) — silently downgraded the sweep
to unanchored deletion in whatever namespace the path then resolved
to. Failure to establish deletion provenance ENABLED weaker
deletion: the exact inversion of the required invariant.

**Mechanism B — provenance overclaim in the receipt.** With an
anchor, the file expectation was measured fresh from whatever
object currently held the staging name. That binds the unlink to
the inspected object (stat→unlink stability, namespace-anchored),
but it does not prove the object was staged by a transaction —
a substitution completed before the stat is invisible to any
name-pattern reaper. The pre-fix receipt reported such deletions in
`removed[]` indistinguishably from proven cleanup.

## Invariant violated

**Failure to establish deletion provenance must never enable
unanchored deletion.** An identity failure is a reason to delete
NOTHING, not a reason to delete with weaker authorization.

## Deterministic reproducer

`~/workspace/vcp-n2-evidence/reap-reproducer.mjs`: stage a file
through the provider, replace it with an attacker file (different
inode), call `reapStaging`. Pre-fix result:

```text
staged inode: 174  substitute inode: 175
reap removed: [".doc.txt.vcp-deadbeef.tmp"]
SUBSTITUTE DELETED WITHOUT IDENTITY PROOF: true
```

This exercises mechanism B (fresh-stat binding + receipt overclaim).
Mechanism A is proven by the Phase N+2 mutation MD and test PN2-01,
which force the anchor failure deterministically: pre-fix code
deletes the candidate with null expectations; fixed code deletes
nothing.

## Fix (Phase N+2)

- Anchor failure → the sweep deletes NOTHING and returns
  `refused: 'E_FS_ANCHOR_UNAVAILABLE'` with every candidate listed
  in `skipped`. The null-expectation path is deleted from the code.
- With an anchor, every unlink carries root + parent + file
  expectations; refusals and vanished objects are reported in
  `skipped`, never retried unanchored and never claimed in
  `removed[]`.
- The reap contract is stated honestly (design doc): a name-pattern
  reaper proves namespace + stat→unlink stability, not original
  staging provenance.

## Scope note

The same audit pass found no other null-expectation deletion in the
provider: `replaceFileAtomic`'s cleanup unlink and
`writeFileSynced`'s cleanup are identity-bound with no fallback.
