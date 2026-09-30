# Prompt: Security Review

```text
Perform a focused security review of the feature/change using the repository threat model and actual diff.

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

Also list the negative security tests that should exist. Distinguish verified findings from hypotheses requiring further validation.
```
