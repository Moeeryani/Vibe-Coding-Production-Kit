// Batch D: Skills discoverability and installation (D-PC-03 follow-on).
//
// Skills ship inside the package (see lib/skill-inventory.mjs) but were not
// discoverable or installable by normal onboarding. This module adds the
// user-facing path: discover what shipped, inspect purposes, detect the
// agent environments actually present, and — only when explicitly requested
// with --apply — copy skills into an agent's skills directory.
//
// Targets are the layouts VCP could verify, one per agent; no universal
// directory is assumed:
//   claude  — project `.claude/skills`, personal `~/.claude/skills`
//   codex   — project `.agents/skills`, personal `~/.agents/skills`
//   copilot — project `.github/skills` only (no verified personal location)
//   generic — project `.agents/skills`, personal `~/.agents/skills`
//             (the shared Agent Skills location, for any compatible agent)
// Cursor has no VCP-verified dedicated skills directory: it is reported by
// detection as unsupported, and the generic target serves it. Codex and
// generic share `.agents/skills`; installing for either lands in the same
// place, which the plan states explicitly.
//
// Safety rules, all enforced here and tested:
//   - The router (`vcp`) is always installed: it is the default entry point
//     and the ONE place authorization boundaries are stated. A specialized
//     skill is never installed without it.
//   - Copies are byte-identical to the package, plus one manifest file
//     (`.vcp-skills.json`) recording package version and per-file digests,
//     so staleness and user edits are detectable. No duplicate policy copies:
//     specialized skills never restate policy (inventory-validated), and
//     installation never splits the set apart from the router.
//   - Existing user-owned files are never overwritten: a non-VCP-managed
//     directory, or a VCP-managed directory the user edited, is a CONFLICT.
//     Install refuses unless --replace is given, which moves the existing
//     directory to a timestamped backup first. Nothing is deleted.
//   - Task Packs are never touched: installation writes only under the
//     target skills directory (plus its manifest).
//   - Planning is separate from applying: planSkillInstall only reads;
//     applySkillInstall re-checks state before writing and refuses a stale
//     plan.
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkills, validateSkillInventory } from './skill-inventory.mjs';
import { getCliVersion } from './version.mjs';

export const SKILL_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const SKILL_TARGETS = Object.freeze([
  Object.freeze({ id: 'claude', name: 'Claude Code', projectDir: '.claude/skills', userDir: '.claude/skills' }),
  Object.freeze({ id: 'codex', name: 'OpenAI Codex', projectDir: '.agents/skills', userDir: '.agents/skills' }),
  Object.freeze({ id: 'copilot', name: 'GitHub Copilot', projectDir: '.github/skills', userDir: null }),
  Object.freeze({ id: 'generic', name: 'Agent Skills standard', projectDir: '.agents/skills', userDir: '.agents/skills' }),
]);

export const SKILL_RELEVANCE = Object.freeze({
  vcp: Object.freeze({ phase: 'all', when: 'Always installed first: the default entry point that routes every task and states the authorization boundaries.' }),
  'vcp-discover': Object.freeze({ phase: 'plan', when: 'Starting or adopting a project: clarify requirements and gather repository evidence before planning.' }),
  'vcp-plan': Object.freeze({ phase: 'plan', when: 'Turning clarified requirements into one bounded Task Pack.' }),
  'vcp-implement': Object.freeze({ phase: 'implement', when: 'Running an approved Task Pack through implementation readiness, context, and verification.' }),
  'vcp-review': Object.freeze({ phase: 'review', when: 'Reviewing an implemented Task Pack as evidence only.' }),
  'vcp-security-review': Object.freeze({ phase: 'review', when: 'Security-reviewing an implemented Task Pack with the security context and gate.' }),
  'vcp-retro': Object.freeze({ phase: 'review', when: 'Running a retrospective over a completed Task Pack from its own evidence.' }),
  'vcp-release': Object.freeze({ phase: 'release', when: 'Preparing a release from a reviewed Task Pack, as a separate human decision.' }),
});

export const SKILL_MANIFEST_FILE = '.vcp-skills.json';

function fail(code) { const e = new Error(code); e.code = code; throw e; }
function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }

export function skillTarget(id) {
  const target = SKILL_TARGETS.find((t) => t.id === id);
  if (!target) fail('E_SKILL_TARGET');
  return target;
}

export function skillsDirFor({ target, scope, projectDir, homeDir }) {
  const def = skillTarget(target);
  if (scope === 'project') return path.resolve(projectDir ?? '.', def.projectDir);
  if (scope === 'user') {
    if (!def.userDir) fail('E_SKILL_SCOPE');
    if (typeof homeDir !== 'string' || !homeDir) fail('E_SKILL_HOME');
    return path.resolve(homeDir, def.userDir);
  }
  fail('E_SKILL_SCOPE');
}

async function existsDir(dir) {
  try { return (await lstat(dir)).isDirectory(); } catch { return false; }
}
async function existsFile(file) {
  try { return (await lstat(file)).isFile(); } catch { return false; }
}

async function listFilesRecursive(dir, prefix = '') {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await listFilesRecursive(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

async function digestsFor(dir) {
  const digests = {};
  for (const rel of await listFilesRecursive(dir)) {
    digests[rel] = sha256(await readFile(path.join(dir, ...rel.split('/')), 'utf8'));
  }
  return digests;
}

// The state of one installed skill directory, from the manifest's point of
// view. `managed` means VCP installed it (manifest present); `current`
// means its files still match the manifest exactly.
async function inspectSkillDir({ skillsDir, skillId }) {
  const dir = path.join(skillsDir, skillId);
  if (!await existsDir(dir)) return { state: 'ABSENT', dir };
  const manifestPath = path.join(skillsDir, SKILL_MANIFEST_FILE);
  let manifest = null;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* no/invalid manifest: user-owned */ }
  if (!isObject(manifest) || !isObject(manifest.skills) || !isObject(manifest.skills[skillId])) {
    return { state: 'USER_OWNED', dir };
  }
  const current = await digestsFor(dir);
  const recorded = manifest.skills[skillId].files;
  const same = Object.keys(recorded).length === Object.keys(current).length &&
    Object.entries(recorded).every(([rel, digest]) => current[rel] === digest);
  if (same) return { state: 'MANAGED', dir, manifestVersion: manifest.packageVersion ?? null };
  return { state: 'USER_MODIFIED', dir, manifestVersion: manifest.packageVersion ?? null };
}

export async function describeSkills(packageRoot) {
  const inventory = await validateSkillInventory(packageRoot);
  return inventory.skills.map((skill) => Object.freeze({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    path: skill.path,
    lines: skill.lines,
    commands: skill.commands,
    prompts: skill.prompts,
    references: skill.references,
    relevance: SKILL_RELEVANCE[skill.id] ?? null,
    isRouter: skill.id === 'vcp',
  }));
}

export async function detectSkillEnvironments({ projectDir, homeDir = null } = {}) {
  const root = path.resolve(projectDir ?? '.');
  const checks = [
    { id: 'claude', scope: 'project', signals: ['.claude', 'CLAUDE.md'] },
    { id: 'codex', scope: 'project', signals: ['.codex'] },
    { id: 'copilot', scope: 'project', signals: ['.github/copilot-instructions.md', '.github/skills'] },
    { id: 'generic', scope: 'project', signals: ['AGENTS.md', '.agents'] },
    { id: 'cursor', scope: 'project', signals: ['.cursor'], supported: false },
  ];
  const found = [];
  for (const check of checks) {
    const present = [];
    for (const signal of check.signals) {
      if (await existsDir(path.join(root, signal)) || await existsFile(path.join(root, signal))) present.push(signal);
    }
    if (!present.length) continue;
    if (check.supported === false) {
      found.push(Object.freeze({
        id: 'cursor', name: 'Cursor', scope: 'project', detected: true, signals: present,
        supported: false,
        note: 'Cursor is detected but has no VCP-verified dedicated skills directory. Use the generic target (.agents/skills), which any Agent Skills-compatible agent reads.',
      }));
      continue;
    }
    const target = skillTarget(check.id);
    found.push(Object.freeze({
      id: check.id, name: target.name, scope: 'project', detected: true, signals: present,
      supported: true, skillsDir: path.join(root, target.projectDir),
      note: check.id === 'codex' || check.id === 'generic'
        ? 'Installs into .agents/skills, the shared Agent Skills location.'
        : null,
    }));
  }
  if (homeDir) {
    for (const target of SKILL_TARGETS) {
      if (!target.userDir) continue;
      const dir = path.join(homeDir, target.userDir);
      if (await existsDir(dir)) {
        found.push(Object.freeze({
          id: target.id, name: target.name, scope: 'user', detected: true,
          signals: [target.userDir], supported: true, skillsDir: dir, note: null,
        }));
      }
    }
  }
  return Object.freeze(found);
}

export async function planSkillInstall({
  packageRoot, target, scope = 'project', projectDir = '.', homeDir = null,
  skillIds = null, replace = false,
} = {}) {
  const def = skillTarget(target);
  const skillsDir = skillsDirFor({ target, scope, projectDir, homeDir });
  const inventory = await validateSkillInventory(packageRoot);
  const available = new Set(inventory.skills.map((s) => s.id));
  let requested = skillIds === null ? [...available] : [...new Set(skillIds)];
  for (const id of requested) if (!available.has(id)) fail('E_SKILL_UNKNOWN');
  const routerIncluded = requested.includes('vcp');
  if (!routerIncluded) requested = ['vcp', ...requested];
  const version = await getCliVersion();
  const actions = [];
  const conflicts = [];
  for (const skillId of requested) {
    const inspected = await inspectSkillDir({ skillsDir, skillId });
    const sourceDir = path.join(packageRoot, 'skills', skillId);
    const sourceDigests = await digestsFor(sourceDir);
    if (inspected.state === 'ABSENT') {
      actions.push({ skillId, action: 'INSTALL', reason: skillId === 'vcp' && !routerIncluded ? 'router-required' : 'not-installed', files: Object.keys(sourceDigests) });
    } else if (inspected.state === 'MANAGED' && inspected.manifestVersion === version) {
      actions.push({ skillId, action: 'UP_TO_DATE', reason: 'already-installed-current-version', files: Object.keys(sourceDigests) });
    } else if (inspected.state === 'MANAGED') {
      actions.push({ skillId, action: 'UPDATE', reason: `installed version ${inspected.manifestVersion ?? 'unknown'} differs from package ${version}; files unmodified since install`, files: Object.keys(sourceDigests) });
    } else {
      conflicts.push({ skillId, state: inspected.state, dir: inspected.dir, reason: 'existing directory is not a clean VCP install; use --replace to back it up first' });
      actions.push({ skillId, action: replace ? 'REPLACE' : 'CONFLICT', reason: 'existing user-owned or user-modified directory', files: Object.keys(sourceDigests) });
    }
  }
  const canApply = conflicts.length === 0 || replace;
  return Object.freeze({
    target: def.id, targetName: def.name, scope, skillsDir, packageVersion: version,
    routerAutoIncluded: !routerIncluded,
    actions: Object.freeze(actions), conflicts: Object.freeze(conflicts),
    canApply, replace,
    note: 'Plan only: nothing was written. Re-run with --apply to install. Existing user files are never overwritten without --replace (which backs them up first).',
  });
}

export async function applySkillInstall(plan, { packageRoot, replace = false } = {}) {
  if (!isObject(plan) || !plan.canApply) fail('E_SKILL_PLAN');
  if (plan.conflicts.length > 0 && !replace) fail('E_SKILL_CONFLICT');
  const toWrite = plan.actions.filter((a) => a.action === 'INSTALL' || a.action === 'UPDATE' || a.action === 'REPLACE');
  const backedUp = [];
  const written = [];
  // Re-check state immediately before writing: refuse a stale plan rather
  // than overwriting files that changed since planning.
  for (const action of toWrite) {
    const inspected = await inspectSkillDir({ skillsDir: plan.skillsDir, skillId: action.skillId });
    const expected = action.action === 'REPLACE' ? ['USER_OWNED', 'USER_MODIFIED'] : action.action === 'UPDATE' ? ['MANAGED'] : ['ABSENT'];
    if (!expected.includes(inspected.state)) fail('E_SKILL_PLAN_STALE');
  }
  for (const action of toWrite) {
    const dest = path.join(plan.skillsDir, action.skillId);
    if (action.action === 'REPLACE') {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = `${dest}.vcp-backup-${stamp}`;
      await rename(dest, backup);
      backedUp.push(backup);
    }
    const source = path.join(packageRoot, 'skills', action.skillId);
    await mkdir(plan.skillsDir, { recursive: true });
    if (action.action === 'UPDATE') await rm(dest, { recursive: true, force: true });
    await cp(source, dest, { recursive: true, force: true });
    written.push(action.skillId);
  }
  // Refresh the manifest from what is actually on disk after the writes.
  let manifest = { packageName: 'vibe-coding-production-kit', packageVersion: plan.packageVersion, skills: {} };
  try {
    const existing = JSON.parse(await readFile(path.join(plan.skillsDir, SKILL_MANIFEST_FILE), 'utf8'));
    if (isObject(existing) && isObject(existing.skills)) manifest.skills = existing.skills;
  } catch { /* fresh manifest */ }
  for (const skillId of plan.actions.map((a) => a.skillId)) {
    const dir = path.join(plan.skillsDir, skillId);
    if (await existsDir(dir)) manifest.skills[skillId] = { files: await digestsFor(dir) };
  }
  manifest.packageVersion = plan.packageVersion;
  manifest.updatedAt = new Date().toISOString();
  await writeFile(path.join(plan.skillsDir, SKILL_MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return Object.freeze({
    target: plan.target, scope: plan.scope, skillsDir: plan.skillsDir,
    installed: Object.freeze(written), backedUp: Object.freeze(backedUp),
    manifestPath: path.join(plan.skillsDir, SKILL_MANIFEST_FILE),
  });
}

export async function skillInstallStatus({ packageRoot, projectDir = '.', homeDir = null } = {}) {
  const inventory = await validateSkillInventory(packageRoot);
  const ids = inventory.skills.map((s) => s.id);
  const version = await getCliVersion();
  const entries = [];
  for (const target of SKILL_TARGETS) {
    for (const scope of ['project', 'user']) {
      if (scope === 'user' && !target.userDir) continue;
      let skillsDir;
      try { skillsDir = skillsDirFor({ target: target.id, scope, projectDir, homeDir }); }
      catch { continue; }
      const states = [];
      for (const skillId of ids) {
        const inspected = await inspectSkillDir({ skillsDir, skillId });
        states.push({ skillId, state: inspected.state, manifestVersion: inspected.manifestVersion ?? null });
      }
      const present = states.filter((s) => s.state !== 'ABSENT');
      const state = present.length === 0 ? 'NOT_INSTALLED'
        : present.length < states.length ? 'PARTIAL'
        : states.every((s) => s.state === 'MANAGED' && s.manifestVersion === version) ? 'UP_TO_DATE'
        : states.some((s) => s.state === 'USER_OWNED' || s.state === 'USER_MODIFIED') ? 'NEEDS_ATTENTION'
        : 'STALE';
      entries.push(Object.freeze({ target: target.id, targetName: target.name, scope, skillsDir, state, skills: Object.freeze(states) }));
    }
  }
  return Object.freeze(entries);
}
