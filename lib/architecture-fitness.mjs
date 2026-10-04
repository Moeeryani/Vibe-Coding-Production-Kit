import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { assertPathInsideRoot, normalizeManagedPath } from './template.mjs';

export const ARCHITECTURE_FITNESS_SCHEMA_VERSION = 1;
export const DEFAULT_ARCHITECTURE_FITNESS_CONFIG = 'docs/architecture/FITNESS.json';
export const ARCHITECTURE_FITNESS_ANALYZER = 'javascript-static-imports';

const supportedExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx']);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${label} must be a non-empty string.`);
  return value.trim();
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
}

function assertStringArray(value, label, { nonEmpty = false } = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (nonEmpty && value.length === 0) throw new Error(`${label} must not be empty.`);
  const result = value.map((item, index) => assertString(item, `${label}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${label} must not contain duplicates.`);
  return result;
}

function normalizeProjectPath(value, label) {
  try {
    return normalizeManagedPath(assertString(value, label));
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function insideRoot(relative, root) {
  return relative === root || relative.startsWith(`${root}/`);
}

function assertNoOverlappingRoots(modules) {
  const roots = [];
  for (const module of modules) {
    for (const root of module.roots) roots.push({ module: module.name, root });
  }
  for (let left = 0; left < roots.length; left += 1) {
    for (let right = left + 1; right < roots.length; right += 1) {
      const a = roots[left];
      const b = roots[right];
      if (insideRoot(a.root, b.root) || insideRoot(b.root, a.root)) {
        throw new Error(
          `Architecture module roots must not overlap: ${a.module}:${a.root} and ${b.module}:${b.root}.`
        );
      }
    }
  }
}

export function validateArchitectureFitnessConfig(input) {
  assertObject(input, 'Architecture fitness config');
  if (input.schemaVersion !== ARCHITECTURE_FITNESS_SCHEMA_VERSION) {
    throw new Error(`Unsupported architecture fitness schemaVersion: ${input.schemaVersion}`);
  }
  if (input.analyzer !== ARCHITECTURE_FITNESS_ANALYZER) {
    throw new Error(
      `Unsupported architecture fitness analyzer "${input.analyzer}". Expected "${ARCHITECTURE_FITNESS_ANALYZER}".`
    );
  }

  const sourceRoots = assertStringArray(input.sourceRoots, 'Architecture sourceRoots', { nonEmpty: true })
    .map((item, index) => normalizeProjectPath(item, `Architecture sourceRoots[${index}]`));
  const extensions = assertStringArray(input.extensions, 'Architecture extensions', { nonEmpty: true });
  for (const extension of extensions) {
    if (!supportedExtensions.has(extension)) {
      throw new Error(`Unsupported architecture source extension "${extension}".`);
    }
  }

  if (!Array.isArray(input.modules) || input.modules.length === 0) {
    throw new Error('Architecture modules must be a non-empty array.');
  }

  const names = new Set();
  const modules = input.modules.map((raw, index) => {
    assertObject(raw, `Architecture modules[${index}]`);
    const name = assertString(raw.name, `Architecture modules[${index}].name`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
      throw new Error(`Architecture module name "${name}" must use lowercase letters, digits, and hyphens.`);
    }
    if (names.has(name)) throw new Error(`Duplicate architecture module name "${name}".`);
    names.add(name);

    const owner = assertString(raw.owner, `Architecture module ${name} owner`);
    const roots = assertStringArray(raw.roots, `Architecture module ${name} roots`, { nonEmpty: true })
      .map((item, rootIndex) => normalizeProjectPath(item, `Architecture module ${name} roots[${rootIndex}]`));
    const mayImport = assertStringArray(raw.mayImport ?? [], `Architecture module ${name} mayImport`);
    if (mayImport.includes(name)) {
      throw new Error(`Architecture module ${name} must not list itself in mayImport; same-module imports are implicit.`);
    }
    const publicEntries = assertStringArray(raw.publicEntries ?? [], `Architecture module ${name} publicEntries`)
      .map((item, publicIndex) => normalizeProjectPath(item, `Architecture module ${name} publicEntries[${publicIndex}]`));

    for (const root of roots) {
      if (!sourceRoots.some((sourceRoot) => insideRoot(root, sourceRoot))) {
        throw new Error(`Architecture module ${name} root ${root} is outside configured sourceRoots.`);
      }
    }
    for (const entry of publicEntries) {
      if (!roots.some((root) => insideRoot(entry, root))) {
        throw new Error(`Architecture module ${name} public entry ${entry} is outside that module's roots.`);
      }
      if (!extensions.includes(path.posix.extname(entry))) {
        throw new Error(`Architecture module ${name} public entry ${entry} does not use a configured extension.`);
      }
    }
    return { name, owner, roots, mayImport, publicEntries };
  });

  for (const module of modules) {
    for (const dependency of module.mayImport) {
      if (!names.has(dependency)) {
        throw new Error(`Architecture module ${module.name} mayImport references unknown module "${dependency}".`);
      }
    }
  }
  assertNoOverlappingRoots(modules);

  const rules = input.rules ?? {};
  assertObject(rules, 'Architecture rules');
  const forbidCycles = rules.forbidCycles ?? true;
  const requireOwnership = rules.requireOwnership ?? true;
  const enforcePublicEntries = rules.enforcePublicEntries ?? true;
  assertBoolean(forbidCycles, 'Architecture rules.forbidCycles');
  assertBoolean(requireOwnership, 'Architecture rules.requireOwnership');
  assertBoolean(enforcePublicEntries, 'Architecture rules.enforcePublicEntries');

  if (!Array.isArray(input.governingContracts) || input.governingContracts.length === 0) {
    throw new Error('Architecture governingContracts must be a non-empty array.');
  }
  const governingContracts = input.governingContracts.map((raw, index) => {
    assertObject(raw, `Architecture governingContracts[${index}]`);
    const relative = normalizeProjectPath(raw.path, `Architecture governingContracts[${index}].path`);
    const marker = assertString(raw.marker, `Architecture governingContracts[${index}].marker`);
    const kind = assertString(raw.kind, `Architecture governingContracts[${index}].kind`);
    if (!['architecture', 'adr'].includes(kind)) {
      throw new Error(`Architecture governing contract kind must be architecture or adr: ${kind}`);
    }
    return { path: relative, marker, kind };
  });
  const contractPaths = governingContracts.map((item) => item.path);
  if (new Set(contractPaths).size !== contractPaths.length) {
    throw new Error('Architecture governingContracts must not repeat the same path.');
  }

  return {
    schemaVersion: ARCHITECTURE_FITNESS_SCHEMA_VERSION,
    analyzer: ARCHITECTURE_FITNESS_ANALYZER,
    sourceRoots,
    extensions,
    modules,
    rules: { forbidCycles, requireOwnership, enforcePublicEntries },
    governingContracts
  };
}

async function readConfig(root, relative) {
  const configPath = normalizeProjectPath(relative, 'Architecture fitness config path');
  let absolute;
  try {
    absolute = await assertPathInsideRoot(root, configPath, { allowMissing: false });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Architecture fitness config not found: ${configPath}. VCP does not infer architecture automatically.`
      );
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(absolute, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in architecture fitness config ${configPath}: ${error.message}`);
    throw error;
  }
  return { relative: configPath, config: validateArchitectureFitnessConfig(parsed) };
}

async function walkSourceFiles(root, sourceRoot, extensions) {
  const absoluteRoot = await assertPathInsideRoot(root, sourceRoot, { allowMissing: false });
  const info = await lstat(absoluteRoot);
  if (!info.isDirectory()) throw new Error(`Architecture source root is not a directory: ${sourceRoot}`);
  const files = [];

  async function walk(relative) {
    const absolute = await assertPathInsideRoot(root, relative, { allowMissing: false });
    const entries = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      const child = path.posix.join(relative, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Refusing symlink inside architecture source root: ${child}`);
      }
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && extensions.includes(path.posix.extname(child))) files.push(child);
    }
  }

  await walk(sourceRoot);
  return files;
}

function moduleForFile(config, relative) {
  return config.modules.filter((module) => module.roots.some((root) => insideRoot(relative, root)));
}

function addViolation(violations, code, message, details = {}) {
  violations.push({ code, message, ...details });
}

function extractImportSpecifiers(content) {
  const specifiers = [];
  const seen = new Set();
  const add = (specifier) => {
    if (!seen.has(specifier)) {
      seen.add(specifier);
      specifiers.push(specifier);
    }
  };

  const sideEffectImport = /^\s*import\s*['"]([^'"\n]+)['"]/gm;
  const importFrom = /^\s*import\s+(?:type\s+)?(?:(?:[A-Za-z_$][\w$]*\s*,\s*)?(?:\*\s+as\s+[A-Za-z_$][\w$]*|\{[\s\S]*?\})|[A-Za-z_$][\w$]*)\s+from\s+['"]([^'"\n]+)['"]/gm;
  const exportFrom = /^\s*export\s+(?:type\s+)?(?:\*\s*(?:as\s+[A-Za-z_$][\w$]*\s*)?|\{[\s\S]*?\})\s+from\s+['"]([^'"\n]+)['"]/gm;
  const dynamicLiteral = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  const requireLiteral = /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

  const sideEffectMatches = [...content.matchAll(sideEffectImport)];
  const importFromMatches = [...content.matchAll(importFrom)];
  const exportFromMatches = [...content.matchAll(exportFrom)];
  const dynamicMatches = [...content.matchAll(dynamicLiteral)];
  const requireMatches = [...content.matchAll(requireLiteral)];

  for (const matches of [sideEffectMatches, importFromMatches, exportFromMatches, dynamicMatches, requireMatches]) {
    for (const match of matches) add(match[1]);
  }

  const staticImportCount = [...content.matchAll(/^\s*import\b(?!\s*\()/gm)].length;
  const dynamicCount = [...content.matchAll(/\bimport\s*\(/g)].length;
  const requireCount = [...content.matchAll(/\brequire\s*\(/g)].length;

  return {
    specifiers,
    unsupportedStaticImports: Math.max(0, staticImportCount - sideEffectMatches.length - importFromMatches.length),
    unsupportedDynamicImports: Math.max(0, dynamicCount - dynamicMatches.length),
    unsupportedDynamicRequires: Math.max(0, requireCount - requireMatches.length)
  };
}

function resolveLocalImport(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  if (specifier.includes('?') || specifier.includes('#')) {
    return { error: 'Local imports with query/hash suffixes are outside the Stage 8 analyzer contract.' };
  }
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), specifier.replaceAll('\\', '/')));
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    return { error: 'Local import escapes the selected project root.' };
  }
  return { relative: normalized };
}

function cycleKey(cycle) {
  const body = cycle.slice(0, -1);
  const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)]);
  rotations.sort((a, b) => a.join('>').localeCompare(b.join('>')));
  return rotations[0].join('>');
}

function findModuleCycles(edges) {
  const adjacency = new Map();
  for (const { from, to } of edges) {
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    adjacency.get(from).add(to);
  }
  const cycles = new Map();

  function visit(start, current, pathStack, seenInPath) {
    for (const next of adjacency.get(current) ?? []) {
      if (next === start) {
        const cycle = [...pathStack, start];
        cycles.set(cycleKey(cycle), cycle);
        continue;
      }
      if (seenInPath.has(next)) continue;
      seenInPath.add(next);
      pathStack.push(next);
      visit(start, next, pathStack, seenInPath);
      pathStack.pop();
      seenInPath.delete(next);
    }
  }

  for (const start of adjacency.keys()) visit(start, start, [start], new Set([start]));
  return [...cycles.values()].sort((a, b) => a.join('>').localeCompare(b.join('>')));
}

function adrStatus(content) {
  const headingMatches = [...content.matchAll(/^##\s+Status\s*$/gim)];
  const metadataMatches = [...content.matchAll(/^\s*-\s*Status:\s*(.+?)\s*$/gim)];
  const count = headingMatches.length + metadataMatches.length;
  if (count !== 1) return { count, status: null };

  if (metadataMatches.length === 1) {
    return { count: 1, status: metadataMatches[0][1].trim() };
  }

  const match = headingMatches[0];
  const rest = content.slice(match.index + match[0].length);
  for (const line of rest.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (value.startsWith('#')) return { count: 1, status: null };
    return { count: 1, status: value };
  }
  return { count: 1, status: null };
}

async function evaluateGoverningContracts(root, config, violations) {
  const results = [];
  for (const contract of config.governingContracts) {
    let absolute;
    let content;
    try {
      absolute = await assertPathInsideRoot(root, contract.path, { allowMissing: false });
      content = await readFile(absolute, 'utf8');
    } catch (error) {
      addViolation(
        violations,
        'missing-governing-contract',
        `Governing ${contract.kind} contract is missing or unreadable: ${contract.path}`,
        { path: contract.path, kind: contract.kind }
      );
      results.push({ ...contract, status: 'missing' });
      continue;
    }

    const markerCount = content.split(/\r?\n/).filter((line) => line.trim() === contract.marker).length;
    if (markerCount !== 1) {
      addViolation(
        violations,
        'architecture-contract-regression',
        `Expected exactly one marker "${contract.marker}" in ${contract.path}; found ${markerCount}.`,
        { path: contract.path, kind: contract.kind, marker: contract.marker }
      );
    }

    let status = 'present';
    if (contract.kind === 'adr') {
      const parsed = adrStatus(content);
      status = parsed.status ?? 'missing-status';
      if (parsed.count !== 1 || parsed.status?.toLowerCase() !== 'accepted') {
        addViolation(
          violations,
          'adr-not-accepted',
          parsed.count !== 1
            ? `Governing ADR must contain exactly one ## Status section: ${contract.path} (found ${parsed.count}).`
            : `Governing ADR must be Accepted: ${contract.path} (found ${parsed.status ?? 'no status'}).`,
          { path: contract.path, kind: contract.kind, adrStatus: parsed.status, statusSectionCount: parsed.count }
        );
      }
    }
    results.push({ ...contract, markerCount, status });
  }
  return results;
}

export async function runArchitectureFitness({
  targetDir,
  configPath = DEFAULT_ARCHITECTURE_FITNESS_CONFIG
}) {
  const root = path.resolve(targetDir);
  const loaded = await readConfig(root, configPath);
  const config = loaded.config;
  const violations = [];

  const allFiles = [];
  for (const sourceRoot of config.sourceRoots) {
    allFiles.push(...await walkSourceFiles(root, sourceRoot, config.extensions));
  }
  const files = [...new Set(allFiles)].sort();
  const fileSet = new Set(files);

  for (const module of config.modules) {
    for (const moduleRoot of module.roots) {
      try {
        const absoluteModuleRoot = await assertPathInsideRoot(root, moduleRoot, { allowMissing: false });
        const info = await lstat(absoluteModuleRoot);
        if (!info.isDirectory()) {
          addViolation(
            violations,
            'missing-module-root',
            `Declared module root is not a directory: ${module.name} -> ${moduleRoot}`,
            { module: module.name, root: moduleRoot }
          );
        }
      } catch (error) {
        if (error?.code === 'ENOENT') {
          addViolation(
            violations,
            'missing-module-root',
            `Declared module root does not exist: ${module.name} -> ${moduleRoot}`,
            { module: module.name, root: moduleRoot }
          );
        } else throw error;
      }
    }
    for (const publicEntry of module.publicEntries) {
      if (!fileSet.has(publicEntry)) {
        addViolation(
          violations,
          'missing-public-entry',
          `Declared public entry does not exist in analyzed sources: ${module.name} -> ${publicEntry}`,
          { module: module.name, publicEntry }
        );
      }
    }
  }

  const ownership = [];
  const ownerByFile = new Map();
  for (const file of files) {
    const owners = moduleForFile(config, file);
    if (owners.length === 1) {
      ownerByFile.set(file, owners[0]);
      ownership.push({ file, module: owners[0].name, owner: owners[0].owner });
    } else if (config.rules.requireOwnership) {
      addViolation(
        violations,
        owners.length === 0 ? 'unowned-source-file' : 'ambiguous-source-ownership',
        owners.length === 0
          ? `Analyzed source file has no declared module owner: ${file}`
          : `Analyzed source file belongs to multiple modules: ${file}`,
        { file, modules: owners.map((item) => item.name) }
      );
    }
  }

  const edgeImports = new Map();
  let externalImportCount = 0;
  let localImportCount = 0;

  for (const file of files) {
    const sourceModule = ownerByFile.get(file);
    if (!sourceModule) continue;
    const absolute = await assertPathInsideRoot(root, file, { allowMissing: false });
    const content = await readFile(absolute, 'utf8');
    const extracted = extractImportSpecifiers(content);

    for (let index = 0; index < extracted.unsupportedStaticImports; index += 1) {
      addViolation(
        violations,
        'unsupported-static-import',
        `Static import syntax cannot be proven safe by the Stage 8 analyzer: ${file}`,
        { file, module: sourceModule.name }
      );
    }
    for (let index = 0; index < extracted.unsupportedDynamicImports; index += 1) {
      addViolation(
        violations,
        'unsupported-dynamic-import',
        `Non-literal dynamic import cannot be proven safe by the Stage 8 analyzer: ${file}`,
        { file, module: sourceModule.name }
      );
    }
    for (let index = 0; index < extracted.unsupportedDynamicRequires; index += 1) {
      addViolation(
        violations,
        'unsupported-dynamic-require',
        `Non-literal dynamic require cannot be proven safe by the Stage 8 analyzer: ${file}`,
        { file, module: sourceModule.name }
      );
    }

    for (const specifier of extracted.specifiers) {
      const resolved = resolveLocalImport(file, specifier);
      if (!resolved) {
        externalImportCount += 1;
        continue;
      }
      localImportCount += 1;
      if (resolved.error) {
        addViolation(
          violations,
          'unsupported-local-import',
          `${resolved.error} Source: ${file}; import: ${specifier}`,
          { file, module: sourceModule.name, specifier }
        );
        continue;
      }

      const target = resolved.relative;
      const targetExtension = path.posix.extname(target);
      if (!config.extensions.includes(targetExtension)) {
        addViolation(
          violations,
          'unsupported-local-import',
          `Local import does not resolve to a configured source extension: ${file} -> ${specifier}`,
          { file, module: sourceModule.name, specifier, target }
        );
        continue;
      }
      if (!config.sourceRoots.some((sourceRoot) => insideRoot(target, sourceRoot))) {
        addViolation(
          violations,
          'outside-source-root-import',
          `Local import leaves configured architecture source roots: ${file} -> ${target}`,
          { file, module: sourceModule.name, specifier, target }
        );
        continue;
      }
      if (!fileSet.has(target)) {
        addViolation(
          violations,
          'unresolved-local-import',
          `Local import target does not exist in analyzed sources: ${file} -> ${target}`,
          { file, module: sourceModule.name, specifier, target }
        );
        continue;
      }

      const targetModule = ownerByFile.get(target);
      if (!targetModule) continue;
      if (targetModule.name === sourceModule.name) continue;

      const edgeKey = `${sourceModule.name}->${targetModule.name}`;
      if (!edgeImports.has(edgeKey)) edgeImports.set(edgeKey, { from: sourceModule.name, to: targetModule.name, imports: [] });
      edgeImports.get(edgeKey).imports.push({ file, specifier, target });

      if (!sourceModule.mayImport.includes(targetModule.name)) {
        addViolation(
          violations,
          'forbidden-dependency-direction',
          `Module ${sourceModule.name} may not import ${targetModule.name}: ${file} -> ${target}`,
          { file, sourceModule: sourceModule.name, targetModule: targetModule.name, specifier, target }
        );
      }
      if (config.rules.enforcePublicEntries && !targetModule.publicEntries.includes(target)) {
        addViolation(
          violations,
          'non-public-contract-import',
          `Cross-module import bypasses ${targetModule.name} public contract: ${file} -> ${target}`,
          {
            file,
            sourceModule: sourceModule.name,
            targetModule: targetModule.name,
            specifier,
            target,
            allowedPublicEntries: targetModule.publicEntries
          }
        );
      }
    }
  }

  const dependencies = [...edgeImports.values()]
    .map((edge) => ({ ...edge, imports: edge.imports.sort((a, b) => a.file.localeCompare(b.file) || a.target.localeCompare(b.target)) }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const cycles = findModuleCycles(dependencies);
  if (config.rules.forbidCycles) {
    for (const cycle of cycles) {
      addViolation(
        violations,
        'module-dependency-cycle',
        `Module dependency cycle detected: ${cycle.join(' -> ')}`,
        { cycle }
      );
    }
  }

  const contracts = await evaluateGoverningContracts(root, config, violations);

  const modules = config.modules.map((module) => ({
    name: module.name,
    owner: module.owner,
    roots: module.roots,
    publicEntries: module.publicEntries,
    mayImport: module.mayImport,
    files: ownership.filter((item) => item.module === module.name).map((item) => item.file)
  }));

  violations.sort((a, b) => (
    a.code.localeCompare(b.code)
    || String(a.file ?? a.path ?? '').localeCompare(String(b.file ?? b.path ?? ''))
    || a.message.localeCompare(b.message)
  ));

  return {
    schemaVersion: ARCHITECTURE_FITNESS_SCHEMA_VERSION,
    analyzer: ARCHITECTURE_FITNESS_ANALYZER,
    configPath: loaded.relative,
    success: violations.length === 0,
    scope: {
      sourceRoots: config.sourceRoots,
      extensions: config.extensions
    },
    rules: config.rules,
    modules,
    ownership,
    dependencies,
    cycles,
    contracts,
    violations,
    summary: {
      sourceFiles: files.length,
      modules: modules.length,
      moduleDependencies: dependencies.length,
      localImports: localImportCount,
      externalImports: externalImportCount,
      governingContracts: contracts.length,
      violations: violations.length
    }
  };
}

export function architectureFitnessExitCode(report) {
  return report.success ? 0 : 1;
}

export function formatArchitectureFitnessReport(report) {
  const lines = [
    `Architecture fitness: ${report.success ? 'PASS' : 'FAIL'}`,
    `Analyzer: ${report.analyzer}`,
    `Config: ${report.configPath}`,
    `Scope: ${report.scope.sourceRoots.join(', ')} [${report.scope.extensions.join(', ')}]`,
    `Source files: ${report.summary.sourceFiles}; modules: ${report.summary.modules}; module dependencies: ${report.summary.moduleDependencies}`,
    `Imports: ${report.summary.localImports} local / ${report.summary.externalImports} external; governing contracts: ${report.summary.governingContracts}`
  ];

  for (const module of report.modules) {
    lines.push(
      `- ${module.name} — owner ${module.owner} — ${module.files.length} file(s) — public: ${module.publicEntries.length ? module.publicEntries.join(', ') : 'none'}`
    );
  }
  for (const dependency of report.dependencies) {
    lines.push(`  dependency ${dependency.from} -> ${dependency.to} (${dependency.imports.length} import(s))`);
  }
  if (report.violations.length > 0) {
    lines.push('Violations:');
    for (const violation of report.violations) lines.push(`  - [${violation.code}] ${violation.message}`);
  }
  lines.push(`Summary: ${report.summary.violations} violation(s).`);
  return lines.join('\n');
}
