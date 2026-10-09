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

async function withStateLock(root, operation) {
  const inspection=await inspectProject(root);
  if (inspection.classification!=='MANAGED'||inspection.schemaVersion!==1) {
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

  return withStateLock(root, async () => {
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
}

export async function trackPath({ targetDir, relativePath }) {
  const root = path.resolve(targetDir);
  const relative = normalizeManagedPath(relativePath);

  return withStateLock(root, async () => {
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
}
