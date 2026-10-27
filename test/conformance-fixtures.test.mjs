// Phase 10 cross-batch composition fixtures: the Batch A-D/E pieces must
// agree on one disposable project, and read-only tools must work on an
// unadopted (brownfield) project without writing state.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedLegacyV1Fixture } from './helpers/legacy-v1-fixture.mjs';
import { runGatePreview } from '../lib/gate-preview.mjs';
import { inspectProjectCI } from '../lib/ci-inspection.mjs';
import { validateSkillInventory } from '../lib/skill-inventory.mjs';

const execFileAsync = promisify(execFile);
const BIN = path.resolve('bin/vibe-coding-production.mjs');
async function runCli(args) {
  return execFileAsync(process.execPath, [BIN, ...args]);
}
async function git(dir, ...args) {
  return execFileAsync('git', ['-C', dir, ...args]);
}
async function initRepo(dir) {
  await git(dir, 'init', '-q');
  // Repo-local identity only: fixtures must not depend on (or mutate) global config.
  await git(dir, 'config', 'user.email', 'conformance-fixture@localhost');
  await git(dir, 'config', 'user.name', 'Conformance Fixture');
}

test('fresh project composes: capability-plan, gate-preview, ci-gate-plan, skill inventory', async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'vcp-conformance-'));
  const project = path.join(sandbox, 'project');
  await mkdir(project, { recursive: true });
  try {
    await seedLegacyV1Fixture({ targetDir: project });
    await initRepo(project);
    await git(project, 'add', '-A');
    await git(project, 'commit', '-qm', 'base');
    const base = (await git(project, 'rev-parse', 'HEAD')).stdout.trim();
    await writeFile(path.join(project, 'docs', 'notes.md'), '# Notes\n\nFresh-project note.\n');
    await git(project, 'add', '-A');
    await git(project, 'commit', '-qm', 'docs only');
    const head = (await git(project, 'rev-parse', 'HEAD')).stdout.trim();

    const plan = JSON.parse((await runCli(['capability-plan', project, '--json'])).stdout);
    assert.ok(plan.applicationProvenance, 'capability-plan must carry a provenance preview, not NOT_AVAILABLE');
    assert.equal(plan.applicationProvenance.persistedApplication, false);
    assert.equal(plan.applicationProvenance.ownerApproval, 'NOT_ESTABLISHED');

    const preview = await runGatePreview({ targetDir: project, baseRef: base, headRef: head });
    assert.equal(preview.decision.level, 'L0');
    assert.equal(preview.decision.status, 'PREVIEW_READY');
    assert.equal(preview.mergeApproved, false);

    const ci = JSON.parse((await runCli(['ci-gate-plan', project, '--provider', 'gitlab', '--base-sha', base, '--head-sha', head, '--json'])).stdout);
    assert.equal(ci.mode, 'L0_ATTEMPT');
    assert.equal(ci.enforcement.providerEnforced, false);
    assert.ok(ci.snippet.text.includes('vcp-gate'));

    const inventory = await validateSkillInventory();
    assert.ok(inventory.skills.length >= 8, 'router + 7 specialized skills');
  } finally { await rm(sandbox, { recursive: true, force: true }); }
});

test('brownfield project: read-only tools work without writing VCP state', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vcp-brownfield-'));
  try {
    await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'brownfield', scripts: { test: 'node --test' } }));
    await mkdir(path.join(dir, 'src'), { recursive: true });
    await writeFile(path.join(dir, 'src', 'index.js'), 'export const x = 1;\n');
    await initRepo(dir);
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-qm', 'brownfield base');

    const inspection = await inspectProjectCI(dir);
    assert.equal(inspection.providerStatus, 'not-detected', 'no CI system must be honestly reported, not invented');

    const plan = JSON.parse((await runCli(['capability-plan', dir, '--json'])).stdout);
    assert.ok(plan.applicationProvenance, 'provenance preview must exist even pre-adoption');
    assert.equal(plan.applicationProvenance.persistedApplication, false);

    const after = await readdir(dir);
    assert.ok(!after.includes('.vcp'), 'read-only tools must not adopt the project as a side effect');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
