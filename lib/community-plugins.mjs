import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import path from 'node:path';
import { compareVersions } from './migrations.mjs';
import { getCliVersion } from './version.mjs';
import { COMMAND_KEYS } from './verification-commands.mjs';
import { assertPathInsideRoot, normalizeManagedPath, normalizeTemplateText } from './template.mjs';

export const COMMUNITY_PLUGIN_CONFIG = 'docs/plugins/PLUGINS.json';
export const COMMUNITY_PLUGIN_SCHEMA_VERSION = 1;
export const COMMUNITY_PLUGIN_KIND = 'vcp-community-profile';
export const COMMUNITY_PLUGIN_CAPABILITIES = ['guidance', 'verification-proposals'];
export const COMMUNITY_PLUGIN_MODES = ['plan', 'implement', 'review', 'security', 'release'];

const MANIFEST_FILE = 'plugin.json';
const TEXT_EXTENSIONS = new Set(['.json', '.md']);

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function exists(file) {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label} contains unsupported key "${key}".`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string.`);
  if (value.includes('\0')) throw new Error(`${label} contains a NUL byte.`);
  return value.trim();
}

function assertIdentifier(value, label) {
  const text = assertString(value, label);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(text)) {
    throw new Error(`${label} must use lowercase letters, digits, dots, or hyphens.`);
  }
  return text;
}

function assertVersion(value, label) {
  const text = assertString(value, label);
  compareVersions(text, text);
  return text;
}

function assertDigest(value, label) {
  const text = assertString(value, label);
  if (text !== text.toLowerCase() || !/^sha256:[0-9a-f]{64}$/.test(text)) {
    throw new Error(`${label} must be sha256:<64 lowercase hex characters>.`);
  }
  return text;
}

function safeLocalRelative(value, label) {
  const text = assertString(value, label).replaceAll('\\', '/');
  if (/^[a-z]+:\/\//i.test(text) || /^[A-Za-z]:\//.test(text)) {
    throw new Error(`${label} must be a repository-relative local path.`);
  }
  return normalizeManagedPath(text);
}

function singleLine(value, label) {
  const text = assertString(value, label);
  if (/[\r\n]/.test(text)) throw new Error(`${label} must be a single line.`);
  return text;
}

function uniqueStrings(values, allowed, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const value = assertString(raw, label);
    if (!allowed.includes(value)) throw new Error(`${label} contains unsupported value "${value}".`);
    if (seen.has(value)) throw new Error(`${label} contains duplicate value "${value}".`);
    seen.add(value);
    result.push(value);
  }
  return result;
}

function safeBundleRelative(relative, label) {
  const clean = safeLocalRelative(relative, label);
  if (clean === MANIFEST_FILE) throw new Error(`${label} cannot point to ${MANIFEST_FILE}.`);
  const extension = path.posix.extname(clean).toLowerCase();
  if (extension !== '.md') throw new Error(`${label} must point to a Markdown guidance file.`);
  return clean;
}

function decodeUtf8(buffer, label) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new Error(`${label} is not valid UTF-8 text.`);
  }
  if (text.includes('\0')) throw new Error(`${label} contains a NUL byte.`);
  return normalizeTemplateText(text);
}

function parseJsonText(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function readJsonFile(file, label) {
  let buffer;
  try {
    buffer = await readFile(file);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`${label} not found.`);
    throw error;
  }
  return parseJsonText(decodeUtf8(buffer, label), label);
}

function validateSelectionConfig(value) {
  exactKeys(value, ['schemaVersion', 'plugins'], 'Community plugin declaration');
  if (value.schemaVersion !== COMMUNITY_PLUGIN_SCHEMA_VERSION) {
    throw new Error(`Unsupported community plugin declaration schemaVersion: ${value.schemaVersion}`);
  }
  if (!Array.isArray(value.plugins)) throw new Error('Community plugin declaration plugins must be an array.');
  const seenIds = new Set();
  const seenPaths = new Set();
  const plugins = value.plugins.map((raw, index) => {
    const label = `Community plugin selection ${index + 1}`;
    exactKeys(raw, ['id', 'version', 'path', 'sha256', 'grants'], label);
    const id = assertIdentifier(raw.id, `${label} id`);
    const version = assertVersion(raw.version, `${label} version`);
    const bundlePath = safeLocalRelative(raw.path, `${label} path`);
    const sha256 = assertDigest(raw.sha256, `${label} sha256`);
    const grants = uniqueStrings(raw.grants, COMMUNITY_PLUGIN_CAPABILITIES, `${label} grants`);
    if (seenIds.has(id)) throw new Error(`Duplicate community plugin id in declaration: ${id}`);
    const foldedPath = bundlePath.toLowerCase();
    if (seenPaths.has(foldedPath)) throw new Error(`Duplicate community plugin path in declaration: ${bundlePath}`);
    seenIds.add(id);
    seenPaths.add(foldedPath);
    return { id, version, path: bundlePath, sha256, grants };
  });
  return plugins.sort((a, b) => lexicalCompare(a.id, b.id));
}

function validateGuidance(raw, index) {
  const label = `Community plugin guidance ${index + 1}`;
  exactKeys(raw, ['path', 'modes', 'title'], label);
  return {
    path: safeBundleRelative(raw.path, `${label} path`),
    modes: uniqueStrings(raw.modes, COMMUNITY_PLUGIN_MODES, `${label} modes`),
    title: singleLine(raw.title, `${label} title`)
  };
}

function validateVerificationProposal(raw, index) {
  const label = `Community plugin verification proposal ${index + 1}`;
  exactKeys(raw, ['key', 'command', 'rationale'], label);
  const key = assertString(raw.key, `${label} key`);
  if (!COMMAND_KEYS.includes(key)) throw new Error(`${label} key is not a VCP verification command slot: ${key}`);
  const command = singleLine(raw.command, `${label} command`);
  if (/^n\/a(?:\s|$)/i.test(command) || /^<define/i.test(command)) {
    throw new Error(`${label} command must be a concrete proposal, not a placeholder/non-applicable marker.`);
  }
  return { key, command, rationale: singleLine(raw.rationale, `${label} rationale`) };
}

function validateManifest(value) {
  exactKeys(value, ['schemaVersion', 'kind', 'id', 'version', 'name', 'description', 'vcpCompatibility', 'capabilities', 'contributions'], 'Community plugin manifest');
  if (value.schemaVersion !== COMMUNITY_PLUGIN_SCHEMA_VERSION) {
    throw new Error(`Unsupported community plugin manifest schemaVersion: ${value.schemaVersion}`);
  }
  if (value.kind !== COMMUNITY_PLUGIN_KIND) throw new Error(`Community plugin manifest kind must be ${COMMUNITY_PLUGIN_KIND}.`);
  const id = assertIdentifier(value.id, 'Community plugin manifest id');
  const version = assertVersion(value.version, 'Community plugin manifest version');
  const name = singleLine(value.name, 'Community plugin manifest name');
  const description = singleLine(value.description, 'Community plugin manifest description');
  exactKeys(value.vcpCompatibility, ['minVersion', 'maxExclusiveVersion'], 'Community plugin vcpCompatibility');
  const minVersion = assertVersion(value.vcpCompatibility.minVersion, 'Community plugin minimum VCP version');
  const maxExclusiveVersion = assertVersion(value.vcpCompatibility.maxExclusiveVersion, 'Community plugin maximum exclusive VCP version');
  if (compareVersions(minVersion, maxExclusiveVersion) >= 0) throw new Error('Community plugin VCP compatibility range must be non-empty.');
  const capabilities = uniqueStrings(value.capabilities, COMMUNITY_PLUGIN_CAPABILITIES, 'Community plugin capabilities');
  exactKeys(value.contributions, ['guidance', 'verificationProposals'], 'Community plugin contributions');
  const rawGuidance = value.contributions.guidance ?? [];
  const rawVerificationProposals = value.contributions.verificationProposals ?? [];
  if (!Array.isArray(rawGuidance)) throw new Error('Community plugin guidance contributions must be an array.');
  if (!Array.isArray(rawVerificationProposals)) throw new Error('Community plugin verificationProposals must be an array.');
  const guidance = rawGuidance.map(validateGuidance);
  const verificationProposals = rawVerificationProposals.map(validateVerificationProposal);
  const guidancePaths = new Set();
  for (const item of guidance) {
    if (guidancePaths.has(item.path)) throw new Error(`Community plugin contains duplicate guidance path: ${item.path}`);
    guidancePaths.add(item.path);
  }
  const proposalKeys = new Set();
  for (const item of verificationProposals) {
    if (proposalKeys.has(item.key)) throw new Error(`Community plugin contains duplicate verification proposal key: ${item.key}`);
    proposalKeys.add(item.key);
  }
  if (guidance.length === 0 && verificationProposals.length === 0) {
    throw new Error('Community plugin manifest must contribute guidance or verification proposals.');
  }
  if (guidance.some((item) => item.modes.length === 0)) throw new Error('Community plugin guidance must target at least one context mode.');
  if (guidance.length > 0 && !capabilities.includes('guidance')) throw new Error('Community plugin guidance contributions require the guidance capability.');
  if (verificationProposals.length > 0 && !capabilities.includes('verification-proposals')) {
    throw new Error('Community plugin verification proposals require the verification-proposals capability.');
  }
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    id, version, name, description,
    vcpCompatibility: { minVersion, maxExclusiveVersion },
    capabilities,
    contributions: { guidance, verificationProposals }
  };
}

async function bundleTextFiles(bundleRoot) {
  const files = [];
  async function walk(current, relativeBase = '') {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => lexicalCompare(a.name, b.name));
    for (const entry of entries) {
      const relative = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      const absolute = path.join(current, entry.name);
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Community plugin bundle contains symlink: ${relative}`);
      if (info.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (!info.isFile()) throw new Error(`Community plugin bundle contains unsupported filesystem entry: ${relative}`);
      const extension = path.posix.extname(relative).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) {
        throw new Error(`Community plugin bundle file type is not allowed in v1: ${relative}`);
      }
      const content = decodeUtf8(await readFile(absolute), `Community plugin bundle file ${relative}`);
      files.push({ relative: relative.replaceAll('\\', '/'), content });
    }
  }
  await walk(bundleRoot);
  files.sort((a, b) => lexicalCompare(a.relative, b.relative));
  const caseFolded = new Set();
  for (const file of files) {
    const folded = file.relative.toLowerCase();
    if (caseFolded.has(folded)) throw new Error(`Community plugin bundle contains case-insensitive path collision: ${file.relative}`);
    caseFolded.add(folded);
  }
  return files;
}

export async function computeCommunityPluginDigest(targetDir, bundlePath) {
  const root = path.resolve(targetDir);
  const bundleRelative = safeLocalRelative(bundlePath, 'Community plugin bundle path');
  const bundleRoot = await assertPathInsideRoot(root, bundleRelative, { allowMissing: false });
  const bundleInfo = await lstat(bundleRoot);
  if (!bundleInfo.isDirectory()) throw new Error(`Community plugin path is not a directory: ${bundleRelative}`);
  const files = await bundleTextFiles(bundleRoot);
  if (!files.some((item) => item.relative === MANIFEST_FILE)) throw new Error(`Community plugin bundle is missing ${MANIFEST_FILE}: ${bundleRelative}`);
  const hash = createHash('sha256');
  for (const file of files) {
    const bytes = Buffer.from(file.content, 'utf8');
    hash.update(file.relative, 'utf8');
    hash.update('\0');
    hash.update(String(bytes.length), 'utf8');
    hash.update('\0');
    hash.update(bytes);
    hash.update('\0');
  }
  return { digest: `sha256:${hash.digest('hex')}`, files };
}

async function loadSelectedPlugin(root, selection, cliVersion) {
  const bundleRoot = await assertPathInsideRoot(root, selection.path, { allowMissing: false });
  const bundleInfo = await lstat(bundleRoot);
  if (!bundleInfo.isDirectory()) throw new Error(`Community plugin path is not a directory: ${selection.path}`);

  const digestResult = await computeCommunityPluginDigest(root, selection.path);
  if (digestResult.digest !== selection.sha256) {
    throw new Error(`Community plugin ${selection.id} digest mismatch: expected ${selection.sha256}, actual ${digestResult.digest}.`);
  }
  const bundleFiles = new Map(digestResult.files.map((item) => [item.relative, item]));
  const manifestRelative = `${selection.path}/${MANIFEST_FILE}`;
  const manifestFile = bundleFiles.get(MANIFEST_FILE);
  if (!manifestFile) throw new Error(`Community plugin bundle is missing ${MANIFEST_FILE}: ${selection.path}`);
  const manifest = validateManifest(parseJsonText(manifestFile.content, `Community plugin manifest ${manifestRelative}`));
  if (manifest.id !== selection.id) throw new Error(`Community plugin id mismatch: declaration ${selection.id}, manifest ${manifest.id}.`);
  if (manifest.version !== selection.version) throw new Error(`Community plugin version mismatch for ${selection.id}: declaration ${selection.version}, manifest ${manifest.version}.`);
  if (compareVersions(cliVersion, manifest.vcpCompatibility.minVersion) < 0
    || compareVersions(cliVersion, manifest.vcpCompatibility.maxExclusiveVersion) >= 0) {
    throw new Error(`Community plugin ${selection.id}@${selection.version} is not compatible with VCP ${cliVersion}.`);
  }
  for (const grant of selection.grants) {
    if (!manifest.capabilities.includes(grant)) throw new Error(`Community plugin ${selection.id} grant ${grant} is not declared by the plugin.`);
  }
  for (const capability of manifest.capabilities) {
    const hasContribution = capability === 'guidance'
      ? manifest.contributions.guidance.length > 0
      : manifest.contributions.verificationProposals.length > 0;
    if (hasContribution && !selection.grants.includes(capability)) {
      throw new Error(`Community plugin ${selection.id} contribution ${capability} requires an explicit project grant.`);
    }
  }
  const guidance = [];
  for (const item of manifest.contributions.guidance) {
    const file = bundleFiles.get(item.path);
    if (!file) throw new Error(`Community plugin ${selection.id} guidance file is missing from bundle: ${item.path}`);
    guidance.push({ ...item, relative: `${selection.path}/${item.path}`, content: file.content });
  }
  return {
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: manifest.description,
    path: selection.path,
    digest: digestResult.digest,
    grants: [...selection.grants],
    capabilities: [...manifest.capabilities],
    compatibility: manifest.vcpCompatibility,
    manifestRelative,
    manifestContent: bundleFiles.get(MANIFEST_FILE).content,
    guidance,
    verificationProposals: manifest.contributions.verificationProposals.map((item) => ({ ...item, status: 'proposal-not-applied' }))
  };
}

export async function loadCommunityPlugins(targetDir) {
  const root = path.resolve(targetDir);
  const configPath = await assertPathInsideRoot(root, COMMUNITY_PLUGIN_CONFIG, { allowMissing: true });
  if (!(await exists(configPath))) {
    return { schemaVersion: COMMUNITY_PLUGIN_SCHEMA_VERSION, config: null, cliVersion: await getCliVersion(), plugins: [] };
  }
  const configInfo = await lstat(configPath);
  if (configInfo.isSymbolicLink()) throw new Error(`Refusing to follow symlink in community plugin declaration: ${COMMUNITY_PLUGIN_CONFIG}`);
  if (!configInfo.isFile()) throw new Error(`Community plugin declaration is not a file: ${COMMUNITY_PLUGIN_CONFIG}`);
  const selections = validateSelectionConfig(await readJsonFile(configPath, 'Community plugin declaration'));
  const cliVersion = await getCliVersion();
  const plugins = [];
  for (const selection of selections) plugins.push(await loadSelectedPlugin(root, selection, cliVersion));
  return {
    schemaVersion: COMMUNITY_PLUGIN_SCHEMA_VERSION,
    config: {
      relative: COMMUNITY_PLUGIN_CONFIG,
      content: decodeUtf8(await readFile(configPath), 'Community plugin declaration')
    },
    cliVersion,
    plugins
  };
}

export async function loadCommunityPluginContext(targetDir, mode) {
  if (!COMMUNITY_PLUGIN_MODES.includes(mode)) throw new Error(`Unknown community plugin context mode: ${mode}`);
  const loaded = await loadCommunityPlugins(targetDir);
  const guidance = [];
  const verificationProposals = [];
  for (const plugin of loaded.plugins) {
    for (const item of plugin.guidance) {
      if (item.modes.includes(mode)) guidance.push({ pluginId: plugin.id, pluginVersion: plugin.version, ...item });
    }
    for (const item of plugin.verificationProposals) {
      verificationProposals.push({ pluginId: plugin.id, pluginVersion: plugin.version, ...item });
    }
  }
  return { ...loaded, guidance, verificationProposals };
}

export async function inspectCommunityPlugins(targetDir) {
  const loaded = await loadCommunityPlugins(targetDir);
  return {
    schemaVersion: COMMUNITY_PLUGIN_SCHEMA_VERSION,
    kind: 'community-plugin-inspection',
    target: await realpath(path.resolve(targetDir)),
    config: loaded.config?.relative ?? null,
    cliVersion: loaded.cliVersion,
    plugins: loaded.plugins.map((plugin) => ({
      id: plugin.id,
      version: plugin.version,
      name: plugin.name,
      path: plugin.path,
      digest: plugin.digest,
      grants: plugin.grants,
      capabilities: plugin.capabilities,
      guidance: plugin.guidance.map((item) => ({ path: item.relative, modes: item.modes, title: item.title })),
      verificationProposals: plugin.verificationProposals
    })),
    success: true,
    trust: {
      selection: 'human-decision',
      commandGrants: 'human-decision',
      proposalsApplied: false
    }
  };
}

export function formatCommunityPluginReport(report) {
  const lines = [
    'VCP Community Plugins',
    `Target: ${report.target}`,
    `Declaration: ${report.config ?? '(none — no plugins selected)'}`,
    `VCP version: ${report.cliVersion}`,
    ''
  ];
  if (report.plugins.length === 0) lines.push('No community plugins are explicitly selected.');
  for (const plugin of report.plugins) {
    lines.push(`${plugin.id}@${plugin.version} — ${plugin.name}`);
    lines.push(`  path: ${plugin.path}`);
    lines.push(`  digest: ${plugin.digest}`);
    lines.push(`  grants: ${plugin.grants.length ? plugin.grants.join(', ') : '(none)'}`);
    for (const proposal of plugin.verificationProposals) {
      lines.push(`  PROPOSAL ${proposal.key}=${proposal.command} — not applied by VCP`);
    }
  }
  lines.push('', 'Trust boundary: selecting plugins, granting command capability, and applying verification proposals remain HUMAN DECISION actions.');
  return lines.join('\n');
}
