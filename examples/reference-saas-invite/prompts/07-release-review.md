# Prompt: Release Readiness Review

```text
Assess this release against the release checklist and changed behavior.

Review:
- retained `release-check` evidence when the repository uses Stage 9 release automation;
- exact candidate revision and whether evidence came from preview or executed mechanics;
- included features/fixes and acceptance status;
- CI/test evidence;
- migrations/backfills and compatibility;
- configuration/secrets/feature flags;
- external dependency changes;
- security/privacy impact;
- observability and alerting;
- rollback or recovery path;
- known risks and operational runbooks;
- critical post-deploy smoke tests.

Do not produce a generic “ready/not ready” assertion without evidence. A green release-candidate gate is not approval to publish or create/move a tag. Keep publication/tag creation as HUMAN DECISION unless the human explicitly makes that decision outside the automated gate. List blockers, non-blocking risks, and exact verification still required.
```
