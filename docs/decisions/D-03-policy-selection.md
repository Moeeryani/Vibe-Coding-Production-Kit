# D-03 — Maintainer-confirmed design choice; coverage/implementation pending

**Decision owner:** Moeeryani (authenticated connected GitHub profile)  
**Maintainer instruction time:** 2026-10-09T01:25:54Z (project conversation)  
**Canonical register:** D-03 is **ACCEPTED** as a design decision (maintainer selected D-02/D-03/D-04/D-05/D-06/D-12 = ACCEPTED, 2026-10-10T19:02:43Z; see `docs/decisions/D-03.json` and `docs/ADAPTIVE-VCP-DECISIONS.md`). Its independent required-location inventory is still `coverageReview: PENDING` and there has been no native Windows junction proof, so acceptance of the design choice is **not** a claim that coverage, implementation, or acceptance machinery is complete.

## Selected policy

For untrusted project evidence, prompt overrides, planned project files and selected-root path uses, reject both out-of-root and **in-root symbolic links** and Windows junction/reparse-point traversal by default. The shared path resolver uses separate read-existing/write-new/managed-state policies, validates each existing parent component and refuses parent-relative traversal, reserved-state misuse and unexpected filesystem types. Only a purpose-specific exception reviewed and explicitly documented with proof fixtures may allow any link. Revalidate before mutation under the applicable lifecycle lock; `lstat` alone never promises TOCTOU freedom.

## Rejected alternatives

- Follow any symlink that resolves inside the root: vulnerable to aliasing/replacement and implicit authority.
- Prefix-only `safePath` checks: insufficient against symlink/junction escapes and races.
- Treat Linux symlink pass as native Windows proof: invalid; Windows remains UNVERIFIED.

## Requirements before canonical ACCEPTED status or product implementation

Review completeness of the D-03 S/T/ROADMAP/CLI/UPDATES/Stage12 Task Pack anchors independently; record explicit exceptions, tests and owner/UTC in a fully accepted decision JSON; then change `coverageReview` to APPROVED only following actual maintainer review. Run Linux and native Windows path negative tests in disposable fixtures and full exact-HEAD gates. No live schema-v2 migration, version rewrite, rollback or feature enablement is authorized by this policy selection.

**No implied D-06 acceptance:** GitHub Actions remain unavailable; exact-head Linux receipts are cooperative evidence, not protected remote enforcement.
