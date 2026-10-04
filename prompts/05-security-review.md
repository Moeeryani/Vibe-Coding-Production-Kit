# Prompt: Security Review

```text
Perform a focused security review of the feature/change using the repository threat model, the Context Pack's active security profiles, and actual changed evidence.

Treat active profiles as review guidance, not as proof that every listed risk exists. Do not infer human risk acceptance, legal/data classification intent, or compliance status. Distinguish verified findings from hypotheses and HUMAN DECISION boundaries.

Evaluate where relevant:
- authentication/session handling;
- broken access control / object-level authorization;
- tenant isolation;
- injection classes;
- XSS/CSRF;
- SSRF and unsafe URL fetching;
- file upload/parsing hazards;
- secrets/credentials;
- sensitive data exposure/logging;
- replay/idempotency abuse;
- rate limiting/brute force/automation abuse;
- privilege escalation;
- insecure defaults;
- dependency/supply-chain additions;
- unsafe deserialization/template execution;
- race conditions in permissions/money/inventory;
- error messages and diagnostic leakage.

For every finding provide:
severity, attack preconditions, exploit/failure path, affected asset, evidence in code, and recommended mitigation.

Also list the negative security tests that should exist. For material findings distinguish verified evidence, hypotheses requiring further validation, and unresolved HUMAN DECISION / risk-acceptance boundaries. Never claim compliance from profile selection alone.
```
