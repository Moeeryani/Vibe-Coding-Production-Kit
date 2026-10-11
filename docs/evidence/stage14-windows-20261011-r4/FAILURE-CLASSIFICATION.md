# Stage 14 R4 — Failure Classification (full suite, native Windows)

`npm test` at de8faa19 on native Windows/NTFS: 677 tests, 572 pass, 62 fail, 43 skipped, exit 1.

The 62 failing names are **byte-identical** to the previous Windows campaign at d6be7420
(diff of sorted name lists = IDENTICAL_62_FAILURES), and are a subset of the previous Linux
campaign's 64 (the 2 Linux-only extras pass on Windows). **No Windows-specific regression.**

## Classes (attributed by failing test name, verified in logs/14-npm-test.log)

1. **D-01/G-FENCE class** — error `E_G_FENCE_NO_GO`: "D-01/G-FENCE NO-GO: managed schema-v2
   writes disabled pending published-old-CLI safety proof and maintainer approval"
   (42 error occurrences). Tests that expect managed schema-v2 write flows to succeed fail
   closed by design, including downstream texts `Task is not ready for implementation …`
   (task/verify CLI chain) and `Recovery state cannot be trusted before acquiring a legacy
   lock` (update-lifecycle / update-stage-cleanup interrupted-transaction tests).
   The fence is active and unbypassed; opening D-01 is prohibited for this campaign.

2. **Linux native-helper class** — error `E_NATIVE_HELPER_MISSING: build it: npm run
   build:native-linux` (26 error occurrences). The Linux native helper is intentionally not
   built on Windows and the campaign instructions forbid `npm run build:native-linux` here.
   Environment-scoped, not a product defect on Windows.

3. **Pre-existing cross-platform failures** — 2 tests in `test/react-native-detection.test.mjs`
   (`symlinked package.json cannot grant React Native authority but preserves historical Node
   fallback`, `React Native app markers must be real selected-root files/directories, not
   symlinks`) fail with `Error: Unsafe project path: LINK_REFUSED`. They fail identically on
   the previous Linux campaign and the previous Windows campaign (present in both prior name
   lists). The guard fails closed with a different error shape than these tests expect;
   pre-existing, unchanged by this candidate, fails on both platforms.

## Two previous Linux-only failures passing on Windows (same as previous campaign)

- `enforce refuses without privilege` — linux-only kernel fence
- `preflight refuses blocked ancestor before writing any template or vcp state` — passes on
  Windows (gate 13); W-5 typed-guard ENOTDIR routing verified.

## Verdict

All 62 failures belong to the known G-FENCE / native-helper / pre-existing cross-platform
classes, with names identical to the previously accepted Windows campaign. **Zero new Windows
regressions.** Per campaign instructions these failures did not stop the run; they are recorded
here separately and are not Stage 14 build-scope defects.
