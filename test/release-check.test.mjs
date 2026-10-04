import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  evaluateReleasePack,
  formatReleaseCheckReport,
  releaseCheckExitCode,
  runReleaseCheck,
  validateInstallEvidence,
  validateLifecycleEvidence,
  windowsAliasCommand,
  runAliasVersion
} from '../lib/release-check.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve('.');

async function git(root, args) {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return stdout.trim();
}

async function commitAll(root, message) {
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', message]);
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function makeReleaseFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp-release-fixture-'));
  await git(root, ['init']);
  await git(root, ['config', 'user.email', 'release-test@example.com']);
  await git(root, ['config', 'user.name', 'Release Test']);

  await writeJson(path.join(root, 'package.json'), {
    name: 'vibe-coding-production',
    version: '0.9.2',
    type: 'module',
    bin: {
      vcp: 'bin/vibe-coding-production.mjs',
      'vibe-coding-production': 'bin/vibe-coding-production.mjs'
    }
  });
  await writeJson(path.join(root, 'package-lock.json'), {
    name: 'vibe-coding-production',
    version: '0.9.2',
    lockfileVersion: 3,
    packages: { '': { name: 'vibe-coding-production', version: '0.9.2' } }
  });
  await mkdir(path.join(root, 'bin'), { recursive: true });
  await writeFile(path.join(root, 'bin', 'vibe-coding-production.mjs'), '#!/usr/bin/env node\nconsole.log("0.9.2");\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [0.9.2] - 2026-09-25\n\n- Previous.\n');
  await commitAll(root, 'previous release');
  const previousCommit = await git(root, ['rev-parse', 'HEAD']);
  await git(root, ['tag', '-a', 'v0.9.2', '-m', 'v0.9.2']);
  const tagObjectSha = await git(root, ['rev-parse', 'refs/tags/v0.9.2']);

  await writeJson(path.join(root, 'package.json'), {
    name: 'vibe-coding-production',
    version: '0.9.3',
    type: 'module',
    bin: {
      vcp: 'bin/vibe-coding-production.mjs',
      'vibe-coding-production': 'bin/vibe-coding-production.mjs'
    }
  });
  await writeJson(path.join(root, 'package-lock.json'), {
    name: 'vibe-coding-production',
    version: '0.9.3',
    lockfileVersion: 3,
    packages: { '': { name: 'vibe-coding-production', version: '0.9.3' } }
  });
  await writeFile(path.join(root, 'bin', 'vibe-coding-production.mjs'), '#!/usr/bin/env node\nconsole.log("0.9.3");\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [0.9.3] - 2026-10-04\n\n- Candidate.\n\n## [0.9.2] - 2026-09-25\n\n- Previous.\n');
  await mkdir(path.join(root, 'docs', 'releases'), { recursive: true });
  await writeFile(
    path.join(root, 'docs', 'releases', 'v0.9.3.md'),
    '# Fixture v0.9.3\n\nRelease status: Candidate — publication requires HUMAN DECISION.\n'
  );
  await writeJson(path.join(root, '.github', 'release-policy.json'), {
    schemaVersion: 1,
    packageName: 'vibe-coding-production',
    changelog: 'CHANGELOG.md',
    releaseNotesPattern: 'docs/releases/v{version}.md',
    previousRelease: {
      version: '0.9.2',
      tag: 'v0.9.2',
      tagObjectSha,
      commitSha: previousCommit
    },
    binNames: ['vcp', 'vibe-coding-production'],
    requiredPackageFiles: ['package.json', 'bin/vibe-coding-production.mjs']
  });
  await commitAll(root, 'candidate');
  return { root, previousCommit, tagObjectSha };
}

function checkById(report, id) {
  return report.checks.find((item) => item.id === id);
}

test('preview validates a clean candidate while retaining tag/publish HUMAN_DECISION boundaries', async () => {
  const { root } = await makeReleaseFixture();
  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });

  assert.equal(report.mode, 'preview');
  assert.equal(report.success, true);
  assert.equal(report.releaseApproved, false);
  assert.equal(report.published, false);
  assert.equal(report.revision.dirty, false);
  assert.deepEqual(report.mechanics.map((item) => item.id), [
    'package-inspection',
    'publish-dry-run',
    'install-smoke',
    'lifecycle-smoke'
  ]);
  assert.match(report.mechanics.find((item) => item.id === 'publish-dry-run').command, /npm publish --dry-run --json/);
  assert.equal(checkById(report, 'candidate-tag').status, 'human-decision');
  assert.equal(checkById(report, 'npm-publish').status, 'human-decision');
  assert.equal(report.summary.planned, 4);
  assert.equal(releaseCheckExitCode(report), 0);
  assert.match(formatReleaseCheckReport(report), /Release approval: HUMAN DECISION/);
});

test('repository policy locks the immutable v0.9.2 tag object and release commit identities', async () => {
  const policy = JSON.parse(await readFile(path.join(repoRoot, '.github', 'release-policy.json'), 'utf8'));
  assert.equal(policy.previousRelease.version, '0.9.2');
  assert.equal(policy.previousRelease.tag, 'v0.9.2');
  assert.equal(policy.previousRelease.tagObjectSha, '5693eec39f8ba24c77b5634534bff094b369880a');
  assert.equal(policy.previousRelease.commitSha, '3fba0ecc963ca896f091442bc250139c67b64ce8');
});

test('dirty candidate worktree fails exact-revision evidence', async () => {
  const { root } = await makeReleaseFixture();
  await writeFile(path.join(root, 'dirty.txt'), 'dirty\n');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });

  assert.equal(report.success, false);
  assert.equal(checkById(report, 'clean-revision').status, 'fail');
});

test('package version mismatch fails even when other candidate metadata is coherent', async () => {
  const { root } = await makeReleaseFixture();
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  pkg.version = '0.9.4';
  await writeJson(path.join(root, 'package.json'), pkg);
  await commitAll(root, 'mismatch package version');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });

  assert.equal(checkById(report, 'package-version').status, 'fail');
  assert.equal(report.success, false);
});

test('fenced changelog headings cannot satisfy release authority', async () => {
  const { root } = await makeReleaseFixture();
  await writeFile(
    path.join(root, 'CHANGELOG.md'),
    '# Changelog\n\n## [Unreleased]\n\n\`\`\`markdown\n## [0.9.3] - 2026-10-04\n\`\`\`\n\n## [0.9.2] - 2026-09-25\n'
  );
  await commitAll(root, 'fenced fake changelog');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });

  assert.equal(checkById(report, 'changelog-version').status, 'fail');
});

test('duplicate Unreleased headings fail release authority', async () => {
  const { root } = await makeReleaseFixture();
  const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  await writeFile(path.join(root, 'CHANGELOG.md'), changelog + '\n## [Unreleased]\n');
  await commitAll(root, 'duplicate unreleased heading');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  assert.equal(checkById(report, 'changelog-unreleased').status, 'fail');
});

test('Unreleased bullets block a prepared release candidate', async () => {
  const { root } = await makeReleaseFixture();
  const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  await writeFile(path.join(root, 'CHANGELOG.md'), changelog.replace('## [Unreleased]\n', '## [Unreleased]\n\n- Not rolled.\n'));
  await commitAll(root, 'unreleased bullet');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  assert.equal(checkById(report, 'changelog-unreleased').status, 'fail');
});

test('release notes require candidate version identity in the top-level title', async () => {
  const { root } = await makeReleaseFixture();
  await writeFile(
    path.join(root, 'docs', 'releases', 'v0.9.3.md'),
    '# Generic release candidate\n\nRelease status: Candidate — publication requires HUMAN DECISION.\n\nMentions v0.9.3 only in body text.\n'
  );
  await commitAll(root, 'weak release notes identity');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  assert.equal(checkById(report, 'release-notes').status, 'fail');
});

test('candidate release marker inside a fenced example is not release authority', async () => {
  const { root } = await makeReleaseFixture();
  await writeFile(
    path.join(root, 'docs', 'releases', 'v0.9.3.md'),
    '# Fixture v0.9.3\n\n\`\`\`text\nRelease status: Candidate — publication requires HUMAN DECISION.\n\`\`\`\n'
  );
  await commitAll(root, 'fenced release marker');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  assert.equal(checkById(report, 'release-notes').status, 'fail');
});

test('missing candidate migration chain fails rather than defaulting release-ready', async () => {
  const { root } = await makeReleaseFixture();
  for (const file of ['package.json', 'package-lock.json']) {
    const value = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    value.version = '0.9.4';
    if (value.packages?.['']) value.packages[''].version = '0.9.4';
    await writeJson(path.join(root, file), value);
  }
  await writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n## [0.9.4] - 2026-10-04\n');
  await writeFile(
    path.join(root, 'docs', 'releases', 'v0.9.4.md'),
    '# Fixture v0.9.4\n\nRelease status: Candidate — publication requires HUMAN DECISION.\n'
  );
  await commitAll(root, 'candidate without migration');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.4' });
  assert.equal(checkById(report, 'migration-chain').status, 'fail');
});

test('existing candidate tag at a different commit fails and is never moved', async () => {
  const { root, previousCommit } = await makeReleaseFixture();
  await git(root, ['tag', '-a', 'v0.9.3', previousCommit, '-m', 'wrong candidate tag']);
  const before = await git(root, ['rev-parse', 'refs/tags/v0.9.3']);

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  const after = await git(root, ['rev-parse', 'refs/tags/v0.9.3']);

  assert.equal(checkById(report, 'candidate-tag').status, 'fail');
  assert.equal(before, after);
});

test('retained previous tag identity mismatch fails visibly', async () => {
  const { root } = await makeReleaseFixture();
  const policyPath = path.join(root, '.github', 'release-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  policy.previousRelease.tagObjectSha = '0000000000000000000000000000000000000000';
  await writeJson(policyPath, policy);
  await commitAll(root, 'bad retained identity');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  assert.equal(checkById(report, 'previous-tag-object').status, 'fail');
});

test('release evidence output is preflighted, overwrite-protected, and excludes command logs', async () => {
  const { root } = await makeReleaseFixture();

  await assert.rejects(
    runReleaseCheck({ targetDir: root, version: '0.9.3', output: '../escape.json', run: true }),
    /escapes the repository root/
  );
  await assert.rejects(
    runReleaseCheck({ targetDir: root, version: '0.9.3', output: '.vcp/manifest.json', run: true }),
    /must stay under \.vcp\/evidence\/releases/
  );

  const output = '.vcp/evidence/releases/0.9.3-preview.json';
  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3', output });
  const evidence = await readFile(path.join(root, ...output.split('/')), 'utf8');
  assert.equal(report.output, output);
  assert.doesNotMatch(evidence, /"stdout"|"stderr"/);
  const parsedEvidence = JSON.parse(evidence);
  assert.equal(parsedEvidence.schemaVersion, 1);
  assert.equal(parsedEvidence.mechanics.length, 4);

  await assert.rejects(
    runReleaseCheck({ targetDir: root, version: '0.9.3', output }),
    /Refusing to overwrite existing release evidence/
  );
});

test('custom release policy symlinks are refused when the host supports symlinks', async (t) => {
  const { root } = await makeReleaseFixture();
  const linked = path.join(root, '.github', 'linked-policy.json');
  try {
    await symlink(path.join(root, '.github', 'release-policy.json'), linked, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('Host does not permit file symlink creation.');
      return;
    }
    throw error;
  }

  await assert.rejects(
    runReleaseCheck({ targetDir: root, version: '0.9.3', policyPath: '.github/linked-policy.json' }),
    /Refusing to follow symlink/
  );
});

test('release policy previous tag must exactly match the declared previous version', async () => {
  const { root } = await makeReleaseFixture();
  const policyPath = path.join(root, '.github', 'release-policy.json');
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  policy.previousRelease.tag = 'v0.9.1';
  await writeJson(policyPath, policy);
  await commitAll(root, 'mismatched previous tag version');

  await assert.rejects(
    runReleaseCheck({ targetDir: root, version: '0.9.3' }),
    /previousRelease\.tag must exactly match previousRelease\.version/
  );
});

test('lockfile root package name must match the release package identity', async () => {
  const { root } = await makeReleaseFixture();
  const lockPath = path.join(root, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  lock.packages[''].name = 'wrong-package-name';
  await writeJson(lockPath, lock);
  await commitAll(root, 'mismatched lock root name');

  const report = await runReleaseCheck({ targetDir: root, version: '0.9.3' });
  assert.equal(checkById(report, 'lockfile-version').status, 'fail');
});

test('release-authority file symlinks are refused when the host supports symlinks', async (t) => {
  const { root } = await makeReleaseFixture();
  const externalRoot = await mkdtemp(path.join(os.tmpdir(), 'vcp-release-external-'));
  const external = path.join(externalRoot, 'CHANGELOG.md');
  await writeFile(external, '# Changelog\n\n## [Unreleased]\n\n## [0.9.3] - 2026-10-04\n', 'utf8');
  const changelog = path.join(root, 'CHANGELOG.md');
  try {
    await import('node:fs/promises').then(({ rm }) => rm(changelog));
    await symlink(external, changelog, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('Host does not permit file symlink creation.');
      return;
    }
    throw error;
  }

  await assert.rejects(
    runReleaseCheck({ targetDir: root, version: '0.9.3' }),
    /Refusing to follow symlink in changelog path/
  );
});

test('Windows alias execution succeeds through cmd.exe when the .cmd path contains spaces', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows cmd.exe execution contract.');
    return;
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'vcp alias execution '));
  const alias = path.join(root, 'vcp.cmd');
  await writeFile(alias, '@echo off\r\necho 0.9.3\r\n', 'utf8');

  try {
    const result = await runAliasVersion(alias, { cwd: root, timeoutMs: 30_000 });
    assert.equal(result.ok, true, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), '0.9.3');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Windows alias command preserves a spaced .cmd path behind the /s outer quote pair', () => {
  const command = windowsAliasCommand('C:\\Temp Folder\\node_modules\\.bin\\vcp.cmd');
  assert.equal(command, '""C:\\Temp Folder\\node_modules\\.bin\\vcp.cmd" --version"');
  assert.throws(() => windowsAliasCommand('C:\\bad"path\\vcp.cmd'), /not safe/);
  assert.throws(() => windowsAliasCommand('C:\\bad\npath\\vcp.cmd'), /not safe/);
});

test('package-surface validator turns red when a required packed file is missing', () => {
  const policy = {
    packageName: 'vibe-coding-production',
    requiredPackageFiles: ['package.json', 'lib/release-check.mjs']
  };
  const result = evaluateReleasePack({
    name: 'vibe-coding-production',
    version: '0.9.3',
    files: [{ path: 'package.json' }]
  }, policy, '0.9.3', true);

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingFiles, ['lib/release-check.mjs']);
});

test('install evidence validator turns red on missing CLI alias and wrong version output', () => {
  const base = {
    pkg: {
      name: 'vibe-coding-production',
      version: '0.9.3',
      bin: {
        vcp: 'bin/vibe-coding-production.mjs',
        'vibe-coding-production': 'bin/vibe-coding-production.mjs'
      }
    },
    packageName: 'vibe-coding-production',
    binNames: ['vcp', 'vibe-coding-production'],
    version: '0.9.3'
  };

  assert.throws(
    () => validateInstallEvidence({
      ...base,
      aliases: { vcp: true, 'vibe-coding-production': false },
      aliasVersionOutputs: { vcp: '0.9.3\n' }
    }),
    /did not create the vibe-coding-production CLI alias/
  );
  assert.throws(
    () => validateInstallEvidence({
      ...base,
      aliases: { vcp: true, 'vibe-coding-production': true },
      aliasVersionOutputs: { vcp: '0.9.3\n', 'vibe-coding-production': '0.9.2\n' }
    }),
    /vibe-coding-production version smoke failed/
  );
  assert.equal(validateInstallEvidence({
    ...base,
    aliases: { vcp: true, 'vibe-coding-production': true },
    aliasVersionOutputs: { vcp: '0.9.3\n', 'vibe-coding-production': '0.9.3\n' }
  }), true);
});

test('lifecycle evidence validator turns red on conflicts, blocked apply, Doctor failure, and non-idempotence', () => {
  const good = {
    preview: { fromVersion: '0.9.2', toVersion: '0.9.3', conflicts: 0, changes: 4, migrationIds: ['m'] },
    apply: { blocked: false, applied: true, toVersion: '0.9.3', backupId: 'backup' },
    doctor: { summary: { pass: 10, warn: 0, fail: 0 } },
    idempotent: { upToDate: true, conflicts: 0 },
    previousVersion: '0.9.2',
    version: '0.9.3'
  };
  assert.equal(validateLifecycleEvidence(good).idempotent, true);
  assert.throws(() => validateLifecycleEvidence({ ...good, preview: { ...good.preview, conflicts: 1 } }), /dry-run/);
  assert.throws(() => validateLifecycleEvidence({ ...good, apply: { ...good.apply, blocked: true } }), /apply/);
  assert.throws(() => validateLifecycleEvidence({ ...good, doctor: { summary: { fail: 1 } } }), /Doctor/);
  assert.throws(() => validateLifecycleEvidence({ ...good, idempotent: { upToDate: false, conflicts: 0 } }), /idempotence/);
});
