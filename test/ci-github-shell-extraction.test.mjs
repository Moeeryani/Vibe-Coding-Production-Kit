// GitHub snippet consistency (independent-validation LOW 7.3/7.4, P1 repair).
// The old GitHub emission was a complete workflow file whose header claimed
// it "adds ONLY the job", had no merge_group trigger, and extracted the
// PR-body trailer with an untrimmed `sed` that kept trailing whitespace —
// which the JS extractor trims, so `ci-gate-plan` and the shell job could
// disagree on the same trailer. These tests pin the repair: a job fragment,
// merge-queue guidance, and a shell extractor EXECUTED against the same
// inputs as the JS extractor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractTaskSelectors, providerCapabilities, renderSnippet } from '../lib/ci-provider-adapters.mjs';

const execFileAsync = promisify(execFile);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Extract the `run: |` block of the vcp-task step from the rendered snippet
// and return it as an executable shell script.
function extractTaskStepScript(snippet) {
  const lines = snippet.split('\n');
  const idAt = lines.findIndex((l) => l.trim() === 'id: vcp-task');
  assert.ok(idAt >= 0, 'snippet has a vcp-task step');
  const runAt = lines.findIndex((l, i) => i > idAt && /^\s+run: \|$/.test(l));
  assert.ok(runAt >= 0, 'vcp-task step has a run block');
  const indent = lines[runAt].match(/^\s*/)[0].length;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') { body.push(''); continue; }
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent <= indent) break;
    body.push(line.slice(indent + 2));
  }
  assert.ok(body.length > 0, 'run block is non-empty');
  return body.join('\n') + '\n';
}

async function runTaskStep(prBody, vcpTask) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-gh-shell-'));
  try {
    const snippet = renderSnippet('github', { jobName: 'vcp-gate', mode: 'GATE_RUN' });
    const scriptPath = path.join(dir, 'task-step.sh');
    const outputPath = path.join(dir, 'github-output.txt');
    await writeFile(scriptPath, extractTaskStepScript(snippet), 'utf8');
    let code = 0;
    try {
      await execFileAsync('bash', [scriptPath], {
        env: { ...process.env, PR_BODY: prBody, VCP_TASK: vcpTask, GITHUB_OUTPUT: outputPath },
      });
    } catch (e) { code = e.code; }
    let task = null;
    try {
      const out = await readFile(outputPath, 'utf8');
      const m = /^task=(.*)$/m.exec(out);
      if (m) task = m[1];
    } catch { /* no output file: step blocked before writing */ }
    return { code, task };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('GitHub snippet is a job fragment, not a complete workflow', () => {
  const snippet = renderSnippet('github', { jobName: 'vcp-gate', mode: 'GATE_RUN' });
  const lines = snippet.split('\n');
  assert.ok(!lines.some((l) => /^name: /.test(l)), 'fragment carries no workflow name');
  assert.ok(!lines.some((l) => /^on:/.test(l)), 'fragment carries no triggers');
  assert.ok(!lines.some((l) => /^jobs:/.test(l)), 'fragment carries no jobs map');
  assert.ok(lines.some((l) => l === 'vcp-gate:'), 'job id is at the top level of the fragment');
  assert.ok(snippet.includes('runs-on: ubuntu-latest'), 'fragment carries the runner');
  assert.ok(snippet.includes('ONE job to add to an existing workflow file'), 'header describes a fragment');
  assert.ok(!snippet.includes('new file'), 'header must not claim a new workflow file');
  assert.ok(snippet.includes('merge_group'), 'fragment documents merge queues');
  assert.ok(snippet.includes("add 'merge_group' to the host workflow's 'on:'"), 'merge-group support is via host triggers');
  assert.ok(snippet.includes('Do NOT claim this fragment enforces anything'), 'fragment keeps the enforcement distinction');
  const caps = providerCapabilities('github');
  assert.match(caps.supportsMergeGroup, /host workflow triggers/);
  assert.match(caps.configPath, /existing \.github\/workflows/);
});

test('shell trailer extraction matches the JS extractor (executed)', async () => {
  const cases = [
    // [label, prBody, vcpTask, expectedCode, expectedTask]
    ['plain trailer', 'Body\n\nVCP-Task: my-task\n', '', 0, 'my-task'],
    ['trailing space trimmed (LOW 7.4 regression)', 'Body\nVCP-Task: my-task \n', '', 0, 'my-task'],
    ['trailing tab trimmed', 'Body\nVCP-Task: my-task\t\n', '', 0, 'my-task'],
    ['CRLF body', 'Body\r\nVCP-Task: my-task\r\n', '', 0, 'my-task'],
    ['leading spaces before value', 'VCP-Task:   my-task\n', '', 0, 'my-task'],
    ['two trailers block', 'VCP-Task: a-task\nVCP-Task: b-task\n', '', 1, null],
    ['value with a space is not a selector', 'VCP-Task: my-task extra\n', '', 1, null],
    ['empty trailer value blocks', 'VCP-Task: \n', '', 1, null],
    ['no trailer + one VCP_TASK falls back', 'No trailer here\n', 'fallback-task', 0, 'fallback-task'],
    ['no trailer + empty VCP_TASK blocks', 'No trailer here\n', '', 1, null],
    ['no trailer + multiple VCP_TASK blocks', 'No trailer here\n', 'a-task, b-task', 1, null],
    ['no trailer + VCP_TASK with spaces blocks', 'No trailer here\n', 'a-task b-task', 1, null],
    ['invalid slug blocks', 'VCP-Task: Bad_Slug\n', '', 1, null],
    ['trailer wins over VCP_TASK', 'VCP-Task: trailer-task\n', 'env-task', 0, 'trailer-task'],
  ];
  for (const [label, prBody, vcpTask, expectedCode, expectedTask] of cases) {
    const { code, task } = await runTaskStep(prBody, vcpTask);
    assert.equal(code, expectedCode, `${label}: exit ${code}, want ${expectedCode}`);
    assert.equal(task, expectedTask, `${label}: task ${task}, want ${expectedTask}`);
    // Parity with the JS extractor, keyed on what the trailer yields. The
    // VCP_TASK fallback is shell-only (the JS GitHub extractor reads the PR
    // body alone), so fallback cases are those with no trailer selector.
    const js = extractTaskSelectors('github', { prBody });
    if (js.selectors.length === 1 && SLUG_RE.test(js.selectors[0])) {
      assert.equal(code, 0, `${label}: shell must pass the one valid trailer selector`);
      assert.equal(task, js.selectors[0], `${label}: shell task must equal the JS selector`);
    } else if (js.selectors.length === 0) {
      assert.equal(task, vcpTask === '' ? null : expectedTask, `${label}: no trailer selector, so only the VCP_TASK fallback may decide`);
    } else {
      assert.equal(code, 1, `${label}: multiple or invalid trailer selectors must block`);
    }
  }
});

test('other providers require exactly one VCP_TASK selector at the shell level', () => {
  for (const provider of ['gitlab', 'circleci', 'azure']) {
    const task = renderSnippet(provider, { jobName: 'vcp-gate', mode: 'GATE_RUN' });
    assert.ok(task.includes('TASK_COUNT'), `${provider}: shell counts VCP_TASK selectors`);
    assert.ok(task.includes('exactly one VCP_TASK selector'), `${provider}: shell fails closed on count`);
    const l0 = renderSnippet(provider, { jobName: 'vcp-gate', mode: 'L0_ATTEMPT' });
    // Azure keeps a VCP_TASK: '' placeholder variable in L0 mode; what must
    // be absent is the selector COUNT check, not the variable name.
    assert.ok(!l0.includes('TASK_COUNT'), `${provider}: L0 snippet has no selector check`);
    if (provider !== 'azure') assert.ok(!l0.includes('VCP_TASK'), `${provider}: L0 snippet has no selector check`);
  }
});
