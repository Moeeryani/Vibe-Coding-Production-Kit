// Phase 8: provider-neutral CI adapters. Each adapter does exactly three
// things, and nothing more:
//   1. extract task selectors from provider metadata (GitHub: strict PR-body
//      trailer; every other provider: one explicit env/input value);
//   2. render one thin snippet that ADDS a single job and rewrites nothing
//      else in the project's existing workflow;
//   3. describe what the provider can and cannot prove about enforcement.
// A snippet is text, not activation: it is never written into a project by
// this module, never pushed, and never marked required by VCP. Merge
// enforcement exists only when the platform's branch protection/ruleset
// requires the stable job — which VCP cannot observe from here.
// Every snippet fails closed on shallow history and on unreadable gate
// evidence, and maps the gate's exit codes explicitly: ONLY an L0
// evidence-only result becomes a passing check (and only when policy allows
// it); material evidence-only results BLOCK, because evidence is not review.
import { knownProviders } from './ci-gate-policy.mjs';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function fail(code) { const e = new Error(code); e.code = code; throw e; }

// Template expressions for base/head SHAs, evaluated by the PROVIDER at job
// runtime — never guessed by VCP. CircleCI has no native PR base SHA, so its
// snippet requires an explicit VCP_BASE_SHA parameter instead.
const PROVIDERS = Object.freeze({
  github: Object.freeze({
    id: 'github', display: 'GitHub Actions',
    baseShaExpr: '${{ github.event.pull_request.base.sha }}',
    headShaExpr: '${{ github.event.pull_request.head.sha }}',
    supportsPullRequest: true, supportsMergeGroup: 'when merge queues are enabled',
    baseShaSource: 'PR event payload (base branch tip SHA)',
    headShaSource: 'PR event payload (head branch tip SHA)',
    selectorSource: 'PR body trailer line: VCP-Task: <slug>',
    configPath: '.github/workflows/vcp-gate.yml (new file; owner places it)',
  }),
  gitlab: Object.freeze({
    id: 'gitlab', display: 'GitLab CI',
    baseShaExpr: '$CI_MERGE_REQUEST_DIFF_BASE_SHA',
    headShaExpr: '$CI_COMMIT_SHA',
    supportsPullRequest: true, supportsMergeGroup: 'not applicable (merge trains are separate)',
    baseShaSource: 'Merge request pipeline variable (empty outside MR pipelines: fails closed)',
    headShaSource: 'CI_COMMIT_SHA',
    selectorSource: 'Explicit CI/CD variable VCP_TASK',
    configPath: '.gitlab-ci.yml (one added job; owner places it after setup)',
  }),
  circleci: Object.freeze({
    id: 'circleci', display: 'CircleCI',
    baseShaExpr: '$VCP_BASE_SHA',
    headShaExpr: '$CIRCLE_SHA1',
    supportsPullRequest: false, supportsMergeGroup: 'not supported',
    baseShaSource: 'EXPLICIT pipeline parameter/env VCP_BASE_SHA (no native PR base SHA; empty fails closed)',
    headShaSource: 'CIRCLE_SHA1',
    selectorSource: 'Explicit environment variable VCP_TASK',
    configPath: '.circleci/config.yml (one added job; owner places it after setup)',
  }),
  azure: Object.freeze({
    id: 'azure', display: 'Azure Pipelines',
    baseShaExpr: '$(VCP_BASE_SHA)',
    headShaExpr: '$(Build.SourceVersion)',
    supportsPullRequest: true, supportsMergeGroup: 'not supported',
    baseShaSource: 'Resolved in-job from origin/$(System.PullRequest.TargetBranch) (PR builds only; fails closed otherwise)',
    headShaSource: 'Build.SourceVersion',
    selectorSource: 'Explicit pipeline variable VCP_TASK',
    configPath: 'azure-pipelines.yml (one added job; owner places it after setup)',
  }),
  custom: Object.freeze({
    id: 'custom', display: 'Custom CI (no snippet)',
    baseShaExpr: '$VCP_BASE_SHA', headShaExpr: '$VCP_HEAD_SHA',
    supportsPullRequest: 'unknown', supportsMergeGroup: 'unknown',
    baseShaSource: 'Explicit VCP_BASE_SHA',
    headShaSource: 'Explicit VCP_HEAD_SHA',
    selectorSource: 'Explicit environment variable VCP_TASK',
    configPath: null,
  }),
});

export function providerCapabilities(provider) {
  if (!PROVIDERS[provider]) fail('E_CI_PROVIDER');
  return PROVIDERS[provider];
}

// GitHub: every `VCP-Task: <value>` trailer line is one selector attempt,
// including invalid values (validation happens in the invocation contract,
// so a malformed trailer blocks instead of silently vanishing).
// Other providers: one explicit VCP_TASK value; commas/whitespace separate
// multiple selectors (multiple selectors block downstream).
export function extractTaskSelectors(provider, { prBody = null, env = {} } = {}) {
  if (!PROVIDERS[provider]) fail('E_CI_PROVIDER');
  if (provider === 'github') {
    if (typeof prBody !== 'string') fail('E_CI_PR_BODY_REQUIRED');
    const found = [];
    for (const line of prBody.split(/\r?\n/)) {
      const m = /^VCP-Task:[ \t]*([^ \t]+)[ \t]*$/.exec(line);
      if (m) found.push(m[1]);
    }
    return Object.freeze({ provider, source: PROVIDERS.github.selectorSource, selectors: Object.freeze(found) });
  }
  const raw = env?.VCP_TASK;
  if (typeof raw !== 'string' || !raw.trim()) {
    return Object.freeze({ provider, source: PROVIDERS[provider].selectorSource, selectors: Object.freeze([]) });
  }
  return Object.freeze({
    provider, source: PROVIDERS[provider].selectorSource,
    selectors: Object.freeze(raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)),
  });
}

// Shared CI-side verdict: parse the gate's JSON evidence and decide the job.
// ONLY L0 evidence-only passes (policy-gated by the caller: when L0 passing
// is disabled, the caller must not use this mapping — see buildGateInvocation,
// which records allowL0CheckPass in the contract). Everything else exits 1.
function verdictScript(allowL0CheckPass) {
  const l0 = allowL0CheckPass
    ? `if (r.status === 'EVIDENCE_ONLY_NOT_APPROVED' && level === 'L0') { console.log('VCP gate: L0 documentation-only change, evidence collected.'); process.exit(0); }`
    : `// L0 passing is disabled by policy: even L0 evidence blocks this check.`;
  return `node -e "const fs = require('node:fs'); let r; try { r = JSON.parse(fs.readFileSync('vcp-gate.json', 'utf8')); } catch { console.error('VCP gate evidence unreadable; failing closed.'); process.exit(1); } const level = r.preflight && r.preflight.changes && r.preflight.changes.requiredLevel; ${l0} console.error('VCP gate: ' + (r.status || 'unknown') + ' (level ' + (level || '?') + '). Evidence only is not approval; this check blocks.'); process.exit(1);"`;
}

const SHALLOW_GUARD = 'test "$(git rev-parse --is-shallow-repository)" = "false" || { echo "VCP gate requires full Git history; refusing a shallow clone."; exit 1; }';

// mode GATE_RUN: one explicit task selector, resolved at job runtime
// (GitHub: PR-body trailer; others: $VCP_TASK). Mode L0_ATTEMPT: no
// selector present; the job attempts the L0 gate only, and blocks on any
// material change with instructions to provide one task selector.
export function renderSnippet(provider, { jobName, mode = 'GATE_RUN', allowL0CheckPass = true } = {}) {
  const meta = PROVIDERS[provider];
  if (!meta) fail('E_CI_PROVIDER');
  if (provider === 'custom') return null;
  if (typeof jobName !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(jobName)) fail('E_CI_POLICY_JOB_NAME');
  if (mode !== 'GATE_RUN' && mode !== 'L0_ATTEMPT') fail('E_CI_MODE');
  const verdict = verdictScript(allowL0CheckPass);
  const header = `# VCP gate — thin addition. Adds ONLY the '${jobName}' job; it rewrites no existing job.
# Place after your project's setup/install steps, and only where full Git history is available.
# This job collects evidence; it is NOT merge enforcement. Enforcement exists only when
# branch protection / a ruleset / a merge queue requires the '${jobName}' check AND review
# acceptance exists for material changes (see the invocation contract). Do NOT mark this
# job required for material changes until independent review acceptance exists.
# Check mapping (explicit, never inferred): L0 evidence-only passes ONLY when policy allows
# it; material evidence-only BLOCKS; blocked, unreadable, or shallow evidence BLOCKS.`;
  if (provider === 'github') {
    const taskStep = mode === 'GATE_RUN'
      ? `      - name: Resolve one VCP task selector from the PR body trailer
        id: vcp-task
        run: |
          COUNT=$(printf '%s' "$PR_BODY" | grep -c '^VCP-Task: ' || true)
          if [ "$COUNT" != "1" ]; then echo "VCP gate requires exactly one 'VCP-Task: <slug>' trailer line; found $COUNT."; exit 1; fi
          TASK=$(printf '%s' "$PR_BODY" | sed -n 's/^VCP-Task: //p' | head -1)
          echo "task=$TASK" >> "$GITHUB_OUTPUT"
        env:
          PR_BODY: \${{ github.event.pull_request.body }}
`
      : '';
    const taskArg = mode === 'GATE_RUN' ? ' "\${{ steps.vcp-task.outputs.task }}"' : '';
    return `${header}
name: ${jobName}
on:
  pull_request:
jobs:
  ${jobName}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
${taskStep}      - name: VCP gate (evidence only; never a merge authorization)
        run: |
          rm -f vcp-gate.json
          ${SHALLOW_GUARD}
          vcp gate${taskArg} --base "${meta.baseShaExpr}" --head "${meta.headShaExpr}" --run --json > vcp-gate.json || true
          ${verdict}
`;
  }
  if (provider === 'gitlab') {
    const taskCheck = mode === 'GATE_RUN'
      ? `    - test -n "$VCP_TASK" || { echo "VCP gate requires exactly one VCP_TASK variable (a task slug)."; exit 1; }\n`
      : '';
    const taskArg = mode === 'GATE_RUN' ? ' "$VCP_TASK"' : '';
    return `${header}
${jobName}:
  stage: test  # TODO: use one of your existing stages; do not invent a stage the pipeline lacks.
  variables:
    GIT_DEPTH: "0"
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  script:
    - rm -f vcp-gate.json
    - ${SHALLOW_GUARD}
    - test -n "$CI_MERGE_REQUEST_DIFF_BASE_SHA" || { echo "VCP gate requires a merge-request pipeline (no diff base SHA)."; exit 1; }
${taskCheck}    - vcp gate${taskArg} --base "$CI_MERGE_REQUEST_DIFF_BASE_SHA" --head "$CI_COMMIT_SHA" --run --json > vcp-gate.json || true
    - ${verdict}
`;
  }
  if (provider === 'circleci') {
    const taskCheck = mode === 'GATE_RUN'
      ? `            test -n "$VCP_TASK" || { echo "VCP gate requires exactly one VCP_TASK variable (a task slug)."; exit 1; }\n`
      : '';
    const taskArg = mode === 'GATE_RUN' ? ' "$VCP_TASK"' : '';
    return `${header}
jobs:
  ${jobName}:
    docker:
      - image: cimg/node:20.18.0  # TODO: match your project's Node version.
    steps:
      - checkout
      - run:
          name: VCP gate (evidence only; never a merge authorization)
          command: |
            rm -f vcp-gate.json
            ${SHALLOW_GUARD}
            test -n "$VCP_BASE_SHA" || { echo "VCP gate requires an explicit VCP_BASE_SHA pipeline parameter (CircleCI has no native PR base SHA)."; exit 1; }
${taskCheck}            vcp gate${taskArg} --base "$VCP_BASE_SHA" --head "$CIRCLE_SHA1" --run --json > vcp-gate.json || true
            ${verdict}
`;
  }
  // azure
  const taskCheck = mode === 'GATE_RUN'
    ? `      test -n "$VCP_TASK" || { echo "VCP gate requires exactly one VCP_TASK variable (a task slug)."; exit 1; }\n`
    : '';
  const taskArg = mode === 'GATE_RUN' ? ' "$VCP_TASK"' : '';
  return `${header}
jobs:
- job: ${jobName}
  pool:
    vmImage: ubuntu-latest  # TODO: match your project's pool/image.
  variables:
    VCP_TASK: ''  # TODO: set exactly one task slug per PR, or fail the job.
  steps:
  - checkout: self
    fetchDepth: 0
  - script: |
      rm -f vcp-gate.json
      ${SHALLOW_GUARD}
      if [ -z "$(System.PullRequest.TargetBranch)" ]; then echo "VCP gate requires a pull-request build (no target branch)."; exit 1; fi
      VCP_BASE_SHA=$(git rev-parse "origin/$(System.PullRequest.TargetBranch)") || { echo "VCP gate could not resolve the target branch SHA."; exit 1; }
${taskCheck}      vcp gate${taskArg} --base "$VCP_BASE_SHA" --head "$(Build.SourceVersion)" --run --json > vcp-gate.json || true
      ${verdict}
    displayName: 'VCP gate (evidence only; never a merge authorization)'
`;
}

export function knownProviderIds() { return knownProviders(); }
export function slugPattern() { return SLUG; }
