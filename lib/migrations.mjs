import { compareSemver as compareVersions } from './semver.mjs';

// Keep the v0.9.x public comparator export; migration operations remain Schema v1 only.
export { compareVersions };

export const MIGRATIONS = [
  {
    id: '0.8.0-to-0.9.0-foundation',
    from: '0.8.0',
    to: '0.9.0',
    renames: [],
    removals: [],
    manifest(manifest) { return manifest; }
  },
  {
    id: '0.9.0-to-0.9.1-dogfood-fixes',
    from: '0.9.0',
    to: '0.9.1',
    renames: [],
    removals: [],
    manifest(manifest) { return manifest; }
  },
  {
    id: '0.9.1-to-0.9.2-agent-workflow-followups',
    from: '0.9.1',
    to: '0.9.2',
    renames: [],
    removals: [],
    manifest(manifest) { return manifest; }
  },
  {
    id: '0.9.2-to-0.9.3-control-plane-evidence',
    from: '0.9.2',
    to: '0.9.3',
    renames: [],
    removals: [],
    manifest(manifest) { return manifest; }
  }
];

export function resolveMigrationPath(fromVersion, toVersion, migrations = MIGRATIONS) {
  if (compareVersions(fromVersion, toVersion) === 0) return [];
  if (compareVersions(fromVersion, toVersion) > 0) throw new Error(`Downgrades are not supported: ${fromVersion} -> ${toVersion}.`);

  const byFrom = new Map();
  for (const migration of migrations) {
    if (byFrom.has(migration.from)) throw new Error(`Multiple migrations start from ${migration.from}.`);
    byFrom.set(migration.from, migration);
  }

  const path = [];
  let current = fromVersion;
  const visited = new Set();
  while (compareVersions(current, toVersion) < 0) {
    if (visited.has(current)) throw new Error(`Migration cycle detected at ${current}.`);
    visited.add(current);
    const migration = byFrom.get(current);
    if (!migration) throw new Error(`No migration path from ${current} to ${toVersion}.`);
    if (compareVersions(migration.to, toVersion) > 0) throw new Error(`Migration ${migration.id} overshoots target ${toVersion}.`);
    path.push(migration);
    current = migration.to;
  }
  if (current !== toVersion) throw new Error(`Migration path ended at ${current}, expected ${toVersion}.`);
  return path;
}
