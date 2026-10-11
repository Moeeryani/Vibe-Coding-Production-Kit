# Redaction record — stage14-windows-20261011

Applied before publication on maintainer instruction (2026-10-11): publish the Windows evidence
now, but verify it is free of secrets and unnecessary personal data first, keep any unredacted
original locally, recompute the published hash, and document the redaction.

## Credential scan

Every published file was scanned for `ghp_`, `npm_`, `_authToken`, `Bearer`, `sk-`,
`AKIA`, `BEGIN ... PRIVATE KEY`, `password` and `secret`: **no matches**.

## Redacted files

| Published file | What was removed | Why |
| --- | --- | --- |
| `logs-d6be7420/12-pack-check.log` | the entire host `PATH` value in the `BEGIN` header, replaced by `<REDACTED host PATH prefixed with C:/Windows/System32>`; the host user-profile segment replaced by `<REDACTED_USER>`; NUL bytes from the WSL UTF-16 error stream stripped | the harness-broken run echoed the whole host `PATH`, exposing the local user profile plus unrelated personal directory names. None of it is evidence. |
| `STAGE14-WINDOWS-NTFS-REPORT.md` | the same user-profile segment inside the quoted WSL error in section 5 | same |

No exit code, assertion, test name, count or measurement was altered. The WSL failure text that
proves the harness diagnosis is preserved verbatim except for the user-profile segment.

## Unredacted originals — retained locally, NOT published

```
2ac6b6fe7b5771d8d3440494ba0ef67294d9a0ae408b53680294c22a370d8366  logs-d6be7420/12-pack-check.log
f6e9398ee849cabce2889863a6305d6499286b68cdd2721e547791ad6d3af510  STAGE14-WINDOWS-NTFS-REPORT.md
```

Local location: `D:\vcp-stage14-evidence\`. The hashes above are of the **pre-redaction** bytes;
`SHA256SUMS` in this directory is computed over the **published** bytes, so the two sets differ for
exactly these two files.

## Excluded from publication

The local `linux-r3/` extracts (Linux r3 report, `failing-names.txt`, `10-npm-test.log`,
`12-pack-check.log`, `SHA256SUMS`). They are already published on branch
`evidence/stage14-linux-d6be7420` under `docs/evidence/stage14-linux-20261011-r3/`, and the raw
Linux suite log embeds that lane's host home directory in every stack trace. The derived comparison
outputs the name-level diff needs (`linux-failing-names-sorted.txt`, `linux-pack-files.txt`,
`linux-only.txt`) are included and contain test names only.
