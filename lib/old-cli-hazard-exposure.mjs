/**
 * P4-01: read-only diagnostic for exposure to *historical* 0.9.3 hazards.
 * The assessment is pure. The separate inventory reads metadata only.
 * No outcome authorizes a write or proves a project is safe.
 */
import path from 'node:path';
import { lstat } from 'node:fs/promises';

export const OLD_CLI_HAZARD_EVIDENCE = Object.freeze({
  H1: 'D-01: published 0.9.3 post-backup-edit loss POC (Linux 7/12; Windows 8/13; PR #89, Linux 2e8e098, Windows evidence 97110131)',
  H2: 'D-01: published 0.9.3 init --force bypass of directory-shaped update.lock when manifest is absent (Windows POC)',
  H3: 'F5/F5b: inherited interrupted/corrupted journal and rollback cases; no validated repair contract',
  H4: 'PH-06: concurrent journal creation can allow two successful writers; exact old-CLI/project applicability unproven',
  H5: 'D-03: linked-root refusal policy; old-CLI linked-root safety has not been established',
});

const COMMANDS = Object.freeze(['init', 'update', 'manage', 'rollback']);
const UNKNOWN_NOTE = 'Insufficient state-matched evidence; UNKNOWN does not mean safe.';

function verdict(status, hazards = [], reason = UNKNOWN_NOTE, evidence = []) {
  return { status, hazards, reason, evidence };
}

/** Pure descriptor -> diagnostic. Does not inspect or change a filesystem. */
export function assessOldCliHazardExposure(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new TypeError('A project-state descriptor is required.');
  }
  const kinds = descriptor.entries ?? {};
  const result = Object.fromEntries(COMMANDS.map((command) =>
    [command, verdict('UNKNOWN')]));
  const rootTrust = descriptor.pathTrust === 'DIRECTORY' ? 'DIRECTORY' : 'ROOT_LINK_REFUSED';
  if (rootTrust === 'DIRECTORY') {
    const noRootManifest = kinds['manifest.json'] === 'missing';
    const agentsFile = kinds['AGENTS.md'] === 'file';
    const lockDirectory = kinds['update.lock'] === 'directory';
    if (noRootManifest && agentsFile) {
      const hazards = lockDirectory ? ['H1', 'H2'] : ['H1'];
      result.init = verdict('EXPOSED', hazards,
        'The state matches a documented old init --force hazard shape. Presence of AGENTS.md does NOT prove it contains post-backup edits or that loss is certain.',
        hazards.map((hazard) => OLD_CLI_HAZARD_EVIDENCE[hazard]));
    }
    if (kinds['transaction.json'] !== 'missing' || kinds['.vcp'] !== 'missing') {
      result.update = verdict('UNKNOWN', ['H3'],
        'Recovery or managed-state evidence requires a phase-specific proof; no old CLI action is attempted.',
        [OLD_CLI_HAZARD_EVIDENCE.H3]);
      result.rollback = verdict('UNKNOWN', ['H3'],
        'Interrupted recovery semantics are not proven by these metadata observations.',
        [OLD_CLI_HAZARD_EVIDENCE.H3]);
    }
    result.manage = verdict('UNKNOWN', [], 'No state-matched old manage-entrypoint safety evidence is available.');
  } else {
    for (const name of COMMANDS) {
      result[name] = verdict('UNKNOWN', ['H5'],
        'ROOT_LINK: path component is a symlink; directory was not traversed.',
        [OLD_CLI_HAZARD_EVIDENCE.H5]);
    }
  }
  return {
    kind: 'old-cli-hazard-exposure', schemaVersion: 1,
    targetVersion: '0.9.3', scope: 'read-only metadata diagnostic; native Linux evidence only',
    pathTrust: rootTrust, verdicts: result,
    warning: 'EXPOSED is an evidence-backed hazard class, not certain loss. UNKNOWN is not safe. No old CLI commands were run; no safety fence or write authorization is provided.',
    unresolvedConcurrency: { hazard: 'H4', status: 'UNKNOWN', evidence: OLD_CLI_HAZARD_EVIDENCE.H4 },
  };
}

function metadataError(error) {
  const wrapped = new Error('Hazard exposure inspection failed closed: '+(error?.code || 'unknown filesystem error'));
  wrapped.code = 'E_HAZARD_READ_FAILED';
  wrapped.cause = error;
  return wrapped;
}

async function kindOf(filename) {
  try {
    const s = await lstat(filename);
    return s.isSymbolicLink() ? 'symlink' : s.isDirectory() ? 'directory' :
      s.isFile() ? 'file' : 'other';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw metadataError(error);
  }
}

/**
 * Read metadata only; never read file contents or follow an entry symlink.
 * An ancestor symlink causes UNKNOWN/ROOT_LINK without traversing the target.
 * This is not a race-free path containment guarantee.
 */
export async function inspectOldCliHazardExposure(directory = '.') {
  const target = path.resolve(directory);
  const parsed = path.parse(target);
  let cursor = parsed.root;
  for (const component of target.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const kind = await kindOf(cursor);
    if (kind === 'symlink') return assessOldCliHazardExposure({ pathTrust: 'ROOT_LINK_REFUSED' });
    if (kind !== 'directory') {
      const error = new Error('Hazard exposure target is not a readable directory.');
      error.code = 'E_HAZARD_READ_FAILED';
      throw error;
    }
  }
  const before = await lstat(target).catch((error) => { throw metadataError(error); });
  const entries = {};
  for (const name of ['AGENTS.md', 'manifest.json', 'update.lock', 'transaction.json', '.vcp']) {
    entries[name] = await kindOf(path.join(target, name));
  }
  const after = await lstat(target).catch((error) => { throw metadataError(error); });
  if (!after.isDirectory() || before.dev !== after.dev || before.ino !== after.ino) {
    return assessOldCliHazardExposure({ pathTrust: 'ROOT_LINK_REFUSED' });
  }
  return assessOldCliHazardExposure({ pathTrust: 'DIRECTORY', entries });
}

export function formatOldCliHazardExposure(report) {
  return [
    'VCP 0.9.3 hazard exposure (read-only)',
    'Path trust: '+report.pathTrust,
    ...COMMANDS.map((name) => {
      const entry = report.verdicts[name];
      return name+': '+entry.status+(entry.hazards.length ? ' ('+entry.hazards.join(', ')+')' : '')+' — '+entry.reason;
    }),
    'Concurrency H4: UNKNOWN (PH-06 not resolved)',
    report.warning,
  ].join('\n');
}
