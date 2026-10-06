import { access, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { COMMAND_KEYS } from './verification-commands.mjs';

export const STACK_CHOICES = ['auto', 'generic', 'javascript', 'typescript', 'python', 'go', 'react-native'];

async function exists(target, relative) {
  try {
    await access(path.join(target, relative));
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(target, relative) {
  try {
    return await readFile(path.join(target, relative), 'utf8');
  } catch {
    return '';
  }
}

async function isFile(target, relative) {
  try {
    return (await lstat(path.join(target, relative))).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(target, relative) {
  try {
    return (await lstat(path.join(target, relative))).isDirectory();
  } catch {
    return false;
  }
}

async function readNodePackage(target) {
  try {
    const parsed = JSON.parse(await readFile(path.join(target, 'package.json'), 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  const pkg = await readNodePackage(target);
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
  if (stack === 'generic' || stack === 'react-native') {
    // Stage 11 Slice 1 is detection/inspection only. Preserve generic AGENTS
    // content until the dedicated React Native guidance/verification slices.
    return { stack, changed: false, content: agentsContent };
  }

  const profile = stack === 'typescript'
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
  const agentsPath = path.join(target, 'AGENTS.md');
  const agents = await readFile(agentsPath, 'utf8');
  return applyStackProfileToContent(target, requestedStack, agents);
}
