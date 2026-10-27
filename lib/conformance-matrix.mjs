// Phase 10: conformance matrix. Machine-readable, deliberately incapable of
// expressing acceptance: the status vocabulary has COVERED (in-tree test
// evidence), PARTIAL (mechanism exists, acceptance outstanding), and
// UNRESOLVED (explicit blocker with its owner decision named). There is no
// ACCEPTED status, and validateConformanceMatrix rejects one if added.
// Overall conformance acceptance and production readiness are therefore
// NOT claims this module can make; they remain separate owner decisions
// backed by independent evidence that does not exist yet.
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFORMANCE_STATUSES = Object.freeze(['COVERED', 'PARTIAL', 'UNRESOLVED']);

function row(id, area, requirement, evidence, status, notes) {
  return Object.freeze({ id, area, requirement, evidence: Object.freeze(evidence), status, notes });
}

export const CONFORMANCE_MATRIX = Object.freeze([
  row('CLI-01', 'CLI and package compatibility', 'Help lists every new command (gate, gate-preview, workflow-preview, capability-plan, ci-gate-plan) with honest caveats.',
    ['test/ci-gate-plan-cli.test.mjs', 'test/gate-run-execution.test.mjs', 'lib/cli.mjs help text'], 'COVERED', 'Commands exist; help text states evidence-only / read-only limits.'),
  row('CLI-02', 'CLI and package compatibility', 'New commands emit parseable --json and reject mutation flags in read-only modes.',
    ['test/ci-gate-plan-cli.test.mjs', 'test/gate-run-contract.test.mjs'], 'COVERED', ''),
  row('PKG-01', 'CLI and package compatibility', 'Package files[] ships bin/, lib/, prompts/, skills/, docs/; skills resolve from the package root.',
    ['test/skill-inventory.test.mjs', 'package.json'], 'COVERED', 'Real pack dry-run listing is final-verification evidence, not a test.'),
  row('LEG-01', 'Legacy schema compatibility', 'Schema v1 manifests load through the unchanged v1 runtime path.',
    ['test/community-plugins.test.mjs', 'lib/community-plugins.mjs'], 'COVERED', ''),
  row('LEG-02', 'Legacy schema compatibility', 'Schema v2 manifests load only through the digest-pinned canonical loader with the capability-detection grant.',
    ['test/community-plugins.test.mjs', 'lib/selected-profile-v2.mjs'], 'COVERED', ''),
  row('LEG-03', 'Legacy schema compatibility', 'A v1 manifest carrying the new grant is refused (E_PROFILE_V1_GRANT_UNSUPPORTED); a v1-shaped v2 flip is refused (E_PROFILE_V2_GRANT_REQUIRED).',
    ['test/community-plugins.test.mjs'], 'COVERED', 'Integration defect fixed test-only; refusal behavior preserved.'),
  row('PROV-01', 'Capability and profile provenance', 'capability-plan carries a provenance preview (persistedApplication:false, ownerApproval NOT_ESTABLISHED), not NOT_AVAILABLE.',
    ['test/capability-provenance-integration.test.mjs'], 'COVERED', ''),
  row('PROV-02', 'Capability and profile provenance', 'Historical manifests carrying capability fields fail closed; v1/v2 manifests are reported, never extended.',
    ['test/capability-provenance-integration.test.mjs'], 'COVERED', ''),
  row('PROV-03', 'Capability and profile provenance', 'A claimed approval is refused (approval contract undefined); digest-verified selection still yields PROPOSED, never APPLIED.',
    ['test/capability-provenance-integration.test.mjs'], 'COVERED', ''),
  row('WF-01', 'Auto/Manual workflows', 'Manual routing works through existing commands; workflow-preview routes manual/auto phases read-only.',
    ['test/workflow-router.test.mjs'], 'COVERED', ''),
  row('WF-02', 'Auto/Manual workflows', 'Auto does not persist workflowMode (manifest schema records no mode) and never auto-executes beyond authorized commands.',
    ['test/workflow-router.test.mjs', 'lib/workflow-router.mjs'], 'PARTIAL', 'Session-preview semantics documented; owner decision needed if persistence is ever wanted.'),
  row('GATE-01', 'Gate classification and execution', 'Classification exact on 12 change cases + empty-diff block; 0 false-high, 0 unsafe-low on fixtures.',
    ['test/checkpoint-c-measurements.test.mjs'], 'COVERED', 'Synthetic fixtures, not real-user dogfood.'),
  row('GATE-02', 'Gate classification and execution', 'Clean L0/L1/L2 gates reach EVIDENCE_ONLY_NOT_APPROVED (exit 2); verification executed only where the level requires it.',
    ['test/gate-run-execution.test.mjs'], 'COVERED', ''),
  row('GATE-03', 'Gate classification and execution', 'L3 changes refuse before verification (INDEPENDENT_L3_REVIEW_REQUIRED); no L3 pass path exists yet.',
    ['test/gate-run-execution.test.mjs'], 'PARTIAL', 'Blocked on UNRESOLVED L3 review-evidence format (U-07).'),
  row('GATE-04', 'Gate classification and execution', 'Stale evidence refused: HEAD change, task change, dirty-before/after, failed and unauthorized commands all block with the command unrun or the evidence rejected.',
    ['test/gate-run-execution.test.mjs'], 'COVERED', ''),
  row('CI-01', 'Provider-neutral CI integration', 'Gate policy is explicit and validated; unknown fields, bad job names, and shallow tolerance are rejected.',
    ['test/ci-gate-invocation.test.mjs'], 'COVERED', ''),
  row('CI-02', 'Provider-neutral CI integration', 'Selector resolution is deterministic: none -> L0 attempt, one -> run, multiple/invalid -> block with no command.',
    ['test/ci-gate-invocation.test.mjs', 'test/ci-gate-plan-cli.test.mjs'], 'COVERED', ''),
  row('CI-03', 'Provider-neutral CI integration', 'Missing, malformed, identical, and shallow refs fail closed; SHAs are required, never guessed.',
    ['test/ci-gate-invocation.test.mjs'], 'COVERED', ''),
  row('CI-04', 'Provider-neutral CI integration', 'Thin snippets exist for GitHub, GitLab, CircleCI, Azure (one added job each, shallow guard, explicit L0 verdict mapping); custom CI gets a command but no snippet.',
    ['test/ci-provider-adapters.test.mjs'], 'COVERED', 'Snippets are text, never installed or activated by VCP.'),
  row('CI-05', 'Provider-neutral CI integration', 'Local evidence and provider enforcement are never conflated: enforcement.providerEnforced is always false from VCP.',
    ['test/ci-gate-invocation.test.mjs'], 'COVERED', 'Branch protection / ruleset / merge-queue policy is owner-configured and unobserved.'),
  row('CI-06', 'Provider-neutral CI integration', 'No GitHub Actions workflow is created, activated, or run in this environment.',
    ['process evidence: no .github/workflows changes in this campaign'], 'COVERED', 'GitHub snippet is a template for other projects, not an activation.'),
  row('SKL-01', 'Skills installation and prompt behavior', 'Router + 7 specialized skills + 2 references exist, thin (<=100 lines), with name/description frontmatter.',
    ['test/skill-inventory.test.mjs'], 'COVERED', ''),
  row('SKL-02', 'Skills installation and prompt behavior', 'Skills route only to existing CLI commands, existing canonical prompts, and existing references; no policy literals outside the router.',
    ['test/skill-inventory.test.mjs'], 'COVERED', ''),
  row('SKL-03', 'Skills installation and prompt behavior', 'Prompt-eval suite covers 6 scenarios incl. security-review and release-decision boundaries, with reference-pass records bound to the current suite blob.',
    ['test/prompt-eval.test.mjs', 'test/prompt-eval-cli.test.mjs'], 'COVERED', ''),
  row('ADP-01', 'Fresh project and brownfield adoption', 'Fresh seeded project composes: capability-plan, gate-preview, ci-gate-plan, and skill inventory agree on one fixture.',
    ['test/conformance-fixtures.test.mjs'], 'COVERED', ''),
  row('ADP-02', 'Fresh project and brownfield adoption', 'Brownfield (unadopted) project: read-only tools work without writing state, and report no detected CI honestly.',
    ['test/conformance-fixtures.test.mjs'], 'COVERED', ''),
  row('NEG-01', 'Negative/security cases', 'Refusal paths are tested, not just success paths: draft, downgrade, unauthorized, dirty, stale, failed, L3, multiple/invalid selectors.',
    ['test/gate-run-execution.test.mjs', 'test/ci-gate-invocation.test.mjs'], 'COVERED', ''),
  row('NEG-02', 'Negative/security cases', 'Command authority is enforced at the execution boundary (exact AGENTS.md match + snapshot/digest checks); stale snapshots refuse.',
    ['test/verify.test.mjs', 'test/gate-run-execution.test.mjs'], 'COVERED', 'verify.test.mjs run-tests are pre-existing baseline failures (seed placeholder vs authority); see final report.'),
  row('DOC-01', 'Release/documentation claim consistency', 'No overall conformance acceptance or production readiness is claimed anywhere in this matrix or its doc; statuses cannot express acceptance.',
    ['test/conformance-matrix.test.mjs'], 'COVERED', 'Enforced structurally: ACCEPTED is not a valid status.'),
  row('DOC-02', 'Release/documentation claim consistency', 'Checkpoint C SIMPLIFY (L1 readiness bar, L3 review format, no real dogfood) is recorded with enforcement disabled.',
    ['VCP-ADAPTIVE-CHECKPOINT-C-REPORT.md (workspace root, outside repo)'], 'COVERED', ''),
  row('U-01', 'Unresolved', 'Windows principal provider is null; no Windows-native durability evidence exists.',
    [], 'UNRESOLVED', 'Owner decision + native Windows/NTFS campaign required.'),
  row('U-02', 'Unresolved', 'Power-loss durability (B-2) is NOT_PROVEN; no rig exists.',
    [], 'UNRESOLVED', 'Requires a durability rig; not attempted here.'),
  row('U-03', 'Unresolved', 'D-01 is DEFERRED; G-FENCE is NO-GO; production writers are DISABLED.',
    [], 'UNRESOLVED', 'Independent security acceptance required; never opened by construction work.'),
  row('U-04', 'Unresolved', 'Full transaction containment is NOT_PROVEN.',
    [], 'UNRESOLVED', 'Carried from N+3/N+4/R1 validations.'),
  row('U-05', 'Unresolved', 'Checkpoint A is NO-GO / pending; Stage 14 source construction is not acceptance.',
    [], 'UNRESOLVED', 'Separate owner acceptance required.'),
  row('U-06', 'Unresolved', 'Checkpoint D (complexity hidden) and Checkpoint E (model/tool audit) are not performed.',
    [], 'UNRESOLVED', 'Manual/empirical acceptances; deletion/simplification decisions outstanding.'),
  row('U-07', 'Unresolved', 'L3 independent-review evidence format is unspecified; L3 work has no completable gate path.',
    [], 'UNRESOLVED', 'Owner must specify reviewer/decision/scope/Git-provenance format.'),
  row('U-08', 'Unresolved', 'L1 readiness stage (plan vs implement) is undecided; L1 gates currently require implement-stage readiness.',
    [], 'UNRESOLVED', 'Owner decision; see Checkpoint C report.'),
  row('U-09', 'Unresolved', 'PH-06 concurrent journal creation is a pre-existing intermittent defect.',
    [], 'UNRESOLVED', 'Targeted resolution required before relying on exclusive production journal semantics.'),
  row('U-10', 'Unresolved', 'B9-01b remains INCONCLUSIVE (preempted by test-capability identity).',
    [], 'UNRESOLVED', 'Carried from R1 validation.'),
  row('U-11', 'Unresolved', 'Package 0.9.4 release is an owner decision; no tag, release, or npm publish follows from construction.',
    [], 'UNRESOLVED', 'Dev version only.'),
  row('U-12', 'Unresolved', 'Mandatory CI enforcement is disabled (Checkpoint C SIMPLIFY); Phase 8 builds preview/integration only.',
    [], 'UNRESOLVED', 'Enabling enforcement needs GO + review acceptance + observed branch protection.'),
]);

export function conformanceSummary(matrix = CONFORMANCE_MATRIX) {
  const counts = { COVERED: 0, PARTIAL: 0, UNRESOLVED: 0 };
  for (const item of matrix) counts[item.status] = (counts[item.status] ?? 0) + 1;
  return Object.freeze({ total: matrix.length, ...counts, acceptanceClaimed: false });
}

export async function validateConformanceMatrix(matrix = CONFORMANCE_MATRIX, root = packageRoot) {
  const problems = [];
  const ids = new Set();
  for (const item of matrix) {
    if (!item || typeof item !== 'object') { problems.push('non-object matrix row'); continue; }
    if (!item.id || ids.has(item.id)) problems.push(`duplicate or missing id: ${item.id}`);
    ids.add(item.id);
    if (!item.area || !item.requirement) problems.push(`${item.id}: missing area or requirement`);
    if (!CONFORMANCE_STATUSES.includes(item.status)) problems.push(`${item.id}: invalid status '${item.status}' (acceptance cannot be expressed)`);
    if (!Array.isArray(item.evidence)) problems.push(`${item.id}: evidence must be an array`);
    if (item.status === 'UNRESOLVED' && !item.notes) problems.push(`${item.id}: unresolved row must name its blocker`);
    if (item.status !== 'UNRESOLVED') {
      for (const evidence of item.evidence ?? []) {
        if (typeof evidence !== 'string' || !evidence) { problems.push(`${item.id}: empty evidence entry`); continue; }
        if (/\.(mjs|md|json)$/.test(evidence)) {
          try { await access(path.join(root, ...evidence.split('/'))); }
          catch { problems.push(`${item.id}: evidence file missing: ${evidence}`); }
        }
      }
    }
  }
  if (![...ids].some((id) => id.startsWith('U-'))) problems.push('matrix must list unresolved items explicitly');
  if (problems.length) {
    const error = new Error(`Conformance matrix invalid:\n- ${problems.join('\n- ')}`);
    error.code = 'E_CONFORMANCE_MATRIX';
    error.problems = problems;
    throw error;
  }
  return Object.freeze({ valid: true, summary: conformanceSummary(matrix) });
}
