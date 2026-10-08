# Stage 12 G-FENCE POC — published VCP v0.9.3

**Status: INVESTIGATIVE / NOT AN APPROVED FENCE.** No schema-v2 migration is enabled. Reference main SHA: `8ccb276545fdb3cc301ce7ce324812eb4c314586`. This file belongs to the isolated POC branch stacked on Draft PR #87.

## Threat and artifact identity

Published 0.9.3 stale-reaps `.vcp/update.lock` *files* when the local PID is gone. Old `rollbackProject()` can restore an old backup without `readManifest()` of the live project; a newest-v2 backup can itself overwrite later project edits. A regular-file sentinel or separate `.vcp/lifecycle.lock` is not a proved zero-write fence.

The harness requires the authentic *published* npm `vibe-coding-production@0.9.3` tarball and an independently read npm Registry `dist.integrity` SHA-512 value. It never accepts a source checkout in place of the release. It creates disposable fixtures in the host temp directory; no real project path can be supplied. `--evidence` writes one NEW JSON output file outside the fixtures and refuses overwrite.

## Linux/macOS execution (Node >=22, npm, tar)

```bash
npm view vibe-coding-production@0.9.3 dist.integrity
npm pack vibe-coding-production@0.9.3 --pack-destination /tmp
node scripts/poc-old-cli-fence.mjs --tarball /tmp/vibe-coding-production-0.9.3.tgz --expected-integrity "$(npm view vibe-coding-production@0.9.3 dist.integrity)" --evidence /tmp/vcp-fence-UNIQUE-RUN.json
echo POC_EXIT=$?
```

Replace the evidence path with a unique new filename; its contents are never overwritten.

## Windows PowerShell execution (native Windows, Node >=22, npm, tar)

```powershell
$integrity = (npm view vibe-coding-production@0.9.3 dist.integrity).Trim()
npm pack vibe-coding-production@0.9.3 --pack-destination $env:TEMP
$archive = Join-Path $env:TEMP 'vibe-coding-production-0.9.3.tgz'
$receipt = Join-Path $env:TEMP ('vcp-fence-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
node scripts/poc-old-cli-fence.mjs --tarball $archive --expected-integrity $integrity --evidence $receipt
$pocExit = $LASTEXITCODE
Write-Host "POC_EXIT=$pocExit"
Write-Host "Evidence=$receipt"
```

Record actual OS/build, Node/npm/Git versions, main SHA, archive SHA256, raw command output, exit and changed-path receipts. Linux results never substitute for native Windows evidence.

## Harness-only checks: no release executed

```bash
node --check scripts/poc-old-cli-fence.mjs
node scripts/poc-old-cli-fence.mjs --self-test
node --test test/poc-old-cli-fence-harness.test.mjs
```

These merely exercise parser, snapshot and fail-closed mechanics, NOT old-binary mutation safety.

## Attack scenarios

| Scenario | What is measured |
|---|---|
| `rollback-v1-backup` | Real old rollback into a synthetic v1 backup while live manifest is v2 |
| `rollback-v2-erases-user-edit` | Live schema remains v2, but AGENTS has a post-backup edit at risk |
| `rollback-stale-transaction` | Old transaction backupId selects earlier v1 instead of newer v2 |
| `dead-pid-file-lock` | Old CLI reclaims ordinary lock with dead same-host PID |
| `separate-lifecycle-lock` | Old CLI ignores a hypothetical newer unrelated lock file |
| `directory-sentinel-rollback` | Whether legacy rollback blocks on a directory lock path |
| `directory-sentinel-update` | Whether legacy update offline blocks on a directory lock path |
| `directory-sentinel-manage` | Whether legacy manage ignore blocks on a directory lock path |
| `fresh-malformed-lock` | Non-stale malformed regular lock policy |
| `aged-malformed-lock` | Old malformed lock stale-removal/rollback |
| `intact-v2-old-init` | Old init --force with intact schema2 manifest |
| `deleted-manifest-old-init` | Old init --force with deleted manifest and residual VCP files |

The v2 fixtures and backups are synthetic and deliberately constructed from the published v1 state. Their layout is an adversarial test input, NOT proof that the eventual new migration engine writes the same bytes.

## Exit statuses and release gate

- **0:** No unexpected observation, no protected mutation in this restricted scenario subset. Does **NOT** establish G-FENCE.
- **2:** A protected mutation was observed. This is useful reproduction evidence but **NO-GO for migration**.
- **3:** Missing/tampered release identity, setup error, or unexpected behavior. Investigate and keep **NO-GO**.

Inspect the saved JSON: actual command exit/stdout/stderr; before/after content and modes (excluding transient legacy update.lock); resulting schema; whether a later user edit survived; archive identity; platform and unresolved cases. No mutation on one fixture does not prove permanent old/new mutual exclusion.

## Required evidence NOT provided by this initial POC

1. D-01 maintainer safety contract; strong zero-write is the default.
2. Real published-tarball Linux and native Windows runs with verified integrity.
3. Atomic file-lock to directory-sentinel transition while the old holder is active; Windows junctions/permissions.
4. Real new-CLI versus old-CLI concurrent mutation attempts; PID reuse; crash/ENOSPC/EACCES at every migration boundary.
5. Complete managed-migration journal recovery implementation and stale transaction preemption.
6. S/T accepted contracts and exact-head npm validate/pack-check evidence; Stage11 historic Windows gap is not backfilled.

**If the accepted D-01 barrier is unproven, keep live schema-v2 mutation disabled.**
