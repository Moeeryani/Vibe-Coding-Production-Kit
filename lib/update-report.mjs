import path from 'node:path';
import { compareVersions } from './migrations.mjs';
import { readManifest } from './state.mjs';
import { getCliVersion } from './version.mjs';
import { detectStackProfileChange } from './stack-provenance.mjs';

function safeAction(item) {
  const result = { type: item.type, path: item.path, reason: item.reason };
  if (item.fromPath) result.fromPath = item.fromPath;
  if (item.mergeKind) result.mergeKind = item.mergeKind;
  return result;
}

export function lifecycleStatusForPlan(plan) {
  if (plan.blocked || (plan.conflicts ?? 0) > 0) return 'blocked';
  if (plan.applied) return 'applied';
  if (plan.needsApply) return 'available';
  return 'no-work';
}

export function publicUpdateReport(plan) {
  return {
    lifecycleStatus: lifecycleStatusForPlan(plan),
    fromVersion: plan.fromVersion,
    toVersion: plan.toVersion,
    cliVersion: plan.cliVersion,
    migrations: plan.migrationIds ?? [],
    adaptiveSchemaMigration: plan.adaptiveSchemaMigration ?? null,
    stackProfileChange: plan.stackProfileChange ?? null,
    counts: plan.counts ?? {},
    changes: plan.changes ?? 0,
    conflicts: plan.conflicts ?? 0,
    versionChange: Boolean(plan.versionChange),
    needsApply: Boolean(plan.needsApply),
    upToDate: Boolean(plan.upToDate),
    blocked: Boolean(plan.blocked),
    applied: Boolean(plan.applied),
    backupId: plan.backupId ?? null,
    actions: (plan.actions ?? []).map(safeAction)
  };
}

export function formatUpdatePlan(plan) {
  const report = publicUpdateReport(plan);
  const lines = [
    `VCP update: ${report.fromVersion} -> ${report.toVersion}`,
    `Lifecycle status: ${report.lifecycleStatus}`,
    `Changes: ${report.changes}; conflicts: ${report.conflicts}`
  ];
  if (report.migrations.length) lines.push(`Migrations: ${report.migrations.join(', ')}`);
  if (report.stackProfileChange) {
    lines.push(`Stack profile: ${report.stackProfileChange.from} -> ${report.stackProfileChange.to} — ${report.stackProfileChange.reason}`);
  }
  for (const item of report.actions) {
    const rename = item.fromPath ? ` ${item.fromPath} ->` : '';
    lines.push(`${item.type.padEnd(9)}${rename} ${item.path} — ${item.reason}`);
  }
  if (report.upToDate) lines.push('Already up to date.');
  if (report.conflicts) {
    lines.push('Resolve conflicts before applying the update. No project files were changed.');
  }
  return lines.join('\n');
}

async function fetchLatestVersion(packageName = 'vibe-coding-production', timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.version) throw new Error('npm registry response did not include a version.');
    return payload.version;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkForUpdate({ targetDir, fetchLatest = true }) {
  const target = path.resolve(targetDir);
  const manifest = await readManifest(target);
  const cliVersion = await getCliVersion();
  let latestVersion = null;
  let registryError = null;

  if (fetchLatest) {
    try {
      latestVersion = await fetchLatestVersion();
    } catch (error) {
      registryError = error.message;
    }
  }

  const cliUpdateAvailable = latestVersion
    ? compareVersions(cliVersion, latestVersion) < 0
    : false;
  const recommendedVersion = cliUpdateAvailable ? latestVersion : cliVersion;
  const versionUpdateAvailable = compareVersions(manifest.installedVersion, recommendedVersion) < 0;
  const stackProfileChange = await detectStackProfileChange(target, manifest.install);
  const updateAvailable = versionUpdateAvailable || Boolean(stackProfileChange);

  return {
    lifecycleStatus: updateAvailable ? 'available' : 'no-work',
    installedVersion: manifest.installedVersion,
    cliVersion,
    registryChecked: fetchLatest,
    latestVersion,
    registryError,
    recommendedVersion,
    updateAvailable,
    versionUpdateAvailable,
    cliUpdateAvailable,
    stackProfileChange,
    targetCommand: updateAvailable && cliUpdateAvailable
      ? `npx --yes vibe-coding-production@${latestVersion} update ${JSON.stringify(target)} --dry-run`
      : null
  };
}
