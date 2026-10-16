import path from 'node:path';
import { buildDesiredFiles, normalizeManagedPath } from './template.mjs';
import {
  acquireUpdateLock,
  hashContent,
  readManagedFile,
  readManifest,
  releaseUpdateLock,
  removeBaseline,
  writeBaseline,
  writeManagedFile,
  writeManifest
} from './state.mjs';
import { getCliVersion } from './version.mjs';
import { inspectProject } from './adoption-inspect.mjs';
import { verifyWriterBoundary,recordWriterEvidence } from './production-writer.mjs';

async function withStateLock(root, operation) {
  const inspection=await inspectProject(root);
  if (inspection.reason==='ACTIVE_OR_STALE_LOCK') {
    // A lock is held: fall through so acquireUpdateLock emits its specific,
    // actionable error (or reaps a stale lock) instead of masking it behind
    // the generic message.
  } else if (inspection.classification!=='MANAGED'||inspection.schemaVersion!==1) {
    throw new Error('Manage requires an unlocked readable schema-v1 managed repository; no state created.');
  }
  let lockAcquired = false;
  try {
    await acquireUpdateLock(root);
    lockAcquired = true;
    return await operation();
  } finally {
    if (lockAcquired) await releaseUpdateLock(root).catch(() => {});
  }
}

export async function ignorePath({ targetDir, relativePath }) {
  const root = path.resolve(targetDir);
  const relative = normalizeManagedPath(relativePath);
  // B-1 writer boundary: identity + namespace verification for every
  // mutation path. Legacy v1 authorization semantics unchanged.
  const boundary=await verifyWriterBoundary({root,operation:'ignorePath'});

  const result=await withStateLock(root, async () => {
    const manifest = await readManifest(root);
    const ignored = new Set(manifest.ignoredFiles ?? []);
    const alreadyIgnored = ignored.has(relative);
    const wasManaged = Boolean(manifest.managedFiles[relative]);
    if (!wasManaged && !alreadyIgnored) {
      throw new Error(`Current VCP package does not manage ${relative}.`);
    }
    if (alreadyIgnored && !wasManaged) {
      return {path:relative,changed:false,ignored:true};
    }

    ignored.add(relative);
    delete manifest.managedFiles[relative];
    manifest.ignoredFiles = [...ignored].sort();
    manifest.updatedAt = new Date().toISOString();

    await writeManifest(root, manifest);
    await removeBaseline(root, relative);
    return { path: relative, changed: wasManaged || !alreadyIgnored, ignored: true };
  });
  // B-1 writer boundary: evidence hook (append-only audit).
  await recordWriterEvidence({root,operation:'ignorePath',
    principal:boundary.principal,result:{path:relative}}).catch(()=>{});
  return result;
}

export async function trackPath({ targetDir, relativePath }) {
  const root = path.resolve(targetDir);
  const relative = normalizeManagedPath(relativePath);
  // B-1 writer boundary: identity + namespace verification for every
  // mutation path. Legacy v1 authorization semantics unchanged.
  const boundary=await verifyWriterBoundary({root,operation:'trackPath'});

  const result=await withStateLock(root, async () => {
    const manifest = await readManifest(root);
    const ignored = new Set(manifest.ignoredFiles ?? []);
    if (manifest.managedFiles[relative] && !ignored.has(relative)) {
      return {
        path: relative,
        changed: false,
        ignored: false,
        created: false,
        alreadyTracked: true
      };
    }

    const desired = await buildDesiredFiles({
      targetDir: root,
      agent: manifest.install.agent ?? 'generic',
      stack: manifest.install.stack ?? 'auto',
      includeGitHub: manifest.install.includeGitHub !== false,
      assetSet: manifest.schemaVersion === 1 ? 'legacy-full-v1' : manifest.install.assetSet
    });
    const file = desired.files.get(relative);
    if (!file) throw new Error(`Current VCP package does not manage ${relative}.`);

    const current = await readManagedFile(root, relative);
    if (!current.exists) await writeManagedFile(root, relative, file.content, file.mode);

    const baselinePath = await writeBaseline(root, relative, file.content);
    manifest.managedFiles[relative] = {
      policy: file.policy,
      origin: file.origin,
      mode: file.mode,
      baselineHash: hashContent(file.content),
      baselinePath,
      templateVersion: await getCliVersion()
    };
    manifest.ignoredFiles = (manifest.ignoredFiles ?? []).filter((item) => item !== relative);
    manifest.updatedAt = new Date().toISOString();

    await writeManifest(root, manifest);
    return { path: relative, changed: true, ignored: false, created: !current.exists };
  });
  // B-1 writer boundary: evidence hook (append-only audit).
  await recordWriterEvidence({root,operation:'trackPath',
    principal:boundary.principal,result:{path:relative}}).catch(()=>{});
  return result;
}
