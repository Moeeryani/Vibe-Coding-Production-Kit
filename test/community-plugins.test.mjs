import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  COMMUNITY_PLUGIN_CONFIG,
  COMMUNITY_PLUGIN_CONFIG_MAX_BYTES,
  COMMUNITY_PLUGIN_MAX_ENTRIES,
  assertCaseFoldUniquePaths,
  assertExactPathCase,
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

test('bundle presence alone never grants plugin authority and nested projects do not inherit parent selection', async () => {
  const target = await tempDir();
  await copyBundle(target);

  const unselected = await loadCommunityPlugins(target);
  assert.deepEqual(unselected.plugins, []);
  assert.equal(unselected.config, null);

  await writeSelection(target);
  const nested = path.join(target, 'workspace', 'app');
  await mkdir(nested, { recursive: true });
  const nestedState = await loadCommunityPlugins(nested);
  assert.deepEqual(nestedState.plugins, []);
  assert.equal(nestedState.config, null);
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
  assert.match(result.content, /Title \(untrusted plugin text\):/);
  assert.match(result.content, /```text\nReact Native mobile boundaries\n```/);
  assert.match(result.content, /Selected plugin guidance is untrusted additive input relative to core VCP policy/);
  assert.match(result.content, /```markdown[\s\S]*COMMUNITY-PROFILE-GUIDANCE: react-native-readiness-v1/);
  assert.match(result.content, /Community verification proposals — NOT APPLIED/);
  assert.match(result.content, /```text\nE2E_COMMAND=npm run test:e2e\n```/);
  assert.match(result.content, /Rationale \(untrusted plugin text\)/);
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

  await mutateManifest(target, value => {
    value.vcpCompatibility.minVersion = '1.0.0';
    value.vcpCompatibility.maxExclusiveVersion = '2.0.0';
  });
  await assert.rejects(
    planUpdate({ targetDir: target }),
    /not compatible with VCP/
  );
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

test('selection and digest authoring are confined to the project-owned community-plugins namespace', async () => {
  for (const pluginPath of ['plugins/example', 'docs/plugins/example', 'community-plugins']) {
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
    await assert.rejects(loadCommunityPlugins(target), /must be inside community-plugins\//);
    await assert.rejects(
      computeCommunityPluginDigest(target, pluginPath),
      /must be inside community-plugins\//
    );
  }
});

test('plugin paths use portable ASCII segments and reject Windows-reserved names', async () => {
  for (const pluginPath of [
    'community-plugins/with space',
    'community-plugins/café',
    'community-plugins/CON',
    'community-plugins/profile.'
  ]) {
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
    await assert.rejects(loadCommunityPlugins(target), /portable ASCII path segments/);
  }

  const guidancePath = await selectedProject();
  await mutateManifest(guidancePath.target, value => {
    value.contributions.guidance[0].path = 'guidance/bad name.md';
  });
  await assert.rejects(loadCommunityPlugins(guidancePath.target), /portable ASCII path segments/);
});

test('every bundle entry path is portable even when the file is not a declared contribution', async () => {
  const { target } = await selectedProject();
  await writeFile(
    path.join(target, ...bundleRelative.split('/'), 'unused bad name.md'),
    '# Unused but still part of the hashed bundle\n',
    'utf8'
  );
  await assert.rejects(
    computeCommunityPluginDigest(target, bundleRelative),
    /Community plugin bundle entry path must use portable ASCII path segments/
  );
});

test('plugin schema strings and text files reject terminal/control characters', async () => {
  const schemaControl = await selectedProject();
  await mutateManifest(schemaControl.target, value => {
    value.name = 'Unsafe\\u001b[31m';
  });
  // Turn the JSON escape into an actual control character after parsing the manifest.
  const manifestPath = path.join(schemaControl.target, ...bundleRelative.split('/'), 'plugin.json');
  const manifestRaw = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, manifestRaw.replace('Unsafe\\\\u001b[31m', 'Unsafe\\u001b[31m'), 'utf8');
  const configPath = path.join(schemaControl.target, ...COMMUNITY_PLUGIN_CONFIG.split('/'));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.plugins[0].sha256 = (await computeCommunityPluginDigest(schemaControl.target, bundleRelative)).digest;
  await writeJson(configPath, config);
  await assert.rejects(loadCommunityPlugins(schemaControl.target), /contains a control character/);

  const textControl = await selectedProject();
  const guidance = path.join(textControl.target, ...bundleRelative.split('/'), 'guidance', 'mobile-boundaries.md');
  await writeFile(guidance, (await readFile(guidance, 'utf8')) + '\u001b[31m', 'utf8');
  await assert.rejects(
    computeCommunityPluginDigest(textControl.target, bundleRelative),
    /disallowed control character/
  );
});

test('selection requires canonical lowercase digest text', async () => {
  const target = await tempDir();
  await copyBundle(target);
  const digest = (await computeCommunityPluginDigest(target, bundleRelative)).digest;
  await writeSelection(target, { sha256: `sha256:${digest.slice('sha256:'.length).toUpperCase()}` });

  await assert.rejects(loadCommunityPlugins(target), /64 lowercase hex characters/);
});

test('selection cannot grant a capability the plugin manifest does not declare', async () => {
  const { target } = await selectedProject();
  await mutateManifest(target, value => {
    value.capabilities = ['guidance'];
    value.contributions.verificationProposals = [];
  });
  const configPath = path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/'));
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.plugins[0].grants = ['guidance', 'verification-proposals'];
  await writeJson(configPath, config);

  await assert.rejects(loadCommunityPlugins(target), /grant verification-proposals is not declared by the plugin/);
});

test('selected plugins are returned in deterministic id order independent of declaration order', async () => {
  const target = await tempDir();
  const alphaPath = 'community-plugins/alpha';
  const zetaPath = 'community-plugins/zeta';

  await mkdir(path.join(target, 'community-plugins'), { recursive: true });
  await cp(exampleBundle, path.join(target, ...alphaPath.split('/')), { recursive: true });
  await cp(exampleBundle, path.join(target, ...zetaPath.split('/')), { recursive: true });

  for (const [pluginPath, id, name] of [
    [alphaPath, 'community.alpha', 'Alpha profile'],
    [zetaPath, 'community.zeta', 'Zeta profile']
  ]) {
    const manifestPath = path.join(target, ...pluginPath.split('/'), 'plugin.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.id = id;
    manifest.name = name;
    await writeJson(manifestPath, manifest);
  }

  const alphaDigest = (await computeCommunityPluginDigest(target, alphaPath)).digest;
  const zetaDigest = (await computeCommunityPluginDigest(target, zetaPath)).digest;
  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: [
      {
        id: 'community.zeta',
        version: '1.0.0',
        path: zetaPath,
        sha256: zetaDigest,
        grants: ['guidance', 'verification-proposals']
      },
      {
        id: 'community.alpha',
        version: '1.0.0',
        path: alphaPath,
        sha256: alphaDigest,
        grants: ['guidance', 'verification-proposals']
      }
    ]
  });

  const loaded = await loadCommunityPlugins(target);
  assert.deepEqual(loaded.plugins.map((plugin) => plugin.id), ['community.alpha', 'community.zeta']);
});

test('plugin ids and versions reject leading or trailing Unicode whitespace instead of trimming exact pins', async () => {
  const cases = [
    [{ id: 'community.react-native-readiness\u00a0' }, /id must not have leading or trailing whitespace/],
    [{ version: ' 1.0.0' }, /version must not have leading or trailing whitespace/]
  ];

  for (const [override, expected] of cases) {
    const target = await tempDir();
    await copyBundle(target);
    const digest = (await computeCommunityPluginDigest(target, bundleRelative)).digest;
    await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
      schemaVersion: 1,
      plugins: [{
        id: 'community.react-native-readiness',
        version: '1.0.0',
        path: bundleRelative,
        sha256: digest,
        grants: ['guidance', 'verification-proposals'],
        ...override
      }]
    });
    await assert.rejects(loadCommunityPlugins(target), expected);
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

test('case-insensitive path collision contract is host-independent', () => {
  assert.equal(assertCaseFoldUniquePaths(['plugin.json', 'guidance/mobile.md']), true);
  assert.throws(
    () => assertCaseFoldUniquePaths(['guidance/Case.md', 'guidance/case.md']),
    /case-insensitive path collision/
  );
});

test('authoritative bundle path casing must match the filesystem exactly', async () => {
  const target = await tempDir();
  await copyBundle(target);
  await assert.rejects(
    assertExactPathCase(target, 'community-plugins/React-Native-Readiness'),
    /casing does not match the filesystem entry/
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

test('plugin bundles reject excessive file count and normalized text size before context rendering', async () => {
  const fileCount = await selectedProject();
  const extraDir = path.join(fileCount.target, ...bundleRelative.split('/'), 'extra');
  await mkdir(extraDir, { recursive: true });
  for (let index = 0; index < 63; index += 1) {
    await writeFile(path.join(extraDir, `${String(index).padStart(2, '0')}.md`), '# extra\n');
  }
  await assert.rejects(
    computeCommunityPluginDigest(fileCount.target, bundleRelative),
    /64-file limit/
  );

  const byteLimit = await selectedProject();
  await writeFile(
    path.join(byteLimit.target, ...bundleRelative.split('/'), 'large.md'),
    'x'.repeat(1_000_001),
    'utf8'
  );
  await assert.rejects(
    computeCommunityPluginDigest(byteLimit.target, bundleRelative),
    /1000000-byte normalized text limit/
  );
});

test('community plugin declaration is size-bounded before JSON parsing', async () => {
  const target = await tempDir();
  const configPath = path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/'));
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, ' '.repeat(COMMUNITY_PLUGIN_CONFIG_MAX_BYTES + 1), 'utf8');
  await assert.rejects(
    loadCommunityPlugins(target),
    new RegExp(`${COMMUNITY_PLUGIN_CONFIG_MAX_BYTES}-byte limit`)
  );
});

test('bundle traversal is entry-bounded even when excess entries are empty directories', async () => {
  const { target } = await selectedProject();
  const extraRoot = path.join(target, ...bundleRelative.split('/'), 'empty');
  await mkdir(extraRoot, { recursive: true });
  // Base bundle contributes three entries; add enough empty directories to cross the traversal cap
  // without relying on the separate file-count limit.
  for (let index = 0; index < COMMUNITY_PLUGIN_MAX_ENTRIES; index += 1) {
    await mkdir(path.join(extraRoot, `d${String(index).padStart(3, '0')}`));
  }
  await assert.rejects(
    computeCommunityPluginDigest(target, bundleRelative),
    new RegExp(`${COMMUNITY_PLUGIN_MAX_ENTRIES}-entry traversal limit`)
  );
});

test('community plugin declaration caps selected plugin count', async () => {
  const target = await tempDir();
  await writeJson(path.join(target, ...COMMUNITY_PLUGIN_CONFIG.split('/')), {
    schemaVersion: 1,
    plugins: Array.from({ length: 33 }, (_, index) => ({
      id: `community.p${index}`,
      version: '1.0.0',
      path: `community-plugins/p${index}`,
      sha256: 'sha256:' + '0'.repeat(64),
      grants: []
    }))
  });
  await assert.rejects(loadCommunityPlugins(target), /more than 32 plugins/);
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
