// Batch D: Skills discovery and installation. Plans never write; installs
// never overwrite user-owned files without --replace (which backs up);
// the router is always installed; Task Packs are never touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SKILL_PACKAGE_ROOT, applySkillInstall, describeSkills, detectSkillEnvironments,
  planSkillInstall, skillInstallStatus,
} from '../lib/skill-install.mjs';

const BIN = path.resolve('bin/vibe-coding-production.mjs');

async function exists(p) {
  try { await lstat(p); return true; } catch { return false; }
}
function runCli(args, { cwd = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end();
  });
}

test('describeSkills lists the router first with purposes and relevance', async () => {
  const skills = await describeSkills(SKILL_PACKAGE_ROOT);
  assert.equal(skills.length, 8);
  assert.equal(skills[0].id, 'vcp');
  assert.equal(skills[0].isRouter, true);
  assert.match(skills[0].description, /Route a coding task/);
  for (const skill of skills) {
    assert.ok(skill.description, skill.id);
    assert.ok(skill.relevance?.when, skill.id);
    assert.ok(skill.commands.length > 0 || skill.isRouter, skill.id);
  }
  const review = skills.find((s) => s.id === 'vcp-review');
  assert.equal(review.relevance.phase, 'review');
});

test('plan on an empty target installs everything and writes nothing', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const plan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    assert.equal(plan.actions.length, 8);
    assert.ok(plan.actions.every((a) => a.action === 'INSTALL'));
    assert.equal(plan.canApply, true);
    assert.equal(await exists(path.join(project, '.claude')), false, 'planning must not write');
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('apply installs byte-identical copies plus a manifest; second plan is a no-op', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const plan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    const receipt = await applySkillInstall(plan, { packageRoot: SKILL_PACKAGE_ROOT });
    assert.equal(receipt.installed.length, 8);
    assert.deepEqual(receipt.backedUp, []);
    const installed = await readFile(path.join(project, '.claude', 'skills', 'vcp', 'SKILL.md'), 'utf8');
    const source = await readFile(path.join(SKILL_PACKAGE_ROOT, 'skills', 'vcp', 'SKILL.md'), 'utf8');
    assert.equal(installed, source, 'installed copy must be byte-identical');
    const reference = await readFile(path.join(project, '.claude', 'skills', 'vcp', 'references', 'gate-levels.md'), 'utf8');
    assert.ok(reference.length > 0, 'router references ship with the router');
    const manifest = JSON.parse(await readFile(path.join(project, '.claude', 'skills', '.vcp-skills.json'), 'utf8'));
    assert.equal(manifest.skills.vcp.files['SKILL.md'].length, 64);

    const again = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    assert.ok(again.actions.every((a) => a.action === 'UP_TO_DATE'));
    const status = await skillInstallStatus({ packageRoot: SKILL_PACKAGE_ROOT, projectDir: project });
    const entry = status.find((e) => e.target === 'claude' && e.scope === 'project');
    assert.equal(entry.state, 'UP_TO_DATE');
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('partial install auto-includes the router; router-only install is allowed', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const plan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'generic', scope: 'project', projectDir: project, skillIds: ['vcp-plan'] });
    assert.equal(plan.routerAutoIncluded, true);
    assert.deepEqual(plan.actions.map((a) => a.skillId), ['vcp', 'vcp-plan']);
    const receipt = await applySkillInstall(plan, { packageRoot: SKILL_PACKAGE_ROOT });
    assert.deepEqual([...receipt.installed].sort(), ['vcp', 'vcp-plan']);
    const status = await skillInstallStatus({ packageRoot: SKILL_PACKAGE_ROOT, projectDir: project });
    assert.equal(status.find((e) => e.target === 'generic' && e.scope === 'project').state, 'PARTIAL');

    const routerOnly = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'copilot', scope: 'project', projectDir: project, skillIds: ['vcp'] });
    assert.deepEqual(routerOnly.actions.map((a) => a.skillId), ['vcp']);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('user-owned directories conflict; --replace backs them up and never deletes', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const owned = path.join(project, '.claude', 'skills', 'vcp');
    await mkdir(owned, { recursive: true });
    await writeFile(path.join(owned, 'SKILL.md'), '# My own skill\n', 'utf8');
    const plan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    assert.equal(plan.canApply, false);
    assert.ok(plan.conflicts.some((c) => c.skillId === 'vcp' && c.state === 'USER_OWNED'));
    await assert.rejects(applySkillInstall(plan, { packageRoot: SKILL_PACKAGE_ROOT }), /E_SKILL_PLAN/);
    assert.equal(await readFile(path.join(owned, 'SKILL.md'), 'utf8'), '# My own skill\n', 'refused install leaves user files alone');
    // A plan computed with --replace applied without it is a mismatch: refuse.
    const replacePlanEarly = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project, replace: true });
    await assert.rejects(applySkillInstall(replacePlanEarly, { packageRoot: SKILL_PACKAGE_ROOT, replace: false }), /E_SKILL_CONFLICT/);

    const replacePlan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project, replace: true });
    assert.equal(replacePlan.canApply, true);
    const receipt = await applySkillInstall(replacePlan, { packageRoot: SKILL_PACKAGE_ROOT, replace: true });
    assert.equal(receipt.backedUp.length, 1);
    assert.equal(await readFile(path.join(receipt.backedUp[0], 'SKILL.md'), 'utf8'), '# My own skill\n', 'backup preserves the user file');
    const installed = await readFile(path.join(owned, 'SKILL.md'), 'utf8');
    assert.notEqual(installed, '# My own skill\n');
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('user edits to an installed skill conflict; clean stale installs update', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const plan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    await applySkillInstall(plan, { packageRoot: SKILL_PACKAGE_ROOT });
    const skillFile = path.join(project, '.claude', 'skills', 'vcp-plan', 'SKILL.md');
    await writeFile(skillFile, (await readFile(skillFile, 'utf8')) + '\n<!-- my note -->\n', 'utf8');
    const edited = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    assert.ok(edited.conflicts.some((c) => c.skillId === 'vcp-plan' && c.state === 'USER_MODIFIED'));

    // Restore the file, then age the manifest: a clean stale install updates.
    const source = await readFile(path.join(SKILL_PACKAGE_ROOT, 'skills', 'vcp-plan', 'SKILL.md'), 'utf8');
    await writeFile(skillFile, source, 'utf8');
    const manifestPath = path.join(project, '.claude', 'skills', '.vcp-skills.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.packageVersion = '0.0.0-stale';
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const stale = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'claude', scope: 'project', projectDir: project });
    assert.ok(stale.actions.every((a) => a.action === 'UPDATE'));
    assert.equal(stale.canApply, true);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('install writes nothing under docs/ and copilot has no user scope', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const plan = await planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'copilot', scope: 'project', projectDir: project });
    await applySkillInstall(plan, { packageRoot: SKILL_PACKAGE_ROOT });
    assert.equal(await exists(path.join(project, 'docs')), false, 'no Task Pack area is touched');
    assert.deepEqual((await readdir(project)).sort(), ['.github']);
    await assert.rejects(
      planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'copilot', scope: 'user', projectDir: project, homeDir: project }),
      /E_SKILL_SCOPE/,
    );
    await assert.rejects(
      planSkillInstall({ packageRoot: SKILL_PACKAGE_ROOT, target: 'nope', scope: 'project', projectDir: project }),
      /E_SKILL_TARGET/,
    );
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('detection reports actually-present environments and flags cursor unsupported', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  const home = await mkdtemp(path.join(os.tmpdir(), 'vcp-home-'));
  try {
    await writeFile(path.join(project, 'CLAUDE.md'), '# Claude\n', 'utf8');
    await mkdir(path.join(project, '.github'), { recursive: true });
    await writeFile(path.join(project, '.github', 'copilot-instructions.md'), '# Copilot\n', 'utf8');
    await mkdir(path.join(project, '.cursor'), { recursive: true });
    await mkdir(path.join(home, '.claude', 'skills'), { recursive: true });
    const found = await detectSkillEnvironments({ projectDir: project, homeDir: home });
    const ids = found.map((f) => `${f.id}/${f.scope}`);
    assert.ok(ids.includes('claude/project'));
    assert.ok(ids.includes('copilot/project'));
    assert.ok(ids.includes('claude/user'));
    const cursor = found.find((f) => f.id === 'cursor');
    assert.equal(cursor.supported, false);
    assert.match(cursor.note, /generic target/);
    assert.ok(!found.some((f) => f.id === 'codex'), 'codex is not detected without a .codex signal');
  } finally {
    await rm(project, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
});

test('CLI: list, show, plan-only install, apply, and status', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const list = await runCli(['skills', 'list', '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(list.code, 0, list.stderr);
    const skills = JSON.parse(list.stdout);
    assert.equal(skills.length, 8);
    assert.equal(skills[0].id, 'vcp');

    const show = await runCli(['skills', 'show', 'vcp-review', '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(show.code, 0, show.stderr);
    assert.match(JSON.parse(show.stdout).description, /Review an implemented/);

    const plan = await runCli(['skills', 'install', '--target', 'claude', '--dir', project, '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(plan.code, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).actions.length, 8);
    assert.equal(await exists(path.join(project, '.claude')), false, 'plan-only install writes nothing');

    const applied = await runCli(['skills', 'install', '--target', 'claude', '--dir', project, '--apply', '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(applied.code, 0, applied.stderr);
    assert.equal(JSON.parse(applied.stdout).installed.length, 8);

    const status = await runCli(['skills', 'status', '--dir', project, '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(status.code, 0, status.stderr);
    const entry = JSON.parse(status.stdout).find((e) => e.target === 'claude' && e.scope === 'project');
    assert.equal(entry.state, 'UP_TO_DATE');

    const bad = await runCli(['skills', 'install', '--target', 'nope', '--dir', project], { cwd: SKILL_PACKAGE_ROOT });
    assert.notEqual(bad.code, 0);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test('CLI: conflict blocks apply; --replace backs up', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'vcp-skills-'));
  try {
    const owned = path.join(project, '.claude', 'skills', 'vcp');
    await mkdir(owned, { recursive: true });
    await writeFile(path.join(owned, 'SKILL.md'), '# Mine\n', 'utf8');
    const plan = await runCli(['skills', 'install', '--target', 'claude', '--dir', project, '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(plan.code, 1, 'conflicted plan exits non-zero');
    assert.ok(JSON.parse(plan.stdout).conflicts.length > 0);
    const blocked = await runCli(['skills', 'install', '--target', 'claude', '--dir', project, '--apply', '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.notEqual(blocked.code, 0);
    assert.equal(await readFile(path.join(owned, 'SKILL.md'), 'utf8'), '# Mine\n');
    const replaced = await runCli(['skills', 'install', '--target', 'claude', '--dir', project, '--apply', '--replace', '--json'], { cwd: SKILL_PACKAGE_ROOT });
    assert.equal(replaced.code, 0, replaced.stderr);
    assert.equal(JSON.parse(replaced.stdout).backedUp.length, 1);
  } finally { await rm(project, { recursive: true, force: true }); }
});
