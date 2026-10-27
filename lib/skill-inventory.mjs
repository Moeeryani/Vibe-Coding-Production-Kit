// Phase 9: skill inventory and conformance. Skills ship inside the package
// (package.json "files" includes "skills/"); there is no separate installer
// and no skill execution engine. This module enumerates what shipped and
// pins the Phase 9 design rules:
//   - the router (skills/vcp/SKILL.md) is the default entry point and the
//     ONE place authorization boundaries are stated;
//   - specialized skills are thin, route to existing CLI commands and
//     canonical prompts, reference the router, and never restate policy;
//   - Task Packs hold project-specific durable change state; skills supply
//     reusable workflow guidance and must never be mistaken for Task Packs.
// PURE file reads: no command execution, no writes.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EXPECTED_SPECIALIZED_SKILLS = Object.freeze([
  'vcp-discover', 'vcp-plan', 'vcp-implement', 'vcp-review',
  'vcp-security-review', 'vcp-retro', 'vcp-release',
]);

// CLI commands that exist in this tree (from the CLI dispatch + help text).
// A skill routing to a command outside this set is routing to fiction.
export const KNOWN_CLI_COMMANDS = Object.freeze([
  'init', 'manage', 'doctor', 'task', 'ready', 'verify', 'context',
  'workflow-preview', 'workflow', 'gate', 'gate-preview', 'ci-plan', 'capabilities',
  'profiles-preview', 'capability-plan', 'ci-gate-plan', 'asset-plan',
  'inspect', 'release-check', 'update', 'rollback', 'plugins',
  'recovery-plan', 'prompt-eval', 'fitness', 'review-evidence', 'skills',
]);

const MAX_SKILL_LINES = 100;
const POLICY_LITERALS = ['D-01', 'G-FENCE'];

function fail(code) { const e = new Error(code); e.code = code; throw e; }

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z]+):[ \t]*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

async function readSkillFile(root, relative) {
  return readFile(path.join(root, ...relative.split('/')), 'utf8');
}

export async function listSkills(root = packageRoot) {
  const skillsDir = path.join(root, 'skills');
  let entries;
  try { entries = await readdir(skillsDir, { withFileTypes: true }); }
  catch { fail('E_SKILL_INVENTORY'); }
  const skills = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const relative = `skills/${entry.name}/SKILL.md`;
    let text;
    try { text = await readSkillFile(root, relative); }
    catch { continue; }
    const frontmatter = parseFrontmatter(text);
    const commands = [...new Set([...text.matchAll(/`vcp ([a-z0-9-]+)/g)].map((m) => m[1]))].sort();
    const prompts = [...new Set([...text.matchAll(/prompts\/([0-9]{2}-[a-z-]+\.md)/g)].map((m) => m[1]))].sort();
    const references = [...new Set([...text.matchAll(/skills\/vcp\/references\/([a-z-]+\.md)/g)].map((m) => m[1]))].sort();
    skills.push(Object.freeze({
      id: entry.name, path: relative, name: frontmatter.name ?? null,
      description: frontmatter.description ?? null,
      lines: text.split('\n').length, commands: Object.freeze(commands),
      prompts: Object.freeze(prompts), references: Object.freeze(references),
      text,
    }));
  }
  const referenceFiles = [];
  try {
    const refDir = await readdir(path.join(root, 'skills', 'vcp', 'references'));
    referenceFiles.push(...refDir.filter((f) => f.endsWith('.md')).sort());
  } catch { /* no references dir: validated below */ }
  return Object.freeze({ root, skills: Object.freeze(skills), references: Object.freeze(referenceFiles) });
}

export async function validateSkillInventory(root = packageRoot) {
  const inventory = await listSkills(root);
  const problems = [];
  const byId = new Map(inventory.skills.map((s) => [s.id, s]));
  if (!byId.has('vcp')) problems.push('missing router skill: skills/vcp/SKILL.md');
  for (const id of EXPECTED_SPECIALIZED_SKILLS) {
    if (!byId.has(id)) problems.push(`missing specialized skill: skills/${id}/SKILL.md`);
  }
  for (const skill of inventory.skills) {
    if (!skill.name) problems.push(`${skill.path}: missing frontmatter name`);
    if (!skill.description) problems.push(`${skill.path}: missing frontmatter description`);
    if (skill.lines > MAX_SKILL_LINES) problems.push(`${skill.path}: ${skill.lines} lines exceeds thin-skill budget ${MAX_SKILL_LINES}`);
    for (const command of skill.commands) {
      if (!KNOWN_CLI_COMMANDS.includes(command)) problems.push(`${skill.path}: routes to unknown CLI command 'vcp ${command}'`);
    }
    for (const prompt of skill.prompts) {
      try { await readSkillFile(root, `prompts/${prompt}`); }
      catch { problems.push(`${skill.path}: routes to missing canonical prompt 'prompts/${prompt}'`); }
    }
    for (const reference of skill.references) {
      if (!inventory.references.includes(reference)) problems.push(`${skill.path}: routes to missing reference 'skills/vcp/references/${reference}'`);
    }
    if (skill.id !== 'vcp') {
      if (!skill.commands.length) problems.push(`${skill.path}: routes to no CLI command`);
      if (!/skills\/vcp\/SKILL\.md|vcp router skill/.test(skill.text)) problems.push(`${skill.path}: does not reference the router skill`);
      for (const literal of POLICY_LITERALS) {
        if (skill.text.includes(literal)) problems.push(`${skill.path}: restates policy literal '${literal}' instead of referencing the router`);
      }
      if (!/Task Packs/.test(skill.text) || !/never in this skill|mistaken for a Task Pack/.test(skill.text)) {
        problems.push(`${skill.path}: does not state the Task Pack / skill separation`);
      }
    }
  }
  if (problems.length) {
    const error = new Error(`Skill inventory invalid:\n- ${problems.join('\n- ')}`);
    error.code = 'E_SKILL_INVENTORY';
    error.problems = problems;
    throw error;
  }
  return inventory;
}
