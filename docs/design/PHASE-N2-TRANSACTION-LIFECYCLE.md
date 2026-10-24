# Phase N+2 — Secure Transaction Lifecycle (design)

Baseline: Phase N+1 candidate `673b96b` (X-02 PASS, X-05
PASS_WITH_STATED_RESIDUAL — both preserved). Phase N+2 completes the
lifecycle operations around the atomic writer: staging reap, helper
trust freshness, audit evidence, journal/lock namespace binding, and
precise scope contracts for the remaining filesystem modules.

## 1. Finding 003 — reap provenance (fixed)

See `docs/SECURITY-FINDING-003-REAP-UNANCHORED-DELETION-20261024.md`.
Contract now: **no anchor → no deletions** (receipt carries
`refused: 'E_FS_ANCHOR_UNAVAILABLE'` and lists candidates under
`skipped`); with an anchor, every unlink is root+parent+file bound
and refusals land in `skipped`, never in `removed[]`.

Honest limit of any name-pattern reaper, stated once here so no
receipt or report overclaims again: reap proves (a) the deletion
happened inside the anchored namespace, and (b) the object deleted
is the object stat'ed immediately before (stat→unlink stability via
`--expect-file`). It cannot prove the object was staged by a
transaction — a file planted under a staging name inside the genuine
managed directory before the sweep is indistinguishable from a real
leftover, and removing exactly those is the reaper's function.

## 2. S3b — helper trust freshness (fixed)

Three distinct concepts (also documented in
`lib/native-helper-trust.mjs`):

- **Binary integrity** — bytes on disk hash to the manifest. Phase
  N+1 checked this once per provider instance and re-checked only
  when `(dev, ino, size, mtimeMs)` changed. The acceptance
  supplement (S3b) proved a stat-preserving in-place swap defeats
  that trigger. Phase N+2: `verifyNativeHelper` runs on **every**
  spawn. Stat metadata is never proof of content again.
- **Executable identity** — the (dev, ino) measured is what the OS
  loads when the provider spawns by path. The verification-to-exec
  window inside one spawn remains (sub-millisecond; the attacker
  must already write the install tree). Closing it requires
  executing a pinned copy (e.g. a verified copy in a private temp
  dir, or memfd) — recorded as a residual, not silently ignored.
- **Installation provenance** — manifest + source are in-tree
  statements. Consistent replacement of binary + manifest + source
  (full install-tree compromise) is NOT defeated by in-tree checks
  and is not claimed to be; it needs an external trust root.

## 3. R-3 — audit evidence (implemented)

`recordWriterEvidence` routes through the provider when the native
helper is built: the entry is appended by `append-file-sync`
(O_APPEND|O_NOFOLLOW|O_CREAT under the pinned parent walk, fsync
before success) carrying root + .vcp parent expectations, and the
entry itself records `namespace {root, parent}` (dev:ino) and
`helperSha256`. Outcomes are distinguished honestly:
`{audited:true, anchored:true}` only after a synced append in the
anchored namespace; `{audited:false, reason:'NO_MANAGED_STATE'}`
when .vcp is absent (unchanged legacy receipt); any identity/trust
failure throws — evidence is never manufactured after a partial
failure, and never written into a substituted namespace. The legacy
path append remains only for trees where the helper is not built
(unbuilt development state; secure mutations already fail closed
there, so no anchored transaction can produce unanchored evidence).

## 4. R-2 — lock and journal namespace binding (hardened, not closed)

- **Journal** (`lib/versioned-journal.mjs`): digest checks prove
  content continuity but are namespace-blind (a byte-identical .vcp
  copy passes them). Added a namespace pin: `.vcp` (dev, ino)
  captured at `writeVersionedJournal`/`clearVersionedJournal` start
  and re-verified at the commit points (after rename; before
  unlink); mismatch → `E_JOURNAL_NAMESPACE_CHANGED`.
- **Lock** (`lib/lifecycle-lock-v2.mjs`): already pinned .vcp and
  lock-file identity at acquire and re-verified before release.
  Added post-creation re-verification of the pinned state dir: a
  substitution landing during creation removes only the
  inode-proven file this call created and refuses with
  `E_STATE_BOOTSTRAP_CHANGED`.
- **Stated residual:** the lock's create/release and the journal's
  staging/rename still resolve through paths between their identity
  checks (sequential check/use windows inside each operation), and
  stale-lock policy is unchanged (no stealing, owner-proven release
  only). Full provider migration of the lock/journal internals —
  every mutation descriptor-bound — remains a separate phase;
  Phase N+2 does not claim it.

## 5. R-4 / R-5 — scope contracts (documented, not expanded)

- `lib/file-durability.mjs` `syncContainingDirectory` (R-4): a
  durability PRIMITIVE, not a mutation — it lstat-verifies the
  directory it fsyncs (identity before/after) but resolves ancestors
  by path. Inside anchored transactions the provider's
  `syncDirectory` is the pinned equivalent and is what the writer
  uses. The primitive's contract is durability of a named directory,
  not namespace containment.
- `lib/safe-read.mjs` (R-5): read-only; its header already disclaims
  a dirfd guarantee. A swapped intermediate can redirect a READ —
  reads authorize nothing and mutate nothing; consumers that make
  authorization decisions re-verify through their own pins (B-9).
- `lib/safe-replace.mjs`, `lib/safe-create.mjs`,
  `lib/versioned-backup.mjs` (R-5): user-approved OUTPUT paths
  outside the managed transaction boundary. Content substitution is
  bounded by preimage/postimage hash re-checks (safe-replace) and
  exclusive creation (safe-create); they do not carry, and must not
  be cited as carrying, the production writer's containment
  contract. `lib/managed-schema-migrator.mjs` is gate-refused before
  any write. Versioned BACKUPS consumed by rollback are written by
  the provider-composed rollback path inside the writer boundary;
  the standalone backup module remains an output-path utility.

## 6. What Phase N+2 does NOT prove

- FULL_TRANSACTION_CONTAINMENT stays NOT_PROVEN: lock/journal
  internals are hardened at their commit points, not fully
  descriptor-bound (§4 residual).
- The verification-to-exec micro-window (§2) and full
  install-tree compromise (§2) remain stated residuals.
- Root ancestors (R-6) remain unauthenticated by the helper;
  transaction root-object continuity is Phase N+1's, unchanged.
- B-2 power-loss NOT_PROVEN; Windows fail-closed; B9-01b
  INCONCLUSIVE — all unchanged.
