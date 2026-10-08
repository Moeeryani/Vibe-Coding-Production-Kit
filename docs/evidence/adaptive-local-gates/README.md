# Local gate evidence — PR #90 (interim, no GitHub Actions)

**Tested HEAD:** `a865d941c7c3dca384912c360ce9f881dcb01e19`
**Result:** `LOCAL_GATE_PASS_NOT_REMOTE_ENFORCEMENT`
**Platform:** Linux x64 · Node v24.20.0 · npm 10.9.4 · git 2.43.0
**Recorded:** 2026-10-08T23:57Z (receipt.json `recordedAtUtc`)

## What ran (exact-HEAD runner, all exit 0)
- `check-adaptive-contracts`: 14 focused anchors, 12 unique D-IDs, 0 ACCEPTED / 12 PENDING
- `npm ci`, `npm run validate` (416 tests: 415 pass, 0 fail, 1 skip), `npm run pack:check`
- Runner refusal paths verified separately: pre-existing evidence dir → exit 2

## Files
- `receipt.json` — machine-readable receipt (schema v1), incl. 4 verification limitations
- `*.stdout.log` / `*.stderr.log` — per-step raw logs

## Limitations (do not over-claim)
- Cooperative local evidence only; no remote enforcement, no merge protection
- Windows native path UNVERIFIED (no Windows host in this run)
- Approves nothing: D-01–D-12 remain PROPOSED, G-FENCE stays NO-GO
- Maintainer must run the procedure independently; see `docs/ADAPTIVE-VCP-LOCAL-GATES.md`
