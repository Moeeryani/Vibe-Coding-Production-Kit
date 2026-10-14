// Construction-only smoke gates for native Windows D-01 receipt CLIs.
// No ProgramData creation, account changes or old 0.9.3 execution.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

test('native token inspector runner requires a local SHA256-matching binary',async()=>{
  const source=await readFile('scripts/inspect-windows-d01-fixture.mjs','utf8');
  assert.match(source,/validateD01WindowsDisposableFixtureReceipt/);
  assert.match(source,/validateWindowsD01ReadOnlyReceipt/);
  assert.match(source,/E_D01_WINDOWS_INSPECT_BUILD_SHA_MISMATCH/);
  assert.match(source,/E_D01_WINDOWS_INSPECT_PRINCIPAL_OR_FILE_ID_MISMATCH/);
  assert.match(source,/observed\.rootIdentity!==fixture\.rootIdentity/);
  assert.match(source,/executed\.status!==3/);
  assert.match(source,/process\.exitCode=3/);
  assert.doesNotMatch(source,/SetNamedSecurityInfo|CreateDirectory|MoveFile/);
  if(process.platform!=='win32'){
    const result=spawnSync(process.execPath,
      ['scripts/inspect-windows-d01-fixture.mjs'],{
        shell:false,encoding:'utf8'
      });
    assert.equal(result.status,2);
    assert.match(result.stderr,/E_D01_WINDOWS_INSPECT_USAGE/);
  }
});

test('offline matrix reviewer requires 4 independent receipts and always NO-GO',async()=>{
  const src=await readFile('scripts/review-windows-d01-fixture.mjs','utf8');
  assert.match(src,/assessWindowsD01FixturePrincipalMatrix/);
  assert.match(src,/new Set\(hashes\)\.size!==1/);
  assert.match(src,/nativeEnvelope\(/);
  assert.match(src,/process\.exitCode=3/);
  assert.doesNotMatch(src,/spawnSync|execFileSync|writeFile|unlink|rename\(/);
  const result=spawnSync(process.execPath,
    ['scripts/review-windows-d01-fixture.mjs'],{
      shell:false,encoding:'utf8'
    });
  assert.equal(result.status,2);
  assert.match(result.stderr,/E_D01_WINDOWS_MATRIX_USAGE/);
});

test('fixture creation and native ACL reads are separate from default checks',async()=>{
  const pkg=JSON.parse(await readFile('package.json','utf8'));
  assert.equal(pkg.scripts['build:native-windows-d01-fixture'],
    'node scripts/build-windows-d01-fixture.mjs');
  assert.equal(pkg.scripts['inspect:d01-windows-fixture'],
    'node scripts/inspect-windows-d01-fixture.mjs');
  assert.equal(pkg.scripts['review:d01-windows-fixture'],
    'node scripts/review-windows-d01-fixture.mjs');
  assert.equal(pkg.scripts.validate.includes('inspect:d01-windows-fixture'),false);
  assert.equal(pkg.scripts.validate.includes('build:native-windows-d01-fixture'),false);
  assert.equal(pkg.files.includes('build/'),false);
});
