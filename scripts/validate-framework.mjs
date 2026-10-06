import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'AGENTS.md',
  'docs/00-START-HERE.md',
  'docs/OPERATING-MODEL.md',
  'docs/CLI.md',
  'docs/PROMPT-EVALUATION.md',
  'docs/ARCHITECTURE-FITNESS.md',
  'docs/RELEASE-AUTOMATION.md',
  'docs/COMMUNITY-PLUGINS.md',
  'docs/MOBILE-PROFILES.md',
  'docs/DOCTOR.md',
  'docs/STACK-PROFILES.md',
  'docs/SECURITY-PROFILES.md',
  'docs/TASK-PACKS.md',
  'docs/TASK-READINESS.md',
  'docs/VERIFICATION-EVIDENCE.md',
  'docs/QUICKSTART.md',
  'docs/CONTEXT-PACKS.md',
  'docs/UPDATES.md',
  'docs/product/PRODUCT-BRIEF.md',
  'docs/product/PRD.md',
  'docs/product/USER-FLOWS.md',
  'docs/architecture/DOMAIN.md',
  'docs/architecture/ARCHITECTURE.md',
  'docs/architecture/DATA-MODEL.md',
  'docs/architecture/adr/ADR-TEMPLATE.md',
  'docs/security/THREAT-MODEL.md',
  'docs/security/SECURITY-PROFILE.md',
  'docs/security/profiles/baseline.md',
  'docs/security/profiles/web-api.md',
  'docs/security/profiles/multi-tenant.md',
  'docs/security/profiles/sensitive-data.md',
  'docs/security/profiles/stateful-data.md',
  'docs/testing/TEST-STRATEGY.md',
  'docs/delivery/DEFINITION-OF-READY.md',
  'docs/delivery/DEFINITION-OF-DONE.md',
  'docs/delivery/TASK-TEMPLATE.md',
  'docs/delivery/RELEASE-CHECKLIST.md',
  'prompts/01-discovery.md',
  'prompts/02-plan-task.md',
  'prompts/03-implement-task.md',
  'prompts/04-code-review.md',
  'prompts/05-security-review.md',
  'prompts/06-refactor.md',
  'prompts/07-release-review.md',
  'scripts/validate-framework.sh',
  'scripts/validate-framework.mjs'
];

const providerRuntimeRequiredFiles = [
  'evaluations/prompt-behavior/scenarios.json',
  'evaluations/prompt-behavior/mutations.json',
  'evaluations/prompt-behavior/reference-pass/discovery-boundaries.json',
  'evaluations/prompt-behavior/reference-pass/plan-vertical-blockers.json',
  'evaluations/prompt-behavior/reference-pass/verification-followup.json',
  'evaluations/prompt-behavior/reference-pass/review-restartability.json'
];

const providerReleaseRequiredFiles = [
  '.github/release-policy.json'
];

const providerPluginRequiredFiles = [
  'examples/community-profile-react-native/README.md',
  'examples/community-profile-react-native/package.json',
  'examples/community-profile-react-native/docs/plugins/PLUGINS.json',
  'examples/community-profile-react-native/community-plugins/react-native-readiness/plugin.json',
  'examples/community-profile-react-native/community-plugins/react-native-readiness/guidance/mobile-boundaries.md'
];

const providerMobileRequiredFiles = [
  'examples/mobile-react-native/README.md',
  'examples/mobile-react-native/package.json',
  'examples/mobile-react-native/app.json',
  'examples/mobile-react-native/tsconfig.json',
  'examples/mobile-react-native/src/app.js',
  'examples/mobile-react-native/scripts/format-check.mjs',
  'examples/mobile-react-native/scripts/typecheck.mjs',
  'examples/mobile-react-native/scripts/build.mjs',
  'examples/mobile-react-native/test/unit.test.mjs',
  'examples/mobile-react-native/test/integration.test.mjs',
  'examples/mobile-react-native/test/e2e.test.mjs'
];

const excludedDirs = new Set(['.git', 'node_modules', '.vcp']);
const secretPatterns = [
  /BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY/,
  /aws_secret_access_key\s*=/i,
  /ghp_[A-Za-z0-9]{30,}/,
  /sk-[A-Za-z0-9]{30,}/
];

async function existsNonEmpty(relative) {
  try {
    const info = await stat(path.join(root, relative));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function directoryExists(relative) {
  try {
    return (await stat(path.join(root, relative))).isDirectory();
  } catch {
    return false;
  }
}

async function* walk(current = root) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirs.has(entry.name)) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      yield* walk(absolute);
    } else if (entry.isFile()) {
      yield absolute;
    }
  }
}

async function scanForSecrets() {
  const findings = [];
  for await (const absolute of walk()) {
    if (path.basename(absolute) === 'validate-framework.mjs') continue;
    let info;
    try {
      info = await lstat(absolute);
    } catch {
      continue;
    }
    if (info.size > 2_000_000) continue;
    const buffer = await readFile(absolute);
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    if (secretPatterns.some((pattern) => pattern.test(text))) {
      findings.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return findings;
}

async function validateExecutableLineEndings() {
  const findings = [];
  for (const relativeDir of ['bin', 'scripts']) {
    if (!(await directoryExists(relativeDir))) continue;
    const dir = path.join(root, relativeDir);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const relative = `${relativeDir}/${entry.name}`;
      const buffer = await readFile(path.join(dir, entry.name));
      const firstLine = buffer.toString('utf8', 0, Math.min(buffer.length, 256)).split('\n', 1)[0];
      if (firstLine.startsWith('#!') && buffer.includes(13)) findings.push(relative);
    }
  }
  return findings;
}

let failed = false;
const providerRuntimePresent = await existsNonEmpty('lib/prompt-eval.mjs');
const providerReleasePresent = await existsNonEmpty('lib/release-check.mjs');
const providerPluginPresent = await existsNonEmpty('lib/community-plugins.mjs');
const providerMobilePresent = await existsNonEmpty('lib/stack-provenance.mjs');
const effectiveRequiredFiles = [
  ...requiredFiles,
  ...(providerRuntimePresent ? providerRuntimeRequiredFiles : []),
  ...(providerReleasePresent ? providerReleaseRequiredFiles : []),
  ...(providerPluginPresent ? providerPluginRequiredFiles : []),
  ...(providerMobilePresent ? providerMobileRequiredFiles : [])
];

for (const relative of effectiveRequiredFiles) {
  if (!(await existsNonEmpty(relative))) {
    console.error(`ERROR: required file missing or empty: ${relative}`);
    failed = true;
  }
}

const secretFindings = await scanForSecrets();
if (secretFindings.length > 0) {
  for (const relative of secretFindings) console.error(`ERROR: possible secret material detected: ${relative}`);
  failed = true;
}

const crlfExecutables = await validateExecutableLineEndings();
if (crlfExecutables.length > 0) {
  for (const relative of crlfExecutables) console.error(`ERROR: executable with shebang contains CR/CRLF line endings: ${relative}`);
  console.error('Use a fresh checkout with .gitattributes applied before packing or publishing.');
  failed = true;
}

if (failed) process.exit(1);
console.log('Framework validation passed.');
