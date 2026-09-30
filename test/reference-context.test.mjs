import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');
const exampleRoot = path.join(repoRoot, 'examples', 'reference-saas-invite');
const bin = path.join(repoRoot, 'bin', 'vibe-coding-production.mjs');
const promptNames = [
  '01-discovery.md',
  '02-plan-task.md',
  '03-implement-task.md',
  '04-code-review.md',
  '05-security-review.md',
  '06-refactor.md',
  '07-release-review.md'
];

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-reference-context-'));
}

async function copyReferenceFixture() {
  const parent = await tempDir();
  const target = path.join(parent, 'reference-saas-invite');
  await cp(exampleRoot, target, { recursive: true });
  return target;
}

async function runContext(target, mode) {
  return execFileAsync(process.execPath, [
    bin,
    'context',
    'accept-invite',
    '--dir',
    target,
    '--mode',
    mode
  ], { cwd: repoRoot });
}

test('reference SaaS prompt snapshots stay identical to canonical prompts', async () => {
  for (const name of promptNames) {
    const canonical = await readFile(path.join(repoRoot, 'prompts', name), 'utf8');
    const snapshot = await readFile(path.join(exampleRoot, 'prompts', name), 'utf8');
    assert.equal(snapshot, canonical, `${name} drifted from the canonical prompt`);
  }
});

test('reference SaaS builds plan, implement, and review context from its checked-in canonical Task Pack', async () => {
  const target = await copyReferenceFixture();

  const expectedPrompts = new Map([
    ['plan', 'prompts/02-plan-task.md'],
    ['implement', 'prompts/03-implement-task.md'],
    ['review', 'prompts/04-code-review.md']
  ]);

  for (const [mode, expectedPrompt] of expectedPrompts) {
    const { stdout, stderr } = await runContext(target, mode);
    assert.equal(stderr, '');
    assert.match(stdout, new RegExp(`# VCP Context Pack — ${mode}`));
    assert.match(stdout, new RegExp(expectedPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(stdout, /docs\/tasks\/accept-invite\.md/);
    assert.match(stdout, /docs\/product\/PRD\.md/);
    assert.match(stdout, /docs\/security\/THREAT-MODEL\.md/);
    assert.doesNotMatch(stdout, /Context file not found/);
  }
});
