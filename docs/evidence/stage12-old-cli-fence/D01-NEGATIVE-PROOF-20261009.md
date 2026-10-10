# D-01: Negative compatibility proof review — 2026-10-09

**Decision: NO-GO for live v1→v2 managed migration.** This is an internal-consistency audit of the historical Linux observation, not a new published-npm execution, native Windows test, or proof of a proposed new fence.

## Evidence provenance

- Source: `linux-observations-20261009.json` copied from PR #89 at `2e8e098924e0c01d7b02bf93b1c82205acb50f32`.
- Source fixture baseline: `8ccb276545fdb3cc301ce7ce324812eb4c314586`.
- Historical receipt states: `vibe-coding-production@0.9.3`, Linux x64, Node `v24.20.0`, recorded `2026-10-08T23:55:22.145Z`.
- Recorded release tarball SHA256: `4b78fd413cf5e3508f5a5a34b5b47418d437eacd4343290f03b3ac5126ac9130`.
- The 12 unique scenario names, reported mutation deltas, command outcomes and counts were inspected on 2026-10-09. No internal mismatches were found. Independent npm archive integrity could not be rechecked because the execution environment cannot reach npm.

## Seven historical loss witnesses

The old release was recorded changing `AGENTS.md` after a new user edit in seven cases; the receipt says `postBackupEditSurvived:false` in each.

| Witness | What the old release was recorded doing |
|---|---|
| `rollback-v1-backup` | Restored old schema-v1 data over live v2 |
| `rollback-v2-erases-user-edit` | Restored a v2 backup while losing a later user edit |
| `rollback-stale-transaction` | Followed a stale legacy transaction to a previous backup |
| `dead-pid-file-lock` | Ignored a non-live PID lock by reclaiming it before rollback |
| `separate-lifecycle-lock` | Did not honor an unrelated new lock file |
| `aged-malformed-lock` | Allowed stale malformed lock recovery then modified protected bytes |
| `deleted-manifest-old-init` | Reinitialized via old `init --force` after removal of live Manifest |

Five historical cases did not change protected data in their **single Linux fixture**. Three involved directory-shaped `.vcp/update.lock` with rollback, update or manage. They are partial positive observations, not evidence that an atomic transition or Windows fence is safe.

## New case, not yet executed

`scripts/poc-old-cli-fence.mjs` now adds `deleted-manifest-directory-sentinel-old-init`: remove live `.vcp/manifest.json`, retain directory sentinel, and attempt old `init --force` on a disposable fixture. Its result is **UNVERIFIED**; it is not included in the historical 12 scenarios.

## What the evidence establishes

One verified protected-byte overwrite disproves a universal old-CLI zero-write guarantee. The historical receipt contains seven internally consistent such witnesses. It supports **NO-GO for backup-only, ordinary stale file lock, and independent lock-file strategies**. It does not independently certify the release tarball or disprove every possible directory sentinel implementation.

Remaining prerequisites: independently authenticate published npm 0.9.3 on Linux and native Windows; run the missing-manifest sentinel case; show crash/ENOSPC/permissions, file-lock-to-directory atomic handoff, stale/foreign PIDs, concurrent old/new writers and untouched post-backup user edits; document human maintainer acceptance and rerun the complete exact-head Stage12 suite.

**Do not change `MANAGED_SCHEMA_MIGRATION_GATE` to GO, merge, publish, or mark Stage12 done. Canonical decision D-01 remains DEFERRED.**
