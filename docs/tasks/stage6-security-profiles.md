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
| Threat model | `docs/security/THREAT-MODEL.md` |
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

- `lib/security-profiles.mjs`;
- `lib/context.mjs`;
- lifecycle template ownership;
- security prompt/docs;
- reference SaaS security declaration;
- framework validation.

## Domain invariants

- baseline cannot be disabled by omission;
- explicit profile order is stable and inspectable;
- security profiles are context/evaluation guidance, not implementation authorization;
- security mode alone gains automatic profile context;
- human product/security/risk decisions remain human.

## Security and privacy

This feature is itself security workflow tooling. It reads repository-owned text only, performs no network scanning, accesses no credentials, and must not convert generic guidance into claims that a system is secure/compliant.

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
- parser accepted/unknown/duplicate/malformed cases.

### Integration
- init project security context with composed profiles;
- baseline fallback without declaration;
- packaged fallback when local canonical guidance is absent.

### Regression
- plan/review/etc do not auto-load profile guidance;
- context manifest deterministic.

### Negative/security
- invalid declarations fail; no silent fallback from explicit invalid state.

## Rollout, migration, and recovery

Additive lifecycle assets. Existing projects continue with baseline fallback before update. Updated projects receive the declaration plus merge-managed canonical profile guidance; project declaration is preserved.

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
| NO ACTION | n/a | Awaiting implementation review and exact-head executable validation. | Keep in Review. | Final gate required. |

## Finalization

- [ ] Acceptance criteria complete.
- [ ] Fresh submitted-review + inline-thread audit complete.
- [ ] Comprehensive exact-head pre-final gate passed.
- [ ] Task Pack-only finalization edit made.
- [ ] Same gate rerun on finalization head.
- [ ] Status changed to Done.
