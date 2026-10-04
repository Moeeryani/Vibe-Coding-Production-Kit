# Task — Implement Stage 10 deterministic community plugin model

Status: Review
Slug: `stage10-community-plugins`

## Outcome

VCP can load explicitly selected, local, digest-pinned declarative community profiles as additive bounded context while preserving core safety contracts and human control of trust and executable verification state.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Plugin contract | `docs/COMMUNITY-PLUGINS.md` |
| Issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/78 |
| PR | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/pull/79 |

## Requirement restatement

Complete Stage 10 with a deterministic/versioned plugin model that is explicit in trust and cannot silently weaken core safety rules. V1 is local declarative community profiles only; no executable plugin runtime or remote installation.

## Acceptance criteria

- [ ] AC-001 — project declaration and plugin manifest schemaVersion 1 are strict and versioned.
- [ ] AC-002 — plugin selection is explicit; absence of declaration performs no discovery and remains backward compatible.
- [ ] AC-003 — selected id/version/path/digest/grants must exactly match validated local bundle state.
- [ ] AC-004 — bundle paths are repository-local, drive/URL/traversal/symlink safe.
- [ ] AC-005 — canonical digest covers all LF-normalized text files deterministically and detects add/remove/edit tampering.
- [ ] AC-006 — v1 rejects executable/binary bundle files and executable-style/unknown manifest contribution keys.
- [ ] AC-007 — VCP compatibility range, known capabilities, duplicates, and concrete verification slots are validated exactly.
- [ ] AC-008 — guidance contributions compose additively into only declared context modes and appear in the context manifest/budget.
- [ ] AC-009 — verification command contributions require explicit project grant and remain labeled proposals that VCP neither writes nor executes.
- [ ] AC-010 — Doctor uses the same loader and reports absent/valid state as pass and invalid/tampered state as fail.
- [ ] AC-011 — `vcp plugins` provides read-only human/JSON inspection.
- [ ] AC-012 — `vcp plugins --digest` computes the canonical pin without changing selection/trust.
- [ ] AC-013 — init/update lifecycle never invents plugin selections and leaves project-owned declaration/bundles outside managed template state.
- [ ] AC-014 — realistic React Native-readiness community fixture dogfoods guidance + verification-proposal capabilities without claiming mobile support.
- [ ] AC-015 — negative tests independently prove traversal, URL/drive path, symlink, digest mismatch, duplicate id/path/grant, unsupported schema/kind/capability/file type, id/version/compatibility mismatch, forbidden manifest key, and ungranted command paths fail.
- [ ] AC-016 — docs/README/CLI/Roadmap/package validation explain trust, authoring, compatibility, and non-goals.
- [ ] AC-017 — Stage 10 does not change stack auto-detection or implement the separate Mobile profiles roadmap commitment.

## Scope

### In scope

- `docs/plugins/PLUGINS.json` explicit project declaration;
- local text-only community bundles with `plugin.json`;
- canonical bundle hashing;
- guidance and verification-proposal capabilities;
- Context integration;
- Doctor integration;
- read-only plugin inspection/digest CLI;
- provider fixture, docs, tests, validation.

### Out of scope

- executable plugin code/hooks;
- npm/registry/network plugin installation;
- plugin marketplace;
- remote signature/PKI;
- automatic trust;
- plugin-owned Source of Truth authority;
- core policy overrides;
- native mobile stack support.

## Affected boundaries

- Modules/files likely affected: community plugin loader, context, Doctor, CLI, provider docs/examples, validation, tests, roadmap/readmes.
- Public API/contract impact: additive `vcp plugins`; optional project declaration `docs/plugins/PLUGINS.json`.
- Data/schema/migration impact: plugin declaration/manifest schema v1 are project-owned opt-in data; no VCP lifecycle migration is required because existing projects remain valid without a declaration.
- External integration impact: none; plugin loading performs no network or registry access.

## Domain invariants

- File presence is not trust.
- Selection and capability grants are explicit project decisions.
- Proposal is not approval.
- Context is transport, not authorization.
- Plugin state cannot weaken core readiness/security/release/update contracts.
- Plugin loading is deterministic and restartable from repository state.
- Digest mismatch fails rather than silently accepting changed content.

## Security and privacy

- Authentication impact: n/a — local declarative loader has no authentication surface.
- Authorization/resource ownership: project declaration controls which local bundles are selected; plugins cannot select/grant themselves.
- Tenant isolation: n/a — loader is repository-local and has no tenant/shared-service model.
- Input/trust boundaries: declaration JSON, manifest JSON, bundle paths/content, digest pins, capabilities, VCP compatibility, and Markdown guidance are untrusted inputs validated before use.
- Secrets/PII/logging: plugin inspection/context may expose selected plugin text already present in the repository; no extra command stdout/stderr or remote data is collected.
- Abuse/rate/replay considerations: no remote rate surface; replay is deterministic reloading of pinned local state. Tampering changes the digest and fails.
- Relevant threat IDs: n/a — no accepted project threat ID specifically governs this local declarative extension loader and none should be invented.

## Failure modes and edge cases

- missing declaration or empty plugin list;
- malformed/duplicate declaration entries;
- path traversal, URL, drive path, symlink;
- missing bundle/manifest/guidance;
- binary/executable file in bundle;
- digest mismatch after any file change;
- plugin id/version mismatch;
- incompatible VCP version range;
- unknown/duplicate capability or grant;
- contribution without required grant;
- unsupported manifest/contribution key;
- guidance with no modes;
- invalid verification slot or placeholder command;
- context budget exceeded after plugin guidance;
- invalid selected plugin causing Doctor/context/inspection failure.

## Observability

Human and JSON plugin inspection show selected id/version/path/digest/grants/capabilities/guidance/proposals. Doctor exposes one durable community-plugin check. Context manifests include declaration, manifest, and active guidance files.

## Test plan

### Unit

- schema/id/version/path/capability/grant validation;
- canonical digest and CRLF normalization;
- bundle file restrictions;
- VCP compatibility;
- verification proposal validation.

### Integration / contract

- selected fixture inspection;
- Context composition + budget/manifest;
- Doctor absent/valid/invalid behavior;
- CLI human/JSON inspection + digest;
- init/update project-owned preservation semantics.

### E2E / regression

- dogfood `vcp plugins --dir examples/community-profile-react-native --json`;
- build a real bounded context from a selected plugin fixture and prove proposal remains absent from AGENTS.md;
- full repository validation and package surface.

### Negative/security paths

- traversal/URL/drive paths;
- symlink at bundle or nested file;
- tampering/digest mismatch;
- duplicate id/path/grants;
- unsupported schema/kind/capability/file type/key;
- id/version/compatibility mismatch;
- ungranted verification proposal;
- context budget enforcement.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive and opt-in. Existing repositories without `docs/plugins/PLUGINS.json` retain previous behavior. No mobile/native support is implied.
- Migration/backfill: none required. Projects adopt Stage 10 only by deliberately adding a declaration and local bundle.
- Rollback or recovery: remove/revert the project declaration to stop loading plugins, or restore the reviewed pinned bundle/digest. VCP does not mutate plugin trust state automatically.

## Implementation plan

1. Define strict declaration/manifest schemas and canonical digest.
2. Implement local path/symlink/file-type/trust validation.
3. Add guidance + verification-proposal capability model.
4. Compose selected guidance into bounded Context Packs.
5. Add Doctor and read-only CLI inspection/digest.
6. Add realistic provider fixture and lifecycle preservation checks.
7. Add negative/regression coverage.
8. Sync docs/roadmap/readmes/validation.
9. Run fresh review + exact-head gate + Task Pack-only finalization protocol.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/community-plugins.test.mjs test/community-plugins-cli.test.mjs test/context.test.mjs test/doctor-coverage.test.mjs test/cli.test.mjs test/task-root-semantics.test.mjs`
- full gate: `npm run validate`, `npm run pack:check`, and explicit fixture inspection/context dogfood.

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| NO ACTION | n/a | Awaiting complete Stage 10 changed-surface review and exact-head executable validation. | Keep in Review. | V1 intentionally does not solve remote distribution/signatures or native mobile support. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread + top-level-comment audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
