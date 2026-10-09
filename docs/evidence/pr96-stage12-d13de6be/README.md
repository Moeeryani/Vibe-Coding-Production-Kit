# PR #96 verification — new HEAD d13de6be (fixes applied)

- **Tested:** `feat/stage12-readonly-inspect-20261009` @ `d13de6be11d4c00b3350ccc23fb0708afb703000`
  (parent `ead41693d70e95a54e3dc2f5ac6d43517152f3b6`; the `670e7ff7` SHA from the
  request was not on the PR — actual HEAD at review time was `ead41693`.)
- **Run:** 2026-10-09, Linux x64, Node v24.20.0 (Mu's local runner)
- **Files:**
  - `full-suite-after-fixes.log` — `node --test` full suite after fixes:
    469 tests, 331 pass, 137 fail, 1 skip
  - `full-validate-before-fixes.log` — `npm run validate` on ead41693 before fixes
- **Fixes applied on the PR branch (d13de6be):**
  1. `lib/update-apply.mjs`, `lib/manage.mjs`: ACTIVE_OR_STALE_LOCK no longer masked
     behind the generic repository error — acquireUpdateLock emits its specific
     actionable error (or reaps a stale lock). Real bug.
  2. `lib/init.mjs`: non-dryRun init creates a missing target dir (was BLOCKED/
     ROOT_MISSING); dry-run plan result restores `dryRun:true`. Real bugs.
  3. Tests aligned with the deliberate v1 field-enumeration contract
     (install.assetSet refused, unrecognized metadata blocked, E_MANIFEST_VERSION
     for malformed v2 claim, valid 64-hex baselines in fixtures).
- **Remaining 137 failures:** old tests requiring the deliberately removed v1
  init path (commits 475b24b, 4b096af: "remove unreachable unsafe legacy writer",
  "fail closed on new init rather than writing schema-v1"). v1 init was removed
  by design after the D-01 findings; these tests need migration/removal as part
  of Stage 13 work — not attempted here.
- **Independent tarball check:** published 0.9.3 tarball downloaded from npm
  registry; SHA-256 `4b78fd41…9130` and SHA-512 dist.integrity both MATCH the
  receipt. The #89 POC ran against the genuine published artifact.
- **D-01 review:** the negative-proof report, audit script (exit 2 = NO-GO by
  design) and d01-negative-evidence tests (2/2 pass) are sound and honest about
  their limits. Proven from the real published 0.9.3 buildManifest: released
  0.9.3 never wrote `install.assetSet` — the v1 field-enumeration guard is correct.
- **Limits:** Linux only; native Windows UNVERIFIED (no Windows host in this
  sandbox — the Windows experiment from the request cannot be run here);
  cooperative evidence, not attestation; no merge, no release, no decision changes.
  D-01 DEFERRED, G-FENCE NO-GO unchanged.
