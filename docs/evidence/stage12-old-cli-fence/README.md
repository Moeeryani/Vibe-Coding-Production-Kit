# Stage12 published-old-CLI fence — evidence index

**Status:** LINUX EXECUTED 2026-10-08 (UTC); Windows native UNVERIFIED. **Gate:** G-FENCE = **NO-GO** (unsafe legacy mutation demonstrated, POC exit 2). **Owner:** computer-enabled validation agent; **decision authority:** maintainer.

**Important:** Linux results never substitute for native Windows evidence. No unpublished/mock/source-built test or GitHub Actions check was substituted for the immutable npm release.

## Execution receipts

| Host/platform | Exact tested Git HEAD | npm tarball SHA256 and Registry integrity | Native baseline validate/pack | 12-case POC | G-FENCE |
|---|---|---|---|---|---|
| Linux x64 (Node v24.20.0, npm 10.9.4, git 2.43.0) | `c89960b9ed1bc2ce17fd291019820e16caa11044` (detached, clean tree) | SHA256 `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130`; integrity `sha512-Ielotp4W44vUq1YRqYuQlmC2ztopoQHLN8ypb6ymE8pvI3VCAfGYOIB7uYm9+Df7sMttN9bkznbOqP3iirzcTg==` verified BEFORE execution | `npm ci` 0; `npm run validate` 0 (412 tests: 411 pass, 0 fail, 1 skip); `npm run pack:check` 0 (192 files); `node --check` 0; harness unit tests 0 (3 pass) | exit **2** — 7/12 unsafe mutations, 0 unexpected observations | **NO-GO** |
| Windows native | — | — | NOT RUN | NOT RUN | UNVERIFIED (no Windows host available to this agent) |

Full per-scenario receipt: [`linux-observations-20261009.json`](./linux-observations-20261009.json) (14 KB; disposable `/tmp` fixture paths only, no user data).

## Per-scenario observed results (Linux, real published 0.9.3)

| Scenario | Old CLI command | Exit | Mutation observed | Schema after | Post-backup edit survived | Notes |
|---|---|---|---|---|---|---|
| `rollback-v1-backup` | `rollback` | 0 | YES | 2 → **1** | no | Silent v2→v1 downgrade, no record |
| `rollback-v2-erases-user-edit` | `rollback` | 0 | YES | 2 | **no** | Newest v2 backup restored, but post-backup user edit erased |
| `rollback-stale-transaction` | `rollback` | 0 | YES | 2 → **1** | no | Stale `transaction.backupId` outranks newest backup; `transaction.json` consumed |
| `dead-pid-file-lock` | `rollback` | 0 | YES | 2 → **1** | no | Same-host dead-pid file lock stale-reaped, then downgrade |
| `separate-lifecycle-lock` | `rollback` | 0 | YES | 2 → **1** | no | Old CLI ignores `lifecycle.lock` entirely — lock-path separation is NOT mutual exclusion |
| `directory-sentinel-rollback` | `rollback` | 1 | no | 2 | yes | Directory at lock path blocks; directory intact afterward |
| `directory-sentinel-update` | `update --offline` | 1 | no | 2 | yes | Blocked |
| `directory-sentinel-manage` | `manage ignore` | 1 | no | 2 | yes | Blocked |
| `fresh-malformed-lock` | `rollback` | 1 | no | 2 | yes | Fresh malformed lock refused (not yet stale) |
| `aged-malformed-lock` | `rollback` | 0 | YES | 2 → **1** | no | 2h-old malformed lock stale-removed, then downgrade |
| `intact-v2-old-init` | `init --force` | 1 | no | 2 | yes | Refuses on intact manifest |
| `deleted-manifest-old-init` | `init --force` | 0 | YES | (recreated) **1** | no | Deleted manifest + v2 residue → old init recreates v1, overwrites AGENTS.md |

## Follow-on investigations (same run)

- **Stale `transaction.backupId` precedence:** DEMONSTRATED (`rollback-stale-transaction`); confirmed in published source `lib/update-apply.mjs:193-197` (`if (transaction?.backupId) selected = transaction.backupId`).
- **`rollbackProject` never reads the manifest:** confirmed in published source — zero `readManifest` references in `lib/update-apply.mjs`.
- **Lock stale-reap rules (published `lib/state.mjs:236-282`):** same-host dead pid → immediate reap; foreign-host lock → reap only after 1h mtime staleness. Verified empirically: fresh foreign-host lock + crash-residue `transaction.json` → old rollback refuses with "Another VCP update appears to be running" (exit 1), no mutation.
- **Atomic file→directory sentinel conversion:** UNVERIFIED — no migration writer exists yet to test; conversion atomicity cannot be proven by this POC. Any future conversion must be atomic w.r.t. concurrent old-CLI stale-reap.
- **Old/new concurrent writers:** UNVERIFIED — no new CLI exists; locks are advisory only (proven by `separate-lifecycle-lock` being ignored).
- **PID reuse:** UNVERIFIED — PID allocation cannot be controlled deterministically in this environment; analyzed via `process.kill(pid, 0)`/EPERM semantics in published source.
- **ENOSPC/EACCES at migration boundaries:** targeted old-CLI injection NOT performed. EACCES untestable here (agent runs as root). ENOSPC observed indirectly: the repo suite's own fixture leak filled this host's 512 MB `/tmp` tmpfs twice during this run (unrelated to the old CLI).
- **Native Windows (all scenarios):** UNVERIFIED — no Windows host available.

## Findings

- **Published old-CLI mutation tests:** EXECUTED on Linux. 7 of 12 scenarios demonstrate unsafe legacy mutation with exit 0 and no record. G-FENCE is **NO-GO** for schema-v2 migration on this evidence.
- **Directory sentinel (Linux only):** blocks old `rollback`/`update`/`manage` with exit 1 and preserves the directory; user edits survive. This is evidence FOR the candidate on Linux only — NOT an atomic-conversion, Windows, or mutual-exclusion proof.
- **File sentinel / lock-path separation:** proven ineffective on Linux (stale-reaped; ignored).
- **Atomic directory transition:** NOT EXECUTED; cross-process gap prevention UNPROVEN.
- **Old/new process concurrency:** NOT EXECUTED; mutual exclusion UNPROVEN.
- **Managed migration journal and crash recovery:** NOT IMPLEMENTED; cannot be proven by this POC.
- **Native Windows tests:** NOT EXECUTED.
- **Historical Stage11 finalization Windows rerun:** previous evidence gap remains historical; do not backfill.

## Agent completion procedure

1. Perform the commands in `docs/tasks/stage12-fence-agent-execution-handoff.md` on clean, pinned checkout(s). ✅ (this run)
2. Put sanitized per-platform JSON receipts in this directory, without copying user data or npm package tarballs. ✅ (`linux-observations-20261009.json`)
3. Update the matrix with exact SHA, raw evidence references, per-case changed paths, and blockers. ✅
4. Post a PR comment linking this index and describing each unexpected or unsafe mutation; report all missing platforms and test gaps. (pending)
5. Do NOT change this file's status to G-FENCE PASS, accept D-01, merge, or enable schema2 migration.
