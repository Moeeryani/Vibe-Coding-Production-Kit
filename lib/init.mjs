import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { agentNote } from './adapters.mjs';
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
  const manifestPath = path.join(target, '.vcp/manifest.json');
  if (await pathExists(manifestPath)) {
    throw new Error('This project is already initialized with VCP. Use `vcp update` for lifecycle upgrades; `vcp init --force` will not replace existing VCP state.');
  }

  const desired = await buildDesiredFiles({ targetDir: target, agent, stack, includeGitHub });
  const conflicts = await collectConflicts(target, desired.files);

  if (conflicts.length > 0 && !force) {
    const detail = conflicts.map((item) => `  - ${item}`).join('\n');
    throw new Error(`Refusing to overwrite existing framework files:\n${detail}\nRe-run with --force only after reviewing these files.`);
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
