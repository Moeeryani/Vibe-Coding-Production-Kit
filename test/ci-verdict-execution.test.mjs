// CI verdict EXECUTION tests (independent-validation HIGH finding, 2026-10-27).
// The previous verdict generator hid the disabled-L0 branch in a `//` comment
// placed before the terminal process.exit(1), so disabling L0 passing passed
// every parseable evidence file. Text inspection did not catch it, so these
// tests extract the ACTUAL generated verdict code from every provider snippet
// and RUN it against evidence shaped like real `vcp gate` output, asserting
// exit codes — never merely inspecting the text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderSnippet } from '../lib/ci-provider-adapters.mjs';
import { runMechanicalGate } from '../lib/gate-run.mjs';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';

const execFileAsync = promisify(execFile);
process.env.GIT_AUTHOR_NAME = 'VerdictProbe';
process.env.GIT_AUTHOR_EMAIL = 'verdictprobe@example.invalid';
process.env.GIT_COMMITTER_NAME = 'VerdictProbe';
process.env.GIT_COMMITTER_EMAIL = 'verdictprobe@example.invalid';
const GIT_ENV = { ...process.env };

// Extract the node -e argument from a snippet. The generated script never
// contains a double quote, backtick, or dollar sign, so the first double
// quote after `node -e "` is unambiguously the closing one.
function extractVerdict(snippet) {
  const m = /node -e "([^"]*)"/s.exec(snippet);
  assert.ok(m, 'snippet embeds a node -e verdict script');
  return m[1];
}
async function git(dir, ...args) {
  return (await execFileAsync('git', ['-C', dir, ...args], { env: GIT_ENV })).stdout.trim();
}
async function runVerdict(dir, script) {
  try {
    await execFileAsync(process.execPath, ['-e', script], { cwd: dir });
    return 0;
  } catch (e) { return e.code; }
}
function gateEvidence({ status, level, headSha, baseSha, kind = 'vcp-mechanical-gate', policyVersion = 'phase7-execution-1', postflight = true }) {
  const out = {
    kind, policyVersion, status,
    preflight: { changes: { requiredLevel: level }, headSha, baseSha },
  };
  if (postflight) out.postflight = { headSha, baseSha };
  return out;
}
async function writeEvidence(dir, value) {
  const target = path.join(dir, 'vcp-gate.json');
  await rm(target, { recursive: true, force: true });
  if (value === 'MISSING') return;
  if (value === 'DIRECTORY') { await mkdir(target, { recursive: true }); return; }
  await writeFile(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8');
}

const PROVIDERS = ['github', 'gitlab', 'circleci', 'azure'];

test('verdict script survives shell quoting: no double quotes, backticks, dollars, or comments', () => {
  for (const provider of PROVIDERS) {
    for (const allow of [true, false]) {
      const script = extractVerdict(renderSnippet(provider, { jobName: 'vcp-gate', mode: 'GATE_RUN', allowL0CheckPass: allow }));
      assert.ok(!script.includes('"'), `${provider} allow=${allow}: no double quotes`);
      assert.ok(!script.includes('`'), `${provider} allow=${allow}: no backticks`);
      assert.ok(!script.includes('$'), `${provider} allow=${allow}: no dollar signs`);
      assert.ok(!script.includes('//'), `${provider} allow=${allow}: no line comments`);
      assert.ok(script.includes('vcp-mechanical-gate'), `${provider} allow=${allow}: kind check present`);
    }
  }
});

for (const provider of PROVIDERS) {
  test(`verdict execution matrix: ${provider}`, async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-verdict-'));
    try {
      await git(dir, 'init', '-q');
      await writeFile(path.join(dir, 'README.md'), 'hi\n', 'utf8');
      await git(dir, 'add', '.');
      await git(dir, 'commit', '-qm', 'base');
      const head = await git(dir, 'rev-parse', 'HEAD');
      const base = 'a'.repeat(40);
      const stale = '0'.repeat(40);
      const cases = [
        // [label, allow, evidence, expectedExit]
        ['L0 fresh passes when allowed', true, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: head, baseSha: base }), 0],
        ['L0 fresh BLOCKS when L0 passing disabled (HIGH regression)', false, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: head, baseSha: base }), 1],
        ['L0 stale BLOCKS when allowed', true, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: stale, baseSha: base }), 1],
        ['L0 stale BLOCKS when disabled', false, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: stale, baseSha: base }), 1],
        ['L2 evidence-only BLOCKS when allowed', true, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L2', headSha: head, baseSha: base }), 1],
        ['L2 evidence-only BLOCKS when disabled', false, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L2', headSha: head, baseSha: base }), 1],
        ['BLOCKED BLOCKS when allowed', true, gateEvidence({ status: 'BLOCKED', level: 'L0', headSha: head, baseSha: base }), 1],
        ['BLOCKED BLOCKS when disabled', false, gateEvidence({ status: 'BLOCKED', level: 'L0', headSha: head, baseSha: base }), 1],
        ['PREVIEW_ONLY BLOCKS', true, gateEvidence({ status: 'PREVIEW_ONLY', level: 'L0', headSha: head, baseSha: base }), 1],
        ['forged APPROVED BLOCKS', true, gateEvidence({ status: 'APPROVED', level: 'L0', headSha: head, baseSha: base }), 1],
        ['forged PASS BLOCKS', true, gateEvidence({ status: 'PASS', level: 'L0', headSha: head, baseSha: base }), 1],
        ['non-string status BLOCKS', true, gateEvidence({ status: 0, level: 'L0', headSha: head, baseSha: base }), 1],
        ['wrong kind BLOCKS', true, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: head, baseSha: base, kind: 'vcp-something-else' }), 1],
        ['wrong policy version BLOCKS', true, gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: head, baseSha: base, policyVersion: 'phase6' }), 1],
        ['L0 evidence with no recorded head BLOCKS', true, { kind: 'vcp-mechanical-gate', policyVersion: 'phase7-execution-1', status: 'EVIDENCE_ONLY_NOT_APPROVED', preflight: { changes: { requiredLevel: 'L0' } }, postflight: null }, 1],
        ['missing evidence BLOCKS', true, 'MISSING', 1],
        ['missing evidence BLOCKS when disabled', false, 'MISSING', 1],
        ['malformed evidence BLOCKS', true, '{not json', 1],
        ['malformed evidence BLOCKS when disabled', false, '{not json', 1],
        ['directory as evidence file (unreadable) BLOCKS', true, 'DIRECTORY', 1],
      ];
      for (const [label, allow, evidence, expected] of cases) {
        const script = extractVerdict(renderSnippet(provider, { jobName: 'vcp-gate', mode: 'GATE_RUN', allowL0CheckPass: allow }));
        await writeEvidence(dir, evidence);
        const code = await runVerdict(dir, script);
        assert.equal(code, expected, `${provider} allow=${allow}: ${label} (got ${code}, want ${expected})`);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('verdict survives YAML folding (newlines folded to spaces)', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-verdict-'));
  try {
    await git(dir, 'init', '-q');
    await writeFile(path.join(dir, 'README.md'), 'hi\n', 'utf8');
    await git(dir, 'add', '.');
    await git(dir, 'commit', '-qm', 'base');
    const head = await git(dir, 'rev-parse', 'HEAD');
    const evidence = gateEvidence({ status: 'EVIDENCE_ONLY_NOT_APPROVED', level: 'L0', headSha: head, baseSha: 'a'.repeat(40) });
    await writeEvidence(dir, evidence);
    for (const allow of [true, false]) {
      const script = extractVerdict(renderSnippet('github', { jobName: 'vcp-gate', mode: 'GATE_RUN', allowL0CheckPass: allow }));
      const folded = script.split('\n').join(' ');
      assert.equal(await runVerdict(dir, folded), allow ? 0 : 1, `folded script allow=${allow}`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('real gate output drives the verdict: fresh passes, post-commit evidence goes stale', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-verdict-'));
  try {
    await git(root, 'init', '-q');
    await seedLegacyV1Fixture({ targetDir: root, agent: 'generic', stack: 'generic', includeGitHub: false });
    const agentsPath = path.join(root, 'AGENTS.md');
    const agentsText = await readFile(agentsPath, 'utf8');
    await writeFile(agentsPath, agentsText.replace('UNIT_TEST_COMMAND=<define>', 'UNIT_TEST_COMMAND=node -e "process.exit(0)"'), 'utf8');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'base');
    const base = await git(root, 'rev-parse', 'HEAD');
    await writeFile(path.join(root, 'README.md'), 'Changed\n', 'utf8');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'change');
    const report = await runMechanicalGate({ targetDir: root, task: null, baseRef: base, run: true });
    assert.equal(report.status, 'EVIDENCE_ONLY_NOT_APPROVED');
    assert.equal(report.preflight.changes.requiredLevel, 'L0');
    await writeFile(path.join(root, 'vcp-gate.json'), JSON.stringify(report, null, 2), 'utf8');
    const allowScript = extractVerdict(renderSnippet('github', { jobName: 'vcp-gate', mode: 'L0_ATTEMPT', allowL0CheckPass: true }));
    const denyScript = extractVerdict(renderSnippet('github', { jobName: 'vcp-gate', mode: 'L0_ATTEMPT', allowL0CheckPass: false }));
    assert.equal(await runVerdict(root, allowScript), 0, 'real L0 gate output passes when allowed');
    assert.equal(await runVerdict(root, denyScript), 1, 'real L0 gate output blocks when disabled');
    // A later commit makes the same evidence stale: the verdict must refuse it.
    await writeFile(path.join(root, 'README.md'), 'Changed again\n', 'utf8');
    await git(root, 'add', '.');
    await git(root, 'commit', '-qm', 'later');
    assert.equal(await runVerdict(root, allowScript), 1, 'stale real gate output blocks even when allowed');
  } finally { await rm(root, { recursive: true, force: true }); }
});
