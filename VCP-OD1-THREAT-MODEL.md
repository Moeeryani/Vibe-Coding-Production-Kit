# OD-1 Scoped Task Pack Creation — Threat Model

**Status: DESIGN ONLY. No implementation. No approval recorded.**

- Baseline: `d4fb3ce` / tree `e7119fa2` (see Design doc §1 for the
  verified implementation map; this document does not re-derive
  it, it threatens it).
- Scope: the proposed scoped operation only — exclusive creation
  of one file, `docs/tasks/<slug>.md`, in an eligible non-managed
  project, via the new caller-scoped helper specified in
  `VCP-OD1-SCOPED-TASK-CREATION-DESIGN.md` §2. Everything else
  (managed writes, migration, recovery, production writers,
  lifecycle locks, L3, CI enforcement) is out of scope and stays
  refused; threats to those surfaces are covered only where the
  scoped operation could become a stepping stone to them.
- Method: for each threat — the invariant, a likely attack or
  failure sequence, the prevention mechanism, the refusal
  behavior, and the testable evidence. Residual risks are named
  R-1…R-5 and carried into the Decision Proposal. Nothing here
  authorizes the operation.

## 1. Assets, actors, trust boundaries

**Assets.** (a) The user's project files, above all `AGENTS.md`
and any file under management; (b) the integrity of the VCP
managed-state boundary (the property that lets users and tests
distinguish "managed" from "not managed"); (c) the fence evidence
base (the 42 F1 tests and gate tests that prove refusal); (d) the
new Task Pack file itself (low value, regenerable, no secrets).

**Actors.**

- **A1 — The project owner** running `vcp task` on their own
  project. Trusted to intend the creation; untrusted to have
  verified the project's state by hand (the tool must check).
- **A2 — Concurrent local processes**: another `vcp` invocation,
  an editor, a build tool, a sync daemon, or the old published
  0.9.3 CLI running on the same tree. Not malicious by
  assumption, but capable of mutating state between the tool's
  checks and its write. The design must survive A2 without
  assuming coordination.
- **A3 — Hostile or corrupted project content**: a checked-out
  repository whose files, symlinks, manifests, or `AGENTS.md`
  were crafted by someone else (the D-03 no-follow policy exists
  for exactly this actor). The scoped operation must treat all
  project content as untrusted input.
- **A4 — The old published CLI (0.9.3)**, present on user
  machines, immutable, hazardous (see Design §4). It is an
  *environmental hazard*, not a cooperating component: no
  protocol with it exists, and none is assumed.

**Trust boundaries.** (1) CLI invocation → library operation
(the operation must not trust caller assertions about
eligibility); (2) classification time → creation time (the gap
is the threat); (3) this process → filesystem (concurrent
mutation, swaps); (4) new CLI → old CLI (no shared state may be
created that the old CLI misinterprets); (5) Linux proof →
Windows behavior (no inference across this boundary).

**What the operation must never become.** A general write
primitive; a way to create managed state piecemeal; a precedent
that "small writes are fine" for other paths; evidence for
old/new coexistence. Each threat below is checked against this
list.

## 2. Threats

### T1 — Project-state misclassification

- **Invariant (INV, Design §2.2):** the scoped path activates
  only when the project is NEW or EXISTING with no `.vcp` entry,
  no manifest, no lock, and no recovery marker — verified inside
  the write operation, not only at the CLI layer.
- **Attack/failure sequence:** A3 plants a `.vcp` directory that
  `inspectProject` misreads (e.g. a manifest with a schema
  version the parser treats as absent, a `.vcp` entry that is a
  dangling symlink, a manifest that appears between
  classification and creation via A2). Or a genuinely MANAGED
  project is misread because classification ran against a
  different root than creation (path confusion, `--dir`
  aliasing, case-insensitivity on some filesystems).
- **Prevention:** E1 (full `inspectProject`, default options, no
  bootstrap exception) + E2/E3/E4 (direct `lstat` re-checks of
  `.vcp`, root manifest, locks/markers inside the write op) +
  E5 (root identity pinning; the root resolved once via
  `path.resolve` and never re-resolved from a string) +
  `resolveProjectPath` ancestry validation. The manifest
  reader's own defenses (O_NOFOLLOW, identity re-checks, size
  cap, strict schema validation, `BLOCKED` on any anomaly)
  mean "misread as absent" requires defeating two independent
  readers (the inspector and the direct `lstat` checks).
- **Refusal:** any anomaly → `E_SCOPED_INELIGIBLE_STATE` /
  `E_SCOPED_MANAGED_STATE_PRESENT` / `E_SCOPED_RECOVERY_STATE_PRESENT`,
  then fall-through to the gate (`E_G_FENCE_NO_GO`). No file is
  created. The refusal names the inspection reason.
- **Testable evidence:** Matrix cases SC-T05–SC-T14 (every
  BLOCKED reason, manipulated manifests, `.vcp` appearing
  between classify and create via a fault-injection harness).

### T2 — Symlink and junction traversal (D-03)

- **Invariant:** no symlink or junction/reparse point is ever
  followed for writing — not at the root, not at any ancestor,
  not at any parent, not at the destination.
- **Attack sequence (A3):** `docs` is a symlink to `/etc` or to
  another project; `docs/tasks` is a symlink to a managed
  project's task dir; the destination itself is a pre-planted
  symlink to `AGENTS.md` or to a file outside the root; an
  ancestor directory is swapped for a symlink between checks.
- **Prevention:** `resolveProjectPath` ancestry walk (every
  ancestor `lstat`-checked, `ROOT_LINK` on any symlink) +
  per-parent `lstat` loop in the scoped helper (symlink →
  `E_SCOPED_PARENT_UNSAFE`) + final open with `O_NOFOLLOW`
  (POSIX) + identity pins (dev/ino) re-verified before and
  after the sync. The D-03 selected policy (reject in-root
  links too) is unchanged and applies in full.
- **Refusal:** `E_VCP_PATH` (`ROOT_LINK` / `LINK_REFUSED`) or
  `E_SCOPED_PARENT_UNSAFE` / `E_SCOPED_NAMESPACE_CHANGED`;
  fall-through to the gate. No write, no followed link.
- **Testable evidence:** Matrix SC-T15–SC-T20 (symlinked root,
  symlinked ancestor, symlinked `docs`, symlinked `docs/tasks`,
  symlinked destination, ancestor swapped for a symlink
  mid-operation). **Windows:** junction/reparse behavior is
  UNPROVEN — Linux evidence for T2 does not transfer (see §3);
  the operation refuses on Windows via the durability
  preflight until a native proof exists.

### T3 — Root and parent namespace replacement

- **Invariant:** the directories the operation writes into are
  the directories it classified — identity-pinned across the
  classify→create gap; a swapped namespace is detected, never
  trusted.
- **Attack/failure sequence (A2/A3):** between phase 1
  (classify) and phase 4 (create), `docs/` is renamed away and
  replaced with a different directory (same path, different
  inode); or the project root itself is replaced (bind-mount
  swap, rename swap); or a parent directory is replaced after
  the final re-validation but before `open`.
- **Prevention:** dev/ino pins for root, ancestors, and parents,
  re-verified at phase 3 and after the directory sync; the
  final `open` uses `O_EXCL|O_NOFOLLOW` so the *destination
  name* cannot be a planted object; `syncContainingDirectory`
  re-verifies parent identity around the sync.
- **Refusal / detection:** swaps detected at phase 3 or
  post-sync → refuse (`E_SCOPED_NAMESPACE_CHANGED`) and leave
  any created file for manual inspection (§2.5 of the Design).
  A swap in the final micro-window (after phase-3 re-validation,
  before `open`) is *detected after the fact* by the post-sync
  check, not prevented — **residual R-1** (see §4). Mitigating
  facts: the created object is a single Markdown document with
  no secrets and no executable content, in a tree the invoker
  could already write to; the swap requires a local actor with
  write access to the project tree (A2/A3 with local write
  access can already damage the project directly). Descriptor-
  pinned creation (follow-up F-H2) would close this window.
- **Testable evidence:** Matrix SC-T21–SC-T24 (root swap,
  parent swap, swap between re-validation and open via a
  fault-injection harness that renames mid-operation, swap
  after sync).

### T4 — Concurrent Task Pack creation

- **Invariant:** concurrent creations serialize on existence:
  exactly one creator wins per destination; no interleaving
  produces a merged, truncated, or doubly-created file; no
  deadlock; no lock file is created.
- **Failure sequence (A2):** two `vcp task` invocations for the
  same slug run simultaneously; two invocations for different
  slugs race on creating `docs/` / `docs/tasks/`; an invocation
  races with an editor creating the same path.
- **Prevention:** `O_EXCL` on the final open is the serialization
  point (kernel-decided, single winner); the parent loop treats
  `EEXIST` on `mkdir` as "re-verify and continue"; no locks are
  taken (none can be — §1.6 of the Design), so no lock
  contention, stale-lock, or deadlock surface exists.
- **Refusal:** losers get `E_SCOPED_ALREADY_EXISTS`
  (`DESTINATION_EXISTS` semantics); the winner's file is
  complete (single writer, single handle, fsync before close).
  A loser never truncates, appends to, or renames the winner's
  file.
- **Testable evidence:** Matrix SC-T25–SC-T28 (same-slug
  concurrency ×N, different-slug parent race, editor race,
  repeated sequential creation). PH-06's lesson is applied
  here: passing concurrency runs prove nothing by themselves —
  the evidence is the *mechanism* (`O_EXCL`) plus a
  high-iteration harness (≥50 paired runs) with zero
  double-creation or truncation observed.

### T5 — Existing-file overwrite

- **Invariant:** the scoped path never overwrites, truncates,
  renames over, or chmods an existing file of any kind.
- **Attack/failure sequence:** destination exists as a file the
  user wrote (their task draft), as a directory, or as a
  symlink; a TOCTOU gap lets the destination appear between
  the existence check and the open.
- **Prevention:** `O_EXCL` makes the existence check and the
  creation a single kernel decision — there is no check-then-
  create gap at the destination. `resolveProjectPath`
  (`write-new`) refuses an existing final component before the
  open as defense in depth. The overwrite branch
  (`replaceProjectFileIfUnchanged`) is a *separate* path
  requiring `--force`, a reviewed file, and a preimage hash;
  the scoped path never calls it and `--force` never routes
  an absent destination through it.
- **Refusal:** `E_SCOPED_ALREADY_EXISTS`; the existing bytes
  are untouched (verified by hash before/after in tests).
- **Testable evidence:** Matrix SC-T29–SC-T31 (existing file,
  existing directory, existing symlink; pre-planted destination
  appearing mid-operation).

### T6 — Partial directory creation

- **Invariant:** a failed creation never leaves ambiguous or
  half-managed state; created directories are tracked, empty,
  and removable; pre-existing directories are never removed.
- **Failure sequence:** `docs/` is created but `docs/tasks/`
  creation fails (permission, race, disk); the file creation
  fails after parents exist; cleanup itself races with a
  concurrent creator filling a ledger directory.
- **Prevention:** created-parents ledger (Design §2.5);
  `rmdir`-only cleanup (refuses non-empty); identity re-check
  before removing a ledger directory; reverse-order removal;
  cleanup failures reported, never swallowed.
- **Refusal / behavior:** the original error is returned with
  a `cleanup` note listing leftovers. Leftover ledger
  directories are empty plain directories — they do not affect
  eligibility on the next invocation (they are re-checked as
  parents, and `.vcp` absence is what matters for E2).
- **Testable evidence:** Matrix SC-T32–SC-T34 (forced failure
  at each parent, concurrent fill during cleanup, cleanup
  failure reporting). **Residual R-2:** an empty `docs/`
  directory left by a failed run is user-visible clutter; it
  is not a security state and must be documented as such, not
  hidden.

### T7 — Existing legacy VCP state

- **Invariant:** any present legacy state — v1 manifest,
  backups, transaction journal, staging provenance, locks,
  baselines, retired-adoption evidence — refuses, even when
  malformed, partial, or in an unexpected location within
  `.vcp/`.
- **Failure sequence:** a project has `.vcp/` with only a
  `backups/` dir (no manifest); a `.vcp/` left by an
  interrupted init; a `.vcp` that is a regular file; legacy
  state created by A2 between classification and creation.
- **Prevention:** E2 (any `.vcp` entry refuses — the predicate
  does not enumerate *kinds* of state, it refuses the *directory
  itself*); E1's `BLOCKED` reasons cover the malformed cases
  classification-side; E4 covers root-level lock/marker
  strays; phase-3 re-`lstat` of `.vcp` catches late-appearing
  state.
- **Refusal:** `E_SCOPED_MANAGED_STATE_PRESENT` /
  `E_SCOPED_RECOVERY_STATE_PRESENT`, fall-through to the gate.
- **Testable evidence:** Matrix SC-T08–SC-T13 (each state
  shape; `.vcp`-as-file; `.vcp`-as-symlink; state appearing
  mid-operation). **Residual R-3:** `.vcp` created *after*
  phase 3 but before `open` is not detected (Design §2.3);
  the created file remains a plain document and managed state
  is untouched, but the ordering guarantee is weaker than the
  predicate suggests. Must be stated in user docs, not
  elided. A stricter variant (re-check `.vcp` absence *after*
  the file is created and delete-on-detection) is rejected:
  deleting a just-created file on a racy signal destroys
  evidence and re-opens the T4 race.

### T8 — Manipulated manifests and recovery markers

- **Invariant:** no crafted manifest, marker, or recovery file
  can make a managed/recovery-pending project look eligible, or
  make an eligible project look managed in a way that causes a
  write (fail-closed both ways is acceptable; fail-open either
  way is not).
- **Attack sequence (A3):** manifest with `schemaVersion: 99`,
  oversized manifest, manifest as symlink, manifest JSON that
  parses but fails field validation, a `transaction.json`
  claiming committed state, a forged `update.lock` with a live
  PID, a `.vcp` directory whose manifest is deleted
  mid-inspection.
- **Prevention:** the inspector's strict manifest reader
  (O_NOFOLLOW, identity re-checks, 256 KiB cap, schema
  validation, `BLOCKED` on every anomaly — Design §1.3) plus
  E2's blanket `.vcp` refusal, which makes most manifest
  manipulation irrelevant: *any* `.vcp` refuses regardless of
  what the manifest says. The residual attack surface is a
  manifest/marker *outside* `.vcp` influencing classification —
  none was found (all state paths are `.vcp/`-rooted; see the
  inventory in Design §1.3).
- **Refusal:** `BLOCKED` classification or E2/E4 refusal;
  fall-through to the gate.
- **Testable evidence:** Matrix SC-T09–SC-T12 (each
  manipulation; manifest deleted mid-inspection via
  fault injection). Note the asymmetry the design accepts: a
  crafted marker that makes an *eligible* project refuse is a
  denial of service the local attacker already has (they can
  write files); only fail-open matters.

### T9 — Task-path traversal

- **Invariant:** the created file is always exactly
  `docs/tasks/<slug>.md` under the selected root; no slug,
  title, or project content can redirect it.
- **Attack sequence (A3/A1-mistake):** slug with separators
  (`../x`), backslashes, drive prefixes, reserved Windows
  names, trailing dots/spaces, NUL bytes; title containing
  path separators (title is rendered into content, never into
  the path — verify in review); a `docs` component that is
  `.git` or `.vcp` by case variation.
- **Prevention:** `validateSlug` (kebab-case, no separators)
  runs before any filesystem access; `relative` is built by
  fixed join, never from user input directly; `resolveProjectPath`
  rejects backslashes, absolute paths, `..`, `.`, `.git`,
  colons, reserved names, and `.vcp` first components for
  `write-new`.
- **Refusal:** slug validation error / `E_VCP_PATH`
  (`INVALID_RELATIVE` / `INVALID_COMPONENT` / `RESERVED_STATE`)
  before any write.
- **Testable evidence:** Matrix SC-T35–SC-T38 (traversal slug
  battery, title-with-separators, case-variant components,
  overlong slug). The slug battery must be run against the
  *implementation*, not just the validator in isolation.

### T10 — Untrusted project input

- **Invariant:** nothing read from the project is trusted for
  authorization: `AGENTS.md` commands, capability evidence,
  and existing task files influence *content* only; a hostile
  value can at worst produce a misleading document, never a
  write outside the predicate or an executed command.
- **Attack sequence (A3):** `AGENTS.md` declares a destructive
  command (`rm -rf`); capability discovery reports a fake
  stack; an existing `docs/tasks/*.md` contains a forged
  review-evidence block; the project contains a `package.json`
  with malicious scripts.
- **Prevention:** creation executes nothing (no command runs
  during `createTaskPack`); commands are copied as *text*
  into the pack and are only ever executed later under
  command-authority + readiness + explicit `--run` (unchanged
  contracts); capability evidence is rendered as labeled
  evidence text; content size is capped (8 MiB); the pack
  never embeds file contents from the project, only
  references.
- **Refusal / behavior:** command *conflicts* in `AGENTS.md`
  block creation (existing behavior, unchanged); a single
  destructive-looking command does not block creation (it is
  text) and must not execute — tests assert non-execution.
- **Testable evidence:** Matrix SC-T39–SC-T40 (hostile
  `AGENTS.md` with destructive commands + marker proving
  non-execution; hostile capability evidence rendered
  verbatim-as-evidence).

### T11 — Old CLI interaction

- **Invariant:** the scoped operation creates no state the old
  published CLI (0.9.3) can misinterpret, and authorizes no
  old/new coexistence.
- **Failure sequence:** the user creates a Task Pack with the
  new CLI, then runs old `init --force` / old `update` /
  old `rollback` on the same tree; or the old CLI runs first
  and creates state the new CLI then misreads.
- **Prevention / analysis:** see Design §4 in full. In brief:
  the only new artifact is a Markdown file the old CLI never
  reads; no manifest, lock, backup, or `AGENTS.md` edit is
  produced; the project's lifecycle classification is
  unchanged (EXISTING stays EXISTING). Old-CLI-first is
  covered by T7/T8 (any state it creates refuses).
- **Refusal / behavior:** none at creation time — the hazard
  is *later* old-CLI action, which the new CLI cannot prevent
  and must not claim to prevent. User documentation must state
  that old-CLI lifecycle operations on the project remain
  hazardous (published 0.9.3 is immutable) and that the Task
  Pack file is not backed up by old rollback and may be
  ignored by it.
- **Testable evidence:** no code test can prove old-CLI
  behavior from this tree; the evidence is the *artifact
  inventory* (Matrix SC-T41: after a scoped creation, the
  project tree diff is exactly one added file, `docs/tasks/
  <slug>.md`, and `inspectProject` still reports the same
  classification). The historical POC evidence (7/12, 8/13)
  is cited, not re-run, and its scope is stated exactly.

### T12 — Linux vs Windows filesystem behavior

- **Invariant:** no Linux observation is cited as Windows
  evidence; on Windows the operation refuses until a
  Windows-native proof exists.
- **Divergences (each verified in code comments or platform
  behavior):** directory fsync fails natively on NTFS
  (`E_DIRECTORY_SYNC_UNPROVEN`); `O_NOFOLLOW`/`O_DIRECTORY`
  are 0 on Windows, so the final open carries no
  no-follow protection; junction/reparse traversal semantics
  and rename TOCTOU behavior are explicitly unproven in
  `safe-replace.mjs` and `adoption-inspect.mjs` comments;
  case-insensitivity and reserved names differ (partially
  handled by `resolveProjectPath`'s component rules, unproven
  end-to-end); the native helper's Windows candidate is a
  separate D-01-gated artifact.
- **Prevention:** the durability preflight allow-lists Linux
  only, so the scoped operation refuses on Windows with the
  existing code/reason — no new platform branch, no silent
  fallback. The design's Windows section (§3) forbids
  activating the path on Windows by changing the allow-list;
  that change is itself a security decision requiring native
  proof.
- **Refusal:** `E_DIRECTORY_SYNC_UNPROVEN`
  (`WINDOWS_NAMESPACE_DURABILITY_UNPROVEN`) before any
  mutation.
- **Testable evidence:** Matrix SC-T42–SC-T46 are
  **Windows-native** cases, all gated on a future Windows
  acceptance campaign (native NTFS, principal provider,
  junction fixtures, directory-sync proof). Until then they
  are recorded as UNPROVEN, never as passing-by-analogy. The
  Linux cases (SC-T01–SC-T41) are Linux-native and say so.

## 3. Linux-proven vs Windows-unproven assumptions

| Assumption | Linux status | Windows status |
|---|---|---|
| `O_EXCL` creation is atomic w.r.t. existence | Proven (POSIX + codebase use) | Unproven for this path (NTFS semantics differ; needs native proof) |
| `O_NOFOLLOW` refuses a swapped final symlink | Proven (POSIX; constant present) | Unproven (constant is 0; junction handling unproven) |
| Directory fsync persists the entry | Supported via `syncContainingDirectory` (B-2 power-loss rig still absent — durability across power loss is NOT_PROVEN even on Linux) | Proven failing (fsync fails natively; preflight refuses) |
| `lstat` dev/ino pinning detects swaps | Proven pattern (lock module, manifest reader) | Unproven (identity semantics on NTFS/reparse points differ) |
| Ancestor walk detects symlinked parents | Proven (`verifySelectedRoot`, `resolveProjectPath`) | Unproven (junction/reparse handling needs native conformance tests) |
| Concurrent creation serializes on `O_EXCL` | Mechanism proven; harness evidence required (SC-T25) | Unproven |
| `.vcp` absence ⟺ no managed state | Proven by code inventory (all state `.vcp/`-rooted) | Same code, but filesystem-identity assumptions above are unproven |
| Old CLI ignores `docs/tasks/*.md` | Follows from old CLI's documented behavior (reads manifest/`AGENTS.md`); not re-proven here | Same (old CLI behavior is version-defined, not platform-defined) — but the Windows POC (8/13) is the reason Windows activation needs its own proof |

## 4. Residual risks (carried to the Decision Proposal)

- **R-1 — Final micro-window parent swap (T3).** A parent swap
  between phase-3 re-validation and `open` is detected after
  the fact, not prevented. Impact bounded (single Markdown
  file, no secrets, writer already had write access).
  Hardening: F-H2 (descriptor-pinned creation).
- **R-2 — Empty-directory clutter (T6).** Failed runs can leave
  empty `docs/`/`docs/tasks/` directories. Cosmetic; documented.
- **R-3 — Late `.vcp` appearance (T7).** State created after
  phase 3 is not detected before `open`. Impact bounded (file
  only; managed state untouched). No mutual-exclusion claim.
- **R-4 — Partial file on crash (Design §2.4).** Crash during
  write leaves a partial file that blocks re-creation until
  manually removed. UX cost, documented; hardening F-H1.
- **R-5 — Predicate scope creep.** The most dangerous residual
  is organizational, not technical: once one scoped exception
  exists, pressure grows to widen it (other paths, managed
  projects, Windows-by-analogy). Mitigation: the decision
  record must name the exact operation, predicate, and
  platform scope, and state that any widening needs a new
  decision (see Decision Proposal draft language).

## 5. Non-goals (explicitly not threatened/analyzed here)

Full D-01 GO (separate decision, separate proof burden);
production-writer containment; power-loss durability (B-2);
Windows acceptance; L3 reviewer identity; CI enforcement;
multi-file transactions; migration/rollback design. Each has
its own owner decision and proof requirements; none is advanced
by this document.

— End of threat model —
