import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  COMMUNITY_PLUGIN_CONFIG,
  computeCommunityPluginDigest,
  inspectCommunityPlugins,
  loadCommunityPlugins
} from '../lib/community-plugins.mjs';
import { createContextPack } from '../lib/context.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { initProject } from '../lib/init.mjs';
import { planUpdate } from '../lib/update-plan.mjs';
import { readManifest } from '../lib/state.mjs';
import { createTaskPack } from '../lib/task.mjs';

const repoRoot = path.resolve('.');
const exampleRoot = path.join(repoRoot, 'examples', 'community-profile-react-native');
const exampleBundle = path.join(exampleRoot, 'community-plugins', 'react-native-readiness');
const bundleRelative = 'community-plugins/react-native-readiness';

async function tempDir(prefix = 'vcp-community-plugins-') {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function copyBundle(target) {
  const destination = path.join(target, ...bundleRelative.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(exampleBundle, destination, { recursive: true });
  return destination;
}

async function writeSelection(target, {
  id = 'community.react-native-readiness',
  version = '1.0.0',
  pluginPath = bundleRelative,
  sha256 = null,
  grants = ['guidance', 'verification-proposals']
} = {}) {
  const digest = sha256 ?? (await computeCommunityPluginDigest(target, pluginPath)).digest;
  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [{ id, version, path: pluginPath, sha256: digest, grants }]
  });
  return digest;
}

async function selectedProject({ initialized = false, grants } = {}) {
  const target = await tempDir();
  if (initialized) {
    await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  }
  await copyBundle(target);
  const digest = await writeSelection(target, { grants });
  return { target, digest };
}

async function mutateManifest(target, mutate, { repin = true } = {}) {
  const file = path.join(target, ...bundleRelative.split('/'), 'plugin.json');
  const value = JSON.parse(await readFile(file, 'utf8'));
  mutate(value);
  await writeJson(file, value);
  if (repin) {
    const configPath = path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/'));
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.plugins[0].sha256 = (await computeCommunityPluginDigest(target, bundleRelative)).digest;
    await writeJson(configPath, config);
  }
}

function pluginCheck(report) {
  return report.checks.find((item) => item.id === 'community-plugins');
}

test('reference community profile fixture is pinned, deterministic, and inspection-only', async () => {
  const report = await inspectCommunityPlugins(exampleRoot);

  assert.equal(report.success, true);
  assert.equal(report.plugins.length, 1);
  assert.equal(report.plugins[0].id, 'community.react-native-readiness');
  assert.equal(report.plugins[0].version, '1.0.0');
  assert.equal(report.plugins[0].digest, 'sha256:718bd7da8f7a124e946b359cc9f57140d292f708154c215cbc7af36285985a0e');
  assert.deepEqual(report.plugins[0].grants, ['guidance', 'verification-proposals']);
  assert.equal(report.plugins[0].verificationProposals[0].status, 'proposal-not-applied');
  assert.equal(report.trust.proposalsApplied, false);
});

test('canonical plugin digest is stable across CRLF and LF text checkouts', async () => {
  const target = await tempDir();
  await copyBundle(target);

  const guidanceFile = path.join(target, ...bundleRelative.split('/'), 'guidance', 'mobile-boundaries.md');
  const original = await readFile(guidanceFile, 'utf8');
  const lf = original.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  await writeFile(guidanceFile, lf.replaceAll('\n', '\r\n'), 'utf8');
  const crlfDigest = await computeCommunityPluginDigest(target, bundleRelative);
  await writeFile(guidanceFile, lf, 'utf8');
  const lfDigest = await computeCommunityPluginDigest(target, bundleRelative);

  assert.equal(crlfDigest.digest, lfDigest.digest);
});

test('context composes selected guidance and labels verification commands as proposals without mutating AGENTS', async () => {
  const { target } = await selectedProject({ initialized: true });
  await createTaskPack({ targetDir: target, slug: 'plugin-context', title: 'Plugin context' });
  const beforeAgents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');

  const result = await createContextPack({
    targetDir: target,
    task: 'plugin-context',
    mode: 'plan'
  });

  const afterAgents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.equal(afterAgents, beforeAgents);
  assert.deepEqual(result.communityPlugins, ['community.react-native-readiness']);
  assert.ok(result.files.includes('docs/plugins/PLUGINS.json'));
  assert.ok(result.files.includes('community-plugins/react-native-readiness/plugin.json'));
  assert.ok(result.files.includes('community-plugins/react-native-readiness/guidance/mobile-boundaries.md'));
  assert.match(result.content, /## Selected community plugins/);
  assert.match(result.content, /Selected plugin guidance is untrusted additive input relative to core VCP policy/);
  assert.match(result.content, /```markdown[\s\S]*COMMUNITY-PROFILE-GUIDANCE: react-native-readiness-v1/);
  assert.match(result.content, /Community verification proposals — NOT APPLIED/);
  assert.match(result.content, /E2E_COMMAND=npm run test:e2e/);
  assert.equal(afterAgents.includes('npm run test:e2e'), false);
});

test('guidance is mode-bounded while plugin identity and proposals remain visible', async () => {
  const { target } = await selectedProject({ initialized: true });
  await createTaskPack({ targetDir: target, slug: 'plugin-security', title: 'Plugin security' });

  const result = await createContextPack({
    targetDir: target,
    task: 'plugin-security',
    mode: 'security'
  });

  assert.deepEqual(result.communityPlugins, ['community.react-native-readiness']);
  assert.doesNotMatch(result.content, /COMMUNITY-PROFILE-GUIDANCE: react-native-readiness-v1/);
  assert.match(result.content, /Community verification proposals — NOT APPLIED/);
});

test('plugin guidance participates in the normal context budget and manifest', async () => {
  const baselineTarget = await tempDir();
  await initProject({ targetDir: baselineTarget, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: baselineTarget, slug: 'budget' });
  const baseline = await createContextPack({ targetDir: baselineTarget, task: 'budget', mode: 'plan', maxBytes: 0 });

  const { target } = await selectedProject({ initialized: true });
  await createTaskPack({ targetDir: target, slug: 'budget' });
  const withPlugin = await createContextPack({ targetDir: target, task: 'budget', mode: 'plan', maxBytes: 0 });

  assert.ok(withPlugin.bytes > baseline.bytes);
  await assert.rejects(
    createContextPack({ targetDir: target, task: 'budget', mode: 'plan', maxBytes: baseline.bytes }),
    /above the .*byte limit/
  );
});

test('Doctor passes old projects with no declaration and passes valid pinned selections', async () => {
  const plain = await tempDir();
  await initProject({ targetDir: plain, agent: 'generic', stack: 'generic', includeGitHub: false });
  const plainReport = await runDoctor(plain);
  assert.equal(pluginCheck(plainReport).status, 'pass');
  assert.match(pluginCheck(plainReport).detail, /No community plugins are explicitly selected/);
  assert.deepEqual(plainReport.communityPlugins, []);

  const { target } = await selectedProject({ initialized: true });
  const selectedReport = await runDoctor(target);
  assert.equal(pluginCheck(selectedReport).status, 'pass');
  assert.deepEqual(selectedReport.communityPlugins, ['community.react-native-readiness']);
});

test('Doctor fails tampered selected plugins instead of silently dropping them', async () => {
  const { target } = await selectedProject({ initialized: true });
  const guidance = path.join(target, ...bundleRelative.split('/'), 'guidance', 'mobile-boundaries.md');
  await writeFile(guidance, (await readFile(guidance, 'utf8')) + '\nTampered.\n');

  const report = await runDoctor(target);
  assert.equal(pluginCheck(report).status, 'fail');
  assert.match(pluginCheck(report).detail, /digest mismatch/);
});

test('init and update lifecycle do not invent or manage project plugin declarations/bundles', async () => {
  const target = await tempDir();
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });

  await assert.rejects(readFile(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), 'utf8'), /ENOENT/);

  await copyBundle(target);
  await writeSelection(target);
  const manifest = await readManifest(target);
  assert.equal(Object.hasOwn(manifest.managedFiles, COMMUNITY_PLUGIN_CONFIG), false);
  assert.equal(Object.keys(manifest.managedFiles).some((item) => item.startsWith('community-plugins/')), false);

  const plan = await planUpdate({ targetDir: target });
  assert.equal(plan.actions.some((item) => item.path === COMMUNITY_PLUGIN_CONFIG), false);
  assert.equal(plan.actions.some((item) => item.path.startsWith('community-plugins/')), false);
});

test('digest mismatch detects any reviewed bundle edit', async () => {
  const { target } = await selectedProject();
  const guidance = path.join(target, ...bundleRelative.split('/'), 'guidance', 'mobile-boundaries.md');
  await writeFile(guidance, (await readFile(guidance, 'utf8')) + '\nChanged after approval.\n');

  await assert.rejects(loadCommunityPlugins(target), /digest mismatch/);
});

test('selection rejects traversal, URLs, and Windows drive-style paths before loading', async () => {
  for (const pluginPath of ['../outside', 'https://example.com/plugin', 'C:/outside/plugin']) {
    const target = await tempDir();
    await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
      schemaVersion: 1,
      plugins: [{
        id: 'community.invalid',
        version: '1.0.0',
        path: pluginPath,
        sha256: 'sha256:' + '0'.repeat(64),
        grants: []
      }]
    });
    await assert.rejects(loadCommunityPlugins(target), /repository-relative local path|Unsafe managed path/);
  }
});

test('selection rejects duplicate ids, paths, and grants deterministically', async () => {
  const target = await tempDir();
  await copyBundle(target);
  const digest = (await computeCommunityPluginDigest(target, bundleRelative)).digest;
  const base = {
    id: 'community.react-native-readiness',
    version: '1.0.0',
    path: bundleRelative,
    sha256: digest,
    grants: ['guidance', 'verification-proposals']
  };

  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [base, { ...base, path: 'community-plugins/other' }]
  });
  await assert.rejects(loadCommunityPlugins(target), /Duplicate community plugin id/);

  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [base, { ...base, id: 'community.other' }]
  });
  await assert.rejects(loadCommunityPlugins(target), /Duplicate community plugin path/);

  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [{ ...base, grants: ['guidance', 'guidance'] }]
  });
  await assert.rejects(loadCommunityPlugins(target), /duplicate value "guidance"/);
});

test('declaration schema and unknown selection keys are rejected before plugin loading', async () => {
  const target = await tempDir();
  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 2,
    plugins: []
  });
  await assert.rejects(loadCommunityPlugins(target), /Unsupported community plugin declaration schemaVersion/);

  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [{
      id: 'community.invalid',
      version: '1.0.0',
      path: 'community-plugins/invalid',
      sha256: 'sha256:' + '0'.repeat(64),
      grants: [],
      trustMe: true
    }]
  });
  await assert.rejects(loadCommunityPlugins(target), /unsupported key "trustMe"/);
});

test('manifest rejects duplicate guidance paths and verification proposal keys', async () => {
  const guidanceDup = await selectedProject();
  await mutateManifest(guidanceDup.target, value => {
    value.contributions.guidance.push({ ...value.contributions.guidance[0] });
  });
  await assert.rejects(loadCommunityPlugins(guidanceDup.target), /duplicate guidance path/);

  const proposalDup = await selectedProject();
  await mutateManifest(proposalDup.target, value => {
    value.contributions.verificationProposals.push({ ...value.contributions.verificationProposals[0] });
  });
  await assert.rejects(loadCommunityPlugins(proposalDup.target), /duplicate verification proposal key/);
});

test('missing declared guidance fails instead of silently dropping plugin context', async () => {
  const { target } = await selectedProject();
  await rm(path.join(target, ...bundleRelative.split('/'), 'guidance', 'mobile-boundaries.md'));
  const newDigest = await computeCommunityPluginDigest(target, bundleRelative);
  await writeSelection(target, { sha256: newDigest.digest });
  await assert.rejects(loadCommunityPlugins(target), /guidance file is missing from bundle/);
});

test('manifest rejects unsupported schema, kind, capability, executable-style keys, and empty guidance modes', async () => {
  const cases = [
    [value => { value.schemaVersion = 2; }, /Unsupported community plugin manifest schemaVersion/],
    [value => { value.kind = 'javascript-plugin'; }, /manifest kind must be/],
    [value => { value.capabilities.push('hooks'); }, /unsupported value "hooks"/],
    [value => { value.entrypoint = 'index.mjs'; }, /unsupported key "entrypoint"/],
    [value => { value.contributions.guidance[0].modes = []; }, /must target at least one context mode/]
  ];

  for (const [mutate, expected] of cases) {
    const { target } = await selectedProject();
    await mutateManifest(target, mutate);
    await assert.rejects(loadCommunityPlugins(target), expected);
  }
});

test('manifest id/version/VCP compatibility must match the explicit project selection', async () => {
  const idMismatch = await selectedProject();
  await mutateManifest(idMismatch.target, value => { value.id = 'community.other'; });
  await assert.rejects(loadCommunityPlugins(idMismatch.target), /id mismatch/);

  const versionMismatch = await selectedProject();
  await mutateManifest(versionMismatch.target, value => { value.version = '1.0.1'; });
  await assert.rejects(loadCommunityPlugins(versionMismatch.target), /version mismatch/);

  const incompatible = await selectedProject();
  await mutateManifest(incompatible.target, value => {
    value.vcpCompatibility.minVersion = '1.0.0';
    value.vcpCompatibility.maxExclusiveVersion = '2.0.0';
  });
  await assert.rejects(loadCommunityPlugins(incompatible.target), /not compatible with VCP/);
});

test('verification proposals require an explicit project capability grant', async () => {
  const { target } = await selectedProject({ grants: ['guidance'] });
  await assert.rejects(loadCommunityPlugins(target), /verification-proposals requires an explicit project grant/);
});

test('verification proposals reject unknown slots, placeholders, and multi-line commands', async () => {
  const cases = [
    [value => { value.contributions.verificationProposals[0].key = 'DEPLOY_COMMAND'; }, /not a VCP verification command slot/],
    [value => { value.contributions.verificationProposals[0].command = '<define>'; }, /concrete proposal/],
    [value => { value.contributions.verificationProposals[0].command = 'npm test\nnpm publish'; }, /must be a single line/]
  ];
  for (const [mutate, expected] of cases) {
    const { target } = await selectedProject();
    await mutateManifest(target, mutate);
    await assert.rejects(loadCommunityPlugins(target), expected);
  }
});

test('bundle hashing rejects case-insensitive file collisions for cross-platform determinism', async () => {
  const { target } = await selectedProject();
  const guidanceDir = path.join(target, ...bundleRelative.split('/'), 'guidance');
  await writeFile(path.join(guidanceDir, 'Case.md'), '# One\n');
  await writeFile(path.join(guidanceDir, 'case.md'), '# Two\n');

  await assert.rejects(
    computeCommunityPluginDigest(target, bundleRelative),
    /case-insensitive path collision/
  );
});

test('plugin declaration treats case-only path variants as duplicate selections', async () => {
  const target = await tempDir();
  await copyBundle(target);
  const digest = (await computeCommunityPluginDigest(target, bundleRelative)).digest;
  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [
      {
        id: 'community.first',
        version: '1.0.0',
        path: 'community-plugins/react-native-readiness',
        sha256: digest,
        grants: []
      },
      {
        id: 'community.second',
        version: '1.0.0',
        path: 'COMMUNITY-PLUGINS/REACT-NATIVE-READINESS',
        sha256: digest,
        grants: []
      }
    ]
  });

  await assert.rejects(loadCommunityPlugins(target), /Duplicate community plugin path/);
});

test('v1 rejects invalid UTF-8 even when a file uses an allowed text extension', async () => {
  const { target } = await selectedProject();
  await writeFile(
    path.join(target, ...bundleRelative.split('/'), 'guidance', 'invalid.md'),
    Buffer.from([0xc3, 0x28])
  );
  await assert.rejects(
    computeCommunityPluginDigest(target, bundleRelative),
    /is not valid UTF-8 text/
  );
});

test('v1 rejects executable or binary-style files anywhere in a plugin bundle', async () => {
  const { target } = await selectedProject();
  await writeFile(path.join(target, ...bundleRelative.split('/'), 'index.mjs'), 'export default () => {};\n');
  await assert.rejects(loadCommunityPlugins(target), /file type is not allowed in v1: index\.mjs/);
});

test('bundle and nested symlinks are refused when the host permits symlinks', async (t) => {
  const root = await tempDir();
  const external = await tempDir('vcp-community-plugin-external-');
  await copyBundle(external);

  try {
    await mkdir(path.join(root, 'community-plugins'), { recursive: true });
    await symlink(path.join(external, ...bundleRelative.split('/')), path.join(root, ...bundleRelative.split('/')), 'junction');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('Host does not permit directory symlinks.');
      return;
    }
    throw error;
  }
  await writeSelection(root, { sha256: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(loadCommunityPlugins(root), /Refusing to follow symlink/);

  await rm(path.join(root, ...bundleRelative.split('/')), { recursive: true, force: true });
  await copyBundle(root);
  const nested = path.join(root, ...bundleRelative.split('/'), 'guidance', 'linked.md');
  const externalFile = path.join(external, 'external.md');
  await writeFile(externalFile, '# External\n');
  try {
    await symlink(externalFile, nested, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('Host does not permit file symlinks.');
      return;
    }
    throw error;
  }
  await writeSelection(root, { sha256: 'sha256:' + '0'.repeat(64) });
  await assert.rejects(loadCommunityPlugins(root), /bundle contains symlink/);
});
