# Security Profile — Web / API

SECURITY-PROFILE: web-api

Use for browser, HTTP/API, webhook, RPC, upload, or externally reachable request surfaces.

## Review focus

- authentication/session/token lifecycle and credential transport;
- server-side authorization before object/action access;
- request parsing, validation, canonicalization, and injection boundaries;
- CSRF/CORS/cookie policy where browser credentials are involved;
- XSS/output encoding and unsafe HTML/template rendering;
- SSRF, redirects, webhook callback URLs, and outbound URL fetching;
- file upload/content-type/parser/archive hazards;
- request size, rate limiting, brute force, automation abuse, replay, and idempotency;
- error/status behavior that may leak existence, authorization, or internal diagnostics.

## Negative tests

Exercise missing/invalid/expired credentials, unauthorized object/action access, malformed inputs, hostile URLs/files where relevant, replay/duplicate requests, rate/abuse controls, and browser-origin/cross-site boundaries where applicable.
