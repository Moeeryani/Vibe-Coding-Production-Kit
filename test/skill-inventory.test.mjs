// Phase 9 skill inventory conformance: router + 7 specialized skills,
// thin files, real CLI/prompt/reference routes only, no policy restatement,
// Task Pack / skill separation stated in every specialized skill.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { listSkills, validateSkillInventory, EXPECTED_SPECIALIZED_SKILLS } from '../lib/skill-inventory.mjs';

test('inventory lists the router and all seven specialized skills', async () => {
  const inventory = await validateSkillInventory();
  const ids = inventory.skills.map((s) => s.id);
  assert.ok(ids.includes('vcp'), 'router missing');
  for (const id of EXPECTED_SPECIALIZED_SKILLS) assert.ok(ids.includes(id), `${id} missing`);
  assert.deepEqual(inventory.references, ['gate-levels.md', 'task-pack-anatomy.md']);
});

test('every skill is thin and carries name + description frontmatter', async () => {
  const inventory = await listSkills();
  for (const skill of inventory.skills) {
    assert.ok(skill.name, `${skill.path} name`);
    assert.ok(skill.description, `${skill.path} description`);
    assert.ok(skill.lines <= 100, `${skill.path} ${skill.lines} lines`);
  }
});

test('specialized skills route to real commands and prompts, never to fiction', async () => {
  const inventory = await listSkills();
  const byId = new Map(inventory.skills.map((s) => [s.id, s]));
  assert.deepEqual(byId.get('vcp-discover').prompts, ['01-discovery.md']);
  assert.deepEqual(byId.get('vcp-plan').prompts, ['02-plan-task.md']);
  assert.deepEqual(byId.get('vcp-implement').prompts, ['03-implement-task.md']);
  assert.deepEqual(byId.get('vcp-review').prompts, ['04-code-review.md']);
  assert.deepEqual(byId.get('vcp-security-review').prompts, ['05-security-review.md']);
  assert.deepEqual(byId.get('vcp-release').prompts, ['07-release-review.md']);
  assert.ok(byId.get('vcp-review').commands.includes('gate-preview'));
  assert.ok(byId.get('vcp-review').commands.includes('gate'));
  assert.ok(byId.get('vcp-security-review').commands.includes('context'));
  assert.ok(byId.get('vcp-release').commands.includes('release-check'));
  assert.ok(byId.get('vcp-retro').commands.includes('context'));
  // The router routes to the Phase 7/8 commands; it no longer claims gate
  // work is unimplemented or preview-only.
  const router = byId.get('vcp');
  assert.ok(router.commands.includes('gate-preview'));
  assert.ok(router.commands.includes('gate'));
  assert.ok(router.commands.includes('ci-gate-plan'));
  assert.ok(!router.text.includes('preview only in this foundation'));
});

test('package ships the whole skills tree (static files[] conformance)', async () => {
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));
  assert.ok(pkg.files.includes('skills/'), 'package.json files[] must include skills/');
  const inventory = await listSkills();
  for (const skill of inventory.skills) {
    assert.ok(skill.path.startsWith('skills/'), `${skill.path} ships via skills/`);
  }
  for (const reference of inventory.references) {
    assert.ok(reference.endsWith('.md'));
  }
});
