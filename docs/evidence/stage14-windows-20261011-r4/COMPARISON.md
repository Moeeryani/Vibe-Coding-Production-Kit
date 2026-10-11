# Stage 14 R4 — Comparison vs Previous Windows Campaign (d6be7420)

Previous evidence: branch `evidence/stage14-windows-d6be7420` (tip 62a4018d),
`docs/evidence/stage14-windows-20261011/`.

## Suite-level totals

| Suite | Previous (d6be7420) | Current (de8faa19) | Delta |
|---|---|---|---|
| test:stage13 | 61 pass / 0 fail / 5 skip | 66 pass / 0 fail / 5 skip | +5 pass (the five new W-6 native tests, inside stage13-windows-ntfs.test.mjs) |
| test:stage14 | 25 pass / 0 fail | 26 pass / 0 fail | +1 pass (COVERAGE-02 provider validator negative controls) |
| npm test | 671 total / 566 pass / 62 fail / 43 skip | 677 total / 572 pass / 62 fail / 43 skip | +6 total, +6 pass, fail and skip counts unchanged |
| pack:check | PASS, 316 files | PASS, 316 files | identical |
| package version | 0.9.3 | 0.9.3 | unchanged |

## 1. New tests that pass (name-level, comm diff of sorted pass lists)

- `native Windows linked selected root and in-root alias are rejected`
- `native Windows provider inspection rejects a junction-selected root`
- `native Windows inspection refuses symlinked manifest without reading its target`
- `native Windows path guard rejects internal and external file symlinks`
- `native Windows adoption plan refuses symlinked external source evidence`
- `Stage14 provider validator refuses missing required docs and self-sentinel module`

(Two apparent extra diffs — `Stage12 reconciliation: T preserves final #87 …` and
`test\helpers\legacy-v1-fixture.mjs` — are TAP-vs-spec-reporter escaping artifacts of the
same passing entries, not result changes.)

## 2. New tests that fail

None.

## 3. Old tests whose result changed

None. 566 → 572 is exactly the six new passes; no previous pass became fail or skip, and no
previous fail became pass. The 62 failing names are byte-identical to the previous campaign
(IDENTICAL_62_FAILURES) and a subset of the previous Linux 64 (comm proof: 0 outside; the 2
Linux-only extras `enforce refuses without privilege` and `preflight refuses blocked ancestor
before writing any template or vcp state` pass on Windows as before).

## 4. Old Windows skips now having a proven delegate

Skip count stays 43 and the same 8 Windows-delegated names still skip on Windows by design,
but four formerly-`pending` annotations now name concrete native delegates that were executed
and PASS in this campaign (see W6-DELEGATE-MATRIX.md):

- `inspect: linked root, .vcp state and manifest are never trusted` (was "pending" → named delegate, proven)
- `inspect: symlinked parent component is rejected even for in-root target` (was "pending" → proven)
- `reject external and internal symlinks, linked parent and linked selected root` (was "pending" → proven)
- `symlinked source evidence fails closed without reading outside root` (was "pending" → proven)

## 5. New skips

None. Composition unchanged: 26 native-Linux-helper skips, 6 linux-only, 3 Linux-native
preservation proofs, 8 Windows-delegated skips (full list with reasons:
`windows-skip-names.txt`).

## 6. G-FENCE-related failures

42 `E_G_FENCE_NO_GO` error occurrences plus downstream readiness/verify texts, and 26
`E_NATIVE_HELPER_MISSING` — classified in FAILURE-CLASSIFICATION.md. Fence unbypassed;
no D-01/G-FENCE modification made by this campaign.

## 7. Windows regression?

**None.** No new failing name, no lost pass, no new skip, identical pack inventory.

## Package inventory comparison (path-level, proven by list diff not assumption)

- vs previous Windows pack: **identical** (PACK_PATHS_IDENTICAL_TO_PREV_WINDOWS).
- vs previous Linux pack (317 files): the **only** difference is `scripts/native/vcp-linux-fsops`
  (compiled Linux binary, absent on Windows as expected). All 316 other paths identical.
- Runtime present: `bin/vibe-coding-production.mjs`; canonical prompts `prompts/01..07` present;
  new provider docs `docs/CONSUMER-ASSET-SEPARATION.md`, `docs/STAGE14-ACCEPTANCE-MATRIX.md`
  present in the provider package; consumer-seed isolation proven by passing test
  `Stage14 validator keeps provider docs mandatory only for provider source` (provider docs
  ENOENT in seeded consumer fixture).
