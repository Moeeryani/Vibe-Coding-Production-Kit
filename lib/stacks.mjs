import { lstat } from 'node:fs/promises';
import { resolveProjectPath } from './safe-path.mjs';
import { readProjectBytes } from './safe-read.mjs';
import path from 'node:path';
import { COMMAND_KEYS } from './verification-commands.mjs';

export const STACK_CHOICES = ['auto', 'generic', 'javascript', 'typescript', 'python', 'go', 'react-native'];

// Every file-based stack signal is untrusted repository data. A linked
// marker, including an in-root symlink or Windows junction parent, is a
// refusal rather than "marker not present" or an outside-root read.
function missing(error) {
  return error?.code==='E_VCP_PATH'&&error.message.includes('MISSING_INPUT');
}
async function exists(target, relative) {
  try {
    await resolveProjectPath(target,relative,{purpose:'read-existing'});
    return true;
  } catch(error) {
    if(missing(error))return false;
    throw error;
  }
}
async function readIfExists(target, relative) {
  const bytes=await readProjectBytes(target,relative,{optional:true,maxBytes:256*1024});
  return bytes?.toString('utf8')??'';
}
async function isFile(target, relative) {
  return exists(target,relative);
}
async function isDirectory(target, relative) {
  // Probe an unused child without writing: the safe-path primitive examines
  // each existing ancestor and refuses symlink/junction traversal.
  const probe=await resolveProjectPath(target,relative+'/.__vcp_stack_probe__',{
    purpose:'write-new'
  });
  try {
    const dir=await lstat(path.dirname(probe));
    return dir.isDirectory()&&!dir.isSymbolicLink();
  }catch(error){
    if(error.code==='ENOENT')return false;
    throw error;
  }
}
async function readNodePackage(target, { requireRegularFile = false } = {}) {
  if(requireRegularFile && !(await isFile(target,'package.json')))return null;
  const bytes=await readProjectBytes(target,'package.json',{
    optional:true,maxBytes:256*1024
  });
  if(!bytes)return null;
  try {
    const parsed=JSON.parse(bytes.toString('utf8'));
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;
  }catch {return null;}
}

const REACT_NATIVE_APP_FILES = [
  'app.json',
  'app.config.js',
  'app.config.cjs',
  'app.config.mjs',
  'app.config.ts'
];

async function hasReactNativeApplicationMarker(target) {
  if (await isDirectory(target, 'android') || await isDirectory(target, 'ios')) return true;
  for (const relative of REACT_NATIVE_APP_FILES) {
    if (await isFile(target, relative)) return true;
  }
  return false;
}

async function isReactNativeApplication(target) {
  const pkg = await readNodePackage(target, { requireRegularFile: true });
  const runtime = pkg?.dependencies?.['react-native'];
  if (typeof runtime !== 'string' || runtime.trim().length === 0) return false;
  return hasReactNativeApplicationMarker(target);
}

export async function detectStack(target) {
  if (await exists(target, 'go.mod')) return 'go';
  if (
    await exists(target, 'pyproject.toml')
    || await exists(target, 'requirements.txt')
    || await exists(target, 'uv.lock')
  ) return 'python';
  if (await isReactNativeApplication(target)) return 'react-native';
  if (await exists(target, 'tsconfig.json')) return 'typescript';
  if (await exists(target, 'package.json')) return 'javascript';
  return 'generic';
}

function replaceCommands(agents, commands) {
  let updated = agents;
  for (const key of COMMAND_KEYS) {
    updated = updated.replace(
      new RegExp(`^${key}=.*$`, 'm'),
      `${key}=${commands[key] ?? '<define>'}`
    );
  }
  return updated;
}

async function nodePackageEvidence(target) {
  let packageManager = 'npm';
  let hasLock = await exists(target, 'package-lock.json');

  if (await exists(target, 'pnpm-lock.yaml')) {
    packageManager = 'pnpm';
    hasLock = true;
  } else if (await exists(target, 'yarn.lock')) {
    packageManager = 'yarn';
    hasLock = true;
  } else if (await exists(target, 'bun.lock') || await exists(target, 'bun.lockb')) {
    packageManager = 'bun';
    hasLock = true;
  }

  let scripts = {};
  const hasPackage = await exists(target, 'package.json');
  if (hasPackage) {
    const pkg = await readNodePackage(target);
    if (pkg?.scripts && typeof pkg.scripts === 'object' && !Array.isArray(pkg.scripts)) {
      scripts = pkg.scripts;
    }
  }

  const run = (name) => scripts[name] ? `${packageManager} run ${name}` : null;
  const install = packageManager === 'npm'
    ? (hasLock ? 'npm ci' : 'npm install')
    : packageManager === 'pnpm'
      ? 'pnpm install --frozen-lockfile'
      : packageManager === 'yarn'
        ? 'yarn install --immutable'
        : 'bun install --frozen-lockfile';

  return { packageManager, hasPackage, scripts, run, install };
}

function nodeLintCommand(run) {
  return run('lint') ?? (run('check') ? 'n/a' : '<define>');
}

const SENSITIVE_MOBILE_SCRIPT_PATTERNS = [
  /\b(?:npm|pnpm)\s+publish\b/i,
  /\byarn\s+npm\s+publish\b/i,
  /\b(?:fastlane|deliver|supply)\b/i,
  /\b(?:codesign|apksigner|jarsigner|productsign|signtool)\b/i,
  /\beas\s+(?:build|submit|update)\b/i,
  /\bexpo\s+(?:publish|submit|upload)\b/i,
  /\bxcodebuild\b[^\n]*(?:archive|-exportArchive)\b/i,
  /\b(?:gradle|gradlew)\b[^\n]*(?:publish|upload|assembleRelease|bundleRelease|sign)\b/i,
  /\b(?:firebase\s+appdistribution|aws\s+devicefarm|browserstack|saucelabs?|appcenter\s+(?:distribute|codepush))\b/i,
  /\b(?:deploy|publish|submit|upload|release|sign|signing)\b/i
];

export function isSensitiveMobileVerificationScript(script) {
  if (typeof script !== 'string') return false;
  return SENSITIVE_MOBILE_SCRIPT_PATTERNS.some((pattern) => pattern.test(script));
}

function mobileScriptCommand(evidence, names, missingValue, sensitiveValue = '<define or n/a>') {
  for (const name of names) {
    const raw = evidence.scripts[name];
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    if (isSensitiveMobileVerificationScript(raw)) return sensitiveValue;
    return `${evidence.packageManager} run ${name}`;
  }
  return missingValue;
}

async function reactNativeProfile(target) {
  const evidence = await nodePackageEvidence(target);
  const hasTypeScript = await isFile(target, 'tsconfig.json');
  const checkState = mobileScriptCommand(evidence, ['check'], '<define>', '<define>');

  return {
    commands: {
      INSTALL_COMMAND: evidence.hasPackage ? evidence.install : '<define>',
      FORMAT_CHECK_COMMAND: mobileScriptCommand(evidence, ['format:check'], 'n/a'),
      LINT_COMMAND: mobileScriptCommand(
        evidence,
        ['lint'],
        checkState === '<define>' ? '<define>' : 'n/a',
        '<define>'
      ),
      TYPECHECK_COMMAND: mobileScriptCommand(
        evidence,
        ['typecheck'],
        hasTypeScript ? '<define or n/a>' : 'n/a'
      ),
      CHECK_COMMAND: mobileScriptCommand(evidence, ['check'], 'n/a'),
      UNIT_TEST_COMMAND: mobileScriptCommand(evidence, ['test:unit', 'test'], '<define>', '<define>'),
      INTEGRATION_TEST_COMMAND: mobileScriptCommand(evidence, ['test:integration'], 'n/a'),
      BUILD_COMMAND: mobileScriptCommand(evidence, ['build'], '<define or n/a>'),
      E2E_COMMAND: mobileScriptCommand(evidence, ['test:e2e', 'e2e'], '<define or n/a>')
    },
    heading: 'React Native',
    rules: [
      'Keep shared/domain logic independent from platform and UI glue where practical.',
      'Isolate Android/iOS-specific behavior behind explicit interfaces and test both platform branches when a task changes them.',
      'Treat native-module/bridge boundaries, deep links, navigation input, and external runtime data as untrusted interfaces.',
      'Preserve Android/iOS parity intentionally; evidence from one platform does not prove the other platform is correct.',
      'Handle app lifecycle, offline/retry behavior, permission-denied paths, and interrupted flows when they are relevant to the task.',
      'Never commit signing keys, keystores, certificates, provisioning profiles, store credentials, private service files, or secret environment values.',
      'Do not run signing, store publication, deployment, device-farm, credential-bearing, or destructive native actions through general verification; they require a separate HUMAN DECISION at execution time.',
      'Treat repository scripts as command evidence only, not as authorization; potentially sensitive mobile scripts are intentionally left unresolved instead of being auto-imported.',
      'Keep verification evidence grounded in the selected project root and configured project scripts.'
    ]
  };
}

async function typescriptProfile(target) {
  const evidence = await nodePackageEvidence(target);
  const { hasPackage, run, install } = evidence;

  return {
    commands: {
      INSTALL_COMMAND: hasPackage ? install : '<define>',
      FORMAT_CHECK_COMMAND: run('format:check') ?? '<define>',
      LINT_COMMAND: nodeLintCommand(run),
      TYPECHECK_COMMAND: run('typecheck') ?? '<define>',
      CHECK_COMMAND: run('check') ?? 'n/a',
      UNIT_TEST_COMMAND: run('test:unit') ?? run('test') ?? '<define>',
      INTEGRATION_TEST_COMMAND: run('test:integration') ?? 'n/a',
      BUILD_COMMAND: run('build') ?? '<define>',
      E2E_COMMAND: run('test:e2e') ?? run('e2e') ?? 'n/a'
    },
    heading: 'TypeScript',
    rules: [
      'Keep TypeScript strict mode enabled; do not weaken compiler settings to make errors disappear.',
      'Avoid `any` and unchecked type assertions unless a boundary is explicitly justified.',
      'Validate external/runtime data instead of assuming compile-time types make it safe.',
      'Keep domain/application logic independent from UI and transport frameworks.',
      'Prefer explicit result/error types for expected failure paths.',
      'Keep public module contracts narrow and avoid deep imports across module boundaries.',
      'Add tests for async failure, retries, concurrency, and serialization boundaries where relevant.'
    ]
  };
}

async function javascriptProfile(target) {
  const evidence = await nodePackageEvidence(target);
  const { hasPackage, run, install } = evidence;

  return {
    commands: {
      INSTALL_COMMAND: hasPackage ? install : '<define>',
      FORMAT_CHECK_COMMAND: run('format:check') ?? 'n/a',
      LINT_COMMAND: nodeLintCommand(run),
      TYPECHECK_COMMAND: run('typecheck') ?? 'n/a',
      CHECK_COMMAND: run('check') ?? 'n/a',
      UNIT_TEST_COMMAND: run('test:unit') ?? run('test') ?? '<define>',
      INTEGRATION_TEST_COMMAND: run('test:integration') ?? 'n/a',
      BUILD_COMMAND: run('build') ?? 'n/a',
      E2E_COMMAND: run('test:e2e') ?? run('e2e') ?? 'n/a'
    },
    heading: 'JavaScript / Node.js',
    rules: [
      'Treat `package.json` scripts as repository evidence; do not invent commands that are not configured.',
      'Keep business rules separate from transport/framework glue where the repository structure supports it.',
      'Validate external/runtime input at trust boundaries rather than relying on JavaScript coercion.',
      'Prefer explicit module contracts and avoid hidden global or environment-dependent behavior.',
      'Preserve existing module format and runtime compatibility unless the task explicitly changes them.',
      'Add regression tests for changed behavior and meaningful negative paths.'
    ]
  };
}

async function pythonProfile(target) {
  const pyproject = await readIfExists(target, 'pyproject.toml');
  const hasRuff = /\[tool\.ruff/.test(pyproject) || /\bruff\b/i.test(pyproject);
  const hasMypy = /\[tool\.mypy/.test(pyproject) || /\bmypy\b/i.test(pyproject);
  const hasPytest = /\[tool\.pytest/.test(pyproject)
    || /\bpytest\b/i.test(pyproject)
    || await exists(target, 'pytest.ini');

  let install = '<define>';
  if (await exists(target, 'uv.lock')) install = 'uv sync --frozen';
  else if (await exists(target, 'poetry.lock')) install = 'poetry install --sync';
  else if (await exists(target, 'requirements.txt')) install = 'python -m pip install -r requirements.txt';

  return {
    commands: {
      INSTALL_COMMAND: install,
      FORMAT_CHECK_COMMAND: hasRuff ? 'ruff format --check .' : '<define>',
      LINT_COMMAND: hasRuff ? 'ruff check .' : '<define>',
      TYPECHECK_COMMAND: hasMypy ? 'mypy .' : '<define or n/a>',
      CHECK_COMMAND: 'n/a',
      UNIT_TEST_COMMAND: hasPytest ? 'python -m pytest' : '<define>',
      INTEGRATION_TEST_COMMAND: 'n/a',
      BUILD_COMMAND: 'n/a',
      E2E_COMMAND: 'n/a'
    },
    heading: 'Python',
    rules: [
      'Use type hints for public APIs and meaningful domain values; keep static analysis useful rather than decorative.',
      'Do not use bare `except`; catch expected exceptions and preserve causal context when wrapping.',
      'Use context managers for resources and make cleanup deterministic.',
      'Keep framework/database objects out of core domain rules where practical.',
      'Validate untrusted data at boundaries; do not treat type annotations as runtime validation.',
      'Keep dependency/configuration declarations centralized in `pyproject.toml` when the project uses it.',
      'Test failure paths, transactional behavior, async behavior, and serialization boundaries where relevant.'
    ]
  };
}

async function goProfile() {
  return {
    commands: {
      INSTALL_COMMAND: 'go mod download',
      FORMAT_CHECK_COMMAND: "test -z \"$(gofmt -l .)\"",
      LINT_COMMAND: 'go vet ./...',
      TYPECHECK_COMMAND: 'go test ./...',
      CHECK_COMMAND: 'n/a',
      UNIT_TEST_COMMAND: 'go test ./...',
      INTEGRATION_TEST_COMMAND: 'n/a',
      BUILD_COMMAND: 'go build ./...',
      E2E_COMMAND: 'n/a'
    },
    heading: 'Go',
    rules: [
      'Keep packages cohesive and dependency direction explicit; avoid utility packages that become dumping grounds.',
      'Handle every returned error intentionally; wrap with `%w` when callers need the cause.',
      'Pass `context.Context` through request/IO boundaries and honor cancellation.',
      'Prefer small interfaces defined by consumers instead of speculative broad abstractions.',
      'Avoid goroutine leaks; make ownership, shutdown, and channel lifecycles explicit.',
      'Protect shared mutable state and add race-sensitive tests where concurrency is introduced.',
      'Keep transport/storage details out of domain rules where practical.'
    ]
  };
}

function appendixFor(profile) {
  return `\n## 16. ${profile.heading} stack profile\n\n${profile.rules.map((rule) => `- ${rule}`).join('\n')}\n`;
}

export async function applyStackProfileToContent(target, requestedStack, agentsContent) {
  const stack = requestedStack === 'auto' ? await detectStack(target) : requestedStack;
  if (stack === 'generic') {
    return { stack, changed: false, content: agentsContent };
  }

  const profile = stack === 'react-native'
    ? await reactNativeProfile(target)
    : stack === 'typescript'
      ? await typescriptProfile(target)
      : stack === 'javascript'
        ? await javascriptProfile(target)
        : stack === 'python'
          ? await pythonProfile(target)
          : await goProfile();

  let agents = replaceCommands(agentsContent, profile.commands);
  const heading = `## 16. ${profile.heading} stack profile`;
  if (!agents.includes(heading)) {
    agents = `${agents.trimEnd()}\n${appendixFor(profile)}`;
  }

  return {
    stack,
    changed: agents !== agentsContent,
    content: agents
  };
}

export async function applyStackProfile(target, requestedStack) {
  const agents=await readProjectBytes(target,'AGENTS.md',{maxBytes:4*1024*1024});
  return applyStackProfileToContent(target,requestedStack,agents.toString('utf8'));
}
