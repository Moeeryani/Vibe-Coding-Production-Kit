function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version ?? '');
  if (!match) throw new Error(`Invalid semantic version: ${version}`);

  const core = match.slice(1, 4).map(Number);
  const prerelease = match[4] ? match[4].split('.') : [];
  for (const identifier of prerelease) {
    if (/^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0')) {
      throw new Error(`Invalid semantic version: ${version}`);
    }
  }
  return { core, prerelease };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;

    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const aValue = BigInt(a);
      const bValue = BigInt(b);
      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      continue;
    }
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return a < b ? -1 : 1;
  }
  return 0;
}

export function compareVersions(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] < b.core[index]) return -1;
    if (a.core[index] > b.core[index]) return 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

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
