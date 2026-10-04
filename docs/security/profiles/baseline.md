# Security Profile — Baseline

SECURITY-PROFILE: baseline

Apply to every security review.

## Review focus

- identify changed assets, actors, entry points, and trust boundaries;
- determine whether authentication or authorization behavior changes;
- validate untrusted input at the boundary where it becomes trusted;
- inspect secrets/credentials/configuration handling and diagnostic leakage;
- inspect new dependencies, dynamic execution, deserialization, file/URL handling, and insecure defaults;
- consider abuse, brute force, replay, idempotency, and concurrency where behavior can be repeated;
- verify failure paths do not expose sensitive internals or silently weaken controls.

## Required negative-path thinking

Where applicable, require tests for unauthorized callers, malformed/untrusted input, replay/duplicate execution, privilege boundaries, secret/log leakage, and failure recovery.

Do not infer that a residual risk is accepted. Risk acceptance requires an explicit human owner/decision.
