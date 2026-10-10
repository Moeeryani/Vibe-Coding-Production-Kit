import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
// Historical setup is intentionally test-only: production init remains gated.
import { seedLegacyV1Fixture as initProject } from './helpers/legacy-v1-fixture.mjs';
import { doctorExitCode, formatDoctorReport, runDoctor } from '../lib/doctor.mjs';

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), 'vcp-doctor-coverage-'));
}

test('doctor strict can be green while explicitly reporting unassessed decision templates', async () => {
  const target = await tempDir();
  await writeFile(path.join(target, 'package.json'), JSON.stringify({
    type: 'module',
    scripts: {
      check: 'node --check src/index.mjs',
      test: 'node --test'
    }
  }));

  await initProject({ targetDir: target, agent: 'generic', stack: 'auto', includeGitHub: true });

  for (const relative of [
    'docs/product/PRODUCT-BRIEF.md',
    'docs/product/PRD.md',
    'docs/architecture/ARCHITECTURE.md',
    'docs/security/THREAT-MODEL.md',
    'docs/testing/TEST-STRATEGY.md'
  ]) {
    await writeFile(path.join(target, relative), `# Project-specific ${path.basename(relative)}\n\nAccepted for this test.\n`);
  }

  const report = await runDoctor(target);
  const formatted = formatDoctorReport(report);

  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.warn, 0);
  assert.equal(doctorExitCode(report, true), 0);
  assert.ok(report.coverage.unassessedDecisionPaths.includes('docs/product/USER-FLOWS.md'));
  assert.ok(report.coverage.unassessedDecisionPaths.includes('docs/architecture/DATA-MODEL.md'));
  assert.equal(report.coverage.starterTemplateMarkerPaths.length, 5);
  assert.equal(report.coverage.presenceOnlyCorePaths.length, 2);
  assert.match(formatted, /Coverage: starter-template markers are checked for 5\/7 core docs/);
  assert.match(formatted, /Not assessed for template completeness: .*USER-FLOWS\.md.*DATA-MODEL\.md/);
});
