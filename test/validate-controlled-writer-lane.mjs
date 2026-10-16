// Validates the controlled test lane's static safety properties.
// NON-MUTATING: performs no writer mutations, exercises no gate bypass.
// Exit 0 = all static checks pass. This does NOT approve the lane for use.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// 1. test/ excluded from the published artifact.
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
check('package files excludes test/', !(pkg.files || []).some((f) => f.startsWith('test/')));

// 2. No production entrypoint constructs a testCapability.
const cli = await readFile(path.join(root, 'lib', 'cli.mjs'), 'utf8');
check('cli.mjs has no testCapability', !cli.includes('testCapability'));
const init = await readFile(path.join(root, 'lib', 'init.mjs'), 'utf8');
check('init.mjs has no testCapability', !init.includes('testCapability'));

// 3. Production gate constant untouched.
const gate = await readFile(path.join(root, 'lib', 'managed-migration.mjs'), 'utf8');
check('gate still NO_GO', gate.includes("status:'NO_GO'") || gate.includes('status:"NO_GO"'));
check('writers still disabled', gate.includes('managedV2MutationAuthorized:false'));

// 4. D-01 still DEFERRED.
const d01 = JSON.parse(await readFile(path.join(root, 'docs', 'decisions', 'D-01.json'), 'utf8'));
check('D-01 DEFERRED', d01.status === 'DEFERRED');

// 5. lib/ has no STATIC import of test helpers (only guarded dynamic imports).
const { execSync } = await import('node:child_process');
let staticImports = '';
try {
  staticImports = execSync(
    `grep -rn "^import.*test/helpers" lib/ 2>/dev/null || true`,
    { cwd: root, encoding: 'utf8' }
  ).trim();
} catch {}
check('no static test-helper imports in lib/', staticImports === '', staticImports);

// 6. The three wired modules import the verifier only on the testCapability branch.
for (const f of ['lib/production-writer.mjs', 'lib/writer-rollback-v2.mjs', 'lib/writer-recovery.mjs']) {
  const text = await readFile(path.join(root, f), 'utf8');
  const idx = text.indexOf('controlled-writer-capability');
  const guardIdx = text.lastIndexOf('if(testCapability)', idx);
  check(`${f} guards verifier import`, idx > 0 && guardIdx > 0 && guardIdx < idx);
}

// 7. Fixture helper creates only under os.tmpdir().
const fixture = await readFile(path.join(root, 'test', 'helpers', 'controlled-writer-fixture.mjs'), 'utf8');
check('fixture pinned to tmpdir',
  fixture.includes('os.tmpdir()') && fixture.includes("FIXTURE_PREFIX = 'vcp-controlled-'"));

// 8. No ENABLE_WRITER-style env bypass anywhere.
let envBypass = '';
try {
  envBypass = execSync(
    `grep -rn "process.env.VCP_.*WRITER\\|process.env.ENABLE_WRITER" lib/ test/helpers/ 2>/dev/null || true`,
    { cwd: root, encoding: 'utf8' }
  ).trim();
} catch {}
check('no env-var writer bypass', envBypass === '', envBypass);

// 9. M-2: test-only validator must not ship in the npm artifact.
const validatorInPack = await (async () => {
  try {
    const out = execSync('npm pack --dry-run 2>&1', { cwd: root, encoding: 'utf8' });
    return out.split('\n').some((l) => l.includes('validate-controlled-writer-lane'));
  } catch { return true; }
})();
check('validator not in npm artifact', !validatorInPack);

console.log(failures === 0 ? '\nAll static lane checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
