import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeTemplateText } from '../lib/template.mjs';
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { formatReadinessReport, runTaskReadiness } from '../lib/readiness.mjs';
import { buildVerificationPlan } from '../lib/verify.mjs';

const execFileAsync = promisify(execFile);
const BACKSLASH = String.fromCharCode(92);

test('published shell entrypoint is LF-only and has a portable shebang', async () => {
  const shell = await readFile(path.resolve('scripts/validate-framework.sh'));
  assert.equal(shell.includes(13), false);
  assert.match(shell.toString('utf8'), /^#!\/usr\/bin\/env bash\n/);
});

test('template text normalization canonicalizes CRLF before hashing or installation', () => {
  assert.equal(normalizeTemplateText('alpha\r\nbeta\r\n'), 'alpha\nbeta\n');
  assert.equal(normalizeTemplateText('alpha\rbeta\r'), 'alpha\nbeta\n');
});

test('repository attributes force text files to LF checkouts', async () => {
  const attributes = await readFile(path.resolve('.gitattributes'), 'utf8');
  assert.match(attributes, /^\* text=auto eol=lf/m);
});

test('task creation reports a portable repository-relative path', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-portable-task-'));
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });

  const result = await createTaskPack({ targetDir: target, slug: 'portable-display', title: 'Portable display' });
  assert.equal(result.relative, 'docs/tasks/portable-display.md');
  assert.ok(!result.relative.includes(BACKSLASH), `expected no backslash, got: ${result.relative}`);
  assert.ok(await stat(path.join(target, 'docs', 'tasks', 'portable-display.md')));
});

test('readiness and verification reports expose slash-separated task paths', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-portable-report-'));
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'report-path', title: 'Report path' });

  const report = await runTaskReadiness({ targetDir: target, task: 'report-path', stage: 'plan' });
  assert.equal(report.task, 'docs/tasks/report-path.md');
  const rendered = formatReadinessReport(report);
  assert.ok(rendered.includes('Task: docs/tasks/report-path.md'), rendered.slice(0, 200));
  assert.ok(!rendered.includes(BACKSLASH), `ready output leaked a separator: ${rendered.slice(0, 200)}`);

  await assert.rejects(buildVerificationPlan({ targetDir: target, task: 'absent-task' }), /Task file not found: docs\/tasks\/absent-task\.md/);
});

test('task and ready CLIs print slash-separated paths on every host OS', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-portable-cli-'));
  const bin = path.resolve('bin/vibe-coding-production.mjs');
  await initProject({targetDir:target,agent:'generic',stack:'generic',includeGitHub:true});

  const created = await execFileAsync(process.execPath, [bin, 'task', 'demo', '--title', 'Demo', '--dir', target]);
  assert.match(created.stdout, /Created task pack: docs\/tasks\/demo\.md/);
  assert.ok(!created.stdout.includes(BACKSLASH), created.stdout);

  let ready = '';
  try {
    ready = (await execFileAsync(process.execPath, [bin, 'ready', 'demo', '--dir', target])).stdout;
  } catch (error) {
    ready = error.stdout ?? '';
  }
  assert.match(ready, /Task: docs\/tasks\/demo\.md/);
  assert.ok(!ready.includes(BACKSLASH), ready.slice(0, 300));
});
