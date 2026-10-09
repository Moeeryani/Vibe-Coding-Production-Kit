import { lstat, readFile, rm, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  STAGE_DIR,
  acquireUpdateLock,
  clearTransaction,
  createBackup,
  listBackups,
  readTransaction,
  releaseUpdateLock,
  removeManagedFile,
  restoreBackup,
  writeManagedFile,
  writeManifest,
  writeTransaction
} from './state.mjs';
import {
  baselineForAction,
  stageActions,
  verifyAppliedActions,
  writeFinalBaselines
} from './update-apply-helpers.mjs';
import { planUpdate } from './update-plan.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { inspectManagedRecovery } from './managed-recovery-v2.mjs';
import { resolveProjectPath } from './safe-path.mjs';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function transactionStageRoot(root, id) {
  if (typeof id !== 'string' || id.length === 0 || id.includes('/') || id.includes('\\') || id === '.' || id === '..') {
    return null;
  }
  return path.join(root, STAGE_DIR, id);
}

async function cleanupStage(root, stageRoot = null) {
  if (stageRoot) await rm(stageRoot, { recursive: true, force: true });

  try {
    await rmdir(path.join(root, STAGE_DIR));
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)) throw error;
  }
}

async function applyProjectActions(plan) {
  for (const item of plan.actions) {
    if (['ADD', 'UPDATE', 'MERGE'].includes(item.type)) {
      await writeManagedFile(plan.root, item.path, item.content, item.desired.mode ?? 0o644);
    } else if (item.type === 'RENAME') {
      await writeManagedFile(plan.root, item.path, item.content, item.desired.mode ?? 0o644);
      if (item.fromPath !== item.path) await removeManagedFile(plan.root, item.fromPath);
    } else if (item.type === 'DELETE') {
      await removeManagedFile(plan.root, item.path);
    }
  }
}

function buildNextManifest(plan, finalEntries) {
  return {
    ...clone(plan.migratedManifest),
    schemaVersion: plan.migratedManifest.schemaVersion,
    installedVersion: plan.toVersion,
    updatedAt: new Date().toISOString(),
    install: {
      ...clone(plan.migratedManifest.install),
      stack: plan.stack
    },
    managedFiles: finalEntries
  };
}

async function assertLegacyRollbackCompatible(root, backupId, transaction) {
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(backupId)) {
    throw new Error('Unsafe backup identifier; refusing legacy rollback.');
  }
  // The v0.9 rollback code does not understand versioned section ownership or
  // schema-v2 journal phases. Keep it away from those objects entirely.
  if(transaction?.formatVersion || transaction?.transactionSchemaVersion) {
    throw new Error('Versioned recovery requires its own manifest-aware rollback handler.');
  }
  const manifestFile=await resolveProjectPath(root,'.vcp/manifest.json',{
    purpose:'managed-state'
  });
  try {
    const bytes=await readFile(manifestFile);
    if(bytes.length>256*1024)throw new Error('Manifest too large for rollback provenance.');
    let current;
    try{current=JSON.parse(bytes.toString('utf8'));}
    catch{current=null;} // Damaged current manifest is not itself grounds to deny recovery.
    if(current?.schemaVersion===2||current?.minimumReaderVersion!==undefined) {
      throw new Error('Adaptive manifest requires versioned recovery; legacy rollback refused.');
    }
  }catch(error) {
    if(error?.code!=='ENOENT')throw error;
  }
  const metadataPath=await resolveProjectPath(root,
    '.vcp/backups/'+backupId+'/backup.json',{purpose:'managed-state',mustExist:true});
  const bytes=await readFile(metadataPath);
  if(bytes.length>512*1024)throw new Error('Backup metadata exceeds recovery read limit.');
  let metadata;
  try{metadata=JSON.parse(bytes.toString('utf8'));}
  catch{throw new Error('Backup metadata is invalid; refusing rollback.');}
  if(metadata?.formatVersion!==undefined||metadata?.backupSchemaVersion!==undefined||
     metadata?.minimumReaderVersion!==undefined||metadata?.id!==backupId||
     !Array.isArray(metadata.entries)) {
    throw new Error('Versioned or malformed backup requires a compatible recovery reader.');
  }
}

async function newestBackupId(root, backupIds) {
  const records = await Promise.all(backupIds.map(async (id) => {
    const metadataPath = path.join(root, '.vcp', 'backups', id, 'backup.json');
    try {
      const [raw, metadataStat] = await Promise.all([
        readFile(metadataPath, 'utf8'),
        stat(metadataPath, { bigint: true })
      ]);
      const metadata = JSON.parse(raw);
      const createdAtMs = Date.parse(metadata?.createdAt ?? '');
      return {
        id,
        createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : 0,
        mtimeNs: metadataStat.mtimeNs
      };
    } catch {
      return { id, createdAtMs: 0, mtimeNs: 0n };
    }
  }));

  records.sort((left, right) => {
    if (left.createdAtMs !== right.createdAtMs) return right.createdAtMs - left.createdAtMs;
    if (left.mtimeNs !== right.mtimeNs) return left.mtimeNs > right.mtimeNs ? -1 : 1;
    return right.id.localeCompare(left.id);
  });
  return records[0]?.id ?? null;
}

export async function applyUpdate(options) {
  const root = path.resolve(options.targetDir);
  const inspection=await inspectProject(root);
  if (inspection.reason==='ACTIVE_OR_STALE_LOCK') {
    // A lock is held: fall through so acquireUpdateLock emits its specific,
    // actionable error (or reaps a stale lock) instead of masking it behind
    // the generic message.
  } else if (inspection.classification!=='MANAGED'||inspection.schemaVersion!==1) {
    throw new Error('Update mutation requires a safe, unlocked schema-v1 managed repository.');
  }
  let plan = null;
  let lockAcquired = false;
  let backup = null;
  let stageRoot = null;

  try {
    await acquireUpdateLock(root);
    lockAcquired = true;

    plan = await planUpdate({ ...options, targetDir: root, preflightHeldLock: true });
    if (plan.conflicts > 0) {
      return { ...plan, blocked: true, applied: false, backupId: null };
    }
    if (!plan.needsApply) {
      return { ...plan, blocked: false, applied: false, backupId: null };
    }

    backup = await createBackup(plan.root, plan.actions, plan.manifest);
    const transaction = {
      schemaVersion: 1,
      id: backup.id,
      backupId: backup.id,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      phase: 'staging',
      startedAt: new Date().toISOString()
    };

    await writeTransaction(plan.root, transaction);
    stageRoot = await stageActions(plan, backup.id);
    await writeTransaction(plan.root, { ...transaction, phase: 'applying' });

    await applyProjectActions(plan);

    const finalEntries = clone(plan.migratedManifest.managedFiles ?? {});
    const baselineContents = new Map();
    for (const item of plan.actions) {
      baselineForAction(plan, item, finalEntries, baselineContents);
    }

    await writeFinalBaselines(plan.root, finalEntries, baselineContents, plan);
    const nextManifest = buildNextManifest(plan, finalEntries);
    await writeManifest(plan.root, nextManifest);
    await verifyAppliedActions(plan);

    await writeTransaction(plan.root, { ...transaction, phase: 'verified' });
    await clearTransaction(plan.root);
    await cleanupStage(plan.root, stageRoot);
    stageRoot = null;
    await releaseUpdateLock(plan.root);
    lockAcquired = false;

    return {
      ...plan,
      manifest: nextManifest,
      blocked: false,
      applied: true,
      backupId: backup.id
    };
  } catch (error) {
    if (backup?.id && plan) {
      try {
        await restoreBackup(plan.root, backup.id);
        lockAcquired = false;
      } catch (rollbackError) {
        throw new Error(`VCP update failed: ${error.message}. Automatic rollback also failed: ${rollbackError.message}`);
      }
      throw new Error(`VCP update failed and was rolled back: ${error.message}`);
    }
    throw new Error(`VCP update failed before project changes were applied: ${error.message}`);
  } finally {
    if (stageRoot) await cleanupStage(root, stageRoot).catch(() => {});
    if (lockAcquired) await releaseUpdateLock(root).catch(() => {});
  }
}

export async function rollbackProject({ targetDir, backupId = null }) {
  const root = path.resolve(targetDir);
  // Rollback must remain reachable with a corrupt active manifest: recovery
  // authority comes from owned state/backup, never a successful manifest parse.
  let priorState;
  try { priorState=await lstat(path.join(root,'.vcp')); }
  catch(error) { if(error?.code==='ENOENT') throw new Error('Rollback requires existing VCP lifecycle state.'); throw error; }
  if(!priorState.isDirectory()||priorState.isSymbolicLink())throw new Error('Unsafe VCP state directory.');
  const beforeLock=await inspectProject(root);
  if(beforeLock.schemaVersion===2) {
    throw new Error('Legacy rollback refuses schema-v2 state; use the versioned recovery plan.');
  }
  const recoveryBeforeLock=await inspectManagedRecovery(root);
  if(recoveryBeforeLock.blocked) {
    throw new Error('Recovery state cannot be trusted before acquiring a legacy lock.');
  }
  if(recoveryBeforeLock.transaction?.formatVersion===2||
     recoveryBeforeLock.backup?.formatVersion===2) {
    throw new Error('Versioned recovery state requires the dedicated schema-v2 handler.');
  }
  await resolveProjectPath(root,'.vcp/transaction.json',{purpose:'managed-state'});
  let lockAcquired = false;

  try {
    await acquireUpdateLock(root);
    lockAcquired = true;

    const transaction = await readTransaction(root);
    const interruptedStageRoot = transactionStageRoot(root, transaction?.id);
    const backups = await listBackups(root);
    const latestBackup = await newestBackupId(root, backups);

    let selected;
    if (transaction?.backupId) {
      if (backupId && backupId !== transaction.backupId) {
        throw new Error(`An interrupted update requires backup ${transaction.backupId}; refusing to restore unrelated backup ${backupId}.`);
      }
      selected = transaction.backupId;
    } else {
      if (backupId && backupId !== latestBackup) {
        throw new Error('VCP v0.9 supports rollback only to the newest backup. Older backups are retained for inspection but cannot be restored directly because later updates may have changed additional managed paths.');
      }
      selected = backupId ?? latestBackup;
    }

    if (!selected) throw new Error('No VCP backup is available to roll back.');
    await assertLegacyRollbackCompatible(root,selected,transaction);

    const restored = await restoreBackup(root, selected);
    lockAcquired = false;
    await cleanupStage(root, interruptedStageRoot);
    return {
      backupId: selected,
      restoredVersion: restored.installedVersion,
      recoveredInterruptedUpdate: Boolean(transaction),
      restoredAt: new Date().toISOString()
    };
  } finally {
    if (lockAcquired) await releaseUpdateLock(root).catch(() => {});
  }
}
