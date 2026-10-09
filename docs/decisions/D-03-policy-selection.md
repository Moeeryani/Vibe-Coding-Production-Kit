# D-03 — Maintainer-confirmed design choice; coverage/implementation pending

**Decision owner:** Moeeryani (authenticated connected GitHub profile)  
**Maintainer instruction time:** 2026-10-09T01:25:54Z (project conversation)  
**Canonical register:** D-03 remains **PROPOSED**, specifically because its independent required-location inventory is still `coverageReview: PENDING` and there has been no native Windows junction proof. This records a **selected design direction**, not a claim that all acceptance machinery is complete.

## Selected policy

For untrusted project evidence, prompt overrides, planned project files and selected-root path uses, reject both out-of-root and **in-root symbolic links** and Windows junction/reparse-point traversal by default. The shared path resolver uses separate read-existing/write-new/managed-state policies, validates each existing parent component and refuses parent-relative traversal, reserved-state misuse and unexpected filesystem types. Only a purpose-specific exception reviewed and explicitly documented with proof fixtures may allow any link. Revalidate before mutation under the applicable lifecycle lock; `lstat` alone never promises TOCTOU freedom.

## Rejected alternatives

- Follow any symlink that resolves inside the root: vulnerable to aliasing/replacement and implicit authority.
- Prefix-only `safePath` checks: insufficient against symlink/junction escapes and races.
- Treat Linux symlink pass as native Windows proof: invalid; Windows remains UNVERIFIED.

## Requirements before canonical ACCEPTED status or product implementation

Review completeness of the D-03 S/T/ROADMAP/CLI/UPDATES/Stage12 Task Pack anchors independently; record explicit exceptions, tests and owner/UTC in a fully accepted decision JSON; then change `coverageReview` to APPROVED only following actual maintainer review. Run Linux and native Windows path negative tests in disposable fixtures and full exact-HEAD gates. No live schema-v2 migration, version rewrite, rollback or feature enablement is authorized by this policy selection.

**No implied D-06 acceptance:** GitHub Actions remain unavailable; exact-head Linux receipts are cooperative evidence, not protected remote enforcement.
