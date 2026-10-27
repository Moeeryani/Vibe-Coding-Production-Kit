// Phase 8: provider-neutral gate invocation contract. PURE: no Git, no
// network, no file writes, no platform calls. It turns provider metadata
// (selectors, SHAs, shallow flag) into exactly one of:
//   GATE_RUN   — one valid task selector + resolved base/head SHAs: run
//                `vcp gate <task> --base <baseSha> --head <headSha> --run`.
//   L0_ATTEMPT — no selector: run the L0 gate only; a material change
//                blocks with instructions to provide one task selector.
//   BLOCKED    — anything else: multiple/invalid selectors, missing or
//                non-SHA refs, identical base/head, shallow history, or a
//                provider the policy does not allow. No command is produced.
// Check semantics (implemented by the snippet's verdict step, recorded here):
//   L0 evidence-only passes ONLY when policy.allowL0CheckPass is true.
//   Material evidence-only BLOCKS: evidence is not review, and no review
//   acceptance contract exists yet (Checkpoint C SIMPLIFY). A snippet is a
//   template, never platform enforcement: enforcement.providerEnforced is
//   always false, because VCP cannot observe branch protection from here.
import { validateGatePolicy, defaultGatePolicy } from './ci-gate-policy.mjs';
import { providerCapabilities, renderSnippet, slugPattern } from './ci-provider-adapters.mjs';

const SHA = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/;
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function rec(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

export function buildGateInvocation({
  provider, selectors = [], baseSha = null, headSha = null, isShallow = false,
  policy = {}, existingCI = null,
} = {}) {
  if (typeof provider !== 'string' || !provider) fail('E_CI_PROVIDER');
  const capabilities = providerCapabilities(provider); // throws on unknown provider
  if (!rec(policy)) fail('E_CI_POLICY');
  const validated = validateGatePolicy({ ...defaultGatePolicy(), ...policy });
  if (!validated.allowedProviders.includes(provider)) {
    return blockedContract({ provider, validated, existingCI, blockers: ['PROVIDER_NOT_ALLOWED'],
      selection: { kind: 'NOT_ALLOWED', task: null, selectors: Object.freeze([...selectors]),
        message: `Provider '${provider}' is not in the gate policy's allowedProviders.` } });
  }
  if (!Array.isArray(selectors) || selectors.some((s) => typeof s !== 'string')) fail('E_CI_TASK_SELECTOR');
  const selection = resolveSelection(selectors);
  const blockers = [];
  if (selection.kind === 'MULTIPLE') blockers.push('MULTIPLE_TASK_SELECTORS');
  if (selection.kind === 'INVALID') blockers.push('INVALID_TASK_SELECTOR');
  if (baseSha === null || headSha === null) blockers.push('MISSING_BASE_HEAD');
  else {
    if (!SHA.test(baseSha) || !SHA.test(headSha)) blockers.push('INVALID_SHA');
    else if (baseSha === headSha) blockers.push('IDENTICAL_BASE_HEAD');
  }
  if (isShallow !== false) {
    if (typeof isShallow !== 'boolean') fail('E_CI_SHALLOW_FLAG');
    blockers.push('SHALLOW_HISTORY');
  }
  if (blockers.length) {
    return blockedContract({ provider, validated, existingCI, blockers, selection,
      baseSha: SHA.test(baseSha ?? '') ? baseSha : null,
      headSha: SHA.test(headSha ?? '') ? headSha : null });
  }
  const mode = selection.kind === 'NONE' ? 'L0_ATTEMPT' : 'GATE_RUN';
  const task = selection.task;
  const argv = ['vcp', 'gate'];
  if (task) argv.push(task);
  argv.push('--base', baseSha, '--head', headSha, '--run', '--json');
  const snippet = renderSnippet(provider, { jobName: validated.stableJobName, mode,
    allowL0CheckPass: validated.allowL0CheckPass });
  return Object.freeze({
    contractVersion: 'phase8-invocation-1',
    provider, jobName: validated.stableJobName, mode,
    selection: Object.freeze(selection),
    baseSha, headSha,
    baseShaSource: capabilities.baseShaSource, headShaSource: capabilities.headShaSource,
    command: Object.freeze({ argv: Object.freeze(argv), shell: argv.join(' ') }),
    // The snippet's verdict step implements this: L0 evidence-only passes
    // only when policy allows it; every other gate outcome blocks.
    checkOutcome: validated.allowL0CheckPass ? 'PASS_ONLY_IF_L0' : 'BLOCK',
    blockers: Object.freeze([]),
    snippet: snippet === null ? null : Object.freeze({ provider, jobName: validated.stableJobName, text: snippet }),
    snippetNote: snippet === null
      ? 'No snippet for custom CI: wire the command above into your pipeline manually.'
      : 'Snippet text only. It is not installed, not pushed, and not required by any platform until the owner configures branch protection for it.',
    enforcement: Object.freeze({
      providerEnforced: false, mergeProtectionObserved: false, localEvidenceOnly: true,
      toEnforce: `Configure branch protection / a ruleset / a merge queue requiring the '${validated.stableJobName}' check, and independent review acceptance for material changes. VCP cannot verify either from here; a template file alone enforces nothing.`,
    }),
    existingCI: existingCI === null ? null : Object.freeze({ ...existingCI }),
    policy: validated,
    note: 'A gate run collects evidence. It never independently grants merging, release, CI PASS for material work, or D-01/G-FENCE changes.',
  });
}

function resolveSelection(selectors) {
  if (selectors.length === 0) {
    return { kind: 'NONE', task: null, selectors: Object.freeze([]),
      message: 'No task selector present: attempt the L0 gate; a material change blocks and instructs the author to provide one VCP task selector.' };
  }
  if (selectors.length > 1) {
    return { kind: 'MULTIPLE', task: null, selectors: Object.freeze([...selectors]),
      message: `Multiple task selectors (${selectors.length}) present. Split the PR or create/use one bounded primary task whose accepted scope covers the PR.` };
  }
  const task = selectors[0];
  if (!slugPattern().test(task)) {
    return { kind: 'INVALID', task: null, selectors: Object.freeze([...selectors]),
      message: `Task selector '${task}' is not a valid task slug.` };
  }
  return { kind: 'EXPLICIT', task, selectors: Object.freeze([task]), message: null };
}

function blockedContract({ provider, validated, existingCI, blockers, selection, baseSha = null, headSha = null }) {
  return Object.freeze({
    contractVersion: 'phase8-invocation-1',
    provider, jobName: validated.stableJobName, mode: 'BLOCKED',
    selection: Object.freeze(selection),
    baseSha, headSha, baseShaSource: null, headShaSource: null,
    command: null,
    checkOutcome: 'BLOCK',
    blockers: Object.freeze([...new Set(blockers)]),
    snippet: null,
    snippetNote: 'No snippet is produced for a blocked invocation: there is no valid gate command to run.',
    enforcement: Object.freeze({
      providerEnforced: false, mergeProtectionObserved: false, localEvidenceOnly: true,
      toEnforce: `Configure branch protection / a ruleset / a merge queue requiring the '${validated.stableJobName}' check, and independent review acceptance for material changes. VCP cannot verify either from here; a template file alone enforces nothing.`,
    }),
    existingCI: existingCI === null ? null : Object.freeze({ ...existingCI }),
    policy: validated,
    note: 'Blocked invocations run no gate command. Fix the listed blockers and rebuild the invocation.',
  });
}

export function defaultPolicy() { return defaultGatePolicy(); }
export function invocationContractVersion() { return 'phase8-invocation-1'; }
