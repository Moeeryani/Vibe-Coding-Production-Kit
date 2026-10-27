// Phase 8: explicit, validated gate policy for provider-neutral CI integration.
// A policy is owner configuration, not platform enforcement: nothing here can
// observe branch protection, and nothing here makes a check required.
// Two invariants are deliberately non-relaxable:
//   - shallow history always fails closed (a shallow clone has no trustworthy
//     base/head provenance, and no policy flag may bless guessed provenance);
//   - the stable job name must be portable across providers ([a-z0-9_-]+),
//     so one required-check name means the same job everywhere.
export const CI_GATE_POLICY_VERSION = 1;
const JOB_NAME = /^[a-z0-9][a-z0-9_-]*$/;
const KNOWN_PROVIDERS = Object.freeze(['github', 'gitlab', 'circleci', 'azure', 'custom']);
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function rec(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

export function defaultGatePolicy() {
  return Object.freeze({
    version: CI_GATE_POLICY_VERSION,
    stableJobName: 'vcp-gate',
    allowL0CheckPass: true,
    requireFullHistory: true,
    allowedProviders: Object.freeze(['github', 'gitlab', 'circleci', 'azure']),
  });
}

export function validateGatePolicy(policy = {}) {
  if (!rec(policy)) fail('E_CI_POLICY');
  const allowed = new Set(['version', 'stableJobName', 'allowL0CheckPass', 'requireFullHistory', 'allowedProviders']);
  for (const key of Object.keys(policy)) {
    if (!allowed.has(key)) fail('E_CI_POLICY_UNKNOWN_FIELD');
  }
  if (policy.version !== CI_GATE_POLICY_VERSION) fail('E_CI_POLICY_VERSION');
  const stableJobName = policy.stableJobName ?? 'vcp-gate';
  if (typeof stableJobName !== 'string' || !JOB_NAME.test(stableJobName)) fail('E_CI_POLICY_JOB_NAME');
  const allowL0CheckPass = policy.allowL0CheckPass ?? true;
  if (typeof allowL0CheckPass !== 'boolean') fail('E_CI_POLICY');
  const requireFullHistory = policy.requireFullHistory ?? true;
  if (typeof requireFullHistory !== 'boolean') fail('E_CI_POLICY');
  if (requireFullHistory !== true) {
    // Shallow-history tolerance is not a supported policy: it would bless
    // guessed base/head provenance. An owner who needs it must change this
    // module deliberately, not flip a flag.
    fail('E_CI_POLICY_SHALLOW_NOT_ALLOWED');
  }
  const allowedProviders = policy.allowedProviders ?? ['github', 'gitlab', 'circleci', 'azure'];
  if (!Array.isArray(allowedProviders) || !allowedProviders.length ||
      allowedProviders.some((p) => !KNOWN_PROVIDERS.includes(p))) fail('E_CI_POLICY_PROVIDERS');
  return Object.freeze({
    version: CI_GATE_POLICY_VERSION,
    stableJobName,
    allowL0CheckPass,
    requireFullHistory: true,
    allowedProviders: Object.freeze([...new Set(allowedProviders)]),
  });
}

export function knownProviders() { return KNOWN_PROVIDERS; }
