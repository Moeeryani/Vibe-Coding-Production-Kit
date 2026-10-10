import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// Legacy downstream lifecycle fixture; never lifts the public D-01 init fence.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { buildDesiredFiles } from '../lib/template.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { createContextPack } from '../lib/context.mjs';
import { runDoctor } from '../lib/doctor.mjs';
import { planUpdate } from '../lib/update.mjs';
import { parseSecurityProfileDeclaration, SECURITY_PROFILE_CONFIG } from '../lib/security-profiles.mjs';

async function project() {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-security-profiles-'));
  await initProject({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });
  await createTaskPack({ targetDir: target, slug: 'security-change', title: 'Security-sensitive change' });
  return target;
}

test('security profile parser composes baseline before explicit profiles', () => {
  const content = '# Security Profile\n\n## Active profiles\n\n- `web-api`\n- `multi-tenant`\n';
  assert.deepEqual(parseSecurityProfileDeclaration(content), ['baseline', 'web-api', 'multi-tenant']);
});

test('security profile parser keeps baseline mandatory for an explicit empty selection', () => {
  assert.deepEqual(
    parseSecurityProfileDeclaration('# Security Profile\n\n## Active profiles\n\nNo extra profiles.\n'),
    ['baseline']
  );
});

test('security profile parser rejects unknown, duplicate, malformed, and missing-section declarations', () => {
  assert.throws(
    () => parseSecurityProfileDeclaration('# Security Profile\n\n## Active profiles\n\n- `unknown`\n'),
    /Unknown security profile/
  );
  assert.throws(
    () => parseSecurityProfileDeclaration('# Security Profile\n\n## Active profiles\n\n- `web-api`\n- `web-api`\n'),
    /Duplicate security profile/
  );
  assert.throws(
    () => parseSecurityProfileDeclaration('# Security Profile\n\n## Active profiles\n\n- web api\n'),
    /Invalid security profile entry/
  );
  assert.throws(
    () => parseSecurityProfileDeclaration('# Security Profile\n\nNo active profile section.\n'),
    /must contain a "## Active profiles" section/
  );
  assert.throws(
    () => parseSecurityProfileDeclaration('# Security Profile\n\n## Active profiles\n\n- `web-api`\n\n## Active profiles\n\n- `multi-tenant`\n'),
    /exactly one "## Active profiles" section/
  );
});

test('security context includes baseline plus selected project-sensitive profiles and manifest identities', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\nAuthority: ACCEPTED\n\n## Active profiles\n\n- `web-api`\n- `multi-tenant`\n- `sensitive-data`\n- `stateful-data`\n',
    'utf8'
  );

  const result = await createContextPack({ targetDir: target, task: 'security-change', mode: 'security' });

  assert.deepEqual(result.securityProfiles, ['baseline', 'web-api', 'multi-tenant', 'sensitive-data', 'stateful-data']);
  assert.match(result.content, /## Active security profiles/);
  assert.match(result.content, /SECURITY-PROFILE: baseline/);
  assert.match(result.content, /SECURITY-PROFILE: web-api/);
  assert.match(result.content, /SECURITY-PROFILE: multi-tenant/);
  assert.match(result.content, /SECURITY-PROFILE: sensitive-data/);
  assert.match(result.content, /SECURITY-PROFILE: stateful-data/);
  assert.ok(result.files.includes('docs/security/SECURITY-PROFILE.md'));
  for (const name of result.securityProfiles) {
    assert.ok(result.files.includes(`docs/security/profiles/${name}.md`));
  }
});

test('missing profile declaration remains backward compatible and still applies baseline', async () => {
  const target = await project();
  await rm(path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')));

  const result = await createContextPack({ targetDir: target, task: 'security-change', mode: 'security' });

  assert.deepEqual(result.securityProfiles, ['baseline']);
  assert.match(result.content, /SECURITY-PROFILE: baseline/);
  assert.equal(result.files.includes('docs/security/SECURITY-PROFILE.md'), false);
});

test('packaged baseline fallback works when an older project lacks Stage 6 local assets', async () => {
  const target = await project();
  await rm(path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')));
  await rm(path.join(target, 'docs', 'security', 'profiles'), { recursive: true, force: true });

  const result = await createContextPack({ targetDir: target, task: 'security-change', mode: 'security' });

  assert.deepEqual(result.securityProfiles, ['baseline']);
  assert.ok(result.files.includes('vcp:docs/security/profiles/baseline.md'));
  assert.match(result.content, /SECURITY-PROFILE: baseline/);
});

test('security profiles are not auto-included outside security mode', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\n## Active profiles\n\n- `multi-tenant`\n',
    'utf8'
  );

  for (const mode of ['plan', 'implement', 'review', 'release']) {
    const result = await createContextPack({ targetDir: target, task: 'security-change', mode });
    assert.deepEqual(result.securityProfiles, []);
    assert.doesNotMatch(result.content, /## Active security profiles/);
    assert.doesNotMatch(result.content, /SECURITY-PROFILE: multi-tenant/);
  }
});

test('explicit invalid profile state fails security context instead of silently falling back', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\n## Active profiles\n\n- `not-a-profile`\n',
    'utf8'
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'security-change', mode: 'security' }),
    /Unknown security profile/
  );
});


test('lifecycle ownership preserves project selection and merge-manages canonical guidance', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-security-profile-ownership-'));
  const desired = await buildDesiredFiles({ targetDir: target, agent: 'generic', stack: 'generic', includeGitHub: false });

  assert.equal(desired.files.get('docs/security/SECURITY-PROFILE.md').policy, 'preserve');
  assert.equal(desired.files.get('docs/security/profiles/baseline.md').policy, 'merge');
  assert.equal(desired.files.get('docs/security/profiles/web-api.md').policy, 'merge');
});

test('reference SaaS selects all project-sensitive Stage 6 profiles explicitly', async () => {
  const content = await readFile(
    path.resolve('examples/reference-saas-invite/docs/security/SECURITY-PROFILE.md'),
    'utf8'
  );
  assert.deepEqual(
    parseSecurityProfileDeclaration(content),
    ['baseline', 'web-api', 'multi-tenant', 'sensitive-data', 'stateful-data']
  );
});


test('draft security profile declaration cannot govern security review', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\nAuthority: DRAFT\n\n## Active profiles\n\n- `web-api`\n',
    'utf8'
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'security-change', mode: 'security' }),
    /only plan context may use draft governing material/
  );
});

test('security profile document identity must match the selected profile', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\nAuthority: ACCEPTED\n\n## Active profiles\n\n- `web-api`\n',
    'utf8'
  );
  await writeFile(
    path.join(target, 'docs', 'security', 'profiles', 'web-api.md'),
    '# Wrong profile\n\nSECURITY-PROFILE: multi-tenant\n',
    'utf8'
  );

  await assert.rejects(
    createContextPack({ targetDir: target, task: 'security-change', mode: 'security' }),
    /must declare exactly "SECURITY-PROFILE: web-api"/
  );
});


test('reference SaaS security context dogfoods all Stage 6 profiles', async () => {
  const target = path.resolve('examples/reference-saas-invite');
  const result = await createContextPack({ targetDir: target, task: 'accept-invite', mode: 'security' });

  assert.deepEqual(
    result.securityProfiles,
    ['baseline', 'web-api', 'multi-tenant', 'sensitive-data', 'stateful-data']
  );
  assert.match(result.content, /SECURITY-PROFILE: baseline/);
  assert.match(result.content, /SECURITY-PROFILE: multi-tenant/);
  assert.match(result.content, /Do not claim legal\/regulatory compliance/);
  assert.ok(result.files.includes('docs/security/SECURITY-PROFILE.md'));
});


test('doctor exposes active profiles and baseline fallback without warning old projects', async () => {
  const target = await project();
  await rm(path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')));

  const report = await runDoctor(target);
  const security = report.checks.find((item) => item.id === 'security-profiles');

  assert.deepEqual(report.securityProfiles, ['baseline']);
  assert.equal(security.status, 'pass');
  assert.match(security.detail, /packaged baseline fallback applies/);
});

test('doctor fails visibly for invalid explicit security profile state', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\nAuthority: ACCEPTED\n\n## Active profiles\n\n- `invalid-profile`\n',
    'utf8'
  );

  const report = await runDoctor(target);
  const security = report.checks.find((item) => item.id === 'security-profiles');

  assert.deepEqual(report.securityProfiles, []);
  assert.equal(security.status, 'fail');
  assert.match(security.detail, /Unknown security profile/);
});


test('invalid security declaration remains isolated from non-security context modes', async () => {
  const target = await project();
  await writeFile(
    path.join(target, ...SECURITY_PROFILE_CONFIG.split('/')),
    '# Security Profile\n\nAuthority: SUPERSEDED\n\n## Active profiles\n\n- `not-a-profile`\n',
    'utf8'
  );

  const result = await createContextPack({ targetDir: target, task: 'security-change', mode: 'plan' });
  assert.deepEqual(result.securityProfiles, []);
  assert.doesNotMatch(result.content, /Active security profiles/);
});


test('update planning adds Stage 6 assets to a simulated pre-Stage-6 project', async () => {
  const target = await project();
  const manifestPath = path.join(target, '.vcp', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  const newPaths = [
    'docs/SECURITY-PROFILES.md',
    'docs/security/SECURITY-PROFILE.md',
    'docs/security/profiles/baseline.md',
    'docs/security/profiles/web-api.md',
    'docs/security/profiles/multi-tenant.md',
    'docs/security/profiles/sensitive-data.md',
    'docs/security/profiles/stateful-data.md'
  ];

  for (const relative of newPaths) delete manifest.managedFiles[relative];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rm(path.join(target, 'docs', 'SECURITY-PROFILES.md'));
  await rm(path.join(target, 'docs', 'security', 'SECURITY-PROFILE.md'));
  await rm(path.join(target, 'docs', 'security', 'profiles'), { recursive: true, force: true });

  const plan = await planUpdate({ targetDir: target });
  for (const relative of newPaths) {
    const action = plan.actions.find((item) => item.path === relative);
    assert.equal(action?.type, 'ADD', `${relative} should be added by update planning`);
  }
});

test('update planning preserves project-owned security profile selection', async () => {
  const target = await project();
  const configPath = path.join(target, ...SECURITY_PROFILE_CONFIG.split('/'));
  await writeFile(
    configPath,
    '# Security Profile\n\nAuthority: ACCEPTED\n\n## Active profiles\n\n- `multi-tenant`\n',
    'utf8'
  );

  const plan = await planUpdate({ targetDir: target });
  const action = plan.actions.find((item) => item.path === SECURITY_PROFILE_CONFIG);

  assert.equal(action?.type, 'PRESERVE');
  assert.equal(plan.conflicts, 0);
});


test('canonical profiles retain the Stage 6 security coverage contract', async () => {
  const root = path.resolve('docs/security/profiles');
  const baseline = await readFile(path.join(root, 'baseline.md'), 'utf8');
  const web = await readFile(path.join(root, 'web-api.md'), 'utf8');
  const tenant = await readFile(path.join(root, 'multi-tenant.md'), 'utf8');
  const sensitive = await readFile(path.join(root, 'sensitive-data.md'), 'utf8');
  const stateful = await readFile(path.join(root, 'stateful-data.md'), 'utf8');

  assert.match(baseline, /trust boundaries/i);
  assert.match(baseline, /secrets\/credentials/i);
  assert.match(baseline, /replay/i);
  assert.match(baseline, /negative-path/i);

  assert.match(web, /authentication\/session/i);
  assert.match(web, /injection/i);
  assert.match(web, /SSRF/i);
  assert.match(web, /rate limiting/i);

  assert.match(tenant, /tenant\/resource ownership/i);
  assert.match(tenant, /cross-tenant isolation/i);
  assert.match(tenant, /authorization/i);

  assert.match(sensitive, /PII/i);
  assert.match(sensitive, /logging\/redaction/i);
  assert.match(sensitive, /retention\/deletion/i);

  assert.match(stateful, /migration\/backfill/i);
  assert.match(stateful, /rollback\/recovery/i);
  assert.match(stateful, /integrity/i);
  assert.match(stateful, /race conditions/i);
});
