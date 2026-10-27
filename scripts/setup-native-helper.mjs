// Batch E: deterministic fresh-checkout setup for the Linux native helper.
//
// A fresh clone has no helper binary or trust manifest (both are gitignored
// build artifacts), so anchored filesystem operations fail closed until the
// helper is built from the in-tree C++ source. This script is the one
// supported path: no Docker, no container images, no network downloads, no
// prebuilt binaries. It checks prerequisites, builds, and verifies.
//
//   npm run setup:native-helper            build + verify (default)
//   npm run setup:native-helper -- --check verify only, no build
//   npm run setup:native-helper -- --json  machine-readable output
//
// Exit 0: the helper is built (or already present and trusted) and verified.
// Exit 1: a prerequisite is missing, the build failed, or verification
// refused the helper. The message always says what to do next.
//
// Platform statements (see docs/NATIVE-HELPER.md):
//   - Linux x64/arm64: supported via this helper, built locally.
//   - Windows: NOT supported by this script. The Windows native helper is a
//     separate, D-01-gated candidate with its own build; a Linux binary
//     must never be presented as satisfying a Windows requirement.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUILD_SCRIPT = path.join(HERE, 'native', 'build-linux-fsops.mjs');
const HELPER = path.join(HERE, 'native', 'vcp-linux-fsops');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const JSON_OUT = args.has('--json');

function report(result) {
  if (JSON_OUT) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(result.message);
  else console.error(result.message);
  return result;
}

function fail(message, code = 'E_NATIVE_HELPER_SETUP') {
  const result = { ok: false, code, message };
  report(result);
  process.exitCode = 1;
  return result;
}

function compilerAvailable() {
  const probe = spawnSync('c++', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

async function main() {
  if (process.platform !== 'linux') {
    return fail(
      `Native helper setup supports Linux only (host platform: ${process.platform}). ` +
      'The Windows native helper is a separate D-01-gated candidate; see docs/NATIVE-HELPER.md. ' +
      'A Linux binary must never be presented as satisfying a Windows requirement.',
      'E_NATIVE_HELPER_PLATFORM',
    );
  }
  const { verifyNativeHelper } = await import('../lib/native-helper-trust.mjs');
  const verify = () => {
    try { return { trusted: true, identity: verifyNativeHelper(HELPER) }; }
    catch (error) { return { trusted: false, code: error?.code ?? 'E_NATIVE_HELPER_UNTRUSTED', message: error?.message ?? String(error) }; }
  };

  if (CHECK_ONLY) {
    const checked = verify();
    if (!checked.trusted) {
      return fail(`Native helper is not trusted: ${checked.message} (code ${checked.code}). Build it: npm run setup:native-helper`, checked.code);
    }
    return report({
      ok: true, mode: 'check', message: `Native helper trusted: ${checked.identity.sha256} (platform linux/${process.arch}, source ${checked.identity.sourceSha256}).`,
      identity: checked.identity,
    });
  }

  if (!compilerAvailable()) {
    return fail(
      'A C++ compiler is required to build the native helper and was not found on PATH. ' +
      'Install one first (Debian/Ubuntu: sudo apt install g++; Fedora: sudo dnf install gcc-c++; macOS is not supported by this script), then re-run: npm run setup:native-helper. ' +
      'No prebuilt binary will be downloaded.',
      'E_NATIVE_HELPER_COMPILER',
    );
  }

  const built = spawnSync(process.execPath, [BUILD_SCRIPT], { stdio: 'inherit' });
  if (built.error || built.status !== 0) {
    return fail('Native helper build failed. See the compiler output above, fix the prerequisite, and re-run: npm run setup:native-helper', 'E_NATIVE_HELPER_BUILD');
  }
  const checked = verify();
  if (!checked.trusted) {
    return fail(`Built helper failed verification: ${checked.message} (code ${checked.code}). Do not use it; report the build environment.`, checked.code);
  }
  return report({
    ok: true, mode: 'build', message: `Native helper built and trusted: ${checked.identity.sha256} (platform linux/${process.arch}, source ${checked.identity.sourceSha256}).`,
    identity: checked.identity,
  });
}

await main();
