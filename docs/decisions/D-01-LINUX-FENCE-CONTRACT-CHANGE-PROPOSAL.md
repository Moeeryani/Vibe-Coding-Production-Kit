# D-01 Linux fence — contract-change proposal + independent approval request

**Status:** PROPOSED. Not approved. `D-01 = DEFERRED`, `G-FENCE = NO-GO`,
`managedV2MutationAuthorized = false` — unchanged by this document.
**Owner decision required:** Moeeryani.

## The problem (unchanged)

The published `vibe-coding-production@0.9.3` CLI demonstrably destroys
post-backup user edits (7/12 Linux, 8/13 Windows witnesses). No JavaScript
check can restrain it when it runs under the same OS principal as the new
writer. `lib/legacy-writer-fence-contract.mjs` already encodes this:
without `OS_ENFORCED_SEPARATE_PRINCIPALS` the assessment is `NO_GO`.

## The proposed contract change

**Isolated migration space with formal ownership transfer.**

1. At migration/enforcement time (privileged, explicit, one-time per
   project), the protected tree — `.vcp/**` and the manifest-listed
   managed files — is transferred to a dedicated writer principal
   (`writerUid:writerGid`), modes `0750`/`0640`.
   Implementation: `lib/linux-legacy-fence.mjs#enforceLegacyFence`.
2. From then on, the kernel denies the legacy principal (the invoking user
   the old CLI runs as) with `EACCES` on every protected write, unlink,
   rename-inside, and mkdir. Denial is observable in `strace`/errno and in
   byte-identical before/after snapshots — it is Linux refusing, not the
   CLI failing by accident.
3. User edits to managed files flow through the writer principal (the new
   CLI brokers writes). A same-user old CLI can no longer silently erase
   post-backup edits because it can no longer write them at all.
4. Fence integrity is re-verified before every managed operation
   (`verifyLegacyFence`); any ownership/mode/identity violation refuses
   the operation. The parent-rename hole (legacy principal renaming the
   protected dir via a writable parent) is *detected*, not silently
   tolerated; the immutable-bit backend *denies* it where
   `CAP_LINUX_IMMUTABLE` is available.

## What is proven on Linux (evidence: Phase D receipts)

- 19-scenario PoC vs the independently authenticated published 0.9.3:
  baseline reproduces protected-byte loss; fenced mode shows kernel
  denials and zero protected-byte changes in every scenario, including
  `init --force`, corrupt/missing manifest, stale/foreign locks,
  old/new concurrency, crash+restart, symlink and parent-swap attacks.
- `E_FENCE_PRIVILEGE_REQUIRED`: enforcement without privilege throws and
  names this exact contract change. There is no silent success path.
- MAC policy sources (`policies/linux/`) exist for the residual
  privileged-binary risk but are NOT installed or proven here.

## Residual risks (not hidden)

1. **Old CLI as the writer principal / root** bypasses DAC. Needs MAC
   (AppArmor/SELinux) confinement — candidate policies ship, enforcement
   UNPROVEN. Until then, the writer credential must be treated like a
   production secret.
2. **Windows**: no fence proven on native Windows. D-01 cannot be
   accepted on Linux evidence alone.
3. **Immutable backend**: implemented; enforcement UNVERIFIED where
   `CAP_LINUX_IMMUTABLE` is absent (including this sandbox).
4. **Operational cost**: managed files are no longer directly user-writable;
   all writes broker through the new CLI. Backup/restore tooling must run
   as the writer principal.

## Reopen conditions for D-01 (independent approval)

- [ ] Owner approves this contract change (this document).
- [ ] Linux denial evidence re-run on the frozen HEAD by an independent
      reviewer, with raw receipts (per-file hashes, errno traces).
- [ ] MAC confinement proven for the privileged-old-binary case, or the
      risk explicitly accepted by the owner in writing.
- [ ] Native Windows fence proof (separate campaign).
- [ ] New explicit D-01 maintainer approval referencing the new evidence.

Until every box is checked, `D-01` stays `DEFERRED` and `G-FENCE` stays
`NO-GO`. This proposal grants no migration writes by itself.
