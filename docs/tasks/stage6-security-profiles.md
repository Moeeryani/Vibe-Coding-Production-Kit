# Task — Implement Stage 6 project-sensitive security profiles

Status: Review
Slug: `stage6-security-profiles`

## Outcome

Security review context becomes deterministic and project-sensitive through explicit composable profiles while preserving baseline protections, bounded context, human risk-acceptance boundaries, lifecycle safety, and backward compatibility.

## Source of truth

| Source | Reference |
|---|---|
| Roadmap | `docs/ROADMAP.md` |
| Security profile contract | `docs/SECURITY-PROFILES.md` |
| Context Packs | `docs/CONTEXT-PACKS.md` |
| Issue | https://github.com/Moeeryani/Vibe-Coding-Production-Kit/issues/68 |

## Requirement restatement

Complete Stage 6 without introducing remote scanners, compliance claims, hidden risk acceptance, or generic context expansion. Baseline security guidance must always apply in security review; project-specific profiles are explicit repository state and compose deterministically.

## Acceptance criteria

- [ ] AC-001 — baseline applies when no declaration exists.
- [ ] AC-002 — explicit profiles compose deterministically after baseline.
- [ ] AC-003 — unknown, duplicate, and malformed entries fail visibly.
- [ ] AC-004 — security mode automatically includes profile declaration/guidance.
- [ ] AC-005 — non-security modes do not auto-include security profile guidance.
- [ ] AC-006 — context manifest records exact profile identities.
- [ ] AC-007 — profiles cover authorization, tenant isolation, secrets/PII, trust boundaries, abuse/replay/rate concerns, stateful migration/data safety, and negative tests.
- [ ] AC-008 — profile guidance never infers risk acceptance or claims compliance.
- [ ] AC-009 — projects without Stage 6 declaration remain backward compatible through baseline fallback.
- [ ] AC-010 — init/update lifecycle owns the declaration safely and manages canonical profile guidance.
- [ ] AC-011 — framework validation requires the canonical Stage 6 contract.
- [ ] AC-012 — Stage 5 roadmap is finalized under the adopted Windows exact-head evidence policy.

## Scope

### In scope
- security profile declaration/parser;
- canonical baseline/web-api/multi-tenant/sensitive-data/stateful-data guidance;
- security Context Pack auto-inclusion;
- manifest/result visibility;
- lifecycle ownership;
- docs, roadmap, reference SaaS profile selection, tests.

### Out of scope
- remote SAST/DAST/CVE services;
- compliance certification;
- automatic risk acceptance;
- secret rotation/credential access;
- Stage 7 prompt evaluation.

## Affected boundaries

- Modules/files likely affected: `lib/security-profiles.mjs`, `lib/context.mjs`, `lib/doctor.mjs`, `lib/template.mjs`, canonical security-profile docs/prompts, framework validation, reference SaaS fixture, and Stage 6 tests.
- Public API/contract impact: `vcp context --mode security` gains deterministic active-profile content/manifest/result semantics; Doctor exposes the active profile set and invalid explicit profile state. Other context modes remain unchanged.
- Data/schema/migration impact: no application-data or VCP manifest-schema migration; lifecycle update adds new managed documentation/profile assets additively.
- External integration impact: none — no network scanner, provider API, credential service, or remote policy dependency is introduced.

## Domain invariants

- baseline cannot be disabled by omission;
- explicit profile order is stable and inspectable;
- security profiles are context/evaluation guidance, not implementation authorization;
- security mode alone gains automatic profile context;
- human product/security/risk decisions remain human.

## Security and privacy

- Authentication impact: n/a — Stage 6 changes repository-local security-review workflow and does not add an authentication surface.
- Authorization/resource ownership: profiles make authorization/resource-ownership review explicit; profile selection is guidance only and never implementation authority or risk acceptance.
- Tenant isolation: the `multi-tenant` profile explicitly requires tenant-scoped ownership/isolation review and cross-tenant negative tests.
- Input/trust boundaries: repository-owned profile declarations/documents are local inputs; parsing, authority checks, profile identity checks, project-root bounds, and symlink/read-failure handling must fail visibly rather than widen trust.
- Secrets/PII/logging: Stage 6 reads repository text only and accesses no production credentials; `sensitive-data` guidance covers PII/secrets minimization, redaction, retention, exports, and logging exposure.
- Abuse/rate/replay considerations: baseline and `web-api` guidance explicitly cover abuse, brute force/rate limits, replay, duplicate execution, and idempotency where relevant.
- Relevant threat IDs: n/a — the repository threat model remains a starter template and does not contain an accepted project-specific threat ID governing this workflow change; Stage 6 must not invent one.

## Failure modes and edge cases

- missing declaration -> baseline fallback;
- declaration without Active profiles -> fail;
- unknown/duplicate/malformed profile -> fail;
- local canonical profile file missing -> use packaged canonical fallback;
- profile content exceeds normal Context Pack budget -> ordinary context-budget failure.

## Observability

Context result and manifest expose active profile names/files. Errors identify invalid profile declarations directly.

## Test plan

### Unit
- parser accepts deterministic profile selections and baseline-only state;
- parser rejects unknown, duplicate, malformed, and duplicate-section declarations;
- canonical profile identity and required Stage 6 coverage phrases are enforced.

### Integration / contract
- initialized project security context composes baseline plus explicit project-sensitive profiles;
- pre-Stage-6 project without a declaration receives packaged baseline fallback;
- Doctor exposes the active profile set and invalid explicit state;
- update planning adds Stage 6 assets to an older project and preserves project-owned selection.

### E2E / regression
- reference SaaS builds a real security Context Pack with all project-sensitive profiles;
- plan/implement/review/release modes do not auto-load security profile guidance;
- context manifest/result identities remain deterministic and bounded.

### Negative/security paths
- invalid/unknown/duplicate declarations fail instead of silently falling back;
- DRAFT/historical explicit authority cannot govern security review;
- profile identity mismatch fails;
- automatic local profile reads remain project-root/symlink bounded;
- read failures do not silently become packaged fallback.

## Rollout, migration, and recovery

- Deployment/compatibility concerns: additive repository assets and security-context behavior; existing projects without Stage 6 files continue through packaged baseline fallback until updated.
- Migration/backfill: no data/schema backfill; `vcp update` adds the new canonical Stage 6 assets, preserves the project-owned declaration, and merge-manages canonical guidance.
- Rollback or recovery: revert the Stage 6 source/docs assets; existing project-owned declarations remain preserve-owned and no external or production state is mutated by the feature.

## Implementation plan

1. Add canonical contract/declaration/profile docs.
2. Add deterministic loader/parser.
3. Wire only security Context Packs.
4. Add lifecycle ownership + framework validation.
5. Dogfood explicit profiles in reference SaaS.
6. Update docs/roadmap.
7. Add regression/conformance tests.

## Verification commands

- `CHECK_COMMAND`: `npm run check`
- `UNIT_TEST_COMMAND`: `node --test test/security-profiles.test.mjs`
- full gate: `npm run validate` and `npm run pack:check`

## Independent review evidence

| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |
|---|---|---|---|---|
| DEFECT | must fix in this task | Maintainer-reported pre-final gate on exact head `605e1bf4352955f4d304410db418e5b4106452c4` failed deterministically: the canonical multi-tenant profile did not contain the exact `cross-tenant isolation` coverage phrase required by the Stage 6 contract test; focused suite was 45/46 and full validation 241/242. | Correct the canonical profile wording rather than weakening the coverage assertion. | Corrected exact-head gate required. |
| DEFECT | must fix in this task | The same gate reported implementation readiness 10 pass / 1 warn / 4 fail because Stage 6 Task Pack used unlabeled boundary/security/rollout prose and non-canonical test subsection headings; verification correctly refused to run. | Re-author the Task Pack with the canonical readiness labels/headings and concrete or reasoned n/a answers. | Corrected exact-head readiness + verification required. |
| DEFECT | must fix in this task | The remaining readiness warning came from treating starter-template `docs/security/THREAT-MODEL.md` as governing Source of Truth for Stage 6. No accepted project-specific threat inventory governs this workflow change. | Remove the starter threat model from this Task Pack's governing Source-of-Truth table and explicitly record `Relevant threat IDs: n/a` with the reason; do not fabricate threat IDs or rewrite the unrelated template. | Corrected strict readiness required. |
| NO ACTION | n/a | Pre-final static changed-surface review on `605e1bf4352955f4d304410db418e5b4106452c4` found no other source-level must-fix issue before executable validation; CodeRabbit had not yet published submitted-review findings/threads for that exact candidate. | Superseded as the latest review state by the later CodeRabbit finding below; the source-level audit remains historical evidence. | Late review did identify one roadmap consistency defect. |
| DEFECT | must fix in this task | Late CodeRabbit review found Track A still directed contributors to prove completed Stage 5 work and treat closed Issue #15 as unfinished hosted-CI work, contradicting the same roadmap's completed Stage 5 / Windows-policy state. | Update Track A to maintain completed Stage 5 semantics and track remaining Linux/hosted compatibility only under non-blocking follow-up #69; preserve conditional graph-validation guidance. | Corrected-head review/gate required. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
