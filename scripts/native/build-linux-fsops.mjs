// Phase N+1 — build the Linux native helper and write its trust
// manifest. The manifest binds the produced binary to the exact
// source it was compiled from; lib/native-helper-trust.mjs verifies
// both hashes at runtime before the provider trusts any helper
// receipt. Both the binary and the manifest are build artifacts
// (gitignored); a tree without them fails closed, exactly as a tree
// without the binary did before.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'vcp-linux-fsops.cpp');
const BIN = path.join(HERE, 'vcp-linux-fsops');
const MANIFEST = path.join(HERE, 'vcp-linux-fsops.manifest.json');

const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');

function compilerVersion() {
  try {
    const probe = spawnSync('c++', ['--version'], { encoding: 'utf8' });
    return probe.status === 0 ? probe.stdout.split('\n')[0].trim() : 'unknown';
  } catch { return 'unknown'; }
}

const built = spawnSync('c++', [
  '-std=c++17', '-Wall', '-Wextra', '-O2', '-o', BIN, SRC,
], { stdio: 'inherit' });
if (built.error || built.status !== 0) {
  console.error('native helper build failed: a C++ compiler is required.');
  console.error('Install one first (Debian/Ubuntu: sudo apt install g++), then re-run: npm run setup:native-helper');
  process.exit(built.status ?? 1);
}
const manifest = {
  artifact: 'vcp-linux-fsops',
  sourceFile: 'vcp-linux-fsops.cpp',
  sourceSha256: sha256(SRC),
  binarySha256: sha256(BIN),
  // Platform binding: the manifest records exactly what this binary is.
  // The runtime verifier refuses a manifest whose platform/arch do not
  // match the host, so a Windows (or other-arch) binary can never be
  // trusted as the Linux helper, and vice versa.
  platform: 'linux',
  arch: process.arch,
  compiler: compilerVersion(),
  builtAtUtc: new Date().toISOString(),
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o644 });
console.log('built', BIN);
console.log('manifest', MANIFEST, 'binarySha256', manifest.binarySha256);
