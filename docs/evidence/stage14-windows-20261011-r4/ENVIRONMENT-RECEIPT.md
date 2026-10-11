# Stage 14 R4 — Environment Receipt (native Windows)

Date: 2026-10-11
Campaign: Independent native Windows/NTFS acceptance of de8faa19c6959c4188632e2e908909db485c3ef3

## Tooling
- node --version: v24.5.0
- npm --version: 11.5.2
- git --version: git version 2.49.0.windows.1
- Shell: Git Bash (C:\Program Files\Git\bin\bash.exe); WSL not used; PATH not modified.

## Volumes (before campaign)
- C: 633G total, 774M free (~100% used) — TEMP/TMP/npm cache redirected to D: to avoid C: ENOSPC
- D: 296G total, 4.8G free (99% used)

## Remote verification (git ls-remote)
- freeze/stage14-review-de8faa19-20261011 = de8faa19c6959c4188632e2e908909db485c3ef3
- evidence/stage14-windows-d6be7420 = 62a4018d6d9542e8a03af3bf83874bed1406a9a4
- main = 8ccb276545fdb3cc301ce7ce324812eb4c314586

## Clone
- Fresh full clone from https://github.com/Moeeryani/Vibe-Coding-Production-Kit to D:\vcp-stage14-r4
- Old workspace D:\Vibe-coding-kit NOT used. Previous evidence (D:\vcp-health-status, C:\vcp-stage13-evidence) untouched.
- git rev-parse HEAD: de8faa19c6959c4188632e2e908909db485c3ef3
- git rev-parse HEAD^{tree}: c3a13c051d9b87972efb9ba3c4c8f428d7631114
- git status --porcelain: (empty — clean)
- HEAD commit: "docs(stage14): document exact W6 Windows delegate matrix and unaccepted source remediation"

## CRLF integrity
- core.autocrlf=true, .gitattributes: `* text=auto eol=lf`, *.bat/*.cmd/*.ps1 eol=crlf
- Byte scan of all tracked files under bin/ and scripts/: NO CRLF found (NO_CRLF_IN_BIN_SCRIPTS)

## Environment overrides for all gates
- TMP=D:\vcp-r4-tmp, TEMP=D:\vcp-r4-tmp, npm_config_cache=D:\vcp-r4-npm-cache
- Raw logs: D:\vcp-r4-evidence-raw

## NTFS proof (post-setup)

- .NET DriveInfo: C: DriveFormat=NTFS (TotalGB 632.1), D: DriveFormat=NTFS (TotalGB 295.3, FreeGB 4.29 at check time) — logs/00c-ntfs-proof.txt
- os.tmpdir() under campaign env (TMP/TEMP=D:\vcp-r4-tmp): D:\vcp-r4-tmp — on NTFS D:.
- Get-Volume/MSFT_Volume returned no objects in this shell context (CIM restriction); DriveInfo used instead. Get-PSDrive: C used 629.1GB free 3.03GB; D used 291GB free 4.29GB — logs/00b-volumes.txt
- Note: Node fs.statfsSync reports f_type=0 on Windows (libuv does not populate the magic); DriveInfo is the authoritative proof (fs-probe.mjs retained for transparency).

## Windows build

- OS Version: 10.0.26200 (win32, x64); Shell: Git Bash; WSL not used; PATH not modified.
