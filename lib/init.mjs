import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { agentNote } from './adapters.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { planSmartInit } from './adoption-plan.mjs';
import { buildDesiredFiles } from './template.mjs';
import {
  buildManifest,
  ensureVcpGitignore,
  pathExists,
  snapshotBaselines,
  writeManagedFile,
  writeManifest
} from './state.mjs';
import { getCliVersion } from './version.mjs';

async function collectConflicts(target, files) {
  const conflicts = [];
  for (const relative of files.keys()) {
    if (await pathExists(path.join(target, relative))) conflicts.push(relative);
  }
  return conflicts;
}

export async function initProject({ targetDir, agent = 'generic', stack = 'auto', includeGitHub = true, force = false, dryRun = false }) {
  const target = path.resolve(targetDir);
  if (force) throw new Error('Destructive init --force is disabled for Stage12 safety.');
  const inspection = await inspectProject(target);
  if (dryRun) return planSmartInit(target, { agentPreference: agent, stackPreference: stack });
  if (inspection.classification === 'BLOCKED') {
    throw new Error(`Init blocked by VCP state: ${inspection.reason}; inspect recovery before writing.`);
  }
  if (inspection.classification === 'MANAGED') {
    throw new Error('This project is already managed by VCP. Use vcp update/status.');
  }
  if (inspection.classification === 'EXISTING') {
    throw new Error('Existing repositories are preview-only in Stage12; Stage13 owns first adoption writes.');
  }
  // The legacy initializer would install the source-repository npm workflow and
  // write schema-v1 without a durable assetSet. Do not let it create an Adaptive
  // greenfield install until schema-v2 writer/recovery + G-FENCE are safe.
  if (inspection.classification === 'NEW') {
    const error = new Error('Adaptive greenfield apply is not yet authorized: schema-v2 recovery/G-FENCE is pending. Use vcp init --dry-run.');
    error.code = 'E_G_FENCE_NO_GO';
    throw error;
  }
  const manifestPath = path.join(target, '.vcp/manifest.json');

  const desired = await buildDesiredFiles({ targetDir: target, agent, stack, includeGitHub });
  const conflicts = await collectConflicts(target, desired.files);

  if (conflicts.length > 0) {
    const detail = conflicts.map((item) => `  - ${item}`).join('\n');
    throw new Error(`Refusing to overwrite existing framework files:\n${detail}\nExisting user files are never replaced by init; inspect the repository instead.`);
  }

  const version = await getCliVersion();
  const planned = [...desired.files.keys(), '.vcp/manifest.json', '.vcp/.gitignore'].sort();
  if (dryRun) {
    return { target, files: planned, note: agentNote(agent), stack: desired.stack, version, dryRun: true };
  }

  for (const [relative, file] of desired.files) {
    await writeManagedFile(target, relative, file.content, file.mode);
  }

  const manifest = buildManifest({
    version,
    agent,
    stack: desired.stack,
    includeGitHub,
    files: desired.files
  });
  manifest.install.requestedStack = stack;
  await ensureVcpGitignore(target);
  await snapshotBaselines(target, desired.files, manifest);
  await writeManifest(target, manifest);

  const agentContent = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  if (!agentContent.includes('# AGENTS.md')) throw new Error('Installed AGENTS.md did not pass a basic integrity check.');

  return {
    target,
    files: planned,
    note: agentNote(agent),
    stack: desired.stack,
    version,
    manifestPath: '.vcp/manifest.json',
    dryRun: false
  };
}
