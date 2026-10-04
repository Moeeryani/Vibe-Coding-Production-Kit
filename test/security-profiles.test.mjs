import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { initProject } from '../lib/init.mjs';
import { buildDesiredFiles } from '../lib/template.mjs';
import { createTaskPack } from '../lib/task.mjs';
import { createContextPack } from '../lib/context.mjs';
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

test('security profile parser rejects unknown, duplicate, and malformed declarations', () => {
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
