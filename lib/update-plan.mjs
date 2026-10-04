import path from 'node:path';
import { buildDesiredFiles, normalizeManagedPath } from './template.mjs';
import { getCliVersion } from './version.mjs';
import { threeWayMerge } from './merge.mjs';
import { compareVersions, MIGRATIONS, resolveMigrationPath } from './migrations.mjs';
import { hashContent, readBaseline, readManagedFile, readManifest } from './state.mjs';
import { detectStackProfileChange } from './stack-provenance.mjs';
import { loadCommunityPlugins } from './community-plugins.mjs';

function action(type, pathValue, extra = {}) {
  return { type, path: normalizeManagedPath(pathValue), ...extra };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function composeMigrationMetadata(migrations) {
  const renames = new Map();
  const removals = new Set();

  const sourceForCurrentPath = (currentPath) => {
    for (const [source, destination] of renames) {
      if (destination === currentPath) return source;
    }
    return null;
  };

  for (const migration of migrations) {
    for (const item of migration.renames ?? []) {
      const from = normalizeManagedPath(item.from);
      const to = normalizeManagedPath(item.to);
      if (from === to) throw new Error(`Migration rename cannot target the same path: ${from}`);

      const chainedSource = sourceForCurrentPath(from);
      if (!chainedSource && renames.has(from) && renames.get(from) !== from) {
        throw new Error(`Migration rename source is stale after an earlier rename: ${from}`);
      }
      const source = chainedSource ?? from;
      if (removals.has(source)) throw new Error(`Migration cannot rename a path already removed earlier in the chain: ${from}`);

      const destinationOwner = sourceForCurrentPath(to);
      if (destinationOwner && destinationOwner !== source) {
        throw new Error(`Migration rename destination is already claimed: ${to}`);
      }
      renames.set(source, to);
    }

    for (const item of migration.removals ?? []) {
      const current = normalizeManagedPath(item);
      const chainedSource = sourceForCurrentPath(current);
      if (!chainedSource && renames.has(current) && renames.get(current) !== current) {
        throw new Error(`Migration removal refers to a stale path after rename: ${current}`);
      }
      const source = chainedSource ?? current;
      if (renames.get(source) === current) renames.delete(source);
      removals.add(source);
    }
  }

  return { renames, removals };
}

async function planExistingPath({ root, relative, oldEntry, desired, baseContent, current }) {
  const policy = desired.policy ?? oldEntry.policy ?? 'managed';

  if (!current.exists) {
    if (policy === 'preserve') {
      return action('PRESERVE', relative, {
        reason: 'User-owned file is deleted locally; VCP will preserve the deletion.',
        managed: true,
        desired
      });
    }
    return action('CONFLICT', relative, {
      reason: 'Managed file was deleted locally. Restore it, detach it from VCP management, or resolve manually before updating.',
      desired
    });
  }

  if (current.content === desired.content) {
    if (baseContent === desired.content) {
      return action('NOOP', relative, { reason: 'File already matches its tracked baseline.', desired });
    }
    return action('ADOPT', relative, { reason: 'Current file already matches the target template.', desired });
  }

  if (current.content === baseContent) {
    return action('UPDATE', relative, {
      reason: policy === 'preserve'
        ? 'User-owned file is still untouched, so its template can be updated safely.'
        : 'File is unchanged locally and changed upstream.',
      desired,
      content: desired.content
    });
  }

  if (policy === 'preserve') {
    return action('PRESERVE', relative, {
      reason: 'User-owned project document has local content; VCP preserves it instead of merging template changes into product decisions.',
      desired,
      baselineContent: baseContent
    });
  }

  if (desired.content === baseContent) {
    return action('PRESERVE', relative, {
      reason: 'File changed locally but not upstream.',
      desired,
      baselineContent: baseContent
    });
  }

  if (policy === 'generated') {
    return action('CONFLICT', relative, {
      reason: 'Generated adapter changed both locally and upstream; VCP will not overwrite local edits.',
      desired
    });
  }

  const merged = threeWayMerge(baseContent, current.content, desired.content);
  if (!merged.clean) {
    return action('CONFLICT', relative, {
      reason: `Local and upstream edits overlap. ${merged.reason}`,
      desired
    });
  }

  return action('MERGE', relative, {
    reason: 'Local and upstream edits were merged automatically.',
    desired,
    content: merged.content,
    mergeKind: merged.kind
  });
}

async function planRename({ root, from, to, oldEntry, desired }) {
  const fromCurrent = await readManagedFile(root, from);
  const toCurrent = await readManagedFile(root, to);
  const baseContent = await readBaseline(root, oldEntry);

  if (!fromCurrent.exists) {
    return action('CONFLICT', to, {
      fromPath: from,
      reason: `Migration expects ${from}, but it is missing locally.`,
      desired
    });
  }

  if (toCurrent.exists && toCurrent.content !== desired.content) {
    return action('CONFLICT', to, {
      fromPath: from,
      reason: `Rename destination already exists with different content: ${to}.`,
      desired
    });
  }

  let content = desired.content;
  if (fromCurrent.content !== baseContent && fromCurrent.content !== desired.content) {
    const merged = threeWayMerge(baseContent, fromCurrent.content, desired.content);
    if (!merged.clean) {
      return action('CONFLICT', to, {
        fromPath: from,
        reason: `Renamed file has overlapping local/upstream edits. ${merged.reason}`,
        desired
      });
    }
    content = merged.content;
  }

  return action('RENAME', to, {
    fromPath: from,
    reason: `Migration renames ${from} -> ${to}.`,
    desired,
    content
  });
}

export async function planUpdate({
  targetDir,
  targetVersion = null,
  migrations = MIGRATIONS,
  desiredBuilder = buildDesiredFiles,
  currentVersion = null
}) {
  const root = path.resolve(targetDir);
  const manifestOriginal = await readManifest(root);
  const cliVersion = currentVersion ?? await getCliVersion();
  const toVersion = targetVersion ?? cliVersion;

  if (toVersion !== cliVersion) {
    throw new Error(`This CLI contains templates for ${cliVersion}, not ${toVersion}. Run \`npx --yes vibe-coding-production@${toVersion} update ${JSON.stringify(root)}\` to target that version.`);
  }
  if (compareVersions(manifestOriginal.installedVersion, toVersion) > 0) {
    throw new Error(`Project is on VCP ${manifestOriginal.installedVersion}, newer than this CLI (${toVersion}). Downgrades are not supported.`);
  }

  // Selected community plugins are project-owned and are never rewritten by update, but a target
  // CLI must not knowingly plan an update that leaves explicitly selected extension state invalid.
  await loadCommunityPlugins(root);

  const migrationPath = compareVersions(manifestOriginal.installedVersion, toVersion) === 0
    ? []
    : resolveMigrationPath(manifestOriginal.installedVersion, toVersion, migrations);

  let manifest = clone(manifestOriginal);
  for (const migration of migrationPath) {
    manifest = migration.manifest ? migration.manifest(manifest) : manifest;
  }
  const { renames, removals } = composeMigrationMetadata(migrationPath);

  const detectedStackProfileChange = await detectStackProfileChange(root, manifest.install);
  const desiredResult = await desiredBuilder({
    targetDir: root,
    agent: manifest.install.agent ?? 'generic',
    stack: detectedStackProfileChange?.to ?? manifest.install.stack ?? 'auto',
    includeGitHub: manifest.install.includeGitHub !== false
  });
  const stackProfileChange = detectedStackProfileChange && desiredResult.stack === detectedStackProfileChange.to
    ? detectedStackProfileChange
    : null;
  const desiredFiles = desiredResult.files;
  for (const [relative, file] of desiredFiles) file.relative = relative;

  const oldFiles = manifestOriginal.managedFiles;
  const actions = [];
  const consumedOld = new Set();

  for (const [from, to] of renames) {
    const oldEntry = oldFiles[from];
    const desired = desiredFiles.get(to);
    if (!oldEntry) throw new Error(`Migration rename source is not managed: ${from}`);
    if (!desired) throw new Error(`Migration rename destination is not present in target package: ${to}`);
    actions.push(await planRename({ root, from, to, oldEntry, desired }));
    consumedOld.add(from);
    desiredFiles.delete(to);
  }

  const ignoredFiles = new Set(manifestOriginal.ignoredFiles ?? []);
  for (const [relative, desired] of desiredFiles) {
    if (ignoredFiles.has(relative)) {
      actions.push(action('IGNORED', relative, {
        reason: 'Path is explicitly ignored by VCP management.',
        desired
      }));
      if (oldFiles[relative]) consumedOld.add(relative);
      continue;
    }

    const oldEntry = oldFiles[relative];
    if (!oldEntry) {
      const current = await readManagedFile(root, relative);
      if (!current.exists) {
        actions.push(action('ADD', relative, {
          reason: 'New VCP-managed file in target version.',
          desired,
          content: desired.content
        }));
      } else if (current.content === desired.content) {
        actions.push(action('ADOPT', relative, {
          reason: 'Existing user file already matches the new VCP template.',
          desired
        }));
      } else {
        actions.push(action('CONFLICT', relative, {
          reason: 'Target version wants to add this file, but a different local file already exists.',
          desired
        }));
      }
      continue;
    }

    consumedOld.add(relative);
    const baseContent = await readBaseline(root, oldEntry);
    if (hashContent(baseContent) !== oldEntry.baselineHash) {
      throw new Error(`Baseline integrity check failed for ${relative}.`);
    }
    const current = await readManagedFile(root, relative);
    actions.push(await planExistingPath({ root, relative, oldEntry, desired, baseContent, current }));
  }

  for (const [relative, oldEntry] of Object.entries(oldFiles)) {
    if (consumedOld.has(relative)) continue;

    if (!removals.has(relative)) {
      actions.push(action('CONFLICT', relative, {
        reason: 'Managed file disappeared from the target package without an explicit migration removal. Refusing to detach or delete it automatically.'
      }));
      continue;
    }

    const current = await readManagedFile(root, relative);
    const baseContent = await readBaseline(root, oldEntry);
    if (!current.exists) {
      actions.push(action('DETACH', relative, {
        reason: 'File was removed both locally and by an explicit VCP migration.'
      }));
    } else if (oldEntry.policy === 'preserve' || current.content !== baseContent) {
      actions.push(action('DETACH', relative, {
        reason: 'Explicit migration removed this file upstream; local content is preserved and detached from VCP management.'
      }));
    } else {
      actions.push(action('DELETE', relative, {
        reason: 'Explicit migration removed this unmodified VCP-managed file upstream.'
      }));
    }
  }

  const order = {
    CONFLICT: 0,
    RENAME: 1,
    ADD: 2,
    UPDATE: 3,
    MERGE: 4,
    DELETE: 5,
    ADOPT: 6,
    DETACH: 7,
    PRESERVE: 8,
    IGNORED: 9,
    NOOP: 10
  };
  actions.sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99) || a.path.localeCompare(b.path));

  const counts = Object.fromEntries(
    [...new Set(actions.map((item) => item.type))].map((type) => [
      type,
      actions.filter((item) => item.type === type).length
    ])
  );
  const changes = actions.filter((item) => [
    'ADD', 'UPDATE', 'MERGE', 'RENAME', 'DELETE', 'ADOPT', 'DETACH'
  ].includes(item.type)).length;
  const versionChange = compareVersions(manifestOriginal.installedVersion, toVersion) !== 0;
  const conflicts = actions.filter((item) => item.type === 'CONFLICT').length;

  return {
    root,
    cliVersion,
    fromVersion: manifestOriginal.installedVersion,
    toVersion,
    manifest: manifestOriginal,
    migratedManifest: manifest,
    migrationIds: migrationPath.map((item) => item.id),
    stack: desiredResult.stack,
    stackProfileChange,
    actions,
    counts,
    changes,
    conflicts,
    versionChange,
    needsApply: versionChange || changes > 0 || Boolean(stackProfileChange),
    upToDate: !versionChange && changes === 0 && conflicts === 0 && !stackProfileChange
  };
}
