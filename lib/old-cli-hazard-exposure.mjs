// P4-01 — Old-CLI (published VCP 0.9.3) hazard-exposure assessment.
//
// PURE CORE: this module performs zero I/O. It imports nothing from
// node:fs, never opens, reads, writes, renames, or executes anything,
// and never imports any writer, journal, recovery, lock, or command
// module. It maps a caller-supplied project-state descriptor to a
// per-entrypoint hazard report. The caller (the CLI reader) is
// responsible for building the descriptor with no-follow inspection;
// this module validates the descriptor defensively and treats any
// missing, mistyped, or unknown field as insufficient evidence.
//
// Verdict semantics (owner-authorized, Issue #111; hardened 2026-10-31):
//   EXPOSED     — a matching evidence-established hazard class applies
//                 to this exact assessed state. It means the hazard
//                 class is real, NOT that this exact project is
//                 guaranteed to lose bytes. For init, the demonstrated
//                 loss class is loss of post-backup AGENTS.md user
//                 edits, so H1 requires an AGENTS.md file with content
//                 (see EVID-D01-FIXTURE-SHAPE); docs/-only and
//                 package.json-only states are UNKNOWN, not EXPOSED.
//   UNKNOWN     — the available evidence is insufficient to decide.
//                 UNKNOWN is explicitly NOT safe, and is reported as
//                 such on every verdict that carries it.
//   NOT_EXPOSED — RETIRED in the 2026-10-31 hardening. No assessed
//                 state carries direct evidence supporting safety in
//                 the exact assessed state (all POC evidence is hazard
//                 evidence; non-loss outcomes are aggregate counts with
//                 no per-case safety attribution), and Issue #111 holds
//                 that a precondition argument alone is insufficient.
//                 No entrypoint returns NOT_EXPOSED. The value is kept
//                 out of the verdict vocabulary; older reports that
//                 carry it predate the hardening.
//
// H4 (concurrent old/new writers, PH-06) is UNKNOWN on every
// entrypoint: no exclusivity has been demonstrated for journal
// creation, and the lifecycle lock is the stated serialization
// mechanism, not a proof. H3 (interrupted/partial state) is UNKNOWN
// wherever the state is unsupported.

export const HAZARD_ENTRYPOINTS = Object.freeze([
  'init', 'update', 'manage', 'rollback'
]);

export const HAZARD_IDS = Object.freeze(['H1', 'H2', 'H3', 'H4', 'H5']);

// Evidence table. Every ID cites its source so a verdict's evidence
// list is checkable without trusting this module. The POC loss counts
// are aggregate records from the canonical D-01 program (master plan
// and Issue #109); this build did not re-run the published 0.9.3 CLI
// and does not claim a per-case breakdown it has not read.
export const HAZARD_EVIDENCE = Object.freeze({
  'EVID-D01-LINUX-POC': Object.freeze({
    id: 'EVID-D01-LINUX-POC',
    summary: 'Published VCP 0.9.3 loses post-backup user edits in 7 of 12 Linux POC cases (old init/update/manage/rollback entrypoints).',
    source: 'D-01 POC campaign, PR #89 evidence (Linux proof at 2e8e098, as recorded in the canonical master plan); Issue #109; scenario matrix lib/d01-linux-isolation-fixture.mjs D01_PUBLISHED_OLD_CLI_MATRIX (old-init-force, old-update, old-manage-ignore, old-manage-track, old-rollback).'
  }),
  'EVID-D01-WINDOWS-POC': Object.freeze({
    id: 'EVID-D01-WINDOWS-POC',
    summary: 'Published VCP 0.9.3 loses post-backup user edits in 8 of 13 native Windows POC cases; a directory-shaped update.lock does NOT fence old init --force when no manifest exists (proven counterexample).',
    source: 'D-01 POC campaign, Windows evidence branch 97110131 (as recorded in the canonical master plan); Issue #109; docs/decisions/D-01.json reopenConditions ("directory sentinel alone has a proven counterexample").'
  }),
  // Fixture-shape evidence for the H1 signal rule: the only user-owned
  // file in any D-01 POC fixture project is AGENTS.md, and D-01.json
  // records loss of post-backup AGENTS.md user edits only. No POC case
  // in the cited evidence demonstrates loss of docs/ or package.json
  // bytes — and none demonstrates their safety either. That is why
  // docs/-only and package.json-only states are UNKNOWN, not EXPOSED.
  'EVID-D01-FIXTURE-SHAPE': Object.freeze({
    id: 'EVID-D01-FIXTURE-SHAPE',
    summary: 'The D-01 POC fixture projects contain AGENTS.md as their only user-owned file (createProject writes "PROTECTED ORIGINAL USER BYTES" to AGENTS.md; no package.json, docs/, transaction.json, or update.lock in any fixture project); the published-CLI matrix manage scenarios target AGENTS.md; D-01.json records loss of post-backup AGENTS.md user edits only.',
    source: 'lib/d01-linux-isolation-fixture.mjs createProject + D01_PUBLISHED_OLD_CLI_MATRIX; docs/decisions/D-01.json rationale/provingTests.'
  }),
  'EVID-D01-REOPEN': Object.freeze({
    id: 'EVID-D01-REOPEN',
    summary: 'D-01 reopen conditions require a complete compatibility fence for all published 0.9.3 entrypoints even with the manifest absent, plus atomic transition/lock ownership, concurrent old/new writer and crash/partial-journal recovery proofs, and byte-for-byte retention of post-backup user changes.',
    source: 'docs/decisions/D-01.json (status DEFERRED), reopenConditions.'
  }),
  'EVID-SC01-OD-STRAYS': Object.freeze({
    id: 'EVID-SC01-OD-STRAYS',
    summary: 'The check-to-open race was demonstrated at open granularity for update.lock and transaction.json: a marker can appear between the last eligibility observation and open(O_EXCL). The final check narrows the window; it does not atomically eliminate it.',
    source: 'VCP-SC01-OD-STRAYS-INDEPENDENT-ACCEPTANCE.md (candidate 03f40dd, 3,068 ladder trials, 2 demonstrated at-open races).'
  }),
  'EVID-PH06': Object.freeze({
    id: 'EVID-PH06',
    summary: 'PH-06 concurrent journal creation: two writers can both succeed (check-then-act between the previous-hash check and the rename). The lifecycle lock is the implementation\'s stated serialization mechanism; the PH-06 test passes only a test capability and no lock, so the race is reachable in exactly that mode.',
    source: 'lib/versioned-journal.mjs writeVersionedJournal (code reading); independent G3 observed both writers succeeding once; PH-06 remains UNRESOLVED.'
  })
});

const UNKNOWN_NOT_SAFE =
  'UNKNOWN is not safe: the available evidence is insufficient to decide. Do not treat this entrypoint as safe.';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function verdict(verdictValue, hazards, evidence, basis, reason, concurrencyNote = true) {
  const out = {
    verdict: verdictValue,
    hazards: Object.freeze([...hazards]),
    evidence: Object.freeze([...evidence]),
    basis,
    reason
  };
  if (concurrencyNote) {
    out.concurrency = Object.freeze({
      verdict: 'UNKNOWN',
      hazard: 'H4',
      evidence: Object.freeze(['EVID-PH06']),
      reason: 'Concurrent old/new writers have no demonstrated exclusivity (PH-06 UNRESOLVED). ' + UNKNOWN_NOT_SAFE
    });
  }
  return Object.freeze(out);
}

function normalizeDescriptor(input) {
  const d = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  const pick = (value, allowed, fallback) =>
    (typeof value === 'string' && allowed.includes(value)) ? value : fallback;
  // NOTE (2026-10-31 hardening): userOwnedContentPresent is an
  // informational summary of the signal list only. No verdict treats
  // its absence as safety — the H1 rule keys on the specific
  // 'AGENTS.md' signal in userOwnedSignals, and every state without
  // that signal is UNKNOWN. A missing or mistyped field therefore
  // cannot produce a safe verdict: the only non-EXPOSED verdict is
  // UNKNOWN.
  return {
    root: isNonEmptyString(d.root) ? d.root : null,
    classification: pick(d.classification,
      ['NEW', 'EXISTING', 'MANAGED', 'BLOCKED'], 'UNKNOWN'),
    classificationReason: isNonEmptyString(d.classificationReason) ? d.classificationReason : null,
    rootLinked: d.rootLinked === true,
    manifest: pick(d.manifest,
      ['absent', 'present', 'not-regular'], 'unknown'),
    updateLock: pick(d.updateLock,
      ['absent', 'file', 'directory', 'symlink', 'other'], 'unknown'),
    transactionJson: pick(d.transactionJson,
      ['absent', 'file', 'directory', 'symlink', 'other'], 'unknown'),
    vcpDir: pick(d.vcpDir,
      ['absent', 'directory', 'symlink', 'other'], 'unknown'),
    rootManifestStray: d.rootManifestStray === true,
    userOwnedContentPresent: d.userOwnedContentPresent === true,
    userOwnedSignals: Array.isArray(d.userOwnedSignals)
      ? Object.freeze(d.userOwnedSignals.filter((s) => typeof s === 'string')) : Object.freeze([]),
    interruptedState: d.interruptedState === true,
    adoptionMarkersPresent: d.adoptionMarkersPresent === true
  };
}

function assessEntrypoint(name, d) {
  // Linked-root refusal takes precedence over every other rule: the
  // target was not assessed, so no entrypoint may be reported as safe
  // or as exposed on evidence about a different tree.
  if (d.rootLinked) {
    return verdict('UNKNOWN', ['H5'], ['EVID-D01-REOPEN'], 'no-evidence',
      'Not assessed: the selected root (or a parent component) is a symbolic link and was refused without being followed. Following it could reach an external target. ' + UNKNOWN_NOT_SAFE);
  }
  // The demonstrated H1 loss class is loss of post-backup AGENTS.md
  // user edits (EVID-D01-FIXTURE-SHAPE). Only an AGENTS.md file with
  // content matches it; docs/ and package.json signals do not.
  const agentsContent = d.userOwnedSignals.includes('AGENTS.md');
  // H3-class states: interrupted, stray, or abnormal recovery/lock
  // state. A root transaction.json is a stray recovery file (it lives
  // under .vcp/ in a normal project); a directory-shaped, linked, or
  // otherwise non-file update.lock is a root lock stray; adoption
  // markers mark a partially-known adoption state. A regular-file
  // update.lock is the normal shape and is not an H3 trigger.
  const h3State = d.interruptedState || d.rootManifestStray ||
    d.adoptionMarkersPresent ||
    ['file', 'directory', 'symlink', 'other'].includes(d.transactionJson) ||
    ['directory', 'symlink', 'other'].includes(d.updateLock);
  if (name === 'init') {
    if (d.manifest === 'absent' && agentsContent) {
      const hazards = d.updateLock === 'directory' ? ['H1', 'H2'] : ['H1'];
      const evidence = ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'];
      const reason = d.updateLock === 'directory'
        ? 'EXPOSED (H1/H2): no manifest exists, user-owned content is present, and update.lock is directory-shaped. The published 0.9.3 init --force hazard class applies, and a directory-shaped lock is a proven non-fence for old init --force with no manifest. This means the hazard class is established for this state, not that this exact project is guaranteed to lose bytes.'
        : 'EXPOSED (H1): no manifest exists and user-owned content is present. The published 0.9.3 init --force hazard class (loss of post-backup user edits) applies to this state. This means the hazard class is established for this state, not that this exact project is guaranteed to lose bytes.';
      return verdict('EXPOSED', hazards, evidence, 'poc-evidence', reason);
    }
    // Directory-shaped lock with no AGENTS.md content: the sentinel is
    // a proven non-fence (H2), but the H1 loss class needs AGENTS.md
    // content, so neither EXPOSED nor safety can be asserted.
    if (d.manifest === 'absent' && d.updateLock === 'directory') {
      return verdict('UNKNOWN', ['H2'], ['EVID-D01-WINDOWS-POC'], 'no-evidence',
        'Insufficient evidence (H2): update.lock is directory-shaped and no manifest exists. A directory-shaped lock is a proven non-fence for old init --force with no manifest (EVID-D01-WINDOWS-POC), but the demonstrated loss class is loss of post-backup AGENTS.md user edits and no AGENTS.md content was observed here, so the H1 class cannot be asserted and safety cannot be demonstrated either. ' + UNKNOWN_NOT_SAFE);
    }
    // H3-class states (P4 fix F-VAL-1, 2026-10-31): when an
    // interrupted, stray, or abnormal condition is present, init's
    // UNKNOWN reason names it. This branch runs after the more
    // specific directory-lock branch above — that branch preserves
    // the proven-non-fence H2 hazard on init — and before any
    // docs/package or manifest reasoning, so an H3 state is never
    // described by a less specific reason. The reason names both
    // the H3 class and the specific conditions observed (the same
    // condition strings the old catch-all carried), so existing
    // assertions about named conditions keep holding. H3 itself
    // stays scoped to update/manage/rollback (hazards [] here);
    // the report-level hazards still carry H3 from those
    // entrypoints. Verdicts and report-level hazards are unchanged
    // by this branch.
    if (h3State) {
      const h3Conditions = [];
      if (d.interruptedState) h3Conditions.push('interrupted state is present (H3 on update/manage/rollback)');
      if (d.rootManifestStray) h3Conditions.push('a root manifest.json stray is present (H3 on update/manage/rollback)');
      if (d.adoptionMarkersPresent) h3Conditions.push('adoption markers (.vcp-adoption-*) are present (H3 on update/manage/rollback)');
      if (d.transactionJson !== 'absent') h3Conditions.push(`transaction.json at the root is ${d.transactionJson} (stray recovery state, H3 on update/manage/rollback)`);
      if (['directory', 'symlink', 'other'].includes(d.updateLock)) h3Conditions.push(`update.lock is ${d.updateLock} (root lock stray, H3 on update/manage/rollback)`);
      const observed = h3Conditions.length ? ` Observed state: ${h3Conditions.join('; ')}.` : '';
      return verdict('UNKNOWN', [], ['EVID-D01-REOPEN'], 'no-evidence',
        'Insufficient evidence (H3): interrupted, stray, or abnormal recovery/lock state is present. Unsupported states are UNKNOWN by rule. ' + UNKNOWN_NOT_SAFE + observed);
    }
    // User-owned content without AGENTS.md content (docs/-only,
    // package.json-only, or both): the loss mechanism is demonstrated
    // for AGENTS.md only, so H1 cannot be asserted — and no direct
    // evidence demonstrates safety for these file classes either.
    if (d.manifest === 'absent' && d.userOwnedContentPresent) {
      const signals = d.userOwnedSignals.length
        ? d.userOwnedSignals.join(', ') : 'unclassified user-owned content';
      return verdict('UNKNOWN', [],
        ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC', 'EVID-D01-FIXTURE-SHAPE'], 'no-evidence',
        `Insufficient evidence: user-owned content is present (${signals}), but the demonstrated loss mechanism covers post-backup AGENTS.md user edits only (EVID-D01-FIXTURE-SHAPE). No POC case in the cited evidence demonstrates loss of these file classes, and no direct evidence demonstrates their safety either. ` + UNKNOWN_NOT_SAFE);
    }
    // Manifest present (a regular file exists; its validity is carried
    // by the classification/reason, not re-derived here), not-regular,
    // or unknown: the POC loss counts are aggregate only, with no
    // per-case breakdown available to this build attributing a loss
    // or a safe outcome to this exact state. Do not guess.
    if (d.manifest !== 'absent') {
      return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'], 'no-evidence',
        'Insufficient evidence: the manifest is present (or its state is unknown/malformed), and the POC loss counts are aggregate only. No per-case breakdown available to this build attributes a loss or a safe outcome to this exact state. ' + UNKNOWN_NOT_SAFE);
    }
    // Manifest absent, no AGENTS.md content, no directory-shaped lock,
    // no other user-content signal, and no H3 condition (those are
    // named by the branch above): empty directories, nested empty
    // directories, a zero-byte AGENTS.md, a file-shaped lock alone,
    // a .vcp directory without a manifest, and malformed or unknown
    // descriptor fields. No direct evidence supports safety in any of
    // these exact states; the absence of the hazard precondition is
    // not safety (Issue #111).
    const conditions = [];
    if (d.vcpDir === 'directory') conditions.push('a .vcp directory exists without a manifest (partial VCP state)');
    if (d.updateLock !== 'absent') conditions.push(`update.lock is ${d.updateLock}`);
    const observed = conditions.length ? ` Observed state: ${conditions.join('; ')}.` : '';
    return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'], 'no-evidence',
      'Insufficient evidence: no direct evidence supports safety in this exact assessed state. The POC evidence demonstrates hazard classes only; the absence of the hazard precondition is not evidence of safety (Issue #111). ' + UNKNOWN_NOT_SAFE + observed);
  }
  // update / manage / rollback
  // H3 states are UNKNOWN by rule, before any manifest reasoning: an
  // interrupted, stray, or abnormal recovery/lock state must never be
  // reported as safe on the strength of having no user content.
  if (h3State) {
    return verdict('UNKNOWN', ['H3'], ['EVID-D01-REOPEN'], 'no-evidence',
      'Insufficient evidence (H3): interrupted, stray, or abnormal recovery/lock state is present. Unsupported states are UNKNOWN by rule. ' + UNKNOWN_NOT_SAFE);
  }
  if (d.manifest === 'absent') {
    return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC'], 'no-evidence',
      'Insufficient evidence: no manifest exists. The old update/manage/rollback path without a manifest is uncharacterized in the available POC evidence; do not assume it refuses. ' + UNKNOWN_NOT_SAFE);
  }
  return verdict('UNKNOWN', [], ['EVID-D01-LINUX-POC', 'EVID-D01-WINDOWS-POC', 'EVID-D01-REOPEN'], 'no-evidence',
    'Insufficient evidence: the POC loss counts are aggregate only, with no per-case breakdown available to this build attributing a loss or a safe outcome to this exact state for this entrypoint. ' + UNKNOWN_NOT_SAFE);
}

export function assessHazardExposure(input) {
  const d = normalizeDescriptor(input);
  const entrypoints = {};
  for (const name of HAZARD_ENTRYPOINTS) {
    entrypoints[name] = assessEntrypoint(name, d);
  }
  const hazards = [...new Set(HAZARD_ENTRYPOINTS.flatMap((n) => entrypoints[n].hazards))];
  const warnings = [];
  if (d.rootLinked) {
    warnings.push('Linked root refused (H5): the selected root or a parent component is a symbolic link. It was not followed. Assess the real target directly instead.');
  }
  if (entrypoints.init.verdict === 'EXPOSED') {
    warnings.push('Old VCP 0.9.3 init --force would expose this project to loss of post-backup user edits (H1' + (entrypoints.init.hazards.includes('H2') ? '/H2: directory-shaped update.lock does not fence old init --force' : '') + '). Evidence: EVID-D01-LINUX-POC, EVID-D01-WINDOWS-POC.');
  }
  if (d.interruptedState) {
    warnings.push('Interrupted or stray recovery state present (H3): update/manage/rollback exposure is UNKNOWN. Do not run the old CLI against this state.');
  }
  if (d.adoptionMarkersPresent) {
    warnings.push('Adoption markers (.vcp-adoption-*) are present; the new CLI treats this state as blocked. Old-CLI behavior in this state is UNKNOWN.');
  }
  for (const [name, shape] of [['.vcp', d.vcpDir], ['update.lock', d.updateLock], ['transaction.json', d.transactionJson]]) {
    if (shape === 'symlink') {
      warnings.push(`Linked marker present (${name} is a symbolic link): it was not followed. Old-CLI behavior with a linked ${name} is UNKNOWN.`);
    }
  }
  return Object.freeze({
    tool: 'vcp-hazard-exposure',
    // Version 2 (2026-10-31 verdict hardening): NOT_EXPOSED retired;
    // H1 keys on the AGENTS.md signal; H3 covers stray/abnormal
    // recovery and lock shapes on update/manage/rollback.
    version: 2,
    root: d.root,
    readOnly: true,
    classification: d.classification,
    classificationReason: d.classificationReason,
    access: Object.freeze({
      refused: d.rootLinked,
      reason: d.rootLinked ? 'ROOT_LINK_REFUSED' : null
    }),
    state: Object.freeze({
      manifest: d.manifest,
      updateLock: d.updateLock,
      transactionJson: d.transactionJson,
      vcpDir: d.vcpDir,
      rootManifestStray: d.rootManifestStray,
      userOwnedContentPresent: d.userOwnedContentPresent,
      userOwnedSignals: d.userOwnedSignals,
      interruptedState: d.interruptedState,
      adoptionMarkersPresent: d.adoptionMarkersPresent
    }),
    entrypoints: Object.freeze(entrypoints),
    hazards: Object.freeze(hazards),
    warnings: Object.freeze(warnings),
    limitations: Object.freeze([
      'EXPOSED means a matching evidence-established hazard class applies to this state, not that this exact project is guaranteed to lose bytes.',
      'NOT_EXPOSED was retired in the 2026-10-31 verdict hardening (report version 2): no assessed state carries direct evidence supporting safety, and a precondition argument alone is insufficient (Issue #111). No entrypoint returns NOT_EXPOSED. Older reports that carry it predate the hardening.',
      'The H1 loss class is demonstrated for post-backup AGENTS.md user edits only (EVID-D01-FIXTURE-SHAPE). Docs/-only and package.json-only states are UNKNOWN: no POC case demonstrates loss of those file classes, and none demonstrates their safety either.',
      'UNKNOWN is not safe. Every UNKNOWN verdict means the available evidence is insufficient; do not run the old CLI on the strength of an UNKNOWN.',
      'H4 (concurrent old/new writers) is UNKNOWN on every entrypoint: PH-06 is UNRESOLVED and no journal-creation exclusivity has been demonstrated.',
      'This diagnostic never executes the published 0.9.3 CLI, never writes to the assessed project, and never follows a symbolic link. A verdict describes the assessed state only; it says nothing about a state that changes afterwards.'
    ]),
    noWriteGuarantee: 'This diagnostic performs no writes; it only reads the target directory (lstat, no-follow).'
  });
}

export function formatHazardReportText(report) {
  const lines = [];
  lines.push(`VCP old-CLI 0.9.3 hazard exposure: ${report.root ?? '(unknown root)'}`);
  lines.push(`Classification: ${report.classification}${report.classificationReason ? ` (${report.classificationReason})` : ''}`);
  if (report.access.refused) {
    lines.push(`Access refused: ${report.access.reason}. The target was not followed and no entrypoint was assessed.`);
  }
  for (const name of HAZARD_ENTRYPOINTS) {
    const e = report.entrypoints[name];
    lines.push(`  ${name}: ${e.verdict}${e.hazards.length ? ` (${e.hazards.join(', ')})` : ''} — ${e.reason}`);
    if (e.evidence.length) lines.push(`    evidence: ${e.evidence.join(', ')}`);
    lines.push(`    concurrency (H4): UNKNOWN — no demonstrated exclusivity (PH-06 UNRESOLVED).`);
  }
  if (report.warnings.length) {
    lines.push('Warnings:');
    for (const w of report.warnings) lines.push(`  WARNING: ${w}`);
  }
  lines.push('UNKNOWN is not safe: an UNKNOWN verdict means the evidence is insufficient, never that the entrypoint is safe.');
  lines.push('No files written.');
  return lines.join('\n');
}
