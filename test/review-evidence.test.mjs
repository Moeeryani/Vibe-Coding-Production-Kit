import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createContextPack } from '../lib/context.mjs';
import { renderTaskPack } from '../lib/task.mjs';

const repoRoot = path.resolve('.');

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-review-evidence-'));
}

test('generated Task Packs provide a bounded durable review-evidence contract', () => {
  const task = renderTaskPack({ slug: 'durable-review', title: 'Durable review', commands: [] });

  assert.match(task, /## Independent review evidence/);
  assert.match(task, /\| Class \| Disposition \| Finding \/ evidence \| Resolution \/ follow-up \| Residual risk \|/);
  assert.match(task, /`BLOCKER`/);
  assert.match(task, /`DEFECT`/);
  assert.match(task, /`RISK`/);
  assert.match(task, /`FOLLOW-UP`/);
  assert.match(task, /`NO ACTION`/);
  assert.match(task, /must fix in this task/);
  assert.match(task, /follow-up candidate/);
  assert.match(task, /Do not copy the full review transcript/);
  assert.match(task, /Independent review evidence updated:/);
});

test('fresh review context reconstructs persisted findings without prior reviewer chat', async () => {
  const target = await tempDir();
  await mkdir(path.join(target, 'prompts'), { recursive: true });
  await mkdir(path.join(target, 'docs', 'tasks'), { recursive: true });
  await mkdir(path.join(target, 'docs', 'product'), { recursive: true });

  const reviewPrompt = await readFile(path.join(repoRoot, 'prompts', '04-code-review.md'), 'utf8');
  await writeFile(path.join(target, 'prompts', '04-code-review.md'), reviewPrompt, 'utf8');
  await writeFile(path.join(target, 'AGENTS.md'), '# Agent instructions\n\nUse repository evidence.\n', 'utf8');
  await writeFile(path.join(target, 'docs', 'product', 'PRD.md'), '# PRD\n\nAccepted behavior for durable review evidence.\n', 'utf8');

  const task = `# Task — Durable review evidence\n\nStatus: Review\nSlug: \`durable-review\`\n\n## Source of truth\n\n| Source | Reference |\n|---|---|\n| Product / PRD | \`docs/product/PRD.md\` |\n\n## Independent review evidence\n\n| Class | Disposition | Finding / evidence | Resolution / follow-up | Residual risk |\n|---|---|---|---|---|\n| DEFECT | must fix in this task | Review evidence was missing from durable task state | Added bounded evidence table and restartability coverage | none known |\n| FOLLOW-UP | follow-up candidate | Service-level accept-vs-revoke race needs dedicated coverage | #27 | remains until #27 is completed |\n| NO ACTION | n/a | Checked scope, security boundaries, and compatibility; no additional action required | summarized review check | none known |\n\n## Completion report\n\n- What changed and why: persist material review outcomes.\n- Verification actually run: targeted test + full validation.\n- Independent review evidence updated: yes.\n- Migration/operational impact: none.\n- Remaining risks/limitations: #27.\n`;
  await writeFile(path.join(target, 'docs', 'tasks', 'durable-review.md'), task, 'utf8');

  const result = await createContextPack({ targetDir: target, task: 'durable-review', mode: 'review' });

  assert.match(result.content, /# VCP Context Pack — review/);
  assert.match(result.content, /DEFECT \| must fix in this task \| Review evidence was missing from durable task state/);
  assert.match(result.content, /FOLLOW-UP \| follow-up candidate \| Service-level accept-vs-revoke race needs dedicated coverage \| #27/);
  assert.match(result.content, /NO ACTION \| n\/a \| Checked scope, security boundaries, and compatibility/);
  assert.match(result.content, /docs\/tasks\/durable-review\.md/);
  assert.match(result.content, /docs\/product\/PRD\.md/);
  assert.match(result.content, /prompts\/04-code-review\.md/);
  assert.match(result.content, /A fresh continuation agent must be able to reconstruct what was found/);
});
