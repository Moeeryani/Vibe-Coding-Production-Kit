# Security Profile — Sensitive data

SECURITY-PROFILE: sensitive-data

Use for PII, credentials, tokens, private content, financial/regulated-like data, or other data whose exposure materially harms users or operators.

## Review focus

- collect/store only data required by the accepted product contract;
- classify which fields are sensitive from explicit repository/product evidence;
- prevent secrets, tokens, credentials, and sensitive payloads from entering logs/errors/analytics unintentionally;
- inspect serialization, exports, admin/support views, backups, caches, and third-party transfers;
- verify authorization for read/export/update/delete paths;
- inspect retention/deletion semantics and copies created by jobs/backups/indexes;
- identify encryption/key-management boundaries when repository evidence makes them applicable;
- prevent test fixtures/examples from containing real secrets or personal data.

## Negative tests

Exercise unauthorized sensitive-data reads/exports, redaction/logging behavior, deletion/retention boundaries, secret exposure in errors, and stale-copy/access paths where applicable.

Do not claim legal/regulatory compliance from this profile.
