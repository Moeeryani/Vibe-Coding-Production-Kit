import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  architectureFitnessExitCode,
  formatArchitectureFitnessReport,
  runArchitectureFitness,
  validateArchitectureFitnessConfig
} from '../lib/architecture-fitness.mjs';

const repoRoot = path.resolve('.');
const referenceRoot = path.join(repoRoot, 'examples', 'reference-saas-invite');

async function copyReference() {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage8-reference-'));
  await cp(referenceRoot, target, { recursive: true });
  return target;
}

async function readConfig(root) {
  return JSON.parse(await readFile(path.join(root, 'docs', 'architecture', 'FITNESS.json'), 'utf8'));
}

async function writeConfig(root, config) {
  await writeFile(
    path.join(root, 'docs', 'architecture', 'FITNESS.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8'
  );
}

function codes(report) {
  return report.violations.map((item) => item.code);
}

test('reference SaaS passes explicit Stage 8 architecture fitness', async () => {
  const report = await runArchitectureFitness({ targetDir: referenceRoot });

  assert.equal(report.success, true);
  assert.equal(report.summary.violations, 0);
  assert.equal(report.summary.sourceFiles, 4);
  assert.equal(report.summary.modules, 3);
  assert.equal(report.summary.localImports, 2);
  assert.deepEqual(
    report.dependencies.map((item) => [item.from, item.to]),
    [['application', 'domain']]
  );
  assert.deepEqual(
    report.modules.find((item) => item.name === 'domain').publicEntries,
    ['src/domain/index.mjs']
  );
  assert.equal(report.contracts.find((item) => item.kind === 'adr').status, 'Accepted');
  assert.equal(architectureFitnessExitCode(report), 0);
  assert.match(formatArchitectureFitnessReport(report), /Architecture fitness: PASS/);
});

test('missing config fails instead of inferring architecture', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage8-no-config-'));
  await assert.rejects(
    runArchitectureFitness({ targetDir: target }),
    /does not infer architecture automatically/
  );
});

test('config validation rejects overlapping roots, unknown dependencies, and invalid public entries', async () => {
  const base = await readConfig(referenceRoot);

  const overlapping = structuredClone(base);
  overlapping.modules.push({
    name: 'nested-domain',
    owner: 'someone',
    roots: ['src/domain/nested'],
    mayImport: [],
    publicEntries: []
  });
  assert.throws(
    () => validateArchitectureFitnessConfig(overlapping),
    /must not overlap/
  );

  const unknownDependency = structuredClone(base);
  unknownDependency.modules[0].mayImport = ['unknown-module'];
  assert.throws(
    () => validateArchitectureFitnessConfig(unknownDependency),
    /unknown module/
  );

  const invalidPublic = structuredClone(base);
  invalidPublic.modules[0].publicEntries = ['src/application/invitation-service.mjs'];
  assert.throws(
    () => validateArchitectureFitnessConfig(invalidPublic),
    /outside that module's roots/
  );

  const overlappingSources = structuredClone(base);
  overlappingSources.sourceRoots = ['src', 'src/domain'];
  assert.throws(
    () => validateArchitectureFitnessConfig(overlappingSources),
    /sourceRoots must not overlap/
  );
});

test('unowned configured source file turns ownership lane red', async () => {
  const target = await copyReference();
  await mkdir(path.join(target, 'src', 'orphan'), { recursive: true });
  await writeFile(path.join(target, 'src', 'orphan', 'unowned.mjs'), 'export const orphan = true;\n', 'utf8');

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unowned-source-file'));
  assert.equal(architectureFitnessExitCode(report), 1);
});

test('forbidden dependency direction turns dependency lane red', async () => {
  const target = await copyReference();
  const config = await readConfig(target);
  config.modules.find((item) => item.name === 'application').mayImport = [];
  await writeConfig(target, config);

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('forbidden-dependency-direction'));
});

test('cross-module deep import bypassing public entrypoint turns public-contract lane red', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace("../domain/index.mjs", "../domain/invitation.mjs"),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('non-public-contract-import'));
  assert.equal(codes(report).includes('forbidden-dependency-direction'), false);
});

test('realized module cycle turns cycle lane red even when both directions are allowed', async () => {
  const target = await copyReference();
  const config = await readConfig(target);
  config.modules.find((item) => item.name === 'domain').mayImport = ['application'];
  await writeConfig(target, config);
  await writeFile(
    path.join(target, 'src', 'domain', 'index.mjs'),
    "export { InvitationService } from '../application/invitation-service.mjs';\nexport * from './invitation.mjs';\n",
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('module-dependency-cycle'));
  assert.equal(codes(report).includes('forbidden-dependency-direction'), false);
  assert.equal(codes(report).includes('non-public-contract-import'), false);
});

test('missing exact local import target fails visibly', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace("../domain/index.mjs", "../domain/missing.mjs"),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unresolved-local-import'));
});

test('local import outside configured source roots fails visibly', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(file, `import '../../outside.mjs';\n${content}`, 'utf8');

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('outside-source-root-import'));
});

test('non-literal dynamic dependency expressions are not silently treated as safe', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    `const selectedModule = '../domain/index.mjs';\nconst dynamicModule = import(selectedModule);\n${content}`,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unsupported-dynamic-import'));
});

test('architecture contract marker regression turns governing-contract lane red', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'ARCHITECTURE.md');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace('ARCHITECTURE-CONTRACT: invitation-layering-v1\n', ''),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('architecture-contract-regression'));
});

test('governing ADR must remain Accepted', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'adr', 'ADR-001-invite-token-storage.md');
  const content = await readFile(file, 'utf8');
  await writeFile(file, content.replace('## Status\nAccepted', '## Status\nProposed'), 'utf8');

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('adr-not-accepted'));
});

test('duplicate governing marker is a regression rather than an implicit pass', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'ARCHITECTURE.md');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    `${content}\nARCHITECTURE-CONTRACT: invitation-layering-v1\n`,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  const violation = report.violations.find((item) => item.code === 'architecture-contract-regression');
  assert.match(violation.message, /found 2/);
});


test('unsupported static import syntax fails instead of disappearing from analysis', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    `import type DomainContract = require('../domain/index.mjs');\n${content}`,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unsupported-static-import'));
});


test('missing declared module roots and public entries fail visibly', async () => {
  const missingRootTarget = await copyReference();
  let config = await readConfig(missingRootTarget);
  config.modules.find((item) => item.name === 'infrastructure').roots = ['src/missing-infrastructure'];
  config.modules.find((item) => item.name === 'infrastructure').publicEntries = [];
  await writeConfig(missingRootTarget, config);

  let report = await runArchitectureFitness({ targetDir: missingRootTarget });
  assert.equal(report.success, false);
  assert.ok(codes(report).includes('missing-module-root'));

  const missingEntryTarget = await copyReference();
  config = await readConfig(missingEntryTarget);
  config.modules.find((item) => item.name === 'domain').publicEntries = ['src/domain/public.mjs'];
  await writeConfig(missingEntryTarget, config);

  report = await runArchitectureFitness({ targetDir: missingEntryTarget });
  assert.equal(report.success, false);
  assert.ok(codes(report).includes('missing-public-entry'));
});

test('governing ADR must have exactly one status section', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'adr', 'ADR-001-invite-token-storage.md');
  const content = await readFile(file, 'utf8');
  await writeFile(file, `${content}\n## Status\nProposed\n`, 'utf8');

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  const violation = report.violations.find((item) => item.code === 'adr-not-accepted');
  assert.equal(violation.statusSectionCount, 2);
  assert.match(violation.message, /exactly one canonical status declaration/);
});


test('canonical VCP ADR metadata status format is accepted', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'adr', 'ADR-001-invite-token-storage.md');
  const content = await readFile(file, 'utf8');
  await writeFile(file, content.replace('## Status\nAccepted', '- Status: Accepted'), 'utf8');

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, true);
  assert.equal(report.contracts.find((item) => item.kind === 'adr').status, 'Accepted');
});


test('empty configured source roots cannot produce a vacuous green result', async () => {
  const target = await copyReference();
  const config = await readConfig(target);
  config.sourceRoots = ['empty-src'];
  config.modules = [
    {
      name: 'empty',
      owner: 'empty-owner',
      roots: ['empty-src/module'],
      mayImport: [],
      publicEntries: []
    }
  ];
  await mkdir(path.join(target, 'empty-src', 'module'), { recursive: true });
  await writeConfig(target, config);

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('no-analyzed-source-files'));
});


test('same-line second import cannot hide a forbidden dependency', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    `import '../domain/index.mjs'; import '../infrastructure/memory-invitation-repository.mjs';\n${content}`,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('forbidden-dependency-direction'));
});


test('dense cyclic module graph reports one bounded strongly connected component', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage8-dense-cycle-'));
  await mkdir(path.join(target, 'src'), { recursive: true });
  await mkdir(path.join(target, 'docs', 'architecture', 'adr'), { recursive: true });

  const moduleNames = ['a', 'b', 'c', 'd'];
  for (const name of moduleNames) {
    await mkdir(path.join(target, 'src', name), { recursive: true });
    const imports = moduleNames
      .filter((other) => other !== name)
      .map((other) => `import '../${other}/index.mjs';`)
      .join('\n');
    await writeFile(path.join(target, 'src', name, 'index.mjs'), `${imports}\nexport const ${name} = true;\n`, 'utf8');
  }

  await writeFile(
    path.join(target, 'docs', 'architecture', 'ARCHITECTURE.md'),
    '# Architecture\n\nARCHITECTURE-CONTRACT: dense-cycle-v1\n',
    'utf8'
  );
  await writeFile(
    path.join(target, 'docs', 'architecture', 'adr', 'ADR-001.md'),
    '# ADR\n\n- Status: Accepted\n\nADR-CONTRACT: dense-cycle-v1\n',
    'utf8'
  );

  await writeConfig(target, {
    schemaVersion: 1,
    analyzer: 'javascript-static-imports',
    sourceRoots: ['src'],
    extensions: ['.mjs'],
    modules: moduleNames.map((name) => ({
      name,
      owner: `${name}-owner`,
      roots: [`src/${name}`],
      mayImport: moduleNames.filter((other) => other !== name),
      publicEntries: [`src/${name}/index.mjs`]
    })),
    rules: {
      forbidCycles: true,
      requireOwnership: true,
      enforcePublicEntries: true
    },
    governingContracts: [
      {
        path: 'docs/architecture/ARCHITECTURE.md',
        kind: 'architecture',
        marker: 'ARCHITECTURE-CONTRACT: dense-cycle-v1'
      },
      {
        path: 'docs/architecture/adr/ADR-001.md',
        kind: 'adr',
        marker: 'ADR-CONTRACT: dense-cycle-v1'
      }
    ]
  });

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.deepEqual(report.cycles, [['a', 'b', 'c', 'd']]);
  assert.equal(report.violations.filter((item) => item.code === 'module-dependency-cycle').length, 1);
});


test('architecture source roots refuse symlinked path components', async () => {
  const target = await copyReference();
  const outside = await mkdtemp(path.join(os.tmpdir(), 'vcp-stage8-symlink-outside-'));
  await mkdir(path.join(outside, 'domain'), { recursive: true });
  await writeFile(path.join(outside, 'domain', 'index.mjs'), 'export const outside = true;\n', 'utf8');
  await symlink(outside, path.join(target, 'linked-src'), process.platform === 'win32' ? 'junction' : 'dir');

  const config = await readConfig(target);
  config.sourceRoots = ['linked-src'];
  config.modules = [{
    name: 'domain',
    owner: 'membership-domain',
    roots: ['linked-src/domain'],
    mayImport: [],
    publicEntries: ['linked-src/domain/index.mjs']
  }];
  await writeConfig(target, config);

  await assert.rejects(
    runArchitectureFitness({ targetDir: target }),
    /Refusing to follow symlink in managed path/
  );
});


test('compact static re-export syntax still contributes dependency edges and cycles', async () => {
  const target = await copyReference();
  const config = await readConfig(target);
  config.modules.find((item) => item.name === 'domain').mayImport = ['application'];
  await writeConfig(target, config);
  await writeFile(
    path.join(target, 'src', 'domain', 'index.mjs'),
    "export{InvitationService}from'../application/invitation-service.mjs';export*from'./invitation.mjs';\n",
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.deepEqual(report.cycles, [['application', 'domain']]);
  assert.ok(codes(report).includes('module-dependency-cycle'));
});


test('dependency lookalikes in comments strings and template raw text do not create false edges', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  const prefix = [
    "/*",
    "import '../infrastructure/memory-invitation-repository.mjs';",
    "*/",
    "const importNote = \"import('../infrastructure/memory-invitation-repository.mjs')\";",
    "const requireNote = 'require(\\'../infrastructure/memory-invitation-repository.mjs\\')';",
    "const templateNote = `import('../infrastructure/memory-invitation-repository.mjs')`;"
  ].join('\n');
  await writeFile(file, `${prefix}\n${content}`, 'utf8');

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, true);
  assert.deepEqual(report.dependencies.map((item) => [item.from, item.to]), [['application', 'domain']]);
});

test('dynamic import inside a template expression remains visible to the analyzer', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    "const templateDependency = `${import('../infrastructure/memory-invitation-repository.mjs')}`;\n" + content,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('forbidden-dependency-direction'));
});


test('comment trivia cannot hide non-literal dynamic dependency expressions', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    [
      "const selectedImport = '../domain/index.mjs';",
      "const selectedRequire = '../domain/index.mjs';",
      "const imported = import /* analyzer trivia */ (selectedImport);",
      "const required = require /* analyzer trivia */ (selectedRequire);",
      content
    ].join('\n'),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unsupported-dynamic-import'));
  assert.ok(codes(report).includes('unsupported-dynamic-require'));
});


test('import.meta usage is valid analyzer syntax and does not create dependency evidence', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'domain', 'invitation.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    `import.meta.url;\n${content}`,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, true);
  assert.equal(codes(report).includes('unsupported-static-import'), false);
  assert.deepEqual(report.dependencies.map((item) => [item.from, item.to]), [['application', 'domain']]);
});


test('architecture contract markers inside fenced examples do not satisfy governing contracts', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'ARCHITECTURE.md');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace(
      'ARCHITECTURE-CONTRACT: invitation-layering-v1',
      '```text\nARCHITECTURE-CONTRACT: invitation-layering-v1\n```'
    ),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  const violation = report.violations.find((item) => item.code === 'architecture-contract-regression');
  assert.equal(violation.marker, 'ARCHITECTURE-CONTRACT: invitation-layering-v1');
});

test('Accepted text inside a fenced ADR example does not create governing status authority', async () => {
  const target = await copyReference();
  const file = path.join(target, 'docs', 'architecture', 'adr', 'ADR-001-invite-token-storage.md');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace(
      '## Status\nAccepted',
      '```markdown\n- Status: Accepted\n```'
    ),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  const violation = report.violations.find((item) => item.code === 'adr-not-accepted');
  assert.equal(violation.statusSectionCount, 0);
});


test('regex-literal quote cannot mask a later forbidden dependency', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    "const quotePattern = /'/;\nimport '../infrastructure/memory-invitation-repository.mjs';\n" + content,
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unsupported-lexer-state'));
  assert.ok(codes(report).includes('forbidden-dependency-direction'));
});

test('escaped runtime-relative module specifier cannot bypass architecture boundaries', async () => {
  const target = await copyReference();
  const file = path.join(target, 'src', 'application', 'invitation-service.mjs');
  const content = await readFile(file, 'utf8');
  await writeFile(
    file,
    content.replace(
      "../domain/index.mjs",
      "\\u002e/../infrastructure/memory-invitation-repository.mjs"
    ),
    'utf8'
  );

  const report = await runArchitectureFitness({ targetDir: target });

  assert.equal(report.success, false);
  assert.ok(codes(report).includes('unsupported-local-import'));
  assert.equal(report.summary.externalImports, 0);
});
