# Redaction Review — Stage 14 R4 Windows Evidence

- Scanned all staged logs and lists for personal data: no matches for user-profile paths
  (`C:\Users\…`), usernames, tokens, OTPs, npm credentials, or SSH material
  (`grep -rilE "moham|C:\\Users|C:/Users"` over logs/ and *.txt returned nothing).
- Logs contain only: repository paths under `D:\vcp-stage14-r4`, campaign temp paths under
  `D:\vcp-r4-tmp` and `D:\vcp-r4-evidence-raw`, tool versions, volume statistics, and test
  output. Volume labels ("OS", "New Volume") are generic; host names appear only where the
  product prints them (none observed in staged logs beyond test-internal values).
- No secrets were routed through chat or files at any point in this campaign.
- The independent demo (`logs/18-hash-reparse-demo.log`) prints only SHA-256 digests of a
  synthetic test file with content `FOREIGN USER BYTES R4 CAMPAIGN` — no real user data.
- Nothing was redacted because nothing sensitive was found; this file records that review.

## Line-ending normalization note

- Two PowerShell-captured receipts (logs/00b-volumes.txt, logs/00c-ntfs-proof.txt) originally
  contained CRLF bytes from console capture; CR bytes were stripped (LF only) before
  publication so that `.gitattributes` (`* text=auto eol=lf`) normalization cannot alter
  fingerprints. Content is byte-identical otherwise. All 38 staged files are pure LF, so
  SHA256SUMS computed here matches a fresh clone of the published branch.
