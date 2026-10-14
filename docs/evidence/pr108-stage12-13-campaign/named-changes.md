# Named Change List — PR #108 campaign (f4b6832b)

All changes below were implemented and verified **locally only** in
`~/workspace/vcp-stage12-13-campaign/repo`. **Nothing was pushed to the
integration branch.** Each entry names the change, target, files, rationale,
verified-on SHA, and test evidence, awaiting Moe's push direction.

Target branch for all: `integration/stage12-stage13-native-windows-foundation-20261011`

---

## FIX-01 — stray-paren syntax repair in D-01 principal boundary module

- **Files:** `lib/d01-principal-boundary.mjs:50` (1 line)
- **Change:** `)refusal('E_D01_STAT_INVALID');` → `refusal('E_D01_STAT_INVALID');`
  (remove stray leading `)` inside `requireStats`).
- **Rationale:** The module did not parse at all; `npm run check` (150 modules)
  failed on frozen HEAD. The typo was introduced by commit `bbb05a1`
  ("hardening(stage12): explicitly mark D-01 preflight as non-authoritative
  point-in-time read-only snapshot"). Syntax-only, restores the intended
  fail-closed refusal; zero behavioral surface beyond making the module load.
- **Verified on:** `f4b6832b` + FIX-01 (local, unpushed)
- **Evidence:** `node --check` on all 150 modules in `bin/`, `lib/`, `scripts/`
  passes; `npm run check` → "Syntax check passed for 150 module(s)."
  Per-file sweep confirmed this was the only syntax failure.

## FIX-02 — overlapping protected paths no longer raise E_D01_DUPLICATE_PATH

- **Files:** `lib/d01-principal-boundary.mjs` (`inspectLegacyPrincipalBoundary`,
  entry-building block)
- **Change:** Build the `entries` list as one entry per distinct path (Map
  keyed by path). A path that is both a namespace ancestor and a protected
  item (e.g. `--protected .vcp --protected .vcp/manifest.json`) keeps the more
  specific `'protected'` role. A literally repeated protected path
  (`--protected .vcp --protected .vcp`) still throws `E_D01_DUPLICATE_PATH`,
  preserving the anti-aliasing guard.
- **Rationale:** `pathsFromRoot()` listed `.vcp` both as a parent-ancestor of
  `.vcp/manifest.json` and as a protected item; `assessLegacyPrincipalBoundary`
  then refused the duplicate path. This made `scripts/inspect-d01-boundary.mjs`
  exit 3 with the report JSON on stderr instead of stdout, failing
  `test/d01-inspect-command.test.mjs` ("D-01 inspection CLI never exits 0 and
  does not mutate protected fixture"). Same-path-different-role is not
  aliasing; the refusal was a false positive. Security posture unchanged:
  read-only, always NO-GO, issue-code selection per path preserved
  ('protected' wins over 'parent' for dual-role paths).
- **Verified on:** `f4b6832b` + FIX-01 + FIX-02 (local, unpushed)
- **Evidence:** `node --test test/d01-inspect-command.test.mjs
  test/d01-principal-boundary.test.mjs test/d01-linux-isolation-fixture.test.mjs`
  → 16 pass / 0 fail. Negative check: `--protected .vcp --protected .vcp`
  still throws `E_D01_DUPLICATE_PATH` (guard preserved).

---

## PROPOSALS (not implemented — additive schema changes, need direction)

### PROP-01 — add observation timestamp to native scratch receipts

- **Files:** `scripts/native/vcp-windows-fsops.cpp` (`printResult`), optionally
  `lib/windows-fs-provider-candidate.mjs` (`interpretWindowsScratchResult`)
- **Rationale:** Runbook checklist requires operation, timestamp, identity,
  outcome, failure state, forensic info per receipt. Receipts currently carry
  5/6 — no timestamp, so forensic correlation against external timelines is
  impossible from the receipt alone. Emit `observedAt` (UTC ISO-8601) from the
  native binary (preferred: the JS layer must not backfill a misleading time).
  Additive field; strict validators use closed key sets, so they must allowlist
  the new key. Severity: MEDIUM (review finding F-1.1/F-3.1).

### PROP-02 — publish object identity on mutating-op receipts

- **Files:** `scripts/native/vcp-windows-fsops.cpp` (`printResult` for
  `write-exclusive`, `rename-no-replace`, `unlink`, `mkdir-exclusive`,
  `rmdir-empty`)
- **Rationale:** Only `inspect-entry` receipts carry `entry.identity`
  (volume-serial/file-index). Mutating ops verify identity internally
  (e.g. `verifyRenamedFileIdentity`) but do not emit it, leaving forensic
  correlation of receipts to later observations weaker than the runbook's
  identity requirement. Additive `identity` field (24-hex, same format as
  inspect). Severity: LOW (review finding F-1.2).

### PROP-03 — runtime SDDL fingerprint-stability test (Windows only)

- **Files:** new test, e.g. `test/windows-d01-security-stability.test.mjs`
  (win32-gated)
- **Rationale:** The only "stability" evidence for `securityDigest` today is a
  source-pattern assertion (SDDL API is called, raw-pointer hash absent). A
  real test must hash one object's SDDL twice (equal) and after a DACL mutation
  (different) on a Windows host. Cannot be written meaningfully without the
  host; record as Windows-campaign work. Severity: LOW (review finding F-2.1).

---

## Explicitly NOT changed

- D-01 stays DEFERRED. G-FENCE stays NO-GO. No gate, fence, or approval field
  was touched by any fix or proposal above.
- No merge, no release, no version publish, no production-writer enablement.
- No push to `integration/stage12-stage13-native-windows-foundation-20261011`.
