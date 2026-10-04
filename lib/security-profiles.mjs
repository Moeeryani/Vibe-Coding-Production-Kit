import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorityIssueForContext, parseSourceTruthAuthority } from './source-truth-authority.mjs';
import { assertPathInsideRoot } from './template.mjs';

export const SECURITY_PROFILE_CONFIG = 'docs/security/SECURITY-PROFILE.md';
export const SECURITY_PROFILE_ORDER = ['baseline', 'web-api', 'multi-tenant', 'sensitive-data', 'stateful-data'];

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = (name) => `docs/security/profiles/${name}.md`;

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function portableRelative(root, resolved) {
  return (path.relative(root, resolved) || '.').split(path.sep).join('/');
}

export function parseSecurityProfileDeclaration(content) {
  const match = /^## Active profiles\s*$/m.exec(content);
  if (!match) throw new Error(`${SECURITY_PROFILE_CONFIG} must contain a "## Active profiles" section.`);

  const rest = content.slice(match.index + match[0].length);
  const next = rest.search(/^## /m);
  const section = next === -1 ? rest : rest.slice(0, next);
  const selected = [];
  for (const raw of section.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('-')) continue;
    const item = /^-\s+`?([a-z0-9-]+)`?\s*$/.exec(line);
    if (!item) throw new Error(`Invalid security profile entry: ${line}`);
    selected.push(item[1]);
  }

  const seen = new Set();
  for (const name of selected) {
    if (!SECURITY_PROFILE_ORDER.includes(name)) {
      throw new Error(`Unknown security profile "${name}". Choose from: ${SECURITY_PROFILE_ORDER.join(', ')}.`);
    }
    if (seen.has(name)) throw new Error(`Duplicate security profile "${name}" in ${SECURITY_PROFILE_CONFIG}.`);
    seen.add(name);
  }

  return ['baseline', ...selected.filter((name) => name !== 'baseline')];
}

function assertProfileDocument(name, relative, content) {
  const markers = [...content.matchAll(/^SECURITY-PROFILE:\s*([a-z0-9-]+)\s*$/gmi)];
  if (markers.length !== 1 || markers[0][1].toLowerCase() !== name) {
    throw new Error(`Security profile document ${relative} must declare exactly "SECURITY-PROFILE: ${name}".`);
  }
}

async function readProfileDocument(root, name) {
  const relative = profilePath(name);
  const local = path.join(root, ...relative.split('/'));
  await assertPathInsideRoot(root, relative, { allowMissing: true });
  if (await exists(local)) {
    await assertPathInsideRoot(root, relative, { allowMissing: false });
    const content = await readFile(local, 'utf8');
    assertProfileDocument(name, portableRelative(root, local), content);
    return { relative: portableRelative(root, local), content };
  }

  const builtIn = path.join(packageRoot, ...relative.split('/'));
  if (!(await exists(builtIn))) throw new Error(`Built-in security profile is missing: ${relative}`);
  const content = await readFile(builtIn, 'utf8');
  assertProfileDocument(name, `vcp:${relative}`, content);
  return {
    relative: `vcp:${relative}`,
    content
  };
}

export async function loadSecurityProfileContext(targetDir) {
  const root = path.resolve(targetDir);
  const configPath = path.join(root, ...SECURITY_PROFILE_CONFIG.split('/'));
  await assertPathInsideRoot(root, SECURITY_PROFILE_CONFIG, { allowMissing: true });
  let config = null;
  let active = ['baseline'];

  if (await exists(configPath)) {
    await assertPathInsideRoot(root, SECURITY_PROFILE_CONFIG, { allowMissing: false });
    const content = await readFile(configPath, 'utf8');
    const authority = parseSourceTruthAuthority(content);
    const authorityIssue = authorityIssueForContext(authority, 'security');
    if (authorityIssue) throw new Error(`Security profile declaration ${SECURITY_PROFILE_CONFIG}: ${authorityIssue}`);
    config = { relative: SECURITY_PROFILE_CONFIG, content };
    active = parseSecurityProfileDeclaration(content);
  }

  const profiles = [];
  for (const name of active) profiles.push({ name, ...(await readProfileDocument(root, name)) });

  return { config, active, profiles };
}
