# Terminal recovery — archive scope + retention decision

**Status:** PROPOSED (in-root default implemented; sibling opt-in gated).
**Owner decision required:** only for the sibling-archive scope.

## The scope question

Retiring `.vcp` by renaming it to a *sibling* of the selected root writes
outside the selected root. The acceptance matrix already records that this
"needs distinct security/scope approval" — which has not been granted.

## Resolution (implemented)

- **Default: in-root archive.** The forensic bundle moves to
  `<root>/.vcp-recovery-retired-<backupId>-<40hex>` via a single native
  `renameat2(RENAME_NOREPLACE)`. This stays inside the already-authorized
  selected-root write scope: no new approval needed. Planners treat the
  reserved prefix as retired evidence (read-only); a subsequent recovery
  plan reports `ALREADY_RETIRED` instead of re-archiving or deleting.
- **Sibling archive: explicit opt-in only.** Requires a
  `siblingScopeApproval` object (`scope:'sibling-archive-write'` bound to
  the exact root, destination, approver and reason). Without it the
  protocol throws `E_TERMINAL_SIBLING_SCOPE_APPROVAL_REQUIRED`. The
  sibling path remains a **proposed contract change pending owner
  approval** — it is implemented but not authorized.

## Retention policy (implemented, `lib/terminal-archive-retention.mjs`)

- Archives are **never auto-deleted**: no background sweeps, no TTL.
- Pruning is explicit only: `planArchivePrune` (read-only, age-filtered)
  + `executeArchivePrune` requiring an approval object, manifest
  re-verification at execution time, a 30-day minimum age, and symlink
  refusal at every level. Any tamper aborts the prune; the archive
  survives.
- Every archive carries a forensic manifest (`vcp-retirement-manifest.json`:
  journal hash, lock-token hash, backup id, scope, timestamps) written
  through the durability provider (exclusive create + data/parent sync).

## Crash semantics (tested)

Crash before the move → clean restart. Crash after the move, before parent
sync → restart detects the detached-evidence state and completes the sync
without re-moving. Crash after sync → idempotent no-op. The destination is
never replaced (`EEXIST` inside the atomic operation); the journal and lock
are never deleted before the bundle is detached — the original defect
(journal cleared before lock cleanup) is structurally impossible in this
protocol because there is no journal-clear step at all.

## What still needs the owner

- Sibling-archive scope approval (or permanent rejection in favor of
  in-root only).
- Long-term retention tuning (the 30-day minimum is a default, not a law).
- G-FENCE opening remains a separate D-01 decision; nothing here writes
  through the gate.
