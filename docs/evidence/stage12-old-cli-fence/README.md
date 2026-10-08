# Stage12 published-old-CLI fence — evidence index

**Status:** AWAITING REAL EXECUTION. **Gate:** G-FENCE = UNVERIFIED / NO-GO. **Owner:** computer-enabled validation agent; **decision authority:** maintainer.

**Important:** This is a placeholder/index, NOT evidence of any real published-0.9.3 execution. No unpublished/mock/source-built test or GitHub Actions check may substitute for the immutable npm release.

## Pending validation receipts

| Host/platform | Exact tested Git HEAD | npm tarball SHA256 and Registry integrity | Native baseline validate/pack | 12-case POC | G-FENCE |
|---|---|---|---|---|---|
| Linux | PENDING | PENDING | NOT RUN | NOT RUN | UNVERIFIED |
| Windows native | PENDING | PENDING | NOT RUN | NOT RUN | UNVERIFIED |

## Required per-execution evidence groups

Write a versioned JSON/Markdown receipt with: test ID; Git SHA; worktree status; authenticated published package identity and hash; OS/architecture; Node/npm/Git versions; exact invocation; UTC timing; exit code; pass/fail/skip+reasons; before/after protected manifest and file hashes; changed paths; expected versus actual; raw log artifact reference; runner identity or pseudonym; caveats. Distinguish complete raw evidence from any redacted/public excerpt.

## Findings

- **Published old-CLI mutation tests:** NOT EXECUTED; no safe-fence conclusion.
- **Atomic directory transition:** NOT EXECUTED; cross-process gap prevention UNPROVEN.
- **Old/new process concurrency:** NOT EXECUTED; mutual exclusion UNPROVEN.
- **Managed migration journal and crash recovery:** NOT IMPLEMENTED; cannot be proven by this POC.
- **Native Windows tests:** NOT EXECUTED.
- **Historical Stage11 finalization Windows rerun:** previous evidence gap remains historical; do not backfill.

## Agent completion procedure

1. Perform the commands in `docs/tasks/stage12-fence-agent-execution-handoff.md` on clean, pinned checkout(s).
2. Put sanitized per-platform JSON receipts in this directory, without copying user data or npm package tarballs.
3. Update the matrix with exact SHA, raw evidence references, per-case changed paths, and blockers.
4. Post a PR comment linking this index and describing each unexpected or unsafe mutation; report all missing platforms and test gaps.
5. Do NOT change this file's status to G-FENCE PASS, accept D-01, merge, or enable schema2 migration.
