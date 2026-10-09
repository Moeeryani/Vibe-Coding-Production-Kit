# Product-code verification — PR #96 (Stage 12 read-only foundations)

- **Tested HEAD:** `ab1be63c2c889e37687faeb605b7b7276af5e0ad` (PR #96 branch head at run time; base: main)
- **Result:** all green, no code fixes required — HEAD unchanged
- **Run:** 2026-10-09, Linux x64, Node v24.20.0, npm 10.9.4 (Mu's local runner)
- **Files:**
  - `npm-validate.stdout.log` — full `npm run validate` (framework + syntax + full suite)
  - `npm-pack-check.stdout.log` — `npm run pack:check`
  - `stage12-targeted-tests.log` — the 6 new Stage 12 test files (30 tests)
  - `probe1.mjs` / `probe2.mjs` — behavioral + adversarial probe scripts (38 checks)
- **Note:** `/tmp/...` paths in logs are a disposable Linux sandbox; no secrets.
- **Note:** this branch is based on main, so the local-gates scripts (#90) are absent; the manual gate (validate + pack:check) was run instead.
- **Limits:** cooperative local evidence, not independent attestation; Windows native UNVERIFIED; no merges, no release, no decision changes.
- Evidence branch only — the PR #96 branch HEAD is unchanged.
