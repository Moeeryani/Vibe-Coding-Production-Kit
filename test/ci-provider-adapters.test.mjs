// Phase 8 provider adapters: selector extraction and thin snippets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTaskSelectors, renderSnippet, providerCapabilities } from '../lib/ci-provider-adapters.mjs';

test('GitHub trailer extraction is strict and counts every line', () => {
  const body = 'Fix login.\n\nVCP-Task: fix-login\nSome other text.\n';
  assert.deepEqual(extractTaskSelectors('github', { prBody: body }).selectors, ['fix-login']);
  const two = extractTaskSelectors('github', { prBody: 'VCP-Task: a-task\nVCP-Task: b-task\n' }).selectors;
  assert.deepEqual(two, ['a-task', 'b-task']);
  const bad = extractTaskSelectors('github', { prBody: 'VCP-Task: Bad_Slug\n' }).selectors;
  assert.deepEqual(bad, ['Bad_Slug']);
  assert.deepEqual(extractTaskSelectors('github', { prBody: 'no trailer here' }).selectors, []);
  assert.throws(() => extractTaskSelectors('github', {}), /E_CI_PR_BODY_REQUIRED/);
  assert.throws(() => extractTaskSelectors('bitbucket', {}), /E_CI_PROVIDER/);
});

test('non-GitHub providers use one explicit VCP_TASK value', () => {
  assert.deepEqual(extractTaskSelectors('gitlab', { env: { VCP_TASK: 'fix-login' } }).selectors, ['fix-login']);
  assert.deepEqual(extractTaskSelectors('circleci', { env: { VCP_TASK: 'a-task, b-task' } }).selectors, ['a-task', 'b-task']);
  assert.deepEqual(extractTaskSelectors('azure', { env: {} }).selectors, []);
  assert.deepEqual(extractTaskSelectors('azure', { env: { VCP_TASK: '   ' } }).selectors, []);
});

test('every snippet names the stable job, guards shallow clones, and maps verdicts', () => {
  for (const provider of ['github', 'gitlab', 'circleci', 'azure']) {
    const snippet = renderSnippet(provider, { jobName: 'vcp-gate', mode: 'GATE_RUN' });
    assert.ok(snippet.includes('vcp-gate'), provider);
    assert.ok(snippet.includes('is-shallow-repository'), provider);
    assert.ok(snippet.includes('EVIDENCE_ONLY_NOT_APPROVED'), provider);
    assert.ok(snippet.includes('L0'), provider);
    assert.match(snippet, /NOT merge enforcement|not.*enforcement/i);
    // Snippets add one job and rewrite nothing: no existing-job edits, no stage redefinition.
    assert.ok(!snippet.includes('stages:'), provider);
  }
});

test('L0 snippets require no task selector; task snippets resolve one', () => {
  const l0 = renderSnippet('gitlab', { jobName: 'vcp-gate', mode: 'L0_ATTEMPT' });
  assert.ok(!l0.includes('VCP_TASK'), 'L0 GitLab snippet must not require VCP_TASK');
  assert.ok(l0.includes('vcp gate --base'), 'L0 command carries no task');
  const task = renderSnippet('gitlab', { jobName: 'vcp-gate', mode: 'GATE_RUN' });
  assert.ok(task.includes('vcp gate "$VCP_TASK"'), 'task snippet resolves the selector at runtime');
  const gh = renderSnippet('github', { jobName: 'vcp-gate', mode: 'GATE_RUN' });
  assert.ok(gh.includes('VCP-Task: '), 'GitHub snippet extracts the trailer');
  assert.ok(gh.includes('fetch-depth: 0'), 'GitHub snippet fetches full history');
  const ghL0 = renderSnippet('github', { jobName: 'vcp-gate', mode: 'L0_ATTEMPT' });
  assert.ok(!ghL0.includes('VCP-Task: '), 'L0 GitHub snippet has no trailer step');
});

test('CircleCI documents its missing native base SHA; Azure resolves the target branch', () => {
  const circle = renderSnippet('circleci', { jobName: 'vcp-gate', mode: 'GATE_RUN' });
  assert.ok(circle.includes('VCP_BASE_SHA'), 'CircleCI requires an explicit base SHA');
  const azure = renderSnippet('azure', { jobName: 'vcp-gate', mode: 'GATE_RUN' });
  assert.ok(azure.includes('fetchDepth: 0'), 'Azure fetches full history');
  assert.ok(azure.includes('System.PullRequest.TargetBranch'), 'Azure resolves the PR target branch');
  assert.equal(providerCapabilities('circleci').supportsMergeGroup, 'not supported');
  assert.equal(providerCapabilities('github').supportsPullRequest, true);
});

test('custom CI has no snippet and bad job names are refused', () => {
  assert.equal(renderSnippet('custom', { jobName: 'vcp-gate' }), null);
  assert.throws(() => renderSnippet('gitlab', { jobName: 'Bad Name' }), /E_CI_POLICY_JOB_NAME/);
  assert.throws(() => renderSnippet('gitlab', { jobName: 'vcp-gate', mode: 'BOGUS' }), /E_CI_MODE/);
});

test('L0 passing can be disabled by policy in the verdict script', () => {
  const snippet = renderSnippet('gitlab', { jobName: 'vcp-gate', mode: 'GATE_RUN', allowL0CheckPass: false });
  assert.ok(!snippet.includes("level === 'L0'"), 'disabled L0 mapping must not pass L0 evidence');
  assert.ok(snippet.includes('L0 passing is disabled by policy'), 'disabled mapping says so explicitly');
});
